from pathlib import Path

from app.storage import LocalAssetStorage


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
