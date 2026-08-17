# Fan onboarding image-to-code implementation plan

**Goal:** Implement the approved three-screen onboarding composition while preserving the existing functional flow.

**Architecture:** Keep `Onboarding` as the state and API owner. Add semantic wrappers and reusable choice-card structure inside the component, then replace the legacy compact onboarding rules in `App.css` with screen-scoped reference styles. Source-level contract tests protect the visual structure and accessibility hooks; the existing full suite protects application behavior.

**Tech stack:** React 19, TypeScript, CSS, Node test runner, Vite.

## Task 1: Lock the approved UI contract

- Add `frontend/tests/onboarding-reference.test.mjs`.
- Assert segmented progress, screen copy wrappers, two-column visual cards, selected artist summary, camera affordance, `aria-pressed`, and CTA rail selectors.
- Run the targeted test and confirm it fails before production changes.

## Task 2: Reshape onboarding markup

- Update `frontend/src/App.tsx` without changing effects, API calls, draft persistence, or save/back behavior.
- Add step content wrappers and accessible progress segments.
- Render artist and member choices as visual portrait cards.
- Add the selected artist summary on step 2 and camera affordance on step 3.

## Task 3: Match the approved mobile visual system

- Update `frontend/src/App.css` with onboarding-scoped layout, card, progress, input, CTA, responsive, hover, selected, and focus states.
- Preserve usable scrolling at small heights and avoid horizontal overflow at 320–430px widths.

## Task 4: Verify

- Run the targeted onboarding contract test.
- Run the full frontend test suite, lint, and production build.
- Inspect the rendered onboarding flow at mobile width when an authenticated incomplete-onboarding session is available; otherwise report the visual-authentication limitation explicitly.
