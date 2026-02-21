// ======================================================
// MONEY MANAGER SERVICE WORKER
// ======================================================

const CACHE_NAME = "mm-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// ------------------------------------------------------
// PUSH RECEIVED
// ------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {
    title: "Money Manager",
    body: "New update available"
  };

  try {
    if (event.data) data = event.data.json();
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png"
    })
  );
});
