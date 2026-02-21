// ======================================================
// MONEY MANAGER — LOGIN ENGINE (PRODUCTION)
// ======================================================

const CONFIG = {
  API_BASE: window.ENV?.API_BASE || ""
};

document.addEventListener("DOMContentLoaded", () => {
  // ==================== SAFE ELEMENT HELPER ====================
  const $ = (selector) => document.querySelector(selector);

  // ==================== UI Animation Functions ====================
  function setupMobileAnimation() {
    const card1 = $("#mobileView .card-1");
    const card2 = $("#mobileView .card-2");
    const card3 = $("#mobileView .card-3");
    const loginFormContainer = $("#mobileView .login-form-container");
    const closeFormBtn = $("#mobileView #closeFormBtn");
    const frontCard = $("#mobileView #frontCard");
    const forgotPasswordBtn = $("#mobileView #forgotPasswordBtn");
    const createAccountBtn = $("#mobileView #createAccountBtn");

    if (!card1 || !card2 || !card3) return;

    let animationCompleted = false;

    function startAnimation() {
      card1.classList.remove("active", "card-expanded");
      card2.classList.remove("active");
      card3.classList.remove("active");
      loginFormContainer?.classList.remove("visible");

      $("#forgotPasswordModal")?.classList.remove("active");
      $("#createAccountModal")?.classList.remove("active");

      setTimeout(() => card3.classList.add("active"), 300);
      setTimeout(() => card2.classList.add("active"), 600);
      setTimeout(() => {
        card1.classList.add("active");
        animationCompleted = true;
      }, 900);
    }

    setTimeout(startAnimation, 500);

    closeFormBtn?.addEventListener("click", () => {
      loginFormContainer?.classList.remove("visible");
      setTimeout(() => card1.classList.remove("card-expanded"), 300);
    });

    frontCard?.addEventListener("click", () => {
      if (animationCompleted && !card1.classList.contains("card-expanded")) {
        card1.classList.add("card-expanded");
        setTimeout(() => loginFormContainer?.classList.add("visible"), 400);
      }
    });

    forgotPasswordBtn?.addEventListener("click", () => {
      $("#forgotPasswordModal")?.classList.add("active");
    });

    createAccountBtn?.addEventListener("click", () => {
      $("#createAccountModal")?.classList.add("active");
    });
  }

  function setupDesktopAnimation() {
    const card1 = $("#desktopView .card-1");
    const card2 = $("#desktopView .card-2");
    const card3 = $("#desktopView .card-3");
    const loginFormContainer = $("#desktopView .login-form-container");
    const closeFormBtn = $("#desktopView #closeFormBtnDesktop");
    const frontCard = $("#desktopView #frontCardDesktop");
    const forgotPasswordBtn = $("#desktopView #forgotPasswordBtnDesktop");
    const createAccountBtn = $("#desktopView #createAccountBtnDesktop");

    if (!card1 || !card2 || !card3) return;

    let animationCompleted = false;

    function startDesktopAnimation() {
      card1.classList.remove("active", "card-expanded");
      card2.classList.remove("active");
      card3.classList.remove("active");
      loginFormContainer?.classList.remove("visible");

      setTimeout(() => card3.classList.add("active"), 300);
      setTimeout(() => card2.classList.add("active"), 600);
      setTimeout(() => {
        card1.classList.add("active");
        animationCompleted = true;
      }, 900);
    }

    startDesktopAnimation();

    closeFormBtn?.addEventListener("click", () => {
      loginFormContainer?.classList.remove("visible");
      setTimeout(() => card1.classList.remove("card-expanded"), 300);
    });

    frontCard?.addEventListener("click", () => {
      if (animationCompleted && !card1.classList.contains("card-expanded")) {
        card1.classList.add("card-expanded");
        setTimeout(() => loginFormContainer?.classList.add("visible"), 400);
      }
    });

    forgotPasswordBtn?.addEventListener("click", () => {
      $("#forgotPasswordModal")?.classList.add("active");
    });

    createAccountBtn?.addEventListener("click", () => {
      $("#createAccountModal")?.classList.add("active");
    });
  }

  // ==================== LOGIN ====================
  async function handleLogin(event) {
    const button = event.currentTarget;
    const isMobile = button.id === "loginButton";

    const email = $(
      isMobile ? "#mobileView #email" : "#desktopView #emailDesktop"
    )?.value.trim();

    const password = $(
      isMobile ? "#mobileView #password" : "#desktopView #passwordDesktop"
    )?.value;

    if (!email || !password) {
      showNotification("Please fill in both fields", "error");
      return;
    }

    const originalText = button.innerHTML;
    button.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
    button.disabled = true;

    try {
      const response = await fetch(`${CONFIG.API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      showNotification("Login successful! Redirecting...", "success");

      setTimeout(() => {
        window.location.href = "/app/nav/dashboard";
      }, 800);
    } catch (err) {
      showNotification(err.message, "error");
      button.innerHTML = originalText;
      button.disabled = false;
    }
  }

  // ==================== SIGNUP ====================
  async function handleSignup() {
    const name = $("#signupName")?.value.trim();
    const email = $("#signupEmail")?.value.trim();
    const password = $("#signupPassword")?.value;
    const confirm = $("#signupConfirmPassword")?.value;
    const button = $("#confirmCreateAccount");

    if (!name || !email || !password || !confirm) {
      showNotification("All fields are required", "error");
      return;
    }

    if (password !== confirm) {
      showNotification("Passwords do not match", "error");
      return;
    }

    const originalText = button.innerHTML;
    button.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    button.disabled = true;

    try {
      const response = await fetch(`${CONFIG.API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Signup failed");
      }

      $("#createAccountModal")?.classList.remove("active");

      $("#signupName").value = "";
      $("#signupEmail").value = "";
      $("#signupPassword").value = "";
      $("#signupConfirmPassword").value = "";

      showNotification("Account created successfully!", "success");
    } catch (err) {
      showNotification(err.message, "error");
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
    }
  }

  // ==================== FORGOT ====================
  function handleForgotPassword() {
    const email = $("#resetEmail")?.value.trim();
    if (!email) {
      showNotification("Please enter your email", "error");
      return;
    }
    showNotification("Password reset not implemented", "info");
  }

  // ==================== MODALS ====================
  function setupGlobalModals() {
    $("#cancelReset")?.addEventListener("click", () =>
      $("#forgotPasswordModal")?.classList.remove("active")
    );

    $("#cancelCreate")?.addEventListener("click", () =>
      $("#createAccountModal")?.classList.remove("active")
    );

    $("#sendResetLink")?.addEventListener("click", handleForgotPassword);
    $("#confirmCreateAccount")?.addEventListener("click", handleSignup);

    window.addEventListener("click", (e) => {
      if (e.target === $("#forgotPasswordModal"))
        $("#forgotPasswordModal")?.classList.remove("active");
      if (e.target === $("#createAccountModal"))
        $("#createAccountModal")?.classList.remove("active");
    });
  }

  // ==================== NOTIFICATION ====================
  function showNotification(message, type = "info") {
    const colors = {
      success: "linear-gradient(145deg,#2ed573,#1dd1a1)",
      error: "linear-gradient(145deg,#ff4757,#ff3838)",
      info: "linear-gradient(145deg,#0596D7,#037AB3)",
    };

    const notification = document.createElement("div");
    notification.style.cssText = `
      position:fixed;
      top:20px;
      right:20px;
      background:${colors[type]};
      color:#fff;
      padding:15px 25px;
      border-radius:10px;
      z-index:10000;
      font-weight:500;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 3000);
  }

  // ==================== LISTENERS ====================
  $("#loginButton")?.addEventListener("click", handleLogin);
  $("#loginButtonDesktop")?.addEventListener("click", handleLogin);

  $("#googleSignIn")?.addEventListener("click", () =>
    showNotification("Google sign-in not implemented", "info")
  );
  $("#googleSignInDesktop")?.addEventListener("click", () =>
    showNotification("Google sign-in not implemented", "info")
  );

  // ==================== INIT ====================
  setupMobileAnimation();
  setupDesktopAnimation();
  setupGlobalModals();

  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("focus", function () {
      this.parentElement?.querySelector("i")?.style.setProperty(
        "color",
        "#0596D7"
      );
    });
    input.addEventListener("blur", function () {
      if (!this.value) {
        this.parentElement?.querySelector("i")?.style.setProperty(
          "color",
          "#aaa"
        );
      }
    });
  });
});
