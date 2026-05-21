const API = "/api";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

async function requireAuth(redirect = "/login.html") {
  try {
    const { user } = await api("/auth/me");
    return user;
  } catch {
    window.location.href = redirect;
    return null;
  }
}

async function logout() {
  await api("/auth/logout", { method: "POST" });
  document.body.classList.add("page-exit");
  setTimeout(() => {
    window.location.href = "/login.html";
  }, 400);
}

function formatMoney(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso + "T12:00:00"));
}

function statusLabel(status) {
  const map = {
    pending: "Pendiente",
    in_progress: "En progreso",
    completed: "Completado",
  };
  return map[status] || status;
}

function navigateWithFade(url) {
  document.body.classList.add("page-exit");
  setTimeout(() => {
    window.location.href = url;
  }, 450);
}

document.body.classList.add("page-enter");
