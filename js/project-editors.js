let editorConcepts = [];
let editorDocuments = [];
let editorEstimations = [];

function isMetaDocument(d) {
  return (
    String(d?.id || "").startsWith("_paf_meta_") || d?.title === "_PAF_INTERNAL"
  );
}

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
    advances: [],
    collapsed: false,
  };
}

function newEstimation() {
  const n = editorEstimations.length + 1;
  return {
    id: newEditorId("est"),
    label: `Estimación ${String(n).padStart(2, "0")}`,
    date: new Date().toISOString().slice(0, 10),
    paid: false,
    paidAt: null,
    notes: "",
    expanded: true,
  };
}

function syncEditorEstimations() {
  const expandedById = new Map(
    editorEstimations.map((e) => [e.id, !!e.expanded])
  );
  editorEstimations = mergeEstimationsFromConcepts(
    editorEstimations,
    editorConcepts
  );
  editorEstimations.forEach((e) => {
    if (expandedById.has(e.id)) e.expanded = expandedById.get(e.id);
  });
}

function updateEstimationRowUi(idx) {
  const est = editorEstimations[idx];
  if (!est) return;
  const row = document.querySelector(
    `#estimations-editor [data-est-index="${idx}"]`
  );
  if (!row) return;
  const expanded = !!est.expanded;
  const lines = getEstimationLines(est.id, editorConcepts);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const label = estimationDisplayLabel(est, idx);
  const summary = `${label} · ${lines.length} partida(s) · ${formatMoney(total)} · ${est.paid ? "Pagada" : "Pendiente"}`;
  row.classList.toggle("is-collapsed", !expanded);
  row.classList.toggle("is-paid", !!est.paid);
  const summaryEl = row.querySelector(".concept-summary");
  if (summaryEl) summaryEl.textContent = summary;
  row.querySelectorAll("[data-est-toggle-label]").forEach((btn) => {
    btn.textContent = expanded ? "Ocultar" : "Ver detalle";
  });
  row.querySelectorAll("[data-toggle-est]").forEach((btn) => {
    btn.setAttribute("aria-expanded", String(expanded));
  });
  const paidToggle = row.querySelector("[data-est-paid-toggle]");
  if (paidToggle) {
    paidToggle.classList.toggle("is-paid", !!est.paid);
    paidToggle.setAttribute("aria-pressed", String(!!est.paid));
    const paidLabel = paidToggle.querySelector(".est-paid-toggle-text");
    if (paidLabel) paidLabel.textContent = est.paid ? "Pagada" : "Pendiente";
  }
}

function toggleEstimationRow(idx) {
  const est = editorEstimations[idx];
  if (!est) return;
  est.expanded = !est.expanded;
  const row = document.querySelector(
    `#estimations-editor [data-est-index="${idx}"]`
  );
  if (!row) {
    renderEstimationsEditor();
    return;
  }
  updateEstimationRowUi(idx);
}

window.pafToggleEstimation = toggleEstimationRow;

window.pafDownloadEstimation = function (idx) {
  const est = editorEstimations[idx];
  if (est && typeof window.exportEstimation === "function") {
    window.exportEstimation(est);
  }
};

window.pafRemoveEstimation = function (idx) {
  const estId = editorEstimations[idx]?.id;
  if (!estId) return;
  if (!confirm("¿Eliminar esta estimación? Los avances quedarán sin estimación asignada.")) {
    return;
  }
  editorEstimations.splice(idx, 1);
  editorConcepts.forEach((c) => {
    c.advances = parseAdvances(c).map((a) =>
      a.estimationId === estId ? { ...a, estimationId: "" } : a
    );
  });
  if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);
  renderConceptsEditor();
  renderEstimationsEditor();
  void persistProjectAdvances();
};

window.pafToggleEstPaid = async function (idx) {
  const est = editorEstimations[idx];
  if (!est) return;
  const toggle = document.querySelector(`[data-est-paid-toggle="${idx}"]`);
  if (toggle?.disabled) return;
  if (toggle) toggle.disabled = true;
  try {
    await window.pafEstPaidChange(idx, !est.paid);
  } finally {
    if (toggle) toggle.disabled = false;
  }
};

