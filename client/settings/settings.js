const CONFIG = {
  API_BASE: window.ENV?.API_BASE || window.location.origin
};

const ROUTES = {
  dashboard: "/app/nav/dashboard",
  accounts: "/app/nav/accounts",
  transactions: "/app/nav/transactions",
  categories: "/app/nav/categories",
  settings: "/app/nav/settings"
};

const SETTINGS_KEY = "mm_ui_settings";
const PROFILE_KEY = "mm_profile_prefs";
const PRIVACY_KEY = "mm_privacy_prefs";
const SECURITY_KEY = "mm_security_prefs";
const APPEARANCE_KEY = "mm_appearance_prefs";

const uiState = { backup: true, notifications: true, email: true, reminders: true };
const profilePrefs = { phone: "", currency: "INR", language: "English (United States)" };
const privacyPrefs = { share_dashboard: true, share_accounts: false, share_transactions: false };
const securityPrefs = { pattern_enabled: false, biometrics_enabled: false, face_lock_enabled: false, windows_hello_enabled: false, android_lock_enabled: false, lock_enabled: false, pin_hash: "", passkey_credential_id: "" };
const appearancePrefs = { theme: "light", font: "medium", charts: "balanced" };

const el = {
  backBtn: document.getElementById("backBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  editProfileModal: document.getElementById("editProfileModal"),
  editProfileForm: document.getElementById("editProfileForm"),
  editProfileModalClose: document.getElementById("editProfileModalClose"),
  actionToast: document.getElementById("actionToast"),
  settingItems: document.querySelectorAll(".setting-item"),
  toggleSwitches: document.querySelectorAll(".toggle-switch input"),
  navItems: document.querySelectorAll(".mobile-bottom-nav .nav-item"),
  statsAccounts: document.getElementById("statsAccounts"),
  statsTransactions: document.getElementById("statsTransactions"),
  statsCategories: document.getElementById("statsCategories"),
  currencyModal: document.getElementById("currencyModal"),
  languageModal: document.getElementById("languageModal"),
  securityModal: document.getElementById("securityModal"),
  privacyModal: document.getElementById("privacyModal"),
  themeModal: document.getElementById("themeModal"),
  fontModal: document.getElementById("fontModal"),
  chartsModal: document.getElementById("chartsModal"),
  currencyForm: document.getElementById("currencyForm"),
  securityForm: document.getElementById("securityForm"),
  privacyForm: document.getElementById("privacyForm"),
  themeForm: document.getElementById("themeForm"),
  fontForm: document.getElementById("fontForm"),
  chartsForm: document.getElementById("chartsForm"),
  currencySelect: document.getElementById("currencySelect"),
  themeSelect: document.getElementById("themeSelect"),
  fontSelect: document.getElementById("fontSelect"),
  chartsSelect: document.getElementById("chartsSelect"),
  securityPatternToggle: document.getElementById("securityPatternToggle"),
  securityBiometricToggle: document.getElementById("securityBiometricToggle"),
  securityFaceToggle: document.getElementById("securityFaceToggle"),
  securityWindowsHelloToggle: document.getElementById("securityWindowsHelloToggle"),
  securityAndroidLockToggle: document.getElementById("securityAndroidLockToggle"),
  privacyDashboardToggle: document.getElementById("privacyDashboardToggle"),
  privacyAccountsToggle: document.getElementById("privacyAccountsToggle"),
  privacyTransactionsToggle: document.getElementById("privacyTransactionsToggle"),
  currentPassword: document.getElementById("currentPassword"),
  newPassword: document.getElementById("newPassword"),
  confirmPassword: document.getElementById("confirmPassword"),
  lockPin: document.getElementById("lockPin"),
  confirmLockPin: document.getElementById("confirmLockPin"),
  securityPasskeyHint: document.getElementById("securityPasskeyHint")
  ,
  clearDataWizardModal: document.getElementById("clearDataWizardModal"),
  clearDataWizardClose: document.getElementById("clearDataWizardClose"),
  clearDataWizardBody: document.getElementById("clearDataWizardBody"),
  comingSoonModal: document.getElementById("comingSoonModal"),
  comingSoonClose: document.getElementById("comingSoonClose"),
  comingSoonOk: document.getElementById("comingSoonOk"),
  comingSoonTitle: document.getElementById("comingSoonTitle"),
  comingSoonMessage: document.getElementById("comingSoonMessage")
};

function secureNavigate(key) {
  const path = ROUTES[key];
  if (!path) return;
  window.location.href = CONFIG.API_BASE + path;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await checkAuth();
    loadLocalPrefs();
    await Promise.all([loadUserProfile(), loadStats()]);
    initNavigation();
    initSettings();
    initLogout();
    initModals();
    applyAppearance();
    syncToggleUI();
    refreshDescriptions();
  } catch (err) {
    console.error(err);
    showToast("Failed to load settings", "error");
  }
});

