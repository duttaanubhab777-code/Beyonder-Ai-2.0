# Beyonder AI 2.0

A friendly, installable AI chat app with accounts, chat history, an admin dashboard and push notifications.

Created by **Anubhab Dutta** & **Arnab Adhikari**.

- **Frontend**: plain HTML / CSS / JavaScript (ES modules). No build step, no framework.
- **Backend**: Flask + SQLite, organised as a small Python package (`backend/beyonder`).
- **AI**: a separate proxy, the `beyonder-api` repo on Vercel, that talks to Gemini and Groq.

---

## Features

**For users**

- Sign up with e-mail OTP, log in, forgot / reset password
- Chat with the AI: Markdown, code blocks with a copy button, maths (KaTeX), typing animation (tap the bubble to skip), "Try again" on failures
- Four AI models from the **+** button: ✨ Normal, ⚡ Smart, 🧠 Thinker, 🚀 Speedy
- Many chats: the history panel lists past chats, open or delete any of them
- Profile: name, optional address (the AI can use it), photo (cropped to 256×256 in the browser), change password, sign out other devices, delete account
- **Chat with Admin**: a private two-way line to the admin, separate from the AI chat
- Admin messages and broadcasts appear inside the chat; optional phone push notifications
- Dark / light theme, installable PWA, "New version available" popup after every deploy

**For admins** (`admin.html`)

| Tab       | What you can do                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview  | totals, who is online right now, sign-up and message charts (14 days)                                                                                                       |
| Users     | search, create, edit, add a private note, ban / unban, reset password, sign out everywhere, revoke one session, message, export data (JSON), delete, **log in as the user** |
| Chats     | search every conversation by text or user, delete messages                                                                                                                  |
| Support   | inbox of the "Chat with Admin" threads, unread badge, reply, delete                                                                                                         |
| Broadcast | message everyone (or only people online) with optional push                                                                                                                 |
| Logs      | login history (filter by e-mail / success) and the admin audit trail                                                                                                        |
| Settings  | open / close sign-ups, maintenance mode, announcement banner, system status, database backup, vacuum, purge old data, kill switch                                           |

---

## How it fits together

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

1. The browser logs in at the Flask backend and receives a random **token**. It is kept in `localStorage` (`beyonder_token`) and sent as the `Authorization` header on every call. No cookies are used, so the frontend can live on a different domain than the backend.
2. To answer a message, the browser sends the conversation + the chosen model to the **AI proxy** (never directly to Gemini / Groq, so no API key is ever in the browser).
3. When the answer arrives, the browser saves the exchange in the backend (`/api/save-chat`) so it appears in the history and in the admin's Chats tab.

The backend can also serve the frontend itself (`SERVE_FRONTEND = True`, the default). On `localhost` and on `*.pythonanywhere.com` the frontend then calls `/api/...` on the same origin, which means one deployment is enough.

---

## Project structure

```
Beyonder-Ai-2.0/
├── README.md
├── backend/
│   ├── run.py                  # local dev server  (python run.py)
│   ├── wsgi.py                 # entry point for PythonAnywhere
│   ├── config.example.py       # copy to config.py (never committed)
│   ├── requirements.txt
│   └── beyonder/
│       ├── __init__.py         # create_app(): wires everything together
│       ├── settings.py         # reads config.py -> typed Settings
│       ├── database/           # one file per table: only SQL lives here
│       │   ├── schema.py       #   tables, indexes, safe auto-migrations
│       │   └── users, chats, auth_tokens, otp_codes, rate_limits, notifications,
│       │       support, push_subscriptions, login_logs, audit, app_settings,
│       │       stats, maintenance, connection
│       ├── services/           # business logic
│       │   ├── auth_service.py #   login, sessions, admin check
│       │   ├── otp_service.py  #   e-mail codes (signup + reset)
│       │   ├── mailer.py       #   Gmail SMTP
│       │   ├── push_service.py #   Web Push (VAPID)
│       │   ├── rate_limit.py, security.py, housekeeping.py, deploy_service.py
│       ├── middleware/         # login_required / admin_required, maintenance gate, headers
│       ├── routes/             # HTTP endpoints
│       │   ├── auth, chat, profile, support, push, health, webhook
│       │   └── admin/          #   overview, users, chats, support, broadcast, logs, system
│       └── utils/              # responses, validators, time, request info
└── frontend/
    ├── index.html              # chat app
    ├── login.html              # login / signup / OTP / forgot / reset
    ├── admin.html              # admin dashboard
    ├── manifest.json, sw.js    # PWA
    ├── assets/icons/
    ├── css/
    │   ├── main.css            # imports everything below (the pages link only this)
    │   ├── base/  layout/  components/  chat/  pages/
    └── js/
        ├── core/               # config, api, auth, storage, dom, theme, toast, banner
        ├── chat/               # the chat page (main.js is the entry point)
        ├── auth/login.js       # the login page
        ├── admin/              # the dashboard (one file per tab)
        └── pwa/                # service-worker registration, install button, push
```

