import { api } from "../core/api.js";
import { CONFIG } from "../core/config.js";
import { clear, debounce, formatDateTime, h, icon, timeAgo } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { avatar, badge, busy, confirmDialog, downloadFromApi, empty, errorBox, field, loading, openModal, pager, promptDialog, showSecret } from "./ui.js";

const enc = encodeURIComponent;

export function render(root, params, ctx) {
    const state = { page: 1, per_page: 20, total: 0, q: params.get("q") || "", filter: "" };
    const listBox = h("div", { class: "list" });
    const pagerBox = h("div");

    const search = h("input", { class: "input grow", type: "search", placeholder: "Search name or email...", value: state.q });
    const filter = h("select", { class: "select" },
        h("option", { value: "" }, "All users"), h("option", { value: "banned" }, "Banned only"));
    const addBtn = h("button", { class: "btn primary", type: "button", onclick: () => openCreate() }, icon("fa-solid fa-user-plus"), "New user");

    async function load() {
        clear(listBox).append(loading());
        try {
            const q = `page=${state.page}&per_page=${state.per_page}&q=${enc(state.q)}&filter=${state.filter}`;
            const data = await api.get(`/api/admin/users?${q}`);
            state.total = data.total;
            clear(listBox);
            if (!data.users.length) listBox.append(empty("No users found."));
            for (const user of data.users) listBox.append(userRow(user));
            clear(pagerBox).append(pager(state, (page) => { state.page = page; load(); }));
        } catch (err) {
            clear(listBox).append(errorBox(err));
        }
    }

    function userRow(user) {
        return h("button", { class: "row", type: "button", onclick: () => openUser(user.email) },
            avatar(user.name),
            h("div", { class: "grow" },
                h("div", { class: "title" }, user.name,
                    user.is_admin && badge("ADMIN", "admin"), user.is_banned && badge("BANNED", "bad")),
                h("div", { class: "meta" }, `${user.email} · last login ${timeAgo(user.last_login_at)}`)),
            icon("fa-solid fa-chevron-right"));
    }

    search.addEventListener("input", debounce(() => { state.q = search.value.trim(); state.page = 1; load(); }, 350));
    filter.addEventListener("change", () => { state.filter = filter.value; state.page = 1; load(); });

    function openCreate() {
        const name = h("input", { class: "input", placeholder: "Full name" });
        const email = h("input", { class: "input", type: "email", placeholder: "email@example.com" });
        const password = h("input", { class: "input", type: "text", placeholder: "Password (min 8 characters)" });
        const save = h("button", { class: "btn primary", type: "button" }, "Create user");
        const modal = openModal({
            title: "New user", iconClass: "fa-solid fa-user-plus",
            content: [field("Name", name), field("Email", email), field("Password", password), save],
        });
        save.addEventListener("click", () => busy(save, async () => {
            try {
                await api.post("/api/admin/users", { name: name.value, email: email.value, password: password.value });
                modal.close();
                toast("User created.", "success");
                load();
            } catch (err) { toastError(err); }
        }));
    }

    async function openUser(email) {
        const modal = openModal({ title: "User", iconClass: "fa-solid fa-user", wide: true, content: [loading()] });
        const reload = () => { modal.close(); openUser(email); };
        let user;
        try {
            user = (await api.get(`/api/admin/users/${enc(email)}`)).user;
        } catch (err) {
            clear(modal.body).append(errorBox(err));
            return;
        }
        const path = `/api/admin/users/${enc(email)}`;
        const act = (label, fn, { danger = false } = {}) =>
            h("button", {
                class: `btn small${danger ? " danger" : ""}`, type: "button",
                onclick: (event) => busy(event.currentTarget, async () => { try { await fn(); } catch (err) { toastError(err); } }),
            }, label);

        const nameIn = h("input", { class: "input", value: user.name });
        const addressIn = h("input", { class: "input", value: user.address || "" });
        const noteIn = h("textarea", { class: "textarea", placeholder: "Private note (only admins see this)" });
        noteIn.value = user.admin_note || "";

        const saveEdits = act("Save changes", async () => {
            await api.post(`${path}/update`, { name: nameIn.value, address: addressIn.value, admin_note: noteIn.value });
            toast("Saved.", "success");
            load();
        });
        saveEdits.classList.add("primary");

        const actions = [
            act("Send message", async () => {
                const message = await promptDialog({ title: `Message ${user.name}`, label: "Shows up in their chat (and as a push notification).", multiline: true, confirmLabel: "Send" });
                if (!message) return;
                const res = await api.post(`${path}/message`, { message });
                toast(`${res.message} (${res.pushed} push)`, "success");
            }),
            act("Login as user", async () => {
                const win = window.open("about:blank", "_blank");
                try {
                    const res = await api.post(`${path}/impersonate`);
                    const url = new URL(CONFIG.PAGES.app, window.location.href);
                    url.hash = `as=${enc(res.token)}`;
                    if (win) win.location.href = url.href;
                    else window.location.href = url.href;
                } catch (err) { win?.close(); throw err; }
            }),
            act("Reset password", async () => {
                const custom = await promptDialog({ title: "Reset password", label: "Type a new password, or leave empty to generate one.", required: false, confirmLabel: "Reset" });
                if (custom === null) return;
                const res = await api.post(`${path}/reset-password`, { new_password: custom });
                if (res.password) showSecret("New password", "Give this to the user. It is shown only once.", res.password);
                else toast(res.message, "success");
                reload();
            }),
            act("Sign out everywhere", async () => { toast((await api.post(`${path}/logout`)).message, "success"); reload(); }),
            act("View chats", async () => { modal.close(); ctx.navigate("chats", { email: user.email }); }),
            act("Export data", () => downloadFromApi(`${path}/export`, `user-${user.email}.json`)),
            user.is_banned
                ? act("Unban", async () => { await api.post(`${path}/ban`, { banned: false }); toast("Unbanned.", "success"); reload(); load(); })
                : act("Ban", async () => {
                    const reason = await promptDialog({ title: `Ban ${user.name}`, label: "Reason (shown to the user)", required: false, confirmLabel: "Ban user" });
                    if (reason === null) return;
                    await api.post(`${path}/ban`, { banned: true, reason });
                    toast("Banned and signed out.", "success"); reload(); load();
                }, { danger: true }),
            act("Delete user", async () => {
                const typed = await promptDialog({ title: "Delete user forever", label: `Type ${user.email} to confirm. All their data is erased.`, confirmLabel: "Delete" });
                if (typed === null) return;
                if (typed.toLowerCase() !== user.email) return toast("Email didn't match - nothing deleted.", "error");
                await api.del(path);
                modal.close(); toast("User deleted.", "success"); load();
            }, { danger: true }),
        ];

        const kv = (pairs) => h("dl", { class: "kv" }, pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));

        clear(modal.body).append(
            h("div", { class: "row static" }, avatar(user.name), h("div", { class: "grow" },
                h("div", { class: "title" }, user.name, user.is_admin && badge("ADMIN", "admin"), user.is_banned && badge("BANNED", "bad")),
                h("div", { class: "meta" }, user.email))),
            user.is_banned && h("div", { class: "banner banner-danger" }, icon("fa-solid fa-ban"), h("span", {}, `Banned${user.ban_reason ? `: ${user.ban_reason}` : "."}`)),
            kv([
                ["Joined", formatDateTime(user.created_at)],
                ["Last login", formatDateTime(user.last_login_at)],
                ["Chats", `${user.chat_sessions} conversation(s)`],
                ["Support msgs", String(user.support_messages)],
                ["Push devices", String(user.push_devices)],
            ]),
            h("div", { class: "btn-row" }, actions),
            h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-pen"), "Edit"),
                field("Name", nameIn), field("Address", addressIn), field("Admin note", noteIn), saveEdits),
            h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-laptop"), `Active sessions (${user.sessions.length})`),
                user.sessions.length ? h("div", { class: "list" }, user.sessions.map((s) =>
                    h("div", { class: "row static" }, h("div", { class: "grow" },
                        h("div", { class: "title" }, s.ip || "unknown IP", s.impersonated_by && badge(`by ${s.impersonated_by}`, "warn")),
                        h("div", { class: "meta" }, `${(s.user_agent || "").slice(0, 90)} · seen ${timeAgo(s.last_seen)}`)),
                        act("Revoke", async () => { await api.del(`/api/admin/sessions/${s.id}`); reload(); }, { danger: true }))))
                    : empty("No active sessions.")),
            h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-clock-rotate-left"), "Recent logins"),
                user.recent_logins.length ? user.recent_logins.map((l) =>
                    h("div", { class: "log-line" }, badge(l.success ? "OK" : "FAIL", l.success ? "good" : "bad"),
                        h("div", { class: "grow" }, `${l.ip || "?"}${l.note ? ` · ${l.note}` : ""}`), h("time", {}, formatDateTime(l.timestamp))))
                    : empty("No logins yet.")));
    }

    root.append(h("div", { class: "toolbar" }, search, filter, addBtn), listBox, pagerBox);
    load();
    if (params.get("open")) openUser(params.get("open"));
}