async function checkAuth() {
  const res = await fetch(`${CONFIG.API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) window.location.href = "/login/login.html";
}

async function loadUserProfile() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/users/profile`, { credentials: "include" });
    if (!res.ok) return;
    const user = await res.json();
    const nameEl = document.querySelector(".profile-info h3");
    const emailEl = document.querySelector(".profile-info p");
    if (nameEl) nameEl.textContent = user.name || "User Name";
    if (emailEl) emailEl.textContent = user.email || "member@example.com";

    const nameInput = document.getElementById("editProfileName");
    const emailInput = document.getElementById("editProfileEmail");
    const phoneInput = document.getElementById("editProfilePhone");
    const currencyInput = document.getElementById("editProfileCurrency");
    if (nameInput) nameInput.value = user.name || "";
    if (emailInput) emailInput.value = user.email || "";
    if (phoneInput) phoneInput.value = profilePrefs.phone || "";
    if (currencyInput) currencyInput.value = profilePrefs.currency || "INR";
  } catch (err) {
    console.warn("Profile load failed", err);
  }
}

async function loadStats() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/users/stats`, { credentials: "include" });
    if (!res.ok) return;
    const stats = await res.json();
    if (el.statsAccounts) el.statsAccounts.textContent = String(stats.accounts || 0);
    if (el.statsTransactions) el.statsTransactions.textContent = String(stats.transactions || 0);
    if (el.statsCategories) el.statsCategories.textContent = String(stats.categories || 0);
  } catch (err) {
    console.warn("Stats load failed", err);
  }
}

function initNavigation() {
  el.backBtn?.addEventListener("click", () => secureNavigate("dashboard"));
  el.navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      secureNavigate(item.dataset.nav);
    });
  });
}

function initSettings() {
  el.settingItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      // Ignore row-click handlers when the interaction is on the toggle itself.
      if (event.target.closest(".toggle-switch")) return;
      handleSettingClick(item.dataset.setting);
    });
  });

  el.toggleSwitches.forEach((toggle) => {
    toggle.addEventListener("change", function () {
      const settingName = this.closest(".setting-item")?.dataset?.setting;
      if (!settingName) return;
      uiState[settingName] = !!this.checked;
      saveLocalPrefs();
      refreshDescriptions();
      if (settingName === "email") {
        showToast("Email reminders coming soon", "info");
      } else if (settingName === "notifications") {
        notifyNow(
          "Push Notifications",
          this.checked
            ? "Push notifications enabled"
            : "Push notifications disabled. You will not receive further push alerts."
        );
      } else if (settingName === "reminders") {
        notifyNow(
          "Bill Reminders",
          this.checked
            ? "Bill reminders enabled"
            : "Bill reminders disabled. No further bill reminder alerts will be sent."
        );
      } else {
        showToast(`${toLabel(settingName)} updated`);
      }
    });
  });

  el.editProfileForm?.addEventListener("submit", handleEditProfile);
  el.editProfileModalClose?.addEventListener("click", () => closeModal(el.editProfileModal));
}

function initModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-close-modal");
      const modal = document.getElementById(id);
      closeModal(modal);
    });
  });

  [el.currencyModal, el.languageModal, el.securityModal, el.privacyModal, el.themeModal, el.fontModal, el.chartsModal, el.editProfileModal]
    .forEach((modal) => {
      modal?.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

  [el.clearDataWizardModal, el.comingSoonModal].forEach((modal) => {
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });
  el.clearDataWizardClose?.addEventListener("click", () => closeModal(el.clearDataWizardModal));
  el.comingSoonClose?.addEventListener("click", () => closeModal(el.comingSoonModal));
  el.comingSoonOk?.addEventListener("click", () => closeModal(el.comingSoonModal));

  el.currencyForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    profilePrefs.currency = el.currencySelect?.value || "INR";
    const profileCurrency = document.getElementById("editProfileCurrency");
    if (profileCurrency) profileCurrency.value = profilePrefs.currency;
    saveLocalPrefs();
    refreshDescriptions();
    closeModal(el.currencyModal);
    showToast("Currency updated");
  });

  el.securityForm?.addEventListener("submit", handleSecuritySubmit);
  el.privacyForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    privacyPrefs.share_dashboard = !!el.privacyDashboardToggle?.checked;
    privacyPrefs.share_accounts = !!el.privacyAccountsToggle?.checked;
    privacyPrefs.share_transactions = !!el.privacyTransactionsToggle?.checked;
    saveLocalPrefs();
    refreshDescriptions();
    closeModal(el.privacyModal);
    showToast("Privacy preferences saved");
  });

  el.themeForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    appearancePrefs.theme = el.themeSelect?.value || "light";
    saveLocalPrefs();
    applyAppearance();
    refreshDescriptions();
    closeModal(el.themeModal);
    showToast("Theme updated");
  });

  el.fontForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    appearancePrefs.font = el.fontSelect?.value || "medium";
    saveLocalPrefs();
    applyAppearance();
    refreshDescriptions();
    closeModal(el.fontModal);
    showToast("Font size updated");
  });

  el.chartsForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    appearancePrefs.charts = el.chartsSelect?.value || "balanced";
    saveLocalPrefs();
    refreshDescriptions();
    closeModal(el.chartsModal);
    showToast("Charts preference updated");
  });
}

function initLogout() {
  el.logoutBtn?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to log out?")) return;
    await fetch(`${CONFIG.API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = "/login/login.html";
  });
}

