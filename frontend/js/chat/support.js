/* "Chat with Admin": a private two-way line, separate from the AI chat. */
import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { $, clear, formatTime, h } from "../core/dom.js";
import { getToken, storage } from "../core/storage.js";
import { toastError } from "../core/toast.js";
import { closeSidebars } from "./sidebar.js";

let messages = [];
let lastId = 0;
let timer = null;
let polling = false;

const modal = () => $("#admin-chat-modal");
const isOpen = () => !modal().hidden;

function renderLog() {
    const log = $("#admin-chat-messages");
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    clear(log);
    if (!messages.length) {
        log.append(h("div", { class: "admin-chat-empty" }, "No messages yet. Say hello to the admin!"));
        return;
    }
    for (const m of messages) {
        log.append(h("div", { class: `admin-chat-msg ${m.sender === "admin" ? "from-admin" : "from-user"}` },
            h("span", {}, m.message),
            h("span", { class: "meta" }, `${m.sender === "admin" ? "Admin" : "You"} · ${formatTime(m.timestamp)}`)));
    }
    if (nearBottom || messages.length <= 1) log.scrollTop = log.scrollHeight;
}

function setBadge(on) {
    $("#support-badge").hidden = !on;
}

async function poll() {
    if (polling || !getToken()) return;
    polling = true;
    try {
        const data = await api.get(`/api/support/messages?since_id=${lastId}`);
        const fresh = data.messages || [];
        if (fresh.length) {
            messages.push(...fresh);
            lastId = fresh[fresh.length - 1].id;
            renderLog();
            storage.set(storage.KEY.supportSeen, String(lastId));
        }
    } catch { }
    polling = false;
}

function open() {
    closeSidebars();
    messages = [];
    lastId = 0;
    renderLog();
    modal().hidden = false;
    setBadge(false);
    poll();
    timer = setInterval(poll, CONFIG.SUPPORT_POLL_MS);
}

function close() {
    modal().hidden = true;
    clearInterval(timer);
    timer = null;
}

async function send() {
    const box = $("#admin-chat-text");
    const text = box.value.trim();
    if (!text) return;
    box.value = "";
    box.style.height = "auto";
    try {
        await api.post("/api/support/send", { message: text });
        await poll();
    } catch (err) {
        box.value = text;
        toastError(err);
    }
}

async function checkUnread() {
    if (isOpen() || document.hidden || !getToken()) return;
    const seen = Number(storage.get(storage.KEY.supportSeen)) || 0;
    try {
        const data = await api.get(`/api/support/messages?since_id=${seen}`);
        setBadge((data.messages || []).some((m) => m.sender === "admin"));
    } catch { }
}

export function initSupport() {
    $("#admin-chat-btn").addEventListener("click", open);
    $("#admin-chat-modal-close").addEventListener("click", close);
    modal().addEventListener("click", (event) => { if (event.target === modal()) close(); });
    $("#admin-chat-send").addEventListener("click", send);

    const box = $("#admin-chat-text");
    box.addEventListener("input", () => {
        box.style.height = "auto";
        box.style.height = `${Math.min(box.scrollHeight, 100)}px`;
    });
    box.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            send();
        }
    });

    checkUnread();
    setInterval(checkUnread, CONFIG.SUPPORT_BADGE_POLL_MS);
}
