import { api } from "../core/api.js";
import { clear, h, icon, timeAgo } from "../core/dom.js";
import { avatar, empty, errorBox, loading, statCard } from "./ui.js";

function barChart(title, iconClass, series) {
    const max = Math.max(1, ...series.map((p) => p.count));
    return h("div", { class: "card" },
        h("h3", {}, icon(iconClass), title),
        h("div", { class: "bars" }, series.map((point) =>
            h("div", { class: "bar", title: `${point.date}: ${point.count}` },
                h("em", {}, point.count || ""),
                h("i", { style: { height: `${Math.max(2, (point.count / max) * 82)}%` } }),
                h("small", {}, point.date.slice(8))))));
}

function paint(root, data) {
    const s = data.stats;
    clear(root).append(
        h("div", { class: "stat-grid" },
            statCard("Users", s.users_total),
            statCard("Online now", data.online_count, "good"),
            statCard("New (24h)", s.users_new_24h),
            statCard("New (7 days)", s.users_new_7d),
            statCard("AI messages", s.messages_total),
            statCard("Messages (24h)", s.messages_24h),
            statCard("Active sessions", s.active_sessions),
            statCard("Push devices", s.push_devices),
            statCard("Banned users", s.users_banned, s.users_banned ? "warn" : ""),
            statCard("Failed logins (24h)", s.failed_logins_24h, s.failed_logins_24h > 10 ? "bad" : ""),
            statCard("Unread support", data.support_unread, data.support_unread ? "warn" : "")),
        data.settings.maintenance_mode === "1" && h("div", { class: "banner banner-warning" }, icon("fa-solid fa-screwdriver-wrench"), h("span", {}, "Maintenance mode is ON - only admins can use the app.")),
        h("div", { class: "card" },
            h("h3", {}, icon("fa-solid fa-circle"), `Online now (${data.online_count})`),
            data.online_users.length
                ? h("div", { class: "list" }, data.online_users.map((u) =>
                    h("div", { class: "row static" }, avatar(u.name), h("div", { class: "grow" },
                        h("div", { class: "title" }, u.name), h("div", { class: "meta" }, `${u.email} · seen ${timeAgo(u.last_seen)}`)), h("span", { class: "dot" }))))
                : empty("Nobody is online right now.")),
        barChart("New sign-ups (14 days)", "fa-solid fa-user-plus", s.signups_series),
        barChart("AI messages (14 days)", "fa-solid fa-comments", s.messages_series));
}

export function render(root) {
    let timer;
    let first = true;
    root.append(loading());

    const load = async () => {
        if (document.hidden && !first) return;
        try {
            paint(root, await api.get("/api/admin/overview"));
        } catch (err) {
            if (first) clear(root).append(errorBox(err));
        }
        first = false;
    };
    load();
    timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
}
