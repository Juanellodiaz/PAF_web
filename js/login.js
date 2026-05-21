(async () => {
  try {
    const { user } = await api("/auth/me");
    redirectByRole(user);
    return;
  } catch {
    /* not logged in */
  }

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
      });
      document.body.classList.add("page-exit");
      setTimeout(() => redirectByRole(user), 400);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
})();

function redirectByRole(user) {
  if (user.role === "admin") window.location.href = "/admin.html";
  else window.location.href = "/dashboard.html";
}