---

## Quick start (on your computer or phone)

```bash
cd backend
cp config.example.py config.py      # then edit it (see "Configuration")
pip install -r requirements.txt
python run.py
```

Open `http://localhost:5000`. The backend serves the frontend, so that is all.

`run.py` starts Flask in debug mode and listens on all interfaces so a phone on the same Wi-Fi can open it. It is for development only. In production the server uses `wsgi.py`.

The database is created automatically at `backend/data/beyonder.db` the first time the app starts. When you update the code later, new columns and indexes are added to an existing database by themselves, so users and chats survive.

---

## Configuration

### `backend/config.py`

Required:

| Setting        | Meaning                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECRET_KEY`   | A long random string. The app refuses to start while it is empty or still the placeholder. It is used to hash tokens and OTPs, so **changing it signs everybody out**. |
| `ADMIN_EMAILS` | List of e-mails that are admins, e.g. `["you@gmail.com"]`.                                                                                                             |

E-mail (needed for signup and password-reset codes):

| Setting              | Meaning                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GMAIL_ADDRESS`      | The Gmail account that sends the codes                                                                                |
| `GMAIL_APP_PASSWORD` | A Gmail **App Password** (Google account → Security → 2-Step Verification → App passwords). Not your normal password. |

Optional (defaults in brackets):

| Setting                                                             | Meaning                                                                                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS`                                                   | Websites allowed to call the API from another domain, e.g. `["https://yourname.github.io"]`. Empty = any. Not needed when the backend serves the frontend itself. |
| `OTP_EXPIRY_SECONDS` (600) · `OTP_RESEND_COOLDOWN_SECONDS` (60)     | Code lifetime and the wait before another code can be requested                                                                                                   |
| `OTP_MAX_VERIFY_ATTEMPTS` (5) · `OTP_SEND_MAX_PER_HOUR_PER_IP` (10) | Brute-force limits for codes                                                                                                                                      |
| `LOGIN_MAX_ATTEMPTS` (5) · `LOGIN_ATTEMPT_WINDOW_SECONDS` (900)     | Failed-login limit per e-mail (an IP gets 4× as many)                                                                                                             |
| `MIN_PASSWORD_LENGTH` (8) · `MAX_PASSWORD_LENGTH` (128)             | Password rules                                                                                                                                                    |
| `TOKEN_MAX_AGE_SECONDS` (30 days)                                   | How long a login lasts                                                                                                                                            |
| `PRESENCE_ONLINE_WINDOW_SECONDS` (90)                               | "Online now" means seen within this time                                                                                                                          |
| `CHAT_HISTORY_LIMIT` (300)                                          | Messages loaded when a chat is opened                                                                                                                             |
| `MAX_AVATAR_BASE64_CHARS` (400000)                                  | Maximum profile-photo size                                                                                                                                        |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIM_EMAIL`        | Enable Web Push (see below)                                                                                                                                       |
| `KILL_SWITCH_PASSWORD`                                              | Enables the "Erase all data" button. Empty = button disabled.                                                                                                     |
| `WEBHOOK_SECRET`, `PYTHONANYWHERE_WSGI_FILE`                        | Enable GitHub → PythonAnywhere auto-deploy (see below)                                                                                                            |
| `DB_PATH` (`backend/data/beyonder.db`) · `SERVE_FRONTEND` (`True`)  | Database location · let Flask serve `frontend/`                                                                                                                   |

### `frontend/js/core/config.js`

The only frontend file you ever edit for URLs:

```js
const PYTHONANYWHERE_URL = "https://<your-user>.pythonanywhere.com"; // the Flask backend
const AI_API_URL = "https://<your-project>.vercel.app/api/chat"; // the beyonder-api proxy
```

