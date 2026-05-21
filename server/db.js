const fs = require("fs");
const path = require("path");

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

function listProjectsForUser(user) {
  const db = readDb();
  if (user.role === "admin") return db.projects;
  return db.projects.filter((p) => p.clientId === user.id);
}

function getProject(id) {
  return readDb().projects.find((p) => p.id === id) || null;
}

function saveProject(project) {
  const db = readDb();
  const idx = db.projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) db.projects[idx] = project;
  else db.projects.push(project);
  writeDb(db);
  return project;
}

function deleteProject(id) {
  const db = readDb();
  db.projects = db.projects.filter((p) => p.id !== id);
  writeDb(db);
}

module.exports = {
  readDb,
  writeDb,
  findUser,
  getUserById,
  listUsers,
  listProjectsForUser,
  getProject,
  saveProject,
  deleteProject,
};
