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
  if (global.length || !listAllProjectsForBootstrap) return global;

  const all = await listAllProjectsForBootstrap();
  for (const p of all) {
    const fromProject = collectEstimationsFromProject(p);
    if (fromProject.length) {
      global = mergeEstimationRecords(global, fromProject);
    }
  }
  if (global.length) await saveGlobal(global);
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
  const incomingIds = new Set(incoming.map((e) => e.id));
  const removedIds = previous
    .filter((e) => e?.id && !incomingIds.has(e.id))
    .map((e) => e.id);

  await saveGlobal(incoming);

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
      estimations: incoming,
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