async function handleEditProfile(e) {
  e.preventDefault();
  const name = document.getElementById("editProfileName")?.value?.trim() || "";
  const email = document.getElementById("editProfileEmail")?.value?.trim() || "";
  const phone = document.getElementById("editProfilePhone")?.value?.trim() || "";
  const currency = document.getElementById("editProfileCurrency")?.value || "INR";

  const res = await fetch(`${CONFIG.API_BASE}/users/profile`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, currency })
  });

  if (!res.ok) {
    showToast("Profile update failed", "error");
    return;
  }

  profilePrefs.phone = phone;
  profilePrefs.currency = currency;
  saveLocalPrefs();
  showToast("Profile updated");
  closeModal(el.editProfileModal);
  await loadUserProfile();
  refreshDescriptions();
}

async function handleSecuritySubmit(e) {
  e.preventDefault();
  const current_password = el.currentPassword?.value || "";
  const new_password = el.newPassword?.value || "";
  const confirm_password = el.confirmPassword?.value || "";

  if (new_password || current_password || confirm_password) {
    if (new_password.length < 6) {
      showToast("New password must be at least 6 characters", "error");
      return;
    }
    if (new_password !== confirm_password) {
      showToast("Password confirmation mismatch", "error");
      return;
    }

    const res = await fetch(`${CONFIG.API_BASE}/users/password`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password, new_password })
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(payload.error || "Password update failed", "error");
      return;
    }
  }

  const usePattern = !!el.securityPatternToggle?.checked;
  const wantsWindowsHello = !!el.securityWindowsHelloToggle?.checked;
  const wantsAndroidLock = !!el.securityAndroidLockToggle?.checked;
  const useDeviceLock = !!el.securityBiometricToggle?.checked || !!el.securityFaceToggle?.checked || wantsWindowsHello || wantsAndroidLock;

  if (!usePattern && !useDeviceLock) {
    securityPrefs.pattern_enabled = false;
    securityPrefs.biometrics_enabled = false;
    securityPrefs.face_lock_enabled = false;
    securityPrefs.windows_hello_enabled = false;
    securityPrefs.android_lock_enabled = false;
    securityPrefs.lock_enabled = false;
    securityPrefs.pin_hash = "";
    securityPrefs.passkey_credential_id = "";
    saveLocalPrefs();
    refreshDescriptions();
    closeModal(el.securityModal);
    showToast("Security settings saved");
    return;
  }

  if (usePattern) {
    const pin = String(el.lockPin?.value || "").trim();
    const pinConfirm = String(el.confirmLockPin?.value || "").trim();
    const hasExistingPin = !!securityPrefs.pin_hash;

    if (!pin && !hasExistingPin) {
      showToast("Set a passcode to enable Pattern Lock", "error");
      return;
    }
    if (pin && (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin))) {
      showToast("Passcode must be 4 to 8 digits", "error");
      return;
    }
    if (pin && pin !== pinConfirm) {
      showToast("Passcode confirmation mismatch", "error");
      return;
    }
    if (pin) {
      securityPrefs.pin_hash = await sha256Hex(pin);
    }
  } else {
    securityPrefs.pin_hash = "";
  }

  if (useDeviceLock) {
    const userAgent = String(navigator.userAgent || "");
    const isWindows = /Windows NT/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);

    if (wantsWindowsHello && !isWindows) {
      showToast("Windows Hello lock can be enabled only on Windows devices", "error");
      return;
    }
    if (wantsAndroidLock && !isAndroid) {
      showToast("Android device lock can be enabled only on Android devices", "error");
      return;
    }

    const webAuthnAvailable = typeof PublicKeyCredential !== "undefined" && window.isSecureContext;
    if (!webAuthnAvailable) {
      showToast("Device lock is not supported on this device/browser", "error");
      return;
    }

    try {
      if (!securityPrefs.passkey_credential_id) {
        securityPrefs.passkey_credential_id = await createLocalPasskeyCredential();
      }
    } catch (err) {
      console.error("Passkey setup failed", err);
      showToast("Device lock setup failed", "error");
      return;
    }
  } else {
    securityPrefs.passkey_credential_id = "";
  }

  securityPrefs.pattern_enabled = usePattern;
  securityPrefs.biometrics_enabled = !!el.securityBiometricToggle?.checked;
  securityPrefs.face_lock_enabled = !!el.securityFaceToggle?.checked;
  securityPrefs.windows_hello_enabled = wantsWindowsHello;
  securityPrefs.android_lock_enabled = wantsAndroidLock;
  securityPrefs.lock_enabled = usePattern || useDeviceLock;

  saveLocalPrefs();
  refreshDescriptions();
  closeModal(el.securityModal);
  if (el.lockPin) el.lockPin.value = "";
  if (el.confirmLockPin) el.confirmLockPin.value = "";
  showToast("Security settings saved");
}

