# Beyonder AI 2.0

A friendly AI chat app that you can install on your phone. It has user accounts, saved chat history, a full **admin panel**, and push notifications.

Created by **Anubhab Dutta** & **Arnab Adhikari**.

- **Frontend:** plain HTML, CSS and JavaScript (ES modules). No framework, no build step.
- **Backend:** Python Flask + SQLite database. Code lives in `backend/beyonder`.
- **AI:** a separate small server, the `beyonder-api` repo on Vercel. It talks to Gemini and Groq so no secret key is ever inside the browser.

---

## Table of contents

1. [What can it do?](#1-what-can-it-do)
2. [How it works (simple picture)](#2-how-it-works-simple-picture)
3. [Quick start](#3-quick-start)
4. [Configuration](#4-configuration)
5. [Admin Panel: complete guide](#5-admin-panel-complete-guide)
6. [Deploying](#6-deploying)
7. [Project structure](#7-project-structure)
8. [API reference](#8-api-reference)
9. [How the frontend works](#9-how-the-frontend-works)
10. [PWA and updates](#10-pwa-and-updates)
11. [Security notes](#11-security-notes)
12. [Troubleshooting](#12-troubleshooting)
13. [Small dictionary](#13-small-dictionary)

---

## 1. What can it do?

### For normal users

- Sign up with an **email OTP** (a 6-digit code sent to your email), log in, and reset a forgotten password.
- Chat with the AI. Answers support Markdown, code blocks with a **Copy** button, maths (KaTeX) and a typing animation (tap the bubble to skip it). If an answer fails, press **Try again**.
- Choose one of four AI models from the **+** button: ✨ Normal, ⚡ Smart, 🧠 Thinker, 🚀 Speedy.
- Keep many chats. The history panel lists old chats, and you can open or delete any of them.
- Edit your profile: name, optional address (the AI can use it), photo (cropped to 256×256 in the browser), change password, sign out other devices, delete account.
- **Chat with Admin:** a private two-way chat with the admin, separate from the AI chat.
- See messages and announcements from the admin inside the chat. Optional phone push notifications.
- Dark and light theme. Installable as an app (PWA). A "New version available" popup appears after every update.

### For admins

Open `admin.html`. It has seven tabs:

| Tab | One-line meaning |
| --- | --- |
| **Overview** | Live numbers and charts: users, who is online, messages |
| **Users** | Find, create, edit, ban, message or delete users. Also "log in as user" |
| **Chats** | Read and search every AI conversation, delete messages |
| **Support** | Inbox for the "Chat with Admin" messages |
| **Broadcast** | Send one message to all users |
| **Logs** | Login history and a record of what admins did |
| **Settings** | Open/close sign-ups, maintenance mode, announcement banner, backups, danger zone |

Every tab is explained in detail in [section 5](#5-admin-panel-complete-guide).

---

## 2. How it works (simple picture)

```
 ┌───────────────────────────── browser ─────────────────────────────┐
 │  login.html · index.html (chat) · admin.html        sw.js (PWA)   │
 └──────────────┬───────────────────────────────────────┬────────────┘
                │ accounts, chats, admin                │ AI questions
                ▼  /api/*  (token in Authorization)     ▼  /api/chat
   ┌──────────────────────────┐              ┌──────────────────────────┐
   │ Flask backend            │ ◄─ /api/me ─ │ beyonder-api (Vercel)    │
   │ (PythonAnywhere)         │   (checks    │ adds the secret keys,    │
   │ SQLite database          │    the token)│ calls Gemini / Groq      │
   └──────────────────────────┘              └──────────────────────────┘
```

1. You log in to the Flask backend. It gives your browser a random **token**. The token is saved in `localStorage` (`beyonder_token`) and sent in the `Authorization` header with every request. No cookies are used, so the frontend can live on a different domain than the backend.
2. When you send a chat message, the browser sends it to the **AI proxy** (never straight to Gemini or Groq).
3. When the answer comes back, the browser saves the pair (question + answer) in the backend with `/api/save-chat`. That is why it shows in your history and in the admin's **Chats** tab.

The backend can also serve the frontend files itself (`SERVE_FRONTEND = True`, the default). Then one deployment is enough.

---

## 3. Quick start

Works on a computer or on a phone (for example in Termux).

```bash
cd backend
cp config.example.py config.py      # then edit it (see section 4)
pip install -r requirements.txt
python run.py
```

Open `http://localhost:5000`. The backend serves the frontend too, so that is all.

- `run.py` is for development only (debug mode, listens on all network interfaces so another phone on the same Wi-Fi can open it). In production the server uses `wsgi.py`.
- The database file is created automatically at `backend/data/beyonder.db` on first start.
- When you update the code later, new columns and indexes are added automatically. Old users and chats are kept.

---

## 4. Configuration

### 4.1 `backend/config.py` (copy it from `config.example.py`)

**Required**

| Setting | Meaning |
| --- | --- |
| `SECRET_KEY` | A long random string. The app will not start while it is empty or still the placeholder. It is used to hash tokens and OTPs, so **changing it logs everybody out**. |
| `ADMIN_EMAILS` | List of admin emails, for example `["you@gmail.com"]`. Only these emails can open the admin panel. |

**Email (needed for sign-up and password-reset codes)**

| Setting | Meaning |
| --- | --- |
| `GMAIL_ADDRESS` | The Gmail account that sends the codes |
| `GMAIL_APP_PASSWORD` | A Gmail **App Password** (Google account → Security → 2-Step Verification → App passwords). It is not your normal Gmail password. |

**Optional** (default value in brackets)

| Setting | Meaning |
| --- | --- |
| `ALLOWED_ORIGINS` | Websites that may call the API from another domain, for example `["https://yourname.github.io"]`. Empty means any site. Not needed if the backend serves the frontend itself. |
| `OTP_EXPIRY_SECONDS` (600) | How long a code is valid |
| `OTP_RESEND_COOLDOWN_SECONDS` (60) | Wait time before another code can be requested |
| `OTP_MAX_VERIFY_ATTEMPTS` (5) | Wrong code guesses allowed |
| `OTP_SEND_MAX_PER_HOUR_PER_IP` (10) | Code requests allowed per hour from one IP |
| `LOGIN_MAX_ATTEMPTS` (5) · `LOGIN_ATTEMPT_WINDOW_SECONDS` (900) | Failed-login limit per email (one IP gets 4× as many) |
| `MIN_PASSWORD_LENGTH` (8) · `MAX_PASSWORD_LENGTH` (128) | Password rules |
| `TOKEN_MAX_AGE_SECONDS` (30 days) | How long a login lasts |
| `PRESENCE_ONLINE_WINDOW_SECONDS` (90) | A user counts as "online" if seen within this many seconds |
| `CHAT_HISTORY_LIMIT` (300) | Messages loaded when a chat is opened |
| `MAX_AVATAR_BASE64_CHARS` (400000) | Maximum profile-photo size |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIM_EMAIL` | Turn on Web Push notifications (see 6.5) |
| `KILL_SWITCH_PASSWORD` | Turns on the "Erase all data" button in the admin panel. Empty = button disabled. |
| `WEBHOOK_SECRET`, `PYTHONANYWHERE_WSGI_FILE` | Turn on GitHub → PythonAnywhere auto-deploy (see 6.4) |
| `DB_PATH` (`backend/data/beyonder.db`) | Where the database file is stored |
| `SERVE_FRONTEND` (`True`) | Let Flask serve the `frontend/` folder |

### 4.2 `frontend/js/core/config.js`

This is the only frontend file where you edit URLs:

```js
const PYTHONANYWHERE_URL = "https://<your-user>.pythonanywhere.com"; // the Flask backend
const AI_API_URL = "https://<your-project>.vercel.app/api/chat";     // the beyonder-api proxy
```

- `API_BASE` is empty (same origin) on `localhost`, `127.0.0.1` and `*.pythonanywhere.com`. Anywhere else it uses `PYTHONANYWHERE_URL`.
- The same file holds timings: `INBOX_POLL_MS` (30 s), `SUPPORT_POLL_MS` (4 s), `AI_CONTEXT_TURNS` (40 past messages sent to the AI) and `AI_TIMEOUT_MS` (60 s).

### 4.3 How to become an admin

1. Put your email in `ADMIN_EMAILS` in `config.py`, then restart or reload the server.
2. Sign up normally with that same email.
3. Log in. Admins are sent straight to `admin.html`. The 💬 button in the admin header opens the chat app. In the chat menu, admins also get an **Admin Panel** shortcut.

---

## 5. Admin Panel complete guide

Open `admin.html` (or log in with an admin email, you are sent there automatically). Only emails listed in `ADMIN_EMAILS` can use it. Everyone else is sent back to the chat app.

### 5.1 The top header

| Item | What it does |
| --- | --- |
| Logo + **Beyonder Admin** | Title. Your admin email is shown under it. |
| 💬 button | Opens the normal chat app |
| 🌙 button | Switches dark / light theme |
| ➜ (logout) button | Logs you out |

Under the header is a row of **tabs**. On a phone this row scrolls sideways, so swipe it to see all tabs. The Support tab shows a **red number badge** when users have unread messages (it checks every 30 seconds). The page address changes with the tab (for example `admin.html#users`), so you can bookmark a tab.

---

### 5.2 Overview tab

A live dashboard. It refreshes itself every 20 seconds (it pauses while the browser tab is hidden).

**Number cards**

| Card | Meaning |
| --- | --- |
| Users | Total accounts |
| Online now | Users seen in the last 90 seconds |
| New (24h) / New (7 days) | New sign-ups in the last day / week |
| AI messages | Total saved chat messages |
| Messages (24h) | Messages in the last day |
| Active sessions | Logins that are still valid (one person on two devices = 2) |
| Push devices | Devices that turned on notifications |
| Banned users | Accounts that are banned (turns yellow if above 0) |
| Failed logins (24h) | Wrong-password attempts. **Turns red above 10**: someone may be trying to break in |
| Unread support | Messages from users you have not opened yet |

**Other parts**

- **Maintenance banner:** if maintenance mode is ON you see an orange line here as a reminder.
- **Online now list:** names, emails and "seen X ago" for everyone currently online.
- **Two bar charts:** new sign-ups per day and AI messages per day for the last 14 days. Tap a bar to see its exact number.

---

### 5.3 Users tab

Manage accounts.

**Top bar:** a search box (name or email), a filter (**All users** / **Banned only**) and the **New user** button.

- **New user:** enter name, email and a password (minimum 8 characters). The account is created at once, with no OTP.
- **User list:** each row shows name, email and last login. Badges: `ADMIN` (email is in `ADMIN_EMAILS`) and `BANNED`. Results are paged (20 per page).

**Tap a user** to open the user window:

| Part | What it shows or does |
| --- | --- |
| Info | Joined date, last login, number of chats, number of support messages, number of push devices |
| **Send message** | Writes a message that appears in the user's chat like an AI reply. Also sent as a push notification if the user enabled it. |
| **Login as user** | Opens the chat app in a new tab **as that user**, so you can see exactly what they see. Lasts 1 hour, is marked in the session list and login log, and cannot use the admin panel. Your own admin login is not affected. |
| **Reset password** | Type a new password, or leave empty to generate one. A generated password is shown **only once**, so copy it and give it to the user. All their devices are signed out. |
| **Sign out everywhere** | Removes all of the user's sessions. They must log in again. |
| **View chats** | Jumps to the Chats tab filtered by this user's email |
| **Export data** | Downloads everything about the user as a JSON file |
| **Ban / Unban** | Ban asks for a reason (the user sees it when they try to log in) and signs them out at once. Unban lets them back in. |
| **Delete user** | Deletes the account and all its data forever. You must type the user's email to confirm. |
| **Edit** box | Change name and address. **Admin note** is a private note that only admins can see. Press **Save changes**. |
| **Active sessions** | Every device logged in (IP, browser, last seen). **Revoke** signs out just that one device. A yellow badge "by …" means an admin is using a "Login as user" session. |
| **Recent logins** | Last login attempts of this user (OK / FAIL, IP, note) |

---

### 5.4 Chats tab

Read all AI conversations of all users. Use it for moderation and to check problems.

- **Search message text**, **Filter by user email**, and an order switch (**Newest first** / **Oldest first**).
- Each card shows: the user's email, the time, the user's question, the AI answer and the chat session id.
- A `FROM ADMIN` badge marks messages that an admin or broadcast sent into the chat.
- The red trash button deletes that single message (after confirmation).

> Users should know that admins can read chats. Please tell your users.

---

### 5.5 Support tab

The inbox for **Chat with Admin**, the private line between a user and you.

- **Left side (list):** one row per user conversation, with the last message and time. A number badge shows unread messages. The list refreshes every 10 seconds.
- **Right side (conversation):** tap a row to open it. New messages appear by themselves (every 4 seconds).
- **Reply:** type and press **Enter** to send (**Shift+Enter** makes a new line) or press the send button.
- **Trash button** (top right of the conversation): deletes the whole conversation after confirmation.

---

### 5.6 Broadcast tab

Send one message to many users at once.

| Field | Meaning |
| --- | --- |
| Message | Up to 4000 characters |
| Audience | **Everyone** or **Only users online right now** |
| Also send a push notification | ON by default. Sends a phone notification to users who enabled push. |

After you confirm, the message is stored for every chosen user. It appears **inside their chat like a normal reply** the next time their app checks for messages (the app checks every 30 seconds while open). A message is delivered to each user only once.

Use Broadcast for a one-time message ("new feature added"). Use the **announcement banner** (Settings) for a notice that stays visible.

---

### 5.7 Logs tab

Two buttons at the top switch the view.

**Login history**

- Every login attempt: `OK` or `FAIL`, the email, IP address, a note (for example "banned account") and the browser/device text.
- Filter by email and by All / Successful / Failed.
- Many `FAIL` lines for one email or IP can mean someone is guessing passwords.

**Admin audit log**

- A record of what admins did: action name, which admin, target user, details, IP and time.
- Examples: ban, reset password, delete user, broadcast, settings change, backup, kill switch.
- Nothing here can be edited from the panel.

---

### 5.8 Settings tab (the screen in the screenshot)

This tab has **four cards**, from top to bottom.

#### Card 1: App settings

Changes here affect all users. Press **Save settings** (the blue button at the bottom of this card) to apply them. Nothing is saved until you press it.

| Setting | What it does |
| --- | --- |
| **Allow new sign-ups** (checkbox) | ✅ ON: anyone can create an account. ⬜ OFF: the Sign up option is hidden on the login page and the server refuses new sign-ups. Existing users can still log in. Use it to stop new people from joining. |
| **Maintenance mode (only admins can use the app)** (checkbox) | When ON, normal users cannot use the app. Only admins can. Users see the maintenance message instead. Use it while you update or fix something. |
| **Maintenance message** | The text that users see during maintenance (up to 300 characters). It cannot be saved empty. |
| **Announcement banner** | A short text (up to 300 characters) shown at the top of the login page and the chat page for every user. Leave it **empty** to show no banner. |
| **Banner colour** | The dropdown that opens in the screenshot. See below. |

##### What is "Banner colour"? (the dropdown in your screenshot)

It sets the **colour and icon of the announcement banner**. It only changes how the banner looks. It does not change what the banner says. The banner colour is saved together with the announcement text.

| Option | Colour | Icon | Best used for |
| --- | --- | --- | --- |
| **Info (blue)** (default) | Blue | ℹ️ circle-info | Normal news: "New AI model added" |
| **Success (green)** | Green | ✅ circle-check | Good news: "Problem fixed, everything works again" |
| **Warning (orange)** | Orange | ⚠️ triangle | Important notice: "Server will restart at 10 PM" |

In the screenshot, the dropdown list is open and **Info (blue)** is selected (the filled circle). Tap another option and press **Save settings** to change it.

How the banner behaves for users:

- It appears at the top of the **login page** and the **chat page**.
- Users can close it with the ✕ button. It stays closed for that exact text and colour. If you change the text or the colour, it appears again for everyone.
- The **maintenance** banner is always orange and cannot be closed.

> The red "danger" banner style exists in the app (for example for "this account is banned"), but it is not one of the choices for announcements.

#### Card 2: System

A read-only health check.

| Row | Meaning |
| --- | --- |
| Database | Size of the database file (in the screenshot: 176.0 KB) |
| Python | Python version the server runs on |
| Server time | Current server time |
| **E-mail (OTP)** | `READY` if Gmail is set up. If it says `NOT SET`, sign-up and reset codes cannot be sent. |
| **Push notifications** | `READY` if the VAPID keys are set |
| Push devices | How many devices turned on notifications |
| **Auto-deploy webhook** | `READY` if `WEBHOOK_SECRET` is set |
| Admins | The emails from `ADMIN_EMAILS` |
| Rows | Number of rows in each database table |

#### Card 3: Database tools

| Button | What it does |
| --- | --- |
| **Download backup** | Downloads a copy of the whole database as a `.db` file. Do this regularly. |
| **Compact database** | Runs SQLite `VACUUM`. Makes the file smaller after deleting data. Safe. |
| **Delete old data** | Asks for a number of days (default 180). Permanently deletes **chats, support messages, login logs and audit log entries** older than that. User accounts are not deleted. |

#### Card 4: Danger zone

The **kill switch** erases the whole database: all accounts, chats, support messages, logs and sessions. There is no undo.

- It is **disabled** unless `KILL_SWITCH_PASSWORD` is set in `config.py`. If it is off, the card only shows a short note saying so.
- To use it you must type the phrase `DELETE EVERYTHING` and the master password, then confirm again.
- **Download a backup first.**

---

### 5.9 Common admin jobs (quick recipes)

| I want to... | Do this |
| --- | --- |
| Stop new people from signing up | Settings → turn off **Allow new sign-ups** → **Save settings** |
| Show a notice to everyone | Settings → type the **Announcement banner** → pick a **Banner colour** → **Save settings** |
| Remove the notice | Settings → clear the Announcement text → **Save settings** |
| Fix a bug without users seeing errors | Settings → turn on **Maintenance mode** → **Save settings**. Turn it off when done. |
| Help a user who forgot the password | Users → tap the user → **Reset password** → copy the new password and send it to them |
| Block a bad user | Users → tap the user → **Ban** (write a reason) |
| See a user's problem with your own eyes | Users → tap the user → **Login as user** |
| Send a message to one person | Users → tap the user → **Send message** |
| Send a message to everybody | Broadcast tab |
| Answer a user's question | Support tab → tap the conversation → reply |
| Find who is trying to hack | Logs → Login history → filter **Failed** |
| Make a backup | Settings → Database tools → **Download backup** |
| Check why sign-up codes do not arrive | Settings → System → **E-mail (OTP)** must say `READY` |

---

## 6. Deploying

### 6.1 Backend on PythonAnywhere

1. In a Bash console: clone the repo, then `cd <repo>/backend`, run `pip install --user -r requirements.txt`, then `cp config.example.py config.py` and edit it.
2. **Web** tab → *Add a new web app* → *Manual configuration* (choose your Python version).
3. Open the WSGI configuration file and replace its content with:

    ```python
    import sys
    path = "/home/<your-user>/<repo-folder>/backend"
    if path not in sys.path:
        sys.path.insert(0, path)

    from beyonder import create_app
    application = create_app()
    ```

    (`backend/wsgi.py` does exactly the same. It is for hosts that start the app with a command such as `gunicorn wsgi:application`.)

4. Press **Reload**, then open `https://<your-user>.pythonanywhere.com/api/health`. You should see `{"success": true, "status": "ok", ...}`.

Because `SERVE_FRONTEND` is on, `https://<your-user>.pythonanywhere.com/` is already the full app. You do not need to set up static files.

### 6.2 AI proxy on Vercel

Deploy the `beyonder-api` repo and set `GEMINI_API_KEY`, `GROQ_API_KEY` and (recommended) `BACKEND_URL`. Everything is explained in that repo's README. Then put its URL in `AI_API_URL` (section 4.2).

### 6.3 Frontend on another host (optional)

The `frontend/` folder is plain static files, so any static host works (for example GitHub Pages). If you do this, add the frontend's origin (for example `https://yourname.github.io`) to `ALLOWED_ORIGINS` in `config.py` and to the proxy's `ALLOWED_ORIGINS`.

### 6.4 Auto-deploy from GitHub (optional)

1. Set `WEBHOOK_SECRET` to a random string, and `PYTHONANYWHERE_WSGI_FILE` to the path shown on the Web tab (for example `/var/www/<your-user>_pythonanywhere_com_wsgi.py`).
2. GitHub repo → Settings → Webhooks → Add webhook. Payload URL: `https://<your-user>.pythonanywhere.com/api/webhook`. Content type: `application/json`. Use the same secret. Choose "Just the push event".
3. On every push, the server runs `git pull --ff-only` and touches the WSGI file, which reloads the app. Only requests with a valid GitHub signature (`X-Hub-Signature-256`) or the `X-Webhook-Secret` header are accepted.

### 6.5 Push notifications (optional)

Generate a VAPID key pair (for example `npx web-push generate-vapid-keys`) and fill `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_CLAIM_EMAIL` (like `mailto:you@example.com`). `pywebpush` is already in `requirements.txt`. In Admin → Settings → System, **Push notifications** should now say `READY`. Users then see **Enable Notifications** in their menu. The app never asks for permission on its own.

---

## 7. Project structure

```
Beyonder-Ai-2.0/
├── README.md
├── backend/
│   ├── run.py                  # local dev server  (python run.py)
│   ├── wsgi.py                 # entry point for PythonAnywhere
│   ├── config.example.py       # copy to config.py (never commit config.py)
│   ├── requirements.txt
│   └── beyonder/
│       ├── __init__.py         # create_app(): connects everything
│       ├── settings.py         # reads config.py into typed settings
│       ├── database/           # one file per table, only SQL lives here
│       │   ├── schema.py       #   tables, indexes, safe auto-migrations
│       │   └── users, chats, auth_tokens, otp_codes, rate_limits, notifications,
│       │       support, push_subscriptions, login_logs, audit, app_settings,
│       │       stats, maintenance, connection
│       ├── services/           # business logic
│       │   ├── auth_service.py #   login, sessions, admin check
│       │   ├── otp_service.py  #   email codes (signup + reset)
│       │   ├── mailer.py       #   Gmail SMTP
│       │   ├── push_service.py #   Web Push (VAPID)
│       │   └── rate_limit.py, security.py, housekeeping.py, deploy_service.py
│       ├── middleware/         # login_required / admin_required, maintenance gate, headers
│       ├── routes/             # HTTP endpoints
│       │   ├── auth, chat, profile, support, push, health, webhook
│       │   └── admin/          #   overview, users, chats, support, broadcast, logs, system
│       └── utils/              # responses, validators, time, request info
└── frontend/
    ├── index.html              # chat app
    ├── login.html              # login / signup / OTP / forgot / reset
    ├── admin.html              # admin panel
    ├── manifest.json, sw.js    # PWA
    ├── assets/icons/           # logo and PWA icons
    ├── css/
    │   ├── main.css            # imports everything below
    │   └── base/ layout/ components/ chat/ pages/
    └── js/
        ├── core/               # config, api, auth, storage, dom, theme, toast, banner
        ├── chat/               # chat page (main.js is the entry point)
        ├── auth/login.js       # login page
        ├── admin/              # admin panel (one file per tab)
        └── pwa/                # service worker, install button, push
```

### Which file controls which admin tab?

| Admin tab | Frontend file | Backend file |
| --- | --- | --- |
| Overview | `js/admin/overview.js` | `routes/admin/overview.py`, `database/stats.py` |
| Users | `js/admin/users.js` | `routes/admin/users.py` |
| Chats | `js/admin/chats.js` | `routes/admin/chats.py` |
| Support | `js/admin/support.js` | `routes/admin/support.py` |
| Broadcast | `js/admin/broadcast.js` | `routes/admin/broadcast.py` |
| Logs | `js/admin/logs.js` | `routes/admin/logs.py` |
| Settings | `js/admin/settings.js` | `routes/admin/system.py`, `database/app_settings.py`, `database/maintenance.py` |

The announcement banner you set in Settings is drawn by `js/core/banner.js` (styles in `css/components/banner.css`) and the data comes from `GET /api/public-config` in `routes/health.py`.

---

## 8. API reference

Everything is JSON. Success: `{ "success": true, ... }`. Failure: `{ "success": false, "message": "...", "code"?: "auth" | "forbidden" | "maintenance" }` with a matching HTTP status. Tokens go in the `Authorization` header.

### Public

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Is the server alive? |
| `GET /api/public-config` | Announcement text and colour, maintenance state, sign-ups open?, push available? |
| `POST /api/login` | email + password → token |
| `POST /api/signup/send-otp` | Checks the form and emails a 6-digit code |
| `POST /api/signup/verify-otp` | Checks the code, creates the account, returns a token |
| `GET /api/me` | Is this token still valid? (`logged_in`, `is_admin`, `impersonated`) |
| `POST /api/logout` | Removes the token |
| `POST /api/forgot-password/send-otp` | Sends a reset code. Always answers success, so nobody can find out who is registered |
| `POST /api/forgot-password/reset` | Code + new password. Signs the user out everywhere |
| `GET /api/push/vapid-public-key` | Public key for Web Push |
| `POST /api/webhook` | GitHub auto-deploy |

### Logged-in user

| Endpoint | Purpose |
| --- | --- |
| `POST /api/logout-all` | Sign out every other device |
| `POST /api/save-chat` | Save one exchange (`user_message`, `ai_response`, `session_id`) |
| `GET /api/chat-history?session_id=` | Messages of one chat (admin messages have `source: "admin"`) |
| `GET /api/chat-sessions` · `DELETE /api/chat-sessions/<id>` | List / delete chats |
| `GET /api/inbox?session_id=` | Delivers waiting admin messages and broadcasts into that chat |
| `GET /api/profile` · `POST /api/profile/update` | Read / change name, address, photo |
| `POST /api/profile/change-password` | Needs the current password. Other devices are signed out |
| `POST /api/profile/delete-account` | Needs the password. Erases the account and all its data |
| `POST /api/push/subscribe` · `POST /api/push/unsubscribe` | Add / remove this device for notifications |
| `POST /api/support/send` · `GET /api/support/messages?since_id=` | "Chat with Admin" |

### Admin (`/api/admin/...`, admins only)

| Endpoint | Purpose |
| --- | --- |
| `GET /overview` · `GET /online` | Dashboard numbers, online users |
| `GET /users` · `POST /users` | List (search, banned filter, paging) / create |
| `GET /users/<email>` · `DELETE /users/<email>` | Details with sessions and recent logins / delete with all data |
| `POST /users/<email>/update` · `/ban` · `/reset-password` · `/logout` · `/impersonate` · `/message` | Edit, ban or unban, set or generate a password, sign out everywhere, log in as user, send a message |
| `GET /users/<email>/export` | Download everything about a user as JSON |
| `GET /users/<email>/sessions` · `DELETE /users/<email>/sessions/<id>` · `DELETE /users/<email>/chats` | Chats of one user |
| `GET /chats` · `DELETE /chats/<id>` | Search all chats, delete a message |
| `GET /support/threads` · `GET /support/thread/<email>` · `POST /support/reply` · `DELETE /support/thread/<email>` | Support inbox |
| `POST /broadcast` | `audience: "all" \| "online"`, optional `push` |
| `GET /logs` · `GET /audit` · `DELETE /sessions/<id-prefix>` | Login history, audit log, revoke a session |
| `GET` / `POST /settings` | Sign-ups, maintenance, announcement text and colour |
| `GET /system/info` · `POST /system/purge` · `POST /system/vacuum` · `GET /system/backup` · `POST /system/kill-switch` | Maintenance tools |

---

## 9. How the frontend works

Every page loads one entry file (an ES module) that connects small modules together.

**`js/core/`: shared by all pages**

- `config.js`: URLs and timings (see 4.2).
- `api.js`: the one `fetch` wrapper. It adds the token, reads JSON and throws an `ApiError` with the server's message. A `401` with `code: "auth"` clears the token and goes to `login.html`. A `maintenance` reply fires a `beyonder:maintenance` event so the page can show a banner.
- `auth.js`: `requireLogin()` (checks `/api/me` or redirects), `logout()`, `homeFor()` (admins → `admin.html`, others → `index.html`) and the "log in as user" hand-off.
- `storage.js`: safe wrappers around `localStorage` / `sessionStorage`. A token in `sessionStorage` belongs to that one browser tab only. This is what lets an admin use "Login as user" in a new tab without losing their own login.
- `dom.js`: `h("div", {class: "x"}, children)` builds elements with `textContent`, so user text can never inject HTML. Also date helpers and avatar colours.
- `theme.js`, `toast.js`, `banner.js`: theme switch, small popup messages, announcement and maintenance banners.

**`js/chat/`: the chat page (`main.js` starts it)**

Start-up order: take over an impersonation token → theme → service worker → `requireLogin()` → session, sidebar, composer, model picker, profile window, support, install button → load profile → show the UI → load public config (banners, push) → load history → start the inbox check.

- `session.js` / `state.js`: each chat is a **session** (`chat_<random>_<time>`). `state` holds shared data in memory.
- `composer.js`: sending messages. Your bubble appears, the question goes to the AI, and when the answer arrives it is saved with `/api/save-chat`. Switching to another chat while waiting is safe. On failure an error bubble with **Try again** is shown. On phones Enter makes a new line; on a computer Enter sends and Shift+Enter makes a new line.
- `ai.js`: builds the context (admin messages are left out, same-role messages are merged, the last 40 turns are kept, it always starts with a user turn) and calls the proxy with a 60 s timeout and friendly errors.
- `prompt.js`: the system prompt, personalised with the user's name and address.
- `messages.js`, `typewriter.js`, `markdown.js`: drawing messages. Markdown is cleaned with DOMPurify, maths is drawn with KaTeX, code blocks get a **Copy** button.
- `models.js`: the **+** model menu. The choice is remembered.
- `sidebar.js`, `history.js`: menu, past chats, new chat, delete chat.
- `profile.js`, `support.js`, `inbox.js`: profile window, Chat with Admin (checks every 4 s while open, with an unread dot), delivery of admin messages (every 30 s).

**`js/auth/login.js`:** the five screens of `login.html` (login, sign-up, OTP, forgot, reset), the password strength meter and the resend countdown.

**`js/admin/`:** `main.js` is a tiny router based on the address hash (`admin.html#users?q=anu`). Each tab is one module with a `render(root, params)` function. `ui.js` holds shared pieces: popup windows, confirm and prompt dialogs, pager and badges.

**`js/pwa/`:** `register.js` (service worker + update popup), `install.js` (Install App button), `push.js` (notifications).

---

## 10. PWA and updates

`sw.js` is **network-first**: it always tries the internet first and uses its cache only when the phone is offline, so a normal reload gets the newest files. It does not take over by itself. When a new version is found, a "New version available" popup appears and **Refresh** switches to it, so nobody is interrupted in the middle of a chat. API calls are never cached. Change `SW_VERSION` in `sw.js` on a release that should clear old cached files.

---

## 11. Security notes

- Passwords are hashed with Werkzeug. Raw login tokens and OTP codes are never stored, only HMAC-SHA256 hashes (made with `SECRET_KEY`).
- Sessions are stored in the database, so a server restart does not log anybody out (they expire after 30 days).
- Rate limits are also stored in the database, so they survive restarts: failed logins, code requests per IP, code guesses.
- Banning a user, resetting a password or changing a password signs the affected devices out at once.
- An admin "Login as user" session lasts 1 hour, is marked in the session list and login log, and cannot use the admin API.
- Every admin action is written to the audit log.
- The kill switch needs `KILL_SWITCH_PASSWORD` and the typed phrase `DELETE EVERYTHING`. Download a backup first.
- Responses carry `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options`. API responses are `no-store`. Requests are limited to 2 MB.
- Admins can read all chats in the admin panel. Tell your users.
- Never upload `backend/config.py` to GitHub. It contains your secrets.

---

## 12. Troubleshooting

| Problem | Fix |
| --- | --- |
| `config.py not found in backend folder` | Run `cp config.example.py config.py` |
| `SECRET_KEY in config.py is empty` | Put a long random string in `SECRET_KEY` |
| No verification email arrives | Admin → Settings → System: **E-mail (OTP)** must say `READY`. Use a Gmail App Password, not your normal password. |
| AI answers fail with a CORS error | The proxy must allow the `Authorization` header (the current `beyonder-api` does) and its `ALLOWED_ORIGINS` must include your site |
| "Your session has expired" in the AI chat | `BACKEND_URL` on the proxy points to a different backend than the one you logged in to |
| "Can't reach the server" with the frontend on another host | Check `PYTHONANYWHERE_URL` in `config.js` and `ALLOWED_ORIGINS` in `config.py` |
| Users still see an old version | Wait for the update popup or reload. For a forced clean-up, change `SW_VERSION` |
| Everyone got logged out | `SECRET_KEY` was changed |
| Users see "under maintenance" | Admin → Settings → turn off **Maintenance mode** and press **Save settings** |
| Nobody can sign up | Admin → Settings → check that **Allow new sign-ups** is ON and saved |
| The banner does not show for a user | They may have closed it. Change the text or colour and it shows again |

---

## 13. Small dictionary

| Word | Meaning |
| --- | --- |
| **OTP** | One-Time Password. A 6-digit code sent by email that works once |
| **Token** | A random secret the browser gets after login. It proves who you are |
| **Session** | One login on one device. Also: one separate AI chat |
| **Admin** | A user whose email is in `ADMIN_EMAILS` |
| **Ban** | Block an account from logging in |
| **Impersonate / Login as user** | An admin opens the app as that user (for support) |
| **Broadcast** | One message sent to many users |
| **Announcement banner** | A coloured notice bar shown at the top of the app |
| **Maintenance mode** | Only admins can use the app. Others see a message |
| **Push notification** | A pop-up on the phone, even when the app is closed |
| **PWA** | Progressive Web App. A website that installs like a normal app |
| **VAPID keys** | The key pair needed to send push notifications |
| **Kill switch** | The button that erases all data |
| **VACUUM / Compact** | Makes the database file smaller after deleting data |

---

## Credits

Created and developed by Anubhab Dutta & Arnab Adhikari.
