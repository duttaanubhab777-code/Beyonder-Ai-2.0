/* The "+" button next to the composer: choose which AI model answers. */
import { $, $$ } from "../core/dom.js"; import { storage } from "../core/storage.js"; import { state } from "./state.js";  const PROVIDERS = ["gemini", "gpt-oss", "qwen", "groq"];  function select(provider) { state.provider = provider; storage.set(storage.KEY.provider, provider); for (const option of $$(".model-option")) {
        option.classList.toggle("active", option.dataset.provider === provider);
    }
    const label = $(`.model-option[data-provider="${provider}"] .model-label`)?.textContent || "Normal";
    const button = $("#model-menu-btn");
    button.title = `AI model: ${label}`;
    button.classList.toggle("has-model", provider !== "gemini");
}

export function initModelPicker() {
    const button = $("#model-menu-btn");
    const menu = $("#model-menu"); if (!button \vert{}\vert{} !menu) return;      const saved = storage.get(storage.KEY.provider); select(PROVIDERS.includes(saved) ? saved : "gemini");      button.addEventListener("click", (event) => { event.stopPropagation(); menu.hidden = !menu.hidden; }); for (const option of $$(".model-option")) {
        option.addEventListener("click", () => {
            select(option.dataset.provider);
            menu.hidden = true;
        });
    }
    document.addEventListener("click", (event) => {
        if (!menu.hidden && !menu.contains(event.target)) menu.hidden = true;
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") menu.hidden = true;
    });
}
