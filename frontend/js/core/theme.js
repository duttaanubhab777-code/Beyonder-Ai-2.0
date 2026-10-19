import { storage } from "./storage.js";

const apply = (theme, icon) => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.setAttribute("data-theme", "dark");
    if (icon) icon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    storage.set(storage.KEY.theme, theme);
};

/** Wire a theme-toggle button. Theme is shared by all pages and follows the OS on first visit. */
export function initTheme(button) {
    const icon = button?.querySelector("i");
    const saved = storage.get(storage.KEY.theme);
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    apply(saved || (prefersLight ? "light" : "dark"), icon);

    button?.addEventListener("click", () => {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        apply(isLight ? "dark" : "light", icon);
    });
}
