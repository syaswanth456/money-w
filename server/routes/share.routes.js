// ======================================================================
// SHARE ACCESS ROUTES — QR TEMP ACCESS (5 HOURS)
// Secure • Expiring • Fintech-safe
// ======================================================================

const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const { supabaseAdmin } = require("../config/supabaseClient");

// ----------------------------------------------------------------------
// AUTH GUARD
// ----------------------------------------------------------------------
function requireUser(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ======================================================================
// GENERATE SHARE CODE
// POST /share/generate
// ======================================================================
router.post("/generate", requireUser, async (req, res) => {
  try {
    const userId = req.session.user.id;

    // 🔹 create secure random code
    const shareCode = crypto.randomBytes(16).toString("hex");

    // 🔹 expiry = 5 hours
    const expiresAt = new Date(Date.now() + 5 * 60 * 60 * 1000);

    const { error } = await supabaseAdmin
      .from("share_access")
      .insert({
        user_id: userId,
        share_code: shareCode,
        expires_at: expiresAt.toISOString(),
        is_active: true
      });
    if (error) {
      console.warn("Share generate persist warning:", error.message);
    }

    // 🔹 build access URL
    const baseUrl =
      process.env.APP_BASE_URL || "http://localhost:3000";

    const shareUrl = `${baseUrl}/share/${shareCode}`;

    res.json({
      success: true,
      persisted: !error,
      share_code: shareCode,
      expires_at: expiresAt,
      share_url: shareUrl
    });
  } catch (err) {
    console.error("Share generate error:", err.message);
    res.status(500).json({
      error: "Failed to generate share link"
    });
  }
});

// ======================================================================
// VALIDATE SHARE CODE
// GET /share/:code
// ======================================================================
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabaseAdmin
      .from("share_access")
      .select("*")
      .eq("share_code", code)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return res.status(404).send("Invalid or expired link");
    }

    // 🔹 expiry check
    if (new Date(data.expires_at) < new Date()) {
      return res.status(410).send("Share link expired");
    }

    // --------------------------------------------------
    // TEMP ACCESS SESSION
    // --------------------------------------------------
    req.session.shared_user_id = data.user_id;

    // redirect to shared dashboard
    return res.redirect("/shared/dashboard.html");
  } catch (err) {
    console.error("Share validate error:", err.message);
    res.status(500).send("Share validation failed");
  }
});

module.exports = router;
