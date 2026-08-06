import re
from pathlib import Path

from app.main import app


def test_api_contract_map_covers_every_fastapi_operation() -> None:
    """Keep the visual contract map aligned with the executable OpenAPI surface."""
    map_path = Path(__file__).parents[3] / "fanfolio-api-contract-map.html"
    html = map_path.read_text(encoding="utf-8")
    map_operations = set(re.findall(r"method:'([^']+)', path:'([^']+)'", html))
    openapi_operations = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method != "parameters"
    }

    assert map_operations == openapi_operations
