import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { clear, formatDateTime, h, icon, timeAgo } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { avatar, confirmDialog, empty, errorBox, loading } from "./ui.js";

const enc = encodeURIComponent;

export function render(root) {
    const timers = [];
    let active = null;
    let polling = false;

    const listBox = h("div", { class: "list" });
    const threadBox = h("div", { class: "card" }, empty("Pick a conversation."));
    const layout = h("div", { class: "split" }, h("div", {}, listBox), threadBox);
    root.append(layout);

    async function loadThreads(initial = false) {
        if (initial) clear(listBox).append(loading());
        try {
            const data = await api.get("/api/admin/support/threads");
            clear(listBox);
            if (!data.threads.length) listBox.append(empty("No support messages yet."));
            for (const t of data.threads) {
                listBox.append(h("button", { class: "row", type: "button", onclick: () => openThread(t) },
                    avatar(t.name),
                    h("div", { class: "grow" },
                        h("div", { class: "title" }, t.name, t.unread_count ? h("span", { class: "tab-badge" }, t.unread_count) : null),
                        h("div", { class: "meta" }, `${t.last_sender === "admin" ? "You: " : ""}${(t.last_message || "").slice(0, 70)} · ${timeAgo(t.last_timestamp)}`))));
            }
        } catch (err) {
            if (initial) clear(listBox).append(errorBox(err));
        }
    }

    let log, box;

    function bubble(m) {
        const fromAdmin = m.sender === "admin";
        return h("div", { class: `bubble ${fromAdmin ? "u" : "a"}` }, m.message,
            h("div", { class: "meta" }, `${fromAdmin ? "You" : "User"} · ${formatDateTime(m.timestamp)}`));
    }

    async function pollThread() {
        if (!active || polling) return;
        polling = true;
        try {
            const data = await api.get(`/api/admin/support/thread/${enc(active.email)}?since_id=${active.lastId}`);
            if (data.messages.length) {
                const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80 || active.lastId === 0;
                for (const m of data.messages) log.append(bubble(m));
                active.lastId = data.messages[data.messages.length - 1].id;
                if (stick) log.scrollTop = log.scrollHeight;
            }
        } catch { }
        polling = false;
    }

    async function send() {
        const text = box.value.trim();
        if (!text || !active) return;
        box.value = "";
        try {
            await api.post("/api/admin/support/reply", { email: active.email, message: text });
            await pollThread();
        } catch (err) { box.value = text; toastError(err); }
    }

    function openThread(thread) {
        active = { email: thread.email, name: thread.name, lastId: 0 };
        log = h("div", { class: "thread-log" });
        box = h("textarea", { class: "textarea", placeholder: "Write a reply...", rows: 1 });
        box.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
        });

        clear(threadBox).append(
            h("div", { class: "log-line", style: { border: "none", padding: "0 0 8px" } },
                h("div", { class: "grow" }, h("b", {}, thread.name), h("div", { class: "meta" }, thread.email)),
                h("button", {
                    class: "btn small danger", type: "button", "aria-label": "Delete conversation",
                    onclick: async () => {
                        if (!(await confirmDialog("Delete this whole conversation?", { danger: true, confirmLabel: "Delete" }))) return;
                        try { await api.del(`/api/admin/support/thread/${enc(thread.email)}`); active = null; clear(threadBox).append(empty("Deleted.")); loadThreads(); } catch (err) { toastError(err); }
                    },
                }, icon("fa-regular fa-trash-can"))),
            log,
            h("div", { class: "thread-compose" }, box, h("button", { class: "btn primary", type: "button", onclick: send }, icon("fa-solid fa-paper-plane"))));
        pollThread().then(() => loadThreads());
        threadBox.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    loadThreads(true);
    timers.push(setInterval(loadThreads, 10_000), setInterval(pollThread, CONFIG.SUPPORT_POLL_MS));
    return () => timers.forEach(clearInterval);
}
