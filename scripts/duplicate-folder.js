#!/usr/bin/env node
/**
 * Duplica una carpeta de proyectos (solo conceptos, sin avances/indirectos/documentos).
 * Renombra texto en los nombres de proyecto (ej. Torre 6 → Torre 5).
 *
 * Uso:
 *   node scripts/duplicate-folder.js --list
 *   node scripts/duplicate-folder.js --source "Torre 6" --dest "Torre 5" --replace "Torre 6:Torre 5"
 *   node scripts/duplicate-folder.js --source "Torre 6" --dest "Torre 5" --replace "Torre 6:Torre 5" --dry-run
 */
require("dotenv").config();
const db = require("../server/db");
const { newId } = require("../server/duplicate-project");
const {
  normalizeSettings,
  reconcileProjectLayout,
} = require("../server/admin-settings");

function parseArgs(argv) {
  const opts = {
    list: false,
    dryRun: false,
    source: "Torre 6",
    dest: "Torre 5",
    replaceFrom: "Torre 6",
    replaceTo: "Torre 5",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") opts.list = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--source") opts.source = argv[++i];
    else if (a === "--dest") opts.dest = argv[++i];
    else if (a === "--replace") {
      const [from, to] = (argv[++i] || "").split(":");
      if (from) opts.replaceFrom = from;
      if (to) opts.replaceTo = to;
    }
  }
  return opts;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameProjectName(name, from, to) {
  if (!from || !to) return name;
  return String(name).replace(new RegExp(escapeRegex(from), "gi"), to);
}

function findFolder(folders, name) {
  const needle = name.trim().toLowerCase();
  return folders.find((f) => f.name.trim().toLowerCase() === needle);
}

function uniqueProjectName(base, taken, folderLabel) {
  let candidate = base.trim();
  if (!taken.has(candidate.toLowerCase())) return candidate;
  const withFolder = `${candidate} - ${folderLabel}`;
  if (!taken.has(withFolder.toLowerCase())) return withFolder;
  let n = 2;
  while (taken.has(`${candidate} (${n})`.toLowerCase())) n += 1;
  return `${candidate} (${n})`;
}

function cloneProjectLean(source, newName) {
  const concepts = (source.concepts || []).map((c) => {
    const { collapsed: _c, advances: _a, ...rest } = c;
    return {
      ...rest,
      id: newId("c"),
      advances: [],
    };
  });

  return {
    id: newId("proj"),
    name: newName,
    clientId: source.clientId || "",
    status: source.status || "en_aprobacion",
    completionDate: source.completionDate,
    zone3dImage: source.zone3dImage || "/assets/zone-3d-placeholder.svg",
    concepts,
    documents: [],
    indirectCosts: [],
    estimations: [],
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const admin = { role: "admin" };

  const settings = normalizeSettings(await db.loadAdminSettings());
  const folders = settings.projectFolders || [];
  const allProjects = await db.listProjectsForUser(admin);
  const nameTaken = new Set(
    allProjects.map((p) => String(p.name || "").trim().toLowerCase())
  );

  if (opts.list) {
    console.log("Carpetas en admin:");
    for (const f of folders) {
      console.log(`  - "${f.name}" (${f.projectIds.length} proyectos)`);
    }
    return;
  }

  const sourceFolder = findFolder(folders, opts.source);
  if (!sourceFolder) {
    console.error(`No se encontró la carpeta origen: "${opts.source}"`);
    console.error('Usa --list para ver carpetas. Ej: --source "Torre 6"');
    process.exit(1);
  }

  if (findFolder(folders, opts.dest)) {
    console.error(`Ya existe la carpeta destino "${opts.dest}". Elige otro nombre.`);
    process.exit(1);
  }

  const sourceProjects = sourceFolder.projectIds
    .map((id) => allProjects.find((p) => p.id === id))
    .filter(Boolean);

  if (!sourceProjects.length) {
    console.error("La carpeta origen no tiene proyectos.");
    process.exit(1);
  }

  console.log(`Origen: "${sourceFolder.name}" (${sourceProjects.length} proyectos)`);
  console.log(`Destino: "${opts.dest}"`);
  console.log(`Renombrar: "${opts.replaceFrom}" → "${opts.replaceTo}"`);
  console.log(opts.dryRun ? "MODO dry-run (no guarda)" : "Guardando en Supabase…");
  console.log("");

  const newProjectIds = [];
  const plan = [];

  for (const summary of sourceProjects) {
    const full = await db.getProject(summary.id);
    if (!full) {
      console.warn(`  ⚠ No se cargó: ${summary.name} (${summary.id})`);
      continue;
    }

    const renamed = renameProjectName(
      full.name,
      opts.replaceFrom,
      opts.replaceTo
    );
    const newName = uniqueProjectName(renamed, nameTaken, opts.dest);
    nameTaken.add(newName.toLowerCase());

    const clone = cloneProjectLean(full, newName);
    const conceptCount = clone.concepts.length;
    plan.push({
      from: full.name,
      to: newName,
      concepts: conceptCount,
      id: clone.id,
      clone,
    });

    if (!opts.dryRun) {
      await db.saveProject(clone);
      newProjectIds.push(clone.id);
    }

    console.log(`  ✓ ${full.name}`);
    console.log(`    → ${newName} (${conceptCount} conceptos, 0 avances)`);
  }

  if (opts.dryRun) {
    console.log(`\nDry-run: se crearían ${plan.length} proyectos en carpeta "${opts.dest}".`);
    return;
  }

  const destFolder = {
    id: newId("folder"),
    name: opts.dest,
    collapsed: false,
    projectIds: newProjectIds,
  };

  const nextFolders = [...folders, destFolder];
  const allIds = [
    ...new Set([...settings.projectOrder, ...newProjectIds]),
  ];
  const layout = reconcileProjectLayout(nextFolders, settings.projectOrder, allIds);
  await db.saveAdminSettings(layout);

  console.log("");
  console.log("Listo.");
  console.log(`  Carpeta nueva: "${opts.dest}" (${newProjectIds.length} proyectos)`);
  console.log(`  IDs: ${newProjectIds.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
