import importlib.util
import os
import re
import sqlite3
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def run_alembic(
    backend_dir: Path,
    database_path: Path,
    *args: str,
) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = f"sqlite:///{database_path}"
    environment["APP_ENV"] = "test"
    return subprocess.run(
        [str(backend_dir / ".venv/bin/alembic"), *args],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def test_social_card_trading_adds_postgres_columns_without_table_recreation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    backend_dir = Path(__file__).parents[2]
    migration_path = backend_dir / "alembic/versions/0046_social_card_trading.py"
    spec = importlib.util.spec_from_file_location("migration_0046", migration_path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    bind = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
    inspector = MagicMock()
    inspector.has_table.return_value = True
    inspector.get_columns.side_effect = lambda table: (
        [{"name": "id"}] if table in {"cards", "user_cards"} else []
    )
    add_column = MagicMock()
    batch_alter_table = MagicMock()

    monkeypatch.setattr(migration.op, "get_bind", lambda: bind)
    monkeypatch.setattr(migration.sa, "inspect", lambda _bind: inspector)
    monkeypatch.setattr(migration.op, "add_column", add_column)
    monkeypatch.setattr(migration.op, "batch_alter_table", batch_alter_table)

    migration.upgrade()

    assert [call.args[0] for call in add_column.call_args_list] == [
        "cards",
        "user_cards",
        "user_cards",
    ]
    batch_alter_table.assert_not_called()


def create_partial_0025_logo_schema(database_path: Path) -> None:
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE assets (
                id VARCHAR PRIMARY KEY
            );
            CREATE TABLE organizations (
                id VARCHAR PRIMARY KEY,
                logo_asset_id VARCHAR
            );
            CREATE INDEX ix_organizations_logo_asset_id
                ON organizations (logo_asset_id);
            CREATE TABLE alembic_version (
                version_num VARCHAR(32) NOT NULL PRIMARY KEY
            );
            INSERT INTO alembic_version (version_num)
            VALUES ('0025_admin_partner_scope');
            """
        )


def test_alembic_uses_the_same_render_postgres_normalization_as_the_app() -> None:
    backend_dir = Path(__file__).parents[2]
    source = (backend_dir / "alembic/env.py").read_text(encoding="utf-8")

    assert "get_settings().async_database_url" in source


def test_alembic_revision_identifiers_fit_render_version_column() -> None:
    backend_dir = Path(__file__).parents[2]
    migration_files = sorted((backend_dir / "alembic/versions").glob("*.py"))

    for migration_file in migration_files:
        source = migration_file.read_text(encoding="utf-8")
        for field in ("revision", "down_revision"):
            match = re.search(rf"^{field}:.*?= \"([^\"]+)\"$", source, re.MULTILINE)
            if match:
                assert len(match.group(1)) <= 32, migration_file.name


def test_point_ledger_migration_installs_append_only_guard() -> None:
    source = (
        Path(__file__).parents[2] / "alembic/versions/0078_point_ledger_append_only.py"
    ).read_text()
    assert "BEFORE UPDATE OR DELETE" in source
    assert "point_ledger" in source


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
        engagement_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(engagement_events)").fetchall()
        }
        assert {"next_attempt_at", "dead_lettered_at"} <= engagement_columns
        delivery_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(notification_deliveries)").fetchall()
        }
        assert {"notification_id", "channel", "status", "idempotency_key"} <= delivery_columns
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
        assert {"fan_wishlist_items", "collection_goals"} <= partner_tables
        assert "push_devices" in partner_tables
        push_device_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(push_devices)").fetchall()
        }
        assert {
            "user_id",
            "token",
            "platform",
            "enabled",
            "last_seen_at",
            "updated_at",
        } <= push_device_columns
        organization_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(organizations)").fetchall()
        }
        assert "logo_asset_id" in organization_columns
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
        connection.execute(
            """
            INSERT INTO organizations (
                id, name, slug, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            ("org_company_admin", "회사 관리자 조직", "company-admin-org", "active"),
        )
        connection.execute(
            """
            INSERT INTO admin_memberships (
                user_id, organization_id, access_level, status,
                display_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (
                "valid_company_admin",
                "org_company_admin",
                "company_admin",
                "active",
                "회사 관리자",
            ),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO admin_memberships (
                    user_id, organization_id, access_level, status,
                    display_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("invalid_company_admin_scope", None, "company_admin", "active", "범위 없음"),
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
        growth_tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert {
            "engagement_events",
            "analytics_events",
            "achievement_definitions",
            "achievement_progress",
            "reward_catalog",
            "reward_grants",
            "xp_ledger",
            "fan_levels",
            "pass_seasons",
            "pass_tiers",
            "pass_progress",
            "profile_equipment",
        } <= growth_tables
        reward_grant_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(reward_grants)").fetchall()
        }
        assert "claimed_at" in reward_grant_columns
        achievement_columns = {
            row[1]: row
            for row in connection.execute("PRAGMA table_info(achievement_definitions)").fetchall()
        }
        assert {"starts_at", "ends_at"} <= set(achievement_columns)
        pass_season_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(pass_seasons)").fetchall()
        }
        assert "is_paid" in pass_season_columns
        assert pass_season_columns["is_paid"][3] == 1


def test_growth_migration_enforces_idempotency_constraints(tmp_path: Path) -> None:
    database_path = tmp_path / "fan-growth.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            """
            INSERT INTO users (
                id, role, must_change_password, favorite_artist_ids,
                favorite_member_ids, onboarding_completed, notification_email_enabled
            ) VALUES (?, ?, ?, json('[]'), json('[]'), ?, ?)
            """,
            ("fan", "FAN", False, False, False),
        )
        connection.execute(
            """
            INSERT INTO engagement_events (
                id, user_id, kind, source_type, source_id, payload, status
            ) VALUES (?, ?, ?, ?, ?, json('{}'), ?)
            """,
            ("evt_1", "fan", "card_collected", "user_card", "uc_1", "pending"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO engagement_events (
                    id, user_id, kind, source_type, source_id, payload, status
                ) VALUES (?, ?, ?, ?, ?, json('{}'), ?)
                """,
                ("evt_2", "fan", "card_collected", "user_card", "uc_1", "pending"),
            )

        connection.execute(
            """
            INSERT INTO xp_ledger (id, user_id, event_id, rule_key, amount, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            ("xp_1", "fan", "evt_1", "card_collected", 30),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO xp_ledger (id, user_id, event_id, rule_key, amount, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                ("xp_2", "fan", "evt_1", "card_collected", 30),
            )

        connection.execute(
            """
            INSERT INTO achievement_definitions (
                id, title, condition_type, target_value, condition_payload, status
            ) VALUES (?, ?, ?, ?, json('{}'), ?)
            """,
            ("achievement_1", "첫 카드", "first_card", 1, "published"),
        )
        connection.execute(
            """
            INSERT INTO achievement_progress (
                id, user_id, achievement_id, current_value, updated_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            ("achievement_progress_1", "fan", "achievement_1", 1),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO achievement_progress (
                    id, user_id, achievement_id, current_value, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                ("achievement_progress_2", "fan", "achievement_1", 1),
            )

        connection.execute(
            """
            INSERT INTO reward_catalog (
                id, reward_type, name, metadata, status
            ) VALUES (?, ?, ?, json('{}'), ?)
            """,
            ("reward_1", "badge", "첫 카드 배지", "published"),
        )
        connection.execute(
            """
            INSERT INTO reward_grants (
                id, user_id, reward_id, source_event_id, rule_key, granted_at, claimed_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
            """,
            ("reward_grant_1", "fan", "reward_1", "evt_1", "first_card"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO reward_grants (
                    id, user_id, reward_id, source_event_id, rule_key, granted_at, claimed_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("reward_grant_2", "fan", "reward_1", "evt_1", "first_card"),
            )

        connection.execute(
            """
            INSERT INTO pass_seasons (id, title, status)
            VALUES (?, ?, ?)
            """,
            ("season_1", "무료 팬 패스", "published"),
        )
        connection.execute(
            """
            INSERT INTO pass_progress (
                id, user_id, season_id, current_xp, claimed_tier_ids, updated_at
            ) VALUES (?, ?, ?, ?, json('[]'), CURRENT_TIMESTAMP)
            """,
            ("pass_progress_1", "fan", "season_1", 30),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO pass_progress (
                    id, user_id, season_id, current_xp, claimed_tier_ids, updated_at
                ) VALUES (?, ?, ?, ?, json('[]'), CURRENT_TIMESTAMP)
                """,
                ("pass_progress_2", "fan", "season_1", 30),
            )

        connection.execute(
            """
            INSERT INTO profile_equipment (
                user_id, equipped_reward_ids, is_public, updated_at
            ) VALUES (?, json('[]'), ?, CURRENT_TIMESTAMP)
            """,
            ("fan", True),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO profile_equipment (
                    user_id, equipped_reward_ids, is_public, updated_at
                ) VALUES (?, json('[]'), ?, CURRENT_TIMESTAMP)
                """,
                ("fan", True),
            )


def test_growth_migration_emits_offline_sql_without_database_inspection(tmp_path: Path) -> None:
    database_path = tmp_path / "offline-fan-growth.db"
    backend_dir = Path(__file__).parents[2]

    generated = run_alembic(
        backend_dir,
        database_path,
        "upgrade",
        "0030_card_drop_link:0031_fan_growth_foundation",
        "--sql",
    )

    assert generated.returncode == 0, generated.stderr
    assert "CREATE TABLE engagement_events" in generated.stdout
    assert "CREATE TABLE xp_ledger" in generated.stdout
    assert "uq_reward_grant_event_rule" in generated.stdout


def test_reward_claim_migration_adds_nullable_claimed_at(tmp_path: Path) -> None:
    database_path = tmp_path / "fan-reward-claims.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        reward_grant_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(reward_grants)").fetchall()
        }
        assert "claimed_at" in reward_grant_columns
        assert reward_grant_columns["claimed_at"][3] == 0


def test_reward_claim_migration_emits_offline_sql_without_database_inspection(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "offline-fan-reward-claims.db"
    backend_dir = Path(__file__).parents[2]

    generated = run_alembic(
        backend_dir,
        database_path,
        "upgrade",
        "0031_fan_growth_foundation:0032_fan_reward_claims",
        "--sql",
    )

    assert generated.returncode == 0, generated.stderr
    assert "ALTER TABLE reward_grants ADD COLUMN claimed_at" in generated.stdout


def test_free_pass_season_migration_adds_required_is_paid_default(tmp_path: Path) -> None:
    database_path = tmp_path / "free-pass-seasons.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        pass_season_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(pass_seasons)").fetchall()
        }
        assert "is_paid" in pass_season_columns
        assert pass_season_columns["is_paid"][3] == 1
        connection.execute(
            """
            INSERT INTO pass_seasons (id, title, status)
            VALUES (?, ?, ?)
            """,
            ("season_free_default", "무료 팬 패스", "draft"),
        )
        is_paid = connection.execute(
            "SELECT is_paid FROM pass_seasons WHERE id = ?",
            ("season_free_default",),
        ).fetchone()[0]
        assert is_paid == 0


def test_free_pass_season_migration_emits_offline_sql_without_database_inspection(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "offline-free-pass-seasons.db"
    backend_dir = Path(__file__).parents[2]

    generated = run_alembic(
        backend_dir,
        database_path,
        "upgrade",
        "0032_fan_reward_claims:0033_free_pass_seasons",
        "--sql",
    )

    assert generated.returncode == 0, generated.stderr
    assert "ALTER TABLE pass_seasons ADD COLUMN is_paid" in generated.stdout


def test_card_release_migration_creates_review_workflow_storage(tmp_path: Path) -> None:
    database_path = tmp_path / "card-release-workflow.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert {"card_review_requests", "card_review_decisions"} <= table_names

        card_columns = {row[1] for row in connection.execute("PRAGMA table_info(cards)").fetchall()}
        assert {"release_policy", "release_status", "review_version"} <= card_columns

        request_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(card_review_requests)").fetchall()
        }
        assert {"id", "card_id", "version", "stage", "status", "snapshot"} <= request_columns
        connection.execute(
            """
            INSERT INTO card_review_requests (
                id, card_id, version, stage, status, snapshot
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("request_1", "card_published", 1, "partner", "pending", "{}"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO card_review_requests (
                    id, card_id, version, stage, status, snapshot
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                ("request_2", "card_published", 1, "partner", "pending", "{}"),
            )

        decision_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(card_review_decisions)").fetchall()
        }
        assert {
            "id",
            "request_id",
            "reviewer_user_id",
            "decision",
            "note",
            "decided_at",
        } <= decision_columns

        notification_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(notifications)").fetchall()
        }
        assert {"entity_type", "entity_id", "event_key"} <= notification_columns
        notification_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(notifications)").fetchall()
        }
        assert "uq_notifications_user_event_key" in notification_indexes


def test_organization_logo_asset_migration_creates_fk_index_and_downgrades_cleanly(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "organization-logo-asset.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr
    with sqlite3.connect(database_path) as connection:
        foreign_keys = connection.execute("PRAGMA foreign_key_list(organizations)").fetchall()
        assert any(
            row[3] == "logo_asset_id" and row[2] == "assets" and row[4] == "id"
            for row in foreign_keys
        )
        organization_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(organizations)").fetchall()
        }
        assert "ix_organizations_logo_asset_id" in organization_indexes

    downgraded = run_alembic(backend_dir, database_path, "downgrade", "0025_admin_partner_scope")
    assert downgraded.returncode == 0, downgraded.stderr
    with sqlite3.connect(database_path) as connection:
        organization_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(organizations)").fetchall()
        }
        assert "logo_asset_id" not in organization_columns
        organization_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(organizations)").fetchall()
        }
        assert "ix_organizations_logo_asset_id" not in organization_indexes
        foreign_keys = connection.execute("PRAGMA foreign_key_list(organizations)").fetchall()
        assert not any(row[3] == "logo_asset_id" for row in foreign_keys)


def test_organization_logo_asset_migration_repairs_partial_upgrade_missing_fk(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "organization-logo-asset-partial-upgrade.db"
    backend_dir = Path(__file__).parents[2]

    create_partial_0025_logo_schema(database_path)

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr
    with sqlite3.connect(database_path) as connection:
        foreign_keys = connection.execute("PRAGMA foreign_key_list(organizations)").fetchall()
        assert any(
            row[3] == "logo_asset_id" and row[2] == "assets" and row[4] == "id"
            for row in foreign_keys
        )


def test_organization_logo_asset_migration_downgrades_partial_schema_without_fk(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "organization-logo-asset-partial-downgrade.db"
    backend_dir = Path(__file__).parents[2]

    create_partial_0025_logo_schema(database_path)
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            "UPDATE alembic_version SET version_num = ?", ("0026_organization_logo_asset",)
        )

    downgraded = run_alembic(backend_dir, database_path, "downgrade", "0025_admin_partner_scope")
    assert downgraded.returncode == 0, downgraded.stderr
    with sqlite3.connect(database_path) as connection:
        organization_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(organizations)").fetchall()
        }
        assert "logo_asset_id" not in organization_columns


def test_drop_ownership_migration_adds_nullable_scope_columns_fk_and_index(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "drop-ownership.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr
    with sqlite3.connect(database_path) as connection:
        drop_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(drops)").fetchall()
        }
        assert "organization_id" in drop_columns
        assert "artist_id" in drop_columns
        assert drop_columns["organization_id"][3] == 0
        assert drop_columns["artist_id"][3] == 0

        drop_foreign_keys = connection.execute("PRAGMA foreign_key_list(drops)").fetchall()
        assert any(
            row[3] == "organization_id" and row[2] == "organizations" and row[4] == "id"
            for row in drop_foreign_keys
        )
        assert any(
            row[3] == "artist_id" and row[2] == "artists" and row[4] == "id"
            for row in drop_foreign_keys
        )

        drop_indexes = {row[1] for row in connection.execute("PRAGMA index_list(drops)").fetchall()}
        assert "ix_drops_organization_artist_status" in drop_indexes
        index_columns = [
            row[2]
            for row in connection.execute(
                "PRAGMA index_info(ix_drops_organization_artist_status)"
            ).fetchall()
        ]
        assert index_columns == ["organization_id", "artist_id", "status"]


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


def test_growth_missions_points_migration_creates_schema_and_defaults(tmp_path: Path) -> None:
    database_path = tmp_path / "growth-missions-points.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert {
            "mission_definitions",
            "mission_progress",
            "point_ledger",
            "point_balances",
            "level_policy_versions",
            "level_thresholds",
        } <= table_names

        engagement_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(engagement_events)")
        }
        assert {"error_code", "error_message", "attempt_count"} <= set(engagement_columns)
        assert engagement_columns["attempt_count"][3] == 1

        default_policy = connection.execute(
            """
            SELECT id, name, status, is_active
            FROM level_policy_versions
            WHERE id = ?
            """,
            ("default_level_policy",),
        ).fetchone()
        assert default_policy == (
            "default_level_policy",
            "Default fan level policy",
            "published",
            1,
        )

        thresholds = connection.execute(
            """
            SELECT level, required_xp
            FROM level_thresholds
            WHERE policy_version_id = ?
            ORDER BY level
            """,
            ("default_level_policy",),
        ).fetchall()
        assert thresholds[:5] == [(1, 0), (2, 100), (3, 200), (4, 300), (5, 400)]


def test_growth_missions_points_migration_enforces_unique_idempotence_keys(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "growth-missions-points-constraints.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            """
            INSERT INTO users (
                id, role, must_change_password, favorite_artist_ids,
                favorite_member_ids, onboarding_completed, notification_email_enabled
            ) VALUES (?, ?, ?, json('[]'), json('[]'), ?, ?)
            """,
            ("fan_mission", "FAN", False, False, False),
        )
        connection.execute(
            """
            INSERT INTO engagement_events (
                id, user_id, kind, source_type, source_id, payload, status
            ) VALUES (?, ?, ?, ?, ?, json('{}'), ?)
            """,
            ("evt_mission", "fan_mission", "event_commented", "comment", "comment_1", "pending"),
        )
        connection.execute(
            """
            INSERT INTO mission_definitions (
                id, title, event_kind, target_value, recurrence, condition_payload,
                reward_payload, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, json('{}'), json('{}'), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            ("mission_comment", "댓글 미션", "event_commented", 1, "daily", "published"),
        )
        connection.execute(
            """
            INSERT INTO mission_progress (
                id, user_id, mission_id, period_key, current_value, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            ("progress_1", "fan_mission", "mission_comment", "2026-08-23", 1),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO mission_progress (
                    id, user_id, mission_id, period_key, current_value, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                ("progress_2", "fan_mission", "mission_comment", "2026-08-23", 1),
            )

        connection.execute(
            """
            INSERT INTO point_ledger (
                id, user_id, source_event_id, rule_key, transaction_type, amount,
                balance_after, description, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                "point_ledger_1",
                "fan_mission",
                "evt_mission",
                "mission:mission_comment",
                "earn",
                100,
                100,
                "mission reward",
            ),
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO point_ledger (
                    id, user_id, source_event_id, rule_key, transaction_type, amount,
                    balance_after, description, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    "point_ledger_2",
                    "fan_mission",
                    "evt_mission",
                    "mission:mission_comment",
                    "earn",
                    100,
                    100,
                    "duplicate reward",
                ),
            )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO level_thresholds (
                    id, policy_version_id, level, required_xp, label
                ) VALUES (?, ?, ?, ?, ?)
                """,
                ("threshold_duplicate", "default_level_policy", 2, 100, "Duplicate L2"),
            )


def test_growth_missions_points_migration_downgrades_cleanly(tmp_path: Path) -> None:
    database_path = tmp_path / "growth-missions-points-downgrade.db"
    backend_dir = Path(__file__).parents[2]

    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    downgraded = run_alembic(backend_dir, database_path, "downgrade", "0049_analytics_events")
    assert downgraded.returncode == 0, downgraded.stderr

    with sqlite3.connect(database_path) as connection:
        table_names = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert (
            not {
                "mission_definitions",
                "mission_progress",
                "point_ledger",
                "point_balances",
                "level_policy_versions",
                "level_thresholds",
            }
            & table_names
        )
        engagement_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(engagement_events)")
        }
        assert not {"error_code", "error_message", "attempt_count"} & engagement_columns


def test_shop_order_status_migration_allows_refunds_on_legacy_sqlite_schema(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "legacy-shop-orders.db"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE shop_orders (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR NOT NULL,
                product_id VARCHAR NOT NULL,
                product_name VARCHAR(200) NOT NULL,
                price_points INTEGER NOT NULL,
                payment_method VARCHAR(32) NOT NULL,
                status VARCHAR(32) NOT NULL,
                created_at DATETIME NOT NULL,
                CONSTRAINT ck_shop_orders_status CHECK (status IN ('completed', 'failed'))
            );
            CREATE TABLE users (id VARCHAR PRIMARY KEY);
            CREATE TABLE artists (id VARCHAR PRIMARY KEY);
            CREATE TABLE shop_products (id VARCHAR PRIMARY KEY);
            CREATE TABLE card_packs (id VARCHAR PRIMARY KEY);
            INSERT INTO shop_orders
                (id, user_id, product_id, product_name, price_points, payment_method, status, created_at)
            VALUES ('order_1', 'fan_1', 'product_1', 'Pack', 1200, 'points', 'completed', CURRENT_TIMESTAMP);
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
            INSERT INTO alembic_version (version_num) VALUES ('0062_shop_product_operations');
            """
        )

    backend_dir = Path(__file__).parents[2]
    upgraded = run_alembic(backend_dir, database_path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr

    with sqlite3.connect(database_path) as connection:
        connection.execute("UPDATE shop_orders SET status='refunded' WHERE id='order_1'")
        assert connection.execute(
            "SELECT status FROM shop_orders WHERE id='order_1'"
        ).fetchone() == ("refunded",)
