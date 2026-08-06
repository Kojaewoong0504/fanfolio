import os
from uuid import uuid4

import pytest

from app.storage import S3AssetStorage

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
    try:
        assert storage.exists(path)
        assert storage.read_bytes(path) == b"integration bytes"
        assert storage.size_bytes(path) == len(b"integration bytes")
        assert storage.presigned_upload_url(
            asset_id, content_type="application/octet-stream", expires_in=60
        ).startswith("http")
    finally:
        storage.delete(path)
