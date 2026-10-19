import { api } from "./api.js";
import { CONFIG } from "./config.js";
import { clearToken, getToken, isImpersonating, setTabToken, storage } from "./storage.js";

/** Admin "Login as user" opens  index.html#as=TOKEN  -> the token stays in THIS tab only. */
export function consumeImpersonationHash() {
    const match = window.location.hash.match(/[#&]as=([^&]+)/);
    if (!match) return;
    setTabToken(decodeURIComponent(match[1]));
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

export const goTo = (page) => window.location.replace(page);

export const homeFor = (me) => (me?.is_admin ? CONFIG.PAGES.admin : CONFIG.PAGES.app);

/** Returns the logged-in user's info, or redirects to the login page. */
export async function requireLogin() {
    if (!getToken()) {
        goTo(CONFIG.PAGES.login);
        return null;
    }
    try {
        const me = await api.get("/api/me", { auth: true });
        if (!me.logged_in) {
            clearToken();
            goTo(CONFIG.PAGES.login);
            return null;
        }
        return me;
    } catch (err) {
        if (err.status === 0 || err.status >= 500) throw err;
        goTo(CONFIG.PAGES.login);
        return null;
    }
}

export async function logout() {
    try { await api.post("/api/logout"); } catch { /* ignore - we are leaving anyway */ }
    const wasImpersonating = isImpersonating();
    clearToken();
    if (!wasImpersonating) {
        storage.remove(storage.KEY.session);
        storage.remove(storage.KEY.supportSeen);
    }
    goTo(CONFIG.PAGES.login);
}
