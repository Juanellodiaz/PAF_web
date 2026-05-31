let clients = [];
let editingId = null;
let cachedProjects = [];
let cachedGlobalEstimations = [];
let quickPanelMode = "project";
let advanceProjectCache = null;
let projectOrder = [];
let projectSearchQuery = "";
let dragProjectId = null;
let adminBusyHideTimer = null;

const quickPanel = () => document.getElementById("admin-quick-panel");
const formBackdrop = () => document.getElementById("form-backdrop");

function newQuickId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isPastCompletionDate(dateIso) {
  const d = (dateIso || "").trim();
  return d && d < todayIso();
}

function statusForNewProject(dateIso, selectedStatus) {
  if (isPastCompletionDate(dateIso)) return "completado";
  return selectedStatus || "en_aprobacion";
}

function syncProjectFormCompletionUi() {
  const dateEl = document.getElementById("completionDate");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("completion-date-hint");
  if (!dateEl || !statusEl) return;

  dateEl.removeAttribute("min");

  const past = isPastCompletionDate(dateEl.value);
  if (past && !editingId) {
    statusEl.value = "completado";
    statusEl.disabled = true;
  } else {
    statusEl.disabled = false;
  }

  if (hintEl) {
    hintEl.textContent = past
      ? "Fecha en el pasado: el proyecto se registrará como completado."
      : "Puedes elegir una fecha pasada para proyectos ya terminados.";
  }
}

function syncGlobalEstimationsFromProjects(projects) {
  const list = projects || [];
  if (list[0]?.estimations?.length) {
    cachedGlobalEstimations = list[0].estimations;
  }
}

function projectSelectOptions(selectedId, emptyLabel = "— Seleccionar —") {
  const list = cachedProjects || [];
  if (!list.length) {
    return `<option value="">${emptyLabel}</option>`;
  }
  return (
    `<option value="">${emptyLabel}</option>` +
    list
      .map(
        (p) =>
          `<option value="${escapeAttr(p.id)}"${p.id === selectedId ? " selected" : ""}>${escapeHtml(p.name)}</option>`
      )
      .join("")
  );
}

function fillProjectSelects() {
  ["quick-concept-project", "quick-advance-project", "quick-indirect-project"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = projectSelectOptions(el.value);
  });
}

function calcConceptTotalQuick(m2, unitPrice) {
  return Math.round((Number(m2) || 0) * (Number(unitPrice) || 0));
}

function mergeEstimationsForProject(project) {
  return mergeEstimationsFromConcepts(
    project.estimations || cachedGlobalEstimations,
    project.concepts || []
  );
}

function estimationOptionsHtml(estimations, selectedId) {
  const opts = (estimations || [])
    .map((e, idx) => {
      const label = (e.label || "").trim() || `Estimación ${String(idx + 1).padStart(2, "0")}`;
      return `<option value="${escapeAttr(e.id)}"${e.id === selectedId ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return `${opts}<option value="__new__"${selectedId === "__new__" ? " selected" : ""}>+ Crear nueva estimación</option>`;
}

function resolveQuickEstimationId(selectValue, estimations) {
  if (selectValue !== "__new__") return selectValue;
  const est = {
    id: newQuickId("est"),
    label: `Estimación ${String(estimations.length + 1).padStart(2, "0")}`,
    date: todayIso(),
    paid: false,
    paidAt: null,
    notes: "",
  };
  estimations.push(est);
  return est.id;
}

async function fetchFullProject(id) {
  const { project } = await api(`/projects/${id}`);
  return project;
}

async function putProject(project) {
  await api(`/projects/${project.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...project, id: project.id }),
  });
}

const FLUJO_RATE = 0.6;
const INTERCAMBIO_RATE = 0.4;

