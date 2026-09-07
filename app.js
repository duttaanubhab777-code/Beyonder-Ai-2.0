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

            // টাইপিং শেষ হওয়ার পর, bubble এর বাইরে নিচে copy বাটন যোগ করা
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

const checkAuth = async () => {
    const token = localStorage.getItem("beyonder_token");
    if (!token) {
        window.location.href = "login.html";
        return false;
    }
    try {
        const res = await fetch("https://anubhabdutta.pythonanywhere.com/api/me", {
            headers: {
                "Authorization": token // টোকেন পাঠানো হচ্ছে
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

const API_URL = "https://beyonder-api.vercel.app/api/chat";


// 👇 Python (Flask) সার্ভারে চ্যাট সেভ করার লিঙ্ক
const DB_API_URL = "https://anubhabdutta.pythonanywhere.com/api/save-chat";


// 👇 Python সার্ভারে ডেটা পাঠানোর ফাংশন (Token দিয়ে)
const saveToFriendDatabase = async (userText, aiText) => {
    const token = localStorage.getItem("beyonder_token");
    try {
        const response = await fetch(DB_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token // টোকেন পাঠানো হচ্ছে
            },
            body: JSON.stringify({
                user_message: userText,
                ai_response: aiText
            })
        });

        const result = await response.json();
        console.log("Database Response:", result);
    } catch (error) {
        console.error("Database কানেক্ট হতে সমস্যা হয়েছে:", error);
    }
};


/* =========================================================
   LOGOUT FUNCTION
   ========================================================= */
const logoutUser = () => {
    const token = localStorage.getItem("beyonder_token");
    
    // ব্রাউজারের স্টোরেজ ক্লিয়ার
    localStorage.removeItem(STORAGE_KEY); 
    localStorage.removeItem("beyonder_token"); 
    
    // সার্ভার থেকে লগআউট
    fetch("https://anubhabdutta.pythonanywhere.com/api/logout", {
        method: "POST",
        headers: {
            "Authorization": token
        }
    }).finally(() => {
        window.location.href = "login.html"; // আপনার লগইন পেজের নাম
    });
};


        




/* =========================================================
   MESSAGE RENDERING
   ========================================================= */
const appendMessage = (text, type, { animate = true } = {}) => {
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

const loadHistory = () => {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        saved = null;
    }

    chat.innerHTML = "";

    if (saved && Array.isArray(saved) && saved.length > 0) {
        chatHistory = saved;
        chatHistory.forEach((turn) => {
            const text = turn.parts[0].text;
            appendMessage(text, turn.role === "user" ? "outgoing" : "incoming", { animate: false });
        });
        chat.scrollTop = chat.scrollHeight;
    } else {
        chatHistory = [];
        appendMessage(WELCOME_MESSAGE, "incoming", { animate: false });
    }
};

const startNewChat = () => {
    chatHistory = [];
    localStorage.removeItem(STORAGE_KEY);
    chat.innerHTML = "";
    appendMessage(WELCOME_MESSAGE, "incoming");
};

newChatBtn.addEventListener("click", startNewChat);

(async () => {
    const ok = await checkAuth();
    if (ok) {
        loadHistory();
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

    // ১. ইউজারের মেসেজ মেমোরিতে সেভ
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

            // ২. এআই-এর উত্তর মেমোরিতে সেভ
            chatHistory.push({
                role: "model",
                parts: [{ text: aiText }]
            });
            saveHistory();

            // 👇 ঠিক এখানেই ডাটাবেসে সেভ করার ফাংশনটি কল করতে হবে
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
        event.preventDefault(); // ডিফল্ট বিহেভিয়ার বন্ধ (send হওয়া আটকাচ্ছে)

        // কার্সরের জায়গায় ম্যানুয়ালি একটা newline বসিয়ে দেওয়া
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + "\n" + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + 1;

        // নতুন লাইন যোগ হওয়ার পর height আপডেট করা
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    }
});
