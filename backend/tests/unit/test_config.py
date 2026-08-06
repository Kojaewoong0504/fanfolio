from app.core.config import Settings


def test_frontend_origins_are_parsed_without_empty_values() -> None:
    settings = Settings(
        app_env="test",
        frontend_origins=" https://app.example , ,http://localhost:5173 ",
    )

    assert settings.allowed_origins == ["https://app.example", "http://localhost:5173"]
