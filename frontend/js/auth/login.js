/* Entry point of login.html: login, signup (e-mail OTP), forgot / reset password. */
import { api } from "../core/api.js";
import { goTo, homeFor } from "../core/auth.js";
import { applyPublicConfig, loadPublicConfig } from "../core/banner.js";
import { $,$$ } from "../core/dom.js";
import { getToken, setToken, storage } from "../core/storage.js";
import { initTheme } from "../core/theme.js";
import { registerServiceWorker } from "../pwa/register.js";

const SCREENS = ["login-screen", "signup-screen", "otp-screen", "forgot-screen", "reset-screen"];
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let pendingSignupEmail = "";
let pendingResetEmail = "";

/* ---------------- tiny UI helpers ---------------- */
function showError(id, message) {
    const box = $(`#${id}`);
    box.textContent = message;
    box.style.display = "block";
}
const hideError = (id) => { $(`#${id}`).style.display = "none"; };
const clearAllErrors = () => $$(".auth-error").forEach((box) => { box.style.display = "none"; });

function switchScreen(target) {
    clearAllErrors();
    for (const id of SCREENS) $(`#${id}`).classList.toggle("active", id === target);
    $(`#${target} input:not([type=hidden])`)?.focus();
}

function setLoading(button, loading, loadingText) {
    const label = button.querySelector(".btn-text");
    if (loading) {
        button.dataset.label = label.textContent;
        label.textContent = loadingText;
        button.prepend(Object.assign(document.createElement("i"), { className: "fa-solid fa-spinner" }));
        button.disabled = true;
    } else {
        label.textContent = button.dataset.label || label.textContent;
        button.querySelector(".fa-spinner")?.remove();
        button.disabled = false;
    }
}

async function withButton(button, loadingText, errorId, task) {
    hideError(errorId);
    setLoading(button, true, loadingText);
    try {
        await task();
    } catch (err) {
        showError(errorId, err.message);
    } finally {
        setLoading(button, false);
    }
}

/* ---------------- password eye + strength meter ---------------- */
function initPasswordToggles() {
    for (const toggle of $$(".toggle-pass")) {
        toggle.addEventListener("click", () => {
            const input = $(`#${toggle.dataset.target}`);
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            toggle.querySelector("i").className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
        });
    }
}

const STRENGTH = [
    { color: "#d93025", label: "Too weak" },
    { color: "#f57c00", label: "Weak" },
    { color: "#f9a825", label: "Okay" },
    { color: "#43a047", label: "Strong" },
    { color: "#00bcd4", label: "Very strong" },
];

function attachStrengthMeter(inputId, fillId, labelId) {
    $(`#${inputId}`).addEventListener("input", (event) => {
        const value = event.target.value;
        let score = 0;
        if (value.length >= MIN_PASSWORD) score++;
        if (/[A-Z]/.test(value)) score++;
        if (/\d/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;
        const level = value ? STRENGTH[score] : { color: "#d93025", label: "Password strength" };
        const fill = $(`#${fillId}`);
        fill.style.width = value ? `${Math.max(1, score) * 25}%` : "0%";
        fill.style.background = level.color;
        $(`#${labelId}`).textContent = level.label;
    });
}

/* ---------------- resend countdown (one timer per screen) ---------------- */
const timers = {};

function startResendTimer(context, seconds, buttonId, timerId) {
    clearInterval(timers[context]);
    const button = $(`#${buttonId}`);
    const label = $(`#${timerId}`);
    let left = Math.max(1, Math.round(seconds || 60));

    const paint = () => {
        const waiting = left > 0;
        button.setAttribute("aria-disabled", String(waiting));
        label.textContent = waiting ? `(${left}s)` : "";
    };
    paint();
    timers[context] = setInterval(() => {
        left -= 1;
        paint();
        if (left <= 0) clearInterval(timers[context]);
    }, 1000);
}

const canResend = (buttonId) => $(`#${buttonId}`).getAttribute("aria-disabled") !== "true";

/* ---------------- API calls ---------------- */
const post = (path, body) => api.post(path, body, { auth: false });

function saveSession(data) {
    setToken(data.token);
    storage.set(storage.KEY.returning, "1");
    goTo(homeFor(data));
}

/* ---------------- forms ---------------- */
function initLogin() {
    $("#login-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const email = $("#login-email").value.trim().toLowerCase();
        const password = $("#login-password").value;
        if (!EMAIL_RE.test(email)) return showError("login-error", "Please enter a valid email address.");
        if (!password) return showError("login-error", "Please enter your password.");

        withButton($("#login-submit-btn"), "Logging in...", "login-error", async () => {
            try {
                saveSession(await post("/api/login", { email, password }));
            } catch (err) {
                $("#login-password").value = "";
                throw err;
            }
        });
    });
}

