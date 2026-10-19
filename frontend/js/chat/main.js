/* Entry point of index.html: wires every chat-page module together. */
import { consumeImpersonationHash, goTo, logout, requireLogin } from "../core/auth.js";
import { applyPublicConfig, loadPublicConfig, showBanner } from "../core/banner.js";
import { CONFIG } from "../core/config.js";
import { $, h, icon } from "../core/dom.js";
import { isImpersonating } from "../core/storage.js";
import { initTheme } from "../core/theme.js";
import { initInstallButton } from "../pwa/install.js";
import { initPush, unsubscribeThisDevice } from "../pwa/push.js";
import { registerServiceWorker } from "../pwa/register.js";
import { initComposer } from "./composer.js";
import { loadHistory } from "./history.js";
import { startInbox } from "./inbox.js";
import { initModelPicker } from "./models.js";
import { initProfileModal, loadProfile } from "./profile.js";
import { initSession } from "./session.js";
import { initSidebar } from "./sidebar.js";
import { state } from "./state.js";
import { initSupport } from "./support.js";

async function logoutAndForgetPush() {
    if (!isImpersonating()) await unsubscribeThisDevice();
    await logout();
}

function showFatal(message) {
    document.body.classList.remove("checking-auth");
    const area = $("#chat-area");
    area.style.visibility = "visible";
    area.replaceChildren(h("div", { class: "fatal-screen" },
        icon("fa-solid fa-wifi"),
        h("h2", {}, "Can't connect"),
        h("p", {}, message),
        h("button", { class: "btn-secondary", type: "button", onclick: () => window.location.reload() },
            icon("fa-solid fa-rotate-right"), " Try again")));
}

async function boot() {
    consumeImpersonationHash();                 // admin "Login as user" hand-off (must run first)
    initTheme($("#theme-toggle-btn"));
    registerServiceWorker();

    let me;
    try {
        me = await requireLogin();
    } catch (err) {
        showFatal(err.message);
        return;
    }
    if (!me) return;                            // requireLogin already redirected to login.html
    state.profile.isAdmin = !!me.is_admin;

    initSession();
    initSidebar();
    initComposer();
    initModelPicker();
    initProfileModal();
    initSupport();
    initInstallButton($("#install-btn"));
    $("#logout-btn").addEventListener("click", logoutAndForgetPush);

    // Admins get a shortcut to their dashboard (not while "viewing as" somebody else)
    if (me.is_admin && !me.impersonated) {
        const link = $("#admin-link");
        link.hidden = false;
        link.addEventListener("click", () => goTo(CONFIG.PAGES.admin));
    }

    // "Viewing as <user>" bar for admin impersonation
    if (me.impersonated) {
        showBanner($("#banner-slot"), {
            text: `Admin view: you are signed in as ${me.name || me.email}.`,
            level: "danger", dismissible: false,
            action: { label: "Exit", onClick: logout },
        });
    }

    await loadProfile();
    document.body.classList.remove("checking-auth");

    loadPublicConfig().then((cfg) => {
        applyPublicConfig(cfg, $("#banner-slot"));
        state.pushAvailable = !!cfg?.push_available;
        initPush($("#push-btn"), state.pushAvailable);
    });

    window.addEventListener("beyonder:maintenance", (event) => {
        showBanner($("#banner-slot"), { text: event.detail || "Beyonder AI is under maintenance.", level: "warning", dismissible: false });
    });

    await loadHistory();
    startInbox();
}

boot();
