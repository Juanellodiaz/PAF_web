let clients = [];
let editingId = null;
let concepts = [];
let documents = [];

(async () => {
  const user = await requireAuth();
  if (!user || user.role !== "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  document.getElementById("user-greeting").textContent = `${user.name} — Administrador`;
  document.getElementById("logout-btn").addEventListener("click", logout);

  const { users } = await api("/users");
  clients = users;
  const select = document.getElementById("clientId");
  select.innerHTML =
    '<option value="">— Seleccionar —</option>' +
    users
      .map(
        (u) =>
          `<option value="${u.id}">${escapeHtml(u.name)} (${u.username})</option>`
      )
      .join("");

  await loadProjects();

  document.getElementById("project-form").addEventListener("submit", onSubmit);
  document.getElementById("form-reset").addEventListener("click", resetForm);
  document.getElementById("add-concept").addEventListener("click", () => {
    concepts.push(newConcept());
    renderConceptsEditor();
  });
  document.getElementById("add-document").addEventListener("click", () => {
    documents.push(newDocument());
    renderDocumentsEditor();
  });

  renderConceptsEditor();
  renderDocumentsEditor();
})();

function newId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function newConcept() {
  return {
    id: newId("c"),
    name: "",
    m2: 0,
    unitPrice: 0,
    totalPrice: 0,
    status: "pending",
  };
}

function newDocument() {
  return {
    id: newId("d"),
    type: "consideration",
    title: "",
    content: "",
  };
}

function calcConceptTotal(c) {
  const m2 = Number(c.m2) || 0;
  const unit = Number(c.unitPrice) || 0;
  return Math.round(m2 * unit);
}

function syncConceptTotals() {
  concepts.forEach((c) => {
    c.totalPrice = calcConceptTotal(c);
  });
}

function updateTotalPreview() {
  syncConceptTotals();
  const totalM2 = concepts.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const totalMoney = concepts.reduce((s, c) => s + c.totalPrice, 0);
  document.getElementById("concepts-total-preview").textContent =
    `Total conceptos: ${formatMoney(totalMoney)} · ${totalM2} m²`;
}

function renderConceptsEditor() {
  const el = document.getElementById("concepts-editor");
  if (!concepts.length) {
    el.innerHTML =
      '<p class="admin-empty">Sin conceptos. Agrega al menos uno para mostrar m² y costos en el dashboard del cliente.</p>';
    updateTotalPreview();
    return;
  }

  el.innerHTML = concepts
    .map(
      (c, i) => `
    <div class="concept-row" data-index="${i}">
      <div class="concept-row-top">
        <span class="concept-row-num">${String(i + 1).padStart(2, "0")}</span>
        <button type="button" class="btn-remove" data-remove-concept="${i}" aria-label="Eliminar concepto">×</button>
      </div>
      <div class="form-group">
        <label>Concepto</label>
        <input type="text" data-field="name" data-index="${i}" value="${escapeAttr(c.name)}" placeholder="Ej. Microcemento — Sala">
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
          <label>Total (MXN)</label>
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
  `
    )
    .join("");

  el.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", onConceptFieldChange);
    input.addEventListener("change", onConceptFieldChange);
  });
  el.querySelectorAll("[data-remove-concept]").forEach((btn) => {
    btn.addEventListener("click", () => {
      concepts.splice(Number(btn.dataset.removeConcept), 1);
      renderConceptsEditor();
    });
  });
  updateTotalPreview();
}

function onConceptFieldChange(e) {
  const i = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (field === "m2" || field === "unitPrice") {
    concepts[i][field] = Number(e.target.value) || 0;
  } else {
    concepts[i][field] = e.target.value;
  }
  const totalEl = document.querySelector(`[data-total-preview="${i}"]`);
  if (totalEl) totalEl.value = formatMoney(calcConceptTotal(concepts[i]));
  updateTotalPreview();
}

