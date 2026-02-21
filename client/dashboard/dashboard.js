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
  user: null,
  accounts: [],
  transactions: [],
  notifications: [],
  socket: null,
  balanceVisible: true,
  monthlyIncome: 0,
  monthlyExpense: 0,
  qrPayload: null,
  scannedPayload: null,
  scanner: {
    stream: null,
    detector: null,
    raf: null,
    active: false,
    lastScanAt: 0
  },
  currentShareLink: null, // ðŸ” for payment QR
  // NEW: remote access
  accessPayload: null,      // decoded from shared link
  accessRequestId: null,    // returned from /access/request
  accessAttempts: 0,        // max 3 attempts
  pendingAccessRequest: null
};

// ðŸ” Secret for HMAC (in production, use a strong secret from env)
const SHARE_SECRET = 'money-manager-share-secret-change-in-production';

const el = {
  menuBtn: document.getElementById("mobileMenuBtn"),
  sideMenu: document.getElementById("mobileSideMenu"),
  menuOverlay: document.getElementById("menuOverlay"),
  menuClose: document.getElementById("menuClose"),
  logoutBtn: document.getElementById("logoutBtn"),
  menuNotificationBadge: document.getElementById("menuNotificationBadge"),

  searchBtn: document.getElementById("mobileSearchBtn"),
  notificationBtn: document.getElementById("mobileNotifications"),
  notificationCount: document.getElementById("notificationCount"),

  qrBtn: document.getElementById("mobileQrBtn"),
  qrPopup: document.getElementById("qrPopup"),
  qrOverlay: document.getElementById("qrOverlay"),
  qrClose: document.getElementById("qrClose"),
  qrTabs: document.querySelectorAll(".qr-tab"),
  scanTab: document.getElementById("scanTab"),
  myQrTab: document.getElementById("myqrTab"),
  transferForm: document.getElementById("transferForm"),
  receiverAccount: document.getElementById("receiverAccount"),
  transferAmount: document.getElementById("transferAmount"),
  fromAccount: document.getElementById("fromAccount"),
  cancelTransfer: document.getElementById("cancelTransfer"),
  confirmTransfer: document.getElementById("confirmTransfer"),
  qrAccountSelect: document.getElementById("qrAccountSelect"),
  qrPattern: document.getElementById("qrPattern"),
  transferCode: document.getElementById("transferCode"),
  manualCodeInput: document.getElementById("manualCodeInput"),
  scanCodeInput: document.getElementById("scanCodeInput"),
  useCodeBtn: document.getElementById("useCodeBtn"),
  scanVideo: document.getElementById("scanVideo"),
  scanStatusText: document.getElementById("scanStatusText"),
  scannerPlaceholder: document.getElementById("scannerPlaceholder"),
  startScanBtn: document.getElementById("startScanBtn"),
  stopScanBtn: document.getElementById("stopScanBtn"),

  balanceToggle: document.getElementById("mobileBalanceToggle"),
  balanceAmount: document.getElementById("mobileBalanceAmount"),

  quickGrid: document.getElementById("quickActionsGrid"),
  txList: document.getElementById("mobileTransactionsList"),
  insightsGrid: document.getElementById("insightsGrid"),

  greeting: document.getElementById("userGreeting"),
  date: document.getElementById("currentDate"),
  monthlyIncome: document.getElementById("monthlyIncome"),
  monthlyExpense: document.getElementById("monthlyExpense"),
  budgetUsedPercent: document.getElementById("budgetUsedPercent"),
  budgetProgressFill: document.getElementById("budgetProgressFill"),
  notificationsModal: document.getElementById("notificationsModal"),
  notificationsClose: document.getElementById("notificationsClose"),
  notificationsList: document.getElementById("notificationsList"),
  clearAllNotifications: document.getElementById("clearAllNotifications"),
  accessShareModal: document.getElementById("accessShareModal"),
  accessShareClose: document.getElementById("accessShareClose"),
  accessShareQr: document.getElementById("accessShareQr"),
  accessShareLink: document.getElementById("accessShareLink"),
  accessCopyBtn: document.getElementById("accessCopyBtn"),
  accessNativeShareBtn: document.getElementById("accessNativeShareBtn"),
  ownerApproveBtn: document.getElementById("ownerApproveBtn"),
  ownerRejectBtn: document.getElementById("ownerRejectBtn"),
  ownerApproveView: document.getElementById("ownerApproveView"),
  ownerCodeView: document.getElementById("ownerCodeView"),

  installBtn: document.getElementById("mobileInstallBtn"),
  toast: document.getElementById("actionToast")
};

// ðŸ” HMAC generation using Web Crypto API
async function generateHMAC(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ðŸ” Base64url helpers
function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// ðŸ” Generate secure share link with expiry + HMAC (for payments)
async function generateSecureShareLink(accountId) {
  if (!state.user || !state.user.id) return null;
  const payload = {
    uid: state.user.id,
    aid: accountId || null,
    exp: Date.now() + 15 * 60 * 1000 // 15 minutes
  };
  const json = JSON.stringify(payload);
  const encoded = base64urlEncode(json);
  const sig = await generateHMAC(encoded, SHARE_SECRET);
  const url = new URL('/share', window.location.origin);
  url.searchParams.set('data', encoded);
  url.searchParams.set('sig', sig);
  return url.toString();
}

// ðŸ” Validate incoming shared payload
async function validateSharedPayload(data, sig) {
  try {
    const expectedSig = await generateHMAC(data, SHARE_SECRET);
    if (expectedSig !== sig) return { valid: false, reason: 'Invalid signature' };
    const json = base64urlDecode(data);
    const payload = JSON.parse(json);
    if (payload.exp < Date.now()) return { valid: false, reason: 'Link expired' };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, reason: 'Malformed data' };
  }
}

