const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabaseClient");

router.get("/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ user: null });
  }

  return res.json({ user: req.session.user });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    if (!normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (error && error.code !== "PGRST116") {
      const rawMessage = String(error.message || error);
      const hintPattern = /invalid api key|api key|jwt|permission|row-level security|not configured/i;
      const userMessage = hintPattern.test(rawMessage)
        ? "Auth backend misconfigured. Check SUPABASE_SERVICE_ROLE_KEY."
        : "Auth service unavailable";
      console.error("Login query failed:", rawMessage);
      return res.status(500).json({ error: userMessage });
    }

    if (!data) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (String(data.password || "") !== normalizedPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.user = {
      id: data.id,
      name: data.name,
      email: data.email
    };

    return res.json({ success: true });
  } catch (err) {
    console.error("Login crash:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    const normalizedName = String(name || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const { data, error } = await supabase
      .from("users")
      .insert([{ name: normalizedName, email: normalizedEmail, password: normalizedPassword }])
      .select("*")
      .single();

    if (error || !data) {
      return res.status(500).json({ error: error?.message || "Signup failed" });
    }

    await supabase.from("categories").insert([
      { user_id: data.id, name: "General Expense", type: "expense", icon: "receipt" },
      { user_id: data.id, name: "General Income", type: "income", icon: "money-bill-wave" },
      { user_id: data.id, name: "General Bill", type: "bill", icon: "file-invoice-dollar" }
    ]);

    req.session.user = {
      id: data.id,
      name: data.name,
      email: data.email
    };

    return res.json({ success: true });
  } catch (err) {
    console.error("Signup crash:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

module.exports = router;
