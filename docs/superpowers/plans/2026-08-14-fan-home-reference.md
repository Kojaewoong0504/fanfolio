# Fan Home Reference Implementation Plan

> **Goal:** Rebuild the fan home to match the selected 430px mobile reference without changing API behavior or navigation contracts.

### Task 1: Lock the approved structure

- Extend the home regression test with the two-line title, hero controls, full-width artist artwork, collectible card overlays, active event row, and centered active Home tab.
- Run the targeted test and confirm it fails before implementation.

### Task 2: Refactor home markup

- Update `HomeContent` in `frontend/src/App.tsx` with semantic classes for the reference composition.
- Reuse the existing event, artist, card, and navigation callbacks.
- Keep old collection sections hidden as before so no unrelated collection behavior is removed.

### Task 3: Match layout and typography

- Update `frontend/src/reference.css` with the 430px shell, reference spacing, lighter typography, full-bleed image panels, card overlays, event row, and responsive safeguards.
- Avoid new dependencies and preserve the existing app token palette.

### Task 4: Verify visually and functionally

- Run the targeted test, full frontend tests, lint, and build.
- Capture the local 430×922 home and compare it with the selected reference.
- Save `design-qa.md`, fix all P0–P2 issues, and stop before deployment so the user can approve the visual checkpoint.
