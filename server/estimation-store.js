const {
  mergeEstimationRecords,
  collectEstimationsFromProject,
  normalizeEstimation,
} = require("./global-estimations");

function scrubConceptsEstimationIds(concepts, removedIds) {
  const removed = new Set(removedIds);
  if (!removed.size) return { concepts: concepts || [], changed: false };
  let changed = false;
  const next = (concepts || []).map((c) => {
    const advances = (c.advances || []).map((a) => {
      if (a.estimationId && removed.has(a.estimationId)) {
        changed = true;
        return { ...a, estimationId: "" };
      }
      return a;
    });
    return { ...c, advances };
  });
  return { concepts: next, changed };
}

async function bootstrapGlobalEstimations(
  loadGlobal,
  saveGlobal,
  listAllProjectsForBootstrap
) {
  let global = await loadGlobal();
  if (!global.length && listAllProjectsForBootstrap) {
    const all = await listAllProjectsForBootstrap();
    for (const p of all) {
      const fromProject = collectEstimationsFromProject(p);
      if (fromProject.length) {
        global = mergeEstimationRecords(global, fromProject);
      }
    }
    if (global.length) await saveGlobal(global);
  }

  if (!listAllProjectsForBootstrap) return global;

  const all = await listAllProjectsForBootstrap();
  let repaired = false;
  for (const p of all) {
    for (const c of p.concepts || []) {
      for (const a of c.advances || []) {
        if (!a.estimationId) continue;
        if (global.some((e) => e.id === a.estimationId)) continue;
        global = mergeEstimationRecords(global, [
          {
            id: a.estimationId,
            label: "",
            date: a.date || new Date().toISOString().slice(0, 10),
            paid: false,
            paidAt: null,
            notes: "",
          },
        ]);
        repaired = true;
      }
    }
  }
  if (repaired) await saveGlobal(global);
  return global;
}

async function enrichProjectWithGlobalEstimations(
  project,
  loadGlobal,
  saveGlobal,
  listAllProjectsForBootstrap
) {
  const global = await bootstrapGlobalEstimations(
    loadGlobal,
    saveGlobal,
    listAllProjectsForBootstrap
  );
  return { ...project, estimations: global };
}

async function persistGlobalEstimationsFromProject(
  project,
  loadGlobal,
  saveGlobal,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const incoming = (project.estimations || []).map(normalizeEstimation);
  const previous = await loadGlobal();
  const deletedIds = new Set(
    (Array.isArray(project.deletedEstimationIds)
      ? project.deletedEstimationIds
      : []
    ).filter(Boolean)
  );

  const merged = mergeEstimationRecords(previous, incoming);
  const final = merged.filter((e) => !deletedIds.has(e.id));

  const finalIds = new Set(final.map((e) => e.id));
  const removedIds = previous
    .filter((e) => e?.id && !finalIds.has(e.id))
    .map((e) => e.id);

  await saveGlobal(final);

  if (!removedIds.length || !listAllProjectsForBootstrap || !saveProjectForScrub) {
    return;
  }

  const all = await listAllProjectsForBootstrap();
  for (const p of all) {
    if (p.id === project.id) continue;
    const { concepts, changed } = scrubConceptsEstimationIds(
      p.concepts,
      removedIds
    );
    if (!changed) continue;
    await saveProjectForScrub({
      ...p,
      concepts,
      estimations: final,
      documents: p.documents || [],
    });
  }
}

module.exports = {
  bootstrapGlobalEstimations,
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
  scrubConceptsEstimationIds,
};
