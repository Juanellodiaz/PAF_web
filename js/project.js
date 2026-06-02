let projectData = null;
let isAdmin = false;
let clientDisplayName = "";
let savedProjectSnapshot = null;
let projectDirtyFlag = false;

function normalizeEstimationForSnapshot(e) {
  return {
    id: e.id,
    label: (e.label || "").trim(),
    date: e.date || "",
    paid: !!e.paid,
    paidAt: e.paid ? e.paidAt || null : null,
    notes: (e.notes || "").trim(),
  };
}

function projectStateSnapshot() {
  if (!projectData || typeof collectConcepts !== "function") return "";
  const body = buildSaveBody();
  return JSON.stringify({
    zone3dImage: body.zone3dImage || "",
    concepts: body.concepts || [],
    documents: body.documents || [],
    estimations: (body.estimations || []).map(normalizeEstimationForSnapshot),
    indirectCosts: body.indirectCosts || [],
  });
}

function isProjectDirty() {
  if (projectDirtyFlag) return true;
  if (savedProjectSnapshot === null) return false;
  return projectStateSnapshot() !== savedProjectSnapshot;
}

function updateSaveButtonState() {
  const btn = document.getElementById("save-project-btn");
  if (!btn) return;
  const dirty = isProjectDirty();
  btn.classList.toggle("is-dirty", dirty);
  btn.setAttribute(
    "aria-label",
    dirty ? "Hay cambios sin guardar" : "Sin cambios pendientes"
  );
}

function markProjectDirty() {
  projectDirtyFlag = true;
  if (window.__pafProjectId && typeof saveEditorDraft === "function") {
    saveEditorDraft(window.__pafProjectId);
  }
  updateSaveButtonState();
}

function markProjectSaved() {
  projectDirtyFlag = false;
  savedProjectSnapshot = projectStateSnapshot();
  updateSaveButtonState();
}

window.markProjectDirty = markProjectDirty;
window.markProjectSaved = markProjectSaved;
window.isProjectDirty = isProjectDirty;

function projectsForMetrics() {
  return window.__pafProjectsForEstimations || [];
}

async function loadEstimationContext() {
  try {
    const { projects, estimations, breakdowns } = await api(
      "/estimations/breakdowns"
    );
    window.__pafProjectsForEstimations = projects || [];
    window.__pafGlobalEstimations = estimations || [];
    window.__pafEstimationBreakdowns = {};
    if (projectData && estimations) {
      projectData.estimations = estimations;
    }
    if (projectData?.id) {
      syncProjectsForEstimations(projectData);
    }
  } catch {
    if (projectData?.estimations?.length) {
      window.__pafGlobalEstimations = projectData.estimations;
    }
    if (projectData?.id) {
      syncProjectsForEstimations(projectData);
      refreshEstimationBreakdowns(projectData.estimations || []);
    }
  }
}

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

  let { project: p } = await api(`/projects/${id}`);
  const draft = loadEditorDraft(id);
  if (draft && projectNeedsDraftRestore(p, draft)) {
    p = mergeProjectWithDraft(p, draft);
    if (isAdmin) {
      try {
        await api(`/projects/${id}`, {
          method: "PUT",
          body: JSON.stringify(stripComputedFields(p)),
        });
        const refreshed = await api(`/projects/${id}`);
        p = refreshed.project;
        clearEditorDraft(id);
      } catch {
        /* seguir con borrador en editor */
      }
    }
  }
  projectData = p;
  window.__pafDeletedEstimationIds = new Set(
    Array.isArray(p.deletedEstimationIds) ? p.deletedEstimationIds : []
  );
  window.__pafProjectId = id;
  window.__pafProjectData = p;
  await loadEstimationContext();
  p = projectData;

  if (user.role === "client") {
    clientDisplayName = user.name || "";
  } else if (p.clientId) {
    try {
      const { users } = await api("/users");
      const client = users.find((u) => u.id === p.clientId);
      clientDisplayName = client?.name || "";
    } catch {
      clientDisplayName = "";
    }
  }

  if (isAdmin) {
    window.autoSaveProject = () => {
      markProjectDirty();
      return Promise.resolve(true);
    };
    window.refreshProjectMetrics = refreshMetricsFromEditors;
    window.exportEstimation = (est) => {
      refreshEstimationBreakdowns(collectEstimations());
      downloadEstimation(est, clientDisplayName);
    };
    renderAdminView(p);
    bindEditorActions();
    markProjectSaved();
    document
      .getElementById("save-project-btn")
      ?.addEventListener("click", () => saveProject({ silent: false }));
  } else {
    window.exportEstimation = (est) => {
      refreshEstimationBreakdowns(projectData.estimations);
      downloadEstimation(est, clientDisplayName);
    };
    renderClientView(p);
    const estListEl = document.getElementById("project-estimations-list");
    if (estListEl) {
      renderClientEstimationsList(
        estListEl,
        p.estimations,
        clientDisplayName,
        p
      );
    }
  }
})();

