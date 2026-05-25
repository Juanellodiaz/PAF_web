function initLazyVideo() {
  const video = document.getElementById("login-video");
  if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const load = () => {
    if (video.dataset.loaded) return;
    video.dataset.loaded = "1";
    const source = document.createElement("source");
    source.src = "Background_PAF.mp4";
    source.type = "video/mp4";
    video.appendChild(source);
    video.load();
    video.play().catch(() => {});
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(load, { timeout: 1500 });
  } else {
    setTimeout(load, 200);
  }
}

async function checkExistingSession() {
  try {
    const { user } = await api("/auth/me", { redirectOn401: false });
    document.body.classList.add("page-exit");
    setTimeout(() => redirectByRole(user), 300);
  } catch {
    document.body.classList.remove("login-checking");
  }
}

function redirectByRole(user) {
  if (user.role === "admin") window.location.href = "/admin.html";
  else window.location.href = "/dashboard.html";
}

initLazyVideo();
checkExistingSession();

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const username = form.username.value.trim();
  const password = form.password.value;

  try {
    const { user } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      redirectOn401: false,
    });
    document.body.classList.add("page-exit");
    setTimeout(() => redirectByRole(user), 400);
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
