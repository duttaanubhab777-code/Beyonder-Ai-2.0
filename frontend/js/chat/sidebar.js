/* Hamburger menu + "Past chats" history panel + new chat. */
import { api } from "../core/api.js";
import { $, clear, h, icon, timeAgo } from "../core/dom.js";
import { toastError } from "../core/toast.js";
import { loadHistory } from "./history.js";
import { showHero } from "./messages.js";
import { newSessionId, setSession } from "./session.js";
import { state } from "./state.js";

let menu, historyPanel, overlay;

const panels = () => [menu, historyPanel];

function openPanel(panel) {
    for (const other of panels()) if (other !== panel) other.classList.remove("open");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("active"));
    panel.classList.add("open");
}

export function closeSidebars() {
    for (const panel of panels()) panel.classList.remove("open");
    overlay.classList.remove("active");
    setTimeout(() => { if (!overlay.classList.contains("active")) overlay.hidden = true; }, 300);
}

export function startNewChat() {
    setSession(newSessionId());
    state.history = [];
    showHero();
    closeSidebars();
    $("#user-input")?.focus();
}

async function openSession(sessionId) {
    if (sessionId !== state.sessionId) {
        setSession(sessionId);
        await loadHistory();
    }
    closeSidebars();
}

async function deleteSession(sessionId, row) {
    if (!window.confirm("Delete this chat? This can't be undone.")) return;
    try {
        await api.del(`/api/chat-sessions/${encodeURIComponent(sessionId)}`);
        row.remove();
        if (sessionId === state.sessionId) startNewChat();
    } catch (err) {
        toastError(err);
    }
}

async function renderSessions() {
    const list = $("#sidebar-chat-list");
    let sessions = [];
    try {
        const data = await api.get("/api/chat-sessions");
        sessions = data.sessions || [];
    } catch (err) {
        clear(list).append(h("div", { class: "history-empty" }, err.message));
        return;
    }

    clear(list);
    if (!sessions.length) {
        list.append(h("div", { class: "history-empty" }, "No past chats yet. Say hi to Beyonder!"));
        return;
    }
    for (const session of sessions) {
        const row = h("div", { class: `history-item${session.session_id === state.sessionId ? " active" : ""}` },
            h("button", { class: "history-open", type: "button", onclick: () => openSession(session.session_id) },
                session.title, h("small", {}, `${session.message_count} msg · ${timeAgo(session.last_updated)}`)),
            h("button", {
                class: "history-del", type: "button", "aria-label": "Delete chat",
                onclick: () => deleteSession(session.session_id, row),
            }, icon("fa-regular fa-trash-can")));
        list.append(row);
    }
}

export function initSidebar() {
    menu = $("#sidebar-menu");
    historyPanel = $("#history-sidebar");
    overlay = $("#sidebar-overlay");

    $("#menu-btn").addEventListener("click", () => openPanel(menu));
    $("#close-sidebar-btn").addEventListener("click", closeSidebars);
    $("#close-history-btn").addEventListener("click", closeSidebars);
    overlay.addEventListener("click", closeSidebars);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebars(); });

    $("#history-btn").addEventListener("click", () => { openPanel(historyPanel); renderSessions(); });
    $("#new-chat-btn").addEventListener("click", startNewChat);

    document.addEventListener("beyonder:sessions-changed", () => {
        if (historyPanel.classList.contains("open")) renderSessions();
    });
}
