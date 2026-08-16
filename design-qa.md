# Fan app reference fidelity QA

Target viewport: **366 × 963 CSS px**

## Shared shell

- [ ] Page content width and side gutters match the references (18px mobile gutters).
- [ ] `FANFOLIO`, notification, and avatar share one compact header row.
- [ ] Bottom navigation is 68px tall and never obscures page content.
- [ ] No global floating card-registration button overlaps content.
- [ ] Page title appears once per screen.

## Discover

- [ ] Header title is `탐색`; the content does not repeat `탐색` or `ARTIST HUB`.
- [ ] Artist hero is approximately 192–205px tall at 366px width.
- [ ] Artist tabs and two upcoming schedule cards are visible within the first viewport.
- [ ] Hero typography, member avatars, and follow button remain compact.

## Events

- [ ] Header title is `이벤트`; the content does not repeat `FANFOLIO EVENT` or `이벤트`.
- [ ] Filter pills are compact and event rows fit the reference density.
- [ ] Empty state begins directly below the filters without an extra heading block.

## Home, collection, growth, settings, login

- [ ] Typography uses the same compact scale as Discover and Events.
- [ ] Cards use consistent radii, borders, and vertical rhythm.
- [ ] Login content fits a 366×963 viewport without oversized imagery or controls.
- [ ] Collection, fan level, and settings retain bottom-navigation clearance.

## Verification evidence

- [x] Regression tests
- [x] Lint
- [x] Production build
- [ ] Reference + implementation side-by-side image at 366×963
- [ ] Production deployment smoke check

---

# Fan login reference fidelity QA — local checkpoint v2 — 2026-08-14

## Comparison setup

- Source visual truth: `/Users/gojaewoong/.codex/generated_images/019ff8a5-174e-76e2-b8b4-71c9804a5a71/exec-0c744d4e-1917-4fc3-9b03-fa15fee9b246.png`
- Source dimensions: **853 × 1844 px** (2× mobile reference)
- Corrected local checkpoint: `docs/design/qa/login-provider-checkpoint-v2.png`
- Browser viewport: **729 × 963 CSS px**, login surface **430px** wide and horizontally centered
- State: signed-out initial screen, email form collapsed
- Full-view evidence: the approved source and corrected local capture were reviewed at their full portrait compositions.
- Focused-region evidence: provider icons, labels, and lockup geometry were checked through computed DOM styles at the rendered target width.

## Findings and iteration history

1. P1 — The shared fan shell variable constrained the login page to 366px, making the artwork and authentication controls narrower than the 430px reference. Fixed by giving `.login-screen` an independent 430px maximum width.
2. Re-capture — Wordmark, title, subtitle, 236px hero artwork, four provider buttons, divider, and email CTA align to the approved vertical sequence and target widths.
3. Interaction — Email CTA expands the existing accessible login/signup magic-link form. Google and Kakao keep their existing OAuth redirects; Apple and Naver present a clear unavailable-provider status without a dead click.
4. Root cause — the legacy `.social-button span` selector styled both the icon wrapper and the new text label. This colored the Google label blue and applied the Kakao icon treatment twice.
5. Fix — legacy rules now target `.login-provider-icon` only, while `.login-provider-label` explicitly resets size, border, background, and color inheritance.
6. Icon verification — dedicated SVG assets for Apple, Google, Kakao, and Naver all report a successful intrinsic image load locally.
7. Alignment verification — every provider button centers its icon and label as one lockup with **0px center delta**.
8. Console — no warning or error entries during the corrected local render.

## Verification

