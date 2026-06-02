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
    const { estimations, projects: allProjects } = await api(
      "/estimations/breakdowns"
    );
    window.__pafProjectsForEstimations = allProjects || projects;
    window.__pafEstimationBreakdowns = {};
    return estimations || [];
  } catch {
    window.__pafProjectsForEstimations = projects;
    window.__pafEstimationBreakdowns = {};
    return projects[0]?.estimations || [];
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
  const summary = computeDashboardSummary(projects, estimations);

  document.getElementById("client-summary").innerHTML = clientSummaryHtml(summary);

  const section = document.getElementById("client-estimations-section");
  const listEl = document.getElementById("client-estimations-list");
  if (estimations.length) {
    section.hidden = false;
    renderClientEstimationsList(listEl, estimations, user.name || "");
  } else {
    section.hidden = true;
  }

  const grid = document.getElementById("projects-grid");
  const empty = document.getElementById("empty-state");

  if (!projects.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
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
            <span>${formatProjectMoneyDisplay(p)}</span>
          </div>
        </div>
      </div>
    </a>
  `
    )
    .join("");
})();
