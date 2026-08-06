"""Fanfolio API entry point.

이 파일에는 FastAPI 앱 뼈대만 있습니다. 라우터, 인증, 데이터 모델과 비즈니스
로직은 백엔드 담당자가 계약 테스트를 통과시키며 구현합니다.
"""

from fastapi import FastAPI

app = FastAPI(title="Fanfolio API", version="0.2.0")


@app.get("/api/health")
def get_health() -> dict[str, object]:
    return {"ok": True, "data": {"status": "healthy"}}
