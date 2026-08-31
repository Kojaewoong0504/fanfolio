from pathlib import Path

import pytest

from app.storage import LocalAssetStorage, S3AssetStorage, StorageObjectNotFound


class FakeBody:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def read(self) -> bytes:
        return self.content


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.fail_get_with: Exception | None = None
        self.put_requests: list[dict[str, object]] = []

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, **kwargs: object) -> None:
        self.objects[(Bucket, Key)] = Body
        self.put_requests.append({"Bucket": Bucket, "Key": Key, "Body": Body, **kwargs})

    def list_objects_v2(self, *, Bucket: str, Prefix: str, MaxKeys: int) -> dict[str, object]:
        assert MaxKeys == 1
        return {
            "Contents": [
                {"Key": key}
                for object_bucket, key in self.objects
                if object_bucket == Bucket and key.startswith(Prefix)
            ][:MaxKeys]
        }

    def head_object(self, *, Bucket: str, Key: str) -> None:
        if (Bucket, Key) not in self.objects:
            error = RuntimeError("not found")
            error.response = {"ResponseMetadata": {"HTTPStatusCode": 404}}
            raise error

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, FakeBody]:
        if self.fail_get_with is not None:
            raise self.fail_get_with
        if (Bucket, Key) not in self.objects:
            error = RuntimeError("not found")
            error.response = {"Error": {"Code": "NoSuchKey"}}
            raise error
        return {"Body": FakeBody(self.objects[(Bucket, Key)])}

    def generate_presigned_url(
        self, operation: str, *, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return f"https://storage.test/{Params['Key']}?expires={ExpiresIn}&operation={operation}"


def test_local_asset_storage_writes_assets_under_the_configured_root(tmp_path: Path) -> None:
    storage = LocalAssetStorage(str(tmp_path))

    path = storage.save_bytes("asset_test", b"asset bytes")

    assert Path(path).read_bytes() == b"asset bytes"
    assert path == str(tmp_path / "assets" / "asset_test.bin")
    assert storage.asset_path("asset_test", "-transparent.png") == str(
        tmp_path / "assets" / "asset_test-transparent.png"
    )
    assert storage.preview_path("card_test") == str(tmp_path / "previews" / "card_test.png")
    assert storage.exists(path)
    assert not storage.exists(str(tmp_path / "assets" / "missing.bin"))
    with pytest.raises(StorageObjectNotFound):
        storage.read_bytes(str(tmp_path / "assets" / "missing.bin"))


def test_s3_asset_storage_uses_object_keys_and_reads_objects() -> None:
    storage = S3AssetStorage(client=FakeS3Client(), bucket="fanfolio-test")

    storage.check_ready()

    path = storage.save_bytes("asset_test", b"remote bytes")

    assert path == "s3://fanfolio-test/fanfolio/assets/asset_test.bin"
    assert storage.exists(path)
    assert storage.read_bytes(path) == b"remote bytes"
    assert not storage.exists("s3://fanfolio-test/fanfolio/assets/missing.bin")

    derived = storage.save_derived_bytes(
        "asset_test", "-event-hero-v1.webp", b"webp bytes", content_type="image/webp"
    )
    preview = storage.save_preview_bytes("card_test", b"preview bytes")

    assert storage.read_bytes(derived) == b"webp bytes"
    assert storage.read_bytes(preview) == b"preview bytes"
    assert storage.client.put_requests[-2]["ContentType"] == "image/webp"
    presigned_url = storage.presigned_upload_url(
        "asset_next", content_type="image/png", expires_in=900
    )
    assert presigned_url.startswith("https://storage.test/")
    assert "asset_next-upload.bin" in presigned_url


def test_s3_asset_storage_normalizes_missing_object_reads_only() -> None:
    client = FakeS3Client()
    storage = S3AssetStorage(client=client, bucket="fanfolio-test")

    with pytest.raises(StorageObjectNotFound):
        storage.read_bytes("s3://fanfolio-test/fanfolio/assets/missing.bin")

    client.fail_get_with = RuntimeError("storage unavailable")
    with pytest.raises(RuntimeError, match="storage unavailable"):
        storage.read_bytes("s3://fanfolio-test/fanfolio/assets/missing.bin")
