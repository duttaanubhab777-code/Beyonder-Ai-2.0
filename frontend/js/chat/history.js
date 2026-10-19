import { api } from "../core/api.js";
import { addAiMessage, addUserMessage, clearChat, scrollToBottom, showHero } from "./messages.js";
import { state } from "./state.js";

export async function loadHistory() {
    clearChat();
    state.history = [];

    let history = [];
    try {
        const data = await api.get(`/api/chat-history?session_id=${encodeURIComponent(state.sessionId)}`);
        history = Array.isArray(data.history) ? data.history : [];
    } catch (err) {
        console.warn("Could not load chat history:", err.message);
    }

    if (!history.length) {
        showHero();
        return;
    }

    state.history = history;
    for (const turn of history) {
        const text = turn.parts?.[0]?.text || "";
        if (turn.role === "user") addUserMessage(text);
        else addAiMessage(text, { animate: false, fromAdmin: turn.source === "admin" });
    }
    scrollToBottom();
}
