const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabaseClient");
const { PUBLIC_KEY } = require("../services/notification.service");

const DATA_TABLES_DELETE_ORDER = [
  "share_access",
  "user_notification_info",
  "reminders",
  "investments",
  "transfers",
  "transactions",
  "categories",
  "accounts"
];

const OPTIONAL_TABLE_ERROR_CODES = new Set(["42P01", "PGRST205"]);

function requireUser(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function isMissingOptionalTable(error) {
  if (!error) return false;
  if (OPTIONAL_TABLE_ERROR_CODES.has(error.code)) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("could not find the table");
}

async function safeDeleteByUser(table, userId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (error) {
    if (isMissingOptionalTable(error)) {
      return { count: 0, skipped: true };
    }
    throw new Error(`${table}: ${error.message}`);
  }

  return { count: count || 0, skipped: false };
}

async function clearUserData(userId) {
  const deleted = {};
  for (const table of DATA_TABLES_DELETE_ORDER) {
    const result = await safeDeleteByUser(table, userId);
    deleted[table] = result.count;
  }
  return deleted;
}

function extractImportData(payload) {
  if (!payload || typeof payload !== "object") {
    return { accounts: [], categories: [], transactions: [], transfers: [], investments: [] };
  }

  const source =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? payload.data
      : payload;

  return {
    accounts: Array.isArray(source.accounts) ? source.accounts : [],
    categories: Array.isArray(source.categories) ? source.categories : [],
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    transfers: Array.isArray(source.transfers) ? source.transfers : [],
    investments: Array.isArray(source.investments) ? source.investments : []
  };
}

function normalizePushSubscription(raw) {
  if (!raw || typeof raw !== "object") return null;

  const endpoint = String(raw.endpoint || "").trim();
  const keys = raw.keys && typeof raw.keys === "object" ? raw.keys : {};
  const p256dh = String(keys.p256dh || "").trim();
  const auth = String(keys.auth || "").trim();

  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    p256dh_key: p256dh,
    auth_key: auth,
    subscription_json: {
      endpoint,
      keys: { p256dh, auth }
    }
  };
}

function cleanRows(rows, allowedKeys, userId) {
  const seenIds = new Set();

  return rows
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const out = {};
      for (const k of allowedKeys) {
        if (x[k] !== undefined && x[k] !== null) out[k] = x[k];
      }
      out.user_id = userId;
      if (!out.id) delete out.id;
      return out;
    })
    .filter((row) => {
      if (!row.id) return true;
      const id = String(row.id);
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
}

async function safeInsertRows(table, rows, options = {}) {
  if (!rows.length) return { inserted: 0, skippedMissingTable: false };

  const { error } = await supabaseAdmin.from(table).insert(rows);
  if (error) {
    if (isMissingOptionalTable(error)) {
      return { inserted: 0, skippedMissingTable: true };
    }
    throw new Error(`${table}: ${error.message}`);
  }

  return { inserted: rows.length, skippedMissingTable: false };
}

router.get("/profile", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      id: data.id,
      name: data.name,
      email: data.email,
      plan: "Member",
      phone: "",
      currency: "INR"
    });
  } catch (err) {
    console.error("Users profile fetch error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
});

