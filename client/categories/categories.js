const CONFIG = {
  API_BASE: window.ENV?.API_BASE || "http://localhost:3000"
};

const ROUTES = {
  dashboard: "/app/nav/dashboard",
  accounts: "/app/nav/accounts",
  transactions: "/app/nav/transactions",
  categories: "/app/nav/categories",
  settings: "/app/nav/settings"
};

const ICONS = [
  "wallet", "shopping-cart", "utensils", "car", "home", "bolt", "heart",
  "graduation-cap", "gift", "receipt", "briefcase", "piggy-bank", "bus",
  "film", "wifi", "mobile-alt", "coins", "cart-plus"
];

const SUB_KEY = "mm_subcategories_v1";

const state = {
  categories: { expense: [], income: [] },
  currentType: "expense",
  socket: null,
  editingCategory: null,
  subcategories: {},
  activeCategoryForSubs: null,
  subEditId: null
};

const el = {
  expenseList: document.getElementById("expenseCategoriesList"),
  incomeList: document.getElementById("incomeCategoriesList"),
  tabs: document.querySelectorAll(".category-tab"),
  addBtn: document.getElementById("addCategoryBtn"),
  addForm: document.getElementById("addCategoryForm"),
  saveBtn: document.getElementById("saveCategoryBtn"),
  newName: document.getElementById("newCategoryName"),
  newIcon: document.getElementById("newCategoryIcon"),
  categoryIconPicker: document.getElementById("categoryIconPicker"),
  editModal: document.getElementById("editCategoryModal"),
  editClose: document.getElementById("editCategoryModalClose"),
  editForm: document.getElementById("editCategoryForm"),
  editName: document.getElementById("editCategoryName"),
  editIcon: document.getElementById("editCategoryIcon"),
  editType: document.getElementById("editCategoryType"),
  editIconPicker: document.getElementById("editCategoryIconPicker"),
  subModal: document.getElementById("subcategoryManagerModal"),
  subClose: document.getElementById("subcategoryManagerClose"),
  subTitle: document.getElementById("subcategoryManagerTitle"),
  subName: document.getElementById("newSubcategoryName"),
  subIcon: document.getElementById("newSubcategoryIcon"),
  subPicker: document.getElementById("subcategoryIconPicker"),
  subSave: document.getElementById("saveSubcategoryBtn"),
  subList: document.getElementById("subcategoryManagerList"),
  toast: document.getElementById("actionToast")
};

function secureNavigate(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    readSubcategories();
    await loadCategories();

    initTabs();
    initAddCategory();
    initEditCategory();
    initSubcategoryManager();
    initSecureLinks();
    initRealtime();
    initIconPickers();

    showToast("Categories synced");
  } catch (err) {
    console.error(err);
    showToast("Failed to load categories", "error");
  }
});

async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) window.location.href = "/login/login.html";
}

