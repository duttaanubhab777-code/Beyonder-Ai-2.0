# Beyonder AI — Function Reference

This document explains what every function in the frontend (`login.js`, `app.js`) does, and how it talks to the backend (`app.py` on PythonAnywhere). Paste this into `README.md` under a "How it works" section.

---

## Architecture overview

- **Frontend**: static files (`index.html`, `login.html`, `app.js`, `login.js`, `style.css`) hosted on **GitHub Pages**. Also installable as a PWA (`manifest.json`, `sw.js`).
- **Backend**: Flask app on **PythonAnywhere** (`app.py`), exposing JSON API endpoints under `/api/...`. All calls from `app.js` go through one `BACKEND_BASE` constant instead of hardcoding the URL in multiple places.
- **Auth model**: token-based. On login/signup, the server returns a random token (`uuid4`) that the frontend stores in `localStorage` under the key `beyonder_token`, then sends back on every request as an `Authorization` header. (Not cookies — this avoids third-party cookie blocking issues that happen when frontend and backend are on different domains.)
- **AI replies**: come from a separate Vercel API (`https://beyonder-api.vercel.app/api/chat`), not from the Python backend. The Python backend's job is accounts, login, chat-history logging, profile/avatar storage, and the admin messaging features below.

---

## login.js — Login / Signup / OTP / Password Reset page

### Theme toggle
```js
applyTheme(theme)
```
Switches between dark/light mode by toggling a `data-theme` attribute on `<html>` and swapping the moon/sun icon. Saves the choice to `localStorage` (`beyonder-theme`) so it persists across page loads, and defaults to the OS-level preference (`prefers-color-scheme`) the first time.

### Screen switcher
```js
const screens = ['login-screen', 'signup-screen', 'otp-screen', 'forgot-screen', 'reset-screen'];
switchScreen(target)
```
The page is a single HTML file with five "screens" (login, signup, OTP verify, forgot-password, reset-password) stacked on top of each other, only one visible at a time via a `.active` CSS class. `switchScreen()` hides all five and shows the one requested. Any element with a `data-switch="screen-id"` attribute automatically wires up a click to jump to that screen. It also clears any leftover error messages so switching screens doesn't show a stale error from a different form.

### Password show/hide toggle
Every password field has an eye icon (`.toggle-pass`) that flips the input's `type` between `password` and `text`, and swaps the icon accordingly.

### Password strength meter
```js
attachStrengthMeter(inputId, fillId, labelId)
```
A reusable function attached to **both** the signup password field and the "new password" field on the reset-password screen. On every keystroke it scores the password 0–4 based on: length ≥ 8, has an uppercase letter, has a digit, has a special character. The score drives a colored progress bar (red → orange → yellow → green → cyan) and a text label ("Too weak" → "Very strong"). This is a UX hint only — the real minimum-length rule is enforced server-side.

### Helpers
- `showError(id, msg)` / `hideError(id)` — show/hide the small red error box under a form.
- `clearAllErrors()` — hides all five forms' error boxes at once (called on every screen switch).
- `setLoading(btn, loading, loadingText)` — while a request is in flight, swaps a button's label for a spinner + custom text (e.g. "Logging in...") and disables it, so users can't double-submit.

### `apiRequest(url, payload)`
The single function every form uses to talk to the backend. It:
1. Reads the saved token from `localStorage` (if any) and attaches it as an `Authorization` header.
2. Sends a `POST` to `API_BASE + url` with the payload as JSON.
3. Parses the JSON response; if the HTTP status isn't OK, or the response has `success: false`, it throws an error with the server's message — so every calling form can just `catch` it and show it to the user.

### Login form
On submit: validates email format and non-empty password, calls `POST /api/login`. If the server returns a `token`, it's saved to `localStorage` (`beyonder_token`); the email is also saved (`beyonder-user`, for display only — never used to decide if someone is logged in). Redirects to `index.html` (the chat page) on success. On failure, shows the server's error and clears the password field.