function computeAdminDashboardSummary(projects) {
  const list = projects || [];
  const active = list.filter(
    (p) => normalizeProjectStatus(p.status) === "en_proceso"
  );
  const inApproval = list.filter(
    (p) => normalizeProjectStatus(p.status) === "en_aprobacion"
  );
  const completed = list.filter(
    (p) => normalizeProjectStatus(p.status) === "completado"
  );

  let totalM2 = 0;
  let doneM2 = 0;
  active.forEach((p) => {
    const prog = projectProgress(p);
    totalM2 += prog.totalM2;
    doneM2 += prog.doneM2;
  });

  const activeProgressPercent = totalM2
    ? Math.min(100, Math.round((doneM2 / totalM2) * 1000) / 10)
    : 0;

  const sumConceptsTotal = (items) =>
    items.reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  const openProjects = list.filter(
    (p) => normalizeProjectStatus(p.status) !== "completado"
  );
  const portfolioValue = sumConceptsTotal(openProjects);
  const portfolioIndirect = openProjects.reduce(
    (s, p) => s + (Number(p.indirectTotal) || 0),
    0
  );
  const portfolioIndirectPercent = calcIndirectPercent(
    portfolioValue,
    portfolioIndirect
  );

  const completedMoney = sumConceptsTotal(completed);
  const completedFlujo = Math.round(completedMoney * FLUJO_RATE);
  const completedIntercambio = Math.round(completedMoney * INTERCAMBIO_RATE);

  return {
    activeCount: active.length,
    activeMoney: sumConceptsTotal(active),
    approvalCount: inApproval.length,
    approvalMoney: sumConceptsTotal(inApproval),
    completedCount: completed.length,
    completedMoney,
    completedFlujo,
    completedIntercambio,
    activeProgressPercent,
    activeDoneM2: Math.round(doneM2 * 100) / 100,
    activeTotalM2: Math.round(totalM2 * 100) / 100,
    portfolioIndirect,
    portfolioIndirectPercent,
  };
}

function projectCountLabel(n) {
  return n === 1 ? "1 proyecto" : `${n} proyectos`;
}

const PROJECT_STATUS_OPTIONS = [
  { value: "en_aprobacion", label: "En aprobación" },
  { value: "en_proceso", label: "En proceso" },
  { value: "completado", label: "Completado" },
];

function projectStatusSelectHtml(projectId, currentStatus) {
  const status = normalizeProjectStatus(currentStatus);
  const options = PROJECT_STATUS_OPTIONS.map(
    (o) =>
      `<option value="${o.value}"${status === o.value ? " selected" : ""}>${o.label}</option>`
  ).join("");
  return `<span class="admin-status-wrap"><select class="admin-status-select btn btn-ghost btn-sm" data-status-for="${escapeHtml(projectId)}" data-last-status="${status}" aria-label="Estado del proyecto">${options}</select></span>`;
}

function adminSummaryHtml(summary) {
  const m2Note =
    summary.activeTotalM2 > 0
      ? `${formatM2(summary.activeDoneM2)} / ${formatM2(summary.activeTotalM2)} m²`
      : "Sin metros registrados";

  return `
    <div class="metric-box">
      <span class="metric-value accent">${formatMoney(summary.activeMoney)}</span>
      <span class="metric-label">Proyectos activos</span>
      <span class="metric-sublabel">${projectCountLabel(summary.activeCount)}</span>
    </div>
    <div class="metric-box">
      <span class="metric-value">${formatMoney(summary.approvalMoney)}</span>
      <span class="metric-label">Proyectos por aprobar</span>
      <span class="metric-sublabel">${projectCountLabel(summary.approvalCount)}</span>
    </div>
    <div class="metric-box metric-box--completed">
      <span class="metric-value">${formatMoney(summary.completedMoney)}</span>
      <span class="metric-label">Proyectos culminados</span>
      <span class="metric-sublabel">${projectCountLabel(summary.completedCount)}</span>
      <span class="metric-sublabel metric-sublabel--emph">Flujo: ${formatMoney(summary.completedFlujo)}</span>
      <span class="metric-sublabel">Intercambio 40%: ${formatMoney(summary.completedIntercambio)}</span>
    </div>
    <div class="metric-box metric-box-progress">
      <div class="progress-ring-wrap">
        <div class="progress-ring" style="--pct: ${summary.activeProgressPercent}" aria-hidden="true">
          <span class="progress-ring-value">${summary.activeProgressPercent}%</span>
        </div>
      </div>
      <span class="metric-label">Avance en activos</span>
      <span class="metric-sublabel">${m2Note}</span>
    </div>
    <div class="metric-box">
      <span class="metric-value">${summary.portfolioIndirectPercent}%</span>
      <span class="metric-label">Gastos indirectos</span>
      <span class="metric-sublabel">${formatMoney(summary.portfolioIndirect)} del portafolio activo</span>
    </div>`;
}

function renderAdminMetrics(projects) {
  const summary = computeAdminDashboardSummary(projects);
  document.getElementById("admin-metrics").innerHTML = adminSummaryHtml(summary);
}

const QUICK_PANEL_TITLES = {
  project: "Nuevo proyecto",
  concept: "Nuevo concepto",
  advance: "Nuevo avance",
  indirect: "Gasto indirecto",
};

