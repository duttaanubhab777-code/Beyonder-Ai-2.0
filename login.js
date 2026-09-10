/* ============================================================
       THEME TOGGLE (synced with index.html — uses the same localStorage key)
       ============================================================ */
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeIcon = themeToggleBtn.querySelector("i");
    const applyTheme = (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        // Bug fix: this used to show the *opposite* icon compared to the chat
        // page (app.js), so switching between login.html and index.html made
        // the sun/moon icon flip for no reason even though the theme itself
        // hadn't changed. Now both pages agree: light theme -> sun icon,
        // dark theme -> moon icon.
        themeIcon.className = theme === "light" ? "fa-solid fa-sun" : "fa-solid fa-moon";
        localStorage.setItem("beyonder-theme", theme);
    };
    const savedTheme = localStorage.getItem("beyonder-theme");
    applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
    themeToggleBtn.addEventListener("click", () => {
        applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    });

    /* ============================================================
       SCREEN SWITCHER
       ============================================================ */
const screens = ['login-screen', 'signup-screen', 'otp-screen', 'forgot-screen', 'reset-screen'];
    const switchScreen = (target) => {
        screens.forEach(s => document.getElementById(s).classList.remove('active'));
        document.getElementById(target).classList.add('active');
        clearAllErrors();
    };
    document.querySelectorAll('[data-switch]').forEach(el => {
        el.addEventListener('click', () => switchScreen(el.dataset.switch));
    });

    /* ============================================================
       NEW-DEVICE DEFAULT SCREEN
       If this browser has never had a Beyonder AI account logged in
       or signed up on it before, open on the Sign Up screen instead
       of Login — a brand-new visitor almost never has an account
       yet, so this saves them the extra "Sign Up" tap.
       Once they successfully log in or sign up (see below), this
       device is remembered as "returning", so next time (e.g. after
       logging out) it opens on Login as usual.
       ============================================================ */
    const RETURNING_USER_KEY = 'beyonder_returning_user';
    const markAsReturningUser = () => localStorage.setItem(RETURNING_USER_KEY, '1');
    if (!localStorage.getItem(RETURNING_USER_KEY)) {
        switchScreen('signup-screen');
    }

    /* ============================================================
       ALREADY LOGGED IN? Skip the login/signup screens entirely.
       Bug fix: previously, a user who still had a valid saved
       session (e.g. they just navigated back to login.html by
       mistake, or opened it from a bookmark) would see the login
       form again instead of going straight back into the chat.
       ============================================================ */
    (async () => {
        const token = localStorage.getItem("beyonder_token");
        if (!token) return;
        try {
            // Hardcoded here (rather than the API_BASE constant declared
            // further down this file) because this check runs immediately —
            // before that later `const` declaration has executed.
            const res = await fetch("https://anubhabdutta.pythonanywhere.com/api/me", {
                headers: { "Authorization": token }
            });
            const data = await res.json();
            if (data.logged_in) {
                window.location.href = "index.html";
            }
        } catch (e) {
            // Network hiccup — just let them use the login/signup form normally.
        }
    })();

    /* ============================================================
       PASSWORD SHOW/HIDE TOGGLE
       ============================================================ */
    document.querySelectorAll('.toggle-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            const icon = btn.querySelector('i');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            icon.className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
        });
    });

    /* ============================================================
       PASSWORD STRENGTH METER (client-side hint only — real enforcement happens on the backend)
       ============================================================ */
    const strengthLevels = [
        { color:'#d93025', label:'Too weak' },
        { color:'#f2994a', label:'Weak' },
        { color:'#f2c94c', label:'Okay' },
        { color:'#27ae60', label:'Strong' },
        { color:'#00d9ff', label:'Very strong' }
    ];

    function attachStrengthMeter(inputId, fillId, labelId){
        const input = document.getElementById(inputId);
        const fill = document.getElementById(fillId);
        const label = document.getElementById(labelId);
        input.addEventListener('input', () => {
            const v = input.value;
            let score = 0;
            if (v.length >= 8) score++;
            if (/[A-Z]/.test(v)) score++;
            if (/[0-9]/.test(v)) score++;
            if (/[^A-Za-z0-9]/.test(v)) score++;
            if (v.length === 0) { fill.style.width = '0%'; label.textContent = 'Password strength'; return; }
            const level = strengthLevels[score];
            fill.style.width = `${(score + 1) * 20}%`;
            fill.style.backgroundColor = level.color;
            label.textContent = level.label;
        });
    }

    attachStrengthMeter('signup-password', 'strength-fill', 'strength-label');
    attachStrengthMeter('reset-new-password', 'reset-strength-fill', 'reset-strength-label');

    /* ============================================================
       HELPERS
       ============================================================ */
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function showError(id, msg){
        const el = document.getElementById(id);
        el.textContent = msg;
        el.style.display = 'block';
    }
    function hideError(id){
        document.getElementById(id).style.display = 'none';
    }
    function clearAllErrors(){
        ['login-error','signup-error','otp-error','forgot-error','reset-error'].forEach(hideError);
    
    }
    function setLoading(btn, loading, loadingText){
        const label = btn.querySelector('.btn-text');
        if (loading){
            btn.dataset.originalText = label.textContent;
            label.innerHTML = `<i class="fa-solid fa-spinner"></i> ${loadingText}`;
            btn.disabled = true;
        } else {
            label.textContent = btn.dataset.originalText || label.textContent;
            btn.disabled = false;
        }
    }

    /* ============================================================
       API HELPER — connects fetch requests to the Python backend.
       credentials: 'include' is kept so that if the backend ever sets an
       httpOnly session cookie, it gets sent/received automatically
       (an httpOnly cookie is much safer than keeping a token/password in
       localStorage, since localStorage can be read via an XSS attack but
       an httpOnly cookie cannot).
       ============================================================ */
    const API_BASE = 'https://anubhabdutta.pythonanywhere.com'; // PythonAnywhere backend URL

    
    async function apiRequest(url, payload){
        const token = localStorage.getItem("beyonder_token");
        
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = token;
        }

        const res = await fetch(API_BASE + url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });
        let data = {};
        try { data = await res.json(); } catch(e) {}
        if (!res.ok || data.success === false){
            throw new Error(data.message || 'Something went wrong. Please try again.');
        }
        return data; 
    }

    /* Note: the actual login-check flow doesn't rely on localStorage alone —
       see the "ALREADY LOGGED IN?" block above, which calls GET /api/me
       with the saved token before deciding whether to skip this screen. */

    /* ============================================================
       LOGIN
       ============================================================ */
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('login-error');

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password){
            showError('login-error', 'Please fill in both fields.');
            return;
        }
        if (!emailRegex.test(email)){
            showError('login-error', 'Please enter a valid email address.');
            return;
        }

        const btn = document.getElementById('login-submit-btn');
        setLoading(btn, true, 'Logging in...');

        try {
            /* POST /api/login — body: { email, password }
               The server looks up the user by email, compares the password
               against the stored hash, and on success returns a bearer
               token (see app.py's api_login()), which is what gets saved
               to localStorage below and sent as the Authorization header
               on every future request. On failure it returns a generic
               "Incorrect email or password" message (not "no such email"),
               which avoids leaking whether an email is registered at all —
               this also has server-side rate limiting against brute force. */
                    const res = await apiRequest('/api/login', { email, password });

        if (res.token) {
            localStorage.setItem("beyonder_token", res.token);
        }
        
        localStorage.setItem("beyonder-user", email);
        markAsReturningUser();
        window.location.href = "index.html";
               
        } catch (err) {
            showError('login-error', err.message || 'Invalid credentials!');
            document.getElementById('login-password').value = ''; // clear the password field on failure
            setLoading(btn, false);
        }
    });

    /* ============================================================
       SIGNUP → SEND OTP
       ============================================================ */
    let pendingSignupEmail = '';

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('signup-error');

        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        if (!name || !email || !password){
            showError('signup-error', 'Please fill all fields!');
            return;
        }
        if (!emailRegex.test(email)){
            showError('signup-error', 'Please enter a valid email address.');
            return;
        }
        if (password.length < 8){
            showError('signup-error', 'Password must be at least 8 characters.');
            return;
        }

        const btn = document.getElementById('signup-submit-btn');
        setLoading(btn, true, 'Sending OTP...');

        try {
            /* POST /api/signup/send-otp — body: { name, email, password }
               The server hashes the password and stores it in a pending-
               signups entry (name, email, password_hash, otp, expiry) —
               the plaintext password is never saved anywhere. It then
               emails the OTP to the user. Because of this, the following
               verify-otp step only needs to send email + otp — the
               password never has to be carried back in the client again. */
            const res = await apiRequest('/api/signup/send-otp', { name, email, password });

            pendingSignupEmail = email; // only the email is remembered here, not the password
            startResendTimer('signup', res.resend_after || 60, 'otp-resend-btn', 'otp-timer');
            document.getElementById('otp-success-msg').style.display = 'block';
            document.getElementById('otp-input').value = '';
            switchScreen('otp-screen');
        } catch (err) {
            showError('signup-error', err.message || 'Could not send OTP. Please try again.');
        } finally {
            setLoading(btn, false);
        }
    });

    /* ============================================================
       VERIFY OTP
       ============================================================ */
    document.getElementById('otp-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('otp-error');

        const otp = document.getElementById('otp-input').value.trim();
        if (!otp || otp.length !== 6){
            showError('otp-error', 'Please enter the 6-digit OTP.');
            return;
        }

        const btn = document.getElementById('otp-submit-btn');
        setLoading(btn, true, 'Verifying...');

        try {
            /* POST /api/signup/verify-otp — body: { email: pendingSignupEmail, otp }
               The server looks up the pending signup entry, checks the OTP
               and its expiry, and on a match creates the real account
               (using the already-hashed password), deletes the pending
               entry, and returns a bearer token (see app.py's
               api_signup_verify_otp()). A wrong/expired OTP gets a generic
               error, and verification attempts are capped server-side
               (OTP_MAX_VERIFY_ATTEMPTS) to block brute-forcing the code. */

            const res = await apiRequest('/api/signup/verify-otp', { email: pendingSignupEmail, otp });

            if (res.token) {
                localStorage.setItem("beyonder_token", res.token);
            }

            localStorage.setItem("beyonder-user", pendingSignupEmail);
            markAsReturningUser();
            window.location.href = "index.html";
        } catch (err) {
                           
            showError('otp-error', err.message || 'Invalid OTP!');
            setLoading(btn, false);
        }
    });
    
