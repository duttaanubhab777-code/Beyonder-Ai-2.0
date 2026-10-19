import { api } from "../core/api.js";
import { clear, debounce, formatDateTime, h } from "../core/dom.js";
import { badge, empty, errorBox, loading, pager } from "./ui.js";

const enc = encodeURIComponent;

export function render(root) {
    let mode = "logins";
    const state = { page: 1, per_page: 40, total: 0, email: "", status: "" };

    const body = h("div", { class: "card" });
    const pagerBox = h("div");
    const toolbar = h("div", { class: "toolbar" });

    const tab = (id, label) => h("button", { class: `btn small${mode === id ? " primary" : ""}`, type: "button", onclick: () => { mode = id; state.page = 1; buildToolbar(); load(); } }, label);

    function buildToolbar() {
        clear(toolbar).append(tab("logins", "Login history"), tab("audit", "Admin audit log"));
        if (mode === "logins") {
            const email = h("input", { class: "input grow", type: "search", placeholder: "Filter by email", value: state.email });
            const status = h("select", { class: "select" },
                h("option", { value: "" }, "All"), h("option", { value: "success" }, "Successful"), h("option", { value: "failed" }, "Failed"));
            status.value = state.status;
            email.addEventListener("input", debounce(() => { state.email = email.value.trim(); state.page = 1; load(); }, 350));
            status.addEventListener("change", () => { state.status = status.value; state.page = 1; load(); });
            toolbar.append(email, status);
        }
    }

    async function load() {
        clear(body).append(loading());
        try {
            let lines;
            if (mode === "logins") {
                const data = await api.get(`/api/admin/logs?page=${state.page}&per_page=${state.per_page}&email=${enc(state.email)}&status=${state.status}`);
                state.total = data.total;
                lines = data.logs.map((l) => h("div", { class: "log-line" },
                    badge(l.success ? "OK" : "FAIL", l.success ? "good" : "bad"),
                    h("div", { class: "grow" }, l.email, h("div", { class: "meta" }, `${l.ip || "?"}${l.note ? ` · ${l.note}` : ""}`),
                        h("div", { class: "meta" }, (l.user_agent || "").slice(0, 100))),
                    h("time", {}, formatDateTime(l.timestamp))));
            } else {
                const data = await api.get(`/api/admin/audit?page=${state.page}&per_page=${state.per_page}`);
                state.total = data.total;
                lines = data.entries.map((e) => h("div", { class: "log-line" },
                    badge(e.action, "admin"),
                    h("div", { class: "grow" }, `${e.admin}${e.target ? ` → ${e.target}` : ""}`,
                        e.detail && h("div", { class: "meta" }, e.detail), h("div", { class: "meta" }, e.ip || "")),
                    h("time", {}, formatDateTime(e.timestamp))));
            }
            clear(body);
            if (!lines.length) body.append(empty("Nothing here yet."));
            else body.append(...lines);
            clear(pagerBox).append(pager(state, (page) => { state.page = page; load(); window.scrollTo({ top: 0 }); }));
        } catch (err) {
            clear(body).append(errorBox(err));
        }
    }

    root.append(toolbar, body, pagerBox);
    buildToolbar();
    load();
}
