// ======================================================================
// MONEY MANAGER — ACCOUNTS PAGE (SECURE PRODUCTION)
// Backend-driven • Realtime-ready • No direct HTML exposure
// ======================================================================

// ----------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------
const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
};

// ----------------------------------------------------------------------
// SECURE ROUTES
// ----------------------------------------------------------------------
const ROUTES = {
  dashboard: "/app/nav/dashboard",
  accounts: "/app/nav/accounts",
  transactions: "/app/nav/transactions",
  categories: "/app/nav/categories",
  settings: "/app/nav/settings",
  accountDetail: "/app/nav/account-detail"
};

function secureNavigate(key, query = "") {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path + query;
}

// ----------------------------------------------------------------------
// STATE
// ----------------------------------------------------------------------
const state = {
  accounts: [],
  socket: null
};

// ----------------------------------------------------------------------
// DOM
// ----------------------------------------------------------------------
const el = {
  cashAccounts: document.getElementById("cashAccounts"),
  bankAccounts: document.getElementById("bankAccounts"),
  walletAccounts: document.getElementById("walletAccounts"),
  creditAccounts: document.getElementById("creditCardAccounts"),
  loanAccounts: document.getElementById("loanAccounts"),

  assetsTotal: document.getElementById("assetsTotal"),
  liabilitiesTotal: document.getElementById("liabilitiesTotal"),
  netWorth: document.getElementById("netWorth"),
  totalBalance: document.getElementById("totalBalanceAmount"),

  cashTotal: document.getElementById("cashTotal"),
  bankTotal: document.getElementById("bankTotal"),
  walletTotal: document.getElementById("walletTotal"),
  creditTotal: document.getElementById("creditCardTotal"),
  loanTotal: document.getElementById("loanTotal"),

  addAccountBtn: document.getElementById("addAccountBtn"),
  editModal: document.getElementById("editAccountModal"),
  editForm: document.getElementById("editAccountForm"),
  modalClose: document.getElementById("editAccountModalClose"),

  sideMenu: document.getElementById("mobileSideMenu"),
  menuBtn: document.getElementById("mobileMenuBtn"),
  menuOverlay: document.getElementById("menuOverlay"),
  menuClose: document.getElementById("menuClose"),
  logoutBtn: document.getElementById("logoutBtn"),

  toast: document.getElementById("actionToast")
};

// ======================================================================
// INIT
// ======================================================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    await loadAccounts();

    initMenu();
    initSecureLinks();
    initAddAccount();
    initRealtime();

    showToast("Accounts synced");
  } catch (err) {
    console.error(err);
    showToast("Failed to load accounts", "error");
  }
});

// ======================================================================
// AUTH CHECK
// ======================================================================
async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, {
    credentials: "include"
  });

  if (!res.ok) {
    window.location.href = "/login/login.html";
  }
}

// ======================================================================
// LOAD ACCOUNTS
// ======================================================================
async function loadAccounts() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/accounts`, {
      credentials: "include"
    });

    if (!res.ok) {
      state.accounts = [];
      renderAccounts();
      updateTotals();
      return;
    }

    const data = await res.json();
    state.accounts = Array.isArray(data) ? data : (data?.accounts || []);

    renderAccounts();
    updateTotals();
  } catch (err) {
    console.error("Accounts load failed:", err);
    state.accounts = [];
    renderAccounts();
    updateTotals();
  }
}

// ======================================================================
// RENDER ACCOUNTS
// ======================================================================
function renderAccounts() {
  const groups = {
    cash: [],
    bank: [],
    wallet: [],
    credit: [],
    loan: []
  };

  state.accounts.forEach(acc => {
    if (groups[acc.type]) groups[acc.type].push(acc);
  });

  renderGroup(el.cashAccounts, groups.cash);
  renderGroup(el.bankAccounts, groups.bank);
  renderGroup(el.walletAccounts, groups.wallet);
  renderGroup(el.creditAccounts, groups.credit, true);
  renderGroup(el.loanAccounts, groups.loan, true);
}

function renderGroup(container, list, isLiability = false) {
  if (!container) return;

  if (!list.length) {
    container.innerHTML =
      `<div style="padding:16px;color:#94A3B8">No accounts</div>`;
    return;
  }

  container.innerHTML = list.map(acc => {
    const negative =
      isLiability || acc.type === "credit" || acc.type === "loan";

    return `
      <div class="account-card glass-card" data-id="${acc.id}">
        <div class="account-icon ${acc.type}">
          <i class="fas fa-${acc.icon || "wallet"}"></i>
        </div>
        <div class="account-info">
          <div class="account-name">${acc.name}</div>
          <div class="account-details">${acc.account_number || ""}</div>
        </div>
        <div class="account-balance">
          <div class="balance-amount ${negative ? "negative" : "positive"}">
            ${formatMoney(acc.balance)}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // click → secure detail page
  container.onclick = (event) => {
    const card = event.target.closest(".account-card");
    if (!card) return;
    const id = card.dataset.id;
    if (!id) return;
    secureNavigate("accountDetail", `?id=${encodeURIComponent(id)}`);
  };
}

