let clients = [];
let editingId = null;
let cachedProjects = [];
let cachedGlobalEstimations = [];
let quickPanelMode = "project";
let advanceProjectCache = null;
let projectOrder = [];
let projectFolders = [];
let projectSearchQuery = "";
let dragProjectId = null;
let dragFolderId = null;
let folderDialogResolve = null;
const actionFeedbackTimers = new Map();
let moveFolderDocBound = false;

const ADMIN_ACTION_ICONS = {
  folderMove: `<svg class="admin-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h6l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><path d="M12 11v5"/><path d="M9.5 13.5 12 16l2.5-2.5"/></svg>`,
  duplicate: `<svg class="admin-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 4h12v12"/></svg>`,
  edit: `<svg class="admin-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  delete: `<svg class="admin-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7 7l1 12h8l1-12"/></svg>`,
};

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

function allCachedConcepts() {
  return (cachedProjects || []).flatMap((p) => p.concepts || []);
}

function mergeLiveAdminEstimationPayments(baseList) {
  const live = window.__pafAdminEstimationsSorted;
  if (!live?.length) return baseList;
  const byId = new Map(live.map((e) => [e.id, e]));
  return (baseList || []).map((e) => {
    const patch = byId.get(e.id);
    if (!patch) return e;
    return {
      ...e,
      amountPaid: patch.amountPaid,
      paymentStatus: patch.paymentStatus,
      paid: patch.paid,
      paidAt: patch.paidAt,
      sortOrder: patch.sortOrder ?? e.sortOrder,
      label: patch.label ?? e.label,
      date: patch.date ?? e.date,
      notes: patch.notes ?? e.notes,
    };
  });
}

function buildEstimationsListForQuick() {
  return mergeLiveAdminEstimationPayments(
    mergeEstimationsFromConcepts(cachedGlobalEstimations, allCachedConcepts())
  );
}

function estimationRecordForPersist(e) {
  const total = estimationBreakdownFor(e.id).grandTotal || 0;
  const payment = getEstimationPayment(e, total);
  return {
    id: e.id,
    label: (e.label || "").trim(),
    date: e.date || todayIso(),
    amountPaid: payment.amountPaid,
    paymentStatus: payment.paymentStatus,
    paid: payment.paid,
    paidAt: payment.paidAt,
    notes: (e.notes || "").trim(),
    ...(Number.isFinite(Number(e.sortOrder)) ? { sortOrder: Number(e.sortOrder) } : {}),
  };
}

function buildEstimationsListForPersist() {
  return buildEstimationsListForQuick().map(estimationRecordForPersist);
}

function createQuickEstimation(estimations, fields = {}) {
  const list = estimations || [];
  const est = {
    id: newQuickId("est"),
    label:
      (fields.label || "").trim() ||
      `Estimación ${String(list.length + 1).padStart(2, "0")}`,
    date: fields.date || todayIso(),
    amountPaid: 0,
    paymentStatus: "pending",
    paid: false,
    paidAt: null,
    notes: (fields.notes || "").trim(),
    sortOrder: nextEstimationSortOrder(list),
  };
  list.push(est);
  return est;
}

async function persistEstimationsToGlobal(estimations) {
  if (!cachedProjects?.length) {
    throw new Error("Registra al menos un proyecto antes de crear estimaciones.");
  }
  const anchor = await fetchFullProject(cachedProjects[0].id);
  anchor.estimations = estimations;
  await putProject(anchor);
  cachedGlobalEstimations = estimations;
}

function resolveQuickEstimationId(selectValue, estimations) {
  if (selectValue !== "__new__") return selectValue;
  const est = createQuickEstimation(estimations);
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

  const allConcepts = list.flatMap((p) => p.concepts || []);
  const estimationsList = mergeLiveAdminEstimationPayments(
    mergeEstimationsFromConcepts(cachedGlobalEstimations, allConcepts)
  );
  window.__pafProjectsForEstimations = list;
  refreshEstimationBreakdowns(estimationsList);
  const paidEstimationsMoney = calcTotalPaid(estimationsList, list);
  const paidEstimationsCount = estimationsList.filter((e) => {
    const total = estimationBreakdownFor(e.id).grandTotal || 0;
    const pay = getEstimationPayment(e, total);
    return pay.status === "paid" || pay.amountPaid > 0;
  }).length;
  const paidEstimationsFlujo = Math.round(paidEstimationsMoney * FLUJO_RATE);
  const paidEstimationsIntercambio = Math.round(
    paidEstimationsMoney * INTERCAMBIO_RATE
  );

  let totalProfit = 0;
  let totalFlowProfit = 0;
  let totalIntercambioProfit = 0;
  list.forEach((p) => {
    const indirectTotal =
      Number(p.indirectTotal) || calcIndirectTotal(p.indirectCosts || []);
    const econ = calcConceptEconomics(p.concepts || [], indirectTotal);
    totalIntercambioProfit += econ.intercambioProfitTotal;
    totalFlowProfit += econ.flowProfitTotal;
    totalProfit += econ.profitTotal;
  });

  return {
    activeCount: active.length,
    activeMoney: sumConceptsTotal(active),
    approvalCount: inApproval.length,
    approvalMoney: sumConceptsTotal(inApproval),
    paidEstimationsMoney,
    paidEstimationsCount,
    paidEstimationsFlujo,
    paidEstimationsIntercambio,
    activeProgressPercent,
    activeDoneM2: Math.round(doneM2 * 100) / 100,
    activeTotalM2: Math.round(totalM2 * 100) / 100,
    portfolioIndirect,
    portfolioIndirectPercent,
    totalProfit,
    totalFlowProfit,
    totalIntercambioProfit,
  };
}

function projectCountLabel(n) {
  return n === 1 ? "1 proyecto" : `${n} proyectos`;
}

function estimationCountLabel(n) {
  return n === 1 ? "1 estimación pagada" : `${n} estimaciones pagadas`;
}

function metricSplitHtml(leftValue, leftLabel, rightValue, rightLabel) {
  return `
    <div class="metric-split" role="group">
      <div class="metric-split-item">
        <span class="metric-split-value">${leftValue}</span>
        <span class="metric-split-label">${leftLabel}</span>
      </div>
      <div class="metric-split-item">
        <span class="metric-split-value">${rightValue}</span>
        <span class="metric-split-label">${rightLabel}</span>
      </div>
    </div>`;
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
  return `<span class="admin-status-wrap admin-action-wrap--slot admin-status-wrap--slot">
    <span class="admin-status-control">
      <select class="admin-status-select" data-status-for="${escapeHtml(projectId)}" data-last-status="${status}" aria-label="Estado del proyecto">${options}</select>
      <span class="admin-status-chevron" aria-hidden="true"></span>
    </span>
    <span class="admin-action-feedback admin-action-feedback--slot" role="status" aria-live="polite">
      <span class="admin-action-progress" aria-hidden="true">
        <span class="admin-action-progress-fill"></span>
      </span>
      <span class="admin-action-label"></span>
    </span>
  </span>`;
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
    <div class="metric-box metric-box--split">
      <span class="metric-value">${formatMoney(summary.paidEstimationsMoney)}</span>
      <span class="metric-label">Estimaciones pagadas</span>
      <span class="metric-sublabel">${estimationCountLabel(summary.paidEstimationsCount)}</span>
      ${metricSplitHtml(
        formatMoney(summary.paidEstimationsFlujo),
        "Flujo 60%",
        formatMoney(summary.paidEstimationsIntercambio),
        "Intercambio 40%"
      )}
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
    </div>
    <div class="metric-box metric-box--split">
      <span class="metric-value accent">${formatMoney(summary.totalProfit)}</span>
      <span class="metric-label">Utilidad total</span>
      ${metricSplitHtml(
        formatMoney(summary.totalFlowProfit),
        "Utilidad de flujo",
        formatMoney(summary.totalIntercambioProfit),
        "Intercambio 40%"
      )}
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
  estimation: "Nueva estimación",
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
  if (mode === "estimation") resetEstimationQuickForm();
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
  clearEditHighlight();
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
  const specialToggle = document.getElementById("quick-advance-special-toggle");
  const specialInput = document.getElementById("quick-advance-special-price");
  const specialBlock = document.getElementById("quick-advance-special-block");
  if (specialToggle) specialToggle.checked = false;
  if (specialInput) {
    specialInput.value = "";
    specialInput.disabled = true;
  }
  specialBlock?.classList.remove("is-active");
  specialToggle?.closest(".advance-special-toggle")?.classList.remove("is-active");
  advanceProjectCache = null;
  fillProjectSelects();
  document.getElementById("quick-advance-concept").innerHTML =
    '<option value="">— Seleccionar proyecto primero —</option>';
  document.getElementById("quick-advance-estimation").innerHTML =
    estimationOptionsHtml(cachedGlobalEstimations, "__new__");
}

function readQuickAdvanceSpecial(concept) {
  const toggle = document.getElementById("quick-advance-special-toggle");
  const input = document.getElementById("quick-advance-special-price");
  const useSpecialPrice = !!toggle?.checked;
  const specialUnitPrice = useSpecialPrice ? Number(input?.value) || 0 : 0;
  const unitPrice =
    useSpecialPrice && specialUnitPrice > 0
      ? specialUnitPrice
      : Number(concept?.unitPrice) || 0;
  return {
    useSpecialPrice: useSpecialPrice && specialUnitPrice > 0,
    specialUnitPrice,
    unitPrice,
  };
}

function syncQuickAdvanceSpecialUi(concept) {
  const toggle = document.getElementById("quick-advance-special-toggle");
  const wrap = document.getElementById("quick-advance-special-wrap");
  const input = document.getElementById("quick-advance-special-price");
  if (!toggle || !wrap || !input) return;
  const on = toggle.checked;
  const block = document.getElementById("quick-advance-special-block");
  const toggleUi = toggle.closest(".advance-special-toggle");
  if (block) block.classList.toggle("is-active", on);
  if (toggleUi) toggleUi.classList.toggle("is-active", on);
  input.disabled = !on;
  if (on && !input.value && concept) {
    input.value = Number(concept.unitPrice) || "";
  }
  updateAdvanceQuickPreview();
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
  const { unitPrice, useSpecialPrice } = readQuickAdvanceSpecial(concept);
  const amount = Math.round(m2 * unitPrice);
  if (m2 <= 0) {
    previewEl.textContent = "";
    return;
  }
  previewEl.textContent = useSpecialPrice
    ? `Importe (PE ${formatMoney(unitPrice)}/m²): ${formatMoney(amount)}`
    : `Importe del avance: ${formatMoney(amount)}`;
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
  document.getElementById("estimation-quick-cancel").addEventListener("click", closeQuickPanel);
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
  document.getElementById("quick-advance-concept")?.addEventListener("change", () => {
    const conceptId = document.getElementById("quick-advance-concept")?.value;
    const concept = advanceProjectCache?.concepts?.find((c) => c.id === conceptId);
    syncQuickAdvanceSpecialUi(concept);
  });
  document
    .getElementById("quick-advance-m2")
    ?.addEventListener("input", updateAdvanceQuickPreview);
  document.getElementById("quick-advance-special-toggle")?.addEventListener("change", () => {
    const conceptId = document.getElementById("quick-advance-concept")?.value;
    const concept = advanceProjectCache?.concepts?.find((c) => c.id === conceptId);
    syncQuickAdvanceSpecialUi(concept);
  });
  document
    .getElementById("quick-advance-special-price")
    ?.addEventListener("input", updateAdvanceQuickPreview);

  document
    .getElementById("concept-quick-form")
    .addEventListener("submit", onSubmitQuickConcept);
  document
    .getElementById("advance-quick-form")
    .addEventListener("submit", onSubmitQuickAdvance);
  document
    .getElementById("estimation-quick-form")
    .addEventListener("submit", onSubmitQuickEstimation);
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

function resetEstimationQuickForm() {
  const form = document.getElementById("estimation-quick-form");
  form.reset();
  document.getElementById("estimation-quick-error").textContent = "";
  document.getElementById("quick-estimation-date").value = todayIso();
  const list = buildEstimationsListForQuick();
  const labelEl = document.getElementById("quick-estimation-label");
  if (labelEl) {
    labelEl.placeholder = `Estimación ${String(list.length + 1).padStart(2, "0")} (opcional)`;
  }
}

function resetIndirectQuickForm() {
  const form = document.getElementById("indirect-quick-form");
  form.reset();
  document.getElementById("indirect-quick-error").textContent = "";
  document.getElementById("quick-indirect-date").value = todayIso();
  fillProjectSelects();
}

async function onSubmitQuickEstimation(e) {
  e.preventDefault();
  const err = document.getElementById("estimation-quick-error");
  err.textContent = "";

  const label = document.getElementById("quick-estimation-label").value.trim();
  const date =
    document.getElementById("quick-estimation-date").value || todayIso();
  const notes = document.getElementById("quick-estimation-notes").value.trim();

  try {
    const estimations = buildEstimationsListForQuick();
    createQuickEstimation(estimations, { label, date, notes });
    await persistEstimationsToGlobal(buildEstimationsListForPersist());
    closeQuickPanel();
    await refreshDashboard();
  } catch (ex) {
    err.textContent = ex.message;
  }
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

    const specialToggle = document.getElementById("quick-advance-special-toggle");
    const special = readQuickAdvanceSpecial(concept);
    if (specialToggle?.checked && !special.useSpecialPrice) {
      err.textContent = "Indica el precio especial o desactiva la casilla.";
      return;
    }

    const advances = parseAdvances(concept);
    const newAdv = {
      id: newQuickId("adv"),
      m2,
      date,
      estimationId,
      note: "",
    };
    if (special.useSpecialPrice) {
      newAdv.useSpecialPrice = true;
      newAdv.specialUnitPrice = special.specialUnitPrice;
    }
    advances.push(serializeAdvance(newAdv));
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
  bindFolderNameDialog();

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

  projectOrder = settingsRes?.projectOrder || [];
  projectFolders = Array.isArray(settingsRes?.projectFolders)
    ? settingsRes.projectFolders.map((f) => ({
        id: f.id,
        name: f.name,
        collapsed: !!f.collapsed,
        projectIds: [...(f.projectIds || [])],
      }))
    : [];
  cachedProjects = projects;
  syncGlobalEstimationsFromProjects(projects);
  if (!projectOrder.length) {
    projectOrder = projects.map((p) => p.id);
  }
  fillProjectSelects();
  renderAdminMetrics(projects);
  await loadProjects(projects);
  renderAdminEstimationsList(projects);

  document.getElementById("admin-add-estimation")?.addEventListener("click", () => {
    openQuickPanel("estimation");
  });

  document.getElementById("project-form").addEventListener("submit", onSubmit);
  document.getElementById("form-reset").addEventListener("click", () => {
    resetForm();
    closeQuickPanel();
  });
})();

function syncAdminEstimationProjects(projects) {
  window.__pafProjectsForEstimations = (projects || []).map((p) => ({
    id: p.id,
    name: p.name,
    concepts: p.concepts || [],
  }));
}

let adminPaymentPersistTimer = null;

function scheduleAdminPaymentPersist() {
  clearTimeout(adminPaymentPersistTimer);
  adminPaymentPersistTimer = setTimeout(async () => {
    try {
      const estimations = buildEstimationsListForPersist();
      await persistEstimationsToGlobal(estimations);
      window.__pafAdminEstimationsSorted = sortEstimationsList(estimations);
      renderAdminMetrics(cachedProjects);
    } catch (ex) {
      console.error(ex);
    }
  }, 450);
}

function syncAdminEstimationPaymentSection(idx, est, options = {}) {
  const card = document.querySelector(`[data-admin-est-idx="${idx}"]`);
  if (!card) return;

  const total = estimationBreakdownFor(est.id).grandTotal || 0;
  const payment = getEstimationPayment(est, total);
  const expanded =
    options.expanded !== undefined
      ? options.expanded
      : !card.classList.contains("is-collapsed");

  card.classList.toggle("is-collapsed", !expanded);
  card.classList.toggle("is-paid", payment.status === "paid");
  card.classList.toggle("is-partial", payment.status === "partial");

  const lineCount = estimationBreakdownFor(est.id).lineCount || 0;
  const projectCount = payment.total > 0 ? (estimationBreakdownFor(est.id).groups?.length || 0) : 0;
  const label = estimationDisplayLabel(
    est,
    (window.__pafAdminEstimationsSorted || []).findIndex((e) => e.id === est.id)
  );
  const projectsNote =
    projectCount > 1 ? ` · ${projectCount} proyectos` : "";
  const summary = `${label} · ${lineCount} partida(s)${projectsNote} · ${formatMoney(total)} · ${estimationPaymentStatusLabel(payment)}`;

  const summaryEl = card.querySelector(".concept-summary");
  if (summaryEl) summaryEl.textContent = summary;

  const badge = card.querySelector(".estimation-status-badge");
  if (badge) {
    badge.className = `estimation-status-badge ${payment.status}`;
    badge.textContent = estimationPaymentBadgeText(payment);
  }

  card.querySelectorAll(`[data-admin-est-toggle-label="${idx}"]`).forEach((btn) => {
    btn.textContent = expanded ? "Ocultar" : "Ver detalle";
  });
  card.querySelectorAll(`[data-admin-est-toggle="${idx}"]`).forEach((btn) => {
    btn.setAttribute("aria-expanded", String(expanded));
  });

  const prefix = "admin-est";
  const wrap = card.querySelector(`[data-admin-est-payment-wrap="${idx}"]`);
  const amountInput = wrap?.querySelector(`[data-admin-est-amount-paid="${idx}"]`);
  const isTypingAmount =
    options.preserveAmountInput ||
    (amountInput && document.activeElement === amountInput);

  if (wrap && isTypingAmount) {
    patchEstimationPaymentControlsInPlace(wrap, idx, payment, prefix);
  } else if (wrap) {
    wrap.outerHTML = estimationPaymentControlsHtml(est, idx, payment, prefix);
  }
}

function applyAdminEstPaymentLocal(idx, patch, options = {}) {
  const sorted = window.__pafAdminEstimationsSorted || [];
  const est = sorted[idx];
  if (!est) return;
  const total = estimationBreakdownFor(est.id).grandTotal || 0;
  Object.assign(est, applyEstimationPaymentToRecord(est, total, patch));
  syncAdminEstimationPaymentSection(idx, est, {
    expanded: options.expandOnPartial && patch.status === "partial" ? true : undefined,
  });
  renderAdminMetrics(cachedProjects);
  scheduleAdminPaymentPersist();
}

function adminEstimationCardHtml(est, idx) {
  const breakdown = estimationBreakdownFor(est.id);
  const total = breakdown.grandTotal || 0;
  const payment = getEstimationPayment(est, total);
  const lineCount = breakdown.lineCount || 0;
  const projectCount = breakdown.groups?.length || 0;
  const label = estimationDisplayLabel(est, idx);
  const projectsNote =
    projectCount > 1 ? ` · ${projectCount} proyectos` : "";
  const summary = `${label} · ${lineCount} partida(s)${projectsNote} · ${formatMoney(total)} · ${estimationPaymentStatusLabel(payment)}`;
  const statusClass =
    payment.status === "paid"
      ? "is-paid"
      : payment.status === "partial"
        ? "is-partial"
        : "";

  return `
    <div class="estimation-card concept-row is-collapsed ${statusClass}" data-admin-est-idx="${idx}" data-admin-est-id="${escapeAttr(est.id)}" data-estimation-id="${escapeAttr(est.id)}">
      <div class="concept-row-top estimation-card-head">
        ${estimationDragHandleHtml(est.id)}
        <button type="button" class="concept-toggle" data-admin-est-toggle="${idx}" aria-expanded="false">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">EST ${String(idx + 1).padStart(2, "0")}</span>
          <span class="concept-summary">${escapeHtml(summary)}</span>
        </button>
        <div class="estimation-head-actions">
          <span class="estimation-status-badge ${payment.status}">${estimationPaymentBadgeText(payment)}</span>
          <span class="estimation-total">${formatMoney(total)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-admin-est-toggle-label="${idx}">Ver detalle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-admin-est-download="${idx}">Descargar</button>
        </div>
      </div>
      <div class="concept-row-body estimation-detail">
        ${estimationPaymentControlsHtml(est, idx, payment, "admin-est")}
        ${est.notes ? `<p class="estimation-notes-readonly">${escapeHtml(est.notes)}</p>` : ""}
        <p class="admin-section-hint admin-estimation-meta">Fecha de estimación: ${formatDate(est.date)}</p>
        ${estimationLinesGroupedHtml(breakdown)}
      </div>
    </div>`;
}

function adminToggleEstimationCard(idx) {
  const card = document.querySelector(`[data-admin-est-idx="${idx}"]`);
  if (!card) return;
  const collapsed = card.classList.toggle("is-collapsed");
  const expanded = !collapsed;
  const toggle = card.querySelector("[data-admin-est-toggle]");
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  card.querySelectorAll(`[data-admin-est-toggle-label="${idx}"]`).forEach((btn) => {
    btn.textContent = expanded ? "Ocultar" : "Ver detalle";
  });
}

function bindAdminEstimationsList(sorted) {
  const listEl = document.getElementById("admin-estimations-list");
  if (!listEl) return;

  window.__pafAdminEstimationsSorted = sorted;

  if (listEl.dataset.adminPaymentBound === "1") return;
  listEl.dataset.adminPaymentBound = "1";

  listEl.addEventListener("click", (e) => {
    const payBtn = e.target.closest("[data-admin-est-pay-status]");
    if (payBtn) {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(payBtn.dataset.adminEstPayStatus);
      const status = payBtn.dataset.status;
      if (status === "partial") {
        applyAdminEstPaymentLocal(
          idx,
          {
            status: "partial",
            amountPaid:
              window.__pafAdminEstimationsSorted[idx]?.amountPaid || 0,
          },
          { expandOnPartial: true }
        );
        requestAnimationFrame(() => {
          document.querySelector(`[data-admin-est-amount-paid="${idx}"]`)?.focus();
        });
      } else {
        applyAdminEstPaymentLocal(idx, { status });
      }
      return;
    }

    const toggleBtn = e.target.closest("[data-admin-est-toggle]");
    if (toggleBtn) {
      adminToggleEstimationCard(Number(toggleBtn.dataset.adminEstToggle));
      return;
    }

    const toggleLabel = e.target.closest("[data-admin-est-toggle-label]");
    if (toggleLabel) {
      adminToggleEstimationCard(Number(toggleLabel.dataset.adminEstToggleLabel));
      return;
    }

    const dlBtn = e.target.closest("[data-admin-est-download]");
    if (dlBtn) {
      e.stopPropagation();
      const idx = Number(dlBtn.dataset.adminEstDownload);
      const est = window.__pafAdminEstimationsSorted[idx];
      if (!est) return;
      syncAdminEstimationProjects(cachedProjects);
      refreshEstimationBreakdowns(window.__pafAdminEstimationsSorted);
      downloadEstimation(est, "Administración");
    }
  });

  listEl.addEventListener("input", (e) => {
    const input = e.target.closest("[data-admin-est-amount-paid]");
    if (!input) return;
    const idx = Number(input.dataset.adminEstAmountPaid);
    const est = window.__pafAdminEstimationsSorted[idx];
    if (!est) return;
    const total = estimationBreakdownFor(est.id).grandTotal || 0;
    const raw = input.value.trim();
    const amountPaid =
      raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));
    Object.assign(
      est,
      applyEstimationPaymentToRecord(est, total, {
        status: "partial",
        amountPaid,
      })
    );
    syncAdminEstimationPaymentSection(idx, est, { preserveAmountInput: true });
    renderAdminMetrics(cachedProjects);
    scheduleAdminPaymentPersist();
  });
}

function renderAdminEstimationsList(projects) {
  const listEl = document.getElementById("admin-estimations-list");
  if (!listEl) return;

  syncAdminEstimationProjects(projects);
  const list = mergeEstimationsFromConcepts(
    cachedGlobalEstimations,
    (projects || []).flatMap((p) => p.concepts || [])
  );
  refreshEstimationBreakdowns(list);

  if (!list.length) {
    listEl.innerHTML =
      '<p class="admin-empty">Sin estimaciones. Usa + Estimación o registra avances en un proyecto.</p>';
    return;
  }

  const sorted = sortEstimationsList(list);

  listEl.innerHTML = sorted
    .map((est, idx) => adminEstimationCardHtml(est, idx))
    .join("");
  window.__pafAdminEstimationsSorted = sorted;
  bindAdminEstimationsList(sorted);
  bindAdminEstimationsDnD(listEl);
}

async function applyAdminEstimationReorder(sourceId, targetId, placement) {
  const sorted = window.__pafAdminEstimationsSorted || [];
  const reordered = assignEstimationSortOrders(
    reorderEstimationsInList(sorted, sourceId, targetId, placement)
  );
  try {
    await persistEstimationsToGlobal(
      reordered.map(estimationRecordForPersist)
    );
    window.__pafAdminEstimationsSorted = sortEstimationsList(reordered);
    renderAdminEstimationsList(cachedProjects);
  } catch (ex) {
    alert(ex.message || "No se pudo guardar el orden de estimaciones");
  }
}

function bindAdminEstimationsDnD(listEl) {
  bindEstimationListDnD(listEl, {
    onReorder: applyAdminEstimationReorder,
  });
}

async function refreshDashboard() {
  const [{ settings: settingsRes }, { projects }] = await Promise.all([
    api("/admin/settings"),
    api("/projects"),
  ]);
  projectOrder = settingsRes?.projectOrder || projectOrder;
  projectFolders = Array.isArray(settingsRes?.projectFolders)
    ? settingsRes.projectFolders.map((f) => ({
        id: f.id,
        name: f.name,
        collapsed: !!f.collapsed,
        projectIds: [...(f.projectIds || [])],
      }))
    : projectFolders;
  cachedProjects = projects;
  syncGlobalEstimationsFromProjects(projects);
  if (!projectOrder.length) {
    projectOrder = projects.map((p) => p.id);
  }
  fillProjectSelects();
  renderAdminMetrics(projects);
  await loadProjects(projects);
  renderAdminEstimationsList(projects);
}

function actionButtonHtml(action, projectId, label) {
  const icon = ADMIN_ACTION_ICONS[action] || "";
  const editClass = action === "edit" ? " admin-action-wrap--edit" : "";
  const feedbackA11y =
    action === "edit"
      ? ' role="presentation" aria-hidden="true"'
      : ' role="status" aria-live="polite"';
  return `
    <span class="admin-action-wrap admin-action-wrap--slot${editClass}" data-action-wrap="${escapeAttr(action)}-${escapeAttr(projectId)}">
      <button type="button" class="btn btn-ghost btn-sm admin-icon-btn" data-${action}="${escapeAttr(projectId)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${icon}</button>
      <span class="admin-action-feedback admin-action-feedback--slot"${feedbackA11y}>
        <span class="admin-action-progress" aria-hidden="true">
          <span class="admin-action-progress-fill"></span>
        </span>
        <span class="admin-action-label"></span>
      </span>
    </span>`;
}

function moveFolderButtonHtml(projectId) {
  return `
    <span class="admin-action-wrap admin-action-wrap--slot admin-move-folder-wrap" data-action-wrap="move-${escapeAttr(projectId)}">
      <span class="admin-move-folder-head">
        <button
          type="button"
          class="btn btn-ghost btn-sm admin-icon-btn admin-move-folder-trigger"
          data-move-trigger="${escapeAttr(projectId)}"
          title="Mover a carpeta"
          aria-label="Mover a carpeta"
          aria-haspopup="menu"
          aria-expanded="false"
        >${ADMIN_ACTION_ICONS.folderMove}</button>
        <div class="admin-move-folder-menu" hidden role="menu">
          ${projectFolders
            .map(
              (f) =>
                `<button type="button" class="admin-move-folder-option" role="menuitem" data-move-project="${escapeAttr(projectId)}" data-move-folder="${escapeAttr(f.id)}">${escapeHtml(f.name)}</button>`
            )
            .join("")}
        </div>
      </span>
      <span class="admin-action-feedback admin-action-feedback--slot" role="status" aria-live="polite">
        <span class="admin-action-progress" aria-hidden="true">
          <span class="admin-action-progress-fill"></span>
        </span>
        <span class="admin-action-label"></span>
      </span>
    </span>`;
}

function closeAllMoveFolderMenus() {
  document.querySelectorAll(".admin-move-folder-wrap").forEach((wrap) => {
    const menu = wrap.querySelector(".admin-move-folder-menu");
    const btn = wrap.querySelector(".admin-move-folder-trigger");
    if (menu) menu.hidden = true;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-active");
    }
  });
}

function bindMoveFolderMenus(list) {
  list.querySelectorAll(".admin-move-folder-trigger").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wrap = btn.closest(".admin-move-folder-wrap");
      const menu = wrap?.querySelector(".admin-move-folder-menu");
      if (!menu) return;
      const wasOpen = !menu.hidden;
      closeAllMoveFolderMenus();
      if (!wasOpen) {
        menu.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        btn.classList.add("is-active");
      }
    });
  });

  list.querySelectorAll(".admin-move-folder-option").forEach((opt) => {
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();
      const projectId = opt.dataset.moveProject;
      const folderId = opt.dataset.moveFolder;
      const trigger = opt
        .closest(".admin-move-folder-wrap")
        ?.querySelector(".admin-move-folder-trigger");
      closeAllMoveFolderMenus();
      await moveProjectToFolder(projectId, folderId, trigger);
    });
  });

  if (!moveFolderDocBound) {
    moveFolderDocBound = true;
    document.addEventListener("click", closeAllMoveFolderMenus);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllMoveFolderMenus();
    });
  }
}

function setEditHighlight(projectId) {
  document.querySelectorAll(".admin-action-wrap--edit").forEach((wrap) => {
    const active = wrap.dataset.actionWrap === `edit-${projectId}`;
    wrap.classList.toggle("is-editing", active);
    const feedback = wrap.querySelector(".admin-action-feedback");
    if (!feedback) return;
    feedback.classList.remove("is-loading", "is-success", "is-error");
    feedback.classList.toggle("is-active", active);
    const label = wrap.querySelector(".admin-action-label");
    if (label) label.textContent = "";
  });
}

function clearEditHighlight() {
  document.querySelectorAll(".admin-action-wrap--edit").forEach((wrap) => {
    wrap.classList.remove("is-editing");
    const feedback = wrap.querySelector(".admin-action-feedback");
    feedback?.classList.remove("is-active", "is-loading", "is-success", "is-error");
    const label = wrap.querySelector(".admin-action-label");
    if (label) label.textContent = "";
  });
}

function setActionFeedback(btn, { state, message = "" }) {
  const wrap = btn?.closest(".admin-action-wrap");
  const feedback = wrap?.querySelector(".admin-action-feedback");
  const label = wrap?.querySelector(".admin-action-label");
  if (!wrap || !feedback) return;

  const key = wrap.dataset.actionWrap || "";
  const existing = actionFeedbackTimers.get(key);
  if (existing) clearTimeout(existing);

  feedback.classList.remove("is-loading", "is-success", "is-error", "is-active");
  if (state === "loading") feedback.classList.add("is-loading");
  if (state === "success") feedback.classList.add("is-success");
  if (state === "error") feedback.classList.add("is-error");
  if (label) label.textContent = "";
  if (message) feedback.setAttribute("aria-label", message);
  else feedback.removeAttribute("aria-label");
}

function hideActionFeedback(btn, delayMs = 1500) {
  const wrap = btn?.closest(".admin-action-wrap");
  if (!wrap) return;
  const key = wrap.dataset.actionWrap || "";
  const feedback = wrap.querySelector(".admin-action-feedback");

  const timer = setTimeout(() => {
    feedback?.classList.remove("is-loading", "is-success", "is-error");
    feedback?.removeAttribute("aria-label");
    actionFeedbackTimers.delete(key);
  }, delayMs);
  actionFeedbackTimers.set(key, timer);
}

async function duplicateProject(id) {
  const btn = document.querySelector(
    `[data-duplicate="${CSS.escape(id)}"]`
  );
  if (btn?.disabled) return;

  if (btn) btn.disabled = true;
  setActionFeedback(btn, { state: "loading", message: "Duplicando…" });

  try {
    await api(`/projects/${id}/duplicate`, { method: "POST" });
    setActionFeedback(btn, { state: "success", message: "Duplicado" });
    await refreshDashboard();
    hideActionFeedback(btn, 1400);
  } catch (ex) {
    setActionFeedback(btn, {
      state: "error",
      message: ex.message || "No se pudo duplicar",
    });
    hideActionFeedback(btn, 2800);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function usesFolderLayout() {
  return projectFolders.length > 0;
}

function getUngroupedProjectIds() {
  const inFolder = new Set(projectFolders.flatMap((f) => f.projectIds));
  return projectOrder.filter((id) => !inFolder.has(id));
}

function deriveFlatProjectOrder(ungroupedIds) {
  return [...projectFolders.flatMap((f) => f.projectIds), ...ungroupedIds];
}

function findProjectLocation(projectId) {
  for (const folder of projectFolders) {
    const index = folder.projectIds.indexOf(projectId);
    if (index >= 0) return { kind: "folder", folderId: folder.id, index };
  }
  const ungrouped = getUngroupedProjectIds();
  const index = ungrouped.indexOf(projectId);
  if (index >= 0) return { kind: "ungrouped", index };
  return null;
}

function removeProjectFromLayoutState(projectId) {
  for (const folder of projectFolders) {
    folder.projectIds = folder.projectIds.filter((id) => id !== projectId);
  }
}

function syncProjectOrderFromLayout() {
  projectOrder = deriveFlatProjectOrder(getUngroupedProjectIds());
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
    projectFolders = Array.isArray(settings?.projectFolders)
      ? settings.projectFolders.map((f) => ({
          id: f.id,
          name: f.name,
          collapsed: !!f.collapsed,
          projectIds: [...(f.projectIds || [])],
        }))
      : [];
  } catch {
    projectOrder = [];
    projectFolders = [];
  }
}

async function saveProjectLayout() {
  syncProjectOrderFromLayout();
  const { settings } = await api("/admin/settings", {
    method: "PUT",
    body: JSON.stringify({
      projectFolders,
      projectOrder,
    }),
  });
  projectOrder = settings?.projectOrder || projectOrder;
  projectFolders = Array.isArray(settings?.projectFolders)
    ? settings.projectFolders.map((f) => ({
        id: f.id,
        name: f.name,
        collapsed: !!f.collapsed,
        projectIds: [...(f.projectIds || [])],
      }))
    : projectFolders;
  cachedProjects = sortProjectsByOrder(cachedProjects, projectOrder);
}

async function saveProjectOrder(ids) {
  projectOrder = ids;
  await saveProjectLayout();
}

function bindFolderNameDialog() {
  const backdrop = document.getElementById("admin-folder-dialog-backdrop");
  const form = document.getElementById("admin-folder-dialog-form");
  const input = document.getElementById("admin-folder-dialog-input");
  const errEl = document.getElementById("admin-folder-dialog-error");
  const cancelBtn = document.getElementById("admin-folder-dialog-cancel");
  const closeBtn = document.getElementById("admin-folder-dialog-close");
  if (!backdrop || !form || !input || form.dataset.bound) return;
  form.dataset.bound = "1";

  const closeDialog = (value = null) => {
    backdrop.classList.remove("is-visible");
    backdrop.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      backdrop.hidden = true;
    }, 320);
    if (errEl) errEl.textContent = "";
    if (folderDialogResolve) {
      const resolve = folderDialogResolve;
      folderDialogResolve = null;
      resolve(value);
    }
  };

  cancelBtn?.addEventListener("click", () => closeDialog(null));
  closeBtn?.addEventListener("click", () => closeDialog(null));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeDialog(null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden && folderDialogResolve) {
      closeDialog(null);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const trimmed = input.value.trim();
    if (!trimmed) {
      if (errEl) errEl.textContent = "Escribe un nombre para la carpeta.";
      return;
    }
    closeDialog(trimmed);
  });
}

function openFolderNameDialog({ title, value = "" }) {
  const backdrop = document.getElementById("admin-folder-dialog-backdrop");
  const titleEl = document.getElementById("admin-folder-dialog-title");
  const input = document.getElementById("admin-folder-dialog-input");
  const errEl = document.getElementById("admin-folder-dialog-error");
  if (!backdrop || !input) return Promise.resolve(null);

  if (titleEl) titleEl.textContent = title;
  input.value = value;
  if (errEl) errEl.textContent = "";

  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    backdrop.classList.add("is-visible");
    input.focus();
    input.select();
  });

  return new Promise((resolve) => {
    folderDialogResolve = resolve;
  });
}

async function createProjectFolder() {
  const name = await openFolderNameDialog({
    title: "Nueva carpeta",
    value: "Nueva carpeta",
  });
  if (name === null) return;
  projectFolders.push({
    id: newQuickId("folder"),
    name,
    collapsed: false,
    projectIds: [],
  });
  try {
    await saveProjectLayout();
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo crear la carpeta");
  }
}

async function renameProjectFolder(folderId) {
  const folder = projectFolders.find((f) => f.id === folderId);
  if (!folder) return;
  const name = await openFolderNameDialog({
    title: "Renombrar carpeta",
    value: folder.name,
  });
  if (name === null) return;
  folder.name = name;
  try {
    await saveProjectLayout();
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo renombrar la carpeta");
  }
}

async function toggleProjectFolder(folderId) {
  const folder = projectFolders.find((f) => f.id === folderId);
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  try {
    await saveProjectLayout();
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo actualizar la carpeta");
  }
}

async function deleteProjectFolder(folderId) {
  const folder = projectFolders.find((f) => f.id === folderId);
  if (!folder) return;
  const ok = confirm(
    `¿Eliminar la carpeta «${folder.name}»?\nLos proyectos permanecerán en la lista, sin carpeta.`
  );
  if (!ok) return;
  projectFolders = projectFolders.filter((f) => f.id !== folderId);
  try {
    await saveProjectLayout();
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo eliminar la carpeta");
  }
}

async function moveProjectToFolder(projectId, folderId, triggerBtn) {
  const btn =
    triggerBtn ||
    document.querySelector(`[data-move-trigger="${CSS.escape(projectId)}"]`);

  removeProjectFromLayoutState(projectId);
  const folder = projectFolders.find((f) => f.id === folderId);
  if (folder && !folder.projectIds.includes(projectId)) {
    folder.projectIds.push(projectId);
  }

  if (btn) {
    btn.disabled = true;
    setActionFeedback(btn, { state: "loading", message: "Moviendo…" });
  }

  try {
    await saveProjectLayout();
    if (btn) {
      setActionFeedback(btn, { state: "success", message: "Movido" });
      hideActionFeedback(btn, 1400);
    }
    loadProjects();
  } catch (ex) {
    if (btn) {
      setActionFeedback(btn, {
        state: "error",
        message: ex.message || "No se pudo mover",
      });
      hideActionFeedback(btn, 2800);
    } else {
      alert(ex.message || "No se pudo mover el proyecto");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function buildFolderSections(projects) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const sections = [];

  for (const folder of projectFolders) {
    const items = folder.projectIds
      .map((id) => byId.get(id))
      .filter(Boolean);
    sections.push({ type: "folder", folder, projects: items });
  }

  const ungrouped = getUngroupedProjectIds()
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (ungrouped.length) {
    sections.push({ type: "ungrouped", projects: ungrouped });
  }

  return sections;
}

function renderProjectListItem(p, canReorder) {
  const client = clients.find((c) => c.id === p.clientId);
  const clientName = client ? client.name : "Sin asignar";
  const n = (p.concepts && p.concepts.length) || 0;
  const dragHandle = canReorder
    ? `<button type="button" class="admin-drag-handle" draggable="true" data-drag-project="${escapeAttr(p.id)}" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar">⋮⋮</button>`
    : "";
  const projectUrl = `/project.html?id=${encodeURIComponent(p.id)}`;
  const folderOptions =
    canReorder && usesFolderLayout() ? moveFolderButtonHtml(p.id) : "";
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
        ${folderOptions}
        <div class="admin-action-group">
          ${actionButtonHtml("duplicate", p.id, "Duplicar")}
          ${actionButtonHtml("edit", p.id, "Editar")}
          ${actionButtonHtml("delete", p.id, "Eliminar")}
        </div>
      </div>
    </div>`;
}

function renderFolderHead(folder, count, canReorder) {
  const dragHandle = canReorder
    ? `<button type="button" class="admin-folder-drag" draggable="true" data-drag-folder="${escapeAttr(folder.id)}" aria-label="Arrastrar carpeta" title="Arrastrar carpeta">⋮⋮</button>`
    : "";
  return `
    <div class="admin-folder-head" data-folder-id="${escapeAttr(folder.id)}">
      ${dragHandle}
      <button
        type="button"
        class="admin-folder-toggle-area"
        data-toggle-folder="${escapeAttr(folder.id)}"
        aria-expanded="${folder.collapsed ? "false" : "true"}"
        aria-label="${folder.collapsed ? "Expandir" : "Colapsar"} carpeta ${escapeAttr(folder.name)}"
      >
        <span class="admin-folder-chevron" aria-hidden="true"></span>
        <span class="admin-folder-name">${escapeHtml(folder.name)}</span>
      </button>
      <div class="admin-folder-meta">
        <span class="admin-folder-count">${count} proyecto${count === 1 ? "" : "s"}</span>
        <button type="button" class="admin-folder-rename btn btn-ghost btn-sm" data-rename-folder="${escapeAttr(folder.id)}">Rename</button>
        <button type="button" class="admin-folder-delete btn btn-ghost btn-sm" data-delete-folder="${escapeAttr(folder.id)}" aria-label="Eliminar carpeta ${escapeAttr(folder.name)}" title="Eliminar carpeta">×</button>
      </div>
    </div>`;
}

function bindProjectListActions(list) {
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
  list.querySelectorAll("[data-toggle-folder]").forEach((btn) => {
    btn.addEventListener("click", () => toggleProjectFolder(btn.dataset.toggleFolder));
  });
  list.querySelectorAll("[data-rename-folder]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameProjectFolder(btn.dataset.renameFolder);
    });
  });
  list.querySelectorAll("[data-delete-folder]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProjectFolder(btn.dataset.deleteFolder);
    });
  });
  list.querySelectorAll(".admin-folder-drag").forEach((btn) => {
    btn.addEventListener("click", (e) => e.stopPropagation());
  });
  bindMoveFolderMenus(list);
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
  if (hint) {
    hint.hidden = !!q;
    if (!hint.hidden) {
      hint.textContent = usesFolderLayout()
        ? "Arrastra ⋮⋮ para reordenar. Suelta un proyecto sobre una carpeta para moverlo."
        : "Arrastra ⋮⋮ para reordenar la lista. Usa + Carpeta para agrupar proyectos.";
    }
  }
}

function bindProjectSearch() {
  const input = document.getElementById("admin-project-search");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    projectSearchQuery = input.value;
    loadProjects();
  });

  const addFolderBtn = document.getElementById("admin-add-folder");
  if (addFolderBtn && !addFolderBtn.dataset.bound) {
    addFolderBtn.dataset.bound = "1";
    addFolderBtn.addEventListener("click", () => createProjectFolder());
  }
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

function clearFolderDropTargets(listEl) {
  listEl
    .querySelectorAll(".admin-folder-head.is-drop-target")
    .forEach((el) => el.classList.remove("is-drop-target"));
}

function bindProjectListDnD(listEl) {
  if (!listEl || projectSearchQuery.trim()) return;

  listEl.querySelectorAll(".admin-drag-handle").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      dragProjectId = handle.dataset.dragProject;
      dragFolderId = null;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragProjectId);
      handle.closest(".admin-list-item")?.classList.add("is-dragging");
      listEl.classList.add("is-dnd-active");
    });
    handle.addEventListener("dragend", () => {
      dragProjectId = null;
      listEl.classList.remove("is-dnd-active");
      clearDropIndicators(listEl);
      clearFolderDropTargets(listEl);
      listEl
        .querySelectorAll(".admin-list-item")
        .forEach((el) =>
          el.classList.remove("is-dragging", "drop-before", "drop-after")
        );
    });
  });

  listEl.querySelectorAll(".admin-folder-drag").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      dragFolderId = handle.dataset.dragFolder;
      dragProjectId = null;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragFolderId);
      handle.closest(".admin-folder-head")?.classList.add("is-dragging");
      listEl.classList.add("is-dnd-active");
    });
    handle.addEventListener("dragend", () => {
      dragFolderId = null;
      listEl.classList.remove("is-dnd-active");
      clearDropIndicators(listEl);
      clearFolderDropTargets(listEl);
      listEl
        .querySelectorAll(".admin-folder-head")
        .forEach((el) => el.classList.remove("is-dragging", "drop-before", "drop-after"));
    });
  });

  listEl.addEventListener("dragover", (e) => {
    if (!dragProjectId && !dragFolderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (dragFolderId) {
      const head = e.target.closest(".admin-folder-head");
      clearFolderDropTargets(listEl);
      clearDropIndicators(listEl);
      if (head && head.dataset.folderId !== dragFolderId) {
        head.classList.add(
          placementFromPointer(head, e.clientY) === "before"
            ? "drop-before"
            : "drop-after"
        );
      }
      return;
    }

    const row = e.target.closest(".admin-list-item");
    if (row) {
      clearFolderDropTargets(listEl);
      setDropIndicator(listEl, row, placementFromPointer(row, e.clientY));
      return;
    }

    const folderHead = e.target.closest(".admin-folder-head");
    if (folderHead && !folderHead.classList.contains("admin-folder-head--static")) {
      clearDropIndicators(listEl);
      clearFolderDropTargets(listEl);
      folderHead.classList.add("is-drop-target");
      return;
    }

    const folderBody = e.target.closest(".admin-folder-body");
    if (folderBody) {
      const items = [...folderBody.querySelectorAll(".admin-list-item")];
      const last = items[items.length - 1];
      clearFolderDropTargets(listEl);
      if (last) {
        setDropIndicator(listEl, last, "after");
      } else {
        const head = folderBody
          .closest(".admin-folder")
          ?.querySelector(".admin-folder-head:not(.admin-folder-head--static)");
        if (head) {
          clearDropIndicators(listEl);
          head.classList.add("is-drop-target");
        }
      }
      return;
    }

    clearFolderDropTargets(listEl);
    const items = [...listEl.querySelectorAll(".admin-list-item")];
    const last = items[items.length - 1];
    if (last) setDropIndicator(listEl, last, "after");
  });

  listEl.addEventListener("dragleave", (e) => {
    if (!listEl.contains(e.relatedTarget)) {
      clearDropIndicators(listEl);
      clearFolderDropTargets(listEl);
    }
  });

  listEl.addEventListener("drop", async (e) => {
    e.preventDefault();

    if (dragFolderId) {
      const head = e.target.closest(".admin-folder-head");
      clearDropIndicators(listEl);
      clearFolderDropTargets(listEl);
      if (!head) return;
      const targetId = head.dataset.folderId;
      if (!targetId || targetId === dragFolderId) return;
      const placement = placementFromPointer(head, e.clientY);
      await reorderFolder(dragFolderId, targetId, placement);
      return;
    }

    const row = e.target.closest(".admin-list-item");
    if (dragProjectId && row) {
      const targetId = row.dataset.projectId;
      const placement = placementFromPointer(row, e.clientY);
      if (targetId && dragProjectId !== targetId) {
        await reorderProjects(dragProjectId, targetId, placement);
      }
      return;
    }

    if (dragProjectId) {
      const folderSection = e.target.closest(".admin-folder[data-folder-section]");
      const folderId = folderSection?.dataset.folderSection;
      if (folderId) {
        await moveProjectToFolder(dragProjectId, folderId);
      }
    }
  });
}

async function reorderFolder(sourceFolderId, targetFolderId, placement) {
  const from = projectFolders.findIndex((f) => f.id === sourceFolderId);
  let insertAt = projectFolders.findIndex((f) => f.id === targetFolderId);
  if (from < 0 || insertAt < 0) return;

  if (placement === "after") insertAt += 1;
  if (from < insertAt) insertAt -= 1;
  if (from === insertAt) return;

  const [folder] = projectFolders.splice(from, 1);
  projectFolders.splice(insertAt, 0, folder);

  try {
    await saveProjectLayout();
    loadProjects();
  } catch (ex) {
    alert(ex.message || "No se pudo reordenar la carpeta");
  }
}

async function reorderProjects(sourceId, targetId, placement) {
  if (sourceId === targetId) return;

  if (!usesFolderLayout()) {
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
    return;
  }

  removeProjectFromLayoutState(sourceId);
  const targetLoc = findProjectLocation(targetId);
  if (!targetLoc) return;

  let insertAt = targetLoc.index;
  if (placement === "after") insertAt += 1;

  if (targetLoc.kind === "folder") {
    const folder = projectFolders.find((f) => f.id === targetLoc.folderId);
    if (folder) folder.projectIds.splice(insertAt, 0, sourceId);
  } else {
    const ungrouped = getUngroupedProjectIds();
    ungrouped.splice(insertAt, 0, sourceId);
    projectOrder = deriveFlatProjectOrder(ungrouped);
  }

  try {
    await saveProjectLayout();
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
  const showFolders = canReorder && usesFolderLayout();

  if (!display.length) {
    list.classList.remove("admin-list--reorderable", "admin-list--grouped");
    list.innerHTML = `<div class="admin-list-item admin-list-item--empty"><span>${
      total
        ? "Ningún proyecto coincide con la búsqueda"
        : "Sin proyectos"
    }</span></div>`;
    return;
  }

  list.classList.toggle("admin-list--reorderable", canReorder);
  list.classList.toggle("admin-list--grouped", showFolders);

  if (showFolders) {
    const sections = buildFolderSections(display);
    list.innerHTML = sections
      .map((section) => {
        if (section.type === "folder") {
          const { folder, projects: items } = section;
          const collapsed = folder.collapsed ? " is-collapsed" : "";
          return `
            <section class="admin-folder${collapsed}" data-folder-section="${escapeAttr(folder.id)}">
              ${renderFolderHead(folder, items.length, canReorder)}
              <div class="admin-folder-body${
                items.length ? "" : " admin-folder-body--empty"
              }">
                ${
                  items.length
                    ? items.map((p) => renderProjectListItem(p, canReorder)).join("")
                    : '<p class="admin-folder-empty">Arrastra proyectos aquí o usa «Mover a…»</p>'
                }
              </div>
            </section>`;
        }
        return `
          <section class="admin-folder admin-folder--ungrouped">
            <div class="admin-folder-head admin-folder-head--static">
              <span class="admin-folder-name admin-folder-name--label">Sin carpeta</span>
              <span class="admin-folder-count">${section.projects.length} proyecto${section.projects.length === 1 ? "" : "s"}</span>
            </div>
            <div class="admin-folder-body">
              ${section.projects.map((p) => renderProjectListItem(p, canReorder)).join("")}
            </div>
          </section>`;
      })
      .join("");
  } else {
    list.innerHTML = display
      .map((p) => renderProjectListItem(p, canReorder))
      .join("");
  }

  bindProjectListActions(list);
  if (canReorder) bindProjectListDnD(list);
}

async function updateProjectStatus(selectEl) {
  const id = selectEl.dataset.statusFor;
  const newStatus = selectEl.value;
  const previous = selectEl.dataset.lastStatus;
  const feedback = selectEl
    .closest(".admin-status-wrap")
    ?.querySelector(".admin-action-feedback");
  selectEl.disabled = true;
  feedback?.classList.add("is-loading");

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
    feedback?.classList.remove("is-loading");
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const err = document.getElementById("form-error");
  err.textContent = "";
  err.style.color = "";

  const completionDate = document.getElementById("completionDate").value;
  const quickFields = {
    name: document.getElementById("name").value.trim(),
    clientId: document.getElementById("clientId").value,
    completionDate,
    zone3dImage:
      document.getElementById("zone3dImage").value.trim() ||
      "/assets/zone-3d-placeholder.svg",
  };

  try {
    if (editingId) {
      await api(`/projects/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...quickFields,
          status: document.getElementById("status").value,
        }),
      });
    } else {
      const { project } = await api("/projects", {
        method: "POST",
        body: JSON.stringify({
          ...quickFields,
          status: statusForNewProject(
            completionDate,
            document.getElementById("status").value
          ),
          concepts: [],
          estimations: [],
          documents: [],
          indirectCosts: [],
        }),
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
  const btn = document.querySelector(`[data-edit="${CSS.escape(id)}"]`);
  clearEditHighlight();
  setActionFeedback(btn, { state: "loading", message: "Cargando…" });

  try {
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
    setEditHighlight(id);
  } catch (ex) {
    setActionFeedback(btn, {
      state: "error",
      message: ex.message || "No se pudo cargar",
    });
    hideActionFeedback(btn, 2800);
  }
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

  const btn = document.querySelector(`[data-delete="${CSS.escape(id)}"]`);
  if (btn?.disabled) return;

  if (btn) btn.disabled = true;
  setActionFeedback(btn, { state: "loading", message: "Eliminando…" });

  try {
    await api(`/projects/${id}`, { method: "DELETE" });
    if (editingId === id) {
      resetForm();
      closeQuickPanel();
    }
    setActionFeedback(btn, { state: "success", message: "Eliminado" });
    await refreshDashboard();
  } catch (ex) {
    setActionFeedback(btn, {
      state: "error",
      message: ex.message || "No se pudo eliminar",
    });
    hideActionFeedback(btn, 2800);
    if (btn) btn.disabled = false;
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
