/* =========================================================
   ADMIN "LOGIN AS USER" HAND-OFF
   If this page was opened with ?admin_token=... (generated from the admin
   dashboard's "Login As" button), adopt that token as this browser's own
   session, then scrub it out of the visible URL so it doesn't linger in
   browser history or get shared by accident.
   ========================================================= */
(() => {
    const params = new URLSearchParams(window.location.search);
    const adminToken = params.get("admin_token");
    if (adminToken) {
        localStorage.setItem("beyonder_token", adminToken);
        params.delete("admin_token");
        const rest = params.toString();
        const cleanUrl = window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
    }
})();

/* =========================================================
   THEME (dark / light) — persisted + follows system default
   ========================================================= */
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIcon = themeToggleBtn.querySelector("i");

const applyTheme = (theme) => {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        themeIcon.className = "fa-solid fa-sun";
    } else {
        document.documentElement.removeAttribute("data-theme");
        themeIcon.className = "fa-solid fa-moon";
    }
    localStorage.setItem("beyonder-theme", theme);
};

const savedTheme = localStorage.getItem("beyonder-theme");
const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
applyTheme(savedTheme || (systemPrefersLight ? "light" : "dark"));

themeToggleBtn.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    applyTheme(isLight ? "dark" : "light");
});

/* =========================================================
   SIDEBAR MENU LOGIC
   ========================================================= */
const menuBtn = document.getElementById("menu-btn");
const closeSidebarBtn = document.getElementById("close-sidebar-btn");
const sidebarMenu = document.getElementById("sidebar-menu");
const sidebarOverlay = document.getElementById("sidebar-overlay");

const openSidebar = () => {
    sidebarOverlay.hidden = false;
    setTimeout(() => {
        sidebarOverlay.classList.add("active");
        sidebarMenu.classList.add("open");
    }, 10);
};

const closeSidebar = () => {
    sidebarOverlay.classList.remove("active");
    sidebarMenu.classList.remove("open");
    setTimeout(() => { sidebarOverlay.hidden = true; }, 300);
};

if (menuBtn) menuBtn.addEventListener("click", openSidebar);
if (closeSidebarBtn) closeSidebarBtn.addEventListener("click", closeSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

    // Clicking any option automatically closes the menu
document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
        if(item.id !== 'theme-toggle-btn') {
            closeSidebar();
        }
    });
});



/* =========================================================
   PWA: INSTALL BUTTON
   The install icon (top of the nav) only appears once the browser
   confirms the app is actually installable. Once installed and
   opened as a standalone app, login still works exactly the same
   way as in the browser: the auth token in localStorage is what
   keeps the user logged in, so there's nothing extra to "carry
   over" — installing just gives it its own icon/window.

   Service worker registration + the "new version available" popup
   both live in pwa-update.js (shared with login.html) — see that
   file for details.
   ========================================================= */
const installBtn = document.getElementById("install-btn");
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
    installBtn.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        installBtn.hidden = true;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
    });
}

window.addEventListener("appinstalled", () => {
    if (installBtn) installBtn.hidden = true;
    deferredInstallPrompt = null;
});


/* =========================================================
   CODE-BLOCK COPY BUTTONS
   ========================================================= */
const addCodeCopyButtons = (container) => {
    container.querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".code-copy-btn")) return; // already added
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = "Copy";
        btn.addEventListener("click", () => {
            const code = pre.querySelector("code");
            navigator.clipboard.writeText(code ? code.innerText : pre.innerText).then(() => {
                btn.textContent = "Copied";
                setTimeout(() => { btn.textContent = "Copy"; }, 1200);
            });
        });
        pre.appendChild(btn);
    });
};


/* =========================================================
   TYPEWRITER EFFECT
   ========================================================= */
