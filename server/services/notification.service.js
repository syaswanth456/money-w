// ======================================================================
// PUSH NOTIFICATION SERVICE
// ======================================================================

let webpush = null;
try {
  webpush = require("web-push");
} catch (_) {
  webpush = null;
}

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

const isConfigured = !!(webpush && PUBLIC_KEY && PRIVATE_KEY);
if (isConfigured) {
  webpush.setVapidDetails(
    "mailto:support@moneymanager.app",
    PUBLIC_KEY,
    PRIVATE_KEY
  );
}

async function sendPush(subscription, payload) {
  if (!isConfigured) return { skipped: true, reason: webpush ? "missing_vapid_keys" : "web_push_not_installed" };
  if (!subscription || !subscription.endpoint) return { skipped: true, reason: "invalid_subscription" };

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload)
    );
    return { success: true };
  } catch (err) {
    console.error("Push error:", err.message);
    return { skipped: true, reason: err.message };
  }
}

module.exports = { sendPush, PUBLIC_KEY, isConfigured };
