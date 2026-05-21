function computeClientDashboardSummary(projects, estimations) {
  const list = projects || [];
  const estList = estimations || [];

  const activeMoney = list
    .filter((p) => normalizeProjectStatus(p.status) === "en_proceso")
    .reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  const pendingApprovalCount = list.filter(
    (p) => normalizeProjectStatus(p.status) === "en_aprobacion"
  ).length;

  const reviewMoney = list
    .filter((p) => normalizeProjectStatus(p.status) === "en_aprobacion")
    .reduce((s, p) => s + (Number(p.conceptsTotal) || 0), 0);

  window.__pafProjectsForEstimations = list;
  const totalPaid = calcTotalPaid(estList, list);
  const totalPending = calcTotalPending(estList, list);

  return {
    activeMoney,
    pendingApprovalCount,
    reviewMoney,
    totalPaid,
    totalPending,
  };
}

function clientSummaryHtml(summary) {
  return `
    <div class="metric-box">
      <span class="metric-value accent">${formatMoney(summary.activeMoney)}</span>
      <span class="metric-label">Proyectos activos</span>
      <span class="metric-sublabel">En proceso</span>
    </div>
    <div class="metric-box">
      <span class="metric-value">${summary.pendingApprovalCount}</span>
      <span class="metric-label">Por aprobar</span>
      <span class="metric-sublabel">Proyectos en aprobación</span>
    </div>
    <div class="metric-box">
      <span class="metric-value">${formatMoney(summary.reviewMoney)}</span>
      <span class="metric-label">En revisión</span>
      <span class="metric-sublabel">En aprobación</span>
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

function clientEstimationCardHtml(est, idx) {
  const breakdown = estimationBreakdownFor(est.id);
  const total = breakdown.grandTotal || 0;
  const lineCount = breakdown.lineCount || 0;
  const projectCount = breakdown.groups?.length || 0;
  const label = estimationDisplayLabel(est, idx);
  const paid = !!est.paid;
  const projectsNote =
    projectCount > 1 ? ` · ${projectCount} proyectos` : "";
  const summary = `${label} · ${lineCount} partida(s)${projectsNote} · ${formatMoney(total)} · ${paid ? "Pagada" : "Pendiente"}`;

  return `
    <div class="estimation-card concept-row is-collapsed" data-client-est-idx="${idx}">
      <div class="concept-row-top estimation-card-head">
        <button type="button" class="concept-toggle" aria-expanded="false" onclick="pafToggleClientEstimation(${idx})">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">EST ${String(idx + 1).padStart(2, "0")}</span>
          <span class="concept-summary">${escapeHtml(summary)}</span>
        </button>
        <div class="estimation-head-actions">
          <span class="estimation-status-badge ${paid ? "paid" : "pending"}">${paid ? "PAGADA" : "PENDIENTE DE PAGO"}</span>
          <span class="estimation-total">${formatMoney(total)}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="pafToggleClientEstimation(${idx})">Ver detalle</button>
          <button type="button" class="btn btn-ghost btn-sm" data-client-download-est="${idx}">Descargar</button>
        </div>
      </div>
      <div class="concept-row-body estimation-detail">
        ${est.notes ? `<p class="estimation-notes-readonly">${escapeHtml(est.notes)}</p>` : ""}
        ${estimationLinesGroupedHtml(breakdown)}
      </div>
    </div>`;
}

function renderClientEstimations(estimations, clientName) {
  const section = document.getElementById("client-estimations-section");
  const listEl = document.getElementById("client-estimations-list");
  const list = mergeEstimationsFromConcepts(estimations || [], []);
  refreshEstimationBreakdowns(list);

  if (!list.length) {
    section.hidden = true;
    return;
  }

  const sorted = [...list].sort((a, b) => {
    if (!!a.paid !== !!b.paid) return a.paid ? 1 : -1;
    return (b.date || "").localeCompare(a.date || "");
  });

  section.hidden = false;
  listEl.innerHTML = sorted
    .map((est, idx) => clientEstimationCardHtml(est, idx))
    .join("");

  listEl.querySelectorAll("[data-client-download-est]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.clientDownloadEst);
      const est = sorted[idx];
      if (est) {
        refreshEstimationBreakdowns(sorted);
        downloadEstimation(est, clientName);
      }
    });
  });

  window.__pafClientEstimationsSorted = sorted;
}

window.pafToggleClientEstimation = function (idx) {
  const card = document.querySelector(`[data-client-est-idx="${idx}"]`);
  if (!card) return;
  const collapsed = card.classList.toggle("is-collapsed");
  const expanded = !collapsed;
  const toggle = card.querySelector(".concept-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  card.querySelectorAll(".estimation-head-actions .btn-ghost").forEach((btn) => {
    if (!btn.hasAttribute("data-client-download-est")) {
      btn.textContent = expanded ? "Ocultar" : "Ver detalle";
    }
  });
};

async function loadClientEstimationContext(projects) {
  try {
    const { estimations, breakdowns, projects: allProjects } = await api(
      "/estimations/breakdowns"
    );
    window.__pafProjectsForEstimations = allProjects || projects;
    window.__pafEstimationBreakdowns = breakdowns || {};
    return estimations || [];
  } catch {
    window.__pafProjectsForEstimations = projects;
    const estimations = projects[0]?.estimations || [];
    refreshEstimationBreakdowns(estimations);
    return estimations;
  }
}

(async () => {
  const user = await requireAuth();
  if (!user || user.role === "admin") {
    window.location.href = "/admin.html";
    return;
  }

  document.getElementById("user-greeting").textContent = `Bienvenido, ${user.name}`;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const { projects } = await api("/projects");
  const estimations = await loadClientEstimationContext(projects);
  const summary = computeClientDashboardSummary(projects, estimations);

  document.getElementById("client-summary").innerHTML = clientSummaryHtml(summary);
  renderClientEstimations(estimations, user.name || "");

  const grid = document.getElementById("projects-grid");
  const empty = document.getElementById("empty-state");

  if (!projects.length) {
    empty.hidden = false;
    return;
  }

  grid.innerHTML = projects
    .map(
      (p) => `
    <a href="/project.html?id=${encodeURIComponent(p.id)}" class="project-card">
      <div class="project-card-layout">
        ${progressRingCardHtml(p)}
        <div class="project-card-body">
          <h3>${escapeHtml(p.name)}</h3>
          <div class="project-card-meta">
            <span class="project-status ${normalizeProjectStatus(p.status)}">${statusLabel(p.status)}</span>
            <span>${p.daysRemaining} días restantes</span>
            <span>${formatMoney(p.conceptsTotal)}</span>
          </div>
        </div>
      </div>
    </a>
  `
    )
    .join("");
})();

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
