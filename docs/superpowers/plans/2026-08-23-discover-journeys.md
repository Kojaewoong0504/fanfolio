# Discover Journeys Implementation Plan

**Goal:** Connect Discover content to dedicated artist, card-pack, event, and fan-community destinations while preserving the current design system.

**Architecture:** Keep route parsing in `App.tsx`, split the existing artist-heavy Discover body into a dedicated artist detail component, and make the Discover root a category-driven hub. Reuse `CardCollectionRepository`, `FanSocialHub`, `PublicCollection`, trade pages, and event routes.

**Tech Stack:** React, TypeScript, existing CSS and API client, Node source-contract tests.

---

### Task 1: Lock navigation contracts

- Extend `frontend/tests/discover-hub-interactions.test.mjs` with route and callback expectations.
- Run the test and confirm it fails before production changes.

### Task 2: Add Discover root and artist detail

- Refactor the current artist content into an artist detail surface.
- Add category controls and functional featured entries to the root Discover hub.
- Add the dedicated artist route and preview route.

### Task 3: Connect card-pack detail

- Add card-pack route parsing.
- Let `CardCollectionRepository` accept an initial pack id and select it after API loading.
- Connect the Discover card-pack entry to that route.

### Task 4: Verify

- Run targeted tests and the frontend build.
- Inspect root and detail routes in the in-app browser and fix visible layout issues.