### Signup → Send OTP
On submit: validates name/email/password (min 8 chars client-side, enforced again server-side), calls `POST /api/signup/send-otp`. On success, remembers the email in `pendingSignupEmail`, starts the resend countdown (see below), and switches to the OTP screen.

### Verify OTP
On submit: sends the 6-digit code + `pendingSignupEmail` to `POST /api/signup/verify-otp`. If correct, the server creates the account and returns a token immediately (so the user is logged in right after signing up, no separate login step needed) — token is saved, then redirect to `index.html`.

### OTP resend timer
```js
startResendTimer(context, seconds, btnId, timerId)
```
A generic countdown used by **both** the signup-OTP screen and the reset-password screen (the `context` string keeps their intervals separate so starting one doesn't cancel the other). It disables the "Resend code" link, shows a live `(NNs)` countdown next to it, and re-enables the link once it hits zero. The countdown length comes from the server's `resend_after` field in the response (currently 60 seconds), which is intentionally separate from how long the OTP itself stays valid (5 minutes) — this matches how most real-world sites behave: you can request a new code well before the old one expires.

### Forgot password → send OTP
On submit: validates the email, calls `POST /api/forgot-password/send-otp`. The server always replies with a generic success message whether or not the email exists (this prevents attackers from using the form to check which emails are registered). Switches to the reset screen and starts the resend timer.

### Reset password
On submit: validates the 6-digit code and that the new password is ≥ 8 characters, calls `POST /api/forgot-password/reset` with the email + OTP + new password. On success, returns the user to the login screen to sign in with the new password.

### Resend buttons
Two click handlers — one for the signup-OTP screen, one for the reset-password screen — that simply re-call the corresponding "send OTP" endpoint and restart that screen's timer.

---

## app.js — Chat page

### Theme toggle
Same mechanism as `login.js`, kept in sync via the same `localStorage` key so the theme choice carries over between the login page and the chat page.

### Sidebar menu
```js
openSidebar() / closeSidebar()
```
Slides in a hamburger-style side menu (overlay + panel) that holds the theme toggle, new-chat, profile, admin-chat, install, and logout entries. `openSidebar()` un-hides the overlay then adds the `active`/`open` classes a tick later so the CSS transition actually plays. `closeSidebar()` reverses it and re-hides the overlay after the transition finishes. Clicking any sidebar item (other than the theme toggle) auto-closes the menu.

### PWA install + service worker
- On page load, registers `sw.js` as the service worker (silently warns to console if that fails) so the app shell can be cached for offline use and "Add to Home Screen" installs.
- Listens for the browser's `beforeinstallprompt` event, stashes it, and reveals an install button in the sidebar; clicking that button replays the stashed prompt and hides the button once the user answers (or once `appinstalled` fires). Installing doesn't change how login works — the same `beyonder_token` in `localStorage` keeps the user signed in whether they're in the browser or the installed app.

### `checkAuth()`
Runs immediately when the chat page loads (see the self-invoking block near the bottom). It reads the token from `localStorage`; if there isn't one, it redirects straight to `login.html` without even contacting the server. If there is one, it calls `GET /api/me` with the token in the `Authorization` header. If the server says the token isn't valid (`logged_in: false`), it redirects to login; otherwise it removes the `checking-auth` CSS class from `<body>` (which is what reveals the chat UI — until this point the chat area and input box are hidden via CSS, so a logged-out visitor never sees a flash of the chat interface before being redirected). On success it also loads the saved profile avatar into the nav bar and starts admin-message polling before loading chat history.

### Chat rendering
- `appendMessage(text, type, {animate})` — adds a message bubble to the chat area. Incoming (AI) messages get a "logo" avatar and are rendered through `marked.js` (Markdown → HTML) plus KaTeX (for `$...$` math); outgoing (user) messages are shown as plain text.
- `typeWriterEffect(element, text, parentDiv)` — for new AI replies, reveals the Markdown-rendered text one character at a time (with slightly longer pauses after punctuation) to simulate typing, then re-parses the *complete* text once finished (so code blocks/math render correctly, since partial Markdown can look broken mid-type). Adds a copy button under the finished message.
- `renderInstant(element, text, parentDiv)` — same rendering as above but without the typing animation; used when restoring chat history from a previous session so old messages don't "retype" themselves.
- `addCodeCopyButtons(container)` — scans rendered Markdown for `<pre>` code blocks and injects a small "Copy" button into each one.
- `showTypingIndicator()` / `removeTypingIndicator()` — the three-dot "AI is typing" bubble shown while waiting for a reply.

### History persistence
- `saveHistory()` / `loadHistory()` — the whole conversation (`chatHistory` array, in the shape Gemini's API expects: `{role, parts}`) is saved to `localStorage` (`beyonder-chat-history`) after every message, so refreshing the page doesn't lose the conversation. `loadHistory()` is what actually populates the chat area on page load — if no history exists yet, it shows the welcome message instead.
- `startNewChat()` — wipes the in-memory history and localStorage, resets the chat area, and shows the welcome message again. Triggered by the "+" (new chat) button.

### `getGeminiResponse(userText)`
The core send/receive flow:
1. Pushes the user's message into `chatHistory` and saves it.
2. Sends the *entire* conversation so far, plus a fixed system-instruction prompt (defining the "Beyonder AI" persona and telling it not to reveal it's built on Gemini unless directly asked), to the Vercel proxy API.
3. On a successful reply, pushes the AI's text into history, saves it, and — separately — calls `saveToFriendDatabase()` to log the exchange in the Python backend's database (for the admin dashboard).
4. On any failure (blocked by safety filters, network error), removes the just-added user turn from history so a failed exchange doesn't pollute future context, and shows an apologetic message instead.
5. `finally` always re-enables the input box and refocuses it.

### `saveToFriendDatabase(userText, aiText)`
Sends the completed exchange to `POST /api/save-chat` on the Python backend, with the token in the `Authorization` header (this is one of several endpoints on the backend that require being logged in, enforced by an `@api_login_required` decorator in `app.py`). This is fire-and-forget: if it fails, it's only logged to the console, since a chat-history-saving failure shouldn't interrupt the user's conversation.

### Admin → user message push (`pollAdminMessages`)
Lets an admin drop a message directly into a specific user's chat from the admin dashboard, without the user having asked anything. Every 30 seconds (`ADMIN_MESSAGE_POLL_MS`), `pollAdminMessages()` calls `GET /api/check-messages?since_id=...` (the last-seen ID is remembered in `localStorage` under `beyonder-last-admin-msg-id`). Any new messages are appended to `chatHistory` as normal `"model"` turns and rendered with `appendMessage()`, so they look exactly like a regular AI reply — there's no separate UI for this, it just quietly injects into the same conversation.

### `logoutUser()`
Clears the chat history, the auth token, and the admin-message watermark from `localStorage`, tells the backend to invalidate the token (`POST /api/logout`, which deletes it from the server's `active_tokens` dict), then redirects to `login.html` regardless of whether that server call succeeded (`.finally`) — so a logout always works from the user's point of view even if the network request fails.

### Composer
- `setComposerDisabled(disabled)` — greys out the send button and textarea while a reply is being fetched, so a user can't send a second message mid-reply.
- `handleSend()` — reads the textarea, appends the user's bubble, clears/resets the textarea height, disables the composer, shows the typing indicator, and kicks off `getGeminiResponse()`.
- The `Enter` key is intercepted to insert a newline into the textarea instead of submitting (there's no explicit "send on Enter" — sending only happens via the send button), and the textarea auto-grows as text wraps to new lines.

### Profile settings modal
A modal (opened via `openProfileModal()`, closed via `closeProfileModal()`) for viewing/editing the account's display name and avatar, and changing the password.
- On open, it loads the current name/email/avatar from `GET /api/profile` and populates the form; email is shown read-only.
- **Avatar upload**: clicking the upload button opens a file picker; the chosen image is drawn onto a hidden `<canvas>`, cropped/scaled to a 256×256 square, and re-encoded as a JPEG data URL (`pendingAvatarDataUrl`) — this keeps stored photos small — before being shown in the preview.
- **Save profile** (`profileSaveBtn`): sends the name (and the new avatar data URL, if one was picked) to `POST /api/profile/update`. On success, updates the nav-bar avatar immediately via `setNavAvatar()`.
- **Change password** (`passwordSaveBtn`): validates both fields are filled and the new password is ≥ 8 characters, then sends `current_password`/`new_password` to `POST /api/profile/change-password`.
- `setNavAvatar(dataUrlOrNull, name)` — draws the small avatar circle in the top nav: either the user's uploaded photo, or (if none) a colored circle with their first initial. `colorForName(name)` deterministically picks one of a fixed palette of 20 colors from a hash of the name, so the same name always gets the same color.
- `setStatus(el, message, kind)` — shared helper for showing a success/error line under the profile or password forms.

### Chat-with-admin modal
A separate, two-way private conversation between the logged-in user and a human admin — entirely distinct from the AI chat above (its own modal, own message list, own send box).
- `openAdminChatModal()` — resets the local message list, does an immediate poll, then polls `GET /api/admin-chat/messages?since_id=...` every 4 seconds (`adminChatPollTimer`) while the modal is open; `closeAdminChatModal()` stops the polling.
- `renderAdminChatMessages()` — renders each message bubble labeled "You" or "Admin" with a timestamp, escaping message text via `escapeAdminChatHtml()` to avoid HTML injection.
- `sendAdminChatMessage()` — posts the typed message to `POST /api/admin-chat/send`, then immediately re-polls so the sent message shows up right away. Wired to both the send button and pressing Enter (without Shift) in the textarea, which also auto-grows as you type.

---

## sw.js — Service worker (PWA offline support)

Caches only the static "app shell" (`index.html`, `login.html`, `style.css`, `app.js`, `login.js`, `manifest.json`, icons) under a versioned cache name, so an installed copy of the app opens instantly and the UI itself works offline. Any request that looks like an API call (path contains `/api/` or `/admin/`) or is cross-origin is always sent straight to the network — the service worker deliberately never caches login, chat, profile, or admin traffic, so nobody sees stale auth or conversation data. Uses a stale-while-revalidate strategy for shell files: serve the cached copy instantly, then quietly refetch and update the cache in the background.

---

## Backend endpoints referenced above (in `app.py`)

| Endpoint | Purpose |
|---|---|
| `POST /api/login` | Email + password → returns a token |
| `POST /api/signup/send-otp` | Starts signup, emails a 6-digit code |
| `POST /api/signup/verify-otp` | Confirms the code, creates the account, returns a token |
| `POST /api/forgot-password/send-otp` | Emails a reset code (always reports success, even for unknown emails) |
| `POST /api/forgot-password/reset` | Confirms the reset code, sets a new password |
| `GET /api/me` | Given a token, confirms whether it's still valid |
| `POST /api/logout` | Invalidates a token server-side |
| `POST /api/save-chat` | Logs one AI-chat exchange to the database (requires a valid token) |
| `GET /api/check-messages` | Polled by the chat page; returns any new messages an admin pushed directly into this user's chat |
| `GET /api/profile` | Returns the logged-in user's name, email, and avatar |
| `POST /api/profile/update` | Updates the display name and/or avatar image |
| `POST /api/profile/change-password` | Changes the account password (requires current password) |
| `GET /api/admin-chat/messages` | Polled by the admin-chat modal; returns new messages in the user↔admin thread |
| `POST /api/admin-chat/send` | Sends a message from the user into the admin-chat thread |
| `GET /admin`, `POST /admin/login`, `POST /admin/delete-user` | Separate, session-cookie-based admin dashboard — unrelated to the token system above |

Tokens and pending OTPs are stored **in memory** (plain Python dicts), not in the database — meaning a server restart on PythonAnywhere logs everyone out and clears any in-progress signups/resets. This is a known, accepted limitation for a small project; a production app would move these into the database or a cache like Redis.

