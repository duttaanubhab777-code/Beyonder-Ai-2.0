import { api } from "../core/api.js";
import { clear, formatBytes, h, icon } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { badge, busy, confirmDialog, downloadFromApi, errorBox, field, loading, promptDialog } from "./ui.js";

const KILL_PHRASE = "DELETE EVERYTHING";

export function render(root) {
    root.append(loading());

    async function load() {
        try {
            const [{ settings }, info] = await Promise.all([api.get("/api/admin/settings"), api.get("/api/admin/system/info")]);
            clear(root).append(appSettings(settings), systemInfo(info), maintenanceTools(info), dangerZone(info));
        } catch (err) {
            clear(root).append(errorBox(err));
        }
    }

    function appSettings(s) {
        const registration = h("input", { type: "checkbox", checked: s.registration_open === "1" });
        const maintenance = h("input", { type: "checkbox", checked: s.maintenance_mode === "1" });
        const maintenanceMsg = h("input", { class: "input", value: s.maintenance_message, maxLength: 300 });
        const announcement = h("input", { class: "input", value: s.announcement, maxLength: 300, placeholder: "Shown as a banner to every user (empty = none)" });
        const level = h("select", { class: "select" },
            h("option", { value: "info" }, "Info (blue)"), h("option", { value: "success" }, "Success (green)"), h("option", { value: "warning" }, "Warning (orange)"));
        level.value = s.announcement_level;
        const save = h("button", { class: "btn primary", type: "button" }, icon("fa-solid fa-floppy-disk"), "Save settings");

        save.addEventListener("click", () => busy(save, async () => {
            try {
                await api.post("/api/admin/settings", {
                    registration_open: registration.checked, maintenance_mode: maintenance.checked,
                    maintenance_message: maintenanceMsg.value, announcement: announcement.value, announcement_level: level.value,
                });
                toast("Settings saved.", "success");
            } catch (err) { toastError(err); }
        }));

        return h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-sliders"), "App settings"),
            h("label", { class: "switch" }, h("span", {}, "Allow new sign-ups"), registration),
            h("label", { class: "switch" }, h("span", {}, "Maintenance mode (only admins can use the app)"), maintenance),
            field("Maintenance message", maintenanceMsg),
            field("Announcement banner", announcement), field("Banner colour", level), save);
    }

    function systemInfo(i) {
        const kv = (pairs) => h("dl", { class: "kv" }, pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
        const yes = (ok) => badge(ok ? "READY" : "NOT SET", ok ? "good" : "warn");
        return h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-server"), "System"),
            kv([
                ["Database", `${formatBytes(i.db_size_bytes)}`],
                ["Python", i.python], ["Server time", i.server_time],
                ["E-mail (OTP)", yes(i.mail_configured)], ["Push notifications", yes(i.push_configured)],
                ["Push devices", String(i.push_devices)], ["Auto-deploy webhook", yes(i.webhook_enabled)],
                ["Admins", i.admins.join(", ") || "none"],
                ["Rows", Object.entries(i.tables).map(([t, n]) => `${t}: ${n}`).join("  ·  ")],
            ]));
    }

    function maintenanceTools() {
        const act = (label, iconClass, fn) => {
            const button = h("button", { class: "btn", type: "button" }, icon(iconClass), label);
            button.addEventListener("click", () => busy(button, async () => { try { await fn(); } catch (err) { toastError(err); } }));
            return button;
        };
        return h("div", { class: "card" }, h("h3", {}, icon("fa-solid fa-screwdriver-wrench"), "Database tools"),
            h("div", { class: "btn-row" },
                act("Download backup", "fa-solid fa-download", async () => {
                    await downloadFromApi("/api/admin/system/backup", "beyonder-backup.db");
                    toast("Backup downloaded.", "success");
                }),
                act("Compact database", "fa-solid fa-compress", async () => { toast((await api.post("/api/admin/system/vacuum")).message, "success"); load(); }),
                act("Delete old data", "fa-regular fa-calendar-xmark", async () => {
                    const days = await promptDialog({ title: "Delete old data", label: "Remove chats, support messages and logs older than this many days:", value: "180", confirmLabel: "Delete" });
                    if (!days) return;
                    if (!(await confirmDialog(`Permanently delete everything older than ${days} days?`, { danger: true, confirmLabel: "Delete" }))) return;
                    const res = await api.post("/api/admin/system/purge", { days: Number(days) });
                    toast(`Removed ${Object.values(res.deleted).filter((v) => typeof v === "number").slice(0, 4).reduce((a, b) => a + b, 0)} rows.`, "success");
                    load();
                })));
    }

    function dangerZone(i) {
        const card = h("div", { class: "card danger-zone" }, h("h3", {}, icon("fa-solid fa-skull-crossbones"), "Danger zone"));
        if (!i.kill_switch_enabled) {
            card.append(h("p", { class: "sub" }, "The kill switch is turned off. Set KILL_SWITCH_PASSWORD in backend/config.py to enable it."));
            return card;
        }
        const phrase = h("input", { class: "input", placeholder: `Type: ${KILL_PHRASE}` });
        const password = h("input", { class: "input", type: "password", placeholder: "Kill-switch password" });
        const wipe = h("button", { class: "btn danger solid", type: "button" }, icon("fa-solid fa-bomb"), "Erase all data");
        wipe.addEventListener("click", () => busy(wipe, async () => {
            if (!(await confirmDialog("This deletes EVERY account, chat, log and session. There is no undo (download a backup first).", { danger: true, confirmLabel: "Erase everything" }))) return;
            try {
                toast((await api.post("/api/admin/system/kill-switch", { confirm_text: phrase.value, password: password.value })).message, "success");
                setTimeout(() => window.location.reload(), 1200);
            } catch (err) { toastError(err); }
        }));
        card.append(h("p", { class: "sub" }, "Erase the entire database (users, chats, tokens). Requires the master password from config.py."), field("Confirmation phrase", phrase), field("Master password", password), wipe);
        return card;
    }

    load();
}