// ========== NEW: Remote Access Functions ==========

// Generate a secure link for access request (different from payment QR)
async function generateAccessLink(accountId) {
  if (!state.user || !state.user.id) return null;
  const payload = {
    uid: state.user.id,
    aid: accountId || null,
    exp: Date.now() + 15 * 60 * 1000 // 15 minutes
  };
  const json = JSON.stringify(payload);
  const encoded = base64urlEncode(json);
  const sig = await generateHMAC(encoded, SHARE_SECRET);
  const url = new URL('/dashboard/dashboard.html', window.location.origin);
  url.searchParams.set('data', encoded);
  url.searchParams.set('sig', sig);
  return url.toString();
}

// Check URL on page load for incoming access link
function handleIncomingAccessLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const data = urlParams.get('data');
  const sig = urlParams.get('sig');
  if (!data || !sig) return;

  // Validate and store payload
  validateSharedPayload(data, sig).then(result => {
    if (!result.valid) {
      showToast(result.reason, 'error');
      return;
    }
    state.accessPayload = result.payload;
    showAccessRequestModal();
    // Clean URL to avoid re-triggering
    window.history.replaceState({}, document.title, window.location.pathname);
  });
}

function hasIncomingAccessParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return !!(urlParams.get("data") && urlParams.get("sig"));
}

function initAccessModals() {
  const accessModal = document.getElementById('accessRequestModal');
  const accessClose = document.getElementById('accessRequestClose');
  const requestBtn = document.getElementById('requestAccessBtn');
  const verifyBtn = document.getElementById('verifyCodeBtn');
  const cancelBtn = document.getElementById('cancelAccessBtn');

  if (accessClose) {
    accessClose.addEventListener('click', () => accessModal?.classList.remove('active'));
    accessModal?.addEventListener('click', (e) => {
      if (e.target === accessModal) accessModal.classList.remove('active');
    });
  }
  if (requestBtn) requestBtn.addEventListener('click', requestRemoteAccess);
  if (verifyBtn) verifyBtn.addEventListener('click', verifyAccessCode);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      accessModal?.classList.remove('active');
      state.accessPayload = null;
      state.accessRequestId = null;
      state.accessAttempts = 0;
    });
  }
}

// Show the access request modal
function showAccessRequestModal() {
  const modal = document.getElementById('accessRequestModal');
  if (!modal) return;
  // Reset views
  document.getElementById('accessRequestView').style.display = 'block';
  document.getElementById('accessCodeView').style.display = 'none';
  document.getElementById('accessError').style.display = 'none';
  document.getElementById('accessCodeInput').value = '';
  modal.classList.add('active');
}

