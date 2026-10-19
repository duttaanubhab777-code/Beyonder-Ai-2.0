/* Entry point of admin.html: login check, tabs and a tiny hash router. */
import { api } from "../core/api.js";
import { goTo, logout, requireLogin } from "../core/auth.js";
import { CONFIG } from "../core/config.js";
import { $, clear, h, icon } from "../core/dom.js";
import { toastError } from "../core/toast.js";
import { initTheme } from "../core/theme.js";
import { registerServiceWorker } from "../pwa/register.js";
import * as broadcast from "./broadcast.js";
import * as chats from "./chats.js";
import * as logs from "./logs.js";
import * as overview from "./overview.js";
import * as settings from "./settings.js";
import * as support from "./support.js";
import * as users from "./users.js";

const TABS = [
    { id: "overview", label: "Overview", icon: "fa-chart-line", view: overview },
    { id: "users", label: "Users", icon: "fa-users", view: users },
    { id: "chats", label: "Chats", icon: "fa-comments", view: chats },
    { id: "support", label: "Support", icon: "fa-headset", view: support, badge: true },
    { id: "broadcast", label: "Broadcast", icon: "fa-bullhorn", view: broadcast },
    { id: "logs", label: "Logs", icon: "fa-list-check", view: logs },
    { id: "settings", label: "Settings", icon: "fa-gear", view: settings },
];

let cleanup = null;

/** "#users?q=anu" -> { id: "users", params: URLSearchParams } */
function readRoute() {
    const [id, query = ""] = window.location.hash.slice(1).split("?");
    return { id: TABS.some((t) => t.id === id) ? id : "overview", params: new URLSearchParams(query) };
}

export function navigate(id, params = {}) {
    const query = new URLSearchParams(params).toString();
    window.location.hash = query ? `${id}?${query}` : id;
}

function show() {
    const { id, params } = readRoute();
    const tab = TABS.find((t) => t.id === id);

    for (const button of document.querySelectorAll(".admin-tab")) {
        button.classList.toggle("active", button.dataset.tab === id);
    }
    if (cleanup) { cleanup(); cleanup = null; }

    const root = clear($("#admin-view"));
    try {
        cleanup = tab.view.render(root, params, { navigate }) || null;
    } catch (err) {
        root.append(h("div", { class: "empty" }, `This page crashed: ${err.message}`));
        console.error(err);
    }
}

async function refreshSupportBadge() {
    if (document.hidden) return;
    try {
        const data = await api.get("/api/admin/support/threads");
        const badge = $("#tab-badge-support");
        badge.textContent = data.unread_total;
        badge.hidden = !data.unread_total;
    } catch { /* ignore */ }
}

async function boot() {
    initTheme($("#theme-toggle-btn"));
    registerServiceWorker();

    let me;
    try {
        me = await requireLogin();
    } catch (err) {
        toastError(err);
        $("#admin-view").append(h("div", { class: "empty" }, err.message));
        return;
    }
    if (!me) return;
    if (!me.is_admin || me.impersonated) return goTo(CONFIG.PAGES.app);

    $("#admin-who").textContent = me.email;
    $("#open-app-btn").addEventListener("click", () => goTo(CONFIG.PAGES.app));
    $("#admin-logout-btn").addEventListener("click", logout);

    $("#admin-tabs").append(...TABS.map((tab) =>
        h("button", { class: "admin-tab", type: "button", dataset: { tab: tab.id }, onclick: () => navigate(tab.id) },
            icon(`fa-solid ${tab.icon}`), tab.label,
            tab.badge && h("span", { class: "tab-badge", id: `tab-badge-${tab.id}`, hidden: true }))));

    window.addEventListener("hashchange", show);
    show();
    refreshSupportBadge();
    setInterval(refreshSupportBadge, 30_000);
}

boot();
