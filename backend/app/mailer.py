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
    """Raised when the configured provider cannot deliver a magic link."""


def build_magic_link_url(token: str, settings: Settings) -> str:
    """Build the URL placed in the email without exposing it in the API body."""
    base_url = settings.frontend_url.rstrip("/")
    return f"{base_url}/login?{urlencode({'token': token})}"


def _message(email: str, token: str, purpose: str, settings: Settings) -> EmailMessage:
    link = build_magic_link_url(token, settings)
    action = "로그인" if purpose == "login" else "회원가입"
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = email
    message["Subject"] = f"Fanfolio {action} 링크"
    message.set_content(
        f"Fanfolio {action} 링크입니다.\n\n{link}\n\n"
        "이 링크는 15분 동안 유효하며 한 번만 사용할 수 있습니다."
    )
    return message


class ConsoleMailer:
    """Development provider that logs the link instead of sending email."""

    def send_magic_link(self, email: str, token: str, purpose: str) -> None:
        logger.info(
            "Magic link for %s (%s): %s",
            email,
            purpose,
            build_magic_link_url(token, get_settings()),
        )


class SMTPMailer:
    """Small synchronous SMTP adapter executed off the async event loop."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send_magic_link(self, email: str, token: str, purpose: str) -> None:
        message = _message(email, token, purpose, self.settings)
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
            raise MailDeliveryError("SMTP magic-link delivery failed") from error


def _mailer(settings: Settings) -> ConsoleMailer | SMTPMailer:
    if settings.mail_delivery_mode == "smtp":
        if not settings.smtp_host or not settings.mail_from:
            raise MailDeliveryError("SMTP mail settings are incomplete")
        return SMTPMailer(settings)
    return ConsoleMailer()


async def deliver_magic_link(email: str, token: str, purpose: str) -> None:
    """Deliver a link without blocking FastAPI's event loop on SMTP I/O."""
    settings = get_settings()
    await asyncio.to_thread(_mailer(settings).send_magic_link, email, token, purpose)