const typeWriterEffect = (element, htmlText, parentDiv) => {
    let plainText = htmlText;
    let i = 0;
    element.innerHTML = "";

    const typeNextChar = () => {
        if (i < plainText.length) {
            const currentSlice = plainText.slice(0, i + 1);
            const parsedHtml = marked.parse(currentSlice + " @@CURSOR@@");
            element.innerHTML = parsedHtml.replace(
                "@@CURSOR@@",
                `<span class="typing-cursor">&nbsp;</span>`
            );

            chat.scrollTop = chat.scrollHeight;

            const char = plainText[i];
            i++;

            let delay = 15 + Math.random() * 25;
            if (".,!?।".includes(char)) delay += 150;

            setTimeout(typeNextChar, delay);
        } else {
            element.innerHTML = marked.parse(plainText);
            renderMathInElement(element, {
                delimiters: [
                    { left: "$$", right: "$$", display: true },
                    { left: "$", right: "$", display: false }
                ]
            });
            addCodeCopyButtons(element);

            // After typing finishes, add a copy button below the bubble
            const copyBtn = document.createElement("button");
            copyBtn.classList.add("copy-btn-outside");
            copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(plainText).then(() => {
                    copyBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
                    setTimeout(() => {
                        copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
                    }, 1500);
                });
            });
            parentDiv.insertAdjacentElement("afterend", copyBtn);
            chat.scrollTop = chat.scrollHeight;
        }
    };

    typeNextChar();
};

