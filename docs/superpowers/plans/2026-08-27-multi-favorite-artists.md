# Multi-Favorite Artists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow a fan to register multiple favorite artists and use that preference consistently across onboarding, home, growth, shop, notifications, and social surfaces.

**Architecture:** Keep the existing JSON arrays for the first release. Add a plural home response while retaining the deprecated singular field for compatibility, use one active artist scope at a time for growth/pass, and make onboarding/settings send all selected IDs.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React 19, TypeScript, Vite, pytest, Node test runner.

---

1. Add contract coverage for multiple favorite artists and plural home response.
2. Return ordered `favoriteArtists` from `/home` and retain `favoriteArtist: null` during migration.
3. Change onboarding artist selection to a multi-select and make member selection optional and grouped.
4. Change settings profile editing to multi-select artists and members grouped by artist.
5. Render all favorite artists in the home interest rail and annotate aggregate content with its artist.
6. Connect shop artist addition to the profile preference flow and preserve all artist filters.
7. Keep growth/pass on one active artist scope with an explicit whole-fan scope and stable selection.
8. Add artist source metadata to notification presentation and preserve deep links.
9. Show multiple favorite artists on public fan profiles while retaining an explicit primary display artist.
10. Add recommendation and preference-change regression coverage.
11. Run backend/frontend tests, lint, typecheck, and production build.
12. Inspect the Vercel fan app at onboarding/settings/home/growth/shop/social routes and record remaining gaps.
