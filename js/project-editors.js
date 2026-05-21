let editorConcepts = [];
let editorDocuments = [];

function newEditorId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function newConcept() {
  return {
    id: newEditorId("c"),
    name: "",
    m2: 0,
    unitPrice: 0,
    totalPrice: 0,
    status: "pending",
    collapsed: false,
  };
}

function newDocument() {
  return {
    id: newEditorId("d"),
    type: "consideration",
    title: "",
    content: "",
    collapsed: false,
  };
}

function documentTypeLabel(type) {
  const map = {
    consideration: "Consideración",
    notification: "Notificación",
    image: "Imagen",
  };
  return map[type] || type;
}

function calcConceptTotal(c) {
  const m2 = Number(c.m2) || 0;
  const unit = Number(c.unitPrice) || 0;
  return Math.round(m2 * unit);
}

function syncConceptTotals() {
  editorConcepts.forEach((c) => {
    c.totalPrice = calcConceptTotal(c);
  });
}

function setEditorData(concepts, documents) {
  editorConcepts = (concepts || []).map((c) => ({ ...c }));
  editorDocuments = (documents || []).map((d) => ({ ...d }));
}

function collectConcepts() {
  syncConceptTotals();
  return editorConcepts
    .map((c) => ({
      ...c,
      name: c.name.trim(),
      m2: Number(c.m2) || 0,
      unitPrice: Number(c.unitPrice) || 0,
      totalPrice: calcConceptTotal(c),
    }))
    .filter((c) => c.name);
}

function collectDocuments() {
  return editorDocuments
    .map((d) => ({
      ...d,
      title: d.title.trim(),
      content: (d.content || "").trim(),
    }))
    .filter((d) => d.title && d.content);
}

function updateConceptsPreview() {
  const el = document.getElementById("concepts-total-preview");
  if (!el) return;
  syncConceptTotals();
  const totalM2 = editorConcepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const totalMoney = editorConcepts.reduce((s, c) => s + c.totalPrice, 0);
  el.textContent = `Total: ${formatMoney(totalMoney)} · ${totalM2} m²`;
  if (typeof window.refreshProjectMetrics === "function") {
    window.refreshProjectMetrics();
  }
}

function renderConceptsEditor() {
  const el = document.getElementById("concepts-editor");
  if (!el) return;

  if (!editorConcepts.length) {
    el.innerHTML =
      '<p class="admin-empty">Sin conceptos. Agrega partidas con m² y costos.</p>';
    updateConceptsPreview();
    return;
  }

  el.innerHTML = editorConcepts
    .map((c, i) => conceptRowHtml(c, i))
    .join("");

  el.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", onConceptFieldChange);
    input.addEventListener("change", onConceptFieldChange);
  });
  el.querySelectorAll("[data-toggle-concept]").forEach((btn) => {
    btn.addEventListener("click", () => toggleConceptRow(Number(btn.dataset.toggleConcept)));
  });
  el.querySelectorAll("[data-remove-concept]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editorConcepts.splice(Number(btn.dataset.removeConcept), 1);
      renderConceptsEditor();
    });
  });
  updateConceptsPreview();
}

function conceptSummary(c) {
  const name = c.name.trim() || "Sin nombre";
  const m2 = Number(c.m2) || 0;
  const total = formatMoney(calcConceptTotal(c));
  const st = statusLabel(c.status);
  return `${name} · ${m2} m² · ${total} · ${st}`;
}

