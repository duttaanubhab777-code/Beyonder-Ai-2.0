/* Markdown -> safe HTML (+ KaTeX math + copy buttons on code blocks). */
import { escapeHtml } from "../core/dom.js";

let hooked = false;

function ensureLinkHook() {
    if (hooked || !window.DOMPurify) return;
    window.DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A") {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
    hooked = true;
}

export function toSafeHtml(text) {
    if (!window.marked || !window.DOMPurify) {
        return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
    }
    ensureLinkHook();
    return window.DOMPurify.sanitize(window.marked.parse(text));
}

const MATH_DELIMITERS = [
    { left: "$$", right: "$$", display: true },
    { left: "$", right: "$", display: false },
];

function renderMath(el) {
    if (!window.renderMathInElement) return;
    try {
        window.renderMathInElement(el, { delimiters: MATH_DELIMITERS, throwOnError: false });
    } catch { }
}

export function addCodeCopyButtons(root) {
    root.querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".code-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.type = "button";
        btn.textContent = "Copy";
        btn.addEventListener("click", async () => {
            const code = pre.querySelector("code");
            try {
                await navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
                btn.textContent = "Copied";
                setTimeout(() => { btn.textContent = "Copy"; }, 1200);
            } catch { btn.textContent = "Failed"; }
        });
        pre.append(btn);
    });
}

export function renderMarkdown(el, text) {
    el.innerHTML = toSafeHtml(text);
    renderMath(el);
    addCodeCopyButtons(el);
}