// Request access (called when requester clicks "Request Access")
async function requestRemoteAccess() {
  if (!state.accessPayload) {
    showToast('Invalid request', 'error');
    return;
  }
  try {
    const res = await fetch(`${CONFIG.API_BASE}/access/request`, {
      method: 'POST',
      credentials: 'include', // may not be needed for requester
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_id: state.accessPayload.uid,
        account_id: state.accessPayload.aid,
        device_info: navigator.userAgent
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    state.accessRequestId = data.request_id;
    // Switch to code entry view
    document.getElementById('accessRequestView').style.display = 'none';
    document.getElementById('accessCodeView').style.display = 'block';
    showToast('Request sent. Ask owner for the code.');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Verify the 6-digit code entered by requester
async function verifyAccessCode() {
  const code = document.getElementById('accessCodeInput').value.trim();
  if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
    showToast('Enter a valid 6-digit code', 'error');
    return;
  }
  if (state.accessAttempts >= 3) {
    showToast('Too many failed attempts', 'error');
    return;
  }
  try {
    const res = await fetch(`${CONFIG.API_BASE}/access/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: state.accessRequestId,
        code: code,
        device_info: navigator.userAgent
      })
    });
    const data = await res.json();
    if (!res.ok) {
      state.accessAttempts++;
      throw new Error(data.error || 'Verification failed');
    }
    // Success â€“ server returns a session token or redirect
    if (data.redirect) {
      window.location.href = data.redirect;
    } else {
      window.location.href = '/dashboard'; // fallback
    }
  } catch (err) {
    document.getElementById('accessError').textContent = err.message;
    document.getElementById('accessError').style.display = 'block';
  }
}

// Show owner the generated code (called via socket event)
function showOwnerCodeModal(code) {
  const modal = document.getElementById('ownerCodeModal');
  if (!modal) return;
  if (el.ownerApproveView) el.ownerApproveView.style.display = "none";
  if (el.ownerCodeView) el.ownerCodeView.style.display = "block";
  document.getElementById('ownerCodeValue').textContent = code;
  modal.classList.add('active');
}

// ========== Existing Functions (with modifications for sharing) ==========

// ðŸ” Share account (now generates access link, not payment link)
async function shareAccount() {
  const link = await generateAccessLink(state.accounts?.[0]?.id || null);
  if (!link) {
    showToast('Failed to generate link', 'error');
    return;
  }
  state.currentShareLink = link;
  if (el.accessShareLink) el.accessShareLink.value = state.currentShareLink;
  renderAccessShareQr(state.currentShareLink);
  el.accessShareModal?.classList.add("active");
}

async function nativeShareAccessLink() {
  if (!state.currentShareLink) {
    showToast("Generate share link first", "error");
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: "Access Account", url: state.currentShareLink });
      showToast("Shared successfully");
      return;
    }
    await copyShareLink();
  } catch (err) {
    if (err?.name !== "AbortError") showToast("Sharing failed", "error");
  }
}

// ðŸ” Copy link
async function copyShareLink() {
  if (!state.currentShareLink) {
    showToast('Generate a QR code first', 'error');
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) {
      window.prompt("Copy link", state.currentShareLink);
      showToast("Link copied");
      return;
    }
    await navigator.clipboard.writeText(state.currentShareLink);
    showToast('Link copied');
  } catch {
    showToast('Copy failed', 'error');
  }
}

function secureNavigate(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (hasIncomingAccessParams()) {
      initAccessModals();
      handleIncomingAccessLink();
      return;
    }

    await checkAuth();
    await loadDashboard();

    initMenu();
    initHeaderActions();
    initQR();
    initBalanceToggle();
    initQuickActions();
    initSecureLinks();
    initRealtime();
    initPWAInstall();
    document.getElementById('detailPrevBtn')?.addEventListener('click', showPrevDetail);
    document.getElementById('detailNextBtn')?.addEventListener('click', showNextDetail);
    document.getElementById('notificationDetailClose')?.addEventListener('click', closeNotificationDetail);
    document.getElementById('notificationDetailModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeNotificationDetail();
    });
    await initPushNotifications();
    updateDate();

    showToast("Dashboard synced");
  } catch (err) {
    console.error(err);
    showToast("Failed to load dashboard", "error");
  }
});

async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, {
    credentials: "include"
  });

  if (!res.ok) {
    window.location.href = "/login/login.html";
    return;
  }

  const data = await res.json();
  state.user = data.user;

  const name = data.user?.full_name || data.user?.name || data.user?.email?.split("@")[0] || "User";
  if (el.greeting) el.greeting.textContent = `Welcome back, ${name}!`;
  const menuName = document.getElementById("menuUserName");
  if (menuName) menuName.textContent = name;
}

async function loadDashboard() {
  try {
    const [accRes, txRes, monthlyRes, notificationsRes] = await Promise.all([
      fetch(`${CONFIG.API_BASE}/accounts`, { credentials: "include" }),
      fetch(`${CONFIG.API_BASE}/transactions/recent`, { credentials: "include" }),
      fetch(`${CONFIG.API_BASE}/transactions/summary/monthly`, { credentials: "include" }),
      fetch(`${CONFIG.API_BASE}/users/notifications`, { credentials: "include" })
    ]);

    const accData = accRes.ok ? await accRes.json() : [];
    const txData = txRes.ok ? await txRes.json() : [];
    const monthlyData = monthlyRes.ok ? await monthlyRes.json() : null;
    const notificationsData = notificationsRes.ok ? await notificationsRes.json() : [];

    state.accounts = Array.isArray(accData) ? accData : (accData?.accounts || []);
    state.transactions = Array.isArray(txData) ? txData : (txData?.transactions || []);
    state.monthlyIncome = Number(monthlyData?.total_income || 0);
    state.monthlyExpense = Number(monthlyData?.total_expense || 0);
    state.notifications = mapNotifications(notificationsData);

    updateBalanceAndStats();
    renderTransactions();
    renderQuickActions();
    renderInsights();
    buildNotifications();
    hydrateQrData();
  } catch (err) {
    console.error("Dashboard load failed:", err);
    state.accounts = [];
    state.transactions = [];
    state.monthlyIncome = 0;
    state.monthlyExpense = 0;
    state.notifications = [];
    updateBalanceAndStats();
    renderTransactions();
    renderQuickActions();
    renderInsights();
    buildNotifications();
    hydrateQrData();
  }
}

function updateBalanceAndStats() {
  if (!el.balanceAmount) return;

  const total = state.accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  el.balanceAmount.textContent = formatMoney(total);
  if (!state.balanceVisible) {
    document.querySelector(".mobile-balance-amount.compact")?.classList.add("hidden");
  }

  if (el.monthlyIncome) el.monthlyIncome.textContent = `+${formatMoney(state.monthlyIncome)}`;
  if (el.monthlyExpense) el.monthlyExpense.textContent = `-${formatMoney(state.monthlyExpense)}`;

  const usedPercent = state.monthlyIncome > 0
    ? Math.min(100, Math.round((state.monthlyExpense / state.monthlyIncome) * 100))
    : 0;

  if (el.budgetUsedPercent) el.budgetUsedPercent.textContent = String(usedPercent);
  if (el.budgetProgressFill) el.budgetProgressFill.style.width = `${usedPercent}%`;
}

function renderQuickActions() {
  if (!el.quickGrid) return;

  const actions = [
    { title: "Income", icon: "money-bill-wave", key: "income", color: "income" },
    { title: "Expense", icon: "shopping-cart", key: "expense", color: "expense" },
    { title: "Transfer", icon: "exchange-alt", key: "transfer", color: "transfer" },
    { title: "Scan & Pay", icon: "qrcode", action: "scanpay", color: "scan" }
  ];

  el.quickGrid.innerHTML = actions.map((a) => `
    <button class="action-card" data-key="${a.key || ""}" data-action="${a.action || ""}">
      <div class="action-icon ${a.color}">
        <i class="fas fa-${a.icon}"></i>
      </div>
      <span class="action-label">${a.title}</span>
    </button>
  `).join("");
}

function initQuickActions() {
  el.quickGrid?.addEventListener("click", (e) => {
    const card = e.target.closest(".action-card");
    if (!card) return;

    if (card.dataset.action === "scanpay") {
      openQR();
      return;
    }

    if (card.dataset.key) {
      secureNavigate(card.dataset.key);
    }
  });
}

function initSecureLinks() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const key = link.dataset.nav;
      secureNavigate(key);
    });
  });
}

function initMenu() {
  el.menuBtn?.addEventListener("click", () => {
    el.sideMenu?.classList.add("active");
  });

  el.menuOverlay?.addEventListener("click", closeMenu);
  el.menuClose?.addEventListener("click", closeMenu);

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const label = item.querySelector("span")?.textContent?.trim().toLowerCase() || "";
      if (label === "notifications") {
        e.preventDefault();
        showNotificationsDialog();
      }
      if (label === "settings") {
        e.preventDefault();
        closeMenu();
        secureNavigate("settings");
        showToast("Open settings");
      }
    });
  });

  el.logoutBtn?.addEventListener("click", async () => {
    await fetch(`${CONFIG.API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    window.location.href = "/login/login.html";
  });
}

function closeMenu() {
  el.sideMenu?.classList.remove("active");
}

function initHeaderActions() {
  el.searchBtn?.addEventListener("click", async () => {
    try {
      await shareAccount();
    } catch (err) {
      console.error("Share action failed:", err);
      showToast("Sharing failed", "error");
    }
  });

  el.notificationBtn?.addEventListener("click", showNotificationsDialog);
  el.notificationsClose?.addEventListener("click", closeNotificationsDialog);
  el.clearAllNotifications?.addEventListener("click", clearAllNotifications);
  el.notificationsModal?.addEventListener("click", (e) => {
    if (e.target === el.notificationsModal) closeNotificationsDialog();
  });
  el.accessShareClose?.addEventListener("click", () => el.accessShareModal?.classList.remove("active"));
  el.accessShareModal?.addEventListener("click", (e) => {
    if (e.target === el.accessShareModal) el.accessShareModal.classList.remove("active");
  });
  el.accessCopyBtn?.addEventListener("click", copyShareLink);
  el.accessNativeShareBtn?.addEventListener("click", nativeShareAccessLink);
}

function mapNotifications(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((n) => ({
    id: n.id,
    title: n.title || "Notification",
    detail: n.message || "",
    is_read: !!n.is_read,
    created_at: n.created_at || null
  }));
}

function buildNotifications() {
  const count = state.notifications.length;
  if (el.notificationCount) el.notificationCount.textContent = String(count);
  if (el.menuNotificationBadge) el.menuNotificationBadge.textContent = String(count);
}


async function clearAllNotifications() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/users/notifications/clear`, {
      method: "POST",
      credentials: "include"
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || "Failed to clear notifications");
    }

    state.notifications = [];
    if (el.notificationCount) el.notificationCount.textContent = "0";
    if (el.menuNotificationBadge) el.menuNotificationBadge.textContent = "0";
    showNotificationsDialog();
    showToast("All notifications cleared");
  } catch (err) {
    showToast(err.message || "Failed to clear notifications", "error");
  }
}
function showNotificationsDialog() {
  if (!el.notificationsModal || !el.notificationsList) return;

  if (!state.notifications.length) {
    el.notificationsList.innerHTML = `
      <div class="notification-empty">
        <i class="far fa-bell-slash"></i>
        <p>No notifications</p>
      </div>
    `;
  } else {
    el.notificationsList.innerHTML = state.notifications.map((n) => `
      <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
        <div class="notification-icon wallet">
          <i class="fas fa-bell"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${escapeHtml(n.title)}</div>
          <div class="notification-message">${escapeHtml(n.detail)}</div>
          <div class="notification-time">${formatTime(n.created_at)}</div>
        </div>
        <div class="notification-right">
          <span class="notification-time-amount">${formatTimeShort(n.created_at)}</span>
          ${!n.is_read ? '<span class="unread-dot"></span>' : ''}
        </div>
      </div>
    `).join("");

    document.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const index = state.notifications.findIndex(n => n.id == id);
        if (index !== -1) openNotificationDetail(index);
      });
    });
  }
  closeMenu();
  el.notificationsModal.classList.add("active");
}

let currentDetailIndex = 0;
let detailNotifications = [];

function openNotificationDetail(index) {
  const modal = document.getElementById('notificationDetailModal');
  const container = document.getElementById('notificationDetailContainer');
  if (!modal || !container) return;
  currentDetailIndex = index;
  detailNotifications = state.notifications;
  renderDetailSlides();
  modal.classList.add('active');
  updateDetailButtons();
}

function renderDetailSlides() {
  const container = document.getElementById('notificationDetailContainer');
  if (!container) return;
  let slidesHtml = '';
  detailNotifications.forEach((n, idx) => {
    slidesHtml += `
      <div class="notification-detail-slide ${idx === currentDetailIndex ? 'active' : ''}" data-index="${idx}">
        <div class="detail-icon wallet">
          <i class="fas fa-bell"></i>
        </div>
        <div class="detail-title">${escapeHtml(n.title)}</div>
        <div class="detail-message">${escapeHtml(n.detail)}</div>
        <div class="detail-time">${formatTime(n.created_at)}</div>
      </div>
    `;
  });
  container.innerHTML = slidesHtml;
}

function showPrevDetail() {
  if (currentDetailIndex > 0) {
    currentDetailIndex--;
    updateActiveSlide();
    updateDetailButtons();
  }
}
function showNextDetail() {
  if (currentDetailIndex < detailNotifications.length - 1) {
    currentDetailIndex++;
    updateActiveSlide();
    updateDetailButtons();
  }
}
function updateActiveSlide() {
  const slides = document.querySelectorAll('.notification-detail-slide');
  slides.forEach((s, idx) => {
    s.classList.toggle('active', idx === currentDetailIndex);
  });
}
function updateDetailButtons() {
  const prev = document.getElementById('detailPrevBtn');
  const next = document.getElementById('detailNextBtn');
  const counter = document.getElementById('detailCounter');
  if (prev) prev.disabled = currentDetailIndex === 0;
  if (next) next.disabled = currentDetailIndex === detailNotifications.length - 1;
  if (counter) counter.textContent = `${currentDetailIndex + 1} / ${detailNotifications.length}`;
}
function closeNotificationDetail() {
  document.getElementById('notificationDetailModal')?.classList.remove('active');
}

function closeNotificationsDialog() {
  el.notificationsModal?.classList.remove("active");
}

function initQR() {
  el.qrBtn?.addEventListener("click", openQR);
  el.qrOverlay?.addEventListener("click", closeQR);
  el.qrClose?.addEventListener("click", closeQR);

  el.qrTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      el.qrTabs.forEach((t) => t.classList.toggle("active", t === tab));
      el.scanTab?.classList.toggle("active", target === "scan");
      el.myQrTab?.classList.toggle("active", target === "myqr");
      if (target === "myqr") {
        stopScanner();
        regenerateMyQr();
      } else {
        startScanner();
      }
    });
  });

  el.qrAccountSelect?.addEventListener("change", regenerateMyQr);
  el.startScanBtn?.addEventListener("click", startScanner);
  el.stopScanBtn?.addEventListener("click", stopScanner);
  el.useCodeBtn?.addEventListener("click", resolveManualTransferCode);
  el.scanCodeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      resolveManualTransferCode();
    }
  });
  el.cancelTransfer?.addEventListener("click", () => {
    el.transferForm?.classList.remove("active");
    state.scannedPayload = null;
  });
  el.confirmTransfer?.addEventListener("click", confirmScanPayment);

  // Share & Copy buttons (payment QR â€“ unchanged)
  // ===== NEW: Remote access modal listeners =====
  const accessModal = document.getElementById('accessRequestModal');
  const accessClose = document.getElementById('accessRequestClose');
  const requestBtn = document.getElementById('requestAccessBtn');
  const verifyBtn = document.getElementById('verifyCodeBtn');
  const cancelBtn = document.getElementById('cancelAccessBtn');
  const ownerModal = document.getElementById('ownerCodeModal');
  const ownerClose = document.getElementById('ownerCodeClose');

  if (accessClose) {
    accessClose.addEventListener('click', () => accessModal?.classList.remove('active'));
    accessModal?.addEventListener('click', (e) => {
      if (e.target === accessModal) accessModal.classList.remove('active');
    });
  }
  if (requestBtn) requestBtn.addEventListener('click', requestRemoteAccess);
  if (verifyBtn) verifyBtn.addEventListener('click', verifyAccessCode);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      accessModal?.classList.remove('active');
      state.accessPayload = null;
      state.accessRequestId = null;
      state.accessAttempts = 0;
    });
  }
  if (ownerClose) {
    ownerClose.addEventListener('click', () => ownerModal?.classList.remove('active'));
    ownerModal?.addEventListener('click', (e) => {
      if (e.target === ownerModal) ownerModal.classList.remove('active');
    });
  }
  el.ownerApproveBtn?.addEventListener("click", approvePendingAccessRequest);
  el.ownerRejectBtn?.addEventListener("click", rejectPendingAccessRequest);
}

function openQR() {
  el.qrPopup?.classList.add("active");
  const scanTabBtn = document.querySelector('.qr-tab[data-tab="scan"]');
  if (scanTabBtn) {
    el.qrTabs.forEach((t) => t.classList.toggle("active", t === scanTabBtn));
    el.scanTab?.classList.add("active");
    el.myQrTab?.classList.remove("active");
  }
  hydrateQrData();
  startScanner();
}

function closeQR() {
  stopScanner();
  el.qrPopup?.classList.remove("active");
}

function hydrateQrData() {
  const accounts = state.accounts || [];

  if (el.qrAccountSelect) {
    el.qrAccountSelect.innerHTML = accounts.length
      ? accounts.map((acc) => `<option value="${acc.id}">${acc.name}</option>`).join("")
      : `<option value="">No account</option>`;
    el.qrAccountSelect.disabled = accounts.length === 0;
  }

  if (el.fromAccount) {
    el.fromAccount.innerHTML = accounts.length
      ? accounts.map((acc) => `<option value="${acc.id}">${acc.name} (${formatMoney(acc.balance)})</option>`).join("")
      : `<option value="">No account</option>`;
    el.fromAccount.disabled = accounts.length === 0;
  }

  regenerateMyQr();
}

// Updated to generate short code + secure remote-access link (for QR display)
async function regenerateMyQr() {
  const selectedId = el.qrAccountSelect?.value;
  const account = state.accounts.find((a) => String(a.id) === String(selectedId));

  if (!account) {
    state.qrPayload = null;
    if (el.transferCode) el.transferCode.textContent = '------';
    if (el.manualCodeInput) el.manualCodeInput.value = '';
    if (el.qrPattern) el.qrPattern.innerHTML = '';
    return;
  }

  // Short transfer code (existing)
  const shortCode = generateTransferCode(account.id);
  state.qrPayload = {
    account_id: account.id,
    account_name: account.name,
    transfer_code: shortCode,
    created_at: new Date().toISOString()
  };
  if (el.transferCode) el.transferCode.textContent = shortCode;
  if (el.manualCodeInput) el.manualCodeInput.value = shortCode;

  renderPaymentQr(shortCode);
}

function renderPaymentQr(seed) {
  if (!el.qrPattern) return;
  const payload = encodeURIComponent(`MMPAY:${String(seed || "").toUpperCase()}`);
  const qrUrlPrimary = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&ecc=H&margin=12&data=${payload}`;
  const qrUrlSecondary = `https://chart.googleapis.com/chart?chs=360x360&cht=qr&chl=${payload}`;

  el.qrPattern.innerHTML = "";
  const img = document.createElement("img");
  img.src = qrUrlPrimary;
  img.alt = "Payment QR";
  img.className = "access-share-qr-image";
  img.loading = "eager";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.crossOrigin = "anonymous";
  img.dataset.qrFallbackTried = "0";

  img.addEventListener("error", () => {
    if (img.dataset.qrFallbackTried !== "1") {
      img.dataset.qrFallbackTried = "1";
      img.src = qrUrlSecondary;
      return;
    }
    renderPseudoQrFallback(seed);
  });

  el.qrPattern.appendChild(img);
}

function renderPseudoQrFallback(seed) {
  if (!el.qrPattern) return;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const cells = [];
  const size = 25;
  for (let i = 0; i < size * size; i += 1) {
    const bit = ((hash >> (i % 24)) ^ i) & 1;
    cells.push(`<div class="qr-cell${bit ? "" : " white"}"></div>`);
  }
  el.qrPattern.innerHTML = `<div class="fallback-qr">${cells.join("")}</div>`;
}

// Updated mockScan to validate the secure payment link
function resolveManualTransferCode(rawInput) {
  const rawCode = String(rawInput ?? el.scanCodeInput?.value ?? "").trim().toUpperCase();
  if (!rawCode) {
    showToast("Enter transfer code first", "error");
    return;
  }
  applyScannedTransferCode(rawCode);
}

function applyScannedTransferCode(rawCode) {
  const code = extractTransferCode(rawCode);
  if (!code) {
    showToast("Invalid transfer code", "error");
    return;
  }

  const receiver = state.accounts.find((acc) => generateTransferCode(acc.id) === code);
  if (!receiver) {
    showToast("Invalid transfer code", "error");
    return;
  }

  state.scannedPayload = {
    account_id: receiver.id,
    account_name: receiver.name,
    transfer_code: code
  };

  if (el.receiverAccount) {
    el.receiverAccount.value = `${receiver.name} (${receiver.type || "account"})`;
  }

  const sourceCandidates = state.accounts.filter((acc) => String(acc.id) !== String(receiver.id));
  if (el.fromAccount) {
    el.fromAccount.innerHTML = sourceCandidates.length
      ? sourceCandidates.map((acc) => `<option value="${acc.id}">${acc.name} (${formatMoney(acc.balance)})</option>`).join("")
      : `<option value="">No source account</option>`;
    el.fromAccount.disabled = sourceCandidates.length === 0;
  }

  el.transferForm?.classList.add("active");
  setScanStatus(`Scanned ${code}. Enter amount and confirm.`);
  showToast("Code matched. Enter amount and confirm.");
}

async function confirmScanPayment() {
  try {
    const fromAccountId = el.fromAccount?.value;
    const toAccountId = state.scannedPayload?.account_id;
    const amount = Number(el.transferAmount?.value || 0);

    if (!fromAccountId || !toAccountId || amount <= 0) {
      showToast("Enter valid transfer details", "error");
      return;
    }

    if (String(fromAccountId) === String(toAccountId)) {
      showToast("Source and receiver account cannot be same", "error");
      return;
    }

    const res = await fetch(`${CONFIG.API_BASE}/transfer`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount,
        note: `QR & Pay (${state.scannedPayload?.transfer_code || "manual"})`
      })
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(payload.error || "Transfer failed", "error");
      return;
    }

    el.transferAmount.value = "";
    el.transferForm?.classList.remove("active");
    stopScanner();
    closeQR();
    await loadDashboard();
    showToast("Transfer successful");
  } catch (err) {
    console.error("Scan pay error:", err);
    showToast("Transfer failed", "error");
  }
}

function extractTransferCode(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  if (upper.startsWith("MMPAY:")) {
    return upper.split(":").pop().trim();
  }

  try {
    const parsed = new URL(raw);
    const code = parsed.searchParams.get("code") || parsed.searchParams.get("transfer_code");
    if (code) return String(code).toUpperCase();
  } catch (_) {
    // not a URL
  }

  return upper;
}

function setScanStatus(message) {
  if (el.scanStatusText) el.scanStatusText.textContent = message;
}

async function startScanner() {
  if (!el.scanVideo || !el.scanTab?.classList.contains("active")) return;
  if (state.scanner.active) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    setScanStatus("Camera not supported. Use transfer code field.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    state.scanner.stream = stream;
    state.scanner.active = true;
    state.scanner.detector = typeof BarcodeDetector !== "undefined"
      ? new BarcodeDetector({ formats: ["qr_code"] })
      : null;

    el.scanVideo.srcObject = stream;
    el.scannerPlaceholder?.classList.add("scanning");
    setScanStatus("Scanning... align QR inside frame");
    await el.scanVideo.play().catch(() => {});

    if (!state.scanner.detector) {
      setScanStatus("BarcodeDetector unavailable. Use transfer code or demo scan.");
      return;
    }

    scanFrame();
  } catch (err) {
    console.error("Camera start failed:", err);
    setScanStatus("Camera access blocked. Allow permission and retry.");
    showToast("Camera permission required for QR scan", "error");
  }
}

function stopScanner() {
  if (state.scanner.raf) {
    cancelAnimationFrame(state.scanner.raf);
    state.scanner.raf = null;
  }

  if (state.scanner.stream) {
    state.scanner.stream.getTracks().forEach((track) => track.stop());
    state.scanner.stream = null;
  }

  state.scanner.active = false;
  if (el.scanVideo) el.scanVideo.srcObject = null;
  el.scannerPlaceholder?.classList.remove("scanning");
  setScanStatus("Tap Start Camera and point to QR code");
}

async function scanFrame() {
  if (!state.scanner.active || !state.scanner.detector || !el.scanVideo) return;

  try {
    const codes = await state.scanner.detector.detect(el.scanVideo);
    if (codes?.length) {
      const now = Date.now();
      if (now - state.scanner.lastScanAt > 1000) {
        state.scanner.lastScanAt = now;
        const value = String(codes[0].rawValue || "").trim();
        if (value) {
          resolveManualTransferCode(value);
          return;
        }
      }
    }
  } catch (_) {
    // ignore detection frame errors
  }

  state.scanner.raf = requestAnimationFrame(scanFrame);
}

function initBalanceToggle() {
  el.balanceToggle?.addEventListener("click", () => {
    state.balanceVisible = !state.balanceVisible;
    const container = document.querySelector(".mobile-balance-amount.compact");
    if (container) {
      container.classList.toggle("hidden", !state.balanceVisible);
    }
  });
}

function initRealtime() {
  if (!window.io) return;

  state.socket = io(CONFIG.API_BASE, {
    transports: ["websocket"],
    withCredentials: true
  });

  state.socket.on("accounts:updated", loadDashboard);
  state.socket.on("transactions:updated", loadDashboard);
  state.socket.on("dashboard:updated", loadDashboard);
  // NEW: listen for access code generated for owner
  state.socket.on("access:request", (data) => {
    if (data && String(data.owner_id) === String(state.user?.id)) {
      state.pendingAccessRequest = data;
      if (el.ownerApproveView) el.ownerApproveView.style.display = "block";
      if (el.ownerCodeView) el.ownerCodeView.style.display = "none";
      document.getElementById("ownerCodeModal")?.classList.add("active");
      showToast("New remote access request received", "info");
    }
  });
  state.socket.on("access:code", (data) => {
    if (data && data.code && String(data.owner_id) === String(state.user?.id)) {
      showOwnerCodeModal(data.code);
    }
  });
}

let deferredPrompt = null;
let pwaPopupTimer = null;

function initPWAInstall() {
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showPwaPopup();
  });

  window.addEventListener('appinstalled', () => {
    hidePwaPopup();
    deferredPrompt = null;
  });

  const closeBtn = document.getElementById('pwaPopupClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePwaPopup();
    });
  }

  const popup = document.getElementById('pwaPopup');
  if (popup) {
    popup.addEventListener('click', (e) => {
      if (e.target.closest('.pwa-popup-close')) return;
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
          deferredPrompt = null;
          hidePwaPopup();
        });
      }
    });
  }
}

