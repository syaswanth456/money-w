const { supabaseAdmin } = require("../config/supabaseClient");
const { sendPush } = require("./notification.service");

const OPTIONAL_TABLE_ERROR_CODES = new Set(["42P01", "PGRST205"]);

function isMissingTable(error) {
  if (!error) return false;
  if (OPTIONAL_TABLE_ERROR_CODES.has(error.code)) return true;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("could not find the table");
}

async function createInAppNotification(userId, payload = {}) {
  if (!userId) return { skipped: true };

  const row = {
    user_id: userId,
    type: String(payload.type || "info"),
    title: String(payload.title || "Notification"),
    message: String(payload.message || ""),
    icon: payload.icon ? String(payload.icon) : null,
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
    is_read: false
  };

  const { error } = await supabaseAdmin.from("notifications").insert(row);
  if (error) {
    if (isMissingTable(error)) return { skipped: true };
    console.warn("Notification insert warning:", error.message);
    return { skipped: true, error: error.message };
  }

  await sendPushToUser(userId, {
    title: row.title,
    body: row.message || "You have a new notification",
    icon: "/icons/icon-192.png"
  });

  return { success: true };
}

async function sendPushToUser(userId, payload) {
  const { data, error } = await supabaseAdmin
    .from("user_notification_info")
    .select("endpoint, p256dh_key, auth_key, subscription_json")
    .eq("user_id", userId);

  if (error) {
    if (!isMissingTable(error)) {
      console.warn("Push subscription fetch warning:", error.message);
    }
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    let subscription = null;

    if (row.subscription_json && typeof row.subscription_json === "object") {
      subscription = row.subscription_json;
    } else if (row.endpoint && row.p256dh_key && row.auth_key) {
      subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh_key,
          auth: row.auth_key
        }
      };
    }

    if (!subscription) continue;
    await sendPush(subscription, payload);
  }
}

module.exports = {
  createInAppNotification
};