function setQuickPanelMode(mode) {
  quickPanelMode = mode;
  document.getElementById("quick-panel-title").textContent =
    editingId && mode === "project"
      ? "Editar proyecto"
      : QUICK_PANEL_TITLES[mode] || QUICK_PANEL_TITLES.project;

  document.querySelectorAll(".quick-panel-form").forEach((form) => {
    form.hidden = form.dataset.quickForm !== mode;
  });

  document.querySelectorAll(".admin-quick-btn").forEach((btn) => {
    const active = btn.dataset.quickMode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-expanded", active ? "true" : "false");
  });
}

function openQuickPanel(mode) {
  const panel = quickPanel();
  const backdrop = formBackdrop();
  if (mode === "project" && !editingId) resetForm();
  if (mode === "project") syncProjectFormCompletionUi();
  if (mode === "concept") resetConceptQuickForm();
  if (mode === "advance") resetAdvanceQuickForm();
  if (mode === "indirect") resetIndirectQuickForm();

  setQuickPanelMode(mode);
  panel.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
  });
}

function closeQuickPanel() {
  const panel = quickPanel();
  const backdrop = formBackdrop();
  panel.classList.remove("is-open");
  backdrop.classList.remove("is-open");
  document.querySelectorAll(".admin-quick-btn").forEach((btn) => {
    btn.classList.remove("is-active");
    btn.setAttribute("aria-expanded", "false");
  });
  setTimeout(() => {
    panel.hidden = true;
    backdrop.hidden = true;
  }, 300);
  if (!editingId) resetForm();
}

function resetConceptQuickForm() {
  const form = document.getElementById("concept-quick-form");
  form.reset();
  document.getElementById("concept-quick-error").textContent = "";
  document.getElementById("quick-concept-total-preview").textContent = "";
  fillProjectSelects();
  updateConceptQuickPreview();
}

function resetAdvanceQuickForm() {
  const form = document.getElementById("advance-quick-form");
  form.reset();
  document.getElementById("advance-quick-error").textContent = "";
  document.getElementById("quick-advance-date").value = todayIso();
  document.getElementById("quick-advance-pending").textContent = "";
  document.getElementById("quick-advance-preview").textContent = "";
  advanceProjectCache = null;
  fillProjectSelects();
  document.getElementById("quick-advance-concept").innerHTML =
    '<option value="">— Seleccionar proyecto primero —</option>';
  document.getElementById("quick-advance-estimation").innerHTML =
    estimationOptionsHtml(cachedGlobalEstimations, "__new__");
}

function updateConceptQuickPreview() {
  const m2 = Number(document.getElementById("quick-concept-m2")?.value) || 0;
  const unit = Number(document.getElementById("quick-concept-unit")?.value) || 0;
  const el = document.getElementById("quick-concept-total-preview");
  if (!el) return;
  const total = calcConceptTotalQuick(m2, unit);
  el.textContent = m2 > 0 || unit > 0 ? `Total del concepto: ${formatMoney(total)}` : "";
}

async function refreshAdvanceQuickFields() {
  const projectId = document.getElementById("quick-advance-project")?.value;
  const conceptSelect = document.getElementById("quick-advance-concept");
  const estSelect = document.getElementById("quick-advance-estimation");
  const pendingEl = document.getElementById("quick-advance-pending");
  const previewEl = document.getElementById("quick-advance-preview");

  if (!projectId) {
    conceptSelect.innerHTML = '<option value="">— Seleccionar proyecto primero —</option>';
    estSelect.innerHTML = estimationOptionsHtml(cachedGlobalEstimations, "__new__");
    pendingEl.textContent = "";
    previewEl.textContent = "";
    advanceProjectCache = null;
    return;
  }

  advanceProjectCache = await fetchFullProject(projectId);
  const concepts = advanceProjectCache.concepts || [];
  if (!concepts.length) {
    conceptSelect.innerHTML =
      '<option value="">— Sin conceptos (agrega uno primero) —</option>';
  } else {
    conceptSelect.innerHTML =
      '<option value="">— Seleccionar —</option>' +
      concepts
        .map((c) => {
          const pending = conceptAdvancePendingM2(c);
          return `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)} (${pending} m² pend.)</option>`;
        })
        .join("");
  }

  const estimations = mergeEstimationsForProject(advanceProjectCache);
  const defaultEst =
    estimations.length > 0 ? estimations[estimations.length - 1].id : "__new__";
  estSelect.innerHTML = estimationOptionsHtml(estimations, defaultEst);
  updateAdvanceQuickPreview();
}