`API_BASE` is empty (same origin) on `localhost`, `127.0.0.1` and `*.pythonanywhere.com`, and `PYTHONANYWHERE_URL` anywhere else. The same file holds the polling intervals (`INBOX_POLL_MS`, `SUPPORT_POLL_MS`, …), `AI_CONTEXT_TURNS` (how many past messages are sent to the AI, 40) and `AI_TIMEOUT_MS` (60 s).

### Make yourself an admin

1. Put your e-mail in `ADMIN_EMAILS` and restart / reload.
2. Sign up normally with that e-mail.
3. Log in. Admins are sent straight to `admin.html`; the 💬 button in its header opens the chat app. In the chat menu, admins also get an **Admin Panel** shortcut.

---

## Deploying

### 1. Backend on PythonAnywhere

1. In a Bash console: clone the repo, then `cd <repo>/backend`, `pip install --user -r requirements.txt`, `cp config.example.py config.py` and edit it.
2. **Web** tab → _Add a new web app_ → _Manual configuration_ (pick your Python version).
3. Open the WSGI configuration file and replace its content with:

    ```python
    import sys
    path = "/home/<your-user>/<repo-folder>/backend"
    if path not in sys.path:
        sys.path.insert(0, path)

    from beyonder import create_app
    application = create_app()
    ```

    (This is exactly what `backend/wsgi.py` does. That file is there for hosts that start the app with a command such as `gunicorn wsgi:application`.)

4. Press **Reload**, then open `https://<your-user>.pythonanywhere.com/api/health`. It should answer `{"success": true, "status": "ok", ...}`.

Because `SERVE_FRONTEND` is on, `https://<your-user>.pythonanywhere.com/` is already the full app. You do not need to set up static files.

### 2. AI proxy on Vercel

Deploy the `beyonder-api` repo and set `GEMINI_API_KEY`, `GROQ_API_KEY` and (recommended) `BACKEND_URL`. Everything is explained in that repo's README. Then put its URL into `AI_API_URL` above.

### 3. Frontend on another host (optional)

The `frontend/` folder is plain static files, so any static host works. If you do this, put the frontend's origin (for example `https://yourname.github.io`) into `ALLOWED_ORIGINS` in `config.py` and the proxy's `ALLOWED_ORIGINS`.

### 4. Auto-deploy from GitHub (optional)

1. Set `WEBHOOK_SECRET` to a random string, and `PYTHONANYWHERE_WSGI_FILE` to the path shown on the Web tab (for example `/var/www/<your-user>_pythonanywhere_com_wsgi.py`).
2. GitHub repo → Settings → Webhooks → Add webhook: Payload URL `https://<your-user>.pythonanywhere.com/api/webhook`, content type `application/json`, the same secret, "Just the push event".
3. On every push the server runs `git pull --ff-only` and touches the WSGI file, which reloads the app. Requests are accepted only with a valid GitHub signature (`X-Hub-Signature-256`) or the `X-Webhook-Secret` header.

### 5. Push notifications (optional)

Generate a VAPID key pair (for example `npx web-push generate-vapid-keys`) and fill `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_CLAIM_EMAIL` (`mailto:you@example.com`). `pywebpush` is in `requirements.txt`. Admin → Settings → System shows whether push is ready. Users then see **Enable Notifications** in their menu; nothing ever prompts on its own.

---

## API reference

Everything is JSON. Success: `{ "success": true, ... }`. Failure: `{ "success": false, "message": "...", "code"?: "auth" | "forbidden" | "maintenance" }` with a suitable HTTP status. Tokens go in the `Authorization` header.

### Public

| Endpoint                             | Purpose                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `GET /api/health`                    | Is the server alive                                                                           |
| `GET /api/public-config`             | Announcement, maintenance state, sign-ups open?, push available?                              |
| `POST /api/login`                    | e-mail + password → token                                                                     |
| `POST /api/signup/send-otp`          | Validates the form and e-mails a 6-digit code                                                 |
| `POST /api/signup/verify-otp`        | Checks the code, creates the account, returns a token (logged in straight away)               |
| `GET /api/me`                        | Is this token still valid? (`logged_in`, `is_admin`, `impersonated`)                          |
| `POST /api/logout`                   | Revokes the token                                                                             |
| `POST /api/forgot-password/send-otp` | Sends a reset code. Always answers success, so it can't be used to find out who is registered |
| `POST /api/forgot-password/reset`    | Code + new password; signs the user out everywhere                                            |
| `GET /api/push/vapid-public-key`     | Public key for Web Push                                                                       |
| `POST /api/webhook`                  | GitHub auto-deploy                                                                            |

