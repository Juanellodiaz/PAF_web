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
  const select = document.getElementById("clientId");
  select.innerHTML =
    '<option value="">— Seleccionar —</option>' +
    users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (${u.username})</option>`).join("");

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
      return `
      <div class="admin-list-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong><br>
          <span class="portal-user">${escapeHtml(clientName)} · ${p.daysRemaining} días · ${formatMoney(p.conceptsTotal)}</span>
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
    btn.addEventListener("click", () => editProject(btn.dataset.edit, projects));
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
    zone3dImage: document.getElementById("zone3dImage").value.trim() || "/assets/zone-3d-placeholder.svg",
  };

  try {
    if (editingId) {
      const existing = (await api(`/projects/${editingId}`)).project;
      await api(`/projects/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ ...existing, ...body }),
      });
    } else {
      await api("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    resetForm();
    await loadProjects();
  } catch (ex) {
    err.textContent = ex.message;
  }
}

function editProject(id, projects) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  editingId = id;
  document.getElementById("form-title").textContent = "Editar proyecto";
  document.getElementById("project-id").value = id;
  document.getElementById("name").value = p.name;
  document.getElementById("clientId").value = p.clientId;
  document.getElementById("completionDate").value = p.completionDate;
  document.getElementById("status").value = p.status;
  document.getElementById("zone3dImage").value = p.zone3dImage;
  document.getElementById("form-reset").hidden = false;
}

function resetForm() {
  editingId = null;
  document.getElementById("form-title").textContent = "Nuevo proyecto";
  document.getElementById("project-form").reset();
  document.getElementById("form-reset").hidden = true;
}

async function deleteProject(id) {
  if (!confirm("¿Eliminar este proyecto?")) return;
  await api(`/projects/${id}`, { method: "DELETE" });
  await loadProjects();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