async function handleSettingClick(setting) {
  switch (setting) {
    case "profile":
      openModal(el.editProfileModal);
      return;
    case "currency":
      el.currencySelect.value = profilePrefs.currency || "INR";
      openModal(el.currencyModal);
      return;
    case "language":
      openModal(el.languageModal);
      return;
    case "security":
      el.securityPatternToggle.checked = !!securityPrefs.pattern_enabled;
      el.securityBiometricToggle.checked = !!securityPrefs.biometrics_enabled;
      el.securityFaceToggle.checked = !!securityPrefs.face_lock_enabled;
      if (el.securityWindowsHelloToggle) el.securityWindowsHelloToggle.checked = !!securityPrefs.windows_hello_enabled;
      if (el.securityAndroidLockToggle) el.securityAndroidLockToggle.checked = !!securityPrefs.android_lock_enabled;
      el.currentPassword.value = "";
      el.newPassword.value = "";
      el.confirmPassword.value = "";
      if (el.lockPin) el.lockPin.value = "";
      if (el.confirmLockPin) el.confirmLockPin.value = "";
      if (el.securityPasskeyHint) {
        el.securityPasskeyHint.textContent = securityPrefs.passkey_credential_id
          ? "Device lock passkey is ready on this browser/device."
          : "Enable Biometric/Face/Windows/Android lock to use device lock (passkey) at app open.";
      }
      openModal(el.securityModal);
      return;
    case "privacy":
      el.privacyDashboardToggle.checked = !!privacyPrefs.share_dashboard;
      el.privacyAccountsToggle.checked = !!privacyPrefs.share_accounts;
      el.privacyTransactionsToggle.checked = !!privacyPrefs.share_transactions;
      openModal(el.privacyModal);
      return;
    case "backup":
      uiState.backup = !uiState.backup;
      saveLocalPrefs();
      syncToggleUI();
      refreshDescriptions();
      showToast(`Backup & Sync ${uiState.backup ? "enabled" : "disabled"}`);
      return;
    case "notifications":
      uiState.notifications = !uiState.notifications;
      saveLocalPrefs();
      syncToggleUI();
      refreshDescriptions();
      notifyNow(
        "Push Notifications",
        uiState.notifications
          ? "Push notifications enabled"
          : "Push notifications disabled. You will not receive further push alerts."
      );
      return;
    case "email":
      showToast("Email reminders coming soon", "info");
      return;
    case "reminders":
      uiState.reminders = !uiState.reminders;
      saveLocalPrefs();
      syncToggleUI();
      refreshDescriptions();
      notifyNow(
        "Bill Reminders",
        uiState.reminders
          ? "Bill reminders enabled"
          : "Bill reminders disabled. No further bill reminder alerts will be sent."
      );
      return;
    case "theme":
      el.themeSelect.value = appearancePrefs.theme;
      openModal(el.themeModal);
      return;
    case "font":
      el.fontSelect.value = appearancePrefs.font;
      openModal(el.fontModal);
      return;
    case "charts":
      el.chartsSelect.value = appearancePrefs.charts;
      openModal(el.chartsModal);
      return;
    case "export":
      await exportData();
      return;
    case "import":
      await importData();
      return;
    case "clear":
      await openClearDataWizard();
      return;
    case "about":
      alert("Money Manager v2.1.0\nBuild 210\nRealtime-enabled finance tracker.");
      return;
    case "help":
      showComingSoon("Help & Support", "Help center and direct support chat are coming soon.");
      return;
    case "rate":
      showComingSoon("Rate App", "Store rating and feedback flow is coming soon.");
      return;
    default:
      showToast(`${toLabel(setting)} opened`, "info");
  }
}

