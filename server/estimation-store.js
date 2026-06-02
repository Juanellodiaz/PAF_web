const {
  mergeEstimationRecords,
  collectEstimationsFromProject,
  normalizeEstimation,
} = require("./global-estimations");
const { mergeDeletedEstimationIds } = require("./global-estimation-store");
const {
  hasOrphanAdvances,
  rebuildEstimationsFromOrphanAdvances,
} = require("./rebuild-estimations");

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

function estimationsFingerprint(estimations) {
  const normalized = (estimations || [])
    .map((e) => normalizeEstimation(e))
    .filter((e) => e?.id);
  return JSON.stringify(
    normalized.sort((a, b) => a.id.localeCompare(b.id))
  );
}

async function bootstrapGlobalEstimations(
  loadStore,
  saveStore,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const { estimations: previous, deletedIds } = await loadStore();
  const deletedSet = new Set(deletedIds);
  let global = previous;

  if (!listAllProjectsForBootstrap) {
    return { estimations: global, deletedIds };
  }

  const all = await listAllProjectsForBootstrap();
  for (const p of all) {
    global = mergeEstimationRecords(global, collectEstimationsFromProject(p));
  }
  global = global.filter((e) => e?.id && !deletedSet.has(e.id));

  if (hasOrphanAdvances(all)) {
    const result = rebuildEstimationsFromOrphanAdvances(all, global);
    global = result.global.filter((e) => e?.id && !deletedSet.has(e.id));
    if (result.changed) {
      await saveStore(global, deletedIds);
      if (saveProjectForScrub) {
        for (const before of all) {
          const after = result.projects.find((proj) => proj.id === before.id);
          if (!after) continue;
          if (JSON.stringify(before.concepts) === JSON.stringify(after.concepts)) {
            continue;
          }
          await saveProjectForScrub({
            ...after,
            estimations: global,
            documents: after.documents || [],
          });
        }
      }
      return { estimations: global, deletedIds };
    }
  }

  for (const p of all) {
    for (const c of p.concepts || []) {
      for (const a of c.advances || []) {
        if (!a.estimationId) continue;
        if (deletedSet.has(a.estimationId)) continue;
        if (global.some((e) => e.id === a.estimationId)) continue;
        global = mergeEstimationRecords(global, [
          normalizeEstimation({
            id: a.estimationId,
            label: "",
            date: a.date || new Date().toISOString().slice(0, 10),
            paid: false,
            paidAt: null,
            notes: "",
          }),
        ]);
      }
    }
  }

  if (estimationsFingerprint(global) !== estimationsFingerprint(previous)) {
    await saveStore(global, deletedIds);
  }
  return { estimations: global, deletedIds };
}

function attachGlobalEstimations(projects, global, deletedEstimationIds = []) {
  return (projects || []).map((p) => ({
    ...p,
    estimations: global,
    deletedEstimationIds,
  }));
}

async function enrichProjectWithGlobalEstimations(
  project,
  loadStore,
  saveStore,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const { estimations: global, deletedIds } = await bootstrapGlobalEstimations(
    loadStore,
    saveStore,
    listAllProjectsForBootstrap,
    saveProjectForScrub
  );
  return {
    ...project,
    estimations: global,
    deletedEstimationIds: deletedIds,
  };
}

async function persistGlobalEstimationsFromProject(
  project,
  loadStore,
  saveStore,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const incoming = (project.estimations || [])
    .map(normalizeEstimation)
    .filter(Boolean);
  const { estimations: previous, deletedIds: prevDeleted } = await loadStore();
  const allDeleted = mergeDeletedEstimationIds(
    prevDeleted,
    project.deletedEstimationIds
  );
  const deletedSet = new Set(allDeleted);

  const merged = mergeEstimationRecords(previous, incoming, { incomingWins: true });
  const final = merged.filter((e) => e?.id && !deletedSet.has(e.id));

  const finalIds = new Set(final.map((e) => e.id));
  const removedFromGlobal = previous
    .filter((e) => e?.id && !finalIds.has(e.id))
    .map((e) => e.id);
  const scrubIds = [
    ...new Set([
      ...removedFromGlobal,
      ...(Array.isArray(project.deletedEstimationIds)
        ? project.deletedEstimationIds
        : []),
    ]),
  ];
  const nextDeleted = mergeDeletedEstimationIds(allDeleted, scrubIds);

  await saveStore(final, nextDeleted);

  if (!scrubIds.length || !listAllProjectsForBootstrap || !saveProjectForScrub) {
    return;
  }

  const all = await listAllProjectsForBootstrap();
  for (const p of all) {
    const { concepts, changed } = scrubConceptsEstimationIds(p.concepts, scrubIds);
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
  attachGlobalEstimations,
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
  scrubConceptsEstimationIds,
};