router.put("/profile", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, email } = req.body || {};

    const updates = {};
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
    }
    if (typeof email === "string" && email.trim()) {
      updates.email = email.trim().toLowerCase();
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select("id, name, email")
      .single();

    if (error || !data) {
      return res.status(500).json({ error: "Failed to update profile" });
    }

    req.session.user.name = data.name;
    req.session.user.email = data.email;

    return res.json({
      id: data.id,
      name: data.name,
      email: data.email,
      plan: "Member",
      phone: "",
      currency: "INR"
    });
  } catch (err) {
    console.error("Users profile update error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

router.get("/stats", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [accountsRes, categoriesRes, txRes] = await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabaseAdmin
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabaseAdmin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
    ]);

    return res.json({
      accounts: accountsRes.count || 0,
      categories: categoriesRes.count || 0,
      transactions: txRes.count || 0
    });
  } catch (err) {
    console.error("Users stats error:", err);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

router.put("/password", requireUser, async (req, res) => {
  try {
    if (req.session?.shared_access) {
      return res.status(403).json({ error: "Password change is blocked in shared access mode" });
    }

    const userId = req.session.user.id;
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password || String(new_password).length < 6) {
      return res.status(400).json({ error: "Invalid password payload" });
    }

    const { data: row, error: getErr } = await supabaseAdmin
      .from("users")
      .select("id, password")
      .eq("id", userId)
      .single();

    if (getErr || !row) {
      return res.status(404).json({ error: "User not found" });
    }

    if (String(row.password) !== String(current_password)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ password: String(new_password) })
      .eq("id", userId);

    if (updErr) {
      return res.status(500).json({ error: "Failed to update password" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Users password update error:", err);
    return res.status(500).json({ error: "Failed to update password" });
  }
});

router.get("/export", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;

    async function safeTableExport(table) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*")
        .eq("user_id", userId);
      if (error) {
        console.warn(`Export warning (${table}):`, error.message);
        return [];
      }
      return data || [];
    }

    const [accounts, categories, transactions, transfers, investments] = await Promise.all([
      safeTableExport("accounts"),
      safeTableExport("categories"),
      safeTableExport("transactions"),
      safeTableExport("transfers"),
      safeTableExport("investments")
    ]);

    const summary = {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      transfers: transfers.length,
      investments: investments.length
    };

    return res.json({
      meta: {
        format: "money-manager-export",
        version: 2,
        exported_at: new Date().toISOString(),
        user: {
          id: req.session.user.id,
          name: req.session.user.name || "",
          email: req.session.user.email || ""
        }
      },
      summary,
      data: {
        accounts,
        categories,
        transactions,
        transfers,
        investments
      }
    });
  } catch (err) {
    console.error("Users export error:", err);
    return res.status(500).json({ error: "Failed to export data" });
  }
});

router.post("/import", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const payload = req.body || {};
    const { accounts, categories, transactions, transfers, investments } = extractImportData(payload);

    if (![accounts, categories, transactions, transfers, investments].some((x) => x.length)) {
      return res.status(400).json({ error: "Import file has no data sections" });
    }

    const accountsRows = cleanRows(accounts, [
      "id", "name", "type", "balance", "credit_limit", "loan_principal",
      "interest_rate", "emi_amount", "due_date", "is_active", "created_at"
    ], userId);
    const categoriesRows = cleanRows(categories, [
      "id", "name", "type", "icon", "is_default", "created_at"
    ], userId);
    const transactionsRowsRaw = cleanRows(transactions, [
      "id", "account_id", "category_id", "type", "amount", "note",
      "reference_id", "created_at"
    ], userId);
    const transfersRowsRaw = cleanRows(transfers, [
      "id", "from_account_id", "to_account_id", "amount", "transfer_date", "created_at"
    ], userId);
    const investmentsRowsRaw = cleanRows(investments, [
      "id", "account_id", "investment_type", "amount", "expected_return", "note", "created_at"
    ], userId);

    const accountIds = new Set(accountsRows.filter((x) => x.id).map((x) => String(x.id)));
    const categoryIds = new Set(categoriesRows.filter((x) => x.id).map((x) => String(x.id)));

    const skipped = {
      transactions_invalid_refs: 0,
      transfers_invalid_refs: 0,
      investments_invalid_refs: 0
    };

    const transactionsRows = transactionsRowsRaw.filter((row) => {
      if (!row.account_id || !row.category_id) {
        skipped.transactions_invalid_refs += 1;
        return false;
      }
      const okAccount = accountIds.size === 0 || accountIds.has(String(row.account_id));
      const okCategory = categoryIds.size === 0 || categoryIds.has(String(row.category_id));
      if (!okAccount || !okCategory) {
        skipped.transactions_invalid_refs += 1;
        return false;
      }
      return true;
    });

    const transfersRows = transfersRowsRaw.filter((row) => {
      if (!row.from_account_id || !row.to_account_id) {
        skipped.transfers_invalid_refs += 1;
        return false;
      }
      const okFrom = accountIds.size === 0 || accountIds.has(String(row.from_account_id));
      const okTo = accountIds.size === 0 || accountIds.has(String(row.to_account_id));
      if (!okFrom || !okTo) {
        skipped.transfers_invalid_refs += 1;
        return false;
      }
      return true;
    });

    const investmentsRows = investmentsRowsRaw.filter((row) => {
      if (!row.account_id) {
        skipped.investments_invalid_refs += 1;
        return false;
      }
      const okAccount = accountIds.size === 0 || accountIds.has(String(row.account_id));
      if (!okAccount) {
        skipped.investments_invalid_refs += 1;
        return false;
      }
      return true;
    });

    const deletedBeforeImport = await clearUserData(userId);

    const accountsResult = await safeInsertRows("accounts", accountsRows);
    const categoriesResult = await safeInsertRows("categories", categoriesRows);
    const transactionsResult = await safeInsertRows("transactions", transactionsRows);
    const transfersResult = await safeInsertRows("transfers", transfersRows);
    const investmentsResult = await safeInsertRows("investments", investmentsRows);

    return res.json({
      success: true,
      mode: "replace",
      deleted_before_import: deletedBeforeImport,
      imported: {
        accounts: accountsResult.inserted,
        categories: categoriesResult.inserted,
        transactions: transactionsResult.inserted,
        transfers: transfersResult.inserted,
        investments: investmentsResult.inserted
      },
      skipped,
      warnings: {
        missing_optional_tables: [
          accountsResult.skippedMissingTable ? "accounts" : null,
          categoriesResult.skippedMissingTable ? "categories" : null,
          transactionsResult.skippedMissingTable ? "transactions" : null,
          transfersResult.skippedMissingTable ? "transfers" : null,
          investmentsResult.skippedMissingTable ? "investments" : null
        ].filter(Boolean)
      }
    });
  } catch (err) {
    console.error("Users import error:", err);
    return res.status(500).json({ error: "Failed to import data", details: err.message });
  }
});

