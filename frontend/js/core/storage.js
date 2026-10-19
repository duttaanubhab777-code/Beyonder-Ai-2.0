/* Safe wrappers around localStorage / sessionStorage (they can throw in private mode). */

const KEY = Object.freeze({
    token: "beyonder_token",
    theme: "beyonder-theme",
    session: "beyonder-current-session",
    returning: "beyonder_returning_user",
    supportSeen: "beyonder-support-seen-id",
    bannerDismissed: "beyonder-banner-dismissed",
});

const attempt = (fn, fallback = null) => {
    try { return fn(); } catch { return fallback; }
};

export const storage = {
    KEY,
    get: (k) => attempt(() => localStorage.getItem(k)),
    set: (k, v) => attempt(() => localStorage.setItem(k, v)),
    remove: (k) => attempt(() => localStorage.removeItem(k)),
    getTab: (k) => attempt(() => sessionStorage.getItem(k)),
    setTab: (k, v) => attempt(() => sessionStorage.setItem(k, v)),
    removeTab: (k) => attempt(() => sessionStorage.removeItem(k)),
};

/* ---- auth token ----
   A token in sessionStorage belongs to THIS TAB only. The admin "Login as user" feature
   uses it, so the admin's own saved login (localStorage) is never overwritten. */
export const getToken = () => storage.getTab(KEY.token) || storage.get(KEY.token);
export const setToken = (token) => storage.set(KEY.token, token);
export const setTabToken = (token) => storage.setTab(KEY.token, token);
export const isImpersonating = () => !!storage.getTab(KEY.token);

export const clearToken = () => {
    if (isImpersonating()) storage.removeTab(KEY.token);
    else storage.remove(KEY.token);
};
