// ======================================================================
// REALTIME SOCKET ENGINE
// Broadcasts live financial updates
// ======================================================================

let ioInstance = null;

function initRealtime(server) {
  const { Server } = require("socket.io");

  ioInstance = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  ioInstance.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  return ioInstance;
}

// ----------------------------------------------------------------------
// SAFE EMITTERS
// ----------------------------------------------------------------------

function emitAccountsUpdate(userId) {
  ioInstance?.emit("accounts:updated", { userId });
}

function emitTransactionsUpdate(userId) {
  ioInstance?.emit("transactions:updated", { userId });
}

function emitDashboardUpdate(userId) {
  ioInstance?.emit("dashboard:updated", { userId });
}

function emitCategoriesUpdate(userId) {
  ioInstance?.emit("categories:updated", { userId });
}

function emitAccessRequest(payload) {
  ioInstance?.emit("access:request", payload);
}

function emitAccessCode(payload) {
  ioInstance?.emit("access:code", payload);
}

module.exports = {
  initRealtime,
  emitAccountsUpdate,
  emitTransactionsUpdate,
  emitDashboardUpdate,
  emitCategoriesUpdate,
  emitAccessRequest,
  emitAccessCode
};