/* ============================================================
       OTP RESEND TIMER (reusable for signup + forgot-password)
       ============================================================ */
    let resendTimers = {}; // context => intervalId

    function startResendTimer(context, seconds, btnId, timerId){
        const btn = document.getElementById(btnId);
        const timerEl = document.getElementById(timerId);
        let remaining = seconds;

        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';

        if (resendTimers[context]) clearInterval(resendTimers[context]);

        const tick = () => {
            if (remaining <= 0){
                clearInterval(resendTimers[context]);
                timerEl.textContent = '';
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                return;
            }
            timerEl.textContent = ` (${remaining}s)`;
            remaining--;
        };
        tick();
        resendTimers[context] = setInterval(tick, 1000);
    }

    /* ============================================================
       FORGOT PASSWORD → SEND OTP
       ============================================================ */
    let pendingResetEmail = '';

    document.getElementById('forgot-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('forgot-error');

        const email = document.getElementById('forgot-email').value.trim();
        if (!emailRegex.test(email)){
            showError('forgot-error', 'Please enter a valid email address.');
            return;
        }

        const btn = document.getElementById('forgot-submit-btn');
        setLoading(btn, true, 'Sending...');

        try {
            const res = await apiRequest('/api/forgot-password/send-otp', { email });
            pendingResetEmail = email;
            switchScreen('reset-screen');
            startResendTimer('reset', res.resend_after || 60, 'reset-resend-btn', 'reset-timer');
        } catch (err) {
            showError('forgot-error', err.message || 'Could not send reset code.');
        } finally {
            setLoading(btn, false);
        }
    });

    /* ============================================================
       RESET PASSWORD (OTP + new password)
       ============================================================ */
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('reset-error');

        const otp = document.getElementById('reset-otp').value.trim();
        const newPassword = document.getElementById('reset-new-password').value;

        if (!otp || otp.length !== 6){
            showError('reset-error', 'Please enter the 6-digit code.');
            return;
        }
        if (newPassword.length < 8){
            showError('reset-error', 'Password must be at least 8 characters.');
            return;
        }

        const btn = document.getElementById('reset-submit-btn');
        setLoading(btn, true, 'Resetting...');

        try {
            await apiRequest('/api/forgot-password/reset', {
                email: pendingResetEmail,
                otp,
                new_password: newPassword
            });
            markAsReturningUser();
            switchScreen('login-screen');
        } catch (err) {
            showError('reset-error', err.message || 'Could not reset password.');
        } finally {
            setLoading(btn, false);
        }
    });

    /* ============================================================
       RESEND BUTTONS
       ============================================================ */
    document.getElementById('otp-resend-btn').addEventListener('click', async () => {
        if (!pendingSignupEmail) return;
        try {
            const res = await apiRequest('/api/signup/send-otp', {
                name: document.getElementById('signup-name').value.trim(),
                email: pendingSignupEmail,
                password: document.getElementById('signup-password').value
            });
            startResendTimer('signup', res.resend_after || 60, 'otp-resend-btn', 'otp-timer');
        } catch (err) {
            showError('otp-error', err.message || 'Could not resend code.');
        }
    });

    document.getElementById('reset-resend-btn').addEventListener('click', async () => {
        if (!pendingResetEmail) return;
        try {
            const res = await apiRequest('/api/forgot-password/send-otp', { email: pendingResetEmail });
            startResendTimer('reset', res.resend_after || 60, 'reset-resend-btn', 'reset-timer');
        } catch (err) {
            showError('reset-error', err.message || 'Could not resend code.');
        }
    });
