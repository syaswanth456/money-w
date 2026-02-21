const CONFIG = {
  API_BASE: window.ENV?.API_BASE || "http://localhost:3000"
};

const ROUTES = {
  dashboard: "/app/nav/dashboard",
  income: "/app/nav/income",
  expense: "/app/nav/expense"
};

const state = {
  transactions: [],
  selectedTx: null,
  categories: [],
  accounts: []
};

const el = {
  txList: document.getElementById("txList"),
  sumIncome: document.getElementById("sumIncome"),
  sumExpense: document.getElementById("sumExpense"),
  sumBill: document.getElementById("sumBill"),
  sumBalance: document.getElementById("sumBalance"),
  modal: document.getElementById("txEditModal"),
  modalClose: document.getElementById("txEditClose"),
  editForm: document.getElementById("txEditForm"),
  editType: document.getElementById("txEditType"),
  editDateTime: document.getElementById("txEditDateTime"),
  editCategory: document.getElementById("txEditCategory"),
  editAccount: document.getElementById("txEditAccount"),
  editAmount: document.getElementById("txEditAmount"),
  editNote: document.getElementById("txEditNote"),
  toast: document.getElementById("actionToast")
};

function go(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  await Promise.all([loadSummary(), loadRecent(), loadBalance(), loadEditorLookups()]);
  wireNav();
  wireEditor();
});

async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) window.location.href = "/login/login.html";
}

function wireNav() {
  document.querySelectorAll("[data-nav]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.preventDefault();
      go(node.dataset.nav);
    });
  });
}

