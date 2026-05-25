const fs = require("fs");
const path = require("path");
const {
  applyMetaToProject,
  documentsForSave,
} = require("./project-meta");
const {
  enrichProjectWithGlobalEstimations,
  persistGlobalEstimationsFromProject,
} = require("./estimation-store");

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

function loadGlobalEstimations() {
  const db = readDb();
  return Promise.resolve(db.globalEstimations || []);
}

function saveGlobalEstimations(estimations) {
  const db = readDb();
  db.globalEstimations = estimations;
  writeDb(db);
  return Promise.resolve(estimations);
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
  const enriched = [];
  for (const p of list) {
    enriched.push(
      await enrichProjectWithGlobalEstimations(
        applyMetaToProject(p),
        loadGlobalEstimations,
        saveGlobalEstimations,
        listAllProjectsForBootstrap
      )
    );
  }
  return enriched;
}

async function getProject(id) {
  const p = readDb().projects.find((pr) => pr.id === id) || null;
  if (!p) return null;
  const withMeta = applyMetaToProject(p);
  return enrichProjectWithGlobalEstimations(
    withMeta,
    loadGlobalEstimations,
    saveGlobalEstimations,
    listAllProjectsForBootstrap
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
    loadGlobalEstimations,
    saveGlobalEstimations,
    listAllProjectsForBootstrap
  );
}

async function saveProject(project) {
  await persistGlobalEstimationsFromProject(
    project,
    loadGlobalEstimations,
    saveGlobalEstimations,
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
};
