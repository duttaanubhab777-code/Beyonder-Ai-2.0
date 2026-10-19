/* Everything that draws inside the chat area. */
import { h, icon } from "../core/dom.js";
import { renderMarkdown } from "./markdown.js";
import { typewrite } from "./typewriter.js";

const area = () => document.getElementById("chat-area");

export const scrollToBottom = () => { area().scrollTop = area().scrollHeight; };
export const clearChat = () => area().replaceChildren();
const removeHero = () => area().querySelector(".chat-hero")?.remove();

const SUGGESTIONS = [
    { icon: "fa-lightbulb", text: "Explain a tricky topic in simple terms" },
    { icon: "fa-code", text: "Help me find a bug in my code" },
    { icon: "fa-pen-nib", text: "Write a short creative story for me" },
    { icon: "fa-route", text: "Plan a weekend trip for me" },
];

export function showHero() {
    clearChat();
    const chips = SUGGESTIONS.map((s) => h("button", {
        type: "button", class: "chip",
        onclick: () => document.dispatchEvent(new CustomEvent("beyonder:prompt", { detail: s.text })),
    }, icon(`fa-solid ${s.icon}`), h("span", {}, s.text)));

    area().append(h("div", { class: "chat-hero" },
        h("div", { class: "chat-hero-logo" }, icon("fa-solid fa-atom")),
        h("h2", {}, "Hi, I'm Beyonder AI"),
        h("p", {}, "Hello, I am Beyonder. How can I help you?"),
        h("div", { class: "chat-hero-chips" }, chips),
    ));
}

export function addUserMessage(text) {
    removeHero();
    const p = h("p");
    p.textContent = text;
    area().append(h("div", { class: "message outgoing" }, p));
    scrollToBottom();
}

function copyButton(text) {
    const btn = h("button", { class: "copy-btn-outside", type: "button", "aria-label": "Copy reply" },
        icon("fa-regular fa-copy"));
    btn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(text);
            btn.replaceChildren(icon("fa-solid fa-check"));
            setTimeout(() => btn.replaceChildren(icon("fa-regular fa-copy")), 1500);
        } catch { }
    });
    return btn;
}

export function addAiMessage(text, { animate = true, fromAdmin = false } = {}) {
    removeHero();
    const content = h("div", fromAdmin ? {} : { class: "msg-text" });
    const textBox = fromAdmin
        ? h("div", { class: "msg-text" }, h("div", { class: "admin-tag" }, icon("fa-solid fa-headset"), " Admin"), content)
        : content;
    const bubble = h("div", { class: "message incoming" },
        h("div", { class: "msg-logo" }, icon("fa-solid fa-atom")), textBox);
    area().append(bubble);

    const done = () => {
        if (!bubble.nextElementSibling?.classList.contains("copy-btn-outside")) {
            bubble.insertAdjacentElement("afterend", copyButton(text));
        }
        scrollToBottom();
    };

    if (animate) {
        const skip = typewrite(content, text, { onFrame: scrollToBottom, onDone: done });
        bubble.addEventListener("click", skip, { once: true });
    } else {
        renderMarkdown(content, text);
        done();
    }
}

export function addErrorMessage(message, onRetry) {
    removeHero();
    const node = h("div", { class: "message incoming msg-error" },
        h("div", { class: "msg-logo" }, icon("fa-solid fa-triangle-exclamation")),
        h("div", { class: "msg-text" },
            h("p", {}, message),
            onRetry && h("button", {
                class: "retry-btn", type: "button",
                onclick: () => { node.remove(); onRetry(); },
            }, icon("fa-solid fa-rotate-right"), " Try again")));
    area().append(node);
    scrollToBottom();
}

export function showTyping() {
    removeHero();
    area().append(h("div", { class: "message incoming", id: "typing-indicator" },
        h("div", { class: "msg-logo" }, icon("fa-solid fa-atom")),
        h("div", { class: "typing-dots" }, h("span"), h("span"), h("span"))));
    scrollToBottom();
}

export const hideTyping = () => document.getElementById("typing-indicator")?.remove();
