// Beyonder AI — service worker
// Only caches the static "app shell" (HTML/CSS/JS/icons) so the installed
// app opens instantly and works offline for the UI itself. Anything that
// looks like an API call (login, chat, admin messages, etc.) always goes
// straight to the network — we never want to serve stale chat/auth data.

const CACHE_NAME = "beyonder-shell-v2"; // ভার্সন চেঞ্জ করলাম যাতে নতুনটা আপডেট হয়
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
  
  // POST/PUT (login, chat, ইত্যাদি) কখনো touch করা যাবে না
  if (request.method !== "GET") return; 

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const looksLikeApi = url.pathname.includes("/api/") || url.pathname.includes("/admin/");

  // API/cross-origin কল browser normally handle করুক
  if (!isSameOrigin || looksLikeApi) {
    return; 
  }

  // Network First Strategy: আগে নেটওয়ার্ক থেকে আনবে, নেট না থাকলে ক্যাশ দেখাবে
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
