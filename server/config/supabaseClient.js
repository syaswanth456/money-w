// ======================================================
// SUPABASE CLIENT (CLEAN VERSION)
// ======================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  {
    auth: { persistSession: false }
  }
);

// ======================================================
// DATABASE CONNECTION CHECK
// ======================================================
async function checkDatabaseConnection() {
  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) throw error;

    console.log("✅ Supabase connected successfully");
  } catch (err) {
    console.error("❌ Supabase connection failed:", err.message);
  }
}

module.exports = {
  supabase,
  supabaseAdmin: supabase,
  checkDatabaseConnection
};
