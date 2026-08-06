"""Storage provider boundary.

The API currently runs with a local filesystem provider.  Application code
uses this small interface for writes and generated-image paths so replacing
the provider with S3/MinIO does not require changing the domain services.
"""

from pathlib import Path
from typing import Protocol


class AssetStorage(Protocol):
    def save_bytes(self, asset_id: str, content: bytes) -> str: ...

    def asset_path(self, asset_id: str, suffix: str = "") -> str: ...

    def preview_path(self, card_id: str) -> str: ...

    def exists(self, storage_path: str) -> bool: ...


class LocalAssetStorage:
    """Filesystem-backed provider used by local development and tests."""

    def __init__(self, storage_dir: str) -> None:
        self.root = Path(storage_dir).resolve()

    def asset_path(self, asset_id: str, suffix: str = "") -> str:
        return str(self.root / "assets" / f"{asset_id}{suffix}")

    def preview_path(self, card_id: str) -> str:
        return str(self.root / "previews" / f"{card_id}.png")

    def exists(self, storage_path: str) -> bool:
        return Path(storage_path).is_file()

    def save_bytes(self, asset_id: str, content: bytes) -> str:
        path = Path(self.asset_path(asset_id, ".bin"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return str(path)


def local_asset_storage(storage_dir: str) -> LocalAssetStorage:
    """Return the current local provider; the seam is the future provider factory."""
    return LocalAssetStorage(storage_dir)