### Logged-in user

| Endpoint                                                         | Purpose                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `POST /api/logout-all`                                           | Sign out every other device                                      |
| `POST /api/save-chat`                                            | Store one exchange (`user_message`, `ai_response`, `session_id`) |
| `GET /api/chat-history?session_id=`                              | Messages of one chat (admin messages carry `source: "admin"`)    |
| `GET /api/chat-sessions` · `DELETE /api/chat-sessions/<id>`      | List / delete chats                                              |
| `GET /api/inbox?session_id=`                                     | Delivers pending admin messages / broadcasts into that chat      |
| `GET /api/profile` · `POST /api/profile/update`                  | Read / change name, address, avatar                              |
| `POST /api/profile/change-password`                              | Needs the current password; other devices are signed out         |
| `POST /api/profile/delete-account`                               | Needs the password; erases the account and all data              |
| `POST /api/push/subscribe` · `POST /api/push/unsubscribe`        | Register / remove this device                                    |
| `POST /api/support/send` · `GET /api/support/messages?since_id=` | "Chat with Admin"                                                |

### Admin (`/api/admin/...`, admins only)

| Endpoint                                                                                                              | Purpose                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /overview` · `GET /online`                                                                                       | Dashboard numbers, online users                                                                |
| `GET /users` · `POST /users`                                                                                          | List (search, banned filter, paging) / create                                                  |
| `GET /users/<email>` · `DELETE /users/<email>`                                                                        | Details with sessions and recent logins / delete with all data                                 |
| `POST /users/<email>/update` · `/ban` · `/reset-password` · `/logout` · `/impersonate` · `/message`                   | Edit, ban or unban, set or generate a password, sign out everywhere, log in as, send a message |
| `GET /users/<email>/export`                                                                                           | Download everything about a user as JSON                                                       |
| `GET /users/<email>/sessions` · `DELETE /users/<email>/sessions/<id>` · `DELETE /users/<email>/chats`                 | Chats of one user                                                                              |
| `GET /chats` · `DELETE /chats/<id>`                                                                                   | Search all chats, delete a message                                                             |
| `GET /support/threads` · `GET /support/thread/<email>` · `POST /support/reply` · `DELETE /support/thread/<email>`     | Support inbox                                                                                  |
| `POST /broadcast`                                                                                                     | `audience: "all" \| "online"`, optional `push`                                                 |
| `GET /logs` · `GET /audit` · `DELETE /sessions/<id-prefix>`                                                           | Login history, audit trail, revoke a session                                                   |
| `GET` / `POST /settings`                                                                                              | Sign-ups, maintenance, announcement                                                            |
| `GET /system/info` · `POST /system/purge` · `POST /system/vacuum` · `GET /system/backup` · `POST /system/kill-switch` | Maintenance tools                                                                              |

---

## How the frontend works

Every page loads one ES-module entry point, which wires the small modules together.

**`js/core/`: shared by all pages**

- `config.js`: URLs and timings (see above).
- `api.js`: the one `fetch` wrapper. Adds the token, parses JSON and throws an `ApiError` carrying the server's message. A `401` with `code: "auth"` clears the token and redirects to `login.html`. A `maintenance` reply fires a `beyonder:maintenance` event so the page can show a banner.
- `auth.js`: `requireLogin()` (checks `/api/me` or redirects), `logout()`, `homeFor()` (admins → `admin.html`, others → `index.html`) and the "log in as user" hand-off.
- `storage.js`: safe wrappers around `localStorage` / `sessionStorage`. A token in `sessionStorage` belongs to that one tab only. This is what lets an admin "log in as" a user in a new tab without losing their own login.
- `dom.js`: `h("div", {class: "x"}, children)` builds elements with `textContent`, so user text can never inject HTML. Also date helpers and the avatar colour palette.
- `theme.js`, `toast.js`, `banner.js`: theme toggle, toasts, announcement / maintenance banners.

**`js/chat/`: the chat page (`main.js` boots it)**

Boot order: take over an impersonation token → theme → register service worker → `requireLogin()` → session, sidebar, composer, model picker, profile modal, support, install button → load profile → reveal the UI → load public config (banners, push) → load history → start the inbox poll.

- `session.js` / `state.js`: each chat is a **session** (`chat_<random>_<time>`); `state` is the shared in-memory data.
- `composer.js`: sending. The user's bubble is shown, the question goes to the AI and, when the answer arrives, it is saved with `/api/save-chat`. Switching to another chat mid-answer is safe because the session id is captured first. On failure the turn is removed from the context and an error bubble with **Try again** is shown. On phones Enter inserts a new line; on a computer Enter sends and Shift+Enter inserts a new line.
- `ai.js`: builds the context (admin messages are left out, consecutive same-role messages are merged, the last 40 turns are kept and it always starts with a user turn) and calls the proxy with a 60 s timeout and friendly error messages.
- `prompt.js`: the system prompt, personalised with the user's name and address.
- `messages.js`, `typewriter.js`, `markdown.js`: drawing messages. Markdown is sanitised with DOMPurify, maths is rendered with KaTeX, code blocks get a **Copy** button.
- `models.js`: the **+** model menu, the choice is remembered.
- `sidebar.js`, `history.js`: menu, past chats, new chat, delete chat.
- `profile.js`, `support.js`, `inbox.js`: profile modal, Chat with Admin (polls every 4 s while open, with an unread dot), delivery of admin messages (every 30 s).

**`js/auth/login.js`:** the five screens of `login.html` (login, sign-up, OTP, forgot, reset), the password strength meter and the resend countdown that follows the server's `resend_after`.

**`js/admin/`:** `main.js` is a tiny hash router (`admin.html#users?q=anu`) and each tab is one module with a `render(root, params)` function. `ui.js` holds the shared modal, confirm / prompt dialogs, pager and badges.