function updateAdvanceQuickPreview() {
  const pendingEl = document.getElementById("quick-advance-pending");
  const previewEl = document.getElementById("quick-advance-preview");
  const conceptId = document.getElementById("quick-advance-concept")?.value;
  const m2 = Number(document.getElementById("quick-advance-m2")?.value) || 0;

  if (!advanceProjectCache || !conceptId) {
    pendingEl.textContent = "";
    previewEl.textContent = "";
    return;
  }

  const concept = (advanceProjectCache.concepts || []).find((c) => c.id === conceptId);
  if (!concept) return;

  const pending = conceptAdvancePendingM2(concept);
  pendingEl.innerHTML = `Pendiente por avanzar: <strong>${pending}</strong> m²`;
  const amount = Math.round(m2 * (Number(concept.unitPrice) || 0));
  previewEl.textContent =
    m2 > 0 ? `Importe del avance: ${formatMoney(amount)}` : "";
}

function bindQuickPanel() {
  document.querySelectorAll(".admin-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.quickMode;
      const panel = quickPanel();
      const isOpen = panel.classList.contains("is-open") && !panel.hidden;
      if (isOpen && quickPanelMode === mode) {
        closeQuickPanel();
        return;
      }
      if (mode === "project") resetForm();
      openQuickPanel(mode);
    });
  });

  document.getElementById("quick-panel-close").addEventListener("click", closeQuickPanel);
  document.getElementById("concept-quick-cancel").addEventListener("click", closeQuickPanel);
  document.getElementById("advance-quick-cancel").addEventListener("click", closeQuickPanel);
  formBackdrop().addEventListener("click", closeQuickPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && quickPanel().classList.contains("is-open")) {
      closeQuickPanel();
    }
  });

  ["quick-concept-m2", "quick-concept-unit"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateConceptQuickPreview);
  });

  document
    .getElementById("quick-advance-project")
    ?.addEventListener("change", () => refreshAdvanceQuickFields());
  document
    .getElementById("quick-advance-concept")
    ?.addEventListener("change", updateAdvanceQuickPreview);
  document
    .getElementById("quick-advance-m2")
    ?.addEventListener("input", updateAdvanceQuickPreview);

  document
    .getElementById("concept-quick-form")
    .addEventListener("submit", onSubmitQuickConcept);
  document
    .getElementById("advance-quick-form")
    .addEventListener("submit", onSubmitQuickAdvance);
  document
    .getElementById("indirect-quick-form")
    .addEventListener("submit", onSubmitQuickIndirect);
  document
    .getElementById("indirect-quick-cancel")
    ?.addEventListener("click", closeQuickPanel);

  document
    .getElementById("completionDate")
    ?.addEventListener("change", syncProjectFormCompletionUi);
  document
    .getElementById("completionDate")
    ?.addEventListener("input", syncProjectFormCompletionUi);
}

function resetIndirectQuickForm() {
  const form = document.getElementById("indirect-quick-form");
  form.reset();
  document.getElementById("indirect-quick-error").textContent = "";
  document.getElementById("quick-indirect-date").value = todayIso();
  fillProjectSelects();
}

async function onSubmitQuickIndirect(e) {
  e.preventDefault();
  const err = document.getElementById("indirect-quick-error");
  err.textContent = "";

  const projectId = document.getElementById("quick-indirect-project").value;
  const label = document.getElementById("quick-indirect-label").value.trim();
  const amount = Math.round(Number(document.getElementById("quick-indirect-amount").value) || 0);
  const date = document.getElementById("quick-indirect-date").value || todayIso();
  const note = document.getElementById("quick-indirect-note").value.trim();

  if (!projectId) {
    err.textContent = "Selecciona un proyecto.";
    return;
  }
  if (!label) {
    err.textContent = "Describe el gasto indirecto.";
    return;
  }
  if (amount <= 0) {
    err.textContent = "Indica un monto mayor a cero.";
    return;
  }

  try {
    const project = await fetchFullProject(projectId);
    project.indirectCosts = [
      ...(project.indirectCosts || []),
      { id: newQuickId("ind"), label, amount, date, note },
    ];
    await putProject(project);
    closeQuickPanel();
    await refreshDashboard();
  } catch (ex) {
    err.textContent = ex.message;
  }
}

