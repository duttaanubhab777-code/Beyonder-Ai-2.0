// Beyonder AI — service worker
//
// WHY THIS FILE CHANGED:
// The old version cached the app shell (HTML/CSS/JS) and served the CACHED
// copy first on every load ("cache-first"), only refreshing the cache
// quietly in the background. That's what caused real users to keep seeing
// an old version of the app after we pushed updates — their browser kept
// answering every request straight from the old cache, and because this
// file (sw.js) itself often didn't change between deploys, the browser had
// no reason to even notice a new version existed.
//
// Fix: the app shell is now fetched "network-first" (always try the real
// network first; only fall back to the cache if the device is offline).
// Combined with pwa-update.js (which shows the "New version available"
// popup), this means: (1) a normal reload always gets the newest files,
// and (2) if the user already has the tab open during a deploy, they get
// asked to refresh instead of silently keeps using stale code.

const SW_VERSION = "v3"; // bump this string on any deploy that should force a clean cache
const CACHE_NAME = `beyonder-shell-${SW_VERSION}`;

const APP_SHELL = [
  "index.html",
  "login.html",
  "style.css",
  "app.js",
  "login.js",
  "pwa-update.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // NOTE: no self.skipWaiting() here on purpose. If a user already has the
  // app open, we don't want to yank the ground out from under their active
  // session — the new worker waits until the user taps "Refresh" on the
  // update popup (see pwa-update.js), which sends SKIP_WAITING below.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Lets the page (pwa-update.js) tell a waiting worker "go ahead and take over now".
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ================= PUSH NOTIFICATIONS =================
// Fired by the browser's push service whenever the backend sends a push
// (see /api/push/subscribe and send_push_to_user() in app.py) — this is
// what shows a real popup notification on the phone's home screen, even
// if Beyonder AI isn't open in any tab. If the device is offline right
// now, the push service itself holds the message and delivers it (which
// fires this same event) the moment the device is back online — no extra
// code needed here for that part, it's handled outside the page entirely.
self.addEventListener("push", (event) => {
  let payload = { title: "Beyonder AI", body: "You have a new message.", url: "index.html" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: "icon-192.png",
    badge: "icon-192.png",
    vibrate: [100, 50, 100],
    data: { url: payload.url || "index.html" },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Tapping the notification focuses an already-open tab if there is one,
// otherwise opens a fresh one straight to the chat.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "index.html";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch POST/PUT (logins, chat sends, etc.)

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const looksLikeApi = url.pathname.includes("/api/") || url.pathname.includes("/admin/");

  if (!isSameOrigin || looksLikeApi) {
    // Let the browser handle API calls and third-party requests normally.
    return;
  }

  // Network-first: always try to get the freshest file. Only fall back to
  // the cached copy if the network request fails (offline / no signal),
  // which is what keeps the installed app usable without a connection.
  event.respondWith(
    fetch(request, { cache: "no-store" })
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