// Instant (non-typewriter) render — used when restoring saved history
const renderInstant = (element, plainText, parentDiv) => {
    element.innerHTML = marked.parse(plainText);
    renderMathInElement(element, {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
        ]
    });
    addCodeCopyButtons(element);

    const copyBtn = document.createElement("button");
    copyBtn.classList.add("copy-btn-outside");
    copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(plainText).then(() => {
            copyBtn.innerHTML = `<i class="fa-solid fa-check"></i>`;
            setTimeout(() => {
                copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i>`;
            }, 1500);
        });
    });
    parentDiv.insertAdjacentElement("afterend", copyBtn);
};


const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");

const input = document.getElementById("user-input");
input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + "px";
});

const chat = document.getElementById("chat-area");

const WELCOME_MESSAGE = "Hello, I am Beyonder. How can I help you?";
const STORAGE_KEY = "beyonder-chat-history";

/* =========================================================
   WELCOME HERO — shown instead of a single chat bubble when
   there's no conversation yet. Tapping a chip fills the composer
   and sends it right away, giving a new visitor something inviting
   to try instead of a blank input box.
   ========================================================= */
const SUGGESTION_CHIPS = [
    { icon: "fa-lightbulb", text: "Explain a tricky topic in simple terms" },
    { icon: "fa-code", text: "Help me find a bug in my code" },
    { icon: "fa-pen-nib", text: "Write a short creative story for me" },
    { icon: "fa-route", text: "Plan a weekend trip for me" }
];

const showWelcomeHero = () => {
    chat.innerHTML = "";
    const hero = document.createElement("div");
    hero.className = "chat-hero";
    hero.innerHTML = `
        <div class="chat-hero-logo"><i class="fa-solid fa-atom"></i></div>
        <h2>Hi, I'm Beyonder AI</h2>
        <p>${WELCOME_MESSAGE}</p>
        <div class="chat-hero-chips">
            ${SUGGESTION_CHIPS.map((c) => `
                <button type="button" class="chip" data-prompt="${c.text.replace(/"/g, "&quot;")}">
                    <i class="fa-solid ${c.icon}"></i><span>${c.text}</span>
                </button>
            `).join("")}
        </div>
    `;
    chat.appendChild(hero);
    hero.querySelectorAll(".chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            input.value = btn.dataset.prompt;
            handleSend();
        });
    });
};

// All Beyonder backend (PythonAnywhere) calls go through this one constant —
// previously the same URL was hardcoded in four separate places, which made
// it easy for them to drift out of sync during future edits.
const BACKEND_BASE = "https://anubhabdutta.pythonanywhere.com";

const checkAuth = async () => {
    const token = localStorage.getItem("beyonder_token");
    if (!token) {
        window.location.href = "login.html";
        return false;
    }
    try {
        const res = await fetch(`${BACKEND_BASE}/api/me`, {
            headers: {
                "Authorization": token // sending the token
            }
        });
        const data = await res.json();
        if (!data.logged_in) {
            window.location.href = "login.html";
            return false;
        }
        return true;
    } catch (e) {
        window.location.href = "login.html";
        return false;
    }
};




let chatHistory = [];

// Filled in once /api/profile responds (see the init block below). Only
// ever contains what the user actually put on their profile — address is
// effectively opt-in since it stays blank unless they choose to add one.
const currentUserProfile = { name: "", address: "" };

const API_URL = "https://beyonder-api.vercel.app/api/chat";


// Link for saving chats to the Python (Flask) server
const DB_API_URL = `${BACKEND_BASE}/api/save-chat`;

// Endpoint for checking messages sent directly from the admin panel (new)
const CHECK_MESSAGES_URL = `${BACKEND_BASE}/api/check-messages`;
const ADMIN_MSG_ID_KEY = "beyonder-last-admin-msg-id";


// Function for sending data to the Python server (with Token)
const saveToFriendDatabase = async (userText, aiText) => {
    const token = localStorage.getItem("beyonder_token");
    try {
        const response = await fetch(DB_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token // sending the token
            },
            body: JSON.stringify({
                user_message: userText,
                ai_response: aiText
            })
        });

        const result = await response.json();
        console.log("Database Response:", result);
    } catch (error) {
        console.error("Could not connect to the database:", error);
    }
};


/* =========================================================
   LOGOUT FUNCTION
   ========================================================= */
const logoutUser = () => {
    const token = localStorage.getItem("beyonder_token");

    // Stop push notifications from following this device past logout —
    // otherwise, until someone else logs in and re-subscribes, this
    // browser would keep getting notified about messages meant for the
    // account that just logged out.
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
            .then((registration) => registration.pushManager.getSubscription())
            .then((subscription) => {
                if (!subscription) return;
                fetch(`${BACKEND_BASE}/api/push/unsubscribe`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": token },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                }).finally(() => subscription.unsubscribe());
            })
            .catch(() => {});
    }

    // Clear browser storage
    localStorage.removeItem(STORAGE_KEY); 
    localStorage.removeItem("beyonder_token"); 
    localStorage.removeItem(ADMIN_MSG_ID_KEY);
    
    // Log out from the server
    fetch(`${BACKEND_BASE}/api/logout`, {
        method: "POST",
        headers: {
            "Authorization": token
        }
    }).finally(() => {
        window.location.href = "login.html"; // your login page's filename
    });
};


        




/* =========================================================
   MESSAGE RENDERING
   ========================================================= */
const appendMessage = (text, type, { animate = true } = {}) => {
    // If the welcome hero is still showing, clear it out first — once a
    // real message (from the user, the AI, or an admin) arrives, the
    // hero's job is done.
    const hero = chat.querySelector(".chat-hero");
    if (hero) hero.remove();

    const newChatDiv = document.createElement("div");

    if (type === "incoming") {
        newChatDiv.classList.add("message", "incoming");
        newChatDiv.innerHTML = `
            <div class="msg-logo">
                <i class="fa-solid fa-atom"></i>
            </div>
            <div class="msg-text"></div>
        `;
        chat.appendChild(newChatDiv);
        const textDiv = newChatDiv.querySelector(".msg-text");
        if (animate) {
            typeWriterEffect(textDiv, text, newChatDiv);
        } else {
            renderInstant(textDiv, text, newChatDiv);
        }
        return;
    }

    newChatDiv.classList.add("message", "outgoing");
    newChatDiv.innerHTML = `<p></p>`;
    newChatDiv.querySelector("p").textContent = text;

    chat.appendChild(newChatDiv);
    chat.scrollTop = chat.scrollHeight;
};

const showTypingIndicator = () => {
    const typingDiv = document.createElement("div");
    typingDiv.classList.add("message", "incoming");
    typingDiv.id = "typing-indicator";
    typingDiv.innerHTML = `
        <div class="msg-logo">
            <i class="fa-solid fa-atom"></i>
        </div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
    `;
    chat.appendChild(typingDiv);
    chat.scrollTop = chat.scrollHeight;
};

const removeTypingIndicator = () => {
    const typingIndicator = document.getElementById("typing-indicator");
    if (typingIndicator) {
        typingIndicator.remove();
    }
};


/* =========================================================
   PERSISTENCE — chat survives a page refresh
   ========================================================= */
const saveHistory = () => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (e) {
        console.warn("Could not save chat history:", e);
    }
};

const CHAT_HISTORY_URL = `${BACKEND_BASE}/api/chat-history`;

const loadHistory = async () => {
    chat.innerHTML = "";

    // Source of truth is now our own database (via /api/chat-history), not
    // just this one browser's localStorage — that's what lets a user open
    // Beyonder AI on a different device, or after clearing their browser
    // data, and still have the AI aware of their earlier conversations.
    let serverHistory = null;
    try {
        const token = localStorage.getItem("beyonder_token");
        const res = await fetch(CHAT_HISTORY_URL, { headers: { "Authorization": token } });
        const data = await res.json();
        if (data.success) serverHistory = data.history;
    } catch (e) {
        console.warn("Could not load chat history from server, falling back to local cache:", e);
    }

    let saved = serverHistory;
    if (!saved) {
        // Offline / server unreachable — fall back to whatever was cached
        // locally last time, so the app still works without a connection.
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch (e) {
            saved = null;
        }
    }

    if (saved && Array.isArray(saved) && saved.length > 0) {
        chatHistory = saved;
        chatHistory.forEach((turn) => {
            const text = turn.parts[0].text;
            appendMessage(text, turn.role === "user" ? "outgoing" : "incoming", { animate: false });
        });
        chat.scrollTop = chat.scrollHeight;
        saveHistory(); // keep the local cache mirrored, for the offline-fallback case above
    } else {
        chatHistory = [];
        showWelcomeHero();
    }
};

const startNewChat = () => {
    // Product decision: "New Chat" only gives a clean-looking chat window —
    // it does NOT erase Beyonder AI's memory of this user's past
    // conversations. chatHistory (what actually gets sent to the AI) is
    // deliberately left untouched here, so the assistant still has full
    // context pulled from our database even in a fresh-looking thread.
    chat.innerHTML = "";
    showWelcomeHero();
};

newChatBtn.addEventListener("click", startNewChat);

/* =========================================================
   ADMIN MESSAGE POLLING (new)
   Lets an admin drop a message directly into this user's chat from
   the admin dashboard. Polls quietly in the background — no visual
   change to the chat UI itself, messages just appear as a normal
   incoming reply.
   ========================================================= */
const ADMIN_MESSAGE_POLL_MS = 30000;

const pollAdminMessages = async () => {
    const token = localStorage.getItem("beyonder_token");
    if (!token) return;

    const sinceId = localStorage.getItem(ADMIN_MSG_ID_KEY) || "0";
    try {
        const res = await fetch(`${CHECK_MESSAGES_URL}?since_id=${encodeURIComponent(sinceId)}`, {
            headers: { "Authorization": token }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.messages || data.messages.length === 0) return;

        data.messages.forEach((msg) => {
            chatHistory.push({ role: "model", parts: [{ text: msg.text }] });
            appendMessage(msg.text, "incoming");
            localStorage.setItem(ADMIN_MSG_ID_KEY, String(msg.id));
        });
        saveHistory();
    } catch (e) {
        console.error("Could not check for admin messages:", e);
    }
};

/* =========================================================
   PUSH NOTIFICATIONS
   Subscribes this device so that when an admin messages this user, a
   real notification pops up on the phone's home screen — instantly if
   the device is online, or the moment it comes back online otherwise
   (that part is handled by the browser's own push service, not this
   code). Fails silently everywhere: if the browser doesn't support
   push, or the user denies the permission prompt, the app just carries
   on working without notifications.
   ========================================================= */
const VAPID_KEY_URL = `${BACKEND_BASE}/api/push/vapid-public-key`;
const PUSH_SUBSCRIBE_URL = `${BACKEND_BASE}/api/push/subscribe`;

// Web Push wants the VAPID public key as a raw Uint8Array, but it's
// handed to us (and travels over the network) as a base64url string.
const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

const initPushNotifications = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return; // browser doesn't support Web Push at all
    }
    if (Notification.permission === "denied") {
        return; // user already said no — don't re-prompt
    }

    try {
        const keyRes = await fetch(VAPID_KEY_URL);
        const keyData = await keyRes.json();
        if (!keyData.success) return; // push isn't configured on the server

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
            });
        }

        const token = localStorage.getItem("beyonder_token");
        await fetch(PUSH_SUBSCRIBE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": token },
            body: JSON.stringify(subscription.toJSON()),
        });
    } catch (e) {
        console.warn("Push notification setup skipped:", e);
    }
};

(async () => {
    const ok = await checkAuth();
    if (ok) {
        try {
            const token = localStorage.getItem("beyonder_token");
            const res = await fetch(PROFILE_API_URL, { headers: { "Authorization": token } });
            const data = await res.json();
            if (data.success) {
                setNavAvatar(data.avatar || null, data.name || "");
                // Stored for getGeminiResponse() to personalize the system
                // instruction — only ever included if the user actually
                // filled these in on their profile (address is opt-in by
                // virtue of being blank unless they chose to add it).
                currentUserProfile.name = data.name || "";
                currentUserProfile.address = data.address || "";
            }
        } catch (e) {}

        pollAdminMessages();
        setInterval(pollAdminMessages, ADMIN_MESSAGE_POLL_MS);
        initPushNotifications();
        document.body.classList.remove("checking-auth");
        await loadHistory();
    }
})();



/* =========================================================
   SEND / RECEIVE
   ========================================================= */
const setComposerDisabled = (disabled) => {
    sendBtn.disabled = disabled;
    input.disabled = disabled;
};

const getGeminiResponse = async (userText) => {

    // 1. Save the user's message to memory
    chatHistory.push({
        role: "user",
        parts: [{ text: userText }]
    });
    saveHistory();

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{
                        text: `You are Beyonder AI — a friendly, smart, and helpful AI assistant.

Your personality:
- You explain things in simple, clear language (comfortable in any Language)
- You're a bit fun and friendly, but serious when it comes to getting work done
- You break down complex topics using simple explanations and examples
- Keep answers short for simple questions, detailed for complex ones

IDENTITY:
- Your name is Beyonder AI, created by Anubhab Dutta & Arnab Adhikari. Don't volunteer what API or technology powers you unless someone directly asks.
- If someone directly asks whether you're built on Google/Gemini or what API you use, say something like: "That's something I'd rather not get into — but I'm here as Beyonder AI, made by Anubhab Dutta & Arnab Adhikari. What can I help you with?"
- Never deny or claim ignorance about being built on Gemini if asked directly — just redirect politely as above.
${currentUserProfile.name ? `\nUSER INFO (use naturally — e.g. greet them by name — don't make a show of reciting these back):\n- Name: ${currentUserProfile.name}` : ""}${currentUserProfile.address ? `\n- Address: ${currentUserProfile.address}` : ""}

Today's date: ${new Date().toDateString()}`
                    }]
                },
                contents: chatHistory
            })
        });

        const data = await response.json();

        let aiText = "";

        if (data.candidates && data.candidates[0].content) {
            aiText = data.candidates[0].content.parts[0].text;

            // 2. Save the AI's response to memory
            chatHistory.push({
                role: "model",
                parts: [{ text: aiText }]
            });
            saveHistory();

            // 👇 The database-save function gets called right here
            if (typeof saveToFriendDatabase === "function") {
                saveToFriendDatabase(userText, aiText);
            }

        } else {
            console.log("API Error Details:", JSON.stringify(data, null, 2));
            aiText = "Sorry, I couldn't answer that. It might be blocked by my safety filters!";
            chatHistory.pop();
            saveHistory();
        }

        removeTypingIndicator();
        appendMessage(aiText, "incoming");

    } catch (error) {
        console.error("Fetch Error:", error);
        removeTypingIndicator();
        appendMessage("Sorry, network error!", "incoming");
        chatHistory.pop();
        saveHistory();
    } finally {
        setComposerDisabled(false);
        input.focus();
    }
};

