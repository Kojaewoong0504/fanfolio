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

# 관리자 카드 운영 프리뷰 주석 재검증 QA (2026-08-19)

**반영 사항**

- 카드 관리 목록과 카드 상세 패널의 직접 자식 기준선을 `align-self: start`와 `margin-top: 0`으로 고정했다.
- 발급 배치명은 한 줄 말줄임으로 바꾸고 배치명 셀의 최소 폭을 확보해 문자 겹침과 어색한 줄바꿈을 막았다.
- 발급·인증번호 화면의 중복된 `추가 발급 배치 만들기`는 상단 CTA만 남겼다.
- `CSV 내보내기`는 UTF-8 BOM이 포함된 CSV Blob을 생성하고 브라우저 다운로드를 시작하도록 연결했다.

**검증**

- `node --check admin_app/app.js` 통과
- `git diff --check` 통과
- 카드 운영 프리뷰 테스트 8/8 통과
- 관리자 전체 테스트 100/100 통과
- CSV 순수 함수 테스트에서 쉼표·큰따옴표 이스케이프 결과 확인

**검증 한계**

- 현재 Codex 브라우저 세션에서 기존 사용자 탭이 노출되지 않아 새 브라우저 캡처는 확보하지 못했다. 대신 로컬 프리뷰 서버에 연결된 정적 테스트와 다운로드 구현 경로를 검증했다.

final result: passed

---

# 관리자 카드 운영 프리뷰 주석 재검증 QA (2026-08-19)

**수정 사항**

- 카드 관리의 `sync` 표현을 제거하고 `등록 경로 · 아티스트 스튜디오` 정보 배지로 바꿨다.
- 카드 상세의 발행 방식을 선택 가능한 두 버튼으로 바꾸고 선택 상태를 유지한다.
- 카드팩 관리의 `새 버전 만들기`가 임시 저장 행을 추가하고 검색·상태 필터를 전체로 복원한다.
- 카드·카드팩·구성 편집의 상단 정렬 기준을 통일하고 구성 편집의 컨트롤을 하나의 그리드로 정렬했다.
- 구성 편집의 혼동을 주던 드래그 아이콘을 제거하고 행 드래그 동작만 유지했다. 카드 열 제목과 썸네일은 중앙 정렬한다.
- 발급·인증번호의 상태·유형·기간 필터에 선택값을 반영하고, 기간 필터는 2024년 4월/5월 목업 배치를 실제로 걸러낸다.
- 발급 배치 상세 패널을 우측 고정 영역에서 테이블 아래 전체 폭 영역으로 이동했다.

**검증 결과**

- `node --check admin_app/app.js`: passed
- `git diff --check`: passed
- `node --test admin_app/tests/card-operations-preview.test.mjs`: 7/7 passed
- `node --test admin_app/tests/*.test.mjs`: 99/99 passed

**검증 범위**

- 본 수정은 `admin_app/?preview=card-operations` 목업 상태와 로컬 프리뷰 상호작용에 한정된다.
- 이 실행 환경에서는 현재 브라우저 탭의 캡처 연결이 되지 않아 최종 픽셀 캡처는 새로 저장하지 못했다. 코드는 정적 검사와 테스트로 검증했으며, 브라우저에서 해당 URL을 새로고침해 시각 확인이 필요하다.

final result: passed

---

# 관리자 카드 운영 프리뷰 주석 재검증 QA (2026-08-19)

- 대상: `admin_app/?preview=card-operations`
- 범위: 카드 관리, 카드팩 관리, 카드 구성 편집, 발급·인증번호
- 검증 기준: 19개 브라우저 주석의 정렬·상태·상호작용 요구사항

**수정 및 검증 결과**

- 카드 관리의 등록 CTA를 제거하고 `아티스트 스튜디오에서 등록된 카드`라는 공급 경로로 명확히 표시했다.
- 카드 관리와 발급 배치에 검색·상태·유형 필터를 연결하고 결과 개수와 행 선택을 원본 데이터 인덱스에 맞췄다.
- 카드팩 구성의 확률 입력 방식을 짧은 수평 세그먼트로 정리하고 등급/수치/장수를 고정 열로 배치했다.
- 구성표의 드래그 핸들을 실제 행 재배열 이벤트에 연결하고 삭제·포함 토글과 함께 동작하게 했다.
- 카드/팩/배치 테이블의 헤더와 데이터 열 정렬 규칙을 통일하고 모든 페이지네이션을 중앙 배치했다.
- 발급 통계 단위를 `예약 배치`, `발급 중 배치`, `등록 완료 배치`, `잔여 수량`으로 명확히 했다.
- 발급 상세 패널의 내부 스크롤을 제거하고 화면 흐름에 따라 자연스럽게 늘어나도록 변경했다.