async function exportData() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/users/export`, { credentials: "include" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Export failed", "error");
      return;
    }
    const data = await res.json();
    const summary = data.summary || {};
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = `money-manager-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(
      `Export complete: ${summary.accounts || 0} accounts, ${summary.transactions || 0} transactions`
    );
  } catch (err) {
    console.error("Export error:", err);
    showToast("Export failed", "error");
  }
}

async function importData() {
  if (!confirm("Import backup and replace your current data in database?")) return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const isLegacy = !!(json && (json.accounts || json.categories || json.transactions));
      const isV2 = !!(json && json.meta && json.data);
      if (!isLegacy && !isV2) {
        showToast("Invalid backup format", "error");
        return;
      }

      const res = await fetch(`${CONFIG.API_BASE}/users/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || err.details || "Import failed", "error");
        return;
      }
      const result = await res.json().catch(() => ({}));
      await loadStats();
      const imported = result.imported || {};
      const skipped = result.skipped || {};
      const importedTotal =
        (imported.accounts || 0) +
        (imported.categories || 0) +
        (imported.transactions || 0) +
        (imported.transfers || 0) +
        (imported.investments || 0);
      const skippedTotal =
        (skipped.transactions_invalid_refs || 0) +
        (skipped.transfers_invalid_refs || 0) +
        (skipped.investments_invalid_refs || 0);
      showToast(
        `Import complete: ${importedTotal} records restored${skippedTotal ? `, ${skippedTotal} skipped` : ""}`
      );
    } catch (err) {
      console.error(err);
      showToast("Invalid import file", "error");
    }
  };
  input.click();
}

async function clearData() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/users/clear-data`, {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "Clear data failed", "error");
      return;
    }
    const payload = await res.json().catch(() => ({}));
    await loadStats();
    const deleted = payload.deleted || {};
    const totalDeleted = Object.values(deleted).reduce((sum, v) => sum + (Number(v) || 0), 0);
    showToast(`Entire data cleared from database (${totalDeleted} records deleted)`);
  } catch (err) {
    console.error("Clear data error:", err);
    showToast("Clear data failed", "error");
  }
}