function renderDocumentsEditor() {
  const el = document.getElementById("documents-editor");
  if (!documents.length) {
    el.innerHTML = '<p class="admin-empty">Sin documentos ni notificaciones.</p>';
    return;
  }

  el.innerHTML = documents
    .map(
      (d, i) => `
    <div class="document-row" data-index="${i}">
      <div class="concept-row-top">
        <span class="concept-row-num">DOC ${i + 1}</span>
        <button type="button" class="btn-remove" data-remove-doc="${i}" aria-label="Eliminar">×</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo</label>
          <select data-doc-field="type" data-index="${i}">
            <option value="consideration" ${d.type === "consideration" ? "selected" : ""}>Consideración</option>
            <option value="notification" ${d.type === "notification" ? "selected" : ""}>Notificación</option>
          </select>
        </div>
        <div class="form-group">
          <label>Título</label>
          <input type="text" data-doc-field="title" data-index="${i}" value="${escapeAttr(d.title)}">
        </div>
      </div>
      <div class="form-group">
        <label>Contenido</label>
        <textarea rows="2" data-doc-field="content" data-index="${i}">${escapeHtml(d.content)}</textarea>
      </div>
    </div>
  `
    )
    .join("");

  el.querySelectorAll("[data-doc-field]").forEach((input) => {
    input.addEventListener("input", onDocumentFieldChange);
    input.addEventListener("change", onDocumentFieldChange);
  });
  el.querySelectorAll("[data-remove-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      documents.splice(Number(btn.dataset.removeDoc), 1);
      renderDocumentsEditor();
    });
  });
}

function onDocumentFieldChange(e) {
  const i = Number(e.target.dataset.index);
  const field = e.target.dataset.docField;
  documents[i][field] = e.target.value;
}

function collectConceptsFromDom() {
  syncConceptTotals();
  return concepts
    .map((c) => ({
      ...c,
      name: c.name.trim(),
      m2: Number(c.m2) || 0,
      unitPrice: Number(c.unitPrice) || 0,
      totalPrice: calcConceptTotal(c),
    }))
    .filter((c) => c.name);
}

function collectDocumentsFromDom() {
  return documents
    .map((d) => ({
      ...d,
      title: d.title.trim(),
      content: d.content.trim(),
    }))
    .filter((d) => d.title && d.content);
}

async function loadProjects() {
  const { projects } = await api("/projects");
  const list = document.getElementById("admin-projects");

  if (!projects.length) {
    list.innerHTML = '<div class="admin-list-item"><span>Sin proyectos</span></div>';
    return;
  }

  list.innerHTML = projects
    .map((p) => {
      const client = clients.find((c) => c.id === p.clientId);
      const clientName = client ? client.name : "Sin asignar";
      const conceptCount = (p.concepts && p.concepts.length) || 0;
      return `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong><br>
          <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${conceptCount} conceptos · ${formatMoney(p.conceptsTotal)}</span>
        </div>
        <div class="portal-actions">
          <a href="/project.html?id=${encodeURIComponent(p.id)}" class="btn btn-ghost btn-sm">Ver</a>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete="${p.id}">Eliminar</button>
        </div>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => loadProjectForEdit(btn.dataset.edit));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProject(btn.dataset.delete));
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const err = document.getElementById("form-error");
  err.textContent = "";

  const body = {
    name: document.getElementById("name").value.trim(),
    clientId: document.getElementById("clientId").value,
    completionDate: document.getElementById("completionDate").value,
    status: document.getElementById("status").value,
    zone3dImage:
      document.getElementById("zone3dImage").value.trim() ||
      "/assets/zone-3d-placeholder.svg",
    concepts: collectConceptsFromDom(),
    documents: collectDocumentsFromDom(),
  };

  try {
    if (editingId) {
      await api(`/projects/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, id: editingId }),
      });
    } else {
      await api("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    resetForm();
    await loadProjects();
    err.textContent = "";
    err.style.color = "var(--accent)";
    err.textContent = "Proyecto guardado correctamente.";
    setTimeout(() => {
      err.textContent = "";
      err.style.color = "";
    }, 3000);
  } catch (ex) {
    err.style.color = "";
    err.textContent = ex.message;
  }
}

async function loadProjectForEdit(id) {
  const { project: p } = await api(`/projects/${id}`);
  editingId = id;
  document.getElementById("form-title").textContent = "Editar proyecto";
  document.getElementById("project-id").value = id;
  document.getElementById("name").value = p.name;
  document.getElementById("clientId").value = p.clientId || "";
  document.getElementById("completionDate").value = p.completionDate;
  document.getElementById("status").value = p.status;
  document.getElementById("zone3dImage").value = p.zone3dImage || "";
  document.getElementById("form-reset").hidden = false;

  concepts = (p.concepts || []).map((c) => ({ ...c }));
  documents = (p.documents || []).map((d) => ({ ...d }));
  renderConceptsEditor();
  renderDocumentsEditor();

  document.getElementById("project-form").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  concepts = [];
  documents = [];
  document.getElementById("form-title").textContent = "Nuevo proyecto";
  document.getElementById("project-form").reset();
  document.getElementById("form-reset").hidden = true;
  renderConceptsEditor();
  renderDocumentsEditor();
}

async function deleteProject(id) {
  if (!confirm("¿Eliminar este proyecto y todos sus conceptos?")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  if (editingId === id) resetForm();
  await loadProjects();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
