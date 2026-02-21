// ======================================================================
// MONEY MANAGER — SIGNUP ENGINE (FINAL)
// ======================================================================

const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
};

// --------------------------------------------------
// DOM
// --------------------------------------------------
const el = {
  createBtn: document.getElementById("createAccountButton"),
  name: document.getElementById("fullName"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  confirmPassword: document.getElementById("confirmPassword"),
  googleBtn: document.getElementById("googleSignUp"),
  loginLink: document.getElementById("loginLink"),
  terms: document.getElementById("termsCheckbox")
};

// ==================================================
document.addEventListener("DOMContentLoaded", () => {
  preventFormReload();
  initSignup();
  initGoogle();
  initLinks();
  checkExistingSession();
});

// ==================================================
function preventFormReload() {
  const form = document.querySelector("form");
  form?.addEventListener("submit", (e) => e.preventDefault());
}

// ==================================================
async function checkExistingSession() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/auth/me`, {
      credentials: "include"
    });

    if (res.ok) {
      window.location.href = "/app/nav/dashboard";
    }
  } catch {}
}

// ==================================================
function initSignup() {
  el.createBtn?.addEventListener("click", async () => {
    const name = el.name.value.trim();
    const email = el.email.value.trim();
    const password = el.password.value;
    const confirmPassword = el.confirmPassword.value;
    const accepted = el.terms?.checked;

    // validations
    if (!name || !email || !password) {
      shakeButton(el.createBtn);
      return;
    }

    if (!accepted) {
      setError(el.createBtn, "Accept Terms");
      shakeButton(el.createBtn);
      return;
    }

    if (password.length < 6) {
      setError(el.createBtn, "Password too short");
      shakeButton(el.createBtn);
      return;
    }

    if (password !== confirmPassword) {
      setError(el.createBtn, "Passwords do not match");
      shakeButton(el.createBtn);
      return;
    }

    setLoading(el.createBtn, "Creating Account...");

    try {
      const res = await fetch(`${CONFIG.API_BASE}/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      if (!res.ok) throw new Error();

      setSuccess(el.createBtn, "Account Created");

      setTimeout(() => {
        window.location.href = "/app/nav/dashboard";
      }, 800);

    } catch {
      setError(el.createBtn, "Signup Failed");
      shakeButton(el.createBtn);
    }
  });
}

// ==================================================
function initGoogle() {
  el.googleBtn?.addEventListener("click", () => {
    window.location.href = `${CONFIG.API_BASE}/auth/google`;
  });
}

// ==================================================
function initLinks() {
  el.loginLink?.addEventListener("click", () => {
    window.location.href = "/login";
  });
}

// ==================================================
function setLoading(btn, text) {
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
  btn.disabled = true;
}

function setSuccess(btn, text) {
  btn.innerHTML = `<i class="fas fa-check"></i> ${text}`;
  btn.style.background =
    "linear-gradient(145deg,#2ed573 0%,#1dd1a1 100%)";
}

function setError(btn, text) {
  btn.innerHTML = `<i class="fas fa-times"></i> ${text}`;
  btn.disabled = false;
}

function shakeButton(btn) {
  btn.style.transform = "translateX(8px)";
  setTimeout(() => {
    btn.style.transform = "translateX(-8px)";
    setTimeout(() => (btn.style.transform = "translateX(0)"), 120);
  }, 120);
}

