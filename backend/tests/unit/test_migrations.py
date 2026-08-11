import os
import sqlite3
import subprocess
from pathlib import Path

import pytest


def test_alembic_uses_the_same_render_postgres_normalization_as_the_app() -> None:
    backend_dir = Path(__file__).parents[2]
    source = (backend_dir / "alembic/env.py").read_text(encoding="utf-8")

    assert "get_settings().async_database_url" in source


def test_alembic_upgrade_creates_the_current_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "migration.db"
    backend_dir = Path(__file__).parents[2]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path}"
    environment["APP_ENV"] = "test"

    result = subprocess.run(
        [str(backend_dir / ".venv/bin/alembic"), "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(drops)").fetchall()}
        assert {"id", "name", "status", "starts_at", "ends_at"} <= columns
        notification_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(notifications)").fetchall()
        }
        assert {"kind", "title", "body", "created_at"} <= notification_columns
        asset_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(assets)").fetchall()
        }
        assert {"transform", "upload_expires_at", "upload_completed_at"} <= asset_columns
        redeem_code_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(redeem_codes)").fetchall()
        }
        assert "disabled_at" in redeem_code_columns
        card_columns = {row[1] for row in connection.execute("PRAGMA table_info(cards)").fetchall()}
        assert {"voice_asset_id", "review_note"} <= card_columns
        user_card_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(user_cards)").fetchall()
        }
        assert {"acquisition_source", "drop_id", "redeem_code_id"} <= user_card_columns
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
        ).fetchone()
        audit_log_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(audit_logs)").fetchall()
        }
        assert {"organization_id", "artist_id"} <= audit_log_columns
        partner_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert {
            "organizations",
            "admin_memberships",
            "organization_artists",
            "admin_artist_assignments",
        } <= partner_tables
        membership_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(admin_memberships)").fetchall()
        }
        assert {
            "user_id",
            "organization_id",
            "access_level",
            "status",
            "display_name",
            "created_by_user_id",
            "last_login_at",
            "created_at",
            "updated_at",
        } <= membership_columns
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO admin_memberships (
                    user_id, organization_id, access_level, status,
                    display_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("invalid_access", "org_test", "unexpected", "active", "잘못된 권한"),
            )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO admin_memberships (
                    user_id, organization_id, access_level, status,
                    display_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("invalid_status", "org_test", "viewer", "unknown", "잘못된 상태"),
            )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO organizations (
                    id, name, slug, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("org_invalid", "잘못된 조직", "invalid-org", "unknown"),
            )
        user_card_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(user_cards)").fetchall()
        }
        assert {
            "uq_user_cards_card_serial",
            "uq_user_cards_user_redeem_code",
        } <= user_card_indexes
        artist_profile_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(artist_profiles)").fetchall()
        }
        assert {"user_id", "artist_id", "verification_status"} <= artist_profile_columns


def test_alembic_upgrade_adds_drop_metadata_to_a_legacy_database(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE drops (id VARCHAR PRIMARY KEY, status VARCHAR)")

    backend_dir = Path(__file__).parents[2]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path}"
    result = subprocess.run(
        [str(backend_dir / ".venv/bin/alembic"), "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(drops)").fetchall()}
        assert {"id", "name", "status", "starts_at", "ends_at"} <= columns


def test_role_scoped_email_migration_upgrades_the_previous_user_constraint(
    tmp_path: Path,
) -> None:
    """A deployed 0022 database must allow separate fan and admin identities."""
    database_path = tmp_path / "role-scoped-email.db"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE users (
                id VARCHAR PRIMARY KEY,
                email VARCHAR UNIQUE,
                username VARCHAR UNIQUE,
                password_hash VARCHAR,
                must_change_password BOOLEAN NOT NULL DEFAULT 0,
                role VARCHAR NOT NULL,
                nickname VARCHAR,
                profile_image_url VARCHAR,
                favorite_artist_ids JSON NOT NULL DEFAULT '[]',
                favorite_member_ids JSON NOT NULL DEFAULT '[]',
                onboarding_completed BOOLEAN NOT NULL DEFAULT 0,
                notification_email_enabled BOOLEAN NOT NULL DEFAULT 0
            );
            INSERT INTO users (id, email, role) VALUES
                ('admin_legacy', 'shared@example.com', 'ADMIN');
            CREATE TABLE alembic_version (
                version_num VARCHAR(32) NOT NULL PRIMARY KEY
            );
            INSERT INTO alembic_version (version_num)
            VALUES ('0022_deployment_identity');
            """
        )

    backend_dir = Path(__file__).parents[2]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path}"
    result = subprocess.run(
        [str(backend_dir / ".venv/bin/alembic"), "upgrade", "head"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "INSERT INTO users (id, email, role) VALUES (?, ?, ?)",
            ("fan_new", "shared@example.com", "FAN"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO users (id, email, role) VALUES (?, ?, ?)",
                ("fan_duplicate", "shared@example.com", "FAN"),
            )