function conceptRowHtml(c, i) {
  const collapsed = !!c.collapsed;
  return `
    <div class="concept-row ${collapsed ? "is-collapsed" : ""}" data-index="${i}">
      <div class="concept-row-top">
        <button type="button" class="concept-toggle" data-toggle-concept="${i}" aria-expanded="${!collapsed}">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="concept-summary" data-summary="${i}">${escapeHtml(conceptSummary(c))}</span>
        </button>
        <button type="button" class="btn-remove" data-remove-concept="${i}" aria-label="Eliminar concepto">×</button>
      </div>
      <div class="concept-row-body">
        <div class="form-group">
          <label>Concepto</label>
          <input type="text" data-field="name" data-index="${i}" value="${escapeAttr(c.name)}">
        </div>
        <div class="form-row form-row-4">
          <div class="form-group">
            <label>m²</label>
            <input type="number" min="0" step="0.01" data-field="m2" data-index="${i}" value="${c.m2 || ""}">
          </div>
          <div class="form-group">
            <label>Precio unit. (MXN)</label>
            <input type="number" min="0" step="1" data-field="unitPrice" data-index="${i}" value="${c.unitPrice || ""}">
          </div>
          <div class="form-group">
            <label>Total</label>
            <input type="text" readonly class="input-readonly" data-total-preview="${i}" value="${formatMoney(calcConceptTotal(c))}">
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select data-field="status" data-index="${i}">
              <option value="pending" ${c.status === "pending" ? "selected" : ""}>Pendiente</option>
              <option value="in_progress" ${c.status === "in_progress" ? "selected" : ""}>En progreso</option>
              <option value="completed" ${c.status === "completed" ? "selected" : ""}>Completado</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleConceptRow(i) {
  editorConcepts[i].collapsed = !editorConcepts[i].collapsed;
  const row = document.querySelector(`.concept-row[data-index="${i}"]`);
  if (!row) {
    renderConceptsEditor();
    return;
  }
  row.classList.toggle("is-collapsed", editorConcepts[i].collapsed);
  const btn = row.querySelector("[data-toggle-concept]");
  if (btn) btn.setAttribute("aria-expanded", String(!editorConcepts[i].collapsed));
  updateConceptSummaryLine(i);
}

function updateConceptSummaryLine(i) {
  const el = document.querySelector(`[data-summary="${i}"]`);
  if (el) el.textContent = conceptSummary(editorConcepts[i]);
}

function setAllConceptsCollapsed(collapsed) {
  editorConcepts.forEach((c) => {
    c.collapsed = collapsed;
  });
  renderConceptsEditor();
}

function onConceptFieldChange(e) {
  const i = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (field === "m2" || field === "unitPrice") {
    editorConcepts[i][field] = Number(e.target.value) || 0;
  } else {
    editorConcepts[i][field] = e.target.value;
  }
  const totalEl = document.querySelector(`[data-total-preview="${i}"]`);
  if (totalEl) totalEl.value = formatMoney(calcConceptTotal(editorConcepts[i]));
  updateConceptSummaryLine(i);
  updateConceptsPreview();
}

function documentSummary(d) {
  const title = d.title.trim() || "Sin título";
  return `${documentTypeLabel(d.type)} · ${title}`;
}

function documentRowHtml(d, i) {
  const collapsed = !!d.collapsed;
  const isImage = d.type === "image";
  return `
    <div class="document-row concept-row ${collapsed ? "is-collapsed" : ""}" data-doc-index="${i}">
      <div class="concept-row-top">
        <button type="button" class="concept-toggle" data-toggle-doc="${i}" aria-expanded="${!collapsed}">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">DOC ${String(i + 1).padStart(2, "0")}</span>
          <span class="concept-summary" data-doc-summary="${i}">${escapeHtml(documentSummary(d))}</span>
        </button>
        <button type="button" class="btn-remove" data-remove-doc="${i}" aria-label="Eliminar documento">×</button>
      </div>
      <div class="concept-row-body">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo</label>
            <select data-doc-field="type" data-index="${i}">
              <option value="consideration" ${d.type === "consideration" ? "selected" : ""}>Consideración</option>
              <option value="notification" ${d.type === "notification" ? "selected" : ""}>Notificación</option>
              <option value="image" ${d.type === "image" ? "selected" : ""}>Imagen</option>
            </select>
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" data-doc-field="title" data-index="${i}" value="${escapeAttr(d.title)}">
          </div>
        </div>
        ${
          isImage
            ? `
        <div class="form-group doc-image-upload">
          <label>Archivo de imagen</label>
          <div class="upload-row">
            <input type="file" accept="image/*" data-doc-upload="${i}">
            <span class="upload-hint">JPG, PNG o WebP · máx. 5 MB</span>
          </div>
          ${d.content ? `<div class="doc-image-preview-wrap"><img src="${escapeAttr(d.content)}" alt="" data-doc-preview="${i}" class="doc-image-preview"></div>` : `<div class="doc-image-preview-wrap" data-doc-preview-wrap="${i}" hidden></div>`}
          <label class="upload-url-label">o URL de imagen</label>
          <input type="text" data-doc-field="content" data-index="${i}" value="${escapeAttr(d.content)}" placeholder="https://… o sube un archivo">
        </div>`
            : `
        <div class="form-group">
          <label>Contenido</label>
          <textarea rows="2" data-doc-field="content" data-index="${i}">${escapeHtml(d.content)}</textarea>
        </div>`
        }
      </div>
    </div>
  `;
}

function renderDocumentsEditor() {
  const el = document.getElementById("documents-editor");
  if (!el) return;

  if (!editorDocuments.length) {
    el.innerHTML = '<p class="admin-empty">Sin documentos ni notificaciones.</p>';
    return;
  }

  el.innerHTML = editorDocuments.map((d, i) => documentRowHtml(d, i)).join("");

  el.querySelectorAll("[data-doc-field]").forEach((input) => {
    input.addEventListener("input", onDocumentFieldChange);
    input.addEventListener("change", onDocumentFieldChange);
  });
  el.querySelectorAll("[data-toggle-doc]").forEach((btn) => {
    btn.addEventListener("click", () => toggleDocumentRow(Number(btn.dataset.toggleDoc)));
  });
  el.querySelectorAll("[data-remove-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editorDocuments.splice(Number(btn.dataset.removeDoc), 1);
      renderDocumentsEditor();
    });
  });
  el.querySelectorAll("[data-doc-upload]").forEach((input) => {
    input.addEventListener("change", onDocumentImageUpload);
  });
}

function toggleDocumentRow(i) {
  editorDocuments[i].collapsed = !editorDocuments[i].collapsed;
  const row = document.querySelector(`[data-doc-index="${i}"]`);
  if (!row) {
    renderDocumentsEditor();
    return;
  }
  row.classList.toggle("is-collapsed", editorDocuments[i].collapsed);
  const btn = row.querySelector("[data-toggle-doc]");
  if (btn) btn.setAttribute("aria-expanded", String(!editorDocuments[i].collapsed));
}

function updateDocumentSummaryLine(i) {
  const el = document.querySelector(`[data-doc-summary="${i}"]`);
  if (el) el.textContent = documentSummary(editorDocuments[i]);
}

function setAllDocumentsCollapsed(collapsed) {
  editorDocuments.forEach((d) => {
    d.collapsed = collapsed;
  });
  renderDocumentsEditor();
}

function onDocumentFieldChange(e) {
  const i = Number(e.target.dataset.index);
  const field = e.target.dataset.docField;
  editorDocuments[i][field] = e.target.value;
  if (field === "type") {
    renderDocumentsEditor();
    return;
  }
  updateDocumentSummaryLine(i);
  if (field === "content" && editorDocuments[i].type === "image") {
    const preview = document.querySelector(`[data-doc-preview="${i}"]`);
    if (preview) preview.src = e.target.value;
  }
}

async function onDocumentImageUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const i = Number(e.target.dataset.docUpload);
  const row = e.target.closest("[data-doc-index]");
  const errEl = row?.querySelector("[data-upload-error]");
  if (errEl) errEl.textContent = "";

  e.target.disabled = true;
  try {
    const url = await uploadFile(file);
    editorDocuments[i].content = url;
    const urlInput = document.querySelector(
      `[data-doc-field="content"][data-index="${i}"]`
    );
    if (urlInput) urlInput.value = url;
    let wrap = document.querySelector(`[data-doc-preview-wrap="${i}"]`);
    let img = document.querySelector(`[data-doc-preview="${i}"]`);
    if (!img && wrap) {
      wrap.hidden = false;
      img = document.createElement("img");
      img.className = "doc-image-preview";
      img.dataset.docPreview = String(i);
      img.alt = "";
      wrap.appendChild(img);
    }
    if (img) {
      img.src = url;
      if (wrap) wrap.hidden = false;
    }
    updateDocumentSummaryLine(i);
  } catch (ex) {
    const msg = ex.message || "Error al subir";
    if (row) {
      let err = row.querySelector("[data-upload-error]");
      if (!err) {
        err = document.createElement("p");
        err.className = "form-error";
        err.dataset.uploadError = "";
        e.target.closest(".doc-image-upload")?.appendChild(err);
      }
      err.textContent = msg;
    }
  } finally {
    e.target.disabled = false;
    e.target.value = "";
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

function bindEditorActions() {
  document.getElementById("add-concept")?.addEventListener("click", () => {
    editorConcepts.push(newConcept());
    renderConceptsEditor();
  });
  document.getElementById("collapse-all-concepts")?.addEventListener("click", () => {
    setAllConceptsCollapsed(true);
  });
  document.getElementById("expand-all-concepts")?.addEventListener("click", () => {
    setAllConceptsCollapsed(false);
  });
  document.getElementById("add-document")?.addEventListener("click", () => {
    editorDocuments.push(newDocument());
    renderDocumentsEditor();
  });
  document.getElementById("collapse-all-docs")?.addEventListener("click", () => {
    setAllDocumentsCollapsed(true);
  });
  document.getElementById("expand-all-docs")?.addEventListener("click", () => {
    setAllDocumentsCollapsed(false);
  });
}
