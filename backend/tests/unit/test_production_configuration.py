from pathlib import Path

from app.core.config import Settings


def test_production_environment_template_is_runtime_valid() -> None:
    template = Path(__file__).parents[3] / ".env.production.example"

    settings = Settings(_env_file=template)

    settings.validate_runtime()
    assert settings.storage_backend == "s3"
    assert settings.asset_scan_mode == "clamav"
