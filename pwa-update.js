/* =========================================================
   PWA UPDATE NOTIFIER — shared by index.html and login.html
   ---------------------------------------------------------
   Registers the service worker and shows a small "New version
   available" popup whenever a fresh deploy is detected while the
   user already has the app open. Tapping "Refresh" activates the
   new version immediately and reloads.
   ========================================================= */
(function () {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;

    const showUpdateToast = (registration) => {
        if (document.getElementById("update-toast")) return; // already showing

        const toast = document.createElement("div");
        toast.id = "update-toast";
        toast.className = "update-toast";
        toast.innerHTML = `
            <div class="update-toast-icon"><i class="fa-solid fa-arrows-rotate"></i></div>
            <div class="update-toast-text">
                <strong>New version available</strong>
                <span>Tap refresh to get the latest Beyonder AI.</span>
            </div>
            <button class="update-toast-btn" id="update-toast-refresh" type="button">Refresh</button>
            <button class="update-toast-close" id="update-toast-close" type="button" aria-label="Dismiss">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("show"));

        document.getElementById("update-toast-refresh").addEventListener("click", () => {
            const waiting = registration.waiting;
            if (waiting) {
                waiting.postMessage("SKIP_WAITING");
            } else {
                // Nothing left waiting (edge case) — a normal reload will
                // still fetch fresh files thanks to the network-first
                // fetch strategy in sw.js.
                window.location.reload();
            }
        });

        document.getElementById("update-toast-close").addEventListener("click", () => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 350);
        });
    };

    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("sw.js")
            .then((registration) => {
                // Case 1: a new worker was already waiting when this page loaded
                // (e.g. the user had a tab open in the background during a deploy).
                if (registration.waiting && registration.active) {
                    showUpdateToast(registration);
                }

                // Case 2: a new worker starts installing sometime after load.
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && registration.active) {
                            showUpdateToast(registration);
                        }
                    });
                });

                // Nudge the browser to check for a newer sw.js periodically and
                // whenever the tab becomes visible again — some browsers only
                // check for updates on navigation otherwise.
                setInterval(() => registration.update().catch(() => {}), 5 * 60 * 1000);
                document.addEventListener("visibilitychange", () => {
                    if (document.visibilityState === "visible") {
                        registration.update().catch(() => {});
                    }
                });
            })
            .catch((e) => console.warn("Service worker registration failed:", e));

        // Once the new worker takes control, reload exactly once so the
        // freshly-cached files are actually the ones the page uses.
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    });
})();
