let projectData = null;
let isAdmin = false;

(async () => {
  const user = await requireAuth();
  isAdmin = user.role === "admin";
  document.getElementById("logout-btn").addEventListener("click", logout);

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    window.location.href = isAdmin ? "/admin.html" : "/dashboard.html";
    return;
  }

  const backHref = isAdmin ? "/admin.html" : "/dashboard.html";
  document.querySelector(".portal-header a.logo").href = backHref;
  document.querySelector(".portal-header .portal-actions").innerHTML = `
    <a href="${backHref}" class="btn btn-ghost btn-sm">← ${isAdmin ? "Administración" : "Proyectos"}</a>
    ${isAdmin ? '<button type="button" class="btn btn-primary btn-sm" id="save-project-btn">Guardar cambios</button>' : ""}
    <button type="button" class="btn btn-ghost btn-sm" id="logout-btn">Salir</button>
  `;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const { project: p } = await api(`/projects/${id}`);
  projectData = p;

  if (isAdmin) {
    window.refreshProjectMetrics = refreshMetricsFromEditors;
    renderAdminView(p);
    bindEditorActions();
    document.getElementById("save-project-btn").addEventListener("click", saveProject);
  } else {
    renderClientView(p);
  }
})();

function refreshMetricsFromEditors() {
  syncConceptTotals();
  const totalM2 = editorConcepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const totalMoney = editorConcepts.reduce((s, c) => s + c.totalPrice, 0);
  const m2El = document.getElementById("metric-m2");
  const totalEl = document.getElementById("metric-total");
  if (m2El) m2El.textContent = totalM2;
  if (totalEl) totalEl.textContent = formatMoney(totalMoney);
}

function renderClientView(p) {
  const payload = projectPayload(p);
  document.getElementById("project-root").innerHTML = buildReadonlyHtml(payload);
}

function renderAdminView(p) {
  setEditorData(p.concepts, p.documents);
  const payload = projectPayload(p);

  document.getElementById("project-root").innerHTML = `
    <div class="project-hero">
      <p class="admin-badge">Modo administración</p>
      <h1>${escapeHtml(p.name)}</h1>
      <p class="portal-user">${statusLabel(p.status)} · Culminación ${formatDate(p.completionDate)} · edita conceptos y documentos abajo</p>
    </div>

    <div class="metrics-row" style="margin-bottom:2rem" id="metrics-row">
      ${metricsHtml(payload)}
    </div>

    <section class="admin-section project-edit-section">
      <div class="admin-section-head">
        <p class="admin-section-label">Conceptos a trabajar</p>
        <button type="button" class="btn btn-ghost btn-sm" id="add-concept">+ Concepto</button>
      </div>
      <div id="concepts-editor" class="concepts-editor"></div>
      <p class="concepts-total-preview" id="concepts-total-preview">Total: ${formatMoney(payload.conceptsTotal)} · ${payload.m2Total} m²</p>
    </section>

    <div class="dashboard-grid" style="margin-top:2rem">
      <div class="dashboard-panel">
        <p class="panel-label">Zona de trabajo — Vista 3D</p>
        <div class="zone-3d">
          <img src="${escapeAttr(p.zone3dImage)}" alt="Vista 3D" id="zone-3d-img">
        </div>
        <div class="form-group" style="margin-top:1rem">
          <label for="zone3dImage">URL imagen 3D</label>
          <input type="text" id="zone3dImage" value="${escapeAttr(p.zone3dImage || "")}">
        </div>
      </div>

      <div class="dashboard-panel">
        <div class="admin-section-head">
          <p class="panel-label" style="margin:0">Documentos y notificaciones</p>
          <button type="button" class="btn btn-ghost btn-sm" id="add-document">+ Documento</button>
        </div>
        <div id="documents-editor" class="documents-editor" style="margin-top:1rem"></div>
      </div>
    </div>

    <p class="form-error" id="save-error"></p>
  `;

  renderConceptsEditor();
  renderDocumentsEditor();
}