// ======================================================================
// TOTALS ENGINE
// ======================================================================
function updateTotals() {
  let assets = 0;
  let liabilities = 0;

  const sectionTotals = {
    cash: 0,
    bank: 0,
    wallet: 0,
    credit: 0,
    loan: 0
  };

  state.accounts.forEach(acc => {
    const value = Number(acc.balance || 0);

    if (acc.type === "credit" || acc.type === "loan") {
      liabilities += value;
    } else {
      assets += value;
    }

    if (sectionTotals[acc.type] !== undefined) {
      sectionTotals[acc.type] += value;
    }
  });

  const net = assets - liabilities;

  // top stats
  el.assetsTotal && (el.assetsTotal.textContent = formatMoney(assets));
  el.liabilitiesTotal &&
    (el.liabilitiesTotal.textContent = formatMoney(liabilities));
  el.netWorth && (el.netWorth.textContent = formatMoney(net));
  el.totalBalance && (el.totalBalance.textContent = formatMoney(net));

  // section totals
  el.cashTotal && (el.cashTotal.textContent = formatMoney(sectionTotals.cash));
  el.bankTotal && (el.bankTotal.textContent = formatMoney(sectionTotals.bank));
  el.walletTotal &&
    (el.walletTotal.textContent = formatMoney(sectionTotals.wallet));
  el.creditTotal &&
    (el.creditTotal.textContent = formatMoney(sectionTotals.credit));
  el.loanTotal &&
    (el.loanTotal.textContent = formatMoney(sectionTotals.loan));
}

// ======================================================================
// ADD ACCOUNT MODAL
// ======================================================================
function initAddAccount() {
  el.addAccountBtn?.addEventListener("click", () => {
    el.editModal.classList.add("active");
  });

  el.modalClose?.addEventListener("click", () => {
    el.editModal.classList.remove("active");
  });

  el.editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("editAccountName").value,
      type: document.getElementById("editAccountType").value,
      balance: Number(
        document.getElementById("editAccountBalance").value || 0
      )
    };

    const res = await fetch(`${CONFIG.API_BASE}/accounts`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      showToast("Failed to add account", "error");
      return;
    }

    el.editModal.classList.remove("active");
    await loadAccounts();
    showToast("Account added");
  });
}

// ======================================================================
// SECURE NAV LINKS
// ======================================================================
function initSecureLinks() {
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      secureNavigate(link.dataset.nav);
    });
  });
}

// ======================================================================
// MENU
// ======================================================================
function initMenu() {
  el.menuBtn?.addEventListener("click", () =>
    el.sideMenu.classList.add("active")
  );

  el.menuOverlay?.addEventListener("click", closeMenu);
  el.menuClose?.addEventListener("click", closeMenu);

  el.logoutBtn?.addEventListener("click", async () => {
    await fetch(`${CONFIG.API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    window.location.href = "/index.html";
  });
}

function closeMenu() {
  el.sideMenu.classList.remove("active");
}

// ======================================================================
// HELPERS
// ======================================================================
function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
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
// ======================================================================
// REALTIME CLIENT
// ======================================================================

function initRealtime() {
  if (!window.io) return;

  const socket = io(CONFIG.API_BASE, {
    transports: ["websocket"],
    withCredentials: true
  });

  socket.on("accounts:updated", () => {
    if (typeof loadAccounts === "function") loadAccounts();
  });

  socket.on("transactions:updated", () => {
    if (typeof loadTransactions === "function") loadTransactions();
  });

  socket.on("dashboard:updated", () => {
    if (typeof loadDashboard === "function") loadDashboard();
  });
}

