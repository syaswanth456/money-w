// ======================================================================
// MONEY MANAGER — PAY BILL ENGINE (PRODUCTION)
// Backend-driven • Atomic • Realtime-ready
// ======================================================================

// ----------------------------------------------------------------------
const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
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
  categoryId: null,
  provider: "",
  accountId: null,
  dueDate: null,
  note: ""
};

// ----------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------
const el = {
  amount: document.getElementById("amountInput"),
  provider: document.getElementById("providerInput"),
  note: document.getElementById("noteInput"),
  saveBtn: document.getElementById("saveBtn"),
  backBtn: document.getElementById("backBtn"),

  categorySection: document.getElementById("categorySection"),
  categoryValue: document.getElementById("categoryValue"),

  accountSection: document.getElementById("accountSection"),
  accountValue: document.getElementById("accountValue"),

  dueDateSection: document.getElementById("dueDateSection"),
  dueDateValue: document.getElementById("dueDateValue"),

  categoryPopup: document.getElementById("categoryPopup"),
  categoryList: document.getElementById("categoryList"),

  accountPopup: document.getElementById("accountPopup"),
  accountList: document.getElementById("accountList"),

  dueDatePopup: document.getElementById("dueDatePopup"),
  calendarGrid: document.getElementById("calendarGrid"),

  toast: document.getElementById("actionToast")
};

// ======================================================================
// INIT
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();

    initBack();
    initInputs();
    initPopups();
    initCalendar();
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
// BACK
// ======================================================================
function initBack() {
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

  el.provider?.addEventListener("input", () => {
    state.provider = el.provider.value;
    validateForm();
  });

  el.note?.addEventListener("input", () => {
    state.note = el.note.value;
  });

  el.saveBtn?.addEventListener("click", submitBill);
}

function validateForm() {
  const valid =
    state.amount > 0 &&
    state.categoryId &&
    state.provider.trim() !== "" &&
    state.accountId;

  el.saveBtn.disabled = !valid;
}

// ======================================================================
// CATEGORY POPUP
// ======================================================================
async function openCategoryPopup() {
  el.categoryPopup.classList.add("active");

  const res = await fetch(`${CONFIG.API_BASE}/categories?type=bill`, {
    credentials: "include"
  });

  const data = await res.json();
  const categories = Array.isArray(data?.categories) ? data.categories : [];

  el.categoryList.innerHTML = categories.map(cat => `
    <div class="category-item" data-id="${cat.id}">
      <div class="category-icon">
        <i class="fas fa-${cat.icon || "tag"}"></i>
      </div>
      <div class="category-name">${cat.name}</div>
    </div>
  `).join("");

  el.categoryList.querySelectorAll(".category-item").forEach(item => {
    item.addEventListener("click", () => {
      state.categoryId = item.dataset.id;

      el.categoryValue.innerHTML =
        `<span>${item.querySelector(".category-name").textContent}</span>
         <i class="fas fa-chevron-right"></i>`;

      el.categoryPopup.classList.remove("active");
      validateForm();
    });
  });
}

// ======================================================================
// ACCOUNT POPUP
// ======================================================================
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
// CALENDAR
// ======================================================================
function initCalendar() {
  el.categorySection?.addEventListener("click", openCategoryPopup);
  el.accountSection?.addEventListener("click", openAccountPopup);
}

// ======================================================================
// SUBMIT (ATOMIC)
// ======================================================================
async function submitBill() {
  const payload = {
    amount: state.amount,
    category_id: state.categoryId,
    provider: state.provider,
    account_id: state.accountId,
    due_date: state.dueDate,
    note: state.note
  };

  const res = await fetch(`${CONFIG.API_BASE}/transactions/pay-bill`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    showToast("Payment failed", "error");
    return;
  }

  showToast("Bill paid");
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

