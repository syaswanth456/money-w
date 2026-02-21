(function applyGlobalAppearance() {
  var APPEARANCE_KEY = "mm_appearance_prefs";
  var SECURITY_KEY = "mm_security_prefs";
  var SESSION_UNLOCK_KEY = "mm_lock_unlocked";
  var defaults = { theme: "light", font: "medium", charts: "balanced" };
  var prefs = defaults;

  try {
    var raw = localStorage.getItem(APPEARANCE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      prefs = Object.assign({}, defaults, parsed || {});
    }
  } catch (_) {
    prefs = defaults;
  }

  var root = document.documentElement;
  if (!root) return;

  var theme = prefs.theme || "light";
  if (theme === "system") {
    try {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch (_) {
      theme = "light";
    }
  }

  root.style.filter = theme === "dark" ? "invert(0.92) hue-rotate(180deg)" : "";

  if (prefs.font === "small") root.style.fontSize = "14px";
  else if (prefs.font === "large") root.style.fontSize = "18px";
  else root.style.fontSize = "16px";

  injectMobileLayoutSafety();

  enforceDeviceLock();

  function enforceDeviceLock() {
    if (shouldSkipLockPath()) return;

    var security = readSecurityPrefs();
    if (!isLockEnabled(security)) return;

    try {
      if (sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1") return;
    } catch (_) {
      // continue
    }

    var boot = function () {
      createLockOverlay(security);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }

  function shouldSkipLockPath() {
    var path = String(window.location.pathname || "").toLowerCase();
    var isAuthPage = path.indexOf("/login") !== -1 || path.indexOf("/signup") !== -1;
    if (isAuthPage) {
      try {
        sessionStorage.removeItem(SESSION_UNLOCK_KEY);
      } catch (_) {
        // ignore
      }
    }
    return isAuthPage;
  }

  function readSecurityPrefs() {
    var base = {
      pattern_enabled: false,
      biometrics_enabled: false,
      face_lock_enabled: false,
      lock_enabled: false,
      pin_hash: "",
      passkey_credential_id: ""
    };

    try {
      var raw = localStorage.getItem(SECURITY_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      return Object.assign(base, parsed || {});
    } catch (_) {
      return base;
    }
  }

  function isLockEnabled(security) {
    return !!(
      security &&
      (security.lock_enabled || security.pattern_enabled || security.biometrics_enabled || security.face_lock_enabled)
    );
  }

  function createLockOverlay(security) {
    if (!document.body) return;
    if (document.getElementById("mmAppLockOverlay")) return;

    var canUseDevice = !!(security.passkey_credential_id && window.isSecureContext && typeof PublicKeyCredential !== "undefined");
    var canUsePin = !!(security.pattern_enabled && security.pin_hash);

    if (!canUseDevice && !canUsePin) {
      return;
    }

    var style = document.createElement("style");
    style.id = "mmAppLockStyle";
    style.textContent = "#mmAppLockOverlay{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.52);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:16px;}#mmAppLockCard{width:min(420px,94vw);background:rgba(255,255,255,.96);border:1px solid rgba(226,232,240,.9);border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,.2);padding:18px 16px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1E293B;}#mmAppLockTitle{font-size:1.05rem;font-weight:700;margin:0 0 6px;}#mmAppLockText{font-size:.84rem;color:#64748B;margin:0 0 12px;}#mmAppLockPin{width:100%;height:44px;border:1px solid rgba(148,163,184,.55);border-radius:12px;padding:0 12px;font-size:1rem;outline:none;margin-bottom:10px;}#mmAppLockPin:focus{border-color:#2563EB;}#mmAppLockActions{display:flex;gap:8px;flex-wrap:wrap;}#mmAppLockActions button{height:40px;border:0;border-radius:10px;padding:0 12px;font-weight:600;cursor:pointer;}#mmUnlockDevice{background:#2563EB;color:#fff;}#mmUnlockPin{background:#0EA5E9;color:#fff;}#mmLockLogout{background:#E2E8F0;color:#334155;}#mmAppLockError{margin-top:8px;min-height:18px;font-size:.78rem;color:#EF4444;}";
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "mmAppLockOverlay";
    overlay.innerHTML = [
      '<div id="mmAppLockCard" role="dialog" aria-modal="true" aria-label="Unlock app">',
      '<div id="mmAppLockTitle">Unlock Money Manager</div>',
      '<p id="mmAppLockText">Use device lock (passkey) or app passcode to continue.</p>',
      canUsePin ? '<input id="mmAppLockPin" type="password" inputmode="numeric" pattern="\\d*" maxlength="8" placeholder="Enter app passcode" />' : "",
      '<div id="mmAppLockActions">',
      canUseDevice ? '<button id="mmUnlockDevice" type="button">Unlock with Device</button>' : "",
      canUsePin ? '<button id="mmUnlockPin" type="button">Unlock with Passcode</button>' : "",
      '<button id="mmLockLogout" type="button">Go to Login</button>',
      '</div>',
      '<div id="mmAppLockError"></div>',
      '</div>'
    ].join("");

    document.body.appendChild(overlay);

    var pinInput = document.getElementById("mmAppLockPin");
    var unlockPinBtn = document.getElementById("mmUnlockPin");
    var unlockDeviceBtn = document.getElementById("mmUnlockDevice");
    var logoutBtn = document.getElementById("mmLockLogout");
    var errEl = document.getElementById("mmAppLockError");

    function setError(msg) {
      if (errEl) errEl.textContent = msg || "";
    }

    function unlockNow() {
      try {
        sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
      } catch (_) {
        // ignore
      }
      overlay.remove();
      document.getElementById("mmAppLockStyle")?.remove();
    }

    async function verifyPin() {
      var pin = String(pinInput?.value || "").trim();
      if (!pin) {
        setError("Enter passcode");
        return;
      }
      var hash = await sha256Hex(pin);
      if (hash !== security.pin_hash) {
        setError("Invalid passcode");
        return;
      }
      unlockNow();
    }

    async function verifyDevice() {
      try {
        setError("");
        var challenge = crypto.getRandomValues(new Uint8Array(32));
        var credentialId = fromBase64Url(security.passkey_credential_id);

        await navigator.credentials.get({
          publicKey: {
            challenge: challenge,
            allowCredentials: [{ type: "public-key", id: credentialId }],
            timeout: 60000,
            userVerification: "required"
          }
        });

        unlockNow();
      } catch (_) {
        setError("Device unlock failed");
      }
    }

    unlockPinBtn?.addEventListener("click", verifyPin);
    pinInput?.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        verifyPin();
      }
    });
    unlockDeviceBtn?.addEventListener("click", verifyDevice);
    logoutBtn?.addEventListener("click", function () {
      window.location.href = "/login/login.html";
    });
  }

  async function sha256Hex(value) {
    var bytes = new TextEncoder().encode(String(value || ""));
    var digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  function fromBase64Url(value) {
    var normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    var pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
    var raw = atob(normalized + pad);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function injectMobileLayoutSafety() {
    if (document.getElementById("mmGlobalMobileSafetyStyle")) return;
    var style = document.createElement("style");
    style.id = "mmGlobalMobileSafetyStyle";
    style.textContent = [
      ":root{--mm-footer-safe:70px;}",
      "html,body{width:100%;max-width:100%;overflow-x:hidden;}",
      ".mobile-app{padding-bottom:calc(var(--mm-footer-safe) + env(safe-area-inset-bottom, 0px)) !important;min-height:100vh;}",
      ".mobile-main-content,.categories-container,.settings-sections,.list,.account-detail-page{padding-bottom:calc(var(--mm-footer-safe) + 6px) !important;}",
      ".mobile-bottom-nav{height:var(--mm-footer-safe);padding-bottom:calc(4px + env(safe-area-inset-bottom, 0px));z-index:1200;}",
      ".mobile-bottom-nav .nav-item span{font-size:.62rem;line-height:1.1;}",
      "@media (min-width:768px){body{padding:18px;background:#eef2f6;} .mobile-app{max-width:480px;margin:0 auto;border-radius:28px;box-shadow:0 18px 40px rgba(15,23,42,.12);overflow:hidden;position:relative;min-height:calc(100vh - 36px);} .mobile-bottom-nav{left:50% !important;right:auto !important;transform:translateX(-50%) !important;width:480px !important;max-width:100% !important;} .modal-overlay{left:50% !important;right:auto !important;transform:translateX(-50%) !important;width:480px !important;max-width:100% !important;}}",
      ".mobile-bottom-nav .nav-item[data-nav='accounts'].active i{filter:drop-shadow(0 0 8px rgba(37,99,235,.45));}"
    ].join("");
    document.head.appendChild(style);
  }
})();
