# AI Spatial Card Scene Design

> Historical prototype design. For service integration, use [the production design](2026-09-03-spatial-card-production-design.md). The three-image bundle and model suggestions below are not evidence of a validated production pipeline.

## Goal

Turn one front-facing artist photo into a subtle spatial card scene: a small viewpoint change must reveal depth between the person and background instead of translating or bending the whole photo.

## Product boundary

- This is not a full 360-degree avatar and does not synthesize a large head turn.
- The supported interaction is deliberately limited to about `yaw +/-4deg` and `pitch +/-3deg`.
- The original 2D image remains the canonical fallback whenever generation fails or confidence is low.

## Processing architecture

The main Fanfolio API sends the private source image to a separately deployed AI worker. The worker returns an aligned bundle containing:

1. a monocular depth map,
2. a foreground/person alpha mask,
3. an inpainted background plate with the person removed.

The main API validates all three images, stores them as private derived objects through the existing storage boundary, and exposes only authenticated media endpoints and non-sensitive metadata. A local luminance depth map remains available solely as an explicit development fallback; it must never be labelled as AI output.

The recommended worker combines Depth Anything V2 Small for relative depth, SAM 2 for person segmentation, and LaMa-class inpainting for the hidden background. The worker is isolated because loading these models into the main Render API would materially increase memory use and cold-start time.

## Runtime renderer

The WebGL renderer converts the foreground depth map into indexed 3D geometry and places the inpainted background on a separate rear plane. Both layers are rendered through one perspective camera and depth buffer. Texture coordinates stay attached to mesh vertices; the fragment shader must not shift source-image UVs. The card clips every layer at its rounded boundary, smooths noisy depth, and caps portrait relief to avoid identity distortion.

## Result contract

`Asset.transform.spatialScene` version 2 contains public IDs and rendering limits plus private storage paths. Public API responses remove every key ending in `StoragePath`.

Required public fields: `version`, `sourceAssetId`, `provider`, `status`, `depthAssetId`, `maskAssetId`, `backgroundAssetId`, `runtime`, `maxYawDeg`, `maxPitchDeg`.

## Failure and security behavior

- Provider timeout, malformed JSON, invalid base64, mismatched dimensions, or non-image output fails closed.
- The source, mask, background, and depth objects remain private and artist-scoped.
- Provider tokens never appear in API responses or stored transform metadata.
- The renderer falls back to the original image if any spatial derivative cannot be loaded.

## Acceptance criteria

- The center pose matches the source photo.
- Pointer or device tilt changes foreground and background at visibly different rates.
- The effect does not expose pixels outside the card.
- AI results persist as three private derivatives and survive card save/reopen.
- Local fallback is visibly identified as a development preview.
- Unit tests cover provider transport, image validation, metadata confidentiality, and fallback behavior.
