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
        smtp_use_tls=False,
        smtp_username="mailer",
        smtp_password="secret",
    )

    mailer.SMTPMailer(settings).send_magic_link("fan@example.com", "test-token", "login")

    assert len(sent) == 1
    assert sent[0]["To"] == "fan@example.com"
    assert sent[0]["Subject"] == "Fanfolio 로그인 링크"
    assert "https://fanfolio.example/login?token=test-token" in sent[0].get_content()


def test_password_reset_mailer_targets_the_reset_route(monkeypatch: Any) -> None:
    sent: list[EmailMessage] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float) -> None:
            pass

        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def send_message(self, message: EmailMessage) -> None:
            sent.append(message)

    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    settings = Settings(
        app_env="test",
        frontend_url="https://fanfolio.example",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        smtp_use_tls=False,
    )

    mailer.SMTPMailer(settings).send_magic_link("fan@example.com", "reset-token", "reset_password")

    assert sent[0]["Subject"] == "Fanfolio 비밀번호 재설정 링크"
    assert (
        "https://fanfolio.example/account/reset-password?token=reset-token" in sent[0].get_content()
    )


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


def test_console_mailer_is_rejected_in_production() -> None:
    settings = Settings(app_env="production", mail_delivery_mode="console")

    try:
        mailer._mailer(settings)
    except mailer.MailDeliveryError as error:
        assert "not allowed" in str(error)
    else:
        raise AssertionError("production must not fall back to console mail delivery")


def test_resend_mailer_posts_an_email_without_logging_the_api_key(monkeypatch: Any) -> None:
    requests: list[tuple[str, dict[str, str], bytes]] = []

    class FakeResponse:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return b'{"id":"email-id"}'

    def fake_urlopen(request: Any, timeout: float) -> FakeResponse:
        requests.append((request.full_url, dict(request.header_items()), request.data))
        assert timeout == 10.0
        return FakeResponse()

    monkeypatch.setattr(mailer.urllib.request, "urlopen", fake_urlopen)
    settings = Settings(
        app_env="test",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        resend_api_key="re_test_secret",
    )

    mailer.ResendMailer(settings).send_notification(
        "fan@example.com", "새 카드가 공개되었어요", "새 카드를 확인해 보세요."
    )

    assert len(requests) == 1
    url, headers, payload = requests[0]
    assert url == "https://api.resend.com/emails"
    assert headers["Authorization"] == "Bearer re_test_secret"
    assert b'"to": ["fan@example.com"]' in payload
    assert '"subject": "Fanfolio 알림: 새 카드가 공개되었어요"'.encode() in payload


def test_resend_mailer_requires_api_key() -> None:
    settings = Settings(app_env="test", mail_from="Fanfolio <no-reply@fanfolio.example>")

    try:
        mailer.ResendMailer(settings).send_notification("fan@example.com", "title", "body")
    except mailer.MailDeliveryError as error:
        assert "RESEND_API_KEY" in str(error)
    else:
        raise AssertionError("Resend must not send without an API key")
