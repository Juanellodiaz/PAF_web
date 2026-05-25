let clients = [];
let editingId = null;
let cachedProjects = [];
let cachedGlobalEstimations = [];
let quickPanelMode = "project";
let advanceProjectCache = null;

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

async function loadGlobalEstimations() {
  try {
    const { estimations } = await api("/estimations/breakdowns");
    cachedGlobalEstimations = estimations || [];
  } catch {
    cachedGlobalEstimations = [];
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

  return {
    activeCount: active.length,
    activeMoney: sumConceptsTotal(active),
    approvalCount: inApproval.length,
    approvalMoney: sumConceptsTotal(inApproval),
    activeProgressPercent,
    activeDoneM2: doneM2,
    activeTotalM2: totalM2,
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
      ? `${summary.activeDoneM2} / ${summary.activeTotalM2} m²`
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
      ? "Editar datos del proyecto"
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

  const { users } = await api("/users");
  clients = users;
  document.getElementById("clientId").innerHTML =
    '<option value="">— Seleccionar —</option>' +
    users
      .map(
        (u) =>
          `<option value="${u.id}">${escapeHtml(u.name)} (${u.username})</option>`
      )
      .join("");

  bindQuickPanel();
  await loadGlobalEstimations();
  const { projects } = await api("/projects");
  cachedProjects = projects;
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
  const { projects } = await api("/projects");
  cachedProjects = projects;
  fillProjectSelects();
  await loadGlobalEstimations();
  renderAdminMetrics(projects);
  await loadProjects(projects);
}

async function loadProjects(projects = cachedProjects) {
  const list = document.getElementById("admin-projects");

  if (!projects.length) {
    list.innerHTML = '<div class="admin-list-item"><span>Sin proyectos</span></div>';
    return;
  }

  list.innerHTML = projects
    .map((p) => {
      const client = clients.find((c) => c.id === p.clientId);
      const clientName = client ? client.name : "Sin asignar";
      const n = (p.concepts && p.concepts.length) || 0;
      return `
      <div class="admin-list-item">
        <div class="admin-list-item-start">
          ${progressRingCardHtml(p)}
          <div class="admin-list-item-info">
            <strong>${escapeHtml(p.name)}</strong>
            <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${n} conceptos · ${formatProjectMoneyDisplay(p)}</span>
          </div>
        </div>
        <div class="portal-actions admin-list-actions">
          ${projectStatusSelectHtml(p.id, p.status)}
          <a href="/project.html?id=${encodeURIComponent(p.id)}" class="btn btn-primary btn-sm">Ver / Editar</a>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">Datos</button>
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
  list.querySelectorAll(".admin-status-select").forEach((sel) => {
    sel.addEventListener("change", () => updateProjectStatus(sel));
  });
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

  const body = {
    name: document.getElementById("name").value.trim(),
    clientId: document.getElementById("clientId").value,
    completionDate: document.getElementById("completionDate").value,
    status: document.getElementById("status").value,
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
      err.textContent = "Proyecto creado. Abre Ver / Editar para agregar conceptos.";
      setTimeout(() => {
        window.location.href = `/project.html?id=${encodeURIComponent(project.id)}`;
      }, 800);
      return;
    }
    resetForm();
    closeQuickPanel();
    await refreshDashboard();
    err.style.color = "var(--accent)";
    err.textContent = "Datos del proyecto actualizados.";
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
    editingId ? "Guardar datos" : "Crear proyecto";
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
}

function resetForm() {
  editingId = null;
  setSubmitLabel();
  document.getElementById("project-form").reset();
  document.getElementById("form-reset").hidden = true;
  document.getElementById("form-error").textContent = "";
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
