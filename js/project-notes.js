let editorDepartmentNotes = [];
let departmentNotesAuthor = "Departamento";

function setDepartmentNotesAuthor(name) {
  departmentNotesAuthor = (name || "").trim() || "Departamento";
}

function newDepartmentNoteId() {
  return `note-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeDepartmentNote(note) {
  if (!note || typeof note !== "object") return null;
  const text = (note.text || "").trim();
  if (!text) return null;
  return {
    id: note.id || newDepartmentNoteId(),
    text,
    createdAt: note.createdAt || new Date().toISOString(),
    author: (note.author || "").trim() || "Departamento",
  };
}

function normalizeDepartmentNotesList(list) {
  return (list || []).map(normalizeDepartmentNote).filter(Boolean);
}

function sortDepartmentNotesNewestFirst(list) {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });
}

function formatDepartmentNoteDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function createDepartmentNote(text, author) {
  return normalizeDepartmentNote({
    id: newDepartmentNoteId(),
    text,
    createdAt: new Date().toISOString(),
    author: author || departmentNotesAuthor,
  });
}

function initDepartmentNotes(notes) {
  editorDepartmentNotes = normalizeDepartmentNotesList(notes);
}

function collectDepartmentNotes() {
  return sortDepartmentNotesNewestFirst(editorDepartmentNotes).map((n) => ({
    id: n.id,
    text: n.text,
    createdAt: n.createdAt,
    author: n.author,
  }));
}

function departmentNoteReadonlyItemHtml(note) {
  return `
    <li class="department-note-item">
      <p class="department-note-meta">
        <time datetime="${escapeAttr(note.createdAt)}">${formatDepartmentNoteDate(note.createdAt)}</time>
        <span class="department-note-author">${escapeHtml(note.author)}</span>
      </p>
      <p class="department-note-text">${escapeHtml(note.text)}</p>
    </li>`;
}

function departmentNotesReadonlyHtml(notes) {
  const list = sortDepartmentNotesNewestFirst(normalizeDepartmentNotesList(notes));
  if (!list.length) {
    return '<p class="portal-user department-notes-empty">Sin notas del departamento por el momento.</p>';
  }
  return `<ol class="department-notes-list">${list.map(departmentNoteReadonlyItemHtml).join("")}</ol>`;
}

function buildDepartmentNotesSectionReadonly(notes) {
  return `
    <section class="project-notes-section dashboard-panel full">
      <p class="panel-label">Notas</p>
      ${departmentNotesReadonlyHtml(notes)}
    </section>`;
}

function departmentNoteEditorItemHtml(note, idx) {
  return `
    <li class="department-note-item department-note-item--editable" data-note-index="${idx}">
      <p class="department-note-meta">
        <time datetime="${escapeAttr(note.createdAt)}">${formatDepartmentNoteDate(note.createdAt)}</time>
        <span class="department-note-author">${escapeHtml(note.author)}</span>
        <button type="button" class="btn-remove department-note-remove" data-remove-note="${idx}" aria-label="Eliminar nota">×</button>
      </p>
      <p class="department-note-text">${escapeHtml(note.text)}</p>
    </li>`;
}

function departmentNotesEditorInnerHtml() {
  const list = sortDepartmentNotesNewestFirst(editorDepartmentNotes);
  const items = list.map((n, i) => departmentNoteEditorItemHtml(n, i)).join("");
  return `
    <div class="department-notes-composer">
      <label for="department-note-input">Nueva nota</label>
      <textarea id="department-note-input" rows="3" placeholder="Escribe una nota para la bitácora del proyecto…"></textarea>
      <button type="button" class="btn btn-ghost btn-sm" id="add-department-note-btn">+ Agregar nota</button>
    </div>
    ${
      list.length
        ? `<ol class="department-notes-list">${items}</ol>`
        : '<p class="portal-user department-notes-empty">Aún no hay notas. Agrega la primera arriba.</p>'
    }`;
}

function afterDepartmentNotesChanged() {
  if (window.__pafProjectData) {
    window.__pafProjectData.departmentNotes = collectDepartmentNotes();
  }
  if (typeof window.markProjectDirty === "function") {
    window.markProjectDirty();
  }
}

function bindDepartmentNotesEditorEvents() {
  const el = document.getElementById("department-notes-editor");
  if (!el) return;

  document.getElementById("add-department-note-btn")?.addEventListener("click", () => {
    const input = document.getElementById("department-note-input");
    const text = input?.value.trim();
    if (!text) return;
    const note = createDepartmentNote(text, departmentNotesAuthor);
    if (!note) return;
    editorDepartmentNotes.unshift(note);
    if (input) input.value = "";
    renderDepartmentNotesEditor();
    afterDepartmentNotesChanged();
  });

  el.querySelectorAll("[data-remove-note]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeNote);
      if (!Number.isFinite(idx) || idx < 0 || idx >= editorDepartmentNotes.length) return;
      const sorted = sortDepartmentNotesNewestFirst(editorDepartmentNotes);
      const target = sorted[idx];
      if (!target) return;
      editorDepartmentNotes = editorDepartmentNotes.filter((n) => n.id !== target.id);
      renderDepartmentNotesEditor();
      afterDepartmentNotesChanged();
    });
  });
}

function renderDepartmentNotesEditor() {
  const el = document.getElementById("department-notes-editor");
  if (!el) return;
  el.innerHTML = departmentNotesEditorInnerHtml();
  bindDepartmentNotesEditorEvents();
}

window.pafRemoveDepartmentNote = function (index) {
  const idx = Number(index);
  const sorted = sortDepartmentNotesNewestFirst(editorDepartmentNotes);
  const target = sorted[idx];
  if (!target) return;
  editorDepartmentNotes = editorDepartmentNotes.filter((n) => n.id !== target.id);
  renderDepartmentNotesEditor();
  afterDepartmentNotesChanged();
};
