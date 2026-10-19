/* Profile settings modal (name, address, photo, password, sign-out-everywhere, delete account). */
import { api } from "../core/api.js";
import { $, clear, colorForName, h, initialOf } from "../core/dom.js";
import { toast, toastError } from "../core/toast.js";
import { logout } from "../core/auth.js";
import { state } from "./state.js";

let pendingAvatar = null;

function drawAvatar(el, avatar, name) {
    clear(el);
    el.style.background = "";
    if (avatar) {
        el.append(h("img", { src: avatar, alt: "" }));
    } else if (name) {
        el.style.background = colorForName(name);
        el.textContent = initialOf(name);
    } else {
        el.append(h("i", { class: "fa-solid fa-user" }));
    }
}

const paintNav = () => drawAvatar($("#nav-avatar"), state.profile.avatar, state.profile.name);

function setStatus(el, message = "", kind = "") {
    el.textContent = message;
    el.className = `modal-status ${kind}`.trim();
}

function resizeImage(file, size = 256) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = size;
            const side = Math.min(img.width, img.height);
            canvas.getContext("2d").drawImage(
                img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
        img.src = url;
    });
}

export async function loadProfile() {
    try {
        const data = await api.get("/api/profile");
        Object.assign(state.profile, {
            name: data.name || "", address: data.address || "", email: data.email || "",
            avatar: data.avatar || null, isAdmin: !!data.is_admin,
        });
    } catch (err) {
        console.warn("Could not load profile:", err.message);
    }
    paintNav();
}

function openModal() {
    pendingAvatar = null;
    $("#profile-name-input").value = state.profile.name;
    $("#profile-address-input").value = state.profile.address;
    $("#profile-email-display").value = state.profile.email;
    $("#current-password-input").value = "";
    $("#new-password-input").value = "";
    $("#delete-password-input").value = "";
    for (const id of ["profile-save-status", "password-save-status", "delete-status"]) setStatus($(`#${id}`));
    drawAvatar($("#avatar-preview"), state.profile.avatar, state.profile.name);
    $("#profile-modal").hidden = false;
}

const closeModal = () => { $("#profile-modal").hidden = true; };

async function saveProfile() {
    const status = $("#profile-save-status");
    const name = $("#profile-name-input").value.trim();
    if (!name) return setStatus(status, "Name can't be empty.", "error");

    const body = { name, address: $("#profile-address-input").value.trim() };
    if (pendingAvatar) body.avatar = pendingAvatar;

    setStatus(status, "Saving…");
    try {
        await api.post("/api/profile/update", body);
        state.profile.name = name;
        state.profile.address = body.address;
        if (pendingAvatar) state.profile.avatar = pendingAvatar;
        pendingAvatar = null;
        paintNav();
        setStatus(status, "Saved!", "success");
    } catch (err) {
        setStatus(status, err.message, "error");
    }
}

async function changePassword() {
    const status = $("#password-save-status");
    const current = $("#current-password-input").value;
    const next = $("#new-password-input").value;
    if (!current || !next) return setStatus(status, "Fill in both password fields.", "error");
    if (next.length < 8) return setStatus(status, "New password must be at least 8 characters.", "error");

    setStatus(status, "Updating…");
    try {
        await api.post("/api/profile/change-password", { current_password: current, new_password: next });
        $("#current-password-input").value = "";
        $("#new-password-input").value = "";
        setStatus(status, "Password updated. Other devices were signed out.", "success");
    } catch (err) {
        setStatus(status, err.message, "error");
    }
}

async function signOutOthers() {
    try {
        const data = await api.post("/api/logout-all");
        toast(data.message || "Done.", "success");
    } catch (err) {
        toastError(err);
    }
}

async function deleteAccount() {
    const status = $("#delete-status");
    const password = $("#delete-password-input").value;
    if (!password) return setStatus(status, "Enter your password to confirm.", "error");
    if (!window.confirm("Delete your account and ALL your chats forever? This can't be undone.")) return;
    try {
        await api.post("/api/profile/delete-account", { password });
        await logout();
    } catch (err) {
        setStatus(status, err.message, "error");
    }
}

export function initProfileModal() {
    $("#profile-btn").addEventListener("click", openModal);
    $("#profile-modal-close").addEventListener("click", closeModal);
    $("#profile-modal").addEventListener("click", (event) => {
        if (event.target.id === "profile-modal") closeModal();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !$("#profile-modal").hidden) closeModal();
    });

    $("#avatar-upload-btn").addEventListener("click", () => $("#avatar-file-input").click());
    $("#avatar-file-input").addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            pendingAvatar = await resizeImage(file);
            drawAvatar($("#avatar-preview"), pendingAvatar, "");
            setStatus($("#profile-save-status"), "Photo ready - tap Save changes.");
        } catch (err) {
            setStatus($("#profile-save-status"), err.message, "error");
        }
    });

    $("#profile-save-btn").addEventListener("click", saveProfile);
    $("#password-save-btn").addEventListener("click", changePassword);
    $("#logout-all-btn").addEventListener("click", signOutOthers);
    $("#delete-account-btn").addEventListener("click", deleteAccount);
}
