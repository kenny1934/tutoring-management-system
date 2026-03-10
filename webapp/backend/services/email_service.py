import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from utils.html_sanitizer import strip_html_tags

logger = logging.getLogger(__name__)

GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
SUPERADMIN_EMAIL = os.getenv("SUPERADMIN_EMAIL", "")


def _send_email_sync(subject: str, body_html: str, body_plain: str, to_email: str):
    """Send email in background thread. Silently logs on failure."""
    if not all([GMAIL_ADDRESS, GMAIL_APP_PASSWORD, to_email]):
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = GMAIL_ADDRESS
        msg["To"] = to_email
        msg.attach(MIMEText(body_plain, "plain"))
        msg.attach(MIMEText(body_html, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        logger.info("Feedback email sent to %s", to_email)
    except Exception as e:
        logger.warning("Email send failed: %s", e)


def send_feedback_email(sender_name: str, subject: str, body_html: str):
    """Fire-and-forget email to superadmin when a Feedback message is sent."""
    if not SUPERADMIN_EMAIL:
        return
    safe_name = escape(sender_name)
    safe_subject = escape(subject or "(none)")
    email_subject = f"[Feedback] {subject or 'No subject'} — from {sender_name}"
    email_body_html = f"""\
<h3>New feedback from {safe_name}</h3>
<p><strong>Subject:</strong> {safe_subject}</p>
<hr>
<div>{body_html}</div>
"""
    email_body_plain = f"New feedback from {sender_name}\nSubject: {subject or '(none)'}\n\n{strip_html_tags(body_html)}"
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _send_email_sync, email_subject, email_body_html, email_body_plain, SUPERADMIN_EMAIL)
    except RuntimeError:
        _send_email_sync(email_subject, email_body_html, email_body_plain, SUPERADMIN_EMAIL)
