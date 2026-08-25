"""Magic-link delivery adapters.

The application owns token creation; this module only turns the token into a
user-facing URL and delivers it.  Keeping SMTP behind a small adapter makes it
possible to use a local console provider in development and a real mail
server in production without changing the auth endpoint.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class MailDeliveryError(RuntimeError):
    """Raised when the configured provider cannot deliver an email."""


def build_magic_link_url(token: str, settings: Settings, purpose: str = "login") -> str:
    """Build the URL placed in the email without exposing it in the API body."""
    base_url = settings.frontend_url.rstrip("/")
    path = "/account/reset-password" if purpose == "reset_password" else "/login"
    return f"{base_url}{path}?{urlencode({'token': token})}"


def _message(email: str, token: str, purpose: str, settings: Settings) -> EmailMessage:
    link = build_magic_link_url(token, settings, purpose)
    action = (
        "로그인" if purpose == "login" else "회원가입" if purpose == "signup" else "비밀번호 재설정"
    )
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = email
    message["Subject"] = f"Fanfolio {action} 링크"
    message.set_content(
        f"Fanfolio {action} 링크입니다.\n\n{link}\n\n"
        "이 링크는 15분 동안 유효하며 한 번만 사용할 수 있습니다."
    )
    return message


def _notification_message(email: str, title: str, body: str, settings: Settings) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = email
    message["Subject"] = f"Fanfolio 알림: {title}"
    message.set_content(f"{title}\n\n{body}\n\nFanfolio 앱에서 확인해 주세요.")
    return message


class ConsoleMailer:
    """Development provider that logs the link instead of sending email."""

    def send_magic_link(self, email: str, token: str, purpose: str) -> None:
        logger.info(
            "Magic link for %s (%s): %s",
            email,
            purpose,
            build_magic_link_url(token, get_settings(), purpose),
        )

    def send_notification(self, email: str, title: str, body: str) -> None:
        logger.info("Notification email for %s: %s - %s", email, title, body)


class SMTPMailer:
    """Small synchronous SMTP adapter executed off the async event loop."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send_magic_link(self, email: str, token: str, purpose: str) -> None:
        message = _message(email, token, purpose, self.settings)
        self._send(message, "magic-link")

    def send_notification(self, email: str, title: str, body: str) -> None:
        message = _notification_message(email, title, body, self.settings)
        self._send(message, "notification")

    def _send(self, message: EmailMessage, message_kind: str) -> None:
        try:
            with smtplib.SMTP(
                self.settings.smtp_host,
                self.settings.smtp_port,
                timeout=10.0,
            ) as smtp:
                if self.settings.smtp_use_tls:
                    smtp.starttls()
                if self.settings.smtp_username:
                    smtp.login(self.settings.smtp_username, self.settings.smtp_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as error:
            raise MailDeliveryError(f"SMTP {message_kind} delivery failed") from error


def _mailer(settings: Settings) -> ConsoleMailer | SMTPMailer:
    if settings.mail_delivery_mode == "smtp":
        if not settings.smtp_host or not settings.mail_from:
            raise MailDeliveryError("SMTP mail settings are incomplete")
        return SMTPMailer(settings)
    if settings.mail_delivery_mode == "console" and settings.app_env in {"development", "test"}:
        return ConsoleMailer()
    raise MailDeliveryError("Mail delivery mode is not allowed for this environment")


async def deliver_magic_link(email: str, token: str, purpose: str) -> None:
    """Deliver a link without blocking FastAPI's event loop on SMTP I/O."""
    settings = get_settings()
    await asyncio.to_thread(_mailer(settings).send_magic_link, email, token, purpose)


async def deliver_notification_email(email: str, title: str, body: str) -> None:
    """Send optional event mail off the event loop, just like magic links."""
    settings = get_settings()
    await asyncio.to_thread(_mailer(settings).send_notification, email, title, body)