function wireEditor() {
  el.modalClose?.addEventListener("click", closeEditor);
  el.modal?.addEventListener("click", (e) => {
    if (e.target === el.modal) closeEditor();
  });

  el.editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.selectedTx?.id) return;

    const payload = {
      created_at: toApiDateTime(el.editDateTime?.value),
      category_id: String(el.editCategory?.value || ""),
      account_id: String(el.editAccount?.value || ""),
      amount: Number(el.editAmount?.value || 0),
      note: String(el.editNote?.value || "").trim()
    };

    const res = await fetch(`${CONFIG.API_BASE}/transactions/${state.selectedTx.id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(out.error || "Update failed", "error");
      return;
    }

    closeEditor();
    await Promise.all([loadSummary(), loadRecent(), loadBalance()]);
    showToast("Transaction updated");
  });
}

async function loadSummary() {
  const res = await fetch(`${CONFIG.API_BASE}/transactions/summary/monthly`, {
    credentials: "include"
  });
  const data = res.ok ? await res.json() : {};
  setText(el.sumIncome, toMoney(data.total_income));
  setText(el.sumExpense, toMoney(data.total_expense));
  setText(el.sumBill, toMoney(data.total_bill));
}

async function loadBalance() {
  const res = await fetch(`${CONFIG.API_BASE}/accounts`, { credentials: "include" });
  const payload = res.ok ? await res.json() : {};
  const accounts = Array.isArray(payload) ? payload : (payload.accounts || []);
  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  setText(el.sumBalance, toMoney(totalBalance));
}

async function loadRecent() {
  const res = await fetch(`${CONFIG.API_BASE}/transactions/recent`, {
    credentials: "include"
  });
  const data = res.ok ? await res.json() : [];
  const list = Array.isArray(data) ? data : (Array.isArray(data?.transactions) ? data.transactions : []);
  state.transactions = list;
  renderTransactions();
}

async function loadEditorLookups() {
  const [catRes, accRes] = await Promise.all([
    fetch(`${CONFIG.API_BASE}/categories`, { credentials: "include" }),
    fetch(`${CONFIG.API_BASE}/accounts`, { credentials: "include" })
  ]);

  const catData = catRes.ok ? await catRes.json() : {};
  const accData = accRes.ok ? await accRes.json() : {};

  state.categories = normalizeCategoriesPayload(catData);
  state.accounts = Array.isArray(accData) ? accData : (accData.accounts || []);
  renderEditorLookups();
}

function renderEditorLookups() {
  if (el.editCategory) {
    el.editCategory.innerHTML = state.categories.length
      ? state.categories
          .map((c) => `<option value="${c.id}">${escapeHtml(c.name || "Category")}</option>`)
          .join("")
      : `<option value="">No categories</option>`;
  }

  if (el.editAccount) {
    el.editAccount.innerHTML = state.accounts.length
      ? state.accounts
          .map((a) => `<option value="${a.id}">${escapeHtml(a.name || "Account")}</option>`)
          .join("")
      : `<option value="">No accounts</option>`;
  }
}

function renderTransactions() {
  if (!el.txList) return;

  if (!state.transactions.length) {
    el.txList.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  el.txList.innerHTML = state.transactions
    .map((tx) => {
      const type = String(tx.type || "expense").toLowerCase();
      const amount = Number(tx.amount || 0);
      const note = tx.note || type.toUpperCase();
      const date = tx.created_at ? new Date(tx.created_at).toLocaleString("en-IN") : "-";

      const transferDirection = type === "transfer" ? (amount >= 0 ? "in" : "out") : "";
      const sign = amount >= 0 ? "+" : "-";

      return `
      <div class="item" data-tx-id="${tx.id}">
        <div class="item-main">
          <div class="item-title">${escapeHtml(note)}</div>
          <div class="meta">${escapeHtml(type)} | ${escapeHtml(date)}</div>
        </div>
        <div class="item-actions">
          <div class="amt ${type}${transferDirection ? ` ${transferDirection}` : ""}">${sign}${toMoney(Math.abs(amount))}</div>
          <button class="tx-delete-btn" data-delete-tx-id="${tx.id}" title="Delete transaction" aria-label="Delete transaction">−</button>
        </div>
      </div>
    `;
    })
    .join("");

  el.txList.querySelectorAll("[data-tx-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const txId = node.getAttribute("data-tx-id");
      const tx = state.transactions.find((t) => String(t.id) === String(txId));
      if (tx) openEditor(tx);
    });
  });

  el.txList.querySelectorAll("[data-delete-tx-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const txId = btn.getAttribute("data-delete-tx-id");
      if (!txId) return;
      if (!window.confirm("Delete this transaction?")) return;

      const row = btn.closest(".item");
      if (row) row.classList.add("removing");

      try {
        const res = await fetch(`${CONFIG.API_BASE}/transactions/${encodeURIComponent(txId)}`, {
          method: "DELETE",
          credentials: "include"
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (row) row.classList.remove("removing");
          showToast(payload.error || "Delete failed", "error");
          return;
        }

        state.transactions = state.transactions.filter((t) => String(t.id) !== String(txId));
        renderTransactions();
        await Promise.all([loadSummary(), loadBalance()]);
        showToast("Transaction deleted");
      } catch {
        if (row) row.classList.remove("removing");
        showToast("Delete failed", "error");
      }
    });
  });
}

function openEditor(tx) {
  state.selectedTx = tx;
  if (el.editType) el.editType.value = String(tx.type || "");
  if (el.editDateTime) el.editDateTime.value = toInputDateTime(tx.created_at);
  if (el.editCategory) el.editCategory.value = String(tx.category_id || "");
  if (el.editAccount) el.editAccount.value = String(tx.account_id || "");
  if (el.editAmount) el.editAmount.value = Number(tx.amount || 0);
  if (el.editNote) el.editNote.value = tx.note || "";
  el.modal?.classList.add("active");
}

function closeEditor() {
  state.selectedTx = null;
  el.modal?.classList.remove("active");
}

function toInputDateTime(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

function toApiDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toMoney(v) {
  return Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function setText(node, value) {
  if (node) node.textContent = value;
}

function showToast(message, type = "success") {
  if (!el.toast) return;
  const icon = el.toast.querySelector("i");
  const msg = el.toast.querySelector(".toast-message");
  icon.className = type === "error" ? "fas fa-exclamation-circle" : "fas fa-check-circle";
  msg.textContent = message;
  el.toast.classList.add("show");
  setTimeout(() => el.toast.classList.remove("show"), 2400);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

