const fs = require("fs");
const path = require("path");
const {
  applyMetaToProject,
  documentsForSave,
} = require("./project-meta");
const {
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
  bootstrapGlobalEstimations,
  attachGlobalEstimations,
} = require("./estimation-store");
const {
  normalizeSettings,
  sortProjectsByOrder,
} = require("./admin-settings");
const {
  parseGlobalEstimationStore,
  mergeDeletedEstimationIds,
} = require("./global-estimation-store");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function readDb() {
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function findUser(username, password) {
  const db = readDb();
  const user = db.users.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return null;
  const { password: _, ...safe } = user;
  return safe;
}

function getUserById(id) {
  const db = readDb();
  const user = db.users.find((u) => u.id === id);
  if (!user) return null;
  const { password: _, ...safe } = user;
  return safe;
}

function listUsers() {
  return readDb().users.map(({ password, ...u }) => u);
}

function readGlobalEstimationStoreSync() {
  return parseGlobalEstimationStore(readDb().globalEstimations);
}

function readGlobalEstimationStore() {
  return Promise.resolve(readGlobalEstimationStoreSync());
}

function readGlobalEstimationsRaw() {
  return readGlobalEstimationStore().then((store) => store.estimations);
}

function saveGlobalEstimationStore(estimations, deletedIds) {
  const prev = readGlobalEstimationStoreSync();
  const store = parseGlobalEstimationStore({
    v: 2,
    estimations: estimations !== undefined ? estimations : prev.estimations,
    deletedIds:
      deletedIds !== undefined
        ? mergeDeletedEstimationIds(prev.deletedIds, deletedIds)
        : prev.deletedIds,
  });
  const db = readDb();
  db.globalEstimations = {
    v: 2,
    estimations: store.estimations,
    deletedIds: store.deletedIds,
  };
  writeDb(db);
  return Promise.resolve(store);
}

function saveGlobalEstimations(estimations, deletedIds) {
  return saveGlobalEstimationStore(estimations, deletedIds).then(
    (store) => store.estimations
  );
}

async function loadGlobalEstimations() {
  const store = await bootstrapGlobalEstimations(
    readGlobalEstimationStore,
    saveGlobalEstimationStore,
    listAllProjectsForBootstrap,
    saveProjectStoredBody
  );
  return store.estimations;
}

function loadAdminSettings() {
  return Promise.resolve(normalizeSettings(readDb().adminSettings));
}

function saveAdminSettings(settings) {
  const db = readDb();
  db.adminSettings = normalizeSettings(settings);
  writeDb(db);
  return Promise.resolve(db.adminSettings);
}

function listAllProjectsForBootstrap() {
  return Promise.resolve(readDb().projects.map((p) => applyMetaToProject(p)));
}

async function listProjectsForUser(user) {
  const db = readDb();
  const list =
    user.role === "admin"
      ? db.projects
      : db.projects.filter((p) => p.clientId === user.id);
  const mapped = list.map((p) => applyMetaToProject(p));
  const { estimations: global, deletedIds } = await bootstrapGlobalEstimations(
    readGlobalEstimationStore,
    saveGlobalEstimationStore,
    listAllProjectsForBootstrap,
    saveProjectStoredBody
  );
  const enriched = attachGlobalEstimations(mapped, global, deletedIds);
  const settings = await loadAdminSettings();
  const order = settings.projectOrder.filter((id) =>
    enriched.some((p) => p.id === id)
  );
  return sortProjectsByOrder(enriched, order);
}

async function getProject(id) {
  const p = readDb().projects.find((pr) => pr.id === id) || null;
  if (!p) return null;
  const withMeta = applyMetaToProject(p);
  return enrichProjectWithGlobalEstimations(
    withMeta,
    readGlobalEstimationStore,
    saveGlobalEstimationStore,
    listAllProjectsForBootstrap,
    saveProjectStoredBody
  );
}

async function saveProjectStoredBody(project) {
  const stored = {
    ...project,
    estimations: [],
    documents: documentsForSave({ ...project, estimations: [] }),
  };
  const db = readDb();
  const idx = db.projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) db.projects[idx] = stored;
  else db.projects.push(stored);
  writeDb(db);
  const withMeta = applyMetaToProject(stored);
  return enrichProjectWithGlobalEstimations(
    withMeta,
    readGlobalEstimationStore,
    saveGlobalEstimationStore,
    listAllProjectsForBootstrap,
    saveProjectStoredBody
  );
}

async function saveProject(project) {
  await persistGlobalEstimationsFromProject(
    project,
    readGlobalEstimationStore,
    saveGlobalEstimationStore,
    listAllProjectsForBootstrap,
    saveProjectStoredBody
  );
  return saveProjectStoredBody(project);
}

function deleteProject(id) {
  const db = readDb();
  db.projects = db.projects.filter((p) => p.id !== id);
  writeDb(db);
}

module.exports = {
  findUser,
  getUserById,
  listUsers,
  listProjectsForUser,
  getProject,
  saveProject,
  deleteProject,
  loadGlobalEstimations,
  saveGlobalEstimations,
  loadAdminSettings,
  saveAdminSettings,
};