async function onSubmitQuickConcept(e) {
  e.preventDefault();
  const err = document.getElementById("concept-quick-error");
  err.textContent = "";

  const projectId = document.getElementById("quick-concept-project").value;
  const name = document.getElementById("quick-concept-name").value.trim();
  const m2 = Number(document.getElementById("quick-concept-m2").value) || 0;
  const unitPrice = Number(document.getElementById("quick-concept-unit").value) || 0;

  if (!projectId) {
    err.textContent = "Selecciona un proyecto.";
    return;
  }
  if (!name) {
    err.textContent = "Indica el nombre del concepto.";
    return;
  }

  try {
    const project = await fetchFullProject(projectId);
    const concept = {
      id: newQuickId("c"),
      name,
      m2,
      unitPrice,
      totalPrice: calcConceptTotalQuick(m2, unitPrice),
      status: "en_aprobacion",
      advances: [],
    };
    project.concepts = [...(project.concepts || []), concept];
    project.estimations = mergeEstimationsForProject(project);
    await putProject(project);
    closeQuickPanel();
    await refreshDashboard();
  } catch (ex) {
    err.textContent = ex.message;
  }
}

async function onSubmitQuickAdvance(e) {
  e.preventDefault();
  const err = document.getElementById("advance-quick-error");
  err.textContent = "";

  const projectId = document.getElementById("quick-advance-project").value;
  const conceptId = document.getElementById("quick-advance-concept").value;
  const m2 = Number(document.getElementById("quick-advance-m2").value) || 0;
  const date =
    document.getElementById("quick-advance-date").value || todayIso();
  const estValue = document.getElementById("quick-advance-estimation").value;

  if (!projectId || !conceptId) {
    err.textContent = "Selecciona proyecto y concepto.";
    return;
  }
  if (m2 <= 0) {
    err.textContent = "Indica los m² del avance.";
    return;
  }

  try {
    const project = advanceProjectCache?.id === projectId
      ? advanceProjectCache
      : await fetchFullProject(projectId);
    const concept = (project.concepts || []).find((c) => c.id === conceptId);
    if (!concept) {
      err.textContent = "Concepto no encontrado.";
      return;
    }

    const pending = conceptAdvancePendingM2(concept);
    if (m2 > pending + 0.001) {
      err.textContent = `Solo quedan ${pending} m² por registrar en este concepto.`;
      return;
    }

    let estimations = mergeEstimationsForProject(project);
    const estimationId = resolveQuickEstimationId(estValue, estimations);
    if (!estimationId) {
      err.textContent = "Selecciona o crea una estimación.";
      return;
    }

    const advances = parseAdvances(concept);
    advances.push({
      id: newQuickId("adv"),
      m2,
      date,
      estimationId,
      note: "",
    });
    concept.advances = advances;
    project.estimations = estimations;

    await putProject(project);
    closeQuickPanel();
    await refreshDashboard();
  } catch (ex) {
    err.textContent = ex.message;
  }
}

(async () => {
  const user = await requireAuth();
  if (!user || user.role !== "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  document.getElementById("user-greeting").textContent = `${user.name} — Administrador`;
  document.getElementById("logout-btn").addEventListener("click", logout);

  bindQuickPanel();
  bindProjectSearch();

  const [{ users }, { settings: settingsRes }, { projects }] = await Promise.all([
    api("/users"),
    api("/admin/settings"),
    api("/projects"),
  ]);

  clients = users;
  document.getElementById("clientId").innerHTML =
    '<option value="">— Seleccionar —</option>' +
    users
      .map(
        (u) =>
          `<option value="${u.id}">${escapeHtml(u.name)} (${u.username})</option>`
      )
      .join("");

  projectOrder = settingsRes?.settings?.projectOrder || [];
  cachedProjects = projects;
  syncGlobalEstimationsFromProjects(projects);
  if (!projectOrder.length) {
    projectOrder = projects.map((p) => p.id);
  }
  fillProjectSelects();
  renderAdminMetrics(projects);
  await loadProjects(projects);

  document.getElementById("project-form").addEventListener("submit", onSubmit);
  document.getElementById("form-reset").addEventListener("click", () => {
    resetForm();
    closeQuickPanel();
  });
})();

async function refreshDashboard() {
  const [{ settings: settingsRes }, { projects }] = await Promise.all([
    api("/admin/settings"),
    api("/projects"),
  ]);
  projectOrder = settingsRes?.settings?.projectOrder || projectOrder;
  cachedProjects = projects;
  syncGlobalEstimationsFromProjects(projects);
  if (!projectOrder.length) {
    projectOrder = projects.map((p) => p.id);
  }
  fillProjectSelects();
  renderAdminMetrics(projects);
  await loadProjects(projects);
}

function setAdminBusyState(state) {
  const card = document.getElementById("admin-busy-card");
  const ring = card?.querySelector(".admin-busy-ring");
  const check = card?.querySelector(".admin-busy-check");
  const errIcon = card?.querySelector(".admin-busy-error");
  if (!card) return;

  card.classList.remove("admin-busy-card--success", "admin-busy-card--error");
  if (state === "success") card.classList.add("admin-busy-card--success");
  if (state === "error") card.classList.add("admin-busy-card--error");

  const loading = state === "loading";
  if (ring) ring.hidden = !loading;
  if (check) check.hidden = state !== "success";
  if (errIcon) errIcon.hidden = state !== "error";
}

function showAdminBusy({ title, detail = "", state = "loading" }) {
  const overlay = document.getElementById("admin-busy-overlay");
  const titleEl = document.getElementById("admin-busy-title");
  const detailEl = document.getElementById("admin-busy-detail");
  if (!overlay) return;

  clearTimeout(adminBusyHideTimer);
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  setAdminBusyState(state);

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function hideAdminBusy(delayMs = 0) {
  const overlay = document.getElementById("admin-busy-overlay");
  if (!overlay) return;

  adminBusyHideTimer = setTimeout(() => {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      overlay.hidden = true;
      setAdminBusyState("loading");
    }, 360);
  }, delayMs);
}

