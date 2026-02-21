// ======================================================
// MONEY MANAGER — SERVER ENTRY (PRODUCTION READY)
// ======================================================

require("dotenv").config();

const http = require("http");
const os = require("os");
const app = require("./app");

// 🔥 database check
const { checkDatabaseConnection } = require("./config/supabaseClient");

// 🔥 realtime socket
const { initRealtime } = require("./sockets/realtime.socket");

const PORT = process.env.PORT || 3000;

// ======================================================
// CREATE HTTP SERVER
// ======================================================
const server = http.createServer(app);

// ======================================================
// INIT WEBSOCKET
// ======================================================
try {
  initRealtime(server);
  console.log("🔌 WebSocket initialized");
} catch (err) {
  console.warn("⚠️ WebSocket init failed:", err.message);
}

// ======================================================
// GET LOCAL IP (for mobile testing)
// ======================================================
function getLocalIP() {
  const nets = os.networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

// ======================================================
// START SERVER
// ======================================================
server.listen(PORT, async () => {
  const ip = getLocalIP();

  console.log("\n=======================================");
  console.log("🚀 Money Manager Server Started");
  console.log(`🌍 Environment : ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 Port        : ${PORT}`);
  console.log("---------------------------------------");
  console.log(`👉 Local URL   : http://localhost:${PORT}`);
  console.log(`📱 Mobile URL  : http://${ip}:${PORT}`);
  console.log("=======================================\n");

  // ====================================================
  // 🔥 CHECK DATABASE CONNECTION
  // ====================================================
  await checkDatabaseConnection();
});
