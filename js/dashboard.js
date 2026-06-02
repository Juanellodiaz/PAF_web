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

function projectCardHtml(p) {
  return `
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
    </a>`;
}

function bindClientFolderToggles(root) {
  root.querySelectorAll("[data-toggle-folder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.closest(".client-folder");
      if (!section) return;
      const collapsed = section.classList.toggle("is-collapsed");
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  });
}

function renderClientProjectsLayout(container, layout, projects) {
  const sections = layout?.sections;
  const list = projects || [];

  if (!sections?.length) {
    container.className = "projects-grid";
    container.innerHTML = list.map(projectCardHtml).join("");
    return;
  }

  const hasFolders = sections.some((s) => s.type === "folder");
  if (!hasFolders && sections.length === 1 && sections[0].type === "ungrouped") {
    container.className = "projects-grid";
    container.innerHTML = sections[0].projects.map(projectCardHtml).join("");
    return;
  }

  container.className = "client-projects-layout";
  container.innerHTML = sections
    .map((section) => {
      if (section.type === "folder") {
        const count = section.projects.length;
        const collapsed = !!section.collapsed;
        return `
    <section class="client-folder${collapsed ? " is-collapsed" : ""}" data-folder-id="${escapeAttr(section.id)}">
      <header class="client-folder-head">
        <button
          type="button"
          class="client-folder-toggle"
          data-toggle-folder="${escapeAttr(section.id)}"
          aria-expanded="${collapsed ? "false" : "true"}"
        >
          <span class="client-folder-chevron" aria-hidden="true"></span>
          <span class="client-folder-name">${escapeHtml(section.name)}</span>
          <span class="client-folder-count">${count} proyecto${count === 1 ? "" : "s"}</span>
        </button>
      </header>
      <div class="projects-grid client-folder-body">
        ${section.projects.map(projectCardHtml).join("")}
      </div>
    </section>`;
      }
      const label =
        hasFolders && section.projects.length
          ? `<p class="panel-label client-folder-ungrouped-label">Otros proyectos</p>`
          : "";
      return `
    <section class="client-folder client-folder--ungrouped">
      ${label}
      <div class="projects-grid">
        ${section.projects.map(projectCardHtml).join("")}
      </div>
    </section>`;
    })
    .join("");

  bindClientFolderToggles(container);
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

  const { projects, layout } = await api("/projects");
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

  const layoutEl = document.getElementById("projects-layout");
  const empty = document.getElementById("empty-state");

  if (!projects.length) {
    empty.hidden = false;
    layoutEl.innerHTML = "";
    return;
  }

  empty.hidden = true;
  renderClientProjectsLayout(layoutEl, layout, projects);
})();