const handleSend = () => {
    let userMessage = input.value.trim();
    if (userMessage === "") return;

    appendMessage(userMessage, "outgoing");

    input.value = "";
    input.style.height = "auto";

    setComposerDisabled(true);
    showTypingIndicator();

    getGeminiResponse(userMessage);
};

sendBtn.addEventListener("click", handleSend);

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // stop the default behavior (prevents sending)

        // manually insert a newline at the cursor position
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + "\n" + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + 1;

        // update the height after the new line is added
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    }
});


/* =========================================================
   PROFILE SETTINGS MODAL
   ========================================================= */
const PROFILE_API_URL = `${BACKEND_BASE}/api/profile`;
const PROFILE_UPDATE_URL = `${BACKEND_BASE}/api/profile/update`;
const PROFILE_PASSWORD_URL = `${BACKEND_BASE}/api/profile/change-password`;
const AVATAR_COLORS = [
    '#6b5cd6', '#e0568b', '#2a9d8f', '#e76f51', '#457b9d', '#f4a261',
    '#d62828', '#06a77d', '#8338ec', '#fb8500', '#3a86ff', '#c9184a',
    '#588157', '#bc6c25', '#219ebc', '#9d4edd', '#ef476f', '#118ab2',
    '#ff6392', '#5f6caf'
];

