"""Sends OTP e-mails through Gmail SMTP."""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from beyonder.settings import get_settings

_PURPOSES = {
    "signup": {
        "subject": "Your Beyonder AI verification code",
        "intro": "Welcome to Beyonder AI! Use the code below to verify your email and finish creating your account.",
    },
    "reset": {
        "subject": "Reset your Beyonder AI password",
        "intro": "We received a request to reset your Beyonder AI password. Use the code below to continue.",
    },
}


def send_otp_email(to_email, otp, purpose="signup"):
    s = get_settings()
    if not s.mail_enabled:
        raise RuntimeError("Email service is not configured (GMAIL_ADDRESS / GMAIL_APP_PASSWORD).")

    info = _PURPOSES.get(purpose, _PURPOSES["signup"])
    minutes = max(1, s.OTP_EXPIRY_SECONDS // 60)

    body = (
        f"{info['intro']}\n\n"
        f"        Your code:  {otp}\n\n"
        f"- This code expires in {minutes} minutes.\n"
        f"- Never share this code with anyone. Beyonder AI will never ask for it.\n"
        f"- If you did not request this, you can safely ignore this email.\n\n"
        f"Best regards,\nThe Beyonder AI Team\n\n"
        f"--------------------------------------------------\n"
        f"Created & developed by Anubhab Dutta & Arnab Adhikari\n"
    )

    msg = EmailMessage()
    msg["Subject"] = info["subject"]
    msg["From"] = f"Beyonder AI <{s.GMAIL_ADDRESS}>"
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
        server.login(s.GMAIL_ADDRESS, s.GMAIL_APP_PASSWORD.replace(" ", ""))
        server.send_message(msg)