async function loadCategories() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/categories`, { credentials: "include" });
    if (!res.ok) {
      state.categories = { expense: [], income: [] };
      renderCategories();
      return;
    }

    const data = await res.json();
    const incoming = data?.categories;

    if (Array.isArray(incoming)) {
      state.categories = {
        expense: incoming.filter((c) => c.type === "expense"),
        income: incoming.filter((c) => c.type === "income")
      };
    } else {
      state.categories = {
        expense: Array.isArray(incoming?.expense) ? incoming.expense : [],
        income: Array.isArray(incoming?.income) ? incoming.income : []
      };
    }

    renderCategories();
  } catch (err) {
    console.error("Categories load failed:", err);
    state.categories = { expense: [], income: [] };
    renderCategories();
  }
}

function renderCategories() {
  renderCategoryList(el.expenseList, state.categories.expense, "expense");
  renderCategoryList(el.incomeList, state.categories.income, "income");
}

function renderCategoryList(container, list, type) {
  if (!container) return;
  const safeList = Array.isArray(list) ? list : [];

  if (!safeList.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:#94A3B8">No categories</div>`;
    return;
  }

  container.innerHTML = safeList
    .map((cat) => {
      const subCount = (state.subcategories[cat.id] || []).length;
      return `
      <div class="category-card glass-card" data-id="${cat.id}" data-type="${type}">
        <div class="category-header">
          <div class="category-icon ${type}">
            <i class="fas fa-${cat.icon || "tag"}"></i>
          </div>
          <div class="category-info">
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-stats">${subCount} subcategories</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="subcat-btn" data-action="edit-category" data-id="${cat.id}" title="Edit"><i class="fas fa-pen"></i></button>
            <button class="subcat-btn delete" data-action="delete-category" data-id="${cat.id}" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  container.querySelectorAll(".category-card").forEach((node) => {
    node.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      const id = node.getAttribute("data-id");
      if (!id) return;
      if (!actionBtn) {
        openSubcategoryManager(id);
        return;
      }

      const action = actionBtn.getAttribute("data-action");
      if (action === "edit-category") {
        e.stopPropagation();
        openEditCategory(id);
      } else if (action === "delete-category") {
        e.stopPropagation();
        deleteCategory(id);
      }
    });
  });
}

function initTabs() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const type = tab.dataset.type;
      state.currentType = type;

      el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.type === type));
      if (el.expenseList) el.expenseList.style.display = type === "expense" ? "block" : "none";
      if (el.incomeList) el.incomeList.style.display = type === "income" ? "block" : "none";
    });
  });
}

function initAddCategory() {
  el.addBtn?.addEventListener("click", () => {
    el.addForm.style.display = el.addForm.style.display === "none" ? "block" : "none";
  });

  el.saveBtn?.addEventListener("click", async () => {
    const name = String(el.newName?.value || "").trim();
    const icon = String(el.newIcon?.value || "tag").trim();

    if (!name) {
      showToast("Enter category name", "error");
      return;
    }

    const res = await fetch(`${CONFIG.API_BASE}/categories`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon, type: state.currentType })
    });

    if (!res.ok) {
      showToast("Failed to add category", "error");
      return;
    }

    if (el.newName) el.newName.value = "";
    if (el.newIcon) el.newIcon.value = "tag";
    el.addForm.style.display = "none";
    await loadCategories();
    showToast("Category added");
  });
}

function initEditCategory() {
  el.editClose?.addEventListener("click", () => closeModal(el.editModal));
  el.editModal?.addEventListener("click", (e) => {
    if (e.target === el.editModal) closeModal(el.editModal);
  });

  el.editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.editingCategory) return;

    const payload = {
      name: String(el.editName?.value || "").trim(),
      icon: String(el.editIcon?.value || "tag").trim(),
      type: String(el.editType?.value || state.currentType).toLowerCase()
    };

    const res = await fetch(`${CONFIG.API_BASE}/categories/${encodeURIComponent(state.editingCategory.id)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      showToast("Failed to update category", "error");
      return;
    }

    closeModal(el.editModal);
    state.editingCategory = null;
    await loadCategories();
    showToast("Category updated");
  });
}

function openEditCategory(categoryId) {
  const all = [...(state.categories.expense || []), ...(state.categories.income || [])];
  const category = all.find((c) => String(c.id) === String(categoryId));
  if (!category) return;
  state.editingCategory = category;
  if (el.editName) el.editName.value = category.name || "";
  if (el.editIcon) el.editIcon.value = category.icon || "tag";
  if (el.editType) el.editType.value = category.type || state.currentType;
  highlightPicker(el.editIconPicker, category.icon || "tag");
  openModal(el.editModal);
}

async function deleteCategory(categoryId) {
  const all = [...(state.categories.expense || []), ...(state.categories.income || [])];
  const category = all.find((c) => String(c.id) === String(categoryId));
  if (!category) return;

  if (!window.confirm(`Delete ${category.name} category?`)) return;

  const res = await fetch(`${CONFIG.API_BASE}/categories/${encodeURIComponent(category.id)}`, {
    method: "DELETE",
    credentials: "include"
  });

  if (!res.ok) {
    showToast("Failed to delete category", "error");
    return;
  }

  delete state.subcategories[category.id];
  writeSubcategories();
  await loadCategories();
  showToast("Category deleted");
}

function initSubcategoryManager() {
  el.subClose?.addEventListener("click", () => closeModal(el.subModal));
  el.subModal?.addEventListener("click", (e) => {
    if (e.target === el.subModal) closeModal(el.subModal);
  });

  el.subSave?.addEventListener("click", () => {
    if (!state.activeCategoryForSubs) return;
    const name = String(el.subName?.value || "").trim();
    const icon = String(el.subIcon?.value || "tag").trim();
    if (!name) {
      showToast("Enter subcategory name", "error");
      return;
    }

    const categoryId = state.activeCategoryForSubs.id;
    const list = Array.isArray(state.subcategories[categoryId]) ? state.subcategories[categoryId] : [];

    if (state.subEditId) {
      const idx = list.findIndex((x) => String(x.id) === String(state.subEditId));
      if (idx >= 0) list[idx] = { ...list[idx], name, icon };
      state.subEditId = null;
      if (el.subSave) el.subSave.textContent = "Add Subcategory";
      showToast("Subcategory updated");
    } else {
      list.push({ id: `sub_${Date.now().toString(36)}`, name, icon });
      showToast("Subcategory added");
    }

    state.subcategories[categoryId] = list;
    writeSubcategories();
    if (el.subName) el.subName.value = "";
    if (el.subIcon) el.subIcon.value = "tag";
    renderSubcategoryManager();
    renderCategories();
  });
}