async function duplicateProject(id) {
  const btn = document.querySelector(`[data-duplicate="${id}"]`);
  const item = document.querySelector(
    `.admin-list-item[data-project-id="${CSS.escape(id)}"]`
  );
  const project = cachedProjects.find((p) => p.id === id);
  const name = project?.name || "proyecto";

  if (btn) btn.disabled = true;
  item?.classList.add("is-duplicating");

  showAdminBusy({
    title: "Duplicando proyecto",
    detail: `Copiando conceptos, avances y costos de «${name}»…`,
    state: "loading",
  });

  try {
    await api(`/projects/${id}/duplicate`, { method: "POST" });
    showAdminBusy({
      title: "Proyecto duplicado",
      detail: `La copia de «${name}» ya está en la lista.`,
      state: "success",
    });
    await refreshDashboard();
    hideAdminBusy(1500);
  } catch (ex) {
    showAdminBusy({
      title: "No se pudo duplicar",
      detail: ex.message || "Intenta de nuevo en unos segundos.",
      state: "error",
    });
    hideAdminBusy(3200);
  } finally {
    if (btn) btn.disabled = false;
    item?.classList.remove("is-duplicating");
  }
}

function sortProjectsByOrder(projects, order) {
  const list = projects || [];
  const ids = Array.isArray(order) ? order : [];
  if (!ids.length) return [...list];
  const byId = new Map(list.map((p) => [p.id, p]));
  const out = [];
  for (const id of ids) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
    }
  }
  for (const p of byId.values()) out.push(p);
  return out;
}

function getSortedProjects(projects = cachedProjects) {
  return sortProjectsByOrder(projects, projectOrder);
}

function filterProjectsBySearch(projects, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => {
    const client = clients.find((c) => c.id === p.clientId);
    const clientName = (client?.name || "").toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(q) ||
      clientName.includes(q) ||
      (p.id || "").toLowerCase().includes(q)
    );
  });
}

function getProjectsForDisplay() {
  const sorted = getSortedProjects(cachedProjects);
  return filterProjectsBySearch(sorted, projectSearchQuery);
}

async function loadAdminSettings() {
  try {
    const { settings } = await api("/admin/settings");
    projectOrder = settings?.projectOrder || [];
  } catch {
    projectOrder = [];
  }
}

async function saveProjectOrder(ids) {
  const { settings } = await api("/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ projectOrder: ids }),
  });
  projectOrder = settings?.projectOrder || ids;
  cachedProjects = sortProjectsByOrder(cachedProjects, projectOrder);
}

function updateProjectSearchMeta(shown, total) {
  const meta = document.getElementById("admin-project-search-meta");
  const hint = document.getElementById("admin-reorder-hint");
  const q = projectSearchQuery.trim();
  if (meta) {
    if (!q) {
      meta.textContent = total ? `${total} proyecto${total === 1 ? "" : "s"}` : "";
    } else if (!shown) {
      meta.textContent = "Ningún proyecto coincide con la búsqueda";
    } else {
      meta.textContent = `${shown} de ${total} proyecto${total === 1 ? "" : "s"}`;
    }
  }
  if (hint) hint.hidden = !!q;
}

