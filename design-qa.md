# Compact Inventory Source Chips Design QA

- source visual truth: `/Users/gojaewoong/Downloads/스크린샷 2026-08-19 오후 12.33.34.png`
- implementation screenshot: `/Users/gojaewoong/Desktop/ko/fanfolio/fan-collection-compact-implementation.png`
- focused comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/fan-collection-compact-comparison.png`
- route/state: `http://localhost:5173/?preview=reward-inventory`, Dreamscape source selected, `전체` lifecycle filter
- viewport: browser `1100 x 963` CSS px; app shell `430px` wide
- source pixels: `379 x 208`
- implementation pixels: `1100 x 963`; focused app crop normalized from `430 x 236` to `379 x 208`
- density normalization: focused source and implementation regions compared at `379 x 208`, device scale factor 1

**Findings**

- No actionable P0, P1, or P2 differences remain in the requested source-selector scope.
- Fonts and typography: source names and counts are now one line, with the existing Fanfolio family and compact optical weight. No labels wrap or clip.
- Spacing and layout rhythm: source controls are 46px high with 28px artist logos, matching the compact density and leaving the collection heading closer to the selector.
- Colors and visual tokens: selected state uses the existing purple border and pale lavender fill; inactive controls use the existing white surface and neutral border.
- Image quality and asset fidelity: artist sources retain the dedicated logo slot and fallback behavior. Per the latest requirement, the global source intentionally has no logo or replacement icon.
- Copy and content: the redundant `아이템 N` second line is removed. Source name and count remain visible and accessible.

**Accepted Product/Data Differences**

- The reference shows three sources with counts 4, 2, and 2. The current preview contains two real source groups with counts 3 and 1; the component continues to derive groups from claimed reward data.
- The Dreamscape preview has no `artistLogoUrl`, so it displays the established first-character fallback until an artist logo is provided.

**Focused Region Evidence**

- `fan-collection-compact-comparison.png` places the selected 379 x 208 reference and normalized implementation region in one image. Chip height, one-line labels, count badges, selected state, heading spacing, and lifecycle tabs are directly legible.

**Interaction Verification**

- Selecting `전체 레벨 1` changes the collection to the single global random-card ticket.
- The global source tab contains only its text label and count; no logo or icon is present.
- Source switching still resets the lifecycle filter and message through the existing callback.
- Browser console warnings/errors checked after source switching: none.

**Comparison History**

- Initial compact implementation comparison found no P0/P1/P2 mismatches in the user-selected scope. The stronger active outline is an existing Fanfolio selected-state token and remains acceptable.

**Follow-up Polish**

- P3: replace the Dreamscape letter fallback with its real artist logo when `artistLogoUrl` becomes available.

final result: passed

---

# Card Collection Detail Data and Back Motion QA

- source visual truth: `/Users/gojaewoong/.codex/generated_images/01a017bc-ad15-7ad0-b759-c015714ca742/exec-e2506366-23a0-4420-9e47-d15ec53c7dc5.png`
- implementation screenshot: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-detail-data.png`
- full-view comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-detail-data-comparison.png`
- route/state: `http://127.0.0.1:5174/?preview=card-collection`, `N-03 민재`, back face, expanded card data
- viewport: browser `1100 x 963` CSS px; app shell `428px` wide; device scale factor 1
- source pixels: `1774 x 887`; implementation full-page pixels: `1085 x 1216`
- density normalization: artifacts are combined without resampling; the source is a three-state storyboard while the implementation is a scrollable single-screen state, so interaction hierarchy and component treatment were compared rather than outer height

**Findings**

- No actionable P0, P1, or P2 differences remain after applying the latest interaction and data corrections.
- Fonts and typography: metadata labels, values and the artist message use the existing Fanfolio scale and remain readable without clipping.
- Spacing and layout rhythm: the card remains the primary object; the artist message is placed immediately below the swipe hint, before the compact definition list and conditional benefit/media sections.
- Colors and visual tokens: the existing lavender background, purple action token, neutral metadata rows and white content surfaces remain consistent with the collection flow.
- Image quality and asset fidelity: the shared first-party card assets and card-back renderer remain unchanged; no placeholder or CSS-drawn artwork was introduced.
- Copy and content: the detail now surfaces collection, pack, artist, member, acquired date, card type, acquisition source, ownership, artist message, future benefit and conditional handwriting/audio/video data when supplied.

**Interaction Verification**

- Horizontal swipe still switches between the front and back face.
- Back-face pointer and device motion reuse the same `--tilt-x` and `--tilt-y` transform as the front, while light coordinates update only on the front. The back therefore tilts without a moving light effect.
- Real owned cards request `/me/cards/{userCardId}` and conditionally render the detail payload; preview cards use realistic mock values for the same slots.
- The N-03 detail contract exposes the artist message before the information section and includes all available preview metadata.

**Comparison History**

- Earlier detail state only showed collection and pack, and back-face motion was static.
- First correction added remote detail data and motion to both faces.
- Latest user correction removed back-face light tracking while retaining back tilt. Regression tests lock the shared transform, front-only light updates and message-before-information order.

**Focused Region Evidence**

- A separate crop was not required: the full-page implementation capture keeps the card, metadata labels and artist-message text legible, while the combined image preserves the source's front/back behavior board.

**Follow-up Polish**

- P3: preview media controls remain absent because the current mock card has no audio/video asset; those sections are verified structurally and appear only when the API supplies URLs.

final result: passed

---

# Card Collection Detail Design QA

