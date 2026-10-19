/* Messages an admin sends to this user appear in the chat like a normal reply. */
import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { getToken } from "../core/storage.js";
import { addAiMessage } from "./messages.js";
import { state } from "./state.js";

async function poll() {
    if (document.hidden || !getToken()) return;
    try {
        const data = await api.get(`/api/inbox?session_id=${encodeURIComponent(state.sessionId)}`);
        for (const msg of data.messages || []) {
            state.history.push({ role: "model", source: "admin", parts: [{ text: msg.text }] });
            addAiMessage(msg.text, { animate: true, fromAdmin: true });
        }
    } catch { }
}

export function startInbox() {
    poll();
    setInterval(poll, CONFIG.INBOX_POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
}