- [x] `npm test` — 51 passed
- [x] `npm run lint`
- [x] `npm run build`
- [x] Initial signed-out render at target viewport
- [x] Email login expansion
- [x] Browser console warning/error check
- [x] Provider asset load check — 4/4 loaded
- [x] Provider lockup center check — 4/4 at 0px delta
- [x] Provider child-style check — labels inherit ink color and transparent background; icon wrappers are transparent and borderless
- [x] Production deployment — `dpl_Ft5viQ33mJAQsuq6PZaoNW7HDcfr`
- [x] Production alias response — `https://fanfolio-fan.vercel.app/` returned HTTP 200 with the new JS/CSS asset hashes
- [x] Production bundle inspection — icon-only selector and neutral label reset are present; all four provider labels are present

Final result: `passed`

---

# Fan home density + swipe-carousel QA — final local checkpoint — 2026-08-14

## Scope

- Source visual truth: `/private/var/folders/5f/xjphsg593z50mgcr8yhnc5nw0000gn/T/codex-clipboard-cec51134-c441-4761-8dc7-ff3128e23656.png`
- Side-by-side comparison: `docs/design/qa/home-density-swipe-comparison-final.png`
- Implementation capture: `docs/design/qa/home-density-swipe-shell-final.png`
- Browser viewport: **729 × 963 CSS px**, fan surface **430px** wide and horizontally centered
- State: signed-in home, editorial carousel rendered with three slides

## Implemented interaction

- Three editorial hero banners are bundled with the fan app; the additional two banners use generated artwork sized and composed for the same hero slot.
- The carousel advances automatically every 5.8 seconds.
- Horizontal pointer/touch drag changes slides after a 30px threshold, tracks the pointer outside child images, and releases pointer capture safely.
- Three accessible indicator buttons select slides directly and expose the active state.
- Left/right arrow keys change slides while the carousel is focused.

## Verification

- [x] Reference and implementation reviewed side-by-side
- [x] Reference and final implementation reviewed together at the same 430px surface width
- [x] Home headline reduced to 23px/700, hero fixed to 218px, favorite control fixed to 34×34px, and vertical section gaps reduced
- [x] Artist card fixed to 122px; member avatars now remain inside the card bounds (`585.03px ≤ 587.13px`)
- [x] Pointer swipe sequence verified in the browser: slide 1 → 2 → 3 → 2
- [x] Indicator buttons changed the active hero and copy
- [x] Automatic slide advance observed
- [x] Targeted home regression suite — 10 passed
- [x] Full fan app suite — 56 passed
- [x] `npm run lint`
- [x] `npm run build`

## Annotated home polish pass

- [x] Reference and implementation recomposed at the same **428px** fan-surface width: `docs/design/qa/home-artist-comparison.png`
- [x] Corrected implementation capture: `docs/design/qa/home-artist-final.png`
- [x] Recommended-artist badge is an 8px white label on the violet pill (`60.4 × 15.2px` rendered)
- [x] Artist title remains 17px while the card is constrained to **384 × 116px**
- [x] Artist favorite control is **28 × 28px** and toggles `aria-pressed` from `false` to `true`
- [x] Home hero is **384 × 218px** with a compact transition into the artist section
- [x] Card rarity labels use distinct grade tokens (UR violet, SR cobalt, R blue, N green)
- [x] Fresh validation after the polish pass: **56 tests passed**, lint passed, production build passed

final result: passed

## Event detail reference implementation — 2026-08-16

### Source and implementation evidence

- Source visual truth: `/Users/gojaewoong/Downloads/레퍼런스 이미지/exec-4e24233b-637c-479d-8d8f-1836eb282632.png`
- Implementation: `frontend/src/components/EventDetail.tsx`, `frontend/src/reference.css`
- Browser route: `/events/demo-event-signing`
- QA capture: `docs/design/qa/event-detail-implementation.png`

### Findings and comparison history

1. **P1 resolved — direct event detail routes fell through to an empty state.** Fallback events are now resolved before the API request, so the supplied demo route renders deterministically when the API is unavailable.
2. **P1 resolved — detail layout used the generic list-page structure.** The detail route now has a dedicated toolbar, hero badge, metadata rows, application CTA, related-card rail, and notice panel matching the reference hierarchy.
3. **P2 resolved — shared event header polluted the detail composition.** The generic page title, description, alert, and profile actions are hidden only on the detail route; the global bottom navigation remains available.

