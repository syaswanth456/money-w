const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../config/supabaseClient");
const {
  emitTransactionsUpdate,
  emitDashboardUpdate,
  emitAccountsUpdate
} = require("../sockets/realtime.socket");
const { createInAppNotification } = require("../services/inapp-notifications");

function requireUser(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : NaN;
}

function toClientTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function monthWindow(monthParam) {
  if (monthParam) {
    const [yearStr, monthStr] = String(monthParam).split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month || month < 1 || month > 12) {
      return null;
    }
    return {
      startDate: new Date(Date.UTC(year, month - 1, 1)),
      endDate: new Date(Date.UTC(year, month, 1))
    };
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    startDate: new Date(Date.UTC(y, m, 1)),
    endDate: new Date(Date.UTC(y, m + 1, 1))
  };
}

router.get("/recent", async (req, res) => {
  try {
    const userId = req.session?.user?.id;
    if (!userId) {
      return res.json([]);
    }

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("id, type, amount, note, created_at, category_id, account_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Recent transactions error:", error);
      return res.json([]);
    }

    return res.json(data || []);
  } catch (err) {
    console.error("Recent transactions crash:", err);
    return res.json([]);
  }
});

router.get("/summary/monthly", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const range = monthWindow(req.query.month);

    if (!range) {
      return res.status(400).json({ error: "Invalid month format. Use YYYY-MM" });
    }

    const { startDate, endDate } = range;

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("type, amount")
      .eq("user_id", userId)
      .gte("created_at", startDate.toISOString())
      .lt("created_at", endDate.toISOString());

    if (error) {
      throw error;
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let totalBill = 0;

    for (const tx of data || []) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "income") totalIncome += amt;
      if (tx.type === "expense") totalExpense += amt;
      if (tx.type === "bill") totalBill += amt;
    }

    return res.json({
      month: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
      total_income: totalIncome,
      total_expense: totalExpense,
      total_bill: totalBill,
      net_savings: totalIncome - totalExpense - totalBill
    });
  } catch (err) {
    console.error("Monthly summary error:", err);
    return res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/account/:accountId", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const accountId = req.params.accountId;

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ transactions: data || [] });
  } catch (err) {
    console.error("Account transactions error:", err);
    return res.status(500).json({ error: "Failed to load transactions" });
  }
});

router.post("/expense", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { account_id, category_id, amount, note, date } = req.body || {};
    const parsedAmount = toAmount(amount);
    const createdAt = toClientTimestamp(date);

    if (!account_id || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("balance")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accErr || !account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (Number(account.balance) < parsedAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("accounts")
      .update({ balance: Number(account.balance) - parsedAmount })
      .eq("id", account_id)
      .eq("user_id", userId);

    if (updateErr) throw updateErr;

    const { error: txErr } = await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      account_id,
      category_id: category_id || null,
      type: "expense",
      amount: parsedAmount,
      note: note || null,
      ...(createdAt ? { created_at: createdAt } : {})
    });

    if (txErr) throw txErr;

    await createInAppNotification(userId, {
      type: "success",
      title: "Transaction Added",
      message: `Expense of ${parsedAmount.toFixed(2)} was added.`,
      icon: "receipt",
      meta: { account_id, category_id: category_id || null }
    });

    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);
    emitAccountsUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Expense error:", err);
    return res.status(500).json({ error: "Expense failed" });
  }
});

router.post("/income", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { account_id, category_id, amount, note, date } = req.body || {};
    const parsedAmount = toAmount(amount);
    const createdAt = toClientTimestamp(date);

    if (!account_id || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("balance")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accErr || !account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("accounts")
      .update({ balance: Number(account.balance) + parsedAmount })
      .eq("id", account_id)
      .eq("user_id", userId);

    if (updateErr) throw updateErr;

    const { error: txErr } = await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      account_id,
      category_id: category_id || null,
      type: "income",
      amount: parsedAmount,
      note: note || null,
      ...(createdAt ? { created_at: createdAt } : {})
    });

    if (txErr) throw txErr;

    await createInAppNotification(userId, {
      type: "success",
      title: "Transaction Added",
      message: `Income of ${parsedAmount.toFixed(2)} was added.`,
      icon: "receipt",
      meta: { account_id, category_id: category_id || null }
    });

    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);
    emitAccountsUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Income error:", err);
    return res.status(500).json({ error: "Income failed" });
  }
});

