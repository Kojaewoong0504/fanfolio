from pathlib import Path


def test_container_uses_the_writable_storage_directory_it_prepares() -> None:
    dockerfile = Path(__file__).parents[2] / "Dockerfile"
    source = dockerfile.read_text()

    assert 'STORAGE_DIR="/var/lib/fanfolio/storage"' in source
