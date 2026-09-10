// Beyonder AI — service worker
// Only caches the static "app shell" (HTML/CSS/JS/icons) so the installed
// app opens instantly and works offline for the UI itself. Anything that
// looks like an API call (login, chat, admin messages, etc.) always goes
// straight to the network — we never want to serve stale chat/auth data.

const CACHE_NAME = "beyonder-shell-v1";
const APP_SHELL = [
  "index.html",
  "login.html",
  "style.css",
  "app.js",
  "login.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POST/PUT (login, chat, ইত্যাদি) কখনো touch করা যাবে না

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const looksLikeApi = url.pathname.includes("/api/") || url.pathname.includes("/admin/");

  if (!isSameOrigin || looksLikeApi) {
    return; // API/cross-origin কল browser normally handle করুক
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // নেট থেকে সফলভাবে এলে সেটাই দেখাও, আর cache-ও আপডেট করে রাখো
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request)) // অফলাইনে হলে শুধু তখনই পুরোনো cache
  );
});

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