async function openClearDataWizard() {
  if (!el.clearDataWizardModal || !el.clearDataWizardBody) {
    await clearData();
    return;
  }

  let step = 1;
  let typed = "";
  const render = () => {
    if (step === 1) {
      el.clearDataWizardBody.innerHTML = `
        <p class="wizard-note">This will permanently remove your accounts, transactions, categories, and related records from database.</p>
        <div class="wizard-actions">
          <button type="button" class="secondary-btn" id="wizardCancelBtn">Cancel</button>
          <button type="button" class="submit-btn" id="wizardNextBtn"><span>Continue</span></button>
        </div>
      `;
    } else if (step === 2) {
      el.clearDataWizardBody.innerHTML = `
        <p class="wizard-note">Type <strong>CLEAR</strong> to confirm final deletion.</p>
        <input class="wizard-input" id="wizardClearInput" placeholder="Type CLEAR" value="${typed}">
        <div class="wizard-actions">
          <button type="button" class="secondary-btn" id="wizardBackBtn">Back</button>
          <button type="button" class="submit-btn" id="wizardDeleteBtn"><span>Delete Data</span></button>
        </div>
      `;
    } else {
      el.clearDataWizardBody.innerHTML = `
        <p class="wizard-note">Deleting your data...</p>
      `;
    }

    bindStepActions();
  };

  const bindStepActions = () => {
    const cancel = document.getElementById("wizardCancelBtn");
    const next = document.getElementById("wizardNextBtn");
    const back = document.getElementById("wizardBackBtn");
    const input = document.getElementById("wizardClearInput");
    const del = document.getElementById("wizardDeleteBtn");

    cancel?.addEventListener("click", () => closeModal(el.clearDataWizardModal));
    next?.addEventListener("click", () => {
      step = 2;
      render();
    });
    back?.addEventListener("click", () => {
      step = 1;
      render();
    });
    input?.addEventListener("input", (e) => {
      typed = e.target.value || "";
    });
    del?.addEventListener("click", async () => {
      if ((typed || "").trim().toUpperCase() !== "CLEAR") {
        showToast("Type CLEAR to continue", "error");
        return;
      }
      step = 3;
      render();
      await clearData();
      closeModal(el.clearDataWizardModal);
    });
  };

  render();
  openModal(el.clearDataWizardModal);
}

function showComingSoon(title, message) {
  if (!el.comingSoonModal) return;
  if (el.comingSoonTitle) el.comingSoonTitle.textContent = title || "Coming Soon";
  if (el.comingSoonMessage) el.comingSoonMessage.textContent = message || "This section is under development.";
  openModal(el.comingSoonModal);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes) {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  const raw = atob(normalized + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function createLocalPasskeyCredential() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Money Manager", id: window.location.hostname },
      user: {
        id: userId,
        name: "money-manager-user",
        displayName: "Money Manager User"
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      },
      attestation: "none"
    }
  });

  if (!credential?.rawId) {
    throw new Error("No credential ID returned");
  }

  return toBase64Url(new Uint8Array(credential.rawId));
}
function openModal(modal) {
  modal?.classList.add("active");
}

function closeModal(modal) {
  modal?.classList.remove("active");
}

function loadLocalPrefs() {
  Object.assign(uiState, safeRead(SETTINGS_KEY, uiState));
  Object.assign(profilePrefs, safeRead(PROFILE_KEY, profilePrefs));
  Object.assign(privacyPrefs, safeRead(PRIVACY_KEY, privacyPrefs));
  Object.assign(securityPrefs, safeRead(SECURITY_KEY, securityPrefs));
  Object.assign(appearancePrefs, safeRead(APPEARANCE_KEY, appearancePrefs));
}

function saveLocalPrefs() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(uiState));
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profilePrefs));
  localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacyPrefs));
  localStorage.setItem(SECURITY_KEY, JSON.stringify(securityPrefs));
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearancePrefs));
}

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function syncToggleUI() {
  el.toggleSwitches.forEach((toggle) => {
    const settingName = toggle.closest(".setting-item")?.dataset?.setting;
    if (!settingName) return;
    toggle.checked = !!uiState[settingName];
  });
}

