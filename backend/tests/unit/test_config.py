from app.core.config import Settings


def test_frontend_origins_are_parsed_without_empty_values() -> None:
    settings = Settings(
        app_env="test",
        frontend_origins=" https://app.example , ,http://localhost:5173 ",
    )

    assert settings.allowed_origins == ["https://app.example", "http://localhost:5173"]


def test_production_settings_require_https_smtp_and_origins() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="http://localhost:5173",
        auto_create_schema=False,
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("unsafe production settings must be rejected")


def test_valid_production_settings_pass_runtime_validation() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example,https://admin.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
        download_signing_secret="production-secret-from-environment",
        asset_scan_mode="clamav",
    )

    settings.validate_runtime()


def test_production_settings_require_redis_rate_limiting() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="memory",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "RATE_LIMIT_BACKEND" in str(error)
    else:
        raise AssertionError("production must use shared Redis rate limiting")


def test_production_settings_require_explicit_migrations() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=True,
        rate_limit_backend="redis",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "AUTO_CREATE_SCHEMA" in str(error)
    else:
        raise AssertionError("production must use explicit database migrations")


def test_production_settings_reject_insecure_cors_origins() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example,http://admin.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "HTTPS" in str(error)
    else:
        raise AssertionError("production CORS origins must all use HTTPS")


def test_production_settings_reject_wildcard_cors_origins() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="*",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "wildcard" in str(error)
    else:
        raise AssertionError("production CORS origins must not use a wildcard")


def test_production_settings_require_asset_scanning() -> None:
    settings = Settings(
        app_env="production",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
        download_signing_secret="production-secret-from-environment",
        asset_scan_mode="basic",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "ASSET_SCAN_MODE" in str(error)
    else:
        raise AssertionError("production uploads must not disable safety scanning")
