# Beyonder AI — Function Reference

This document explains what every function in the frontend (`login.js`, `app.js`, `pwa-update.js`, `sw.js`) does, and how it talks to the backend (`app.py` on PythonAnywhere). Paste this into `README.md` under a "How it works" section.

---

## Architecture overview

- **Frontend**: static files (`index.html`, `login.html`, `app.js`, `login.js`, `pwa-update.js`, `style.css`) hosted on **GitHub Pages**, installable as a **PWA** (`manifest.json`, `sw.js`).
- **Backend**: Flask app on **PythonAnywhere** (`app.py`, at `https://anubhabdutta.pythonanywhere.com`), exposing JSON API endpoints under `/api/...`. All calls to it go through a single `BACKEND_BASE` constant in `app.js` so the URL only lives in one place.
- **Auth model**: token-based. On login/signup, the server returns a random token (`uuid4`) that the frontend stores in `localStorage` under the key `beyonder_token`, then sends back on every request as an `Authorization` header. (Not cookies — this avoids third-party cookie blocking issues that happen when frontend and backend are on different domains.)
- **AI replies**: come from a separate Vercel API (`https://beyonder-api.vercel.app/api/chat`), not from the Python backend. That proxy now fans out to **multiple AI providers** (Gemini, GPT-OSS, Qwen, Groq) depending on what the user picked. The Python backend's job is only accounts, login, chat history/sessions, profile data, push notifications, and the admin-facing features.

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
The single function every form uses to talk to the backend (`API_BASE = "https://anubhabdutta.pythonanywhere.com"`). It:
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

### Session bootstrap
```js
generateSessionId()
```
Every conversation now belongs to a **session** (`chat_<random>_<timestamp>`), not just one giant history. On page load, the last-used session ID is read from `localStorage` (`beyonder-current-session`); if none exists yet, a fresh one is generated and saved. `currentSessionId` is what every history/save call is scoped to.

