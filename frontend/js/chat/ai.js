/* Talks to the separate Beyonder AI proxy. */
import { CONFIG } from "../core/config.js";
import { getToken } from "../core/storage.js";
import { buildSystemPrompt } from "./prompt.js";

export function buildContext(history) {
    const turns = [];
    for (const turn of history) {
        if (turn.source === "admin") continue;
        const text = turn.parts?.[0]?.text;
        if (!text) continue;
        const last = turns[turns.length - 1];
        if (last && last.role === turn.role) last.parts[0].text += `\n\n${text}`;
        else turns.push({ role: turn.role, parts: [{ text }] });
    }
    const recent = turns.slice(-CONFIG.AI_CONTEXT_TURNS);
    while (recent.length && recent[0].role !== "user") recent.shift();
    return recent;
}

const FRIENDLY = {
    401: "Your session has expired. Please log in again.",
    413: "That message is too long. Try a shorter one.",
    429: "Too many requests right now. Please wait a moment and try again.",
    502: "The AI service is having trouble. Please try again.",
    503: "The AI service is busy. Please try again in a moment.",
    504: "The AI took too long to answer. Please try again.",
};

export class AiError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.status = status;
    }
}

export async function askAI(history, profile) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT_MS);

    try {
        const res = await fetch(CONFIG.AI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: getToken() || "" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: buildSystemPrompt(profile) }] },
                contents: buildContext(history),
            }),
            signal: controller.signal,
        });

        let data = {};
        try { data = await res.json(); } catch { }

        if (!res.ok || !data.text) {
            throw new AiError(data.error || FRIENDLY[res.status] || "Sorry, I couldn't answer that.", res.status);
        }
        return data.text;
    } catch (err) {
        if (err instanceof AiError) throw err;
        if (err.name === "AbortError") throw new AiError(FRIENDLY[504], 504);
        throw new AiError("Network error - please check your connection and try again.");
    } finally {
        clearTimeout(timer);
    }
}
