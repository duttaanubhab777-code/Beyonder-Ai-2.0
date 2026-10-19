/* Shared building blocks for the admin dashboard: modals, dialogs, pager, small widgets. */
import { api } from "../core/api.js";
import { clear, colorForName, h, icon, initialOf } from "../core/dom.js";

/* ---------- modal ---------- */
export function openModal({ title, iconClass = "fa-solid fa-circle-info", wide = false, content = [], onClose } = {}) {
    const body = h("div", { class: "modal-body" }, content);
    let closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        onClose?.();
    };
    const onKey = (event) => {
        const top = Array.from(document.querySelectorAll(".modal-overlay")).pop();
        if (event.key === "Escape" && top === overlay) close();
    };

    const overlay = h("div", { class: "modal-overlay" },
        h("div", { class: `modal-card${wide ? " wide" : ""}` },
            h("div", { class: "modal-header" },
                h("h2", {}, icon(iconClass), title),
                h("button", { class: "modal-close", type: "button", "aria-label": "Close", onclick: close }, icon("fa-solid fa-xmark"))),
            body));
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    return { close, body, overlay };
}

export function confirmDialog(message, { title = "Are you sure?", confirmLabel = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            modal.close();
            resolve(value);
        };
        const modal = openModal({
            title, iconClass: "fa-solid fa-circle-question", onClose: () => finish(false),
            content: [
                h("p", {}, message),
                h("div", { class: "btn-row" },
                    h("button", { class: "btn", type: "button", onclick: () => finish(false) }, "Cancel"),
                    h("button", { class: `btn ${danger ? "danger solid" : "primary"}`, type: "button", onclick: () => finish(true) }, confirmLabel)),
            ],
        });
    });
}

/** Asks for one piece of text. Resolves to the string, or null if cancelled. */
export function promptDialog({ title, label, value = "", placeholder = "", multiline = false, confirmLabel = "OK", type = "text", required = true } = {}) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            modal.close();
            resolve(result);
        };
        const field = multiline
            ? h("textarea", { class: "textarea", placeholder, value })
            : h("input", { class: "input", type, placeholder, value });
        const submit = () => {
            const text = field.value.trim();
            if (required && !text) return field.focus();
            finish(text);
        };
        if (!multiline) field.addEventListener("keydown", (event) => { if (event.key === "Enter") submit(); });

        const modal = openModal({
            title, iconClass: "fa-solid fa-pen", onClose: () => finish(null),
            content: [
                h("div", { class: "field" }, label && h("label", {}, label), field),
                h("div", { class: "btn-row" },
                    h("button", { class: "btn", type: "button", onclick: () => finish(null) }, "Cancel"),
                    h("button", { class: "btn primary", type: "button", onclick: submit }, confirmLabel)),
            ],
        });
        setTimeout(() => field.focus(), 50);
    });
}

/** Shows a value the admin must copy (like a generated password). */
export function showSecret(title, intro, secret) {
    const copy = h("button", { class: "btn", type: "button" }, icon("fa-regular fa-copy"), "Copy");
    copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(secret); copy.textContent = "Copied"; } catch { /* long-press to copy instead */ }
    });
    openModal({
        title, iconClass: "fa-solid fa-key",
        content: [h("p", {}, intro), h("div", { class: "secret-box" }, secret), h("div", { class: "btn-row" }, copy)],
    });
}

/* ---------- small widgets ---------- */
export const loading = (text = "Loading...") => h("div", { class: "loading" }, icon("fa-solid fa-spinner fa-spin"), ` ${text}`);
export const empty = (text) => h("div", { class: "empty" }, text);
export const errorBox = (err) => h("div", { class: "empty" }, icon("fa-solid fa-triangle-exclamation"), ` ${err.message}`);

export const badge = (text, kind = "") => h("span", { class: `badge ${kind}`.trim() }, text);

export function avatar(name) {
    return h("div", { class: "avatar-sm", style: { background: colorForName(name) } }, initialOf(name));
}

export function statCard(label, value, kind = "") {
    return h("div", { class: `stat ${kind}`.trim() }, h("b", {}, String(value ?? 0)), h("span", {}, label));
}

/** Prev / next buttons. `state` = { page, per_page, total } */
export function pager(state, onPage) {
    const pages = Math.max(1, Math.ceil((state.total || 0) / state.per_page));
    if (pages <= 1) return h("div");
    return h("div", { class: "pager" },
        h("button", { class: "btn small", type: "button", disabled: state.page <= 1, onclick: () => onPage(state.page - 1) }, icon("fa-solid fa-chevron-left")),
        h("span", {}, `Page ${state.page} of ${pages} · ${state.total} total`),
        h("button", { class: "btn small", type: "button", disabled: state.page >= pages, onclick: () => onPage(state.page + 1) }, icon("fa-solid fa-chevron-right")));
}

export function field(label, control) {
    return h("div", { class: "field" }, h("label", {}, label), control);
}

/** Runs an async action on a button: disables it, restores afterwards. */
export async function busy(button, task) {
    button.disabled = true;
    try { return await task(); } finally { button.disabled = false; }
}

export async function downloadFromApi(path, filename) {
    const res = await api.get(path, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const link = h("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export { clear };
