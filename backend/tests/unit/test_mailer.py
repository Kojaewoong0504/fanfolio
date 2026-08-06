from email.message import EmailMessage
from typing import Any, Self

from app import mailer
from app.core.config import Settings


def test_magic_link_url_contains_a_url_encoded_token() -> None:
    settings = Settings(frontend_url="https://fanfolio.example", app_env="test")

    url = mailer.build_magic_link_url("token/with spaces", settings)

    assert url == "https://fanfolio.example/login?token=token%2Fwith+spaces"


def test_smtp_mailer_sends_a_magic_link_message(monkeypatch: Any) -> None:
    sent: list[EmailMessage] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float) -> None:
            assert (host, port, timeout) == ("smtp.example.com", 587, 10.0)

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def starttls(self) -> None:
            pass

        def login(self, username: str, password: str) -> None:
            assert (username, password) == ("mailer", "secret")

        def send_message(self, message: EmailMessage) -> None:
            sent.append(message)

    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    settings = Settings(
        app_env="test",
        frontend_url="https://fanfolio.example",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        smtp_username="mailer",
        smtp_password="secret",
    )

    mailer.SMTPMailer(settings).send_magic_link("fan@example.com", "test-token", "login")

    assert len(sent) == 1
    assert sent[0]["To"] == "fan@example.com"
    assert sent[0]["Subject"] == "Fanfolio 로그인 링크"
    assert "https://fanfolio.example/login?token=test-token" in sent[0].get_content()


def test_smtp_mailer_sends_a_notification_message(monkeypatch: Any) -> None:
    sent: list[EmailMessage] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float) -> None:
            pass

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def starttls(self) -> None:
            pass

        def send_message(self, message: EmailMessage) -> None:
            sent.append(message)

    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    settings = Settings(
        app_env="test",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
    )

    mailer.SMTPMailer(settings).send_notification(
        "fan@example.com", "새 카드가 공개되었어요", "좋아하는 아티스트의 새 카드를 확인해 보세요."
    )

    assert sent[0]["To"] == "fan@example.com"
    assert sent[0]["Subject"] == "Fanfolio 알림: 새 카드가 공개되었어요"
    assert "좋아하는 아티스트의 새 카드를 확인해 보세요." in sent[0].get_content()
