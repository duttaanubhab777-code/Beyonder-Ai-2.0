/* ============================================================
       THEME TOGGLE (index.html-er shathe sync — ekoi key use kora hocche)
       ============================================================ */
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeIcon = themeToggleBtn.querySelector("i");
    const applyTheme = (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        themeIcon.className = theme === "light" ? "fa-solid fa-moon" : "fa-solid fa-sun";
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
    const screens = ['login-screen', 'signup-screen', 'otp-screen'];
    const switchScreen = (target) => {
        screens.forEach(s => document.getElementById(s).classList.remove('active'));
        document.getElementById(target).classList.add('active');
        clearAllErrors();
    };
    document.querySelectorAll('[data-switch]').forEach(el => {
        el.addEventListener('click', () => switchScreen(el.dataset.switch));
    });

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
       PASSWORD STRENGTH METER (client-side hint — real enforcement backend e hobe)
       ============================================================ */
    const signupPassInput = document.getElementById('signup-password');
    const strengthFill = document.getElementById('strength-fill');
    const strengthLabel = document.getElementById('strength-label');
    const strengthLevels = [
        { color:'#d93025', label:'Too weak' },
        { color:'#f2994a', label:'Weak' },
        { color:'#f2c94c', label:'Okay' },
        { color:'#27ae60', label:'Strong' },
        { color:'#00d9ff', label:'Very strong' }
    ];
    signupPassInput.addEventListener('input', () => {
        const v = signupPassInput.value;
        let score = 0;
        if (v.length >= 8) score++;
        if (/[A-Z]/.test(v)) score++;
        if (/[0-9]/.test(v)) score++;
        if (/[^A-Za-z0-9]/.test(v)) score++;
        if (v.length === 0) { strengthFill.style.width = '0%'; strengthLabel.textContent = 'Password strength'; return; }
        const level = strengthLevels[score];
        strengthFill.style.width = `${(score + 1) * 20}%`;
        strengthFill.style.backgroundColor = level.color;
        strengthLabel.textContent = level.label;
    });

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
       API HELPER — Python backend-er shathe fetch connect korar jonno
       credentials:'include' rakha hoyeche jate backend httpOnly session
       cookie set korle সেটা automatic pathano/gray hoy (localStorage-e
       token/password rakha theke এটা onek beshi নিরাপদ, karon localStorage
       XSS attack diye read kora jay, httpOnly cookie jay na)
       ============================================================ */
            /* ============================================================
       API HELPER — Python backend-er shathe fetch connect korar jonno
       ============================================================ */
    const API_BASE = 'https://anubhabdutta.pythonanywhere.com'; // PythonAnywhere-এর লিংক

    
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

    
    /* [BACKEND DEV INSTRUCTION]
       "Already logged in" check ekhane localStorage diye kora hocche na — eta
       insecure ebong dev-testing-e loop/unwanted-redirect bug toiri kore.
       Ei check-ta index.html load howar somoy backend-e GET /api/me (cookie shoho)
       call kore korte হবে; session valid hole shudhu tokhon chat page dekhabe. */

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
            /* [BACKEND DEV INSTRUCTION]
               POST /api/login  body: { email, password }
               - Server: email diye user khuje ber kore, bcrypt/argon2 diye password hash compare korবে
               - Success: httpOnly, Secure, SameSite=Strict cookie-te session/JWT set kore { success:true } pathabe
               - Fail: generic message pathabe — "Invalid email or password" (specific bole দেওয়া jabe na
                 j email ache kina, eta user-enumeration attack thamay)
               - Brute-force thekano jonno backend e rate-limiting (e.g. 5 try / 15 min per IP+email) rakha uchit */
                    const res = await apiRequest('/api/login', { email, password });

        if (res.token) {
            localStorage.setItem("beyonder_token", res.token);
        }
        
        localStorage.setItem("beyonder-user", email);
        window.location.href = "index.html";
               
        } catch (err) {
            showError('login-error', err.message || 'Invalid credentials!');
            document.getElementById('login-password').value = ''; // fail hole password field clear kora hocche
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
            /* [BACKEND DEV INSTRUCTION]
               POST /api/signup/send-otp  body: { name, email, password }
               - Server: password ke bcrypt/argon2 diye hash kore, ekta "pending_users" table/collection e
                 (name, email, password_hash, otp_hash, expiry ~5 min) store korবে — plaintext password kothao save hobe na
               - Email e OTP pathabe (raw password ar client-e ফেরত pathanor দরকার nei)
               - Note: eivabe korle পরের verify-otp step-e শুধু email + otp pathale hoy,
                 password abar client memory te বহন করা লাগে না (নিচে dekho) */
            const res = await apiRequest('/api/signup/send-otp', { name, email, password });

            pendingSignupEmail = email; // shudhu email mone rakha hocche, password na
            startResendTimer('signup', res.expires_in || 300, 'otp-resend-btn', 'otp-timer');
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
            /* [BACKEND DEV INSTRUCTION]
               POST /api/signup/verify-otp  body: { email: pendingSignupEmail, otp }
               - Server: pending_users theke record khuje, otp_hash match + expiry check kore
               - Match korle: asol users table e account create kore (already-hashed password copy kore),
                 pending record delete kore, httpOnly session cookie set kore { success:true } pathabe
               - OTP wrong/expired hole generic error pathabe, ar brute-force thekano jonno
                 max 5 attempt-er por OTP invalidate kore dewa uchit */
                    
            const res = await apiRequest('/api/signup/verify-otp', { email: pendingSignupEmail, otp });

            if (res.token) {
                localStorage.setItem("beyonder_token", res.token);
            }

            localStorage.setItem("beyonder-user", pendingSignupEmail);
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
            startResendTimer('reset', res.expires_in || 300, 'reset-resend-btn', 'reset-timer');
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
            startResendTimer('signup', res.expires_in || 300, 'otp-resend-btn', 'otp-timer');
        } catch (err) {
            showError('otp-error', err.message || 'Could not resend code.');
        }
    });

    document.getElementById('reset-resend-btn').addEventListener('click', async () => {
        if (!pendingResetEmail) return;
        try {
            const res = await apiRequest('/api/forgot-password/send-otp', { email: pendingResetEmail });
            startResendTimer('reset', res.expires_in || 300, 'reset-resend-btn', 'reset-timer');
        } catch (err) {
            showError('reset-error', err.message || 'Could not resend code.');
        }
    });