window.pafEstPaidChange = async function (idx, checked) {
  if (!editorEstimations[idx]) return;
  editorEstimations[idx].paid = checked;
  editorEstimations[idx].paidAt = checked
    ? new Date().toISOString().slice(0, 10)
    : null;
  updateEstimationRowUi(idx);
  if (typeof window.refreshProjectMetrics === "function") {
    window.refreshProjectMetrics();
  }
  const estimationsToSave = collectEstimations();
  if (window.__pafProjectData) {
    window.__pafProjectData.estimations = estimationsToSave;
  }
  if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);
  const status = document.getElementById("save-status");
  if (status) {
    status.textContent = "Guardando estado de pago…";
    status.className = "save-status is-saving";
  }
  const ok = await persistProjectAdvances();
  if (ok && window.__pafProjectId) {
    saveEditorDraft(window.__pafProjectId);
  }
  if (!ok) {
    editorEstimations[idx].paid = !checked;
    editorEstimations[idx].paidAt = checked
      ? new Date().toISOString().slice(0, 10)
      : null;
    updateEstimationRowUi(idx);
    if (typeof window.refreshProjectMetrics === "function") {
      window.refreshProjectMetrics();
    }
    const errEl = document.getElementById("save-error");
    if (errEl) {
      errEl.textContent =
        "No se pudo guardar el estado de pago. Pulsa Guardar cambios.";
    }
    return;
  }
  if (status) {
    status.textContent = checked ? "✓ Marcada como pagada" : "✓ Marcada como pendiente";
    status.className = "save-status is-ok";
    setTimeout(() => {
      if (status.textContent.startsWith("✓ Marcada")) {
        status.textContent = "";
        status.className = "save-status";
      }
    }, 3000);
  }
};

window.pafEstFieldChange = function (idx, field, value) {
  if (!editorEstimations[idx]) return;
  editorEstimations[idx][field] = value;
  if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);
  if (field === "label") updateEstimationRowUi(idx);
  void persistProjectAdvances();
};

function newAdvance(estimationId) {
  return {
    id: newEditorId("adv"),
    m2: 0,
    date: new Date().toISOString().slice(0, 10),
    estimationId,
    note: "",
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

function setEditorData(concepts, documents, estimations) {
  editorConcepts = (concepts || []).map((c) => {
    const { collapsed: _ui, ...rest } = c;
    return {
      ...rest,
      advances: parseAdvances(c),
      collapsed: true,
    };
  });
  editorDocuments = (documents || [])
    .filter((d) => !isMetaDocument(d))
    .map((d) => ({ ...d, collapsed: true }));
  editorEstimations = mergeEstimationsFromConcepts(estimations, editorConcepts).map(
    (e) => ({ ...e, expanded: e.expanded !== false })
  );
}

function collectConcepts() {
  syncConceptTotals();
  return editorConcepts
    .map((c) => {
      const { collapsed: _ui, ...rest } = c;
      return {
        ...rest,
        name: c.name.trim(),
        m2: Number(c.m2) || 0,
        unitPrice: Number(c.unitPrice) || 0,
        totalPrice: calcConceptTotal(c),
        advances: parseAdvances(c).map((a) => ({
          id: a.id,
          m2: Number(a.m2) || 0,
          date: a.date || "",
          estimationId: a.estimationId || "",
          note: (a.note || "").trim(),
        })),
      };
    })
    .filter((c) => c.name);
}

function readPaidStateFromEditor() {
  const byId = new Map();
  editorEstimations.forEach((e) => {
    if (e?.id) {
      byId.set(e.id, { paid: !!e.paid, paidAt: e.paidAt || null });
    }
  });
  document
    .querySelectorAll("#estimations-editor [data-est-index]")
    .forEach((row) => {
      const idx = Number(row.dataset.estIndex);
      const est = editorEstimations[idx];
      if (!est?.id) return;
      const toggle = row.querySelector("[data-est-paid-toggle]");
      if (!toggle) return;
      const paid = toggle.classList.contains("is-paid");
      byId.set(est.id, {
        paid,
        paidAt: paid
          ? est.paidAt || new Date().toISOString().slice(0, 10)
          : null,
      });
    });
  return byId;
}

function collectEstimations() {
  const paidById = readPaidStateFromEditor();
  syncEditorEstimations();
  return editorEstimations.map((e) => {
    const paidState = paidById.get(e.id);
    const paid = paidState ? paidState.paid : !!e.paid;
    const paidAt = paid
      ? paidState?.paidAt || e.paidAt || new Date().toISOString().slice(0, 10)
      : null;
    const { expanded: _u, collapsed: _c, ...rest } = e;
    return {
      ...rest,
      label: (e.label || "").trim(),
      date: e.date || new Date().toISOString().slice(0, 10),
      paid,
      paidAt,
      notes: (e.notes || "").trim(),
    };
  });
}

function collectDocuments() {
  return editorDocuments
    .filter((d) => !isMetaDocument(d))
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
      renderEstimationsEditor();
    });
  });
  el.querySelectorAll("[data-add-advance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      void addConceptAdvance(Number(btn.dataset.addAdvance));
    });
  });
  el.querySelectorAll("[data-remove-advance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ci = Number(btn.dataset.removeAdvance);
      const ai = Number(btn.dataset.advanceIndex);
      editorConcepts[ci].advances = parseAdvances(editorConcepts[ci]).filter(
        (_, j) => j !== ai
      );
      if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);
      renderConceptsEditor();
      renderEstimationsEditor();
      void persistProjectAdvances();
    });
  });
  updateConceptsPreview();
  updateProgressChart();
}

