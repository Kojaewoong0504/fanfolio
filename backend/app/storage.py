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

    def read_bytes(self, storage_path: str) -> bytes: ...


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

    def read_bytes(self, storage_path: str) -> bytes:
        return Path(storage_path).read_bytes()

    def save_bytes(self, asset_id: str, content: bytes) -> str:
        path = Path(self.asset_path(asset_id, ".bin"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return str(path)


def local_asset_storage(storage_dir: str) -> LocalAssetStorage:
    """Return the current local provider; the seam is the future provider factory."""
    return LocalAssetStorage(storage_dir)


def configured_asset_storage() -> AssetStorage:
    """Build the provider selected by runtime settings."""
    from app.core.config import get_settings

    settings = get_settings()
    if settings.storage_backend == "local":
        return local_asset_storage(settings.storage_dir)
    if settings.storage_backend == "s3":
        return S3AssetStorage.from_settings(settings)
    raise ValueError(f"unsupported STORAGE_BACKEND: {settings.storage_backend}")


class S3AssetStorage:
    """S3-compatible object storage provider.

    The client is injected to keep unit tests independent of cloud
    credentials.  ``from_settings`` is the production factory and lazily
    imports boto3 so local mode does not need to import it at startup.
    """

    def __init__(self, *, client: object, bucket: str, key_prefix: str = "fanfolio") -> None:
        self.client = client
        self.bucket = bucket
        self.key_prefix = key_prefix.strip("/")

    def _key(self, storage_id: str, suffix: str = "") -> str:
        return f"{self.key_prefix}/assets/{storage_id}{suffix}"

    def _uri(self, key: str) -> str:
        return f"s3://{self.bucket}/{key}"

    def _key_from_uri(self, storage_path: str) -> str:
        prefix = f"s3://{self.bucket}/"
        if not storage_path.startswith(prefix):
            raise ValueError("storage path does not belong to this bucket")
        return storage_path[len(prefix) :]

    def asset_path(self, asset_id: str, suffix: str = "") -> str:
        return self._uri(self._key(asset_id, suffix))

    def preview_path(self, card_id: str) -> str:
        return self._uri(f"{self.key_prefix}/previews/{card_id}.png")

    def save_bytes(self, asset_id: str, content: bytes) -> str:
        key = self._key(asset_id, ".bin")
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content)
        return self._uri(key)

    def exists(self, storage_path: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key_from_uri(storage_path))
        except Exception as error:  # boto3's ClientError is optional in local mode.
            if (
                getattr(error, "response", {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
                == 404
            ):
                return False
            raise
        return True

    def read_bytes(self, storage_path: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=self._key_from_uri(storage_path))
        return response["Body"].read()

    @classmethod
    def from_settings(cls, settings: object) -> "S3AssetStorage":
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )
        return cls(
            client=client,
            bucket=settings.s3_bucket,
            key_prefix=settings.s3_key_prefix,
        )
