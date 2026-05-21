const API = "/api";

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/upload`, {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login.html";
    throw new Error(data.error || "No autenticado");
  }
  if (!res.ok) throw new Error(data.error || "Error al subir imagen");
  return data.url;
}

async function api(path, options = {}) {
  const { redirectOn401 = true, ...fetchOptions } = options;
  const res = await fetch(`${API}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...fetchOptions.headers },
    ...fetchOptions,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const onLoginPage = /login\.html$/i.test(window.location.pathname);
    if (redirectOn401 && !onLoginPage) {
      window.location.href = "/login.html";
    }
    throw new Error(data.error || "No autenticado");
  }
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

const PROJECT_STATUS_LABELS = {
  en_aprobacion: "En aprobación",
  en_proceso: "En proceso",
  completado: "Completado",
  pending: "En aprobación",
  in_progress: "En proceso",
  completed: "Completado",
};

function normalizeProjectStatus(status) {
  const legacy = {
    pending: "en_aprobacion",
    in_progress: "en_proceso",
    completed: "completado",
  };
  return legacy[status] || status || "en_aprobacion";
}

function statusLabel(status) {
  return PROJECT_STATUS_LABELS[status] || status;
}

function calcProjectProgress(concepts) {
  const list = concepts || [];
  const totalM2 = list.reduce((s, c) => s + (Number(c.m2) || 0), 0);
  const doneM2 = list.reduce((s, c) => {
    const adv = Array.isArray(c.advances) ? c.advances : [];
    return s + adv.reduce((a, v) => a + (Number(v.m2) || 0), 0);
  }, 0);
  const percent = totalM2
    ? Math.min(100, Math.round((doneM2 / totalM2) * 1000) / 10)
    : 0;
  return { totalM2, doneM2, percent };
}

function projectProgress(p) {
  const calc = calcProjectProgress(p.concepts || []);
  return {
    percent:
      typeof p.progressPercent === "number" ? p.progressPercent : calc.percent,
    doneM2:
      typeof p.progressDoneM2 === "number" ? p.progressDoneM2 : calc.doneM2,
    totalM2: calc.totalM2,
  };
}

function progressRingCardHtml(p) {
  const prog = projectProgress(p);
  const m2Label =
    prog.totalM2 > 0
      ? `<span class="progress-ring-card-m2">${prog.doneM2} / ${prog.totalM2} m²</span>`
      : "";
  return `
    <div class="progress-ring-card" aria-label="Avance del proyecto: ${prog.percent} por ciento">
      <div class="progress-ring progress-ring--card" style="--pct: ${prog.percent}">
        <span class="progress-ring-value">${prog.percent}%</span>
      </div>
      ${m2Label}
    </div>`;
}

function navigateWithFade(url) {
  document.body.classList.add("page-exit");
  setTimeout(() => {
    window.location.href = url;
  }, 450);
}

document.body.classList.add("page-enter");