function refreshMetricsFromEditors() {
  syncConceptTotals();
  const totalM2 = editorConcepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const totalMoney = editorConcepts.reduce((s, c) => s + c.totalPrice, 0);
  const indirectTotal = calcIndirectTotal(editorIndirectCosts);
  refreshEstimationBreakdowns(editorEstimations);
  const totalPaid = calcTotalPaid(editorEstimations, projectsForMetrics());
  const m2El = document.getElementById("metric-m2");
  const totalEl = document.getElementById("metric-total");
  const paidEl = document.getElementById("metric-paid");
  const indirectEl = document.getElementById("metric-indirect");
  if (m2El) m2El.textContent = formatM2(totalM2);
  if (totalEl) {
    totalEl.textContent = formatMoney(totalMoney);
  }
  if (indirectEl) {
    indirectEl.textContent = formatMoney(indirectTotal);
    const pct = calcIndirectPercent(totalMoney, indirectTotal);
    const sub = document.getElementById("metric-indirect-sub");
    if (sub) sub.textContent = indirectTotal ? `${pct}% del proyecto` : "—";
  }
  if (paidEl) paidEl.textContent = formatMoney(totalPaid);
  const econ = calcConceptEconomics(editorConcepts, indirectTotal);
  const laborEl = document.getElementById("metric-labor");
  const materialEl = document.getElementById("metric-material");
  const profitEl = document.getElementById("metric-profit");
  const flowProfitEl = document.getElementById("metric-flow-profit");
  if (laborEl) laborEl.textContent = formatMoney(econ.laborTotal);
  if (materialEl) materialEl.textContent = formatMoney(econ.materialTotal);
  if (profitEl) profitEl.textContent = formatMoney(econ.profitTotal);
  if (flowProfitEl) flowProfitEl.textContent = formatMoney(econ.flowProfitTotal);
  if (typeof updateConceptsSummaryLine === "function") {
    updateConceptsSummaryLine();
  }
  if (typeof updateIndirectSummaryFooter === "function") {
    updateIndirectSummaryFooter();
  }
  updateProgressChart();
}

function renderClientView(p) {
  const payload = projectPayload(p);
  document.getElementById("project-root").innerHTML = buildReadonlyHtml(payload);
}