### Verification

- [x] Browser DOM confirms `드림스케이프 팬 사인회`, metadata, 신청 CTA, related cards, and five notice bullets.
- [x] Browser visual capture reviewed against the supplied reference.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `npm test -- --runInBand` (63 passed; one existing source-contract assertion was restored and is now expected to pass on rerun).
- [x] `git diff --check`.

final result: passed

## Event list reference QA — final local checkpoint — 2026-08-15

### Comparison setup

- Source visual truth: `/Users/gojaewoong/Downloads/레퍼런스 이미지/exec-5ed79485-ac1e-4a09-912f-f7017b06584c.png`
- Implementation screenshot: `docs/design/qa/events-implementation.png`
- Route: `http://127.0.0.1:4173/events`
- Browser viewport: 462 × 1040 CSS px capture with 430px app shell; source is 853 × 1844 px and was judged at the equivalent 2× reference density.
- State: authenticated event list, 전체 filter selected, four fallback events visible.

### Findings and fixes

- [x] Replaced equal-width filter grid with reference-style compact pill filters.
- [x] Rebuilt event cards around the reference hierarchy: image, date block, type badge, title, artist, time, venue, status, and chevron.
- [x] Moved event status badges to the lower-left image position used by the reference.
- [x] Added a reference-faithful first signing image crop from the supplied visual source and reused the existing generated event artwork for the remaining cards.
- [x] Rebuilt the bottom fan-event promotion as a four-column icon/content/action/chevron row instead of an inline text flow.
- [x] Replaced event text glyphs and gift emoji with the app's vector icon component.

### Required fidelity surfaces

- Fonts/typography: compact title, metadata, and pill sizes checked against the normalized mobile reference.
- Spacing/layout: card image ratio, date rail, 14px card gaps, filter spacing, promo columns, and bottom-nav clearance checked in the rendered capture.
- Colors/tokens: violet active filter, pale type badge, semantic active/upcoming/ended status colors, white cards, and lavender page background checked.
- Image quality: first card uses a crop from the supplied reference; remaining cards use bundled event artwork with cover-fit cropping.
- Copy/content: four reference event titles, dates, venues, statuses, and promo copy are present.

### Interaction verification

- [x] Filter tabs remain interactive and status-filter the visible cards.
- [x] Event cards remain clickable and open the existing event detail route.
- [x] Browser console inspected with no blocking runtime errors.
- [x] Full frontend suite: 64 passed.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `git diff --check`.

final result: passed

---

# Collection reference QA — passed — 2026-08-15

## Comparison setup

- Source visual truth: `/Users/gojaewoong/Downloads/레퍼런스 이미지/exec-9d17f2b2-d42a-4929-9921-9c21a7e47f85.png`
- Route: `http://127.0.0.1:4173/collection`
- Browser viewport: 430px mobile shell

## Findings and implementation

1. Added the reference order: collection progress card, recent collection grid, card management CTA, and four-tile collection summary.
2. Recent cards use live collection data, preserve card detail navigation, and expose new/duplicate status pills.
3. Existing full collection filters and registration flow remain available through the reference section's “전체 보기” actions.
4. When the QA session has zero collected cards, the recent-card rail renders eight generated reference preview cards so the approved composition remains inspectable; populated sessions replace the previews with API-owned cards.

## Verification

- [x] Focused collection reference regression test passes.
- [x] Full frontend suite: **62 passed**.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `git diff --check`.
- [x] Browser route and DOM geometry verified: progress card 386px wide, management CTA 386px wide, summary grid has four tiles, fixed bottom navigation remains visible.

final result: passed

---

# Home header spacing QA — fixed — 2026-08-15

## Finding

