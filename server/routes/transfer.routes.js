// ======================================================================
// TRANSFER ROUTES — ATOMIC FINTECH ENGINE
// Secure • Double-entry • Realtime-ready
// ======================================================================

const express = require("express");
const router = express.Router();

const { supabaseAdmin } = require("../config/supabaseClient");
const { createInAppNotification } = require("../services/inapp-notifications");
const {
  emitAccountsUpdate,
  emitTransactionsUpdate,
  emitDashboardUpdate
} = require("../sockets/realtime.socket");

// ----------------------------------------------------------------------
// AUTH GUARD
// ----------------------------------------------------------------------
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

// ======================================================================
// POST /transfer
// ======================================================================
router.post("/", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const {
      from_account_id,
      to_account_id,
      amount,
      note,
      date
    } = req.body;
    const createdAt = toClientTimestamp(date);

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------
    if (!from_account_id || !amount) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        error: "Invalid amount"
      });
    }

    // self-transfer guard
    if (to_account_id && from_account_id === to_account_id) {
      return res.status(400).json({
        error: "Cannot transfer to same account"
      });
    }

    // --------------------------------------------------
    // LOAD SOURCE ACCOUNT
    // --------------------------------------------------
    const { data: fromAccount, error: fromErr } =
      await supabaseAdmin
        .from("accounts")
        .select("*")
        .eq("id", from_account_id)
        .eq("user_id", userId)
        .single();

    if (fromErr || !fromAccount) {
      return res.status(404).json({
        error: "Source account not found"
      });
    }

    if (Number(fromAccount.balance) < Number(amount)) {
      return res.status(400).json({
        error: "Insufficient balance"
      });
    }

    // --------------------------------------------------
    // LOAD DESTINATION (if exists)
    // --------------------------------------------------
    let toAccount = null;

    if (to_account_id) {
      const { data, error } = await supabaseAdmin
        .from("accounts")
        .select("*")
        .eq("id", to_account_id)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: "Destination account not found"
        });
      }

      toAccount = data;
    }

    // ==================================================
    // CALCULATE BALANCES
    // ==================================================
    const newFromBalance =
      Number(fromAccount.balance) - Number(amount);

    const newToBalance = toAccount
      ? Number(toAccount.balance) + Number(amount)
      : null;

    // ==================================================
    // APPLY UPDATES (order matters)
    // ==================================================

    // 🔹 debit source
    await supabaseAdmin
      .from("accounts")
      .update({ balance: newFromBalance })
      .eq("id", from_account_id)
      .eq("user_id", userId);

    // 🔹 credit destination
    if (toAccount) {
      await supabaseAdmin
        .from("accounts")
        .update({ balance: newToBalance })
        .eq("id", to_account_id)
        .eq("user_id", userId);
    }

    // ==================================================
    // RECORD TRANSFER
    // ==================================================
    const { data: transferRow } = await supabaseAdmin
      .from("transfers")
      .insert({
        user_id: userId,
        from_account_id,
        to_account_id,
        amount,
        ...(createdAt ? { transfer_date: createdAt, created_at: createdAt } : {})
      })
      .select()
      .single();

    // ==================================================
    // DOUBLE-ENTRY TRANSACTIONS
    // ==================================================

    // debit entry
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      account_id: from_account_id,
      type: "transfer",
      amount: -Math.abs(Number(amount)),
      note: note || "Transfer out",
      reference_id: transferRow.id,
      ...(createdAt ? { created_at: createdAt } : {})
    });

    // credit entry
    if (toAccount) {
      await supabaseAdmin.from("transactions").insert({
        user_id: userId,
        account_id: to_account_id,
        type: "transfer",
        amount: Math.abs(Number(amount)),
        note: note || "Transfer in",
        reference_id: transferRow.id,
        ...(createdAt ? { created_at: createdAt } : {})
      });
    }

    const amountLabel = Number(amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    await createInAppNotification(userId, {
      type: "transfer",
      title: "Scan & Pay Sent",
      message: `${amountLabel} sent from ${fromAccount.name} to ${toAccount?.name || "another account"}`,
      icon: "exchange-alt",
      meta: {
        transfer_id: transferRow.id,
        from_account_id,
        to_account_id
      }
    });

    if (toAccount) {
      await createInAppNotification(userId, {
        type: "transfer",
        title: "Scan & Pay Received",
        message: `${amountLabel} received in ${toAccount.name} from ${fromAccount.name}`,
        icon: "wallet",
        meta: {
          transfer_id: transferRow.id,
          from_account_id,
          to_account_id
        }
      });
    }

    // ==================================================
    // REALTIME EMIT
    // ==================================================
    emitAccountsUpdate(userId);
    emitTransactionsUpdate(userId);
    emitDashboardUpdate(userId);

    res.json({
      success: true,
      transfer_id: transferRow.id
    });
  } catch (err) {
    console.error("Transfer error:", err.message);
    res.status(500).json({
      error: "Transfer failed"
    });
  }
});

module.exports = router;
