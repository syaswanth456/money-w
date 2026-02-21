const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
};

const ROUTES = {
  dashboard: "/app/nav/dashboard",
  accounts: "/app/nav/accounts",
  transactions: "/app/nav/transactions",
  categories: "/app/nav/categories",
  settings: "/app/nav/settings",
  income: "/app/nav/income",
  expense: "/app/nav/expense",
  transfer: "/app/nav/transfer"
};

const state = {
  accountId: null,
  account: null,
  transactions: [],
  categories: [],
  socket: null
};

const el = {
  title: document.getElementById("accountName"),
  balance: document.getElementById("accountCurrentBalance"),
  deposits: document.getElementById("accountTotalDeposits"),
  withdrawals: document.getElementById("accountTotalWithdrawals"),
  available: document.getElementById("accountAvailableLimit"),
  txList: document.getElementById("accountTransactionsList"),
  breakdown: document.getElementById("categoryBreakdownList"),
  categoryFilter: document.getElementById("categoryFilter"),
  trendCanvas: document.getElementById("accountTrendCanvas"),
  toast: document.getElementById("actionToast"),
  deleteBtn: document.getElementById("deleteAccountBtn"),
  editBtn: document.getElementById("editAccountBtn"),
  editModal: document.getElementById("editAccountModal"),
  editClose: document.getElementById("editAccountModalClose"),
  editForm: document.getElementById("editAccountForm"),
  editName: document.getElementById("editAccountName"),
  editBalance: document.getElementById("editAccountBalance"),
  editLimit: document.getElementById("editAccountLimit"),
  addIncome: document.getElementById("addIncomeBtn"),
  addExpense: document.getElementById("addExpenseBtn"),
  makePayment: document.getElementById("makePaymentBtn")
};

function secureNavigate(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    readAccountId();
    await Promise.all([loadAccount(), loadTransactions(), loadCategories()]);
    initLinks();
    initActions();
    initRealtime();
    window.addEventListener("resize", drawTrendGraph);
  } catch (err) {
    console.error(err);
    showToast("Failed to load account", "error");
  }
});

async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) window.location.href = "/login/login.html";
}

