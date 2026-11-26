const CACHE_NAME = "synapsesonic-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conceptIndex =
    event.notification?.data &&
    typeof event.notification.data.conceptIndex === "number"
      ? event.notification.data.conceptIndex
      : 0;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/workspace") && "focus" in client) {
            client.postMessage({
              type: "SYNAPSE_REVIEW_CONCEPT",
              conceptIndex,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/workspace");
        }
        return undefined;
      })
  );
});
