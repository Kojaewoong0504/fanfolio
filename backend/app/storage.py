"""Storage provider boundary.

The API currently runs with a local filesystem provider.  Application code
uses this small interface for writes and generated-image paths so replacing
the provider with S3/MinIO does not require changing the domain services.
"""

from pathlib import Path
from typing import Protocol

from fastapi.responses import FileResponse, Response


class StorageObjectNotFound(FileNotFoundError):
    """Stable signal for a missing object across storage providers."""


def _is_provider_not_found(error: Exception) -> bool:
    response = getattr(error, "response", {})
    error_code = str(response.get("Error", {}).get("Code", ""))
    http_status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return http_status == 404 or error_code in {"404", "NoSuchKey", "NotFound"}


class AssetStorage(Protocol):
    def check_ready(self) -> None: ...

    def save_bytes(self, asset_id: str, content: bytes) -> str: ...

    def asset_path(self, asset_id: str, suffix: str = "") -> str: ...

    def preview_path(self, card_id: str) -> str: ...

    def exists(self, storage_path: str) -> bool: ...

    def read_bytes(self, storage_path: str) -> bytes: ...

    def save_derived_bytes(self, asset_id: str, suffix: str, content: bytes) -> str: ...

    def save_preview_bytes(self, card_id: str, content: bytes) -> str: ...

    def delete(self, storage_path: str) -> None: ...

    def size_bytes(self, storage_path: str) -> int: ...

    def presigned_upload_url(self, asset_id: str, *, content_type: str, expires_in: int) -> str: ...


class LocalAssetStorage:
    """Filesystem-backed provider used by local development and tests."""

    def __init__(self, storage_dir: str) -> None:
        self.root = Path(storage_dir).resolve()

    def asset_path(self, asset_id: str, suffix: str = "") -> str:
        return str(self.root / "assets" / f"{asset_id}{suffix}")

    def check_ready(self) -> None:
        """The local provider is ready when the process can access its root."""
        self.root.mkdir(parents=True, exist_ok=True)

    def preview_path(self, card_id: str) -> str:
        return str(self.root / "previews" / f"{card_id}.png")

    def exists(self, storage_path: str) -> bool:
        return Path(storage_path).is_file()

    def read_bytes(self, storage_path: str) -> bytes:
        try:
            return Path(storage_path).read_bytes()
        except FileNotFoundError as error:
            raise StorageObjectNotFound(storage_path) from error

    def save_derived_bytes(self, asset_id: str, suffix: str, content: bytes) -> str:
        path = Path(self.asset_path(asset_id, suffix))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return str(path)

    def save_preview_bytes(self, card_id: str, content: bytes) -> str:
        path = Path(self.preview_path(card_id))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return str(path)

    def delete(self, storage_path: str) -> None:
        path = Path(storage_path)
        if path.exists():
            path.unlink()

    def size_bytes(self, storage_path: str) -> int:
        return Path(storage_path).stat().st_size

    def presigned_upload_url(self, asset_id: str, *, content_type: str, expires_in: int) -> str:
        raise ValueError("local storage does not provide presigned URLs")

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

    def check_ready(self) -> None:
        """Validate the bucket itself, not a possibly absent healthcheck object."""
        self.client.head_bucket(Bucket=self.bucket)

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
            if _is_provider_not_found(error):
                return False
            raise
        return True

    def read_bytes(self, storage_path: str) -> bytes:
        try:
            response = self.client.get_object(
                Bucket=self.bucket, Key=self._key_from_uri(storage_path)
            )
        except Exception as error:
            if _is_provider_not_found(error):
                raise StorageObjectNotFound(storage_path) from error
            raise
        return response["Body"].read()

    def save_derived_bytes(self, asset_id: str, suffix: str, content: bytes) -> str:
        key = self._key(asset_id, suffix)
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content)
        return self._uri(key)

    def save_preview_bytes(self, card_id: str, content: bytes) -> str:
        key = f"{self.key_prefix}/previews/{card_id}.png"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType="image/png")
        return self._uri(key)

    def delete(self, storage_path: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._key_from_uri(storage_path))

    def size_bytes(self, storage_path: str) -> int:
        response = self.client.head_object(Bucket=self.bucket, Key=self._key_from_uri(storage_path))
        return int(response["ContentLength"])

    def presigned_upload_url(self, asset_id: str, *, content_type: str, expires_in: int) -> str:
        return self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": self._key(asset_id, ".bin"),
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

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


def storage_response(
    storage: AssetStorage,
    storage_path: str,
    *,
    media_type: str,
    filename: str | None = None,
) -> Response:
    """Serve either a local file or a remote object through one route helper."""
    if storage_path.startswith("s3://"):
        headers = {}
        if filename:
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        return Response(
            content=storage.read_bytes(storage_path), media_type=media_type, headers=headers
        )
    return FileResponse(storage_path, media_type=media_type, filename=filename)
