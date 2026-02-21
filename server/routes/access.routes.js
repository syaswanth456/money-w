const express = require("express");
const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { emitAccessRequest, emitAccessCode } = require("../sockets/realtime.socket");

const router = express.Router();

const ACCESS_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const requests = new Map();

function now() {
  return Date.now();
}

function createCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function requireOwner(req, res, next) {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

function cleanupExpired() {
  const t = now();
  for (const [id, req] of requests.entries()) {
    if (req.expiresAt <= t) requests.delete(id);
  }
}

router.post("/request", async (req, res) => {
  try {
    cleanupExpired();
    const { owner_id, account_id, device_info } = req.body || {};

    if (!owner_id) {
      return res.status(400).json({ error: "Missing owner id" });
    }

    const { data: owner, error: ownerErr } = await supabaseAdmin
      .from("users")
      .select("id, name")
      .eq("id", owner_id)
      .single();

    if (ownerErr || !owner) {
      return res.status(404).json({ error: "Owner not found" });
    }

    let accountName = "Profile Access";
    if (account_id) {
      const { data: account, error: accountErr } = await supabaseAdmin
        .from("accounts")
        .select("id, user_id, name")
        .eq("id", account_id)
        .eq("user_id", owner_id)
        .single();
      if (!accountErr && account) {
        accountName = account.name || accountName;
      }
    }

    const requestId = crypto.randomUUID();
    const code = createCode();
    const expiresAt = now() + ACCESS_TTL_MS;

    requests.set(requestId, {
      requestId,
      ownerId: owner_id,
      accountId: account_id,
      code: null,
      approved: false,
      attempts: 0,
      createdAt: now(),
      expiresAt,
      deviceInfo: String(device_info || "")
    });

    emitAccessRequest({
      owner_id,
      request_id: requestId,
      account_id,
      account_name: accountName,
      expires_at: new Date(expiresAt).toISOString()
    });

    return res.json({
      success: true,
      request_id: requestId,
      expires_at: new Date(expiresAt).toISOString()
    });
  } catch (err) {
    console.error("Access request error:", err);
    return res.status(500).json({ error: "Failed to create access request" });
  }
});

router.post("/approve", requireOwner, async (req, res) => {
  try {
    cleanupExpired();
    const ownerId = req.session.user.id;
    const { request_id, approve } = req.body || {};

    if (!request_id) return res.status(400).json({ error: "Missing request id" });

    const record = requests.get(String(request_id));
    if (!record) return res.status(404).json({ error: "Request not found or expired" });
    if (String(record.ownerId) !== String(ownerId)) {
      return res.status(403).json({ error: "Not allowed for this request" });
    }

    if (approve === false) {
      requests.delete(String(request_id));
      return res.json({ success: true, approved: false });
    }

    record.approved = true;
    record.code = createCode();

    emitAccessCode({
      owner_id: ownerId,
      request_id: String(request_id),
      code: record.code,
      expires_at: new Date(record.expiresAt).toISOString()
    });

    return res.json({
      success: true,
      approved: true,
      code: record.code,
      expires_at: new Date(record.expiresAt).toISOString()
    });
  } catch (err) {
    console.error("Access approve error:", err);
    return res.status(500).json({ error: "Failed to approve request" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    cleanupExpired();
    const { request_id, code } = req.body || {};

    if (!request_id || !code) {
      return res.status(400).json({ error: "Missing request id or code" });
    }

    const record = requests.get(String(request_id));
    if (!record) {
      return res.status(400).json({ error: "Request not found or expired" });
    }

    if (record.expiresAt <= now()) {
      requests.delete(String(request_id));
      return res.status(400).json({ error: "Request expired" });
    }

    if (!record.approved || !record.code) {
      return res.status(400).json({ error: "Owner approval pending" });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      requests.delete(String(request_id));
      return res.status(400).json({ error: "Maximum attempts exceeded" });
    }

    if (String(code).trim() !== String(record.code)) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        requests.delete(String(request_id));
        return res.status(400).json({ error: "Maximum attempts exceeded" });
      }
      return res.status(400).json({
        error: `Invalid code (${MAX_ATTEMPTS - record.attempts} attempts left)`
      });
    }

    const { data: owner, error: ownerErr } = await supabaseAdmin
      .from("users")
      .select("id, name, email")
      .eq("id", record.ownerId)
      .single();

    if (ownerErr || !owner) {
      return res.status(404).json({ error: "Owner user not found" });
    }

    req.session.user = {
      id: owner.id,
      name: owner.name,
      email: owner.email
    };
    req.session.shared_access = true;
    requests.delete(String(request_id));

    return res.json({
      success: true,
      redirect: "/app/nav/dashboard"
    });
  } catch (err) {
    console.error("Access verify error:", err);
    return res.status(500).json({ error: "Failed to verify access code" });
  }
});

module.exports = router;