function refreshDescriptions() {
  const currencyDesc = document.querySelector('[data-setting="currency"] .setting-description');
  if (currencyDesc) currencyDesc.textContent = `${profilePrefs.currency} - Preferred currency`;

  const langDesc = document.querySelector('[data-setting="language"] .setting-description');
  if (langDesc) langDesc.textContent = profilePrefs.language;

  const themeDesc = document.querySelector('[data-setting="theme"] .setting-description');
  if (themeDesc) themeDesc.textContent = `${capitalize(appearancePrefs.theme)} mode`;

  const fontDesc = document.querySelector('[data-setting="font"] .setting-description');
  if (fontDesc) fontDesc.textContent = capitalize(appearancePrefs.font);

  const chartsDesc = document.querySelector('[data-setting="charts"] .setting-description');
  if (chartsDesc) chartsDesc.textContent = `${capitalize(appearancePrefs.charts)} visuals`;

  const securityDesc = document.querySelector('[data-setting="security"] .setting-description');
  if (securityDesc) {
    const modes = [];
    if (securityPrefs.pattern_enabled) modes.push("Passcode");
    if (securityPrefs.biometrics_enabled) modes.push("Biometric");
    if (securityPrefs.face_lock_enabled) modes.push("Face lock");
    if (securityPrefs.windows_hello_enabled) modes.push("Windows Hello");
    if (securityPrefs.android_lock_enabled) modes.push("Android lock");
    securityDesc.textContent = (securityPrefs.lock_enabled || modes.length)
      ? `App lock: ${modes.length ? modes.join(", ") : "Enabled"}`
      : "Password, PIN, biometrics";
  }

  const privacyDesc = document.querySelector('[data-setting="privacy"] .setting-description');
  if (privacyDesc) {
    const allow = [];
    if (privacyPrefs.share_dashboard) allow.push("dashboard");
    if (privacyPrefs.share_accounts) allow.push("accounts");
    if (privacyPrefs.share_transactions) allow.push("transactions");
    privacyDesc.textContent = allow.length ? `Sharing: ${allow.join(", ")}` : "No data sharing enabled";
  }

  const emailDesc = document.querySelector('[data-setting="email"] .setting-description');
  if (emailDesc) emailDesc.textContent = "Email reminders coming soon";

  const pushDesc = document.querySelector('[data-setting="notifications"] .setting-description');
  if (pushDesc) pushDesc.textContent = `Status: ${uiState.notifications ? "Enabled" : "Disabled"}`;

  const remindersDesc = document.querySelector('[data-setting="reminders"] .setting-description');
  if (remindersDesc) remindersDesc.textContent = `Status: ${uiState.reminders ? "Enabled" : "Disabled"}`;

  const backupDesc = document.querySelector('[data-setting="backup"] .setting-description');
  if (backupDesc) backupDesc.textContent = `Status: ${uiState.backup ? "Enabled" : "Disabled"}`;
}

function applyAppearance() {
  const root = document.documentElement;
  let theme = appearancePrefs.theme || "light";
  if (theme === "system") {
    try {
      theme =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    } catch {
      theme = "light";
    }
  }
  root.style.filter = theme === "dark" ? "invert(0.92) hue-rotate(180deg)" : "";
  if (appearancePrefs.font === "small") root.style.fontSize = "14px";
  else if (appearancePrefs.font === "large") root.style.fontSize = "18px";
  else root.style.fontSize = "16px";
}

function toLabel(v) {
  return String(v || "").replaceAll("_", " ").replace(/^\w/, (s) => s.toUpperCase());
}

function capitalize(v) {
  const x = String(v || "");
  return x ? x[0].toUpperCase() + x.slice(1) : x;
}

function showToast(message, type = "success") {
  if (!el.actionToast) return;
  const icon = el.actionToast.querySelector("i");
  const msg = el.actionToast.querySelector(".toast-message");
  icon.className =
    type === "error"
      ? "fas fa-exclamation-circle"
      : type === "info"
      ? "fas fa-info-circle"
      : "fas fa-check-circle";
  msg.textContent = message;
  el.actionToast.classList.add("show");
  setTimeout(() => el.actionToast.classList.remove("show"), 2800);
}

async function notifyNow(title, body) {
  try {
    if (!("Notification" in window)) {
      showToast(body);
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
      showToast(body);
      return;
    }

    showToast(`${body} (notification permission blocked)`, "info");
  } catch (err) {
    console.error("Notification error:", err);
    showToast(body);
  }
}

