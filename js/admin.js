let clients = [];
let editingId = null;
let cachedProjects = [];

const formPanel = () => document.getElementById("project-form-panel");
const formBackdrop = () => document.getElementById("form-backdrop");
const newProjectToggle = () => document.getElementById("new-project-toggle");

function computeAdminDashboardSummary(projects, estimations) {
  const list = projects || [];
  const estList = estimations || [];

  const activeMoney = list
    .filter((p) => normalizeProjectStatus(p.status) !== "completado")
    .reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  window.__pafProjectsForEstimations = list;
  let totalPaid = calcTotalPaid(estList, list);
  let totalPending = calcTotalPending(estList, list);

  const estimationMoney = totalPaid + totalPending;
  if (activeMoney > 0 && estimationMoney < activeMoney) {
    totalPending = Math.max(0, activeMoney - totalPaid);
  }

  return { activeMoney, totalPaid, totalPending };
}

function adminSummaryHtml(summary) {
  return `
    <div class="metric-box">
      <span class="metric-value accent">${formatMoney(summary.activeMoney)}</span>
      <span class="metric-label">Proyectos activos</span>
      <span class="metric-sublabel">En aprobación y en proceso</span>
    </div>
    <div class="metric-box">
      <span class="metric-value accent">${formatMoney(summary.totalPaid)}</span>
      <span class="metric-label">Total pagado</span>
      <span class="metric-sublabel">Estimaciones pagadas</span>
    </div>
    <div class="metric-box">
      <span class="metric-value">${formatMoney(summary.totalPending)}</span>
      <span class="metric-label">Pendiente de pago</span>
      <span class="metric-sublabel">Estimaciones pendientes</span>
    </div>`;
}

function renderPaymentBar(summary) {
  const bar = document.getElementById("admin-payment-bar");
  const paidEl = document.getElementById("admin-bar-paid");
  const pendingEl = document.getElementById("admin-bar-pending");
  const total = summary.totalPaid + summary.totalPending;

  if (!total) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const paidPct = Math.round((summary.totalPaid / total) * 1000) / 10;
  const pendingPct = 100 - paidPct;
  paidEl.style.flex = `${paidPct} 1 0`;
  pendingEl.style.flex = `${pendingPct} 1 0`;
  paidEl.title = `Pagado: ${formatMoney(summary.totalPaid)} (${paidPct}%)`;
  pendingEl.title = `Pendiente: ${formatMoney(summary.totalPending)} (${pendingPct}%)`;
}

function renderAdminMetrics(projects, estimations) {
  const summary = computeAdminDashboardSummary(projects, estimations);
  document.getElementById("admin-metrics").innerHTML = adminSummaryHtml(summary);
  renderPaymentBar(summary);
}

async function loadEstimationsForAdmin(projects) {
  try {
    const { estimations, projects: allProjects } = await api(
      "/estimations/breakdowns"
    );
    window.__pafProjectsForEstimations = allProjects || projects;
    return estimations || [];
  } catch {
    window.__pafProjectsForEstimations = projects;
    return [];
  }
}

function openFormPanel() {
  const panel = formPanel();
  const backdrop = formBackdrop();
  const toggle = newProjectToggle();
  panel.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
  });
  toggle.setAttribute("aria-expanded", "true");
  toggle.classList.add("is-active");
}

function closeFormPanel() {
  const panel = formPanel();
  const backdrop = formBackdrop();
  const toggle = newProjectToggle();
  panel.classList.remove("is-open");
  backdrop.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.classList.remove("is-active");
  setTimeout(() => {
    panel.hidden = true;
    backdrop.hidden = true;
  }, 300);
}

function bindFormPanel() {
  document.getElementById("new-project-toggle").addEventListener("click", () => {
    if (formPanel().classList.contains("is-open")) {
      closeFormPanel();
      return;
    }
    resetForm();
    openFormPanel();
  });
  document.getElementById("form-close").addEventListener("click", () => {
    closeFormPanel();
    if (!editingId) resetForm();
  });
  formBackdrop().addEventListener("click", () => {
    closeFormPanel();
    if (!editingId) resetForm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && formPanel().classList.contains("is-open")) {
      closeFormPanel();
      if (!editingId) resetForm();
    }
  });
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

  bindFormPanel();
  const { projects } = await api("/projects");
  cachedProjects = projects;
  const estimations = await loadEstimationsForAdmin(projects);
  renderAdminMetrics(projects, estimations);
  await loadProjects(projects);

  document.getElementById("project-form").addEventListener("submit", onSubmit);
  document.getElementById("form-reset").addEventListener("click", () => {
    resetForm();
    closeFormPanel();
  });
})();

async function refreshDashboard() {
  const { projects } = await api("/projects");
  cachedProjects = projects;
  const estimations = await loadEstimationsForAdmin(projects);
  renderAdminMetrics(projects, estimations);
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
            <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${n} conceptos · ${formatMoney(p.conceptsTotal)}</span>
          </div>
        </div>
        <div class="portal-actions">
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
        }),
      });
    } else {
      const { project } = await api("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      resetForm();
      closeFormPanel();
      await refreshDashboard();
      err.style.color = "var(--accent)";
      err.textContent = "Proyecto creado. Abre Ver / Editar para agregar conceptos.";
      setTimeout(() => {
        window.location.href = `/project.html?id=${encodeURIComponent(project.id)}`;
      }, 800);
      return;
    }
    resetForm();
    closeFormPanel();
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
  document.getElementById("form-title").textContent = "Editar datos del proyecto";
  document.getElementById("name").value = p.name;
  document.getElementById("clientId").value = p.clientId || "";
  document.getElementById("completionDate").value = p.completionDate;
  document.getElementById("status").value = normalizeProjectStatus(p.status);
  document.getElementById("zone3dImage").value = p.zone3dImage || "";
  document.getElementById("form-reset").hidden = false;
  openFormPanel();
}

function resetForm() {
  editingId = null;
  setSubmitLabel();
  document.getElementById("form-title").textContent = "Nuevo proyecto";
  document.getElementById("project-form").reset();
  document.getElementById("form-reset").hidden = true;
  document.getElementById("form-error").textContent = "";
}

async function deleteProject(id) {
  if (!confirm("¿Eliminar este proyecto?")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  if (editingId === id) {
    resetForm();
    closeFormPanel();
  }
  await refreshDashboard();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
