/* =========================================================
   CONFIG - the only place you ever need to edit URLs.
   ========================================================= */

// 1) Your PythonAnywhere backend (used when the site is hosted somewhere else, e.g. GitHub Pages)
const PYTHONANYWHERE_URL = "https://anubhabdutta.pythonanywhere.com";

// 2) Your separate AI proxy (the beyonder-api repo, deployed on Vercel)
const AI_API_URL = "https://beyonder-api.vercel.app/api/chat";

// When the site is opened straight from PythonAnywhere (or localhost), the backend is the
// same origin, so API calls are simply "/api/...".
const host = window.location.hostname;
const SAME_ORIGIN =
    host === "localhost" || host === "127.0.0.1" || host.endsWith(".pythonanywhere.com");

export const CONFIG = Object.freeze({
    APP_NAME: "Beyonder AI",
    API_BASE: SAME_ORIGIN ? "" : PYTHONANYWHERE_URL,
    AI_API_URL,
    PAGES: Object.freeze({ login: "login.html", app: "index.html", admin: "admin.html" }),
    INBOX_POLL_MS: 30_000,
    SUPPORT_POLL_MS: 4_000,
    SUPPORT_BADGE_POLL_MS: 60_000,
    AI_CONTEXT_TURNS: 40,        // how many past messages are sent to the AI each time
    AI_TIMEOUT_MS: 60_000,
});
