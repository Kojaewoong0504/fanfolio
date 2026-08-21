"""Validation and normalization for artist-authored card effects.

Effect configurations are deliberately data-only. The clients render a small,
versioned vocabulary instead of accepting arbitrary CSS, HTML, or executable
content from an artist studio.
"""

import re
from copy import deepcopy
from typing import Any

from app.errors import AppError

ALLOWED_PRESETS = {"none", "light", "glow", "foil", "hologram", "particles", "motion"}
ALLOWED_INTERACTIONS = {"static", "tilt", "lenticular"}
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def validate_effect_config(config: Any) -> dict:
    if not isinstance(config, dict):
        raise AppError(422, "INVALID_EFFECT_CONFIG", "효과 설정 형식을 확인해 주세요.")

    normalized = deepcopy(config)
    normalized["version"] = int(config.get("version", 3))
    for side_name in ("front", "back"):
        side = config.get(side_name, {})
        if not isinstance(side, dict):
            raise AppError(422, "INVALID_EFFECT_CONFIG", "효과 설정 형식을 확인해 주세요.")
        preset = side.get("preset", side.get("effectPreset", "none"))
        if preset not in ALLOWED_PRESETS:
            raise AppError(422, "INVALID_EFFECT_CONFIG", "지원하지 않는 효과 프리셋입니다.")
        interaction = side.get("interaction", "static" if side_name == "back" else "tilt")
        if interaction not in ALLOWED_INTERACTIONS:
            raise AppError(422, "INVALID_EFFECT_CONFIG", "지원하지 않는 카드 상호작용입니다.")
        if side_name == "back" and interaction == "lenticular":
            raise AppError(422, "INVALID_EFFECT_CONFIG", "카드 뒷면은 틸트만 지원합니다.")
        for key in ("intensity", "speed"):
            value = side.get(key)
            if value is not None and (
                not isinstance(value, (int, float))
                or isinstance(value, bool)
                or not 0 <= value <= 1
            ):
                raise AppError(422, "INVALID_EFFECT_CONFIG", "효과 강도는 0과 1 사이여야 합니다.")
        particle_count = side.get("particleCount")
        if particle_count is not None and (
            not isinstance(particle_count, int)
            or isinstance(particle_count, bool)
            or not 0 <= particle_count <= 40
        ):
            raise AppError(422, "INVALID_EFFECT_CONFIG", "파티클 수는 0에서 40 사이여야 합니다.")
        color = side.get("color")
        if color is not None and (not isinstance(color, str) or not HEX_COLOR.fullmatch(color)):
            raise AppError(422, "INVALID_EFFECT_CONFIG", "색상 형식을 확인해 주세요.")
        for key in ("lenticularAssetId", "backImageAssetId", "imageAssetId"):
            value = side.get(key)
            if value is not None and (
                not isinstance(value, str)
                or len(value) > 200
                or value.startswith(("data:", "javascript:"))
            ):
                raise AppError(422, "INVALID_EFFECT_CONFIG", "효과 자산 참조를 확인해 주세요.")
        normalized_side = normalized.setdefault(side_name, {})
        normalized_side.setdefault("preset", preset)
        normalized_side.setdefault("interaction", interaction)
    return normalized
