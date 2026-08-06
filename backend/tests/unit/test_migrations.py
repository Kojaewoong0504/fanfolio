import os
import sqlite3
import subprocess
from pathlib import Path


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
        assert "transform" in asset_columns
        redeem_code_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(redeem_codes)").fetchall()
        }
        assert "disabled_at" in redeem_code_columns
        card_columns = {row[1] for row in connection.execute("PRAGMA table_info(cards)").fetchall()}
        assert "voice_asset_id" in card_columns
        user_card_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(user_cards)").fetchall()
        }
        assert {"acquisition_source", "drop_id"} <= user_card_columns
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
        ).fetchone()
        user_card_indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(user_cards)").fetchall()
        }
        assert "uq_user_cards_card_serial" in user_card_indexes


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
