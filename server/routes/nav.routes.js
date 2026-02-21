// ======================================================================
// SECURE NAVIGATION ROUTES
// ======================================================================

const express = require("express");
const router = express.Router();

// middleware (simple guard for now)
function authGuard(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/login/login.html");

  }
  next();
}

// helper
function go(pagePath) {
  return (req, res) => {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    res.redirect(`/${pagePath}${query}`);
  };
}

// routes
router.get("/dashboard", authGuard, go("dashboard/dashboard.html"));
router.get("/accounts", authGuard, go("accounts/accounts.html"));
router.get("/transactions", authGuard, go("transactions/transactions.html"));
router.get("/categories", authGuard, go("categories/categories.html"));
router.get("/settings", authGuard, go("settings/settings.html"));
router.get("/income", authGuard, go("income/income.html"));
router.get("/expense", authGuard, go("Expenses/expenses.html"));
router.get("/transfer", authGuard, go("transfer/transfer.html"));
router.get("/account-detail", authGuard, go("accounts/accounts-details/accounts-details.html"));

module.exports = router;