router.post("/clear-data", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const deleted = await clearUserData(userId);

    return res.json({ success: true, deleted });
  } catch (err) {
    console.error("Users clear-data error:", err);
    return res.status(500).json({ error: "Failed to clear data", details: err.message });
  }
});

router.get("/notifications", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 30)));

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, type, title, message, icon, meta, is_read, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingOptionalTable(error)) {
        return res.json([]);
      }
      return res.status(500).json({ error: "Failed to load notifications", details: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error("Users notifications fetch error:", err);
    return res.status(500).json({ error: "Failed to load notifications", details: err.message });
  }
});

router.get("/notifications/public-key", requireUser, async (req, res) => {
  return res.json({ publicKey: PUBLIC_KEY || "" });
});

router.post("/notifications/key", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const subscription = normalizePushSubscription(req.body?.subscription);

    if (!subscription) {
      return res.status(400).json({ error: "Invalid push subscription" });
    }

    const row = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh_key: subscription.p256dh_key,
      auth_key: subscription.auth_key,
      subscription_json: subscription.subscription_json,
      updated_at: new Date().toISOString()
    };

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("user_notification_info")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (findErr) {
      if (isMissingOptionalTable(findErr)) {
        return res.status(500).json({ error: "Missing table user_notification_info. Apply migration first." });
      }
      return res.status(500).json({ error: "Failed to save push key", details: findErr.message });
    }

    const query = existing?.id
      ? supabaseAdmin.from("user_notification_info").update(row).eq("id", existing.id)
      : supabaseAdmin.from("user_notification_info").insert(row);

    const { error } = await query;
    if (error) {
      if (isMissingOptionalTable(error)) {
        return res.status(500).json({ error: "Missing table user_notification_info. Apply migration first." });
      }
      return res.status(500).json({ error: "Failed to save push key", details: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Users notifications key save error:", err);
    return res.status(500).json({ error: "Failed to save push key", details: err.message });
  }
});

router.delete("/notifications/key", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const endpoint = String(req.body?.endpoint || "").trim();

    let query = supabaseAdmin.from("user_notification_info").delete().eq("user_id", userId);
    if (endpoint) query = query.eq("endpoint", endpoint);

    const { error } = await query;
    if (error) {
      if (isMissingOptionalTable(error)) {
        return res.json({ success: true, skipped: true });
      }
      return res.status(500).json({ error: "Failed to delete push key", details: error.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Users notifications key delete error:", err);
    return res.status(500).json({ error: "Failed to delete push key", details: err.message });
  }
});

router.post("/notifications/clear", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const notificationsResult = await safeDeleteByUser("notifications", userId);
    const remindersResult = await safeDeleteByUser("reminders", userId);
    return res.json({
      success: true,
      deleted: (notificationsResult.count || 0) + (remindersResult.count || 0),
      deleted_breakdown: {
        notifications: notificationsResult.count || 0,
        reminders: remindersResult.count || 0
      }
    });
  } catch (err) {
    console.error("Users notifications clear error:", err);
    return res.status(500).json({ error: "Failed to clear notifications", details: err.message });
  }
});

module.exports = router;
