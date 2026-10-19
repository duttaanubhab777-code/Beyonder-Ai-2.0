import { h, icon } from "./dom.js";

let root;
const ICONS = { info: "fa-circle-info", success: "fa-circle-check", error: "fa-circle-exclamation" };

export function toast(message, kind = "info", ms = 3500) {
    if (!root) {
        root = h("div", { class: "toast-root", "aria-live": "polite" });
        document.body.append(root);
    }
    const node = h("div", { class: `toast toast-${kind}` }, icon(`fa-solid ${ICONS[kind] || ICONS.info}`), h("span", {}, message));
    root.append(node);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => {
        node.classList.remove("show");
        setTimeout(() => node.remove(), 300);
    }, ms);
}

export const toastError = (err) => toast(err?.message || "Something went wrong.", "error", 4500);
