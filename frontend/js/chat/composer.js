/* The message box: sending, retrying, auto-grow, Enter key. */
import { api } from "../core/api.js";
import { $ } from "../core/dom.js";
import { askAI } from "./ai.js";
import { addAiMessage, addErrorMessage, addUserMessage, hideTyping, showTyping } from "./messages.js";
import { state } from "./state.js";

const input = () => $("#user-input");
const sendBtn = () => $("#send-btn");

function refreshSendButton() {
    sendBtn().disabled = state.busy;
}

function autoGrow() {
    const box = input();
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 120)}px`;
}

/** Saves one finished exchange in the backend (fire and forget). */
function persist(sessionId, userText, aiText) {
    api.post("/api/save-chat", { user_message: userText, ai_response: aiText, session_id: sessionId })
        .then(() => document.dispatchEvent(new CustomEvent("beyonder:sessions-changed")))
        .catch((err) => console.warn("Could not save chat:", err.message));
}

/** Sends `text` to the AI. The user bubble must already be on screen. */
async function deliver(text) {
    if (state.busy) return;
    state.busy = true;
    refreshSendButton();

    const sessionId = state.sessionId;          // the user may switch chats while we wait
    state.history.push({ role: "user", parts: [{ text }] });
    showTyping();

    try {
        const reply = await askAI(state.history, state.profile, state.provider);
        hideTyping();
        persist(sessionId, text, reply);
        if (state.sessionId === sessionId) {
            state.history.push({ role: "model", parts: [{ text: reply }] });
            addAiMessage(reply, { animate: true });
        }
    } catch (err) {
        hideTyping();
        if (state.sessionId === sessionId) {
            state.history.pop();                // a failed exchange must not pollute the context
            addErrorMessage(err.message, () => deliver(text));
        }
    } finally {
        state.busy = false;
        refreshSendButton();
    }
}

export function sendMessage(rawText) {
    const text = (rawText ?? "").trim();
    if (!text || state.busy) return;
    addUserMessage(text);
    deliver(text);
}

function submitFromBox() {
    const box = input();
    const text = box.value;
    if (!text.trim() || state.busy) return;
    box.value = "";
    autoGrow();
    sendMessage(text);
}

export function initComposer() {
    const box = input();
    box.addEventListener("input", autoGrow);
    sendBtn().addEventListener("click", submitFromBox);

    // Phones: Enter = new line (send with the button). Computers: Enter sends, Shift+Enter = new line.
    const touchDevice = window.matchMedia("(pointer: coarse)").matches;
    box.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || touchDevice) return;
        event.preventDefault();
        submitFromBox();
    });

    // Suggestion chips on the welcome screen
    document.addEventListener("beyonder:prompt", (event) => {
        if (state.busy) return;
        sendMessage(event.detail);
    });
}
