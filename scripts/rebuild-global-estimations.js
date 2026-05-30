#!/usr/bin/env node
/**
 * Reconstruye estimaciones globales y re-enlaza avances huérfanos (sin estimationId).
 * Uso: node scripts/rebuild-global-estimations.js
 */
require("dotenv").config({ path: ".env" });

const db = require("../server/db");
const { applyMetaToProject } = require("../server/project-meta");
const { rebuildEstimationsFromOrphanAdvances } = require("../server/rebuild-estimations");

async function loadAllProjectsRaw() {
  if (db.useSupabase()) {
    const supa = require("../server/db-supabase");
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const { GLOBAL_PROJECT_ID } = require("../server/global-estimations");
    const { data, error } = await client
      .from("projects")
      .select("*, project_concepts(*), project_documents(*)")
      .neq("id", GLOBAL_PROJECT_ID);
    if (error) throw error;
    return (data || []).map((row) => {
      const project = {
        id: row.id,
        name: row.name,
        clientId: row.client_id,
        status: row.status,
        completionDate: row.completion_date,
        zone3dImage: row.zone3d_image,
        estimations: row.estimations || [],
        concepts: (row.project_concepts || []).map((c) => ({
          id: c.id,
          name: c.name,
          m2: Number(c.m2),
          unitPrice: Number(c.unit_price),
          totalPrice: Number(c.total_price),
          status: c.status,
          advances: [],
        })),
        documents: (row.project_documents || []).map((d) => ({
          id: d.id,
          type: d.type,
          title: d.title,
          content: d.content,
        })),
      };
      return applyMetaToProject(project);
    });
  }

  const fs = require("fs");
  const path = require("path");
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "db.json"), "utf8")
  );
  return (raw.projects || []).map((p) => applyMetaToProject(p));
}

async function saveProjectBody(project, global) {
  return db.saveProject({ ...project, estimations: global });
}

async function main() {
  const projects = await loadAllProjectsRaw();
  const global = await db.loadGlobalEstimations();
  const result = rebuildEstimationsFromOrphanAdvances(projects, global);

  console.log("Avances huérfanos:", result.orphanCount);
  console.log("Estimaciones creadas:", result.created.length);
  result.created.forEach((e) => console.log(" -", e.label, e.id, e.date));

  if (!result.changed) {
    console.log("Nada que reconstruir.");
    return;
  }

  await db.saveGlobalEstimations(result.global);
  console.log("Global guardado:", result.global.length, "estimaciones");

  let saved = 0;
  for (const before of projects) {
    const after = result.projects.find((p) => p.id === before.id);
    if (!after) continue;
    const beforeJson = JSON.stringify(before.concepts || []);
    const afterJson = JSON.stringify(after.concepts || []);
    if (beforeJson === afterJson) continue;
    await saveProjectBody(after, result.global);
    saved += 1;
    console.log("Proyecto actualizado:", after.name);
  }

  console.log(`Listo. ${saved} proyecto(s) con avances re-enlazados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