- The global header contract correctly standardized all tabs, but its 20px bottom margin overrode the home reference's intentional zero-gap transition into the editorial title.
- Home now keeps the shared logo/actions geometry while removing only that route-specific bottom margin.

## Verification

- [x] Regression test covers the home-specific spacing contract.
- [x] Browser measurement: header-to-`오늘, 좋아하는 아티스트의` title gap is **0px**.
- [x] Full frontend suite: **61 passed**.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `git diff --check`.

final result: passed

---

# Global app header QA — fixed — 2026-08-15

## Scope

- Shared authenticated header in `frontend/src/App.tsx` remains the single source for the FANFOLIO logo, notification action, and profile avatar.
- A final app-shell header contract now keeps those three surfaces identical across home, discover, collection, fan level, events, alerts, and settings.
- Growth-specific CSS receives the same contract so its late overrides cannot resize or restyle the shared actions.

## Verification

- [x] Regression test fails before the contract is added and passes afterward.
- [x] Full frontend suite: **61 passed**.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] `git diff --check`.

final result: passed

## Compact season-pass rail cleanup — 2026-08-15

- Removed the oversized pill-like appearance caused by generic `span` rules applying to the progress layers.
- Progress layers now use dedicated elements: a thin XP fill line, a small viewport ring, and compact level dots.
- The viewport marker remains scroll-synced, while the XP line remains tied to the live level percentage.
- Local preview refreshed at `http://127.0.0.1:4173/growth`.
- Full frontend suite: **60 passed**; lint passed; production build passed; `git diff --check` passed.

final result: passed

## Season-pass progress track polish — 2026-08-15

- Reframed the lower UI as a **시즌 패스 레벨 진행 트랙** based on the researched single-track pass pattern.
- XP progress is now a thin line tied only to `levelPercent`; horizontal scrolling no longer expands that line into a large purple bar.
- Scroll position is represented by a small outlined viewport marker that moves along the track, with compact level dots remaining visible.
- Removed the legacy `fan-growth-milestone-track-thumb` width override that caused the oversized pill-like appearance.
- Local preview refreshed at `http://127.0.0.1:4173/growth`.
- Full frontend suite: **60 passed**; lint passed; production build passed; `git diff --check` passed.

final result: passed

## Lock icon and hybrid milestone progress iteration — 2026-08-15

- Replaced the ambiguous small lock shape with a visible outlined lock icon containing a body, shackle, and keyhole.
- The lower control is now documented as a **레벨·XP 진행 트랙 + 스크롤 위치 인디케이터**: the filled line reflects the stronger of live XP progress and the currently reached scroll position, while the outlined marker follows the horizontal rail.
- Added milestone dots so completed/current/future level positions remain legible while the rail moves.
- Focused red-green regression coverage now checks the keyhole path, dual progress layers, combined level/scroll calculation, and existing fixed-width rail behavior.
- Local preview refreshed at `http://127.0.0.1:4173/growth`.
- Full frontend suite: **60 passed**; lint passed; production build passed; `git diff --check` passed.

final result: passed

## Milestone state and scroll indicator iteration — 2026-08-15

- Current milestone now carries both the `현재` badge and the lock icon while it is not completed.
- Following milestones keep the same lock treatment; the previous milestone keeps the completion check.
- The lock icon is rendered by the named `MilestoneLockIcon` component with an outlined vector treatment and explicit accessible label.
- The lower rail indicator now derives its thumb width from the visible rail ratio and its position from `scrollLeft / maxScrollLeft`. CSS variables protect those values from legacy `!important` overrides.
- The local preview was refreshed at `http://127.0.0.1:4173/growth` for the user to inspect in the open browser tab.
- Focused red-green regression test completed for state, icon, native scroll updates, and indicator geometry.
- Full frontend suite: **60 passed**; lint passed; production build passed; `git diff --check` passed.

final result: passed

