import { api } from "../core/api.js";
import { h, icon } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { busy, confirmDialog, field } from "./ui.js";

export function render(root) {
    const message = h("textarea", { class: "textarea", placeholder: "Write a message for your users...", maxLength: 4000 });
    const audience = h("select", { class: "select" },
        h("option", { value: "all" }, "Everyone"), h("option", { value: "online" }, "Only users online right now"));
    const push = h("input", { type: "checkbox", checked: true });
    const send = h("button", { class: "btn primary", type: "button" }, icon("fa-solid fa-paper-plane"), "Send broadcast");

    send.addEventListener("click", () => busy(send, async () => {
        const text = message.value.trim();
        if (!text) return toast("Write a message first.", "error");
        const who = audience.value === "online" ? "everyone who is online now" : "ALL users";
        if (!(await confirmDialog(`Send this message to ${who}?`, { confirmLabel: "Send" }))) return;
        try {
            const res = await api.post("/api/admin/broadcast", { message: text, audience: audience.value, push: push.checked });
            toast(`${res.message} (${res.pushed} push notifications)`, "success");
            message.value = "";
        } catch (err) { toastError(err); }
    }));

    root.append(h("div", { class: "card" },
        h("h3", {}, icon("fa-solid fa-bullhorn"), "Broadcast"),
        h("p", { class: "sub" }, "Appears in each user's chat like a normal reply, and can also pop up as a phone notification."),
        field("Message", message), field("Audience", audience),
        h("label", { class: "switch" }, h("span", {}, "Also send a push notification"), push),
        send));
}
