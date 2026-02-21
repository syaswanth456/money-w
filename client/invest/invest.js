// ======================================================================
// MONEY MANAGER — INVEST ENGINE (PRODUCTION)
// Backend-driven • Atomic safe • Realtime ready
// ======================================================================

// ----------------------------------------------------------------------
const CONFIG = {
  API_BASE: window.ENV?.API_BASE || "http://localhost:3000"
};

// ----------------------------------------------------------------------
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
  typeId: null,
  accountId: null,
  name: "",
  date: new Date(),
  note: ""
};

// ----------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------
const el = {
  amount: document.getElementById("amountInput"),
  name: document.getElementById("nameInput"),
  note: document.getElementById("noteInput"),
  saveBtn: document.getElementById("saveBtn"),
  backBtn: document.getElementById("backBtn"),

  typeSection: document.getElementById("typeSection"),
  typeValue: document.getElementById("typeValue"),

  accountSection: document.getElementById("accountSection"),
  accountValue: document.getElementById("accountValue"),

  dateSection: document.getElementById("dateSection"),
  dateValue: document.getElementById("dateValue"),

  typePopup: document.getElementById("typePopup"),
  typeList: document.getElementById("typeList"),

  accountPopup: document.getElementById("accountPopup"),
  accountList: document.getElementById("accountList"),

  toast: document.getElementById("actionToast")
};

// ======================================================================
// INIT
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();

    initBackButton();
    initInputs();
    initPopups();
    updateDateDisplay();
  } catch (err) {
    console.error(err);
  }
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
// BACK BUTTON
// ======================================================================
function initBackButton() {
  el.backBtn?.addEventListener("click", () => {
    secureNavigate("dashboard");
  });
}

// ======================================================================
// INPUTS
// ======================================================================
function initInputs() {
  el.amount?.addEventListener("input", () => {
    state.amount = Number(el.amount.value || 0);
    validateForm();
  });

  el.name?.addEventListener("input", () => {
    state.name = el.name.value;
    validateForm();
  });

  el.note?.addEventListener("input", () => {
    state.note = el.note.value;
  });

  el.saveBtn?.addEventListener("click", submitInvestment);
}

function validateForm() {
  const valid =
    state.amount > 0 &&
    state.typeId &&
    state.accountId &&
    state.name.trim() !== "";

  el.saveBtn.disabled = !valid;
}

// ======================================================================
// POPUPS
// ======================================================================
function initPopups() {
  el.typeSection?.addEventListener("click", openTypePopup);
  el.accountSection?.addEventListener("click", openAccountPopup);
}

// ----------------------------------------------------------------------
// LOAD INVEST TYPES
// ----------------------------------------------------------------------
async function openTypePopup() {
  el.typePopup.classList.add("active");

  const res = await fetch(`${CONFIG.API_BASE}/invest/types`, {
    credentials: "include"
  });

  const data = await res.json();
  const types = Array.isArray(data?.types) ? data.types : [];

  el.typeList.innerHTML = types.map(t => `
    <div class="investment-item" data-id="${t.id}">
      <div class="investment-icon">
        <i class="fas fa-${t.icon || "chart-line"}"></i>
      </div>
      <div class="investment-name">${t.name}</div>
    </div>
  `).join("");

  el.typeList.querySelectorAll(".investment-item").forEach(item => {
    item.addEventListener("click", () => {
      state.typeId = item.dataset.id;
      el.typeValue.innerHTML =
        `<span>${item.querySelector(".investment-name").textContent}</span>
         <i class="fas fa-chevron-right"></i>`;
      el.typePopup.classList.remove("active");
      validateForm();
    });
  });
}

// ----------------------------------------------------------------------
// LOAD ACCOUNTS
// ----------------------------------------------------------------------
async function openAccountPopup() {
  el.accountPopup.classList.add("active");

  const res = await fetch(`${CONFIG.API_BASE}/accounts`, {
    credentials: "include"
  });

  const data = await res.json();
  const accounts = Array.isArray(data) ? data : (Array.isArray(data?.accounts) ? data.accounts : []);

  el.accountList.innerHTML = accounts.map(acc => `
    <div class="account-item" data-id="${acc.id}">
      <div class="account-icon">
        <i class="fas fa-wallet"></i>
      </div>
      <div class="account-info">
        <div class="account-name">${acc.name}</div>
        <div class="account-balance">${formatMoney(acc.balance)}</div>
      </div>
    </div>
  `).join("");

  el.accountList.querySelectorAll(".account-item").forEach(item => {
    item.addEventListener("click", () => {
      state.accountId = item.dataset.id;
      el.accountValue.innerHTML =
        `<span>${item.querySelector(".account-name").textContent}</span>
         <i class="fas fa-chevron-right"></i>`;
      el.accountPopup.classList.remove("active");
      validateForm();
    });
  });
}

// ======================================================================
// DATE DISPLAY
// ======================================================================
function updateDateDisplay() {
  const d = state.date;

  el.dateValue.innerHTML = `
    <div>${d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short"
    })}</div>
    <i class="fas fa-chevron-right"></i>
  `;
}

// ======================================================================
// SUBMIT INVESTMENT (ATOMIC)
// ======================================================================
async function submitInvestment() {
  const payload = {
    amount: state.amount,
    type_id: state.typeId,
    account_id: state.accountId,
    name: state.name,
    note: state.note,
    date: state.date.toISOString()
  };

  const res = await fetch(`${CONFIG.API_BASE}/investments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    showToast("Investment failed", "error");
    return;
  }

  showToast("Investment logged");
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
