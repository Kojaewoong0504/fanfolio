from io import BytesIO

from PIL import Image

from spatial_worker.engine import SpatialWorkerEngine


def png(image: Image.Image) -> bytes:
    image.save(buffer := BytesIO(), format="PNG")
    return buffer.getvalue()


def test_engine_returns_aligned_depth_mask_and_inpainted_background() -> None:
    source = Image.new("RGB", (12, 18), (20, 30, 60))

    engine = SpatialWorkerEngine(
        depth_estimator=lambda image: Image.new("L", image.size, 140),
        person_segmenter=lambda image: Image.new("L", image.size, 220),
        background_inpainter=lambda image, mask: Image.new("RGB", image.size, (5, 8, 20)),
        provider="depth-anything-v2+test-segmenter+test-inpaint",
        model_version="test-v1",
    )

    result = engine.generate(png(source))

    assert Image.open(BytesIO(result.depth)).size == (12, 18)
    assert Image.open(BytesIO(result.mask)).size == (12, 18)
    assert Image.open(BytesIO(result.background)).getpixel((0, 0)) == (5, 8, 20)
    assert result.provider == "depth-anything-v2+test-segmenter+test-inpaint"
    assert 0.0 <= result.confidence <= 1.0


def test_engine_analyze_only_invokes_segmenter() -> None:
    calls: list[str] = []
    source = Image.new("RGB", (12, 18), (20, 30, 60))
    engine = SpatialWorkerEngine(
        depth_estimator=lambda image: calls.append("depth") or Image.new("L", image.size, 140),
        person_segmenter=lambda image: calls.append("segment") or Image.new("L", image.size, 180),
        background_inpainter=lambda image, mask: calls.append("inpaint") or image,
        provider="depth-anything-v2+test-segmenter+test-inpaint",
        model_version="test-v1",
    )

    result = engine.analyze(png(source))

    assert calls == ["segment"]
    assert Image.open(BytesIO(result.mask)).size == (12, 18)
    assert result.provider == "test-segmenter"
    assert result.model_version == "test-v1"


def test_engine_generate_reuses_supplied_mask_without_segmenting() -> None:
    calls: list[str] = []
    source = Image.new("RGB", (12, 18), (20, 30, 60))
    supplied_mask = Image.new("L", source.size, 180)
    engine = SpatialWorkerEngine(
        depth_estimator=lambda image: calls.append("depth") or Image.new("L", image.size, 140),
        person_segmenter=lambda image: calls.append("segment") or Image.new("L", image.size, 220),
        background_inpainter=lambda image, mask: calls.append("inpaint") or image,
        provider="depth-anything-v2+test-segmenter+test-inpaint",
        model_version="test-v1",
    )

    result = engine.generate(png(source), mask=png(supplied_mask))

    assert calls == ["depth", "inpaint"]
    assert Image.open(BytesIO(result.mask)).getextrema() == (180, 180)
    assert result.provider == "depth-anything-v2+cached-mask+test-inpaint"


def test_engine_normalizes_adapter_outputs_to_source_dimensions() -> None:
    source = Image.new("RGB", (12, 18), (20, 30, 60))
    engine = SpatialWorkerEngine(
        depth_estimator=lambda _: Image.new("L", (3, 4), 100),
        person_segmenter=lambda _: Image.new("L", (6, 9), 255),
        background_inpainter=lambda image, _: image,
        provider="test",
        model_version="1",
    )

    result = engine.generate(png(source))

    assert Image.open(BytesIO(result.depth)).size == source.size
    assert Image.open(BytesIO(result.mask)).size == source.size
    assert Image.open(BytesIO(result.background)).size == source.size
