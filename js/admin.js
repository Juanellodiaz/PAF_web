let clients = [];
let editingId = null;

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
  document.getElementById("clientId").innerHTML =
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
})();

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
      const n = (p.concepts && p.concepts.length) || 0;
      return `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong><br>
          <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${n} conceptos · ${formatMoney(p.conceptsTotal)}</span>
        </div>
        <div class="portal-actions">
          <a href="/project.html?id=${encodeURIComponent(p.id)}" class="btn btn-primary btn-sm">Ver / Editar</a>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${p.id}">Datos</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete="${p.id}">Eliminar</button>
        </div>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => loadBasicEdit(btn.dataset.edit));
  });
  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteProject(btn.dataset.delete));
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const err = document.getElementById("form-error");
  err.textContent = "";
  err.style.color = "";

  const body = {
    name: document.getElementById("name").value.trim(),
    clientId: document.getElementById("clientId").value,
    completionDate: document.getElementById("completionDate").value,
    status: document.getElementById("status").value,
    zone3dImage:
      document.getElementById("zone3dImage").value.trim() ||
      "/assets/zone-3d-placeholder.svg",
    concepts: [],
    documents: [],
  };

  try {
    if (editingId) {
      const existing = (await api(`/projects/${editingId}`)).project;
      await api(`/projects/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...existing,
          ...body,
          id: editingId,
          concepts: existing.concepts || [],
          documents: existing.documents || [],
        }),
      });
    } else {
      const { project } = await api("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      resetForm();
      await loadProjects();
      err.style.color = "var(--accent)";
      err.textContent = "Proyecto creado. Abre Ver / Editar para agregar conceptos.";
      setTimeout(() => {
        window.location.href = `/project.html?id=${encodeURIComponent(project.id)}`;
      }, 800);
      return;
    }
    resetForm();
    await loadProjects();
    err.style.color = "var(--accent)";
    err.textContent = "Datos del proyecto actualizados.";
    setTimeout(() => {
      err.textContent = "";
      err.style.color = "";
    }, 2500);
  } catch (ex) {
    err.textContent = ex.message;
  }
}

function setSubmitLabel() {
  document.querySelector("#project-form button[type=submit]").textContent =
    editingId ? "Guardar datos" : "Crear proyecto";
}

async function loadBasicEdit(id) {
  const { project: p } = await api(`/projects/${id}`);
  editingId = id;
  setSubmitLabel();
  document.getElementById("form-title").textContent = "Editar datos del proyecto";
  document.getElementById("name").value = p.name;
  document.getElementById("clientId").value = p.clientId || "";
  document.getElementById("completionDate").value = p.completionDate;
  document.getElementById("status").value = p.status;
  document.getElementById("zone3dImage").value = p.zone3dImage || "";
  document.getElementById("form-reset").hidden = false;
  document.getElementById("project-form").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  setSubmitLabel();
  document.getElementById("form-title").textContent = "Nuevo proyecto";
  document.getElementById("project-form").reset();
  document.getElementById("form-reset").hidden = true;
}

async function deleteProject(id) {
  if (!confirm("¿Eliminar este proyecto?")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  if (editingId === id) resetForm();
  await loadProjects();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
