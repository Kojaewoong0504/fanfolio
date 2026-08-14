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

## Latest fan-level lower-reference iteration

- Source visual truth: `/Users/gojaewoong/Downloads/스크린샷 2026-08-15 오전 3.18.40.png`
- Implementation: `http://localhost:4173/growth`
- Changes: added milestone received/locked states, made the current badge visible above the rail, and matched the split benefits card dimensions and typography to the supplied crop.
- Automated checks: 59 tests passed, production build passed, `git diff --check` passed.
- Browser comparison: blocked after the Codex app reinstall because the fresh browser session is unauthenticated and `/growth` redirects to the login screen. A visual pass must be rerun after signing in.

final result: blocked
