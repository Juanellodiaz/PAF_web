const express = require("express");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const db = require("./db");
const {
  signSession,
  parseSession,
  isProduction,
  cookieOptions,
} = require("./auth");

function newProjectId() {
  return `proj-${crypto.randomBytes(4).toString("hex")}`;
}

const app = express();

app.use(express.json());
app.use(cookieParser());

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

function projectPayload(project) {
  if (!project) throw new Error("Proyecto no encontrado");
  const concepts = project.concepts || [];
  const completion = new Date(project.completionDate);
  const now = new Date();
  const msLeft = completion - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const conceptsTotal = concepts.reduce((s, c) => s + c.totalPrice, 0);
  const m2Total = concepts.reduce((s, c) => s + c.m2, 0);
  return {
    ...project,
    concepts,
    documents: project.documents || [],
    daysRemaining: daysLeft,
    conceptsTotal,
    m2Total,
  };
}

function handleError(res, err) {
  console.error(err);
  const message =
    err?.message ||
    err?.details ||
    err?.hint ||
    "Error del servidor";
  res.status(500).json({ error: message });
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    }
    const user = await db.findUser(username.trim(), password);
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }
    const token = signSession(user);
    res.cookie("paf_session", token, cookieOptions(req));
    res.json({ user });
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("paf_session", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = parseSession(req);
  if (!session) return res.status(401).json({ error: "No autenticado" });
  res.json({ user: session });
});

app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const projects = (await db.listProjectsForUser(req.user)).map(projectPayload);
    res.json({ projects });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/projects/:id", requireAuth, async (req, res) => {
  try {
    const project = await db.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
    if (req.user.role !== "admin" && project.clientId !== req.user.id) {
      return res.status(403).json({ error: "Acceso denegado" });
    }
    res.json({ project: projectPayload(project) });
  } catch (err) {
    handleError(res, err);
  }
});

app.post("/api/projects", requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const project = {
      id: body.id || newProjectId(),
      name: body.name || "Nuevo proyecto",
      clientId: body.clientId || "",
      status: body.status || "pending",
      completionDate:
        body.completionDate || new Date().toISOString().slice(0, 10),
      zone3dImage: body.zone3dImage || "/assets/zone-3d-placeholder.svg",
      concepts: body.concepts || [],
      documents: body.documents || [],
    };
    const saved = await db.saveProject(project);
    res.status(201).json({ project: projectPayload(saved) });
  } catch (err) {
    handleError(res, err);
  }
});

app.put("/api/projects/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await db.getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: "Proyecto no encontrado" });
    const body = req.body || {};
    const project = {
      ...existing,
      ...body,
      id: existing.id,
      concepts: body.concepts ?? existing.concepts,
      documents: body.documents ?? existing.documents,
    };
    const saved = await db.saveProject(project);
    res.json({ project: projectPayload(saved) });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete("/api/projects/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const existing = await db.getProject(req.params.id);
    if (!existing) return res.status(404).json({ error: "Proyecto no encontrado" });
    await db.deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    useSupabase: db.useSupabase(),
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
});

app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = (await db.listUsers()).filter((u) => u.role === "client");
    res.json({ users });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = app;