**`js/pwa/`:** `register.js` (service worker + update popup), `install.js` (Install App button), `push.js` (notifications).

---

## PWA and updates

`sw.js` is **network-first**: it always tries the real network and uses its cache only when the device is offline, so a normal reload always gets the newest files. It does not take over by itself. When a new version is found, a "New version available" popup appears and **Refresh** activates it, so nobody is interrupted in the middle of a chat. API calls are never cached. Bump `SW_VERSION` in `sw.js` on a release that should clear old cached files.

---

## Security notes

- Passwords are hashed with Werkzeug. Raw login tokens and OTPs are never stored: only HMAC-SHA256 hashes (keyed with `SECRET_KEY`).
- Sessions live in the database, so a server restart does not log anybody out (they expire after 30 days).
- Rate limits are stored in the database too, so they survive restarts and work with several workers: failed logins, code requests per IP, code guesses.
- Banning a user, resetting a password or changing a password signs the affected devices out immediately.
- An admin "log in as user" session lasts 1 hour, is marked in the session list and the login log, and cannot use the admin API.
- Every admin action is written to the audit log.
- The kill switch needs `KILL_SWITCH_PASSWORD` plus the typed phrase `DELETE EVERYTHING`. Download a backup first.
- Responses carry `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options`; API responses are `no-store`. Requests are limited to 2 MB.
- Admins can read all chats from the dashboard. Tell your users.

---

## Troubleshooting

| Problem                                                    | Fix                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `config.py not found in backend folder`                    | `cp config.example.py config.py`                                                                                                   |
| `SECRET_KEY in config.py is empty`                         | Put a long random string in `SECRET_KEY`                                                                                           |
| No verification e-mail arrives                             | Admin → Settings → System: "E-mail (OTP)" must say READY. Use a Gmail App Password, not your normal password.                      |
| AI answers fail in the browser with a CORS error           | The proxy must allow the `Authorization` header (the current `beyonder-api` does) and its `ALLOWED_ORIGINS` must include your site |
| "Your session has expired" in the AI chat                  | `BACKEND_URL` on the proxy points at a different backend than the one you logged in to                                             |
| "Can't reach the server" with the frontend on another host | Check `PYTHONANYWHERE_URL` in `config.js` and `ALLOWED_ORIGINS` in `config.py`                                                     |
| Users still see an old version                             | Wait for the update popup or reload; for a forced clean-up bump `SW_VERSION`                                                       |
| Everyone got logged out                                    | `SECRET_KEY` was changed                                                                                                           |

---

## Credits

Created and developed by Anubhab Dutta & Arnab Adhikari.