async function loadCategories() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/categories`, { credentials: "include" });
    const data = res.ok ? await res.json() : {};
    state.categories = normalizeCategoriesPayload(data);
    renderCategoryFilter();
  } catch {
    state.categories = [];
    renderCategoryFilter();
  }
}

function renderCategoryFilter() {
  if (!el.categoryFilter) return;
  const options = state.categories.map((c) =>
    `<option value="${escapeHtml(String(c.id || ""))}">${escapeHtml(c.name || "Category")}</option>`
  ).join("");
  el.categoryFilter.innerHTML = `<option value="all">All Categories</option>${options}`;
}

function readAccountId() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    secureNavigate("accounts");
    return;
  }
  state.accountId = id;
}

async function loadAccount() {
  const res = await fetch(`${CONFIG.API_BASE}/accounts/${state.accountId}`, { credentials: "include" });
  if (!res.ok) {
    secureNavigate("accounts");
    return;
  }

  const data = await res.json();
  state.account = data?.account || null;
  renderAccount();
}

async function loadTransactions() {
  const res = await fetch(`${CONFIG.API_BASE}/transactions/account/${state.accountId}`, {
    credentials: "include"
  });
  const data = await res.json();
  state.transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  renderTransactions();
  renderBreakdown();
  updateSummary();
  drawTrendGraph();
}

function renderAccount() {
  if (!state.account) return;
  if (el.title) el.title.textContent = state.account.name || "Account";
  if (el.balance) el.balance.textContent = formatMoney(state.account.balance || 0);

  const isCredit = state.account.type === "credit";
  const limit = Number(state.account.credit_limit || 0);
  const bal = Number(state.account.balance || 0);
  if (el.available) {
    el.available.textContent = isCredit ? formatMoney(Math.max(0, limit - bal)) : formatMoney(0);
  }
}

function updateSummary() {
  let deposits = 0;
  let withdrawals = 0;

  for (const t of state.transactions) {
    const amount = Number(t.amount || 0);
    const type = String(t.type || "").toLowerCase();
    if (type === "income" || amount > 0) deposits += Math.abs(amount);
    else withdrawals += Math.abs(amount);
  }

  if (el.deposits) el.deposits.textContent = formatMoney(deposits);
  if (el.withdrawals) el.withdrawals.textContent = formatMoney(withdrawals);
}

function renderTransactions() {
  if (!el.txList) return;

  if (!state.transactions.length) {
    el.txList.innerHTML = "<div style=\"text-align:center;padding:24px;color:#94A3B8\">No transactions found</div>";
    return;
  }

  el.txList.innerHTML = state.transactions.map((t) => {
    const type = String(t.type || "").toLowerCase();
    const amount = Number(t.amount || 0);
    const positive = type === "income" || amount > 0;
    const label = t.note || type || "Transaction";

    return `
      <div class="transaction-item-mobile glass-card">
        <div class="transaction-icon-mobile"><i class="fas fa-receipt"></i></div>
        <div class="transaction-details-mobile">
          <div class="transaction-title">${escapeHtml(label)}</div>
          <div class="transaction-info">${escapeHtml(type)}</div>
        </div>
        <div class="transaction-amount-mobile ${positive ? "positive" : "negative"}">
          ${positive ? "+" : "-"}${formatMoney(Math.abs(amount))}
        </div>
      </div>
    `;
  }).join("");
}

function renderBreakdown() {
  if (!el.breakdown) return;
  const totals = new Map();
  for (const t of state.transactions) {
    const key = String(t.type || "other").toUpperCase();
    totals.set(key, (totals.get(key) || 0) + Number(t.amount || 0));
  }
  const entries = Array.from(totals.entries());
  if (!entries.length) {
    el.breakdown.innerHTML = "<div style=\"padding:8px;color:#94A3B8\">No category data</div>";
    return;
  }
  el.breakdown.innerHTML = entries.map(([name, amt]) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0">
      <span>${escapeHtml(name)}</span>
      <strong>${formatMoney(amt)}</strong>
    </div>
  `).join("");
}

function initLinks() {
  document.querySelectorAll("[data-nav]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.preventDefault();
      secureNavigate(node.dataset.nav);
    });
  });
}

function initActions() {
  el.addIncome?.addEventListener("click", () => secureNavigate("income"));
  el.addExpense?.addEventListener("click", () => secureNavigate("expense"));
  el.makePayment?.addEventListener("click", () => secureNavigate("transfer"));
  el.deleteBtn?.addEventListener("click", deleteAccount);

  el.editBtn?.addEventListener("click", () => {
    if (!state.account) return;
    if (el.editName) el.editName.value = state.account.name || "";
    if (el.editBalance) el.editBalance.value = Number(state.account.balance || 0);
    if (el.editLimit) el.editLimit.value = Number(state.account.credit_limit || 0);
    el.editModal?.classList.add("active");
  });

  el.editClose?.addEventListener("click", () => el.editModal?.classList.remove("active"));

  el.editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: el.editName?.value || "",
      balance: Number(el.editBalance?.value || 0),
      credit_limit: Number(el.editLimit?.value || 0)
    };

    const res = await fetch(`${CONFIG.API_BASE}/accounts/${state.accountId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      showToast("Failed to update account", "error");
      return;
    }

    el.editModal?.classList.remove("active");
    await loadAccount();
    showToast("Account updated");
  });
}

async function deleteAccount() {
  if (!state.accountId) return;
  const ok = window.confirm(`Delete ${state.account?.name || "this account"}? This will remove linked transactions.`);
  if (!ok) return;

  try {
    const res = await fetch(`${CONFIG.API_BASE}/accounts/${state.accountId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(payload.error || "Failed to delete account", "error");
      return;
    }
    showToast("Account deleted");
    setTimeout(() => secureNavigate("accounts"), 320);
  } catch {
    showToast("Failed to delete account", "error");
  }
}

