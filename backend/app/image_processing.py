from io import BytesIO
from pathlib import Path

from PIL import Image

from app.storage import local_asset_storage


def save_uploaded_bytes(storage_dir: str, asset_id: str, content: bytes) -> str:
    return local_asset_storage(storage_dir).save_bytes(asset_id, content)


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
