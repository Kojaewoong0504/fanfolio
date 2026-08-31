from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

from app.storage import AssetStorage, local_asset_storage

EVENT_HERO_DERIVATIVE_SUFFIX = "-event-hero-v1.webp"


class InvalidEventHeroError(ValueError):
    """The source bytes cannot produce a fan-facing event hero."""


def save_uploaded_bytes(storage_dir: str, asset_id: str, content: bytes) -> str:
    return local_asset_storage(storage_dir).save_bytes(asset_id, content)


def optimize_event_hero_bytes(content: bytes) -> bytes:
    """Bound event banners to the fan viewport and encode a compact WebP variant."""
    try:
        with Image.open(BytesIO(content)) as source:
            image = ImageOps.exif_transpose(source)
            image.thumbnail((1200, 600), Image.Resampling.LANCZOS)
            if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                rgba = image.convert("RGBA")
                flattened = Image.new("RGB", rgba.size, (18, 16, 54))
                flattened.paste(rgba, mask=rgba.getchannel("A"))
                image = flattened
            else:
                image = image.convert("RGB")
            output = BytesIO()
            image.save(output, "WEBP", quality=82, method=6)
            return output.getvalue()
    except OSError as error:
        raise InvalidEventHeroError("event hero source is not a usable image") from error


def ensure_event_hero_derivative(
    storage: AssetStorage,
    asset_id: str,
    source_path: str,
    source_content: bytes | None = None,
    *,
    force: bool = False,
) -> str:
    """Return a ready event hero derivative, creating it once when missing."""
    derivative_path = storage.asset_path(asset_id, EVENT_HERO_DERIVATIVE_SUFFIX)
    if not force and storage.exists(derivative_path):
        return derivative_path
    content = source_content if source_content is not None else storage.read_bytes(source_path)
    return storage.save_derived_bytes(
        asset_id,
        EVENT_HERO_DERIVATIVE_SUFFIX,
        optimize_event_hero_bytes(content),
        content_type="image/webp",
    )


def remove_light_background_bytes(content: bytes) -> bytes:
    source = Image.open(BytesIO(content)).convert("RGBA")
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, _alpha = source.getpixel((x, y))
            if red > 242 and green > 242 and blue > 242:
                source.putpixel((x, y), (red, green, blue, 0))
    output = BytesIO()
    source.save(output, "PNG")
    return output.getvalue()


def remove_light_background(storage_dir: str, asset_id: str, source_path: str) -> str:
    output = local_asset_storage(storage_dir).asset_path(asset_id, "-transparent.png")
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    Path(output).write_bytes(remove_light_background_bytes(Path(source_path).read_bytes()))
    return output


def compose_card_preview_bytes(
    base_content: bytes,
    handwriting_content: bytes | None,
    transform: dict[str, float] | None,
) -> bytes:
    base = Image.open(BytesIO(base_content)).convert("RGBA")
    if handwriting_content:
        handwriting = Image.open(BytesIO(handwriting_content)).convert("RGBA")
        options = transform or {}
        width = int(options.get("width", handwriting.width))
        height = int(options.get("height", handwriting.height * width / handwriting.width))
        handwriting = handwriting.resize((max(1, width), max(1, height)))
        rotation = float(options.get("rotation", 0))
        if rotation:
            handwriting = handwriting.rotate(
                rotation, expand=True, resample=Image.Resampling.BICUBIC
            )
        base.alpha_composite(handwriting, (int(options.get("x", 0)), int(options.get("y", 0))))
    output = BytesIO()
    base.save(output, "PNG")
    return output.getvalue()


def compose_card_preview(
    storage_dir: str,
    card_id: str,
    base_path: str,
    handwriting_path: str | None,
    transform: dict[str, float] | None,
) -> str:
    content = compose_card_preview_bytes(
        Path(base_path).read_bytes(),
        Path(handwriting_path).read_bytes() if handwriting_path else None,
        transform,
    )
    output = Path(local_asset_storage(storage_dir).preview_path(card_id))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(content)
    return str(output)