function openSubcategoryManager(categoryId) {
  const all = [...(state.categories.expense || []), ...(state.categories.income || [])];
  const category = all.find((c) => String(c.id) === String(categoryId));
  if (!category) return;
  state.activeCategoryForSubs = category;
  state.subEditId = null;
  if (el.subSave) el.subSave.textContent = "Add Subcategory";
  if (el.subTitle) el.subTitle.textContent = `${category.name} Subcategories`;
  if (el.subName) el.subName.value = "";
  if (el.subIcon) el.subIcon.value = "tag";
  highlightPicker(el.subPicker, "tag");
  renderSubcategoryManager();
  openModal(el.subModal);
}

function renderSubcategoryManager() {
  if (!el.subList || !state.activeCategoryForSubs) return;
  const categoryId = state.activeCategoryForSubs.id;
  const list = Array.isArray(state.subcategories[categoryId]) ? state.subcategories[categoryId] : [];

  if (!list.length) {
    el.subList.innerHTML = `<div style="padding:10px;color:#94A3B8;text-align:center;">No subcategories yet</div>`;
    return;
  }

  el.subList.innerHTML = list.map((s) => `
    <div class="subcat-row" data-sub-id="${s.id}">
      <div class="subcat-left">
        <i class="fas fa-${s.icon || "tag"}"></i>
        <div class="subcat-name">${escapeHtml(s.name)}</div>
      </div>
      <div class="subcat-actions">
        <button class="subcat-btn" data-sub-action="edit" data-sub-id="${s.id}"><i class="fas fa-pen"></i></button>
        <button class="subcat-btn delete" data-sub-action="delete" data-sub-id="${s.id}"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join("");

  el.subList.querySelectorAll("[data-sub-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-sub-action");
      const id = btn.getAttribute("data-sub-id");
      if (!id) return;
      if (action === "edit") return editSubcategory(id);
      if (action === "delete") return deleteSubcategory(id);
    });
  });
}

function editSubcategory(subId) {
  const categoryId = state.activeCategoryForSubs?.id;
  if (!categoryId) return;
  const list = state.subcategories[categoryId] || [];
  const item = list.find((x) => String(x.id) === String(subId));
  if (!item) return;

  state.subEditId = item.id;
  if (el.subName) el.subName.value = item.name || "";
  if (el.subIcon) el.subIcon.value = item.icon || "tag";
  if (el.subSave) el.subSave.textContent = "Save Subcategory";
  highlightPicker(el.subPicker, item.icon || "tag");
}

function deleteSubcategory(subId) {
  const categoryId = state.activeCategoryForSubs?.id;
  if (!categoryId) return;
  if (!window.confirm("Delete this subcategory?")) return;
  const list = state.subcategories[categoryId] || [];
  state.subcategories[categoryId] = list.filter((x) => String(x.id) !== String(subId));
  writeSubcategories();
  renderSubcategoryManager();
  renderCategories();
  showToast("Subcategory deleted");
}

function initIconPickers() {
  renderIconPicker(el.categoryIconPicker, el.newIcon);
  renderIconPicker(el.editIconPicker, el.editIcon);
  renderIconPicker(el.subPicker, el.subIcon);
}

function renderIconPicker(container, targetInput) {
  if (!container || !targetInput) return;
  container.innerHTML = ICONS.map((icon) => `
    <button type="button" class="icon-chip" data-icon="${icon}" title="${icon}">
      <i class="fas fa-${icon}"></i>
    </button>
  `).join("");

  container.querySelectorAll("[data-icon]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const icon = btn.getAttribute("data-icon") || "tag";
      targetInput.value = icon;
      highlightPicker(container, icon);
    });
  });

  targetInput.addEventListener("input", () => {
    highlightPicker(container, targetInput.value || "");
  });
}

function highlightPicker(container, iconName) {
  if (!container) return;
  container.querySelectorAll("[data-icon]").forEach((btn) => {
    btn.classList.toggle("active", (btn.getAttribute("data-icon") || "") === String(iconName || ""));
  });
}

function initRealtime() {
  if (!window.io) return;
  state.socket = io(CONFIG.API_BASE, { transports: ["websocket"], withCredentials: true });
  state.socket.on("categories:updated", loadCategories);
}

function initSecureLinks() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      secureNavigate(link.dataset.nav);
    });
  });
}

function readSubcategories() {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    state.subcategories = raw ? JSON.parse(raw) : {};
  } catch {
    state.subcategories = {};
  }
}

function writeSubcategories() {
  localStorage.setItem(SUB_KEY, JSON.stringify(state.subcategories));
}

function openModal(modal) {
  modal?.classList.add("active");
}

function closeModal(modal) {
  modal?.classList.remove("active");
}

function showToast(message, type = "success") {
  if (!el.toast) return;
  const icon = el.toast.querySelector("i");
  const msg = el.toast.querySelector(".toast-message");
  icon.className = type === "error" ? "fas fa-exclamation-circle" : "fas fa-check-circle";
  msg.textContent = message;
  el.toast.classList.add("show");
  setTimeout(() => el.toast.classList.remove("show"), 3000);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
