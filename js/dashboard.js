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