function bindProjectSearch() {
  const input = document.getElementById("admin-project-search");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    projectSearchQuery = input.value;
    loadProjects();
  });
}

function clearDropIndicators(listEl) {
  listEl
    .querySelectorAll(".admin-list-item")
    .forEach((el) => el.classList.remove("drop-before", "drop-after"));
}

function placementFromPointer(row, clientY) {
  const rect = row.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function setDropIndicator(listEl, row, placement) {
  clearDropIndicators(listEl);
  row.classList.add(placement === "before" ? "drop-before" : "drop-after");
}

function bindProjectListDnD(listEl) {
  if (!listEl || projectSearchQuery.trim()) return;

  listEl.querySelectorAll(".admin-drag-handle").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      dragProjectId = handle.dataset.dragProject;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragProjectId);
      handle.closest(".admin-list-item")?.classList.add("is-dragging");
      listEl.classList.add("is-dnd-active");
    });
    handle.addEventListener("dragend", () => {
      dragProjectId = null;
      listEl.classList.remove("is-dnd-active");
      listEl
        .querySelectorAll(".admin-list-item")
        .forEach((el) =>
          el.classList.remove("is-dragging", "drop-before", "drop-after")
        );
    });
  });

  listEl.addEventListener("dragover", (e) => {
    if (!dragProjectId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const row = e.target.closest(".admin-list-item");
    const items = [...listEl.querySelectorAll(".admin-list-item")];

    if (!row) {
      const last = items[items.length - 1];
      if (last) setDropIndicator(listEl, last, "after");
      return;
    }

    setDropIndicator(listEl, row, placementFromPointer(row, e.clientY));
  });

  listEl.addEventListener("dragleave", (e) => {
    if (!listEl.contains(e.relatedTarget)) {
      clearDropIndicators(listEl);
    }
  });

  listEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const row = e.target.closest(".admin-list-item");
    clearDropIndicators(listEl);
    if (!dragProjectId || !row) return;

    const targetId = row.dataset.projectId;
    const placement = placementFromPointer(row, e.clientY);
    if (!targetId) return;

    if (dragProjectId === targetId) return;

    await reorderProjects(dragProjectId, targetId, placement);
  });
}

async function reorderProjects(sourceId, targetId, placement) {
  const sorted = getSortedProjects(cachedProjects);
  const ids = sorted.map((p) => p.id);
  const from = ids.indexOf(sourceId);
  let insertAt = ids.indexOf(targetId);
  if (from < 0 || insertAt < 0) return;

  if (placement === "after") insertAt += 1;
  if (from < insertAt) insertAt -= 1;

  if (from === insertAt) return;

  ids.splice(from, 1);
  ids.splice(insertAt, 0, sourceId);

  try {
    await saveProjectOrder(ids);
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo guardar el orden");
  }
}