function metricsHtml(p) {
  return `
    <div class="metric-box">
      <span class="metric-value accent">${p.daysRemaining}</span>
      <span class="metric-label">Días restantes</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-m2">${p.m2Total}</span>
      <span class="metric-label">m² totales</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-total">${formatMoney(p.conceptsTotal)}</span>
      <span class="metric-label">Inversión total</span>
    </div>
  `;
}

function projectPayload(project) {
  const concepts = project.concepts || [];
  const completion = new Date(project.completionDate);
  const daysLeft = Math.max(
    0,
    Math.ceil((completion - new Date()) / (1000 * 60 * 60 * 24))
  );
  const conceptsTotal = concepts.reduce((s, c) => s + c.totalPrice, 0);
  const m2Total = concepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  return { ...project, daysRemaining: daysLeft, conceptsTotal, m2Total };
}

function buildReadonlyHtml(p) {
  return `
    <div class="project-hero">
      <h1>${escapeHtml(p.name)}</h1>
      <p class="portal-user">${statusLabel(p.status)} · Culminación ${formatDate(p.completionDate)}</p>
    </div>
    <div class="metrics-row" style="margin-bottom:2rem">${metricsHtml(p)}</div>
    <div class="dashboard-grid">
      <div class="dashboard-panel full">
        <p class="panel-label">Conceptos a trabajar</p>
        <table class="concepts-table">
          <thead>
            <tr><th>Concepto</th><th>m²</th><th>Precio unit.</th><th>Total</th><th>Estado</th></tr>
          </thead>
          <tbody>
            ${(p.concepts || [])
              .map(
                (c) => `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${c.m2}</td>
                <td>${formatMoney(c.unitPrice)}</td>
                <td>${formatMoney(c.totalPrice)}</td>
                <td><span class="concept-status ${c.status}">${statusLabel(c.status)}</span></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        ${!(p.concepts && p.concepts.length) ? '<p class="portal-user" style="margin-top:1rem">Sin conceptos registrados aún.</p>' : ""}
      </div>
      <div class="dashboard-panel">
        <p class="panel-label">Zona de trabajo — Vista 3D</p>
        <div class="zone-3d"><img src="${escapeAttr(p.zone3dImage)}" alt="Vista 3D"></div>
      </div>
      <div class="dashboard-panel">
        <p class="panel-label">Documentos y notificaciones</p>
        <div class="doc-list">${documentsReadonlyHtml(p.documents)}</div>
      </div>
    </div>
  `;
}

function documentsReadonlyHtml(docs) {
  if (!docs || !docs.length) {
    return '<p class="portal-user">Sin documentos por el momento.</p>';
  }
  return docs
    .map(
      (d) => `
    <div class="doc-item ${d.type === "notification" ? "notification" : ""}">
      <p class="doc-type">${d.type === "notification" ? "Notificación" : "Consideración"}</p>
      <h4>${escapeHtml(d.title)}</h4>
      <p>${escapeHtml(d.content)}</p>
    </div>`
    )
    .join("");
}

async function saveProject() {
  const err = document.getElementById("save-error");
  err.textContent = "";
  const zoneInput = document.getElementById("zone3dImage");

  const body = {
    ...projectData,
    zone3dImage:
      zoneInput?.value.trim() || projectData.zone3dImage,
    concepts: collectConcepts(),
    documents: collectDocuments(),
  };

  try {
    const { project } = await api(`/projects/${projectData.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    projectData = project;
    const payload = projectPayload(project);
    document.getElementById("metrics-row").innerHTML = metricsHtml(payload);
    const img = document.getElementById("zone-3d-img");
    if (img) img.src = project.zone3dImage;
    err.style.color = "var(--accent)";
    err.textContent = "Cambios guardados correctamente.";
    setTimeout(() => {
      err.textContent = "";
      err.style.color = "";
    }, 3000);
  } catch (ex) {
    err.textContent = ex.message;
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
