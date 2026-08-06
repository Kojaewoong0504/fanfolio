from pathlib import Path

from app.storage import LocalAssetStorage, S3AssetStorage


class FakeBody:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def read(self) -> bytes:
        return self.content


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, **_: object) -> None:
        self.objects[(Bucket, Key)] = Body

    def head_object(self, *, Bucket: str, Key: str) -> None:
        if (Bucket, Key) not in self.objects:
            error = RuntimeError("not found")
            error.response = {"ResponseMetadata": {"HTTPStatusCode": 404}}
            raise error

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, FakeBody]:
        return {"Body": FakeBody(self.objects[(Bucket, Key)])}


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


def test_s3_asset_storage_uses_object_keys_and_reads_objects() -> None:
    storage = S3AssetStorage(client=FakeS3Client(), bucket="fanfolio-test")

    path = storage.save_bytes("asset_test", b"remote bytes")

    assert path == "s3://fanfolio-test/fanfolio/assets/asset_test.bin"
    assert storage.exists(path)
    assert storage.read_bytes(path) == b"remote bytes"
    assert not storage.exists("s3://fanfolio-test/fanfolio/assets/missing.bin")

    derived = storage.save_derived_bytes("asset_test", "-transparent.png", b"png bytes")
    preview = storage.save_preview_bytes("card_test", b"preview bytes")

    assert storage.read_bytes(derived) == b"png bytes"
    assert storage.read_bytes(preview) == b"preview bytes"
