from app.core.config import Settings


def test_frontend_origins_are_parsed_without_empty_values() -> None:
    settings = Settings(
        app_env="test",
        frontend_origins=" https://app.example , ,http://localhost:5173 ",
    )

    assert settings.allowed_origins == ["https://app.example", "http://localhost:5173"]


def test_database_backend_name_does_not_expose_connection_details() -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://user:secret@example.com/fanfolio",
    )

    assert settings.database_backend == "postgresql+asyncpg"
    assert "secret" not in settings.database_backend


def test_render_postgres_url_is_normalized_for_the_async_driver() -> None:
    settings = Settings(database_url="postgresql://user:secret@render.internal/fanfolio")

    assert settings.async_database_url.startswith("postgresql+asyncpg://")
    assert settings.database_backend == "postgresql+asyncpg"


def test_staging_uses_hosted_security_without_requiring_deferred_integrations() -> None:
    settings = Settings(
        app_env="staging",
        data_protection_key="staging-data-protection-key-from-test",
        database_url="postgresql://fanfolio:password@db.internal/fanfolio",
        frontend_url="https://fanfolio-fan.vercel.app",
        frontend_origins=("https://fanfolio-fan.vercel.app,https://fanfolio-admin-one.vercel.app"),
        auto_create_schema=False,
        download_signing_secret="staging-download-secret-from-test",
        jwt_access_secret="staging-access-secret-from-test",
        jwt_refresh_secret="staging-refresh-secret-from-test",
        oauth_frontend_callback_url="https://fanfolio-fan.vercel.app/oauth/callback",
        google_redirect_uri=("https://fanfolio-api.onrender.com/api/auth/oauth/google/callback"),
        kakao_redirect_uri=("https://fanfolio-api.onrender.com/api/auth/oauth/kakao/callback"),
    )

    settings.validate_runtime()
    assert settings.is_hosted is True


def test_staging_rejects_ephemeral_sqlite() -> None:
    settings = Settings(
        app_env="staging",
        data_protection_key="staging-data-protection-key-from-test",
        database_url="sqlite+aiosqlite:///./fanfolio.db",
        frontend_url="https://fanfolio-fan.vercel.app",
        frontend_origins="https://fanfolio-fan.vercel.app",
        auto_create_schema=False,
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "DATABASE_URL" in str(error)
    else:
        raise AssertionError("hosted staging must not use ephemeral SQLite")


def test_production_settings_require_https_smtp_and_origins() -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="production-data-protection-key-from-environment",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
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
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example,https://admin.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
        download_signing_secret="production-secret-from-environment",
        asset_scan_mode="clamav",
        jwt_access_secret="production-access-secret-from-environment",
        jwt_refresh_secret="production-refresh-secret-from-environment",
        oauth_frontend_callback_url="https://app.fanfolio.example/oauth/callback",
        google_redirect_uri="https://api.fanfolio.example/api/auth/oauth/google/callback",
        kakao_redirect_uri="https://api.fanfolio.example/api/auth/oauth/kakao/callback",
    )

    settings.validate_runtime()


def test_production_settings_require_redis_rate_limiting() -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
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
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
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


def test_production_settings_reject_ephemeral_sqlite_database() -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="production-data-protection-key-from-test",
        database_url="sqlite+aiosqlite:///./fanfolio.db",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
        download_signing_secret="production-secret-from-environment",
        asset_scan_mode="clamav",
        jwt_access_secret="production-access-secret-from-environment",
        jwt_refresh_secret="production-refresh-secret-from-environment",
        oauth_frontend_callback_url="https://app.fanfolio.example/oauth/callback",
        google_redirect_uri="https://api.fanfolio.example/api/auth/oauth/google/callback",
        kakao_redirect_uri="https://api.fanfolio.example/api/auth/oauth/kakao/callback",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "DATABASE_URL" in str(error)
    else:
        raise AssertionError("production must use durable PostgreSQL storage")


def test_production_settings_reject_insecure_cors_origins() -> None:
    settings = Settings(
        app_env="production",
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
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
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
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
        data_protection_key="production-data-protection-key-from-test",
        database_url="postgresql+asyncpg://fanfolio:password@db.example.com/fanfolio",
        frontend_url="https://app.fanfolio.example",
        frontend_origins="https://app.fanfolio.example",
        mail_delivery_mode="smtp",
        mail_from="Fanfolio <no-reply@fanfolio.example>",
        smtp_host="smtp.example.com",
        auto_create_schema=False,
        rate_limit_backend="redis",
        download_signing_secret="production-secret-from-environment",
        asset_scan_mode="basic",
        jwt_access_secret="production-access-secret-from-environment",
        jwt_refresh_secret="production-refresh-secret-from-environment",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "ASSET_SCAN_MODE" in str(error)
    else:
        raise AssertionError("production uploads must not disable safety scanning")


def test_upload_cleanup_interval_must_be_positive() -> None:
    settings = Settings(upload_cleanup_interval_seconds=0)

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "UPLOAD_CLEANUP_INTERVAL_SECONDS" in str(error)
    else:
        raise AssertionError("upload cleanup interval must be positive")
