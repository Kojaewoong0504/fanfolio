# Event Upload Hero Optimization Design

## Goal

Generate the fan-facing WebP derivative while an administrator uploads an event banner so the first fan request reads an already-optimized object instead of doing image conversion work.

## Current behavior and root cause

Event banner uploads become ready immediately after the original object passes the safety scan. The public event hero endpoint checks for `-event-hero-v1.webp` and creates it only when the first fan asks for the image. This makes the first fan request pay for object download, Pillow decoding, resize, WebP encoding, and object upload.

The API upload path and the S3/Supabase completion path duplicate the ready-state transition, so neither currently has a shared media-finalization step. The presign schema also permits non-image content types for `event_banner`, even though event creation and image optimization require PNG, JPEG, or WebP.

## Chosen design

The backend will expose one synchronous, storage-agnostic helper that ensures the versioned event hero derivative exists. It will:

1. Address the derivative by the existing deterministic suffix `-event-hero-v1.webp`.
2. Reuse an existing derivative without rewriting it.
3. Accept source bytes when the upload path already has them, avoiding an extra object-store read.
4. Otherwise read the original object, resize it to at most 1200×600, remove metadata through re-encoding, flatten transparency, encode WebP at the existing quality policy, and persist the derivative.

Both upload completion paths will run this helper in a thread pool after the safety scan and before setting `upload_completed_at`. Upload finalization forces a rewrite from the bytes that were just scanned so a retry cannot retain a derivative from earlier source bytes. The original object remains available for administrative reuse and future derivative versions. If conversion or derivative persistence fails, the asset stays incomplete so a retry can finish it; it must not be exposed as ready.

Direct S3/Supabase uploads use a deterministic `-upload.bin` staging object. Completion reads and scans that object, promotes the accepted bytes to the immutable canonical `.bin` object, writes the derivative, commits the ready state, and then removes staging. Reusing a still-valid presigned URL can therefore change only an unreferenced staging object after completion, not the canonical source or derivative.

The public event hero endpoint will call the same helper. This retains lazy generation for assets uploaded before this release or for a missing derivative, while future uploads avoid first-view conversion. Object-store checks, reads, writes, and cleanup run outside the async event loop. The endpoint reads the prepared derivative through that boundary and returns a cacheable WebP response.

## Upload contracts

- `event_banner`, `organization_logo`, and `reward_image` accept only PNG, JPEG, or WebP at presign time.
- API uploads save the original, regenerate the derivative from the accepted bytes, then mark the asset complete. A completed upload URL cannot be used again.
- Direct S3/Supabase uploads read and scan staging, promote the accepted bytes to the canonical original, regenerate the derivative, then mark the asset complete.
- Repeated direct completion requests remain idempotent.
- Event hero derivatives are stored with `Content-Type: image/webp` metadata.
- No database migration is required because the derivative path is deterministic and versioned.

## Error handling

- Invalid image-purpose MIME types fail validation before an upload URL is created.
- Invalid or undersized event image bytes continue to fail the existing upload safety scan.
- A derivative conversion or storage error propagates and prevents `upload_completed_at` from being set.
- The fan endpoint returns `404 EVENT_ASSET_NOT_READY` if neither a usable original nor derivative can be served. Missing objects and invalid legacy image bytes are normalized to this contract, while provider outages still surface as server failures.

## Verification

- A local event-banner upload creates a valid 1200×600 WebP derivative before any event hero request.
- A direct object-store completion creates the same derivative before returning `ready`.
- A first public hero request succeeds even if the original is removed after upload, proving that no lazy conversion was needed.
- Existing lazy fallback still recreates a deliberately removed derivative from the original.
- Completed API uploads and completed direct presigned URLs cannot mutate the canonical source or leave a stale derivative.
- Derivative failures leave `upload_completed_at` unset for both API and direct completion paths.
- Non-image event-banner presign requests fail with the validation contract.
- Targeted tests, the full backend suite, Ruff formatting/linting, CI, deployment, and a production upload/response check must pass.
