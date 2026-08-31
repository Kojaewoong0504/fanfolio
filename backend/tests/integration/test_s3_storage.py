import os
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest

from app.storage import DIRECT_UPLOAD_STAGING_SUFFIX, S3AssetStorage

pytestmark = pytest.mark.skipif(
    os.getenv("FANFOLIO_S3_INTEGRATION") != "1",
    reason="set FANFOLIO_S3_INTEGRATION=1 to run against MinIO/S3",
)


def test_s3_storage_round_trip_and_presign() -> None:
    import boto3
    from botocore.exceptions import ClientError

    bucket = os.environ["S3_BUCKET"]
    client = boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
        region_name=os.getenv("S3_REGION", "ap-northeast-2"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY") or None,
    )
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        client.create_bucket(Bucket=bucket)
    storage = S3AssetStorage(
        client=client, bucket=bucket, key_prefix=os.getenv("S3_KEY_PREFIX", "fanfolio-test")
    )
    asset_id = f"integration_{uuid4().hex}"
    path = storage.save_bytes(asset_id, b"integration bytes")
    direct_path: str | None = None
    try:
        assert storage.exists(path)
        assert storage.read_bytes(path) == b"integration bytes"
        assert storage.size_bytes(path) == len(b"integration bytes")
        assert storage.presigned_upload_url(
            asset_id, content_type="application/octet-stream", expires_in=60
        ).startswith("http")

        direct_asset_id = f"integration_direct_{uuid4().hex}"
        direct_content = b"presigned integration bytes"
        upload_url = storage.presigned_upload_url(
            direct_asset_id, content_type="application/octet-stream", expires_in=60
        )
        request = Request(
            upload_url,
            data=direct_content,
            method="PUT",
            headers={
                "Content-Type": "application/octet-stream",
                "Origin": "http://localhost:5173",
            },
        )
        with urlopen(request, timeout=10) as response:
            assert response.status in {200, 204}
            assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"

        direct_path = storage.asset_path(direct_asset_id, DIRECT_UPLOAD_STAGING_SUFFIX)
        assert storage.exists(direct_path)
        assert storage.read_bytes(direct_path) == direct_content
    finally:
        storage.delete(path)
        if direct_path is not None:
            storage.delete(direct_path)
