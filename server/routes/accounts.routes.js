const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabaseClient");
const { createInAppNotification } = require("../services/inapp-notifications");
const { emitAccountsUpdate, emitDashboardUpdate, emitTransactionsUpdate } = require("../sockets/realtime.socket");

/* ---------------- GET USER ACCOUNTS ---------------- */

router.get("/", async (req, res) => {
  try {
    const userId = req.session?.user?.id;

    // ✅ never crash
    if (!userId) {
      return res.json({ accounts: [] });
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Accounts fetch error:", error);
      return res.json({ accounts: [] });
    }

    return res.json({ accounts: data || [] });
  } catch (err) {
    console.error("Accounts route crash:", err);
    return res.json({ accounts: [] });
  }
});

/* ---------------- CREATE USER ACCOUNT ---------------- */

router.post("/", async (req, res) => {
  try {
    const userId = req.session?.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { name, type, balance = 0 } = req.body || {};

    if (!name || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payload = {
      user_id: userId,
      name: String(name).trim(),
      type: String(type).trim().toLowerCase(),
      balance: Number(balance) || 0
    };

    const { data, error } = await supabase
      .from("accounts")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("Account create error:", error);
      return res.status(500).json({ error: "Failed to create account" });
    }

    await createInAppNotification(userId, {
      type: "success",
      title: "Account Created",
      message: `${payload.name} account was created successfully.`,
      icon: "wallet",
      meta: { account_id: data?.id || null }
    });
    emitAccountsUpdate(userId);
    emitDashboardUpdate(userId);

    return res.status(201).json({ account: data });
  } catch (err) {
    console.error("Accounts create crash:", err);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

/* ---------------- GET ACCOUNT BY ID ---------------- */

router.get("/:id", async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const accountId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Account not found" });
    }

    await createInAppNotification(userId, {
      type: "info",
      title: "Account Updated",
      message: `${data.name || "Account"} was updated.`,
      icon: "wallet",
      meta: { account_id: data.id }
    });
    emitAccountsUpdate(userId);
    emitDashboardUpdate(userId);

    return res.json({ account: data });
  } catch (err) {
    console.error("Account detail crash:", err);
    return res.status(500).json({ error: "Failed to load account" });
  }
});

/* ---------------- UPDATE ACCOUNT ---------------- */

router.put("/:id", async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const accountId = req.params.id;
    const { name, balance, credit_limit } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (balance !== undefined) updates.balance = Number(balance) || 0;
    if (credit_limit !== undefined) updates.credit_limit = Number(credit_limit) || 0;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updates)
      .eq("id", accountId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Account not found" });
    }

    return res.json({ account: data });
  } catch (err) {
    console.error("Account update crash:", err);
    return res.status(500).json({ error: "Failed to update account" });
  }
});

/* ---------------- DELETE ACCOUNT ---------------- */

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    const accountId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: existing, error: getErr } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single();

    if (getErr || !existing) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { error: txDeleteErr } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .eq("account_id", accountId);

    if (txDeleteErr) {
      console.error("Account transactions delete error:", txDeleteErr);
      return res.status(500).json({ error: "Failed to delete account transactions" });
    }

    const { error: delErr } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", userId);

    if (delErr) {
      console.error("Account delete error:", delErr);
      return res.status(500).json({ error: "Failed to delete account" });
    }

    await createInAppNotification(userId, {
      type: "warning",
      title: "Account Deleted",
      message: `${existing.name || "Account"} and its transactions were deleted.`,
      icon: "trash",
      meta: { account_id: accountId }
    });

    emitAccountsUpdate(userId);
    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Account delete crash:", err);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
