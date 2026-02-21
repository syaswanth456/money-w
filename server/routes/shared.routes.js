// ======================================================================
// SHARED DASHBOARD ROUTES (READ-ONLY)
// Used by QR temporary access
// ======================================================================

const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabaseClient");

// ----------------------------------------------------------------------
// SHARED ACCESS GUARD
// ----------------------------------------------------------------------
function requireSharedAccess(req, res, next) {
  if (!req.session?.shared_user_id) {
    return res.status(401).json({
      error: "Shared access not available"
    });
  }
  next();
}

// helper
function getSharedUserId(req) {
  return req.session.shared_user_id;
}

// ======================================================================
// SHARED ACCOUNT SUMMARY
// GET /shared/summary
// ======================================================================
router.get("/summary", requireSharedAccess, async (req, res) => {
  try {
    const userId = getSharedUserId(req);

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select(
        "type, balance, credit_limit, is_active"
      )
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) throw error;

    let netBalance = 0;
    let liquidBalance = 0;
    let creditUsed = 0;

    for (const acc of data || []) {
      const bal = Number(acc.balance) || 0;

      netBalance += bal;

      if (
        acc.type === "bank" ||
        acc.type === "wallet" ||
        acc.type === "cash"
      ) {
        liquidBalance += bal;
      }

      if (acc.type === "credit") {
        const limit = Number(acc.credit_limit) || 0;
        creditUsed += Math.max(0, limit - bal);
      }
    }

    res.json({
      net_balance: netBalance,
      liquid_balance: liquidBalance,
      credit_used: creditUsed,
      active_accounts: data?.length || 0,
      mode: "shared"
    });
  } catch (err) {
    console.error("Shared summary error:", err.message);
    res.status(500).json({
      error: "Failed to load shared summary"
    });
  }
});

// ======================================================================
// SHARED ACCOUNTS LIST
// GET /shared/accounts
// ======================================================================
router.get("/accounts", requireSharedAccess, async (req, res) => {
  try {
    const userId = getSharedUserId(req);

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select("id, name, type, balance")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      accounts: data || [],
      mode: "shared"
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to load shared accounts"
    });
  }
});

// ======================================================================
// SHARED RECENT TRANSACTIONS
// GET /shared/transactions
// ======================================================================
router.get(
  "/transactions",
  requireSharedAccess,
  async (req, res) => {
    try {
      const userId = getSharedUserId(req);

      const { data, error } = await supabaseAdmin
        .from("transactions")
        .select(
          "id, type, amount, note, created_at, account_id"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      res.json({
        transactions: data || [],
        mode: "shared"
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to load shared transactions"
      });
    }
  }
);

module.exports = router;
