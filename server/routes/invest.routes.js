const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabaseClient");
const {
  emitAccountsUpdate,
  emitTransactionsUpdate,
  emitDashboardUpdate
} = require("../sockets/realtime.socket");

const INVEST_TYPES = [
  { id: "stocks", name: "Stocks", icon: "chart-line" },
  { id: "mutual_funds", name: "Mutual Funds", icon: "chart-pie" },
  { id: "gold", name: "Gold", icon: "coins" },
  { id: "crypto", name: "Crypto", icon: "bitcoin-sign" },
  { id: "fd", name: "Fixed Deposit", icon: "building-columns" }
];

function requireUser(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function toClientTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

router.get("/types", requireUser, (req, res) => {
  return res.json({ types: INVEST_TYPES });
});

router.post("/", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const {
      amount,
      type_id,
      account_id,
      name,
      note,
      date
    } = req.body || {};
    const createdAt = toClientTimestamp(date);

    const parsedAmount = Number(amount);
    if (!account_id || !type_id || !name || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Missing or invalid fields" });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from("accounts")
      .select("id, balance")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accErr || !account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (Number(account.balance) < parsedAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const nextBalance = Number(account.balance) - parsedAmount;
    const { error: balErr } = await supabaseAdmin
      .from("accounts")
      .update({ balance: nextBalance })
      .eq("id", account_id)
      .eq("user_id", userId);

    if (balErr) throw balErr;

    const { data: invRow, error: invErr } = await supabaseAdmin
      .from("investments")
      .insert({
        user_id: userId,
        account_id,
        investment_type: String(type_id),
        amount: parsedAmount,
        note: note || name,
        ...(createdAt ? { created_at: createdAt } : {})
      })
      .select("*")
      .single();

    if (invErr) throw invErr;

    const { error: txErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        account_id,
        type: "investment",
        amount: parsedAmount,
        note: `Investment: ${name}`,
        reference_id: invRow.id,
        ...(createdAt ? { created_at: createdAt } : {})
      });

    if (txErr) throw txErr;

    emitAccountsUpdate(userId);
    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);

    return res.status(201).json({ success: true, investment: invRow });
  } catch (err) {
    console.error("Investment create error:", err);
    return res.status(500).json({ error: "Failed to create investment" });
  }
});

module.exports = router;
