// ======================================================================
// MONEY MANAGER — EXPENSE PAGE (PRODUCTION)
// Matches popup UI • Backend driven • Atomic safe
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
  selectedCategory: null,
  selectedSubcategory: null,
  selectedAccount: null,
  selectedDate: new Date(),
  repeatType: "none"
};

// ----------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------
const el = {
  amount: document.getElementById("amountInput"),
  note: document.getElementById("noteInput"),
  saveBtn: document.getElementById("saveBtn"),
  backBtn: document.getElementById("backBtn"),

  // sections
  categorySection: document.getElementById("categorySection"),
  accountSection: document.getElementById("accountSection"),
  repeatSection: document.getElementById("repeatSection"),
  dateSection: document.getElementById("dateTimeSection"),

  // values
  categoryValue: document.getElementById("categoryValue"),
  accountValue: document.getElementById("accountValue"),
  repeatValue: document.getElementById("repeatValue"),
  dateValue: document.getElementById("dateTimeValue"),

  // popups
  categoryPopup: document.getElementById("categoryPopup"),
  categoryList: document.getElementById("categoryList"),
  accountPopup: document.getElementById("accountPopup"),
  accountList: document.getElementById("accountList"),

  // toast
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
    initRepeat();
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
// BACK BUTTON (SECURE)
// ======================================================================
function initBackButton() {
  el.backBtn?.addEventListener("click", () => {
    secureNavigate("dashboard");
  });
}

// ======================================================================
// INPUT VALIDATION
// ======================================================================
function initInputs() {
  el.amount?.addEventListener("input", validateForm);
  el.saveBtn?.addEventListener("click", submitExpense);
}

function validateForm() {
  const amount = Number(el.amount.value);
  const valid =
    amount > 0 &&
    state.selectedCategory &&
    state.selectedAccount;

  el.saveBtn.disabled = !valid;
}

// ======================================================================
// POPUPS
// ======================================================================
function initPopups() {
  el.categorySection?.addEventListener("click", openCategoryPopup);
  el.accountSection?.addEventListener("click", openAccountPopup);
}

// ----------------------------------------------------------------------
// CATEGORY POPUP
// ----------------------------------------------------------------------
async function openCategoryPopup() {
  el.categoryPopup.classList.add("active");

  const res = await fetch(`${CONFIG.API_BASE}/categories?type=expense`, {
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
      <i class="fas fa-chevron-right category-arrow"></i>
    </div>
  `).join("");

  el.categoryList.querySelectorAll(".category-item").forEach(item => {
    item.addEventListener("click", () => {
      state.selectedCategory = item.dataset.id;

      el.categoryValue.innerHTML =
        `<span>${item.querySelector(".category-name").textContent}</span>`;

      el.categoryPopup.classList.remove("active");
      validateForm();
    });
  });
}

// ----------------------------------------------------------------------
// ACCOUNT POPUP
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
      state.selectedAccount = item.dataset.id;

      el.accountValue.innerHTML =
        `<span>${item.querySelector(".account-name").textContent}</span>`;

      el.accountPopup.classList.remove("active");
      validateForm();
    });
  });
}

// ======================================================================
// REPEAT HANDLING
// ======================================================================
function initRepeat() {
  document.querySelectorAll(".repeat-option").forEach(opt => {
    opt.addEventListener("click", () => {
      state.repeatType = opt.dataset.type;
      el.repeatValue.innerHTML = `<span>${opt.textContent}</span>`;
      document.getElementById("repeatPopup")?.classList.remove("active");
    });
  });
}

// ======================================================================
// DATE DISPLAY
// ======================================================================
function updateDateDisplay() {
  const d = state.selectedDate;

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
// SUBMIT EXPENSE (ATOMIC)
// ======================================================================
async function submitExpense() {
  const payload = {
    amount: Number(el.amount.value),
    category_id: state.selectedCategory,
    account_id: state.selectedAccount,
    note: el.note?.value || "",
    date: state.selectedDate.toISOString(),
    repeat: state.repeatType
  };

  const res = await fetch(`${CONFIG.API_BASE}/transactions/expense`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    showToast("Failed to add expense", "error");
    return;
  }

  showToast("Expense added");
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
