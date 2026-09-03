# Shared photo analysis implementation plan

**Goal:** Reuse per-photo segmentation for surface effects; request depth/background restoration only for optional 3D cards.

**Approved design:** The user's preceding approval covers common analysis, independent spatial processing, nonblocking editing, cache reuse, and invalidation on photo replacement. No new deployment or dependencies. Face detection and manual brush correction must not be advertised unless implemented.

**Architecture:** Worker `/analyze` computes only a mask. Authenticated API stores source-bound metadata and private mask in existing asset transform/storage. Studio stores metadata under `front.photoAnalysis`, loads protected mask bytes, and binds them to the shared WebGL renderer. Background coverage fails closed until a matching mask is loaded. Spatial generation remains separate and can reuse the analysis mask.

## Tasks

- [ ] Backend/worker: write failing tests for segmentation-only analysis, owner access, source cache, fallback rejection, and reuse during spatial generation; implement and run targeted pytest.
- [ ] Renderer: test missing-mask background suppression and object-fit cover geometry; implement `setSubjectMask` with resource cleanup and private blob loading.
- [ ] Studio: test source invalidation and analysis metadata persistence; implement nonblocking photo-analysis status, separate optional spatial generation, and mask preview.
- [ ] Integrate fan effect metadata and protected mask access where the published card media contract permits it; fail closed without access.
- [ ] Verify JS tests, backend tests, frontend build, real local studio. Record actual boundaries including segmentation quality and unavailable face/brush features.

No commit: existing dirty worktree is preserved and this request is local implementation only.