function conceptSummary(c) {
  const name = c.name.trim() || "Sin nombre";
  const m2 = Number(c.m2) || 0;
  const done = conceptAdvanceM2(c);
  const pct = m2 ? Math.round((done / m2) * 100) : 0;
  const total = formatMoney(calcConceptTotal(c));
  const st = statusLabel(c.status);
  return `${name} · ${done}/${m2} m² (${pct}%) · ${total} · ${st}`;
}

function estimationSelectOptions(selectedId) {
  const opts = editorEstimations
    .map((e, idx) => {
      const label = estimationDisplayLabel(e, idx);
      return `<option value="${escapeAttr(e.id)}" ${e.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return `${opts}<option value="__new__">+ Crear nueva estimación</option>`;
}

function conceptAdvancesBlock(c, i) {
  const advances = parseAdvances(c);
  const pending = conceptAdvancePendingM2(c);
  const list =
    advances.length === 0
      ? '<p class="admin-empty admin-empty-inline">Sin avances registrados.</p>'
      : `<ul class="advance-list">${advances
          .map((a, ai) => {
            const estIdx = editorEstimations.findIndex((e) => e.id === a.estimationId);
            const estLabel =
              estIdx >= 0
                ? estimationDisplayLabel(editorEstimations[estIdx], estIdx)
                : "Sin estimación";
            const amount = Math.round((Number(a.m2) || 0) * (Number(c.unitPrice) || 0));
            return `<li class="advance-item">
              <span>${Number(a.m2) || 0} m² · ${formatMoney(amount)} · ${escapeHtml(estLabel)}${a.date ? ` · ${formatDate(a.date)}` : ""}</span>
              <button type="button" class="btn-remove btn-remove-sm" data-remove-advance="${i}" data-advance-index="${ai}" aria-label="Quitar avance">×</button>
            </li>`;
          })
          .join("")}</ul>`;

  const defaultEst =
    editorEstimations.length > 0
      ? editorEstimations[editorEstimations.length - 1].id
      : "__new__";

  return `
    <div class="concept-advances" data-concept-advances="${i}">
      <p class="subsection-label">Avances de obra</p>
      ${list}
      <p class="advance-pending">Pendiente por avanzar: <strong>${pending}</strong> m²</p>
      <div class="advance-form form-row form-row-3">
        <div class="form-group">
          <label>m² de avance</label>
          <input type="number" min="0" step="0.01" data-advance-m2="${i}" placeholder="Ej. 200">
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" data-advance-date="${i}" value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label>Estimación</label>
          <select data-advance-estimation="${i}">
            ${estimationSelectOptions(defaultEst)}
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-add-advance="${i}">+ Agregar avance</button>
      <p class="form-error" data-advance-error="${i}"></p>
    </div>`;
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
        ${conceptAdvancesBlock(c, i)}
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
  updateProgressChart();
}

function resolveEstimationId(selectValue) {
  if (selectValue !== "__new__") return selectValue;
  const est = newEstimation();
  editorEstimations.push(est);
  renderEstimationsEditor();
  return est.id;
}

async function addConceptAdvance(conceptIndex) {
  const c = editorConcepts[conceptIndex];
  const errEl = document.querySelector(`[data-advance-error="${conceptIndex}"]`);
  const addBtn = document.querySelector(`[data-add-advance="${conceptIndex}"]`);
  if (errEl) errEl.textContent = "";

  const m2Input = document.querySelector(`[data-advance-m2="${conceptIndex}"]`);
  const dateInput = document.querySelector(`[data-advance-date="${conceptIndex}"]`);
  const estSelect = document.querySelector(
    `[data-advance-estimation="${conceptIndex}"]`
  );

  const m2 = Number(m2Input?.value) || 0;
  const date = dateInput?.value || new Date().toISOString().slice(0, 10);
  const pending = conceptAdvancePendingM2(c);

  if (m2 <= 0) {
    if (errEl) errEl.textContent = "Indica los m² del avance.";
    return;
  }
  if (m2 > pending + 0.001) {
    if (errEl) {
      errEl.textContent = `Solo quedan ${pending} m² por registrar en este concepto.`;
    }
    return;
  }

  const estimationId = resolveEstimationId(estSelect?.value || "__new__");
  if (!estimationId) {
    if (errEl) errEl.textContent = "Selecciona o crea una estimación.";
    return;
  }

  if (!c.advances) c.advances = [];
  c.advances.push(newAdvance(estimationId));
  const adv = c.advances[c.advances.length - 1];
  adv.m2 = m2;
  adv.date = date;

  if (m2Input) m2Input.value = "";

  if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);

  syncEditorEstimations();
  renderConceptsEditor();
  renderEstimationsEditor();
  updateProgressChart();

  if (addBtn) addBtn.disabled = true;
  const saved = await persistProjectAdvances();
  if (addBtn) addBtn.disabled = false;

  if (!saved && errEl) {
    errEl.textContent =
      "No se pudo guardar en el servidor. Revisa la conexión y pulsa Guardar cambios.";
  }
}

async function persistProjectAdvances() {
  if (typeof window.autoSaveProject !== "function") return false;
  return window.autoSaveProject();
}

function updateProgressChart() {
  const prog = calcProjectProgress(editorConcepts);
  const ring = document.getElementById("progress-ring");
  const val = document.getElementById("progress-percent");
  const sub = document.getElementById("progress-m2-sub");
  if (ring) ring.style.setProperty("--pct", String(prog.percent));
  if (val) val.textContent = `${prog.percent}%`;
  if (sub) sub.textContent = `${prog.doneM2} / ${prog.totalM2} m²`;
  if (typeof window.refreshProjectMetrics === "function") {
    window.refreshProjectMetrics();
  }
}

function estimationLinesTableHtml(lines) {
  if (!lines.length) {
    return '<p class="admin-empty admin-empty-inline">Sin partidas. Agrega avances en los conceptos y asígnalos a esta estimación.</p>';
  }
  return `
    <table class="estimation-lines-table">
      <thead>
        <tr><th>Concepto</th><th>m²</th><th>P. unit.</th><th>Importe</th><th>Fecha</th></tr>
      </thead>
      <tbody>
        ${lines
          .map(
            (l) => `
        <tr>
          <td>${escapeHtml(l.conceptName)}</td>
          <td>${l.m2}</td>
          <td>${formatMoney(l.unitPrice)}</td>
          <td>${formatMoney(l.amount)}</td>
          <td>${l.date ? formatDate(l.date) : "—"}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function estimationCardHtml(est, idx, conceptsSource) {
  const concepts = conceptsSource || editorConcepts;
  const lines = getEstimationLines(est.id, concepts);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const label = estimationDisplayLabel(est, idx);
  const expanded = !!est.expanded;
  const summary = `${label} · ${lines.length} partida(s) · ${formatMoney(total)} · ${est.paid ? "Pagada" : "Pendiente"}`;

  return `
    <div class="estimation-card concept-row ${est.paid ? "is-paid" : ""} ${expanded ? "" : "is-collapsed"}" data-est-index="${idx}">
      <div class="concept-row-top estimation-card-head">
        <button type="button" class="concept-toggle" data-toggle-est="${idx}" aria-expanded="${expanded}" onclick="pafToggleEstimation(${idx})">
          <span class="concept-chevron" aria-hidden="true"></span>
          <span class="concept-row-num">EST ${String(idx + 1).padStart(2, "0")}</span>
          <span class="concept-summary">${escapeHtml(summary)}</span>
        </button>
        <div class="estimation-head-actions">
          <button type="button" class="est-paid-toggle ${est.paid ? "is-paid" : ""}" data-est-paid-toggle="${idx}" aria-pressed="${est.paid}" aria-label="Estado de pago" onclick="pafToggleEstPaid(${idx})">
            <span class="est-paid-toggle-track" aria-hidden="true"><span class="est-paid-toggle-thumb"></span></span>
            <span class="est-paid-toggle-text">${est.paid ? "Pagada" : "Pendiente"}</span>
          </button>
          <span class="estimation-total">${formatMoney(total)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-est-toggle-label onclick="pafToggleEstimation(${idx})">${expanded ? "Ocultar" : "Ver detalle"}</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="pafDownloadEstimation(${idx})">Descargar</button>
          <button type="button" class="btn-remove" onclick="pafRemoveEstimation(${idx})" aria-label="Eliminar estimación">×</button>
        </div>
      </div>
      <div class="concept-row-body estimation-detail">
        <div class="form-row">
          <div class="form-group">
            <label>Nombre de la estimación</label>
            <input type="text" value="${escapeAttr(est.label || label)}" placeholder="${escapeAttr(label)}" onchange="pafEstFieldChange(${idx},'label',this.value)">
          </div>
          <div class="form-group">
            <label>Fecha</label>
            <input type="date" value="${escapeAttr(est.date || "")}" onchange="pafEstFieldChange(${idx},'date',this.value)">
          </div>
        </div>
        <div class="form-group">
          <label>Notas (opcional)</label>
          <textarea rows="2" placeholder="Observaciones para el cliente…" onchange="pafEstFieldChange(${idx},'notes',this.value)">${escapeHtml(est.notes || "")}</textarea>
        </div>
        <p class="subsection-label">Partidas incluidas</p>
        ${estimationLinesTableHtml(lines)}
      </div>
    </div>`;
}

function hydrateEstimationsFromProject(project) {
  if (!project) return;
  editorEstimations = mergeEstimationsFromConcepts(
    project.estimations || [],
    project.concepts || editorConcepts
  ).map((e) => ({
    ...e,
    expanded: true,
  }));
}

function buildEstimationsEditorHtml(project) {
  const concepts = project?.concepts || editorConcepts;
  const list = mergeEstimationsFromConcepts(
    project?.estimations || [],
    concepts
  );
  if (!list.length) {
    return '<p class="admin-empty">Sin estimaciones. Agrega un avance en un concepto o pulsa + Estimación.</p>';
  }
  return list
    .map((est, idx) => estimationCardHtml(est, idx, concepts))
    .join("");
}

function bindEstimationEditorEvents(_el) {
  /* Toggle vía onclick en el HTML (evita doble disparo con delegación) */
}

function renderEstimationsEditor() {
  const el = document.getElementById("estimations-editor");
  if (!el) return;

  try {
    syncEditorEstimations();
    if (!editorEstimations.length) {
      el.innerHTML =
        '<p class="admin-empty">Sin estimaciones. Agrega un avance en un concepto o pulsa + Estimación.</p>';
      return;
    }
    el.innerHTML = editorEstimations
      .map((est, idx) => estimationCardHtml(est, idx))
      .join("");
    bindEstimationEditorEvents(el);
  } catch (err) {
    el.innerHTML = `<p class="form-error">No se pudieron cargar las estimaciones: ${escapeHtml(err.message)}</p>`;
  }
}

window.buildEstimationsEditorHtml = buildEstimationsEditorHtml;
window.hydrateEstimationsFromProject = hydrateEstimationsFromProject;
window.refreshEstimationsPanel = function (project) {
  if (project) hydrateEstimationsFromProject(project);
  else syncEditorEstimations();
  renderEstimationsEditor();
};

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
      updateWorkspaceSectionSummary();
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

function workspaceSectionSummary() {
  const n = editorDocuments.length;
  return `Vista 3D · ${n} documento${n === 1 ? "" : "s"}`;
}

function updateWorkspaceSectionSummary() {
  const el = document.getElementById("workspace-section-summary");
  if (el) el.textContent = workspaceSectionSummary();
}

window.pafToggleWorkspaceSection = function () {
  const section = document.getElementById("workspace-section");
  const btn = document.getElementById("toggle-workspace-section");
  if (!section) return;
  section.classList.toggle("is-collapsed");
  const collapsed = section.classList.contains("is-collapsed");
  if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
};

function bindWorkspaceSectionToggle() {
  updateWorkspaceSectionSummary();
}

window.bindWorkspaceSectionToggle = bindWorkspaceSectionToggle;
window.updateWorkspaceSectionSummary = updateWorkspaceSectionSummary;

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
    updateWorkspaceSectionSummary();
  });
  document.getElementById("collapse-all-docs")?.addEventListener("click", () => {
    setAllDocumentsCollapsed(true);
  });
  document.getElementById("expand-all-docs")?.addEventListener("click", () => {
    setAllDocumentsCollapsed(false);
  });
  document.getElementById("add-estimation")?.addEventListener("click", () => {
    editorEstimations.push(newEstimation());
    if (window.__pafProjectId) saveEditorDraft(window.__pafProjectId);
    renderEstimationsEditor();
    void persistProjectAdvances();
  });
}
