/* Small DOM helpers. Everything built with h() uses textContent, so user data can't inject HTML. */

export const $ = (sel, root = document) => root.querySelector(sel); export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** h("div", {class:"x", onclick: fn, dataset:{a:1}}, "text", childNode, [more, nodes]) */
export function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
        else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in node && key !== "list") node[key] = value;
        else node.setAttribute(key, value === true ? "" : value);
    }
    append(node, children);
    return node;
}

export function append(node, children) {
    for (const child of [children].flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

export const icon = (classes) => h("i", { class: classes });

export const clear = (node) => { node.replaceChildren(); return node; };

export const escapeHtml = (value) => {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
};

export const debounce = (fn, ms = 300) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
};

/* ---- dates ---- */
export const formatDateTime = (ts) => {
    if (!ts) return "-";
    return new Date(ts * 1000).toLocaleString([], {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

export const formatTime = (ts) =>
    ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";

export const timeAgo = (ts) => {
    if (!ts) return "never";
    const s = Math.max(0, Date.now() / 1000 - ts);
    if (s < 45) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const hrs = Math.floor(m / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const d = Math.floor(hrs / 24);
    return d < 30 ? `${d}d ago` : formatDateTime(ts);
};

export const formatBytes = (n) => {
    if (!n) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

/* ---- avatar colours (same palette the chat app always used) ---- */
const AVATAR_COLORS = [
    "#6b5cd6", "#e0568b", "#2a9d8f", "#e76f51", "#457b9d", "#f4a261", "#d62828", "#06a77d",
    "#8338ec", "#fb8500", "#3a86ff", "#c9184a", "#588157", "#bc6c25", "#219ebc", "#9d4edd",
    "#ef476f", "#118ab2", "#ff6392", "#5f6caf",
];

export const colorForName = (name = "") => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";