const colorForName = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const navAvatar = document.getElementById("nav-avatar");

const setNavAvatar = (dataUrlOrNull, name) => {
    if (!navAvatar) return;
    if (dataUrlOrNull) {
        navAvatar.innerHTML = `<img src="${dataUrlOrNull}" alt="Profile photo">`;
        navAvatar.style.background = "transparent";
    } else {
        const initial = (name || "?").trim().charAt(0).toUpperCase();
        navAvatar.innerHTML = initial;
        navAvatar.style.background = colorForName(name || "?");
    }
};
const profileModal = document.getElementById("profile-modal");
const profileBtn = document.getElementById("profile-btn");
const profileModalClose = document.getElementById("profile-modal-close");
const avatarPreview = document.getElementById("avatar-preview");
const avatarUploadBtn = document.getElementById("avatar-upload-btn");
const avatarFileInput = document.getElementById("avatar-file-input");
const profileNameInput = document.getElementById("profile-name-input");
const profileAddressInput = document.getElementById("profile-address-input");
const profileEmailDisplay = document.getElementById("profile-email-display");
const profileSaveBtn = document.getElementById("profile-save-btn");
const profileSaveStatus = document.getElementById("profile-save-status");
const currentPasswordInput = document.getElementById("current-password-input");
const newPasswordInput = document.getElementById("new-password-input");
const passwordSaveBtn = document.getElementById("password-save-btn");
const passwordSaveStatus = document.getElementById("password-save-status");

