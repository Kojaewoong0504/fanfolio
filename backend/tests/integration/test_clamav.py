import asyncio
import os

import pytest

from app import upload_safety
from app.errors import AppError

pytestmark = pytest.mark.skipif(
    os.getenv("FANFOLIO_CLAMAV_INTEGRATION") != "1",
    reason="set FANFOLIO_CLAMAV_INTEGRATION=1 to run against ClamAV",
)

# The EICAR test string is a standard, non-executable signature used to verify
# antivirus integrations.  It is intentionally not written to disk.
EICAR_TEST_STRING = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


def test_clamav_accepts_clean_content_and_rejects_eicar() -> None:
    try:
        asyncio.run(
            upload_safety.scan_uploaded_content(
                content_type="text/plain",
                purpose="integration-test",
                content=b"Fanfolio clean integration fixture",
            )
        )
    except AppError as error:
        pytest.fail(f"ClamAV did not accept clean content: {error.code}")

    with pytest.raises(AppError) as raised:
        asyncio.run(
            upload_safety.scan_uploaded_content(
                content_type="application/octet-stream",
                purpose="integration-test",
                content=EICAR_TEST_STRING,
            )
        )

    assert raised.value.status_code == 422
    assert raised.value.code == "MALWARE_DETECTED"
