const express = require("express");
const path = require("path");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");
const db = require("./server/db");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || "paf-dev-secret-change-in-production";

const sessions = new Map();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

function parseSession(req) {
  const token = req.cookies.paf_session;
  if (!token) return null;
  return sessions.get(token) || null;
}

function requireAuth(req, res, next) {
  const session = parseSession(req);
  if (!session) {
    return res.status(401).json({ error: "No autenticado" });
  }
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user);
  return token;
}

function projectPayload(project) {
  const completion = new Date(project.completionDate);
  const now = new Date();
  const msLeft = completion - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const conceptsTotal = project.concepts.reduce((s, c) => s + c.totalPrice, 0);
  const m2Total = project.concepts.reduce((s, c) => s + c.m2, 0);
  return {
    ...project,
    daysRemaining: daysLeft,
    conceptsTotal,
    m2Total,
  };
}

/* ─── Auth ─── */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }
  const user = db.findUser(username.trim(), password);
  if (!user) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }
  const token = createSession(user);
  res.cookie("paf_session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies.paf_session;
  if (token) sessions.delete(token);
  res.clearCookie("paf_session");
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = parseSession(req);
  if (!session) return res.status(401).json({ error: "No autenticado" });
  res.json({ user: session });
});

/* ─── Projects ─── */
app.get("/api/projects", requireAuth, (req, res) => {
  const projects = db.listProjectsForUser(req.user).map(projectPayload);
  res.json({ projects });
});

app.get("/api/projects/:id", requireAuth, (req, res) => {
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
  if (req.user.role !== "admin" && project.clientId !== req.user.id) {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  res.json({ project: projectPayload(project) });
});

app.post("/api/projects", requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const project = {
    id: body.id || `proj-${uuidv4().slice(0, 8)}`,
    name: body.name || "Nuevo proyecto",
    clientId: body.clientId || "",
    status: body.status || "pending",
    completionDate: body.completionDate || new Date().toISOString().slice(0, 10),
    zone3dImage: body.zone3dImage || "/assets/zone-3d-placeholder.svg",
    concepts: body.concepts || [],
    documents: body.documents || [],
  };
  db.saveProject(project);
  res.status(201).json({ project: projectPayload(project) });
});

app.put("/api/projects/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.getProject(req.params.id);
  if (!existing) return res.status(404).json({ error: "Proyecto no encontrado" });
  const body = req.body || {};
  const project = {
    ...existing,
    ...body,
    id: existing.id,
    concepts: body.concepts ?? existing.concepts,
    documents: body.documents ?? existing.documents,
  };
  db.saveProject(project);
  res.json({ project: projectPayload(project) });
});

app.delete("/api/projects/:id", requireAuth, requireAdmin, (req, res) => {
  const existing = db.getProject(req.params.id);
  if (!existing) return res.status(404).json({ error: "Proyecto no encontrado" });
  db.deleteProject(req.params.id);
  res.json({ ok: true });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  res.json({ users: db.listUsers().filter((u) => u.role === "client") });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PAF server → http://localhost:${PORT}`);
  });
}