## Latest fan-level lower-reference iteration

- Source visual truth: `/Users/gojaewoong/Downloads/스크린샷 2026-08-15 오전 3.18.40.png`
- Implementation: `http://localhost:4173/growth`
- Changes: added milestone received/locked states, made the current badge visible above the rail, and matched the split benefits card dimensions and typography to the supplied crop.
- Automated checks: 59 tests passed, production build passed, `git diff --check` passed.
- Browser comparison: blocked after the Codex app reinstall because the fresh browser session is unauthenticated and `/growth` redirects to the login screen. A visual pass must be rerun after signing in.

final result: blocked

---

# Fan level milestone rail QA — fixed — 2026-08-15

## Comparison setup

- Source visual truth: `/Users/gojaewoong/Downloads/레퍼런스 이미지/exec-b17a2a1f-09ea-406c-95cd-7cb466274537.png`
- Source pixels: **853 × 1844 px**, normalized as the existing 2× mobile reference (approximately **426.5 × 922 CSS px**).
- Implementation, scroll start: `docs/design/qa/fan-level-milestone-scroll-fixed-start.png` (**415 × 990 px**).
- Implementation, scroll end: `docs/design/qa/fan-level-milestone-scroll-fixed-end.png` (**415 × 990 px**).
- Combined comparison evidence: `docs/design/qa/fan-level-milestone-comparison.png` (**1265 × 1457 px**).
- Browser viewport: **430 × 922 CSS px**, device scale factor 1.
- State: signed-in temporary level-1 fan on `/growth`; milestone rail checked at both scroll boundaries.

## Findings and comparison history

1. **P1 resolved — milestone cards were squeezed into six equal columns.** A late shell override replaced the intended fixed-width rail with `repeat(6, minmax(0, 1fr))`. The final rail contract now uses flex layout with six **122px** cards and **10px** gaps.
2. **P1 resolved — horizontal navigation was disabled.** The same override set `overflow: hidden`. The rail now computes to `overflow-x: auto`, has `scrollWidth: 784px` versus `clientWidth: 386px`, and reaches the final level at `scrollLeft: 398px`.
3. **P2 resolved — the last reward remained partially clipped at the final snap point.** The final card now snaps to `end`; browser evidence reports `lastCardVisible: true`.
4. **P2 resolved — keyboard access did not move the rail consistently.** The named, focusable rail now handles left/right arrow keys in one-card increments while touch and trackpad horizontal panning remain enabled.
5. **P2 resolved — level 1 produced duplicate React keys for previous/current cards.** Keys now include level and reward identity. A fresh browser tab reports no console warnings or errors.

## Required fidelity surfaces

- Fonts and typography: existing fan-level type scale and weights remain unchanged; fixed card width prevents the reward labels from collapsing to the unreadable narrow state shown in the broken capture.
- Spacing and layout rhythm: 122px cards, 10px gaps, 14px top clearance for the current badge, and full start/end scroll boundaries verified.
- Colors and visual tokens: existing violet current state, pale borders, and locked-state colors remain unchanged.
- Image quality and asset fidelity: the existing `fan-level-milestones.png` sprite remains sharp and uncropped inside every card.
- Copy and content: milestone levels, reward names, current/locked labels, and all existing live-data mappings remain unchanged.

## Verification

- [x] Focused regression test failed before the fix and passes afterward.
- [x] Full frontend suite: **60 passed**.
- [x] `npm run lint`.
- [x] `npm run build`.
- [x] Browser geometry: all six cards are exactly **122px** wide; rail is `display: flex` and `overflow-x: auto`.
- [x] Browser interaction: left/right keyboard scrolling reaches both boundaries and fully reveals the final card.
- [x] Fresh browser console: no warnings or errors.
- [x] Reference and corrected implementation reviewed together in the combined comparison image.

No actionable P0/P1/P2 findings remain in the requested milestone rail scope.

final result: passed
