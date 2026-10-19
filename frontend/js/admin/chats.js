import { api } from "../core/api.js";
import { clear, debounce, formatDateTime, h, icon } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { badge, confirmDialog, empty, errorBox, loading, pager } from "./ui.js";

const enc = encodeURIComponent;

export function render(root, params) {
    const state = { page: 1, per_page: 20, total: 0, q: params.get("q") || "", email: params.get("email") || "", order: "desc" };
    const listBox = h("div", { class: "list" });
    const pagerBox = h("div");

    const q = h("input", { class: "input grow", type: "search", placeholder: "Search message text...", value: state.q });
    const email = h("input", { class: "input grow", type: "search", placeholder: "Filter by user email", value: state.email });
    const order = h("select", { class: "select" }, h("option", { value: "desc" }, "Newest first"), h("option", { value: "asc" }, "Oldest first"));

    async function load() {
        clear(listBox).append(loading());
        try {
            const query = `page=${state.page}&per_page=${state.per_page}&q=${enc(state.q)}&email=${enc(state.email)}&order=${state.order}`;
            const data = await api.get(`/api/admin/chats?${query}`);
            state.total = data.total;
            clear(listBox);
            if (!data.chats.length) listBox.append(empty("No messages match."));
            for (const chat of data.chats) listBox.append(item(chat));
            clear(pagerBox).append(pager(state, (page) => { state.page = page; load(); window.scrollTo({ top: 0 }); }));
        } catch (err) {
            clear(listBox).append(errorBox(err));
        }
    }

    function item(chat) {
        const isAdmin = chat.source === "admin";
        const card = h("div", { class: "card chat-pair" },
            h("div", { class: "log-line", style: { border: "none", padding: 0 } },
                h("div", { class: "grow" }, chat.email, " ", isAdmin && badge("FROM ADMIN", "admin")),
                h("time", {}, formatDateTime(chat.timestamp)),
                h("button", {
                    class: "btn small danger", type: "button", "aria-label": "Delete message",
                    onclick: async () => {
                        if (!(await confirmDialog("Delete this message?", { danger: true, confirmLabel: "Delete" }))) return;
                        try { await api.del(`/api/admin/chats/${chat.id}`); card.remove(); toast("Deleted.", "success"); } catch (err) { toastError(err); }
                    },
                }, icon("fa-regular fa-trash-can"))),
            chat.user_message && h("div", { class: "bubble u" }, chat.user_message),
            chat.ai_response && h("div", { class: `bubble a${isAdmin ? " admin" : ""}` }, chat.ai_response),
            h("div", { class: "meta mono" }, chat.session_id));
        return card;
    }

    const reset = () => { state.page = 1; load(); };
    q.addEventListener("input", debounce(() => { state.q = q.value.trim(); reset(); }, 350));
    email.addEventListener("input", debounce(() => { state.email = email.value.trim(); reset(); }, 350));
    order.addEventListener("change", () => { state.order = order.value; reset(); });

    root.append(h("div", { class: "toolbar" }, q, email, order), listBox, pagerBox);
    load();
}
