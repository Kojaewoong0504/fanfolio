# Automatic effect preparation

Approved UX: special effects OFF hides settings; ON prepares the current photo once, first segmentation then depth/background. Ready surface controls appear before depth completes. Depth is opt-in. OFF preserves selections/results; replacement invalidates results. Failures can be retried without repeating successful stages.

Implementation: reuse existing protected analysis and spatial-job APIs. Add a photo-scoped single-flight coordinator and explicit spatial rendering gate. Persist toggle intent; do not alter authentication, models or deployment.

Verification: tests first for duplicate requests, stale photos, OFF/resume, failure/retry and prepared-but-disabled depth. Run studio suite and syntax checks, then verify local studio toggle UI. Real worker completion and visual quality must be reported separately from unit checks.

## Verification results

- Studio tests: 109 passed, including six new single-flight/preparation tests and persistence/masking regression coverage.
- Browser: existing authenticated local artist session restored; photo and cached analysis restored after reload. Depth starts disabled. Enabling depth creates the spatial layer; master OFF removes all 12 options, WebGL overlay and spatial layer; ON restores selected Blossom material and depth intent with no progress/re-analysis.
- Reuploaded the same local `card-yuna-lavender.jpg` as a new asset through the real chooser: analysis and depth preparation finished automatically without clicking an analysis/generation button. Worker logged POST /analyze and POST /generate 200. Depth remained disabled until explicitly selected.
- Scope: local studio workflow. No deployment, additional AI model, face-only detection, or new idle-particle animation implementation in this change. Analysis latency is not a service-level guarantee. Background-only surface masking remains restricted to still-photo mode; spatial/video/lenticular combinations retain the existing explicit limitation.
