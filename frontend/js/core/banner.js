/* Announcement + maintenance banners, shared by the login page and the chat page. */
import { api } from "./api.js";
import { h, icon } from "./dom.js";
import { storage } from "./storage.js";

const LEVEL_ICON = { info: "fa-circle-info", warning: "fa-triangle-exclamation", success: "fa-circle-check", danger: "fa-ban" };

export async function loadPublicConfig() {
    try {
        return await api.get("/api/public-config", { auth: false });
    } catch {
        return null;
    }
}

/** Puts a banner at the start of `mount`. If `dismissible`, remembers the dismissal for that exact text. */
export function showBanner(mount, { text, level = "info", dismissible = true, action } = {}) {
    if (!mount || !text) return null;
    const signature = `${level}:${text}`;
    if (dismissible && storage.get(storage.KEY.bannerDismissed) === signature) return null;

    const node = h("div", { class: `banner banner-${level}`, role: "status" },
        icon(`fa-solid ${LEVEL_ICON[level] || LEVEL_ICON.info}`),
        h("span", {}, text),
        action && h("button", { type: "button", onclick: action.onClick }, action.label),
        dismissible && h("button", {
            type: "button", "aria-label": "Dismiss",
            onclick: () => { storage.set(storage.KEY.bannerDismissed, signature); node.remove(); },
        }, icon("fa-solid fa-xmark")),
    );
    mount.prepend(node);
    return node;
}

/** Shows the admin's announcement and/or maintenance notice from /api/public-config. */
export function applyPublicConfig(cfg, mount) {
    if (!cfg) return;
    if (cfg.maintenance) {
        showBanner(mount, { text: cfg.maintenance_message, level: "warning", dismissible: false });
    }
    if (cfg.announcement) {
        showBanner(mount, { text: cfg.announcement, level: cfg.announcement_level || "info" });
    }
}