function renderAdminView(p) {
  const payload = projectPayload(p);
  const estimationCount = mergeEstimationsFromConcepts(
    p.estimations,
    p.concepts
  ).length;
  const estimationsBootstrap =
    typeof buildEstimationsEditorHtml === "function"
      ? buildEstimationsEditorHtml(p)
      : "";
  const indirectCostsSource = p.indirectCosts || projectData?.indirectCosts || [];
  const indirectBootstrap =
    typeof buildIndirectEditorHtml === "function"
      ? buildIndirectEditorHtml(indirectCostsSource)
      : "";

  document.getElementById("project-root").innerHTML = `
    <div class="project-hero">
      <p class="admin-badge">Modo administración</p>
      <h1>${escapeHtml(p.name)}</h1>
      <p class="portal-user">${statusLabel(p.status)} · Culminación ${formatDate(p.completionDate)} · edita conceptos y documentos abajo</p>
    </div>

    <div class="metrics-row metrics-row--admin-project" style="margin-bottom:2rem" id="metrics-row">
      ${adminProjectMetricsHtml(payload)}
    </div>

    <section class="admin-section project-edit-section">
      <div class="admin-section-head">
        <p class="admin-section-label">Conceptos a trabajar</p>
        <div class="portal-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="collapse-all-concepts">Colapsar</button>
          <button type="button" class="btn btn-ghost btn-sm" id="expand-all-concepts">Expandir</button>
          <button type="button" class="btn btn-ghost btn-sm" id="add-concept">+ Concepto</button>
        </div>
      </div>
      <div id="concepts-editor" class="concepts-editor"></div>
      <p class="concepts-total-preview" id="concepts-total-preview">Total: ${formatProjectMoneyDisplay(payload)} · ${formatM2(payload.m2Total)} m²</p>
    </section>

    <section class="admin-section project-edit-section">
      <div class="admin-section-head">
        <p class="admin-section-label">Gastos indirectos</p>
        <button type="button" class="btn btn-ghost btn-sm" id="add-indirect" onclick="pafAddIndirectCost()">+ Gasto indirecto</button>
      </div>
      <p class="admin-section-hint">Material de protección, cubiertas, insumos no facturados en partidas, etc.</p>
      <div id="indirect-editor" class="indirect-editor">${indirectBootstrap}</div>
      <p class="concepts-total-preview" id="indirect-total-preview" aria-live="polite"></p>
    </section>

    <section id="estimations-section" class="admin-section project-edit-section" style="margin-top:2rem">
      <div class="admin-section-head">
        <p class="admin-section-label">Estimaciones${estimationCount ? ` (${estimationCount})` : ""}</p>
        <button type="button" class="btn btn-ghost btn-sm" id="add-estimation">+ Estimación</button>
      </div>
      <p class="portal-user" style="margin:0 0 1rem">Las estimaciones son globales: puedes usar la misma en varios proyectos. Arrastra ⋮⋮ para reordenar. El detalle y la descarga muestran el desglose por proyecto y el total global.</p>
      <div id="estimations-editor" class="estimations-editor">${estimationsBootstrap}</div>
    </section>

    <section id="workspace-section" class="concept-row project-workspace-section is-collapsed">
      <div class="concept-row-top">
        <button type="button" class="concept-toggle" id="toggle-workspace-section" onclick="pafToggleWorkspaceSection()" aria-expanded="false">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">ZONA</span>
          <span class="concept-summary" id="workspace-section-summary">Vista 3D · ${(p.documents || []).filter((d) => d.title !== "_PAF_INTERNAL" && !String(d.id || "").startsWith("_paf_meta_")).length} documento(s)</span>
        </button>
      </div>
      <div class="concept-row-body">
        <div class="dashboard-grid">
          <div class="dashboard-panel">
            <p class="panel-label">Zona de trabajo — Vista 3D</p>
            <div class="zone-3d">
              <img src="${escapeAttr(p.zone3dImage)}" alt="Vista 3D" id="zone-3d-img">
            </div>
            <div class="form-group" style="margin-top:1rem">
              <label for="zone3dImage">Imagen zona 3D</label>
              <div class="upload-row">
                <input type="file" id="zone3d-upload" accept="image/*">
                <span class="upload-hint">Subir archivo o pegar URL</span>
              </div>
              <input type="text" id="zone3dImage" value="${escapeAttr(p.zone3dImage || "")}" placeholder="https://…">
              <p class="form-error" id="zone3d-upload-error"></p>
            </div>
          </div>

          <div class="dashboard-panel">
            <div class="admin-section-head">
              <p class="panel-label" style="margin:0">Documentos e imágenes</p>
              <div class="portal-actions">
                <button type="button" class="btn btn-ghost btn-sm" id="collapse-all-docs">Colapsar</button>
                <button type="button" class="btn btn-ghost btn-sm" id="expand-all-docs">Expandir</button>
                <button type="button" class="btn btn-ghost btn-sm" id="add-document">+ Documento</button>
              </div>
            </div>
            <div id="documents-editor" class="documents-editor" style="margin-top:1rem"></div>
          </div>
        </div>
      </div>
    </section>

    <p class="save-status" id="save-status" role="status" aria-live="polite"></p>
    <p class="form-error" id="save-error"></p>
  `;

  setEditorData(
    p.concepts,
    p.documents,
    p.estimations,
    indirectCostsSource
  );
  if (typeof hydrateEstimationsFromProject === "function") {
    hydrateEstimationsFromProject(p);
  }
  renderConceptsEditor();
  renderIndirectEditor();
  if (
    indirectCostsSource.length &&
    !document.querySelector("#indirect-editor .indirect-row") &&
    typeof buildIndirectEditorHtml === "function"
  ) {
    const indirectEl = document.getElementById("indirect-editor");
    if (indirectEl) {
      indirectEl.innerHTML = buildIndirectEditorHtml(indirectCostsSource);
      updateIndirectPreview();
    }
  }
  renderEstimationsEditor();
  const estPanel = document.getElementById("estimations-editor");
  renderDocumentsEditor();
  bindWorkspaceSectionToggle();
  bindZone3dUpload();
  updateProgressChart();
  saveEditorDraft(p.id);

  window.addEventListener("beforeunload", (e) => {
    if (!isAdmin) return;
    if (isProjectDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function bindZone3dUpload() {
  const fileInput = document.getElementById("zone3d-upload");
  const urlInput = document.getElementById("zone3dImage");
  const errEl = document.getElementById("zone3d-upload-error");
  const img = document.getElementById("zone-3d-img");
  if (!fileInput || !urlInput) return;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (errEl) errEl.textContent = "";
    fileInput.disabled = true;
    try {
      const url = await uploadFile(file);
      urlInput.value = url;
      if (img) img.src = url;
      markProjectDirty();
    } catch (ex) {
      if (errEl) errEl.textContent = ex.message;
    } finally {
      fileInput.disabled = false;
      fileInput.value = "";
    }
  });

  urlInput.addEventListener("input", () => {
    if (img) img.src = urlInput.value.trim() || img.src;
    markProjectDirty();
  });
}

function progressRingHtml(p) {
  const prog = calcProjectProgress(p.concepts || []);
  return `
    <div class="metric-box metric-box-progress">
      <div class="progress-ring-wrap">
        <div class="progress-ring" id="progress-ring" style="--pct: ${prog.percent}">
          <span class="progress-ring-value" id="progress-percent">${prog.percent}%</span>
        </div>
      </div>
      <span class="metric-label">Avance del proyecto</span>
      <span class="metric-sublabel" id="progress-m2-sub">${formatM2(prog.doneM2)} / ${formatM2(prog.totalM2)} m²</span>
    </div>`;
}

function metricsHtml(p) {
  return `
    ${progressRingHtml(p)}
    <div class="metric-box">
      <span class="metric-value accent">${p.daysRemaining}</span>
      <span class="metric-label">Días restantes</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-m2">${formatM2(p.m2Total)}</span>
      <span class="metric-label">m² totales</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-total">${formatMoney(p.conceptsTotal || 0)}</span>
      <span class="metric-label">Inversión total</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-indirect">${formatMoney(p.indirectTotal || 0)}</span>
      <span class="metric-label">Gastos indirectos</span>
      <span class="metric-sublabel" id="metric-indirect-sub">${p.indirectTotal ? `${p.indirectPercent || 0}% del proyecto` : "—"}</span>
    </div>
    <div class="metric-box">
      <span class="metric-value accent" id="metric-paid">${formatMoney(p.totalPaid)}</span>
      <span class="metric-label">Total pagado</span>
    </div>
  `;
}

function adminProjectMetricsHtml(p) {
  return `
    ${metricsHtml(p)}
    <div class="metric-box">
      <span class="metric-value" id="metric-labor">${formatMoney(p.laborTotal || 0)}</span>
      <span class="metric-label">Mano de obra</span>
      <span class="metric-sublabel">Costo interno</span>
    </div>
    <div class="metric-box">
      <span class="metric-value" id="metric-material">${formatMoney(p.materialTotal || 0)}</span>
      <span class="metric-label">Materiales</span>
      <span class="metric-sublabel">Costo interno</span>
    </div>
    <div class="metric-box">
      <span class="metric-value accent" id="metric-profit">${formatMoney(p.profitTotal || 0)}</span>
      <span class="metric-label">Utilidad total</span>
      <span class="metric-sublabel">Intercambio 40% + utilidad de flujo</span>
    </div>
    <div class="metric-box">
      <span class="metric-value accent" id="metric-flow-profit">${formatMoney(p.flowProfitTotal || 0)}</span>
      <span class="metric-label">Utilidad de flujo</span>
      <span class="metric-sublabel">60% venta − MO − material − indirectos</span>
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
  const conceptsTotal = concepts.reduce((s, c) => s + (Number(c.totalPrice) || 0), 0);
  const m2Total = concepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const progress = calcProjectProgress(concepts);
  const totalPaid = calcTotalPaid(
    project.estimations,
    window.__pafProjectsForEstimations || [{ ...project, concepts }]
  );
  const indirectTotal = calcIndirectTotal(project.indirectCosts);
  const economics = calcConceptEconomics(concepts, indirectTotal);
  return {
    ...project,
    daysRemaining: daysLeft,
    conceptsTotal,
    m2Total,
    totalPaid,
    indirectTotal,
    indirectPercent: calcIndirectPercent(conceptsTotal, indirectTotal),
    laborTotal: economics.laborTotal,
    materialTotal: economics.materialTotal,
    profitTotal: economics.profitTotal,
    intercambioProfitTotal: economics.intercambioProfitTotal,
    flowProfitTotal: economics.flowProfitTotal,
    progressPercent: progress.percent,
    progressDoneM2: progress.doneM2,
  };
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
            <tr><th>Concepto</th><th>m²</th><th>Avance</th><th>Precio unit.</th><th>Total</th><th>Estado</th></tr>
          </thead>
          <tbody>
            ${(p.concepts || [])
              .map((c) => {
                const done = conceptAdvanceM2(c);
                const total = Number(c.m2) || 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return `
              <tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${c.m2}</td>
                <td>${done} / ${total} m² (${pct}%)</td>
                <td>${formatMoney(c.unitPrice)}</td>
                <td>${formatMoney(c.totalPrice)}</td>
                <td><span class="concept-status ${c.status}">${statusLabel(c.status)}</span></td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
        ${!(p.concepts && p.concepts.length) ? '<p class="portal-user" style="margin-top:1rem">Sin conceptos registrados aún.</p>' : ""}
        <p class="concepts-total-preview" style="margin-top:1rem">${formatProjectMoneyDisplay(p)} · ${formatM2(p.m2Total || 0)} m²</p>
        ${
          (p.indirectCosts || []).length
            ? `<div class="indirect-readonly" style="margin-top:1.5rem">
          <p class="panel-label">Gastos indirectos</p>
          <ul class="advance-list">${(p.indirectCosts || [])
            .map(
              (item) =>
                `<li class="advance-item"><span>${escapeHtml(item.label)} · ${formatMoney(item.amount)}${item.date ? ` · ${formatDate(item.date)}` : ""}</span></li>`
            )
            .join("")}</ul>
        </div>`
            : ""
        }
      </div>
      <div class="dashboard-panel full client-estimations-section">
        <p class="panel-label">Estimaciones</p>
        <div id="project-estimations-list" class="estimations-readonly"></div>
      </div>
      <div class="dashboard-panel">
        <p class="panel-label">Zona de trabajo — Vista 3D</p>
        <div class="zone-3d"><img src="${escapeAttr(p.zone3dImage)}" alt="Vista 3D"></div>
      </div>
      <div class="dashboard-panel">
        <p class="panel-label">Documentos e imágenes</p>
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
    .map((d) => {
      if (d.type === "image") {
        return `
    <div class="doc-item doc-item-image">
      <p class="doc-type">Imagen</p>
      <h4>${escapeHtml(d.title)}</h4>
      <img src="${escapeAttr(d.content)}" alt="${escapeAttr(d.title)}" class="doc-image-preview" loading="lazy">
    </div>`;
      }
      return `
    <div class="doc-item ${d.type === "notification" ? "notification" : ""}">
      <p class="doc-type">${d.type === "notification" ? "Notificación" : "Consideración"}</p>
      <h4>${escapeHtml(d.title)}</h4>
      <p>${escapeHtml(d.content)}</p>
    </div>`;
    })
    .join("");
}

function stripComputedFields(project) {
  const {
    daysRemaining,
    conceptsTotal,
    m2Total,
    progressPercent,
    progressDoneM2,
    totalPaid,
    indirectTotal,
    indirectPercent,
    ...rest
  } = project;
  return rest;
}

function buildSaveBody() {
  if (typeof flushPendingAdvancesFromDom === "function") {
    flushPendingAdvancesFromDom();
  }
  const zoneInput = document.getElementById("zone3dImage");
  const estimations = collectEstimations();
  const base = stripComputedFields(projectData);
  delete base.indirectCosts;
  const indirectCosts =
    typeof collectIndirectCosts === "function" ? collectIndirectCosts() : [];
  return {
    ...base,
    zone3dImage: zoneInput?.value.trim() || projectData.zone3dImage,
    concepts: collectConcepts(),
    documents: collectDocuments(),
    estimations,
    indirectCosts,
    deletedEstimationIds: [
      ...(window.__pafDeletedEstimationIds || []),
    ],
  };
}

async function saveProject(options = {}) {
  const { silent = false } = options;
  const err = document.getElementById("save-error");
  const status = document.getElementById("save-status");
  if (!silent && err) err.textContent = "";
  if (status) {
    status.textContent = "Guardando…";
    status.className = "save-status is-saving";
  }

  const saveBtn = document.getElementById("save-project-btn");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const { project } = await api(`/projects/${projectData.id}`, {
      method: "PUT",
      body: JSON.stringify(buildSaveBody()),
    });
    projectData = project;
    window.__pafProjectData = projectData;
    await loadEstimationContext();
    setEditorData(
      project.concepts,
      project.documents,
      project.estimations,
      project.indirectCosts
    );
    if (typeof hydrateEstimationsFromProject === "function") {
      hydrateEstimationsFromProject(project);
    }
    renderConceptsEditor();
    renderIndirectEditor();
    renderEstimationsEditor();
    const payload = projectPayload(project);
    const metricsEl = document.getElementById("metrics-row");
    if (metricsEl) metricsEl.innerHTML = adminProjectMetricsHtml(payload);
    updateProgressChart();
    const img = document.getElementById("zone-3d-img");
    if (img) img.src = project.zone3dImage;

    const advanceCount = (project.concepts || []).reduce(
      (s, c) => s + (c.advances?.length || 0),
      0
    );
    clearEditorDraft(projectData.id);
    saveEditorDraft(projectData.id);
    if (Array.isArray(project.deletedEstimationIds)) {
      window.__pafDeletedEstimationIds = new Set(project.deletedEstimationIds);
    }
    markProjectSaved();

    const okMsg =
      advanceCount > 0
        ? `✓ Guardado (${advanceCount} avance${advanceCount === 1 ? "" : "s"})`
        : "✓ Cambios guardados";
    if (status) {
      status.textContent = okMsg;
      status.className = "save-status is-ok";
    }
    if (err) err.textContent = "";
    setTimeout(() => {
      if (status) {
        status.textContent = "";
        status.className = "save-status";
      }
    }, 5000);
    return true;
  } catch (ex) {
    markProjectDirty();
    const msg = ex.message || "No se pudo guardar. Intenta de nuevo.";
    if (status) {
      status.textContent = "";
      status.className = "save-status";
    }
    if (err) err.textContent = msg;
    return false;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
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