function initSignup() {
    $("#signup-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const name = $("#signup-name").value.trim();
        const email = $("#signup-email").value.trim().toLowerCase();
        const password = $("#signup-password").value;
        if (!name || !email || !password) return showError("signup-error", "Please fill in all fields.");
        if (!EMAIL_RE.test(email)) return showError("signup-error", "Please enter a valid email address.");
        if (password.length < MIN_PASSWORD) return showError("signup-error", `Password must be at least ${MIN_PASSWORD} characters.`);

        withButton($("#signup-submit-btn"), "Sending code...", "signup-error", async () => {
            const data = await post("/api/signup/send-otp", { name, email, password });
            pendingSignupEmail = email;
            $("#otp-success-msg").style.display = "block";
            startResendTimer("signup", data.resend_after, "otp-resend-btn", "otp-timer");
            switchScreen("otp-screen");
        });
    });

    $("#otp-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const otp = $("#otp-input").value.trim();
        if (!/^\d{6}$/.test(otp)) return showError("otp-error", "Enter the 6-digit code.");
        withButton($("#otp-submit-btn"), "Verifying...", "otp-error", async () => {
            saveSession(await post("/api/signup/verify-otp", { email: pendingSignupEmail, otp }));
        });
    });

    $("#otp-resend-btn").addEventListener("click", async () => {
        if (!pendingSignupEmail || !canResend("otp-resend-btn")) return;
        const name = $("#signup-name").value.trim();
        const password = $("#signup-password").value;
        hideError("otp-error");
        try {
            const data = await post("/api/signup/send-otp", { name, email: pendingSignupEmail, password });
            startResendTimer("signup", data.resend_after, "otp-resend-btn", "otp-timer");
        } catch (err) {
            showError("otp-error", err.message);
        }
    });
}

function initReset() {
    $("#forgot-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const email = $("#forgot-email").value.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) return showError("forgot-error", "Please enter a valid email address.");

        withButton($("#forgot-submit-btn"), "Sending code...", "forgot-error", async () => {
            const data = await post("/api/forgot-password/send-otp", { email });
            pendingResetEmail = email;
            startResendTimer("reset", data.resend_after, "reset-resend-btn", "reset-timer");
            switchScreen("reset-screen");
        });
    });

    $("#reset-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const otp = $("#reset-otp").value.trim();
        const newPassword = $("#reset-new-password").value;
        if (!/^\d{6}$/.test(otp)) return showError("reset-error", "Enter the 6-digit code.");
        if (newPassword.length < MIN_PASSWORD) return showError("reset-error", `Password must be at least ${MIN_PASSWORD} characters.`);

        withButton($("#reset-submit-btn"), "Updating...", "reset-error", async () => {
            await post("/api/forgot-password/reset", { email: pendingResetEmail, otp, new_password: newPassword });
            $("#login-email").value = pendingResetEmail;
            $("#login-password").value = "";
            switchScreen("login-screen");
        });
    });

    $("#reset-resend-btn").addEventListener("click", async () => {
        if (!pendingResetEmail || !canResend("reset-resend-btn")) return;
        hideError("reset-error");
        try {
            const data = await post("/api/forgot-password/send-otp", { email: pendingResetEmail });
            startResendTimer("reset", data.resend_after, "reset-resend-btn", "reset-timer");
        } catch (err) {
            showError("reset-error", err.message);
        }
    });
}

/* ---------------- start ---------------- */
async function boot() {
    initTheme($("#theme-toggle-btn")); registerServiceWorker();      for (const trigger of $$("[data-switch]")) {
        trigger.addEventListener("click", () => switchScreen(trigger.dataset.switch));
    }
    initPasswordToggles();
    attachStrengthMeter("signup-password", "strength-fill", "strength-label");
    attachStrengthMeter("reset-new-password", "reset-strength-fill", "reset-strength-label");
    initLogin();
    initSignup();
    initReset();

    if (getToken()) {
        try {
            const me = await api.get("/api/me");
            if (me.logged_in) return goTo(homeFor(me));
        } catch { }
    }

    const config = await loadPublicConfig();
    applyPublicConfig(config, $(".auth-page-wrapper")); if (config && config.registration_open === false) { for (const trigger of $$('[data-switch="signup-screen"]')) trigger.closest(".auth-switch").style.display = "none";
    }
}

boot();
