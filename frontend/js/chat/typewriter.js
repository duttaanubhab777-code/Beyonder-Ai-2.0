/* Types a reply out smoothly. Tap the bubble to skip. Returns a function that finishes instantly. */
import { renderMarkdown, toSafeHtml } from "./markdown.js";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function typewrite(el, text, { onFrame, onDone } = {}) {
    if (reducedMotion() || text.length > 5000) {
        renderMarkdown(el, text);
        onDone?.();
        return () => {};
    }

    let shown = 0;
    let rafId = 0;
    let finished = false;
    const perFrame = Math.max(2, Math.ceil(text.length / 200));

    const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(rafId);
        renderMarkdown(el, text);
        onFrame?.();
        onDone?.();
    };

    const tick = () => {
        shown = Math.min(text.length, shown + perFrame);
        el.innerHTML = toSafeHtml(text.slice(0, shown));
        const cursor = document.createElement("span");
        cursor.className = "typing-cursor";
        cursor.innerHTML = "&nbsp;";
        el.append(cursor);
        onFrame?.();
        if (shown >= text.length) finish();
        else rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return finish;
}
