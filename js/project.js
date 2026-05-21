(async () => {
  const user = await requireAuth();
  document.getElementById("logout-btn").addEventListener("click", logout);

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    window.location.href = user.role === "admin" ? "/admin.html" : "/dashboard.html";
    return;
  }

  const { project: p } = await api(`/projects/${id}`);
  const root = document.getElementById("project-root");
  const backHref = user.role === "admin" ? "/admin.html" : "/dashboard.html";
  document.querySelector('.portal-header a.logo').href = backHref;

  root.innerHTML = `
    <div class="project-hero">
      <h1>${escapeHtml(p.name)}</h1>
      <p class="portal-user">${statusLabel(p.status)} · Culminación ${formatDate(p.completionDate)}</p>
    </div>

    <div class="metrics-row" style="margin-bottom:2rem">
      <div class="metric-box">
        <span class="metric-value accent">${p.daysRemaining}</span>
        <span class="metric-label">Días restantes</span>
      </div>
      <div class="metric-box">
        <span class="metric-value">${p.m2Total}</span>
        <span class="metric-label">m² totales</span>
      </div>
      <div class="metric-box">
        <span class="metric-value">${formatMoney(p.conceptsTotal)}</span>
        <span class="metric-label">Inversión total</span>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="dashboard-panel full">
        <p class="panel-label">Conceptos a trabajar</p>
        <table class="concepts-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>m²</th>
              <th>Precio unit.</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${p.concepts
              .map(
                (c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${c.m2}</td>
                <td>${formatMoney(c.unitPrice)}</td>
                <td>${formatMoney(c.totalPrice)}</td>
                <td><span class="concept-status ${c.status}">${statusLabel(c.status)}</span></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="dashboard-panel">
        <p class="panel-label">Zona de trabajo — Vista 3D</p>
        <div class="zone-3d">
          <img src="${escapeHtml(p.zone3dImage)}" alt="Vista 3D de la zona">
        </div>
      </div>

      <div class="dashboard-panel">
        <p class="panel-label">Documentos y notificaciones</p>
        <div class="doc-list">
          ${
            p.documents.length
              ? p.documents
                  .map(
                    (d) => `
            <div class="doc-item ${d.type === "notification" ? "notification" : ""}">
              <p class="doc-type">${d.type === "notification" ? "Notificación" : "Consideración"}</p>
              <h4>${escapeHtml(d.title)}</h4>
              <p>${escapeHtml(d.content)}</p>
            </div>
          `
                  )
                  .join("")
              : '<p class="portal-user">Sin documentos por el momento.</p>'
          }
        </div>
      </div>
    </div>
  `;
})();

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
