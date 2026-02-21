// ======================================================================
// MONEY MANAGER — TRANSFER ENGINE (PRODUCTION)
// Atomic • Secure • Realtime-ready
// ======================================================================

const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
};

const ROUTES = {
  dashboard: "/app/nav/dashboard"
};

function secureNavigate(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

// ----------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------
const state = {
  amount: 0,
  fromAccount: null,
  toAccount: null,
  type: "transfer",
  repeat: "none",
  date: new Date()
};

// ----------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------
const el = {
  amount: document.getElementById("amountInput"),
  saveBtn: document.getElementById("saveBtn"),
  backBtn: document.getElementById("backBtn"),

  fromSection: document.getElementById("fromAccountSection"),
  toSection: document.getElementById("toAccountSection"),

  fromValue: document.getElementById("fromAccountValue"),
  toValue: document.getElementById("toAccountValue"),

  accountPopup: document.getElementById("accountPopup"),
  accountList: document.getElementById("accountList"),
  accountPopupClose: document.getElementById("accountPopupClose"),

  toast: document.getElementById("actionToast")
};

// ======================================================================
// INIT
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();

  initBack();
  initInputs();
  initAccountPickers();
  initTypeSelector();
  el.accountPopupClose?.addEventListener("click", () => {
    el.accountPopup.classList.remove("active");
  });
});

// ======================================================================
// AUTH
// ======================================================================
async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, {
    credentials: "include"
  });

  if (!res.ok) window.location.href = "/login/login.html";
}

// ======================================================================
// BACK
// ======================================================================
function initBack() {
  el.backBtn?.addEventListener("click", () =>
    secureNavigate("dashboard")
  );
}

// ======================================================================
// INPUTS
// ======================================================================
function initInputs() {
  el.amount?.addEventListener("input", () => {
    state.amount = Number(el.amount.value || 0);
    validateForm();
  });

  el.saveBtn?.addEventListener("click", submitTransfer);
}

// ======================================================================
// TYPE SELECTOR
// ======================================================================
function initTypeSelector() {
  document.querySelectorAll(".type-option").forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".type-option")
        .forEach(b => b.classList.remove("selected"));

      btn.classList.add("selected");
      state.type = btn.dataset.type;
    });
  });
}

// ======================================================================
// ACCOUNT PICKERS
// ======================================================================
function initAccountPickers() {
  el.fromSection?.addEventListener("click", () =>
    openAccountPopup("from")
  );

  el.toSection?.addEventListener("click", () =>
    openAccountPopup("to")
  );
}

async function openAccountPopup(mode) {
  el.accountPopup.classList.add("active");

  const res = await fetch(`${CONFIG.API_BASE}/accounts`, {
    credentials: "include"
  });

  const data = await res.json();
  const accounts = Array.isArray(data) ? data : (Array.isArray(data?.accounts) ? data.accounts : []);

  el.accountList.innerHTML = accounts.map(acc => `
    <div class="account-item" data-id="${acc.id}">
      <div class="account-name">${acc.name}</div>
      <div class="account-balance">${formatMoney(acc.balance)}</div>
    </div>
  `).join("");

  el.accountList.querySelectorAll(".account-item").forEach(item => {
    item.addEventListener("click", () => {
      if (mode === "from") {
        state.fromAccount = item.dataset.id;
        el.fromValue.innerHTML =
          `<span>${item.querySelector(".account-name").textContent}</span>
           <i class="fas fa-chevron-right"></i>`;
      } else {
        state.toAccount = item.dataset.id;
        el.toValue.innerHTML =
          `<span>${item.querySelector(".account-name").textContent}</span>
           <i class="fas fa-chevron-right"></i>`;
      }

      el.accountPopup.classList.remove("active");
      validateForm();
    });
  });
}

// ======================================================================
// VALIDATION
// ======================================================================
function validateForm() {
  const valid =
    state.amount > 0 &&
    state.fromAccount &&
    (state.type !== "transfer" || state.toAccount);

  el.saveBtn.disabled = !valid;
}

// ======================================================================
// SUBMIT (ATOMIC)
// ======================================================================
async function submitTransfer() {
  if (state.type !== "transfer") {
    showToast("Only account-to-account transfer is supported now", "error");
    return;
  }

  const payload = {
    amount: state.amount,
    from_account_id: state.fromAccount,
    to_account_id: state.toAccount,
    type: state.type,
    date: state.date.toISOString()
  };

  const res = await fetch(`${CONFIG.API_BASE}/transfer`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    showToast("Transfer failed", "error");
    return;
  }

  showToast("Transfer completed");
  setTimeout(() => secureNavigate("dashboard"), 900);
}

// ======================================================================
// HELPERS
// ======================================================================
function formatMoney(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2
  });
}

function showToast(message, type = "success") {
  if (!el.toast) return;

  const icon = el.toast.querySelector("i");
  const msg = el.toast.querySelector(".toast-message");

  icon.className =
    type === "error"
      ? "fas fa-exclamation-circle"
      : "fas fa-check-circle";

  msg.textContent = message;
  el.toast.classList.add("show");

  setTimeout(() => el.toast.classList.remove("show"), 3000);
}