- source visual truth: `/Users/gojaewoong/.codex/generated_images/01a017bc-ad15-7ad0-b759-c015714ca742/exec-e2506366-23a0-4420-9e47-d15ec53c7dc5.png`
- implementation screenshot: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-detail-implementation.png`
- full-view comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-detail-comparison.png`
- route/state: `http://127.0.0.1:5174/?preview=card-collection`, `N-03 민재` selected, front-facing information state
- viewport: browser `1100 x 963` CSS px; app shell `428 x 963` CSS px; device scale factor 1
- source pixels: three-state board `1775 x 887`; selected third-state crop `590 x 887`
- implementation pixels: browser `1100 x 963`; app crop `428 x 963`
- density normalization: source and implementation were fit to the same 760px comparison height; the source is a storyboard panel rather than a production phone viewport, so relative hierarchy and state were compared instead of exact outer aspect ratio

**Findings**

- No actionable P0, P1, or P2 differences remain after applying the user's corrections to the source board.
- Fonts and typography: the title, member/pack identity, rarity/code and inventory count retain the existing Fanfolio hierarchy without clipping or unintended wrapping.
- Spacing and layout rhythm: the independent detail screen keeps the card centered and straight, places the swipe hint immediately below it, and groups metadata in one compact lower card.
- Colors and visual tokens: the existing Fanfolio purple, pale-lavender background, white surfaces, borders and shadows are reused consistently.
- Image quality and asset fidelity: the existing first-party Minjae collection portrait remains sharp at the detail size; the shared v3 pearl/prism surface supplies the natural interactive foil response without a separate effect button.
- Copy and content: `현재 적용 중` and `효과 보기` are intentionally absent. The detail instead shows ownership, collection, pack, rarity and card number.

**Accepted Product Differences**

- The supplied board still contains `현재 적용 중` and `효과 보기`; both are superseded by the user's explicit follow-up corrections.
- The supplied board uses a more decorative holographic card frame. The implementation retains the existing collection asset and shared card-effect renderer rather than introducing a second baked-in card asset.
- The preview's N-03 card owns 12 copies to exercise the large-count contract; the design board shows 2 copies.

**Focused Region Evidence**

- A separate focused crop was not needed because the combined comparison keeps the top bar, full card, swipe hint and all metadata text legible in one image.

**Interaction Verification**

- Selecting `N-03 민재 카드 상세 보기` replaces the repository with an independent `카드 상세` screen.
- A horizontal swipe switches the accessible card image from `민재 Nebula Ver. 카드 앞면` to `Nebula Ver. 카드 뒷면`.
- The back exposes serial `N-03`, owned count `12장 보유`, Fanfolio seal and official collection message.
- The back button returns to the preserved repository state, and the heart control toggles independently from inventory/equipment state.
- Browser console warnings/errors checked after open and swipe: none.

**Comparison History**

- Initial implemented-state comparison found no P0/P1/P2 mismatch after accounting for the user's explicit removal of equipment and effect controls. No visual correction loop was required.

**Follow-up Polish**

- P3: when dedicated framed card artwork is supplied by the catalog, it can replace the current portrait while preserving the shared interactive surface.

final result: passed

---

# Card Collection Repository Design QA

- source visual truth: `/Users/gojaewoong/.codex/generated_images/01a017bc-ad15-7ad0-b759-c015714ca742/exec-2715d44a-edc1-4cb4-a8e2-8b5bd00b8e4f.png`
- implementation screenshot: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-implementation.png`
- full-view comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/card-collection-comparison.png`
- route/state: `http://127.0.0.1:5174/?preview=card-collection`, `정규 1집 · DREAMSCAPE`, `Nebula Ver.`, 번호순, 전체 상태
- viewport: `430 x 932` CSS px, device scale factor 1
- source pixels: `852 x 1851`; normalized to `430 x 932`
- implementation pixels: `430 x 932`
- density normalization: both full views compared at `430 x 932`

**Findings**

- No actionable P0, P1, or P2 differences remain.
- The hierarchy, section proportions, compact pack rail, 4-column catalog, rarity and quantity badges, missing-card states, and persistent navigation follow the selected reference.
- Existing Fanfolio typography, purple selection tokens, artist imagery, card portraits, and navigation icons are retained.
- A project-local transparent foil-pack asset replaces the earlier card-back approximation and is color-adjusted for each version.

**Accepted Product/Data Differences**

- The artist identity uses the current Dreamscape image until a dedicated artist logo URL is supplied.
- The card portraits reuse the existing Fanfolio mock collection assets; the exact poses in the generated design reference are not separate source assets.
- The parent label is mock admin data and is not hardcoded as a season: it can switch to `데뷔 3주년 · STARLIGHT`.

**Interaction Verification**

- `전체 보기` on the collection landing opens the dedicated card collection preview and the recent section has no sort/filter control.
- Pack selection updates the heading, progress and card slots (`Starlight Ver. 8 / 12`).
- `전체 팩` displays all 40 slots and aggregate progress `28 / 40`.
- The admin-named collection group selector switches to the anniversary group and resets to its first pack.
- Number, rarity and quantity sorting plus owned, missing and duplicate filters are interactive.
- Quantity badges use a flexible capsule: `12` renders without overflow, while a true count of `128` is displayed as `99+` and retained as `128장 보유` for assistive technology.
- Browser console warnings/errors checked after pack, filter and group switching: none.

**Comparison History**

- Initial comparison: P2 pack thumbnails looked like mystery-card backs rather than sealed packs.
- Fix: generated and integrated `card-pack-dreamscape-generated.png`, then repeated the same-state full-view comparison.
- Large-count regression fix: replaced the fixed 20px circle with a content-sized capsule and capped visual text at `99+`; focused evidence is saved as `card-collection-count-badge-implementation.png`.
- Post-fix evidence: `card-collection-comparison.png`; no P0/P1/P2 findings remain.

**Follow-up Polish**

- P3: replace the current artist image with the official circular logo when the catalog supplies it.

final result: passed