function drawTrendGraph() {
  const canvas = el.trendCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth || 360;
  const height = canvas.clientHeight || 170;
  canvas.width = width;
  canvas.height = height;

  const padTop = 16;
  const padRight = 10;
  const padBottom = 22;
  const padLeft = 10;
  const innerW = Math.max(1, width - padLeft - padRight);
  const innerH = Math.max(1, height - padTop - padBottom);
  const now = new Date();
  const days = 14;
  const labels = [];
  const dailyDelta = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    labels.push(key);
    dailyDelta.set(key, 0);
  }

  for (const t of state.transactions) {
    const created = new Date(t.created_at || t.date || 0);
    if (Number.isNaN(created.getTime())) continue;
    created.setHours(0, 0, 0, 0);
    const key = created.toISOString().slice(0, 10);
    if (!dailyDelta.has(key)) continue;
    const amount = Math.abs(Number(t.amount || 0));
    const type = String(t.type || "").toLowerCase();
    const signed = type === "income" ? amount : -amount;
    dailyDelta.set(key, Number(dailyDelta.get(key) || 0) + signed);
  }

  const currentBalance = Number(state.account?.balance || 0);
  const totalWindowDelta = Array.from(dailyDelta.values()).reduce((sum, x) => sum + Number(x || 0), 0);
  let running = currentBalance - totalWindowDelta;
  const values = [running];
  for (const key of labels) {
    running += Number(dailyDelta.get(key) || 0);
    values.push(running);
  }

  ctx.clearRect(0, 0, width, height);

  if (values.length <= 1 || state.transactions.length === 0) {
    ctx.fillStyle = "#64748B";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Add transactions to see account trend", width / 2, height / 2);
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const xStep = innerW / Math.max(1, values.length - 1);

  ctx.strokeStyle = "rgba(148,163,184,0.24)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padTop + (i / 3) * innerH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
  }

  const points = values.map((v, i) => {
    const x = padLeft + i * xStep;
    const y = padTop + (1 - (v - min) / range) * innerH;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.28)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.02)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padBottom);
  points.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, height - padBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = "#2563EB";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#2563EB";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();

  ctx.font = "600 10px Inter, sans-serif";
  ctx.fillStyle = "#64748B";
  ctx.textAlign = "right";
  ctx.fillText(formatMoney(max), width - 6, padTop + 8);
  ctx.fillText(formatMoney(min), width - 6, height - padBottom - 2);

  const firstLabel = new Date(labels[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastLabel = new Date(labels[labels.length - 1]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  ctx.textAlign = "left";
  ctx.fillText(firstLabel, padLeft, height - 6);
  ctx.textAlign = "right";
  ctx.fillText(lastLabel, width - padRight, height - 6);
}

function initRealtime() {
  if (!window.io) return;
  state.socket = io(CONFIG.API_BASE, { transports: ["websocket"], withCredentials: true });
  state.socket.on("transactions:updated", loadTransactions);
  state.socket.on("accounts:updated", loadAccount);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showToast(message, type = "success") {
  if (!el.toast) return;
  const icon = el.toast.querySelector("i");
  const msg = el.toast.querySelector(".toast-message");
  icon.className = type === "error" ? "fas fa-exclamation-circle" : "fas fa-check-circle";
  msg.textContent = message;
  el.toast.classList.add("show");
  setTimeout(() => el.toast.classList.remove("show"), 2500);
}

function normalizeCategoriesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  const categories = payload?.categories;
  if (Array.isArray(categories)) return categories;
  if (categories && typeof categories === "object") {
    const income = Array.isArray(categories.income) ? categories.income : [];
    const expense = Array.isArray(categories.expense) ? categories.expense : [];
    const bill = Array.isArray(categories.bill) ? categories.bill : [];
    return [...income, ...expense, ...bill];
  }
  return [];
}

