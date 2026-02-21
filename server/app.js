const express = require("express");
const session = require("express-session");
const path = require("path");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const accountsRoutes = require("./routes/accounts.routes");
const transactionsRoutes = require("./routes/transactions.routes");
const transferRoutes = require("./routes/transfer.routes");
const categoriesRoutes = require("./routes/categories.routes");
const navRoutes = require("./routes/nav.routes");
const investRoutes = require("./routes/invest.routes");
const shareRoutes = require("./routes/share.routes");
const sharedRoutes = require("./routes/shared.routes");
const usersRoutes = require("./routes/users.routes");
const accessRoutes = require("./routes/access.routes");

const app = express();
app.set("trust proxy", 1);

/* ---------------- MIDDLEWARE ---------------- */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "mm-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

/* ---------------- STATIC ---------------- */

app.use(express.static(path.join(__dirname, "../client")));

/* ---------------- API ROUTES ---------------- */

app.use("/auth", authRoutes);
app.use("/accounts", accountsRoutes);
app.use("/transactions", transactionsRoutes);
app.use("/transfer", transferRoutes);
app.use("/categories", categoriesRoutes);
app.use("/invest", investRoutes);
app.use("/investments", investRoutes);
app.use("/share", shareRoutes);
app.use("/shared", sharedRoutes);
app.use("/users", usersRoutes);
app.use("/access", accessRoutes);
app.use("/app/nav", navRoutes);

app.use("/auth", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/accounts", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/transactions", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/transfer", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/categories", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/invest", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/investments", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/users", (req, res) => res.status(404).json({ error: "Not found" }));
app.use("/access", (req, res) => res.status(404).json({ error: "Not found" }));

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ---------------- GLOBAL ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error("🔥 SERVER ERROR:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;