async function loadProjects(projects = cachedProjects) {
  const list = document.getElementById("admin-projects");
  if (!list) return;

  cachedProjects = projects;
  const total = cachedProjects.length;
  const display = getProjectsForDisplay();
  updateProjectSearchMeta(display.length, total);

  const canReorder = !projectSearchQuery.trim() && display.length > 0;

  if (!display.length) {
    list.classList.remove("admin-list--reorderable");
    list.innerHTML = `<div class="admin-list-item admin-list-item--empty"><span>${
      total
        ? "Ningún proyecto coincide con la búsqueda"
        : "Sin proyectos"
    }</span></div>`;
    return;
  }

  list.classList.toggle("admin-list--reorderable", canReorder);

  list.innerHTML = display
    .map((p) => {
      const client = clients.find((c) => c.id === p.clientId);
      const clientName = client ? client.name : "Sin asignar";
      const n = (p.concepts && p.concepts.length) || 0;
      const dragHandle = canReorder
        ? `<button type="button" class="admin-drag-handle" draggable="true" data-drag-project="${escapeAttr(p.id)}" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar">⋮⋮</button>`
        : "";
      const projectUrl = `/project.html?id=${encodeURIComponent(p.id)}`;
      return `
      <div class="admin-list-item" data-project-id="${escapeAttr(p.id)}">
        ${dragHandle}
        <a href="${projectUrl}" class="admin-list-item-main" aria-label="Abrir ${escapeAttr(p.name)}">
          <div class="admin-list-item-start">
            ${progressRingCardHtml(p)}
            <div class="admin-list-item-info">
              <strong>${escapeHtml(p.name)}</strong>
              <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${n} conceptos · ${formatProjectMoneyDisplay(p)}</span>
            </div>
          </div>
        </a>
        <div class="portal-actions admin-list-actions">
          ${projectStatusSelectHtml(p.id, p.status)}
          <button type="button" class="btn btn-ghost btn-sm" data-duplicate="${p.id}">Duplicar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete="${p.id}">Eliminar</button>
        </div>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => loadBasicEdit(btn.dataset.edit));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProject(btn.dataset.delete));
  });
  list.querySelectorAll("[data-duplicate]").forEach((btn) => {
    btn.addEventListener("click", () => duplicateProject(btn.dataset.duplicate));
  });
  list.querySelectorAll(".admin-status-select").forEach((sel) => {
    sel.addEventListener("change", () => updateProjectStatus(sel));
  });

  if (canReorder) bindProjectListDnD(list);
}

async function updateProjectStatus(selectEl) {
  const id = selectEl.dataset.statusFor;
  const newStatus = selectEl.value;
  const previous = selectEl.dataset.lastStatus;
  selectEl.disabled = true;

  try {
    const { project } = await api(`/projects/${id}`);
    const current = normalizeProjectStatus(project.status);
    if (current === newStatus) return;

    await api(`/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...project, id, status: newStatus }),
    });
    await refreshDashboard();
  } catch (ex) {
    selectEl.value = previous;
    alert(ex.message || "No se pudo actualizar el estado");
  } finally {
    selectEl.disabled = false;
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const err = document.getElementById("form-error");
  err.textContent = "";
  err.style.color = "";

  const completionDate = document.getElementById("completionDate").value;
  const body = {
    name: document.getElementById("name").value.trim(),
    clientId: document.getElementById("clientId").value,
    completionDate,
    status: editingId
      ? document.getElementById("status").value
      : statusForNewProject(
          completionDate,
          document.getElementById("status").value
        ),
    zone3dImage:
      document.getElementById("zone3dImage").value.trim() ||
      "/assets/zone-3d-placeholder.svg",
    concepts: [],
    estimations: [],
    documents: [],
    indirectCosts: [],
  };

  try {
    if (editingId) {
      const existing = (await api(`/projects/${editingId}`)).project;
      await api(`/projects/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...existing,
          ...body,
          id: editingId,
          concepts: existing.concepts || [],
          documents: existing.documents || [],
          indirectCosts: existing.indirectCosts || [],
        }),
      });
    } else {
      const { project } = await api("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      resetForm();
      closeQuickPanel();
      await refreshDashboard();
      err.style.color = "var(--accent)";
      err.textContent = "Proyecto creado. Haz clic en el proyecto para agregar conceptos.";
      setTimeout(() => {
        window.location.href = `/project.html?id=${encodeURIComponent(project.id)}`;
      }, 800);
      return;
    }
    resetForm();
    closeQuickPanel();
    await refreshDashboard();
    err.style.color = "var(--accent)";
    err.textContent = "Proyecto actualizado.";
    setTimeout(() => {
      err.textContent = "";
      err.style.color = "";
    }, 2500);
  } catch (ex) {
    err.textContent = ex.message;
  }
}

function setSubmitLabel() {
  document.querySelector("#project-form button[type=submit]").textContent =
    editingId ? "Guardar" : "Crear proyecto";
}

async function loadBasicEdit(id) {
  const { project: p } = await api(`/projects/${id}`);
  editingId = id;
  setSubmitLabel();
  document.getElementById("name").value = p.name;
  document.getElementById("clientId").value = p.clientId || "";
  document.getElementById("completionDate").value = p.completionDate;
  document.getElementById("status").value = normalizeProjectStatus(p.status);
  document.getElementById("zone3dImage").value = p.zone3dImage || "";
  document.getElementById("form-reset").hidden = false;
  openQuickPanel("project");
  syncProjectFormCompletionUi();
}

function resetForm() {
  editingId = null;
  setSubmitLabel();
  document.getElementById("project-form").reset();
  document.getElementById("completionDate").removeAttribute("min");
  document.getElementById("status").disabled = false;
  document.getElementById("form-reset").hidden = true;
  document.getElementById("form-error").textContent = "";
  syncProjectFormCompletionUi();
}

async function deleteProject(id) {
  if (!confirm("¿Eliminar este proyecto?")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  if (editingId === id) {
    resetForm();
    closeQuickPanel();
  }
  await refreshDashboard();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