### Admin "Login As" hand-off
An IIFE at the top of the file checks the URL for an `?admin_token=...` query param (set by the admin dashboard's "Login As" button). If present, it adopts that token as this browser's own `beyonder_token`, then rewrites the URL to strip the parameter out (via `history.replaceState`) so the token doesn't linger visibly in the address bar or browser history.

### Theme toggle
Same mechanism as `login.js`, kept in sync via the same `localStorage` key so the theme choice carries over between the login page and the chat page.

### Sidebar menu
- `openSidebar()` / `closeSidebar()` — slide the main hamburger sidebar (or the history sidebar, whichever is open) in/out along with a dimmed overlay. `closeSidebar()` now closes *either* sidebar, since only one can be open at a time.
- `openHistorySidebar()` — swaps the main sidebar out for a second "chat history" sidebar and triggers `loadSidebarSessions()` to populate it. Clicking the "History" item in the main sidebar opens this instead of just closing the menu.

### PWA install button
`installBtn` only becomes visible once the browser fires `beforeinstallprompt` (proof the app is actually installable). Clicking it replays the saved prompt event and hides the button once the user has answered it or the app reports itself installed (`appinstalled`). Service-worker registration and update handling now live separately in `pwa-update.js` (see below).

### Code-block copy buttons
`addCodeCopyButtons(container)` scans rendered Markdown for `<pre>` code blocks and injects a small "Copy" button into each one.

### Message rendering
- `typeWriterEffect(element, htmlText, parentDiv)` — for new AI replies, reveals the Markdown-rendered text one character at a time (with slightly longer pauses after punctuation) to simulate typing, then re-parses the *complete* text once finished (so code blocks/math render correctly, since partial Markdown can look broken mid-type). Adds a copy button under the finished message.
- `renderInstant(element, plainText, parentDiv)` — same rendering as above but without the typing animation; used when restoring chat history from a previous session so old messages don't "retype" themselves.
- `appendMessage(text, type, { animate })` — adds a message bubble to the chat area. If the welcome hero (see below) is still showing, it's removed first. Incoming (AI) messages get a "logo" avatar and route through `typeWriterEffect`/`renderInstant`; outgoing (user) messages are shown as plain text.
- `showTypingIndicator()` / `removeTypingIndicator()` — the three-dot "AI is typing" bubble shown while waiting for a reply.

### Welcome hero
```js
showWelcomeHero()
```
Replaces the old plain "welcome message" bubble with a proper empty-state screen: a logo, greeting, and four tappable **suggestion chips** (`SUGGESTION_CHIPS`, e.g. "Plan a weekend trip for me"). Tapping a chip fills the composer with that prompt and immediately calls `handleSend()`. Shown whenever a session has no history yet (a brand-new session, or the very first time a fresh account opens the chat).

### Multi-provider model picker
```js
updateModelButtonUI(providerName)
updateMenuCheckmark(providerName)
```
The chat page can now talk to more than one AI backend — **Gemini, GPT-OSS, Qwen, or Groq** — chosen from a small popup menu next to the composer. `currentProvider` is read from/written to `localStorage` (`beyonder-provider`, defaulting to `"gemini"`). `updateModelButtonUI()` updates the button's icon/label to match the active provider; `updateMenuCheckmark()` puts a ✔ next to whichever option is currently selected inside the popup and greys out the rest. The chosen `provider` string is sent as part of every request in `getGeminiResponse()`, and the Vercel proxy is what actually routes it to the right model — the frontend itself doesn't know how to talk to each provider directly.

### `checkAuth()`
Runs immediately when the chat page loads. It reads the token from `localStorage`; if there isn't one, it redirects straight to `login.html` without even contacting the server. If there is one, it calls `GET /api/me` with the token in the `Authorization` header. If the server says the token isn't valid (`logged_in: false`), it redirects to login; otherwise the caller goes on to reveal the chat UI (see the init block below).

### History & session persistence
- `saveHistory()` / `loadHistory()` — `chatHistory` (in the shape Gemini's API expects: `{role, parts}`) is saved to `localStorage` (`beyonder-chat-history`) after every message as a local cache. `loadHistory()` now primarily asks the server for `GET /api/chat-history?session_id=<currentSessionId>` — if the server has history for that session it's rendered instantly (`renderInstant`, no retyping); if not, `chatHistory` is reset and `showWelcomeHero()` is shown instead.
- `startNewChat()` — generates a fresh session ID (`generateSessionId()`), saves it as `beyonder-current-session`, clears the visible chat, and shows the welcome hero. Also closes the sidebar and refreshes the sidebar's session list. Triggered by the "+" (new chat) button.
- `loadSidebarSessions()` — fetches `GET /api/chat-sessions` and renders one button per past conversation in the history sidebar (title truncated to 25 characters), highlighting whichever one is currently open. Clicking a past session switches `currentSessionId`, reloads its history, refreshes the list, and closes the sidebar. If the backend doesn't support this endpoint yet, a friendly "Backend needs update to show history" message is shown instead of breaking. Called automatically whenever a message is saved (`saveToFriendDatabase`) so the sidebar's titles/ordering stay current.

### `getGeminiResponse(userText)`
The core send/receive flow:
1. Pushes the user's message into `chatHistory` and saves it.
2. Sends the *entire* conversation so far, the selected `provider`, and a fixed system-instruction prompt (defining the "Beyonder AI" persona, optionally personalized with the user's saved name/address from their profile, and telling it not to reveal it's built on Gemini unless directly asked), to the Vercel proxy API.
3. On a successful reply, pushes the AI's text into history, saves it, and — separately — calls `saveToFriendDatabase()` to log the exchange (scoped to `currentSessionId`) in the Python backend's database.
4. On any failure (blocked by safety filters, network error), removes the just-added user turn from history so a failed exchange doesn't pollute future context, and shows an apologetic message instead.
5. `finally` always re-enables the input box and refocuses it.

### `saveToFriendDatabase(userText, aiText)`
Sends the completed exchange to `POST /api/save-chat` on the Python backend, with the token in the `Authorization` header and the current `session_id`. This is fire-and-forget: if it fails, it's only logged to the console. On success it also calls `loadSidebarSessions()` so a brand-new session immediately shows up (titled) in the history sidebar.

### Admin message polling
```js
pollAdminMessages()
```
Lets an admin drop a message directly into a user's chat from the admin dashboard, without the user needing to do anything. Every 30 seconds (`ADMIN_MESSAGE_POLL_MS`) it calls `GET /api/check-messages?since_id=...` (the "since" cursor is remembered in `localStorage` as `beyonder-last-admin-msg-id`), and any new messages are pushed into `chatHistory` and rendered as ordinary incoming bubbles — the user can't visually tell them apart from an AI reply.

### Push notifications
```js
initPushNotifications()
urlBase64ToUint8Array(base64String)
```
Subscribes the device to Web Push so admin messages can trigger a real phone notification even when the tab isn't open. `initPushNotifications()` fetches the server's VAPID public key (`GET /api/push/vapid-public-key`), asks the browser for notification permission, subscribes via `PushManager` if not already subscribed, and registers the subscription with the backend (`POST /api/push/subscribe`). It bails out silently at every step where the browser doesn't support push, the server hasn't configured it, or the user declines the permission prompt — notifications are always an optional bonus, never something the app depends on. `urlBase64ToUint8Array()` is just a format converter (the VAPID key arrives as base64url text but the Push API needs raw bytes). The actual "show a popup" and "route the tap" logic lives in `sw.js` (see below), since that has to work even with the page closed.

### Startup sequence (self-invoking init block)
Once `checkAuth()` succeeds: fetches the user's profile (`GET /api/profile`) to set the nav-bar avatar and populate `currentUserProfile` (used to personalize AI replies); kicks off `pollAdminMessages()` immediately and then every 30s; calls `initPushNotifications()`; reveals the chat UI (removes the `checking-auth` CSS class); and finally calls `loadHistory()` for the current session.

### Composer
- `setComposerDisabled(disabled)` — greys out the send button and textarea while a reply is being fetched, so a user can't send a second message mid-reply.
- `handleSend()` — reads the textarea, appends the user's bubble, clears/resets the textarea height, disables the composer, shows the typing indicator, and kicks off `getGeminiResponse()`.
- The `Enter` key is intercepted to insert a newline into the textarea instead of submitting (there's no explicit "send on Enter" — sending only happens via the send button), and the textarea auto-grows as text wraps to new lines.

### `logoutUser()`
Before clearing anything, it looks up any active push subscription for this device and tells the backend to forget it (`POST /api/push/unsubscribe`), then unsubscribes locally — so a logged-out device stops receiving notifications meant for the account that just left. Then it clears the chat history, token, and admin-message cursor from `localStorage`, tells the backend to invalidate the token (`POST /api/logout`), and redirects to `login.html` regardless of whether that server call succeeded (`.finally`) — so a logout always works from the user's point of view even if the network request fails.

### Profile settings modal
```js
colorForName(name)
setNavAvatar(dataUrlOrNull, name)
setAvatarPreview(dataUrlOrNull, name)
setStatus(el, message, kind)
openProfileModal()
closeProfileModal()
```
A modal for editing account details, separate from login/signup:
- `colorForName()` hashes a name to a consistent color from a fixed palette, so a given user always gets the same "initial avatar" background color everywhere.
- `setNavAvatar()` / `setAvatarPreview()` render either the user's uploaded photo or a colored circle with their initial — the first for the small avatar in the nav bar, the second for the larger preview inside the modal.
- `setStatus()` is a small helper for showing "Saving…" / "Saved!" / error text under the profile and password forms.
- `openProfileModal()` resets the form, then fetches `GET /api/profile` to fill in the current name, address, email, and avatar.
- Avatar upload: picking a file resizes it client-side to a 256×256 square JPEG (cropped to fill, via a `<canvas>`) before it's ever sent anywhere, so the stored photo stays small.
- Saving the profile sends `POST /api/profile/update` with the name, optional address, and the new avatar (if one was picked) — updates the nav avatar and `currentUserProfile` on success.
- Changing the password sends `POST /api/profile/change-password` with the current + new password (new password must be ≥ 8 characters, checked client-side first).

### Chat-with-admin modal
```js
renderAdminChatMessages()
escapeAdminChatHtml(str)
pollAdminChat()
openAdminChatModal()
closeAdminChatModal()
sendAdminChatMessage()
```
A private, two-way text line to a human admin — completely separate from the AI conversation and from the one-way `pollAdminMessages()` push above.
- `openAdminChatModal()` resets the message list and starts polling `GET /api/admin-chat/messages?since_id=...` every 4 seconds while the modal is open; `closeAdminChatModal()` stops the polling interval.
- `pollAdminChat()` appends any new messages to `adminChatAllMessages` and re-renders.
- `renderAdminChatMessages()` draws each message as a bubble labeled "You" or "Admin" with a timestamp; `escapeAdminChatHtml()` escapes user-entered text before it's inserted as HTML, so a message can't break the chat layout or inject markup.
- `sendAdminChatMessage()` posts the typed message to `POST /api/admin-chat/send`, clears the textarea, and immediately re-polls so the sent message shows up without waiting for the next interval tick.
- The textarea auto-grows like the main composer, and `Enter` (without Shift) sends the message instead of inserting a newline.

---

## pwa-update.js — install & live-update popup

Shared by both `index.html` and `login.html`. Registers `sw.js` and shows a small "New version available" toast whenever a fresh deploy is detected while the app is already open:
- On load, if a new service worker is already waiting (e.g. the tab was open in the background during a deploy) or one finishes installing later, `showUpdateToast()` displays the popup with a **Refresh** and a dismiss button.
- Tapping **Refresh** sends the waiting worker a `SKIP_WAITING` message so it activates immediately; the page then reloads exactly once (via the `controllerchange` listener) so it's actually running the new files.
- The service worker registration is also nudged to re-check for updates every 5 minutes and whenever the tab becomes visible again, since some browsers otherwise only check on full navigation.

## sw.js — service worker

- **App-shell caching is network-first, not cache-first.** Every same-origin `GET` request first tries the real network (`cache: "no-store"`); only if that fails (offline) does it fall back to the cached copy. This was a deliberate fix — the previous cache-first strategy was why users kept seeing an old version of the app after a deploy. `/api/` and `/admin/` requests are always left alone and go straight to the network.
- `SW_VERSION` is bumped on any deploy that should force a clean cache; `activate` deletes any cache that doesn't match the current version.
- The worker does **not** call `self.skipWaiting()` on install — it waits for the user to tap "Refresh" in the `pwa-update.js` popup, so an active session is never yanked out from under someone mid-use.
- **Push notifications**: a `push` event handler shows a real OS-level notification (title/body/icon from the payload sent by the backend's `send_push_to_user()`), and a `notificationclick` handler either focuses an already-open tab pointing at the relevant URL or opens a new one.

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
| `POST /api/save-chat` | Logs one exchange to the database, scoped to a `session_id` (requires a valid token) |
| `GET /api/chat-history` | Returns saved history for a given `session_id` |
| `GET /api/chat-sessions` | Lists a user's past chat sessions (id + title) for the history sidebar |
| `GET /api/check-messages` | Polls for new admin → user messages pushed into the AI chat |
| `GET /api/profile` | Returns the logged-in user's name, address, email, avatar |
| `POST /api/profile/update` | Updates name / address / avatar |
| `POST /api/profile/change-password` | Changes the account password (requires current password) |
| `GET /api/admin-chat/messages` | Polls the private user ↔ admin chat thread |
| `POST /api/admin-chat/send` | Sends a message on the private user ↔ admin chat thread |
| `GET /api/push/vapid-public-key` | Returns the server's public VAPID key for Web Push subscriptions |
| `POST /api/push/subscribe` | Registers a device's push subscription |
| `POST /api/push/unsubscribe` | Removes a device's push subscription (called on logout) |
| `GET /admin`, `POST /admin/login`, `POST /admin/delete-user` | Separate, session-cookie-based admin dashboard — unrelated to the token system above; also the source of the `?admin_token=` "Login As" hand-off |

Tokens and pending OTPs are stored **in memory** (plain Python dicts), not in the database — meaning a server restart on PythonAnywhere logs everyone out and clears any in-progress signups/resets. This is a known, accepted limitation for a small project; a production app would move these into the database or a cache like Redis.