let pendingAvatarDataUrl = null; // set only if the user picked a new photo this session

const setAvatarPreview = (dataUrlOrNull, name) => {
    if (dataUrlOrNull) {
        avatarPreview.innerHTML = `<img src="${dataUrlOrNull}" alt="Profile photo">`;
        avatarPreview.style.background = "transparent";
    } else if (name) {
        const initial = name.trim().charAt(0).toUpperCase();
        avatarPreview.innerHTML = initial;
        avatarPreview.style.background = colorForName(name);
    } else {
        avatarPreview.innerHTML = `<i class="fa-solid fa-user"></i>`;
        avatarPreview.style.background = ""; 
    }
};


const setStatus = (el, message, kind) => {
    el.textContent = message || "";
    el.classList.remove("error", "success");
    if (kind) el.classList.add(kind);
};

const openProfileModal = async () => {
    profileModal.hidden = false;
    pendingAvatarDataUrl = null;
    setStatus(profileSaveStatus, "");
    setStatus(passwordSaveStatus, "");
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    profileNameInput.value = "";
    if (profileAddressInput) profileAddressInput.value = "";
    profileEmailDisplay.value = localStorage.getItem("beyonder-user") || "";
    setAvatarPreview(null);
    const token = localStorage.getItem("beyonder_token");
    try {
        const res = await fetch(PROFILE_API_URL, { headers: { "Authorization": token } });
        const data = await res.json();
        if (data.success) {
            profileNameInput.value = data.name || "";
            if (profileAddressInput) profileAddressInput.value = data.address || "";
            profileEmailDisplay.value = data.email || "";
            setAvatarPreview(data.avatar || null, data.name || "");
           setNavAvatar(data.avatar || null, data.name || "");
        }
    } catch (e) {
        console.error("Could not load profile:", e);
    }
};
const closeProfileModal = () => { profileModal.hidden = true; };
if (profileBtn) profileBtn.addEventListener("click", openProfileModal);
if (profileModalClose) profileModalClose.addEventListener("click", closeProfileModal);
if (profileModal) {
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) closeProfileModal();
    });
}
if (avatarUploadBtn) {
    avatarUploadBtn.addEventListener("click", () => avatarFileInput.click());
}
if (avatarFileInput) {
    avatarFileInput.addEventListener("change", () => {
        const file = avatarFileInput.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setStatus(profileSaveStatus, "Please choose an image file.", "error");
            return;
        }
        // Resize client-side to a small square thumbnail before sending,
        // so the photo stays lightweight in the database.
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const size = 256;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                const scale = Math.max(size / img.width, size / img.height);
                const w = img.width * scale, h = img.height * scale;
                ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
                pendingAvatarDataUrl = canvas.toDataURL("image/jpeg", 0.85);
                setAvatarPreview(pendingAvatarDataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
if (profileSaveBtn) {
    profileSaveBtn.addEventListener("click", async () => {
        const token = localStorage.getItem("beyonder_token");
        const name = profileNameInput.value.trim();
        if (!name) {
            setStatus(profileSaveStatus, "Name cannot be empty.", "error");
            return;
        }
        profileSaveBtn.disabled = true;
        setStatus(profileSaveStatus, "Saving…");
        const payload = { name };
        if (profileAddressInput) payload.address = profileAddressInput.value.trim();
        if (pendingAvatarDataUrl) payload.avatar = pendingAvatarDataUrl;
        try {
            const res = await fetch(PROFILE_UPDATE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": token },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
          if (data.success) {
    setStatus(profileSaveStatus, "Saved!", "success");
    setNavAvatar(pendingAvatarDataUrl || avatarPreview.querySelector("img")?.src || null, name);
    pendingAvatarDataUrl = null;
    currentUserProfile.name = name;
    if (profileAddressInput) currentUserProfile.address = profileAddressInput.value.trim();
          }   else {
                setStatus(profileSaveStatus, data.message || "Could not save.", "error");
            }
        } catch (e) {
            setStatus(profileSaveStatus, "Network error — please try again.", "error");
        } finally {
            profileSaveBtn.disabled = false;
        }
    });
}
if (passwordSaveBtn) {
    passwordSaveBtn.addEventListener("click", async () => {
        const token = localStorage.getItem("beyonder_token");
        const current_password = currentPasswordInput.value;
        const new_password = newPasswordInput.value;
        if (!current_password || !new_password) {
            setStatus(passwordSaveStatus, "Please fill in both password fields.", "error");
            return;
        }
        if (new_password.length < 8) {
            setStatus(passwordSaveStatus, "New password must be at least 8 characters.", "error");
            return;
        }
        passwordSaveBtn.disabled = true;
        setStatus(passwordSaveStatus, "Updating…");
        try {
            const res = await fetch(PROFILE_PASSWORD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": token },
                body: JSON.stringify({ current_password, new_password })
            });
            const data = await res.json();
            if (data.success) {
                setStatus(passwordSaveStatus, "Password updated!", "success");
                currentPasswordInput.value = "";
                newPasswordInput.value = "";
            } else {
                setStatus(passwordSaveStatus, data.message || "Could not update password.", "error");
            }
        } catch (e) {
            setStatus(passwordSaveStatus, "Network error — please try again.", "error");
        } finally {
            passwordSaveBtn.disabled = false;
        }
    });
}
/* =========================================================
   CHAT WITH ADMIN MODAL — a private line to a human admin,
   completely separate from the AI conversation above.
   ========================================================= */
const ADMIN_CHAT_SEND_URL = `${BACKEND_BASE}/api/admin-chat/send`;
const ADMIN_CHAT_MESSAGES_URL = `${BACKEND_BASE}/api/admin-chat/messages`;
const adminChatModal = document.getElementById("admin-chat-modal");
const adminChatBtn = document.getElementById("admin-chat-btn");
const adminChatModalClose = document.getElementById("admin-chat-modal-close");
const adminChatMessagesEl = document.getElementById("admin-chat-messages");
const adminChatText = document.getElementById("admin-chat-text");
const adminChatSendBtn = document.getElementById("admin-chat-send");
let adminChatLastId = 0;
let adminChatPollTimer = null;
let adminChatAllMessages = [];
const renderAdminChatMessages = () => {
    if (!adminChatAllMessages.length) {
        adminChatMessagesEl.innerHTML = `<div class="admin-chat-empty">No messages yet — say hello 👋</div>`;
        return;
    }
    adminChatMessagesEl.innerHTML = adminChatAllMessages.map((m) => {
        const cls = m.sender === "admin" ? "from-admin" : "from-user";
        const label = m.sender === "admin" ? "Admin" : "You";
        const time = new Date(m.timestamp * 1000).toLocaleString();
        return `<div class="admin-chat-msg ${cls}">
            <span class="meta">${label} · ${time}</span>${escapeAdminChatHtml(m.message)}
        </div>`;
    }).join("");
    adminChatMessagesEl.scrollTop = adminChatMessagesEl.scrollHeight;
};
function escapeAdminChatHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}
const pollAdminChat = async () => {
    const token = localStorage.getItem("beyonder_token");
    if (!token) return;
    try {
        const res = await fetch(`${ADMIN_CHAT_MESSAGES_URL}?since_id=${adminChatLastId}`, {
            headers: { "Authorization": token }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.messages && data.messages.length) {
            adminChatAllMessages = adminChatAllMessages.concat(data.messages);
            adminChatLastId = data.messages[data.messages.length - 1].id;
            renderAdminChatMessages();
        }
    } catch (e) {
        console.error("Could not poll admin chat:", e);
    }
};
const openAdminChatModal = () => {
    adminChatModal.hidden = false;
    // Fresh history each time the modal is opened
    adminChatLastId = 0;
    adminChatAllMessages = [];
    pollAdminChat();
    if (adminChatPollTimer) clearInterval(adminChatPollTimer);
    adminChatPollTimer = setInterval(pollAdminChat, 4000);
};
const closeAdminChatModal = () => {
    if (adminChatModal) adminChatModal.hidden = true;
    if (adminChatPollTimer) clearInterval(adminChatPollTimer);
};
if (adminChatBtn) adminChatBtn.addEventListener("click", openAdminChatModal);
// Reliable click handler for closing via backdrop or any close button/icon
if (adminChatModal) {
    adminChatModal.addEventListener("click", (e) => {
        if (
            e.target === adminChatModal || 
            e.target.closest("#admin-chat-modal-close") || 
            e.target.closest(".fa-xmark") || 
            e.target.closest(".close-btn")
        ) {
            closeAdminChatModal();
        }
    });
}
const sendAdminChatMessage = async () => {
    const token = localStorage.getItem("beyonder_token");
    const message = adminChatText.value.trim();
    if (!message) return;

    adminChatText.value = "";
    adminChatText.style.height = "auto";
    adminChatSendBtn.disabled = true;

    try {
        await fetch(ADMIN_CHAT_SEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": token },
            body: JSON.stringify({ message })
        });
        pollAdminChat();
    } catch (e) {
        console.error("Could not send admin chat message:", e);
    } finally {
        adminChatSendBtn.disabled = false;
    }
};

if (adminChatSendBtn) adminChatSendBtn.addEventListener("click", sendAdminChatMessage);
if (adminChatText) {
    adminChatText.addEventListener("input", () => {
        adminChatText.style.height = "auto";
        adminChatText.style.height = adminChatText.scrollHeight + "px";
    });
    adminChatText.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendAdminChatMessage();
        }
    });
                              }
