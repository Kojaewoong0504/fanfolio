from pathlib import Path

from app.core.config import Settings


def test_frontend_origins_are_parsed_without_empty_values() -> None:
    settings = Settings(
        app_env="test",
        frontend_origins=" https://app.example , ,http://localhost:5173 ",
    )

    assert settings.allowed_origins == ["https://app.example", "http://localhost:5173"]


def test_scoped_vercel_preview_origin_regex_allows_only_the_project_team() -> None:
    settings = Settings(
        app_env="test",
        frontend_origins="https://fanfolio-admin-one.vercel.app",
        frontend_preview_projects="fanfolio-fan,fanfolio-admin,fanfolio-studio",
        frontend_preview_domain="kojaewoong0504s-projects.vercel.app",
    )

    assert settings.is_origin_allowed(
        "https://fanfolio-admin-git-feature-auth-abc123-kojaewoong0504s-projects.vercel.app"
    )
    assert not settings.is_origin_allowed("https://fanfolio-admin.attacker.example")
    assert not settings.is_origin_allowed(
        "https://fanfolio-admin-git-feature-auth-abc123-other-team.vercel.app"
    )


def test_database_backend_name_does_not_expose_connection_details() -> None:
    settings = Settings(
        database_url="postgresql+asyncpg://user:secret@example.com/fanfolio",
    )

    assert settings.database_backend == "postgresql+asyncpg"
    assert "secret" not in settings.database_backend


def test_default_sqlite_database_is_anchored_to_the_backend_directory(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = Settings(_env_file=None, app_env="development")

    database_path = Path(settings.database_url.removeprefix("sqlite+aiosqlite:///"))
    assert database_path == Path(__file__).resolve().parents[2] / "fanfolio.db"


def test_render_postgres_url_is_normalized_for_the_async_driver() -> None:
    settings = Settings(database_url="postgresql://user:secret@render.internal/fanfolio")

    assert settings.async_database_url.startswith("postgresql+asyncpg://")
    assert settings.database_backend == "postgresql+asyncpg"


def test_asyncpg_statement_cache_setting_is_only_applied_to_postgresql() -> None:
    postgres = Settings(
        database_url="postgresql+asyncpg://postgres.project-ref:secret@pooler.supabase.com:6543/postgres",
        database_statement_cache_size=0,
    )
    sqlite = Settings(database_statement_cache_size=0)

    assert postgres.database_connect_args == {"statement_cache_size": 0}
    assert sqlite.database_connect_args == {"timeout": 30}


def test_supabase_storage_requires_the_server_side_s3_configuration() -> None:
    settings = Settings(
        app_env="test",
        storage_backend="supabase",
        s3_endpoint_url="https://project-ref.storage.supabase.co/storage/v1/s3",
        s3_bucket="fanfolio-assets",
        s3_access_key_id="test-access-key",
        s3_secret_access_key="test-secret-key",
    )

    settings.validate_runtime()


def test_supabase_storage_rejects_missing_server_side_s3_credentials() -> None:
    settings = Settings(
        app_env="test",
        storage_backend="supabase",
        s3_endpoint_url="https://project-ref.storage.supabase.co/storage/v1/s3",
        s3_bucket="fanfolio-assets",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "S3_ACCESS_KEY_ID" in str(error)
    else:
        raise AssertionError("Supabase Storage must not start without server-side credentials")


def test_cloudflare_r2_storage_uses_the_s3_compatible_configuration() -> None:
    settings = Settings(
        app_env="test",
        storage_backend="r2",
        r2_account_id="account-id",
        r2_bucket="fanfolio-assets",
        r2_access_key_id="r2-access-key",
        r2_secret_access_key="r2-secret-key",
    )

    settings.validate_runtime()


def test_cloudflare_r2_storage_rejects_missing_bucket() -> None:
    settings = Settings(
        app_env="test",
        storage_backend="r2",
        r2_account_id="account-id",
        r2_access_key_id="r2-access-key",
        r2_secret_access_key="r2-secret-key",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "R2_BUCKET" in str(error)
    else:
        raise AssertionError("R2 must not start without a bucket")


def test_fcm_push_requires_firebase_server_credentials() -> None:
    settings = Settings(
        app_env="test",
        push_delivery_mode="fcm",
        firebase_project_id="fnafolio",
        firebase_client_email="firebase-adminsdk@example.iam.gserviceaccount.com",
        firebase_private_key="-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n",
    )

    settings.validate_runtime()


def test_fcm_push_rejects_missing_project_id() -> None:
    settings = Settings(
        app_env="test",
        push_delivery_mode="fcm",
        firebase_client_email="firebase-adminsdk@example.iam.gserviceaccount.com",
        firebase_private_key="private-key",
    )

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "FIREBASE_PROJECT_ID" in str(error)
    else:
        raise AssertionError("FCM must not start without a Firebase project id")


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


def test_production_settings_reject_sandbox_point_issuance() -> None:
    settings = Settings(app_env="production", allow_sandbox_point_charges=True)

    try:
        settings.validate_runtime()
    except ValueError as error:
        assert "ALLOW_SANDBOX_POINT_CHARGES" in str(error)
    else:
        raise AssertionError("production must reject sandbox point issuance")


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
