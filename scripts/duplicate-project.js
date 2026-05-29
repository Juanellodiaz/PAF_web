#!/usr/bin/env node
/**
 * Duplica un proyecto con conceptos, costos, documentos e indirectos.
 * Uso: node scripts/duplicate-project.js "Nombre origen" "Nombre destino"
 */
require("dotenv").config();
const crypto = require("crypto");
const db = require("../server/db");

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function cloneProject(source, { newName, projectId }) {
  const concepts = (source.concepts || []).map((c) => {
    const id = newId("c");
    const { collapsed: _c, ...rest } = c;
    return {
      ...rest,
      id,
      advances: (c.advances || []).map((a) => ({
        ...a,
        id: newId("adv"),
      })),
    };
  });

  const documents = (source.documents || [])
    .filter(
      (d) =>
        !String(d.id || "").startsWith("_paf_meta_") && d.title !== "_PAF_INTERNAL"
    )
    .map((d) => ({
      ...d,
      id: newId("d"),
    }));

  const indirectCosts = (source.indirectCosts || []).map((item) => ({
    ...item,
    id: newId("ind"),
  }));

  return {
    id: projectId || newId("proj"),
    name: newName,
    clientId: source.clientId || "",
    status: source.status || "en_aprobacion",
    completionDate: source.completionDate,
    zone3dImage: source.zone3dImage || "/assets/zone-3d-placeholder.svg",
    concepts,
    documents,
    estimations: source.estimations || [],
    indirectCosts,
  };
}

async function main() {
  const sourceName = process.argv[2];
  const targetName = process.argv[3];
  if (!sourceName || !targetName) {
    console.error(
      'Uso: node scripts/duplicate-project.js "Torre 6 - Departamento 7.1" "Torre 6 - Departamento 7.2"'
    );
    process.exit(1);
  }

  const admin = { role: "admin" };
  const projects = await db.listProjectsForUser(admin);
  const source = projects.find((p) => p.name === sourceName);
  if (!source) {
    console.error(`No se encontró el proyecto: ${sourceName}`);
    console.error("Proyectos:", projects.map((p) => p.name).join(", "));
    process.exit(1);
  }

  const existing = projects.find((p) => p.name === targetName);
  if (existing) {
    console.error(`Ya existe un proyecto llamado "${targetName}" (${existing.id})`);
    process.exit(1);
  }

  const full = await db.getProject(source.id);
  if (!full) {
    console.error("No se pudo cargar el proyecto origen.");
    process.exit(1);
  }

  const clone = cloneProject(full, { newName: targetName });
  const saved = await db.saveProject(clone);

  console.log("Proyecto duplicado:");
  console.log(`  Origen: ${full.name} (${full.id})`);
  console.log(`  Nuevo:  ${saved.name} (${saved.id})`);
  console.log(`  Conceptos: ${(saved.concepts || []).length}`);
  console.log(`  Indirectos: ${(saved.indirectCosts || []).length}`);
  console.log(`  Documentos: ${(saved.documents || []).length}`);
  const withCosts = (saved.concepts || []).filter(
    (c) => c.laborCost || c.materialCost
  ).length;
  console.log(`  Conceptos con costos MO/material: ${withCosts}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
