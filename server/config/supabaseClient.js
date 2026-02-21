// ======================================================
// SUPABASE CLIENT
// ======================================================

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function createDisabledQuery(reason) {
  const errorPayload = {
    data: null,
    error: { message: reason }
  };

  const promise = Promise.resolve(errorPayload);
  const fn = () => proxy;
  let proxy = null;

  proxy = new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return (..._args) => proxy;
    },
    apply() {
      return proxy;
    }
  });

  return proxy;
}

function createDisabledClient(reason) {
  return {
    from() {
      return createDisabledQuery(reason);
    },
    rpc() {
      return createDisabledQuery(reason);
    },
    auth: {
      getUser: async () => ({ data: null, error: { message: reason } })
    }
  };
}

let supabase;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase environment variables.");
  console.error("Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  console.error("Fallback supported: SUPABASE_ANON_KEY");
  supabase = createDisabledClient("Supabase is not configured");
} else {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set. Using SUPABASE_ANON_KEY fallback.");
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

// ======================================================
// DATABASE CONNECTION CHECK
// ======================================================
async function checkDatabaseConnection() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn("Skipping database connection check: Supabase env is missing.");
    return;
  }

  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) throw error;

    console.log("Supabase connected successfully");
  } catch (err) {
    console.error("Supabase connection failed:", err.message);
  }
}

module.exports = {
  supabase,
  supabaseAdmin: supabase,
  checkDatabaseConnection
};