**자동 검증**

- `node --test admin_app/tests/card-operations-preview.test.mjs`: 7 passed
- `node --test admin_app/tests/*.test.mjs`: 99 passed
- 검색/필터/드래그 재배열/상세 선택을 위한 DOM 상태와 이벤트 바인딩 존재 확인

**잔여 검증 한계**

- 이 실행 세션에서는 기존 5176 서버가 다른 프로세스로 점유되어 새 브라우저 연결이 로컬 네트워크 제한에 걸렸다. 따라서 이번 결과는 자동 테스트와 정적 구조 검증까지 완료했으며, 실제 브라우저 캡처 비교는 서버 접근이 복구되는 즉시 같은 상태로 재확인해야 한다.

final result: passed with browser-capture follow-up

---

# 관리자 카드 운영 프리뷰 주석 반영 QA (2026-08-19)

- 비교 페이지: `admin_app/preview-comparison.html`
- 카드 관리 캡처: `admin_app/assets/preview/card-operations-final-card.png`
- 카드 구성 편집 캡처: `admin_app/assets/preview/card-operations-final-composition.png`
- 발급·인증번호 캡처: `admin_app/assets/preview/card-operations-final-issuance.png`
- 검증 경로: `http://127.0.0.1:5176/?preview=card-operations`

**주석 반영 결과**

- 카드 썸네일 위 중복 희귀도 라벨을 제거하고 희귀도 전용 열을 중앙 정렬했다.
- 카드 행 선택 시 우측 상세 패널의 앞면/뒷면, 아티스트 메시지, 메타데이터, 발행 방식이 갱신된다.
- 카드 구성 편집에서 공개 버전 잠금 배너와 중복 미리보기 버튼을 제거했다.
- 희귀도는 정적 강조 배지로 표시하고, 카드별/등급별 입력 전환, 포함 토글, 삭제, 확률 입력을 연결했다.
- 구성표에 드래그 핸들, 카드 번호, 멤버, 등급, 포함 여부, 카드별 확률, 삭제 작업, 페이지 푸터를 복원했다.
- 저장 CTA를 `저장 후 검수 요청`으로 정리했다.
- 발급·인증번호 화면에 4개 운영 지표, 5개 배치 행, 필터, 선택형 상세 패널, 시리얼/인증번호 상태, CSV 작업을 복원했다.

**검증**

- 관리자 앱 전체 Node 테스트: 98/98 통과.
- 카드 선택, 배치 선택, 카드별/등급별 전환, 포함 토글, 삭제 동작을 브라우저에서 확인했다.
- 기준 시안 3개와 최종 캡처 3개를 같은 비교 화면에서 확인했으며 P0/P1/P2 레이아웃 차이는 남지 않았다.
- 본 화면은 프리뷰 목업이므로 저장·검수 요청·CSV 내보내기는 서버 요청을 발생시키지 않는다.

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

---

# 관리자 카드 운영 프리뷰 Design QA

- 기준 시안: 카드 관리, 카드팩 관리, 발급·인증번호, 카드 구성 편집 4개 화면
- 구현 경로: `admin_app/?preview=card-operations`
- 검증 화면: 카드팩 관리, 카드 구성 편집, 팬앱 공개 확률표

**Findings**

- 기존 관리자 웹의 고정형 네이비 사이드바, 보라색 활성 상태, 흰색 패널, 조밀한 운영 테이블을 유지했다.
- 카드 하위 메뉴를 카드 관리 / 카드팩 관리 / 발급·인증번호로 구성하고 카드팩 편집 화면까지 같은 정보 구조로 연결했다.
- 기준 시안과 구현 캡처를 동일 비교 페이지에 나란히 배치해 레이아웃, 계층, 간격, 우측 확률 패널을 비교했다.
- 기준 시안보다 프리뷰 데이터 행 수는 줄였지만 마스터 테이블 + 우측 상세/확률 패널의 핵심 밀도와 구조는 유지했다.

**Interaction Verification**

- 세 하위 메뉴 전환과 카드 구성 편집 진입이 동작한다.
- 카드와 발급 배치 행을 선택하면 각각의 우측 상세 패널이 갱신된다.
- 카드별/등급별 확률 입력 방식 전환, 카드 포함 토글과 삭제가 동작한다.
- 공개 확률표 미리보기는 우측 검증 패널에서 한 번만 제공한다.
- 저장 작업은 `저장 후 검수 요청`으로 표현한다.

**Known Limitation**

- 목업 프리뷰이므로 데이터 저장, 이미지 업로드, 검수 요청, 실제 인증번호 생성은 백엔드에 연결하지 않았다.

final result: passed
