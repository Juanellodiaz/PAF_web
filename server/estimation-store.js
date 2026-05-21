const {
  mergeEstimationRecords,
  collectEstimationsFromProject,
} = require("./global-estimations");
const { mergeEstimationsFromConcepts } = require("./project-meta");

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
  let global = await bootstrapGlobalEstimations(
    loadGlobal,
    saveGlobal,
    listAllProjectsForBootstrap
  );
  const fromProject = collectEstimationsFromProject(project);
  if (fromProject.length) {
    global = mergeEstimationRecords(global, fromProject);
    await saveGlobal(global);
  }
  global = mergeEstimationsFromConcepts(global, project.concepts || []);
  return { ...project, estimations: global };
}

async function persistGlobalEstimationsFromProject(project, loadGlobal, saveGlobal) {
  const incoming = project.estimations || [];
  if (!incoming.length) return;
  let global = await loadGlobal();
  global = mergeEstimationRecords(global, incoming);
  await saveGlobal(global);
}

module.exports = {
  bootstrapGlobalEstimations,
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
};
