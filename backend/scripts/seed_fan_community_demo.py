"""Seed isolated local fan accounts for the real social and trade journey."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal, engine
from app.services import ensure_fan_community_demo


async def main() -> None:
    password = os.environ.get("FAN_COMMUNITY_DEMO_PASSWORD", "Fanfolio-demo-2026")
    try:
        async with SessionLocal() as session:
            result = await ensure_fan_community_demo(session, password=password)
    finally:
        await engine.dispose()

    print(
        json.dumps(
            {
                **result,
                "loginEmail": "demo.fan@example.com",
                "collectorEmail": "demo.collector@example.com",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
