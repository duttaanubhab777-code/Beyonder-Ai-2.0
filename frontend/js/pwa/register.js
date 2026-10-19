/* Registers the service worker and shows the "New version available" toast. */
import { h, icon } from "../core/dom.js";

let reloading = false;

function showUpdateToast(registration) {
    if (document.getElementById("update-toast")) return;

    const close = () => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 350);
    };

    const toast = h("div", { id: "update-toast", class: "update-toast" },
        h("div", { class: "update-toast-icon" }, icon("fa-solid fa-arrows-rotate")),
        h("div", { class: "update-toast-text" },
            h("strong", {}, "New version available"),
            h("span", {}, "Tap refresh to get the latest Beyonder AI.")),
        h("button", {
            class: "update-toast-btn", type: "button",
            onclick: () => {
                if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
                else window.location.reload();
            },
        }, "Refresh"),
        h("button", { class: "update-toast-close", type: "button", "aria-label": "Dismiss", onclick: close },
            icon("fa-solid fa-xmark")),
    );
    document.body.append(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
}

export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const start = () => {
        navigator.serviceWorker.register("sw.js").then((registration) => {
            if (registration.waiting && registration.active) showUpdateToast(registration);

            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" && registration.active) showUpdateToast(registration);
                });
            });

            setInterval(() => registration.update().catch(() => {}), 5 * 60 * 1000);
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") registration.update().catch(() => {});
            });
        }).catch((err) => console.warn("Service worker registration failed:", err));

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
        });
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start);
}