function showPwaPopup() {
  const popup = document.getElementById('pwaPopup');
  if (!popup) return;
  popup.classList.add('show');
  if (pwaPopupTimer) clearTimeout(pwaPopupTimer);
  pwaPopupTimer = setTimeout(() => {
    popup.classList.remove('show');
  }, 3000);
}

function hidePwaPopup() {
  const popup = document.getElementById('pwaPopup');
  if (popup) popup.classList.remove('show');
  if (pwaPopupTimer) clearTimeout(pwaPopupTimer);
}

function updateDate() {
  if (!el.date) return;
  el.date.textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function renderTransactions(transactions = state.transactions) {
  if (!el.txList) return;

  if (!transactions.length) {
    el.txList.innerHTML = `
      <div class="transaction-item-mobile glass-card">
        <div class="transaction-details-mobile">
          <div class="transaction-title">No transactions yet</div>
          <div class="transaction-info">Your recent activity will appear here</div>
        </div>
      </div>
    `;
    return;
  }

  el.txList.innerHTML = transactions.map((t) => {
    const type = String(t.type || "").toLowerCase();
    const rawAmount = Number(t.amount || 0);
    const note = String(t.note || "").toLowerCase();
    const transferIn = type === "transfer" && /transfer in|qr & pay in|money in|credit/i.test(note);
    const isOutType = ["expense", "out", "debit", "withdrawal", "moneyout", "money out"].some((key) => type.includes(key))
      || /transfer out|qr & pay out|money out|sent/i.test(note);
    const positive = transferIn || (!isOutType && (type === "income" || rawAmount > 0));
    const amount = Math.abs(rawAmount);

    return `
      <div class="transaction-item-mobile glass-card">
        <div class="transaction-icon-mobile">
          <i class="fas fa-receipt"></i>
        </div>
        <div class="transaction-details-mobile">
          <div class="transaction-title">${t.note || t.type || "Transaction"}</div>
          <div class="transaction-info">${t.type || ""}</div>
        </div>
        <div class="transaction-amount-mobile ${positive ? "positive" : "negative"}">
          ${positive ? "+" : "-"}${formatMoney(amount)}
        </div>
      </div>
    `;
  }).join("");
}

function renderInsights() {
  if (!el.insightsGrid) return;

  const totalBalance = state.accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const net = state.monthlyIncome - state.monthlyExpense;
  const savingsRate = state.monthlyIncome > 0 ? Math.round((net / state.monthlyIncome) * 100) : 0;
  const spendingRate = state.monthlyIncome > 0 ? Math.round((state.monthlyExpense / state.monthlyIncome) * 100) : 0;

  const cards = [
    {
      icon: "piggy-bank",
      iconClass: "savings",
      title: "Savings Health",
      desc: "Monthly net savings",
      value: `${net >= 0 ? "+" : "-"}${formatMoney(Math.abs(net))}`,
      valueClass: net >= 0 ? "positive" : "negative",
      meta: `${savingsRate}% of income`
    },
    {
      icon: "chart-line",
      iconClass: "spending",
      title: "Spending Ratio",
      desc: "Expense versus income",
      value: `${Math.max(0, spendingRate)}%`,
      valueClass: spendingRate > 80 ? "negative" : "warning",
      meta: spendingRate > 80 ? "Needs attention" : "In control"
    },
    {
      icon: "wallet",
      iconClass: "budget",
      title: "Total Balance",
      desc: "Across all accounts",
      value: formatMoney(totalBalance),
      valueClass: totalBalance >= 0 ? "positive" : "negative",
      meta: `${state.accounts.length} account(s)`
    },
    {
      icon: "arrow-up-right-dots",
      iconClass: "income",
      title: "Income Pulse",
      desc: "Current month income",
      value: `+${formatMoney(state.monthlyIncome)}`,
      valueClass: "positive",
      meta: "Updated in realtime"
    }
  ];

  el.insightsGrid.innerHTML = cards.map((card) => `
    <article class="insight-card">
      <div class="insight-header">
        <div class="insight-icon ${card.iconClass}">
          <i class="fas fa-${card.icon}"></i>
        </div>
        <div class="insight-content">
          <h3>${card.title}</h3>
          <div class="insight-desc">${card.desc}</div>
          <div class="insight-metric">
            <span class="metric-value ${card.valueClass}">${card.value}</span>
            <span class="metric-label">${card.meta}</span>
          </div>
        </div>
      </div>
    </article>
  `).join("");
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hour${diffMins >= 120 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

function formatTimeShort(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return `${Math.floor(diffMins / 1440)}d`;
}

function shortCode(value) {
  const raw = String(value || "").replace(/[^a-zA-Z0-9]/g, "");
  return (raw + Date.now().toString(36)).slice(0, 6).toUpperCase();
}

function generateTransferCode(accountId) {
  const seed = `${state.user?.id || "u"}:${accountId || ""}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const unsigned = (hash >>> 0).toString(36).toUpperCase();
  return `MM${unsigned}`.slice(0, 8);
}

function renderAccessShareQr(seed) {
  if (!el.accessShareQr) return;

  const encoded = encodeURIComponent(String(seed || ""));
  const qrUrlPrimary = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&ecc=H&margin=18&data=${encoded}`;
  const qrUrlSecondary = `https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=${encoded}`;

  el.accessShareQr.innerHTML = "";
  const img = document.createElement("img");
  img.src = qrUrlPrimary;
  img.alt = "Share QR";
  img.className = "access-share-qr-image";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.crossOrigin = "anonymous";
  img.dataset.qrFallbackTried = "0";

  img.addEventListener("error", () => {
    if (img.dataset.qrFallbackTried !== "1") {
      img.dataset.qrFallbackTried = "1";
      img.src = qrUrlSecondary;
      return;
    }
    renderFallbackShareQr(seed);
  });

  el.accessShareQr.appendChild(img);
}

function renderFallbackShareQr(seed) {
  if (!el.accessShareQr) return;

  const raw = String(seed || "");
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  const size = 29;
  const cells = [];
  for (let i = 0; i < size * size; i += 1) {
    const bit = ((hash >>> (i % 24)) ^ (i * 2654435761)) & 1;
    cells.push(`<div class="fallback-qr-cell${bit ? "" : " white"}"></div>`);
  }

  el.accessShareQr.innerHTML = `<div class="fallback-qr" aria-label="Share code fallback visual">${cells.join("")}</div>`;
}

async function approvePendingAccessRequest() {
  if (!state.pendingAccessRequest?.request_id) return;
  try {
    const res = await fetch(`${CONFIG.API_BASE}/access/approve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: state.pendingAccessRequest.request_id, approve: true })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(payload.error || "Approval failed", "error");
      return;
    }
    showOwnerCodeModal(payload.code);
    showToast("Access approved");
  } catch {
    showToast("Approval failed", "error");
  }
}

async function rejectPendingAccessRequest() {
  if (!state.pendingAccessRequest?.request_id) return;
  try {
    await fetch(`${CONFIG.API_BASE}/access/approve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: state.pendingAccessRequest.request_id, approve: false })
    });
  } catch {
    // no-op
  }
  state.pendingAccessRequest = null;
  document.getElementById("ownerCodeModal")?.classList.remove("active");
  showToast("Request rejected", "info");
}

