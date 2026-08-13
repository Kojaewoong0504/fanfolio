# Browser Annotation Corrections Design

## Scope

Correct every browser annotation supplied on 2026-08-13 across the Artist Studio, Operations Admin, and Fan app. Preserve the existing Fanfolio violet/navy design language and API contracts. The work is a UX correction pass, not a new visual direction.

## Artist Studio

- Make the collapsed sidebar use the same visual grammar as Operations: stable rail width, centered icons, no clipped labels, clear active state, and a compact account affordance.
- Remove the hard-coded “추천 비주얼” surface and the always-visible media/source library. The photo tool becomes upload-first and may show only a compact recent-upload strip when a real upload is available.
- Keep layer property controls as an accessibility fallback, but make the canvas primary: selected layers expose resize and rotation handles and support pointer/touch interaction.
- Maintain functional layouts on desktop, tablet, and phone. On narrow screens, tools become a horizontal rail and the inspector becomes a bottom sheet without covering the full canvas.

## Operations Admin

- Make each review table row open the review detail by pointer click and Enter/Space. The existing overflow/detail button remains available without triggering duplicate opens.
- Retain the existing review data and actions while reducing unused space. At laptop width, use a dense master-detail layout; on stacked layouts, place preview and key metadata side by side where space allows.
- Selected-row, hover, focus, and keyboard states must be visible.

## Fan App

- Give every main tab the same top inset and the same bottom navigation dimensions and styling.
- Use five persistent tabs: 컬렉션, 탐색, 보관함, 팬 레벨, 마이. Move `FanGrowth` out of settings into the dedicated 팬 레벨 tab.
- Keep the account/settings page vertically aligned: fixed-size icons, centered copy, profile content centered, and logout after all account content at the bottom.
- Allow front/back switching even when the remote detail request is unavailable by deriving a safe card-back view from catalog/card data. Never leave an apparently interactive tab disabled without explanation.
- Present the collectible as a physical 2:3 card with a visible edge/frame, clipped artwork, consistent front/back surfaces, and no square image treatment.

## Verification

- Add regression tests before implementation for each corrected behavior.
- Run all three application test suites plus fan typecheck/build.
- Verify Artist Studio at desktop, tablet, and phone widths; Admin at laptop and mobile widths; Fan at 390px and desktop-hosted mobile widths.
- Redeploy all three Vercel projects and confirm production responses.

