(async () => {
  const user = await requireAuth();
  if (!user || user.role === "admin") {
    window.location.href = "/admin.html";
    return;
  }

  document.getElementById("user-greeting").textContent = `Bienvenido, ${user.name}`;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const { projects } = await api("/projects");
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
            <span class="project-status ${p.status}">${statusLabel(p.status)}</span>
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
