/* Web Push notifications (admin -> user). Never prompts on its own: the user taps a button. */
import { api } from "../core/api.js";

const supported = () =>
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function subscribeThisDevice() {
    const { publicKey } = await api.get("/api/push/vapid-public-key", { auth: false });
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
    }
    await api.post("/api/push/subscribe", subscription.toJSON());
}

/**
 * Wires the "Notifications" button. Hidden when push isn't possible/needed.
 * If permission was already granted earlier, the subscription is quietly refreshed.
 */
export async function initPush(button, serverSupportsPush) {
    if (!button || !supported() || !serverSupportsPush) return;
    if (Notification.permission === "denied") return;

    if (Notification.permission === "granted") {
        subscribeThisDevice().catch(() => {});
        return;
    }

    button.hidden = false;
    button.addEventListener("click", async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") return;
            await subscribeThisDevice();
            button.hidden = true;
        } catch (err) {
            console.warn("Push setup skipped:", err);
        }
    });
}

/** Called on logout so this device stops receiving the old account's notifications. */
export async function unsubscribeThisDevice() {
    if (!supported()) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        await api.post("/api/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
        await subscription.unsubscribe();
    } catch { /* ignore */ }
}