async function shareProfileSummary() {
  const totalBalance = state.accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
  const text = [
    "Money Manager Profile Snapshot",
    `Name: ${state.user?.name || state.user?.email || "User"}`,
    `Accounts: ${state.accounts.length}`,
    `Total Balance: ${formatMoney(totalBalance)}`,
    `Monthly Income: ${formatMoney(state.monthlyIncome)}`,
    `Monthly Expense: ${formatMoney(state.monthlyExpense)}`
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({ title: "Account Profile Snapshot", text });
      showToast("Profile snapshot shared");
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Profile snapshot copied");
      return;
    }
  } catch {
    // user canceled share sheet
    return;
  }

  window.prompt("Copy profile snapshot", text);
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

  icon.className = type === "error"
    ? "fas fa-exclamation-circle"
    : "fas fa-check-circle";

  msg.textContent = message;
  el.toast.classList.add("show");
  setTimeout(() => el.toast.classList.remove("show"), 3000);
}

async function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");

    const keyRes = await fetch(`${CONFIG.API_BASE}/users/notifications/public-key`, {
      credentials: "include"
    });

    if (!keyRes.ok) return;

    const keyPayload = await keyRes.json().catch(() => ({}));
    const publicKey = String(keyPayload.publicKey || "").trim();
    if (!publicKey) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    if (!subscription) return;
    await savePushSubscription(subscription);
  } catch (err) {
    console.warn("Push init failed", err);
  }
}

async function savePushSubscription(subscription) {
  try {
    const payload = {
      subscription: typeof subscription.toJSON === "function"
        ? subscription.toJSON()
        : subscription
    };

    await fetch(`${CONFIG.API_BASE}/users/notifications/key`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Push subscription save failed", err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const normalized = String(base64String || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const base64 = normalized + padding;
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// == minimal JS for ultra-premium micro-interactions ==
(function () {
  const notificationCountEl = document.getElementById("notificationCount");
  const bellParent = document.querySelector(".mobile-notifications");
  if (notificationCountEl && bellParent) {
    const observer = new MutationObserver(() => {
      const count = parseInt(notificationCountEl.innerText, 10) || 0;
      bellParent.classList.toggle("has-notifications", count > 0);
    });
    observer.observe(notificationCountEl, { childList: true, characterData: true, subtree: true });
    if (parseInt(notificationCountEl.innerText, 10) > 0) bellParent.classList.add("has-notifications");
  }
})();

