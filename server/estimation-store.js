const {
  mergeEstimationRecords,
  collectEstimationsFromProject,
  normalizeEstimation,
} = require("./global-estimations");
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
  return JSON.stringify(
    (estimations || []).map((e) => normalizeEstimation(e)).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  );
}

async function bootstrapGlobalEstimations(
  loadGlobal,
  saveGlobal,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const previous = await loadGlobal();
  let global = previous;

  if (!listAllProjectsForBootstrap) return global;

  const all = await listAllProjectsForBootstrap();
  for (const p of all) {
    global = mergeEstimationRecords(global, collectEstimationsFromProject(p));
  }

  if (hasOrphanAdvances(all)) {
    const result = rebuildEstimationsFromOrphanAdvances(all, global);
    global = result.global;
    if (result.changed) {
      await saveGlobal(global);
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
      return global;
    }
  }

  for (const p of all) {
    for (const c of p.concepts || []) {
      for (const a of c.advances || []) {
        if (!a.estimationId) continue;
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
    await saveGlobal(global);
  }
  return global;
}

function attachGlobalEstimations(projects, global) {
  return (projects || []).map((p) => ({ ...p, estimations: global }));
}

async function enrichProjectWithGlobalEstimations(
  project,
  loadGlobal,
  saveGlobal,
  listAllProjectsForBootstrap,
  saveProjectForScrub
) {
  const global = await bootstrapGlobalEstimations(
    loadGlobal,
    saveGlobal,
    listAllProjectsForBootstrap,
    saveProjectForScrub
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
  attachGlobalEstimations,
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
  scrubConceptsEstimationIds,
};