router.post("/pay-bill", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { account_id, category_id, amount, note, date } = req.body || {};
    const parsedAmount = toAmount(amount);
    const createdAt = toClientTimestamp(date);

    if (!account_id || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("balance")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accErr || !account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (Number(account.balance) < parsedAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("accounts")
      .update({ balance: Number(account.balance) - parsedAmount })
      .eq("id", account_id)
      .eq("user_id", userId);

    if (updateErr) throw updateErr;

    const { error: txErr } = await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      account_id,
      category_id: category_id || null,
      type: "bill",
      amount: parsedAmount,
      note: note || null,
      ...(createdAt ? { created_at: createdAt } : {})
    });

    if (txErr) throw txErr;

    await createInAppNotification(userId, {
      type: "success",
      title: "Transaction Added",
      message: `Bill payment of ${parsedAmount.toFixed(2)} was added.`,
      icon: "receipt",
      meta: { account_id, category_id: category_id || null }
    });

    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);
    emitAccountsUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Bill payment error:", err);
    return res.status(500).json({ error: "Bill payment failed" });
  }
});

router.put("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const txId = req.params.id;
    const { note, amount, created_at, category_id, account_id } = req.body || {};

    const updates = {};

    if (typeof note === "string") {
      updates.note = note.trim() || null;
    }

    if (amount !== undefined) {
      const parsedAmount = toAmount(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      updates.amount = parsedAmount;
    }

    if (created_at !== undefined) {
      const isoTs = toClientTimestamp(created_at);
      if (!isoTs) {
        return res.status(400).json({ error: "Invalid date/time" });
      }
      updates.created_at = isoTs;
    }

    if (category_id !== undefined) {
      if (!category_id) {
        return res.status(400).json({ error: "Category is required" });
      }
      const { data: categoryRow, error: categoryErr } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("id", category_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (categoryErr || !categoryRow) {
        return res.status(400).json({ error: "Invalid category" });
      }
      updates.category_id = category_id;
    }

    if (account_id !== undefined) {
      if (!account_id) {
        return res.status(400).json({ error: "Account is required" });
      }
      const { data: accountRow, error: accountErr } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .eq("id", account_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (accountErr || !accountRow) {
        return res.status(400).json({ error: "Invalid account" });
      }
      updates.account_id = account_id;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from("transactions")
      .update(updates)
      .eq("id", txId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    await createInAppNotification(userId, {
      type: "info",
      title: "Transaction Updated",
      message: "A transaction was edited.",
      icon: "edit",
      meta: { transaction_id: data.id }
    });

    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);
    emitAccountsUpdate(userId);

    return res.json({ success: true, transaction: data });
  } catch (err) {
    console.error("Transaction update error:", err);
    return res.status(500).json({ error: "Failed to update transaction" });
  }
});

router.delete("/:id", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const txId = req.params.id;

    const { data: tx, error: txFetchErr } = await supabaseAdmin
      .from("transactions")
      .select("id, type, amount, account_id, note")
      .eq("id", txId)
      .eq("user_id", userId)
      .single();

    if (txFetchErr || !tx) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const amount = Number(tx.amount || 0);
    const type = String(tx.type || "").toLowerCase();
    const accountId = tx.account_id;

    if (accountId) {
      const { data: account, error: accErr } = await supabaseAdmin
        .from("accounts")
        .select("balance")
        .eq("id", accountId)
        .eq("user_id", userId)
        .single();

      if (!accErr && account) {
        let nextBalance = Number(account.balance || 0);
        if (type === "income") nextBalance -= amount;
        else nextBalance += amount;

        await supabaseAdmin
          .from("accounts")
          .update({ balance: nextBalance })
          .eq("id", accountId)
          .eq("user_id", userId);
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from("transactions")
      .delete()
      .eq("id", txId)
      .eq("user_id", userId);

    if (delErr) {
      return res.status(500).json({ error: "Failed to delete transaction" });
    }

    await createInAppNotification(userId, {
      type: "warning",
      title: "Transaction Deleted",
      message: tx.note ? `${tx.note} transaction was deleted.` : "A transaction was deleted.",
      icon: "trash",
      meta: { transaction_id: txId, account_id: accountId || null }
    });

    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);
    emitAccountsUpdate(userId);

    return res.json({ success: true });
  } catch (err) {
    console.error("Transaction delete error:", err);
    return res.status(500).json({ error: "Failed to delete transaction" });
  }
});

module.exports = router;
