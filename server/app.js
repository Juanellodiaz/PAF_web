const express = require("express");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const db = require("./db");
const {
  buildAllEstimationBreakdowns,
} = require("./global-estimations");
const { saveUploadedImage, MAX_BYTES } = require("./uploads");
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

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

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
  const progress = calcProjectProgress(concepts);
  return {
    ...project,
    concepts,
    documents: project.documents || [],
    estimations: project.estimations || [],
    daysRemaining: daysLeft,
    conceptsTotal,
    m2Total,
    progressPercent: progress.percent,
    progressDoneM2: progress.doneM2,
  };
}

function calcProjectProgress(concepts) {
  const list = concepts || [];
  const totalM2 = list.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const doneM2 = list.reduce((s, c) => {
    const adv = Array.isArray(c.advances) ? c.advances : [];
    return s + adv.reduce((a, v) => a + (Number(v.m2) || 0), 0);
  }, 0);
  const percent = totalM2
    ? Math.min(100, Math.round((doneM2 / totalM2) * 1000) / 10)
    : 0;
  return { totalM2, doneM2, percent };
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
      status: body.status || "en_aprobacion",
      completionDate:
        body.completionDate || new Date().toISOString().slice(0, 10),
      zone3dImage: body.zone3dImage || "/assets/zone-3d-placeholder.svg",
      concepts: body.concepts || [],
      documents: body.documents || [],
      estimations: body.estimations || [],
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
      estimations: body.estimations ?? existing.estimations,
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

app.post(
  "/api/upload",
  requireAuth,
  requireAdmin,
  imageUpload.single("file"),
  async (req, res) => {
    try {
      const url = await saveUploadedImage(req.file);
      res.json({ url });
    } catch (err) {
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "La imagen no puede superar 5 MB" });
      }
      handleError(res, err);
    }
  }
);

app.get("/api/estimations/breakdowns", requireAuth, async (req, res) => {
  try {
    const projects = await db.listProjectsForUser(req.user);
    const estimations = await db.loadGlobalEstimations();
    const breakdowns = buildAllEstimationBreakdowns(estimations, projects);
    res.json({ estimations, breakdowns, projects });
  } catch (err) {
    handleError(res, err);
  }
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
