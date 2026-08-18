# Profile Decorating Screen Design QA

final result: passed

Viewport: Codex in-app browser, 674px browser viewport with the app constrained to the 430px mobile canvas.

Reference: approved Fanfolio profile decorating mockup supplied by the user.

Checks completed:

- Profile editor opens as a dedicated mobile screen centered inside the app canvas.
- Decorative profile hero, lavender background, rounded inputs, and violet primary action are present; the non-functional progress cue was intentionally removed.
- Artist is represented by one native single-select control.
- Member is represented by one native single-select control and reloads when the artist changes.
- Profile save action remains connected to `PATCH /me/profile`.
- Email account exposes `계정 보안 · 비밀번호 변경` and opens the separate password screen.
- Password screen renders current-password, new-password, and confirmation fields without submitting credentials during QA.
- Social account branch renders provider-security guidance and does not render password controls.
- Existing My page notification, language, support, terms, privacy, event, and logout actions remain outside the profile screen.
- Frontend tests, build, lint, backend compile, and backend contract tests pass.

Known note: the browser QA account was an email-login user, so the social branch was validated from the conditional source contract rather than by changing the live account provider.

## Fan Growth Screen Design QA

final result: passed after user-review corrections

Viewport: Codex in-app browser, 430×932 mobile viewport; reference image compared at its 2× 852×1846 export scale.

Checks completed:

- Shared header hierarchy matches the supplied reference, and the obsolete forced 123.7px header minimum was removed so the description-to-artist-title gap is no longer inflated.
- The Lv.1/RISING FAN heading and the XP ring share the same measured horizontal center (0px delta).
- The XP value inside the progress ring renders at 14px for legibility.
- Both unreached Lv.2 and Lv.3 milestones show contained lock icons inside their level pills.
- Hero uses the supplied Dreamscape group image, level typography, XP ring, image fade, right-side divider, and separated copy start position.
- Milestones use the reference three-stop pill timeline with current Lv.1 state and locked Lv.2/Lv.3 states.
- Next reward is data-driven and renders 미공개 콘텐츠 / Lv.2 달성 시 획득 in the preview state.
- Global growth card follows the reference hierarchy: Lv.2 GLOBAL FAN, progress rail, 120 / 300 XP, and the bottom-right 전체 마일스톤 보기 link.
- Next reward, milestone 전체 보기, and mission summary each open and close their respective bottom sheets successfully.
- Browser console reported no errors during the final interaction pass.
- Frontend tests: 100 passed; oxlint passed; production build passed.

## Seasonal Level Pass Admin Design QA

final result: passed

Viewport: Codex in-app browser, 1545×963 desktop viewport. The implementation capture was normalized to the approved 1586×992 reference for side-by-side comparison.

Reference: `/Users/gojaewoong/.codex/generated_images/01a01424-a309-7ab2-883d-cfd15ded9ce5/exec-057c24da-fff5-4bcd-a93f-95b045b46f4e.png`

Implementation capture: `/Users/gojaewoong/Desktop/ko/fanfolio/.tmp-season-pass-admin-final.png`

Combined comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/.tmp-season-pass-design-comparison.png`

Checks completed:

- Dark operations navigation, page hierarchy, primary registration CTA, three summary cards, dense pass list, filters, selected-row outline, pagination, and fixed right editor match the approved desktop composition.
- The editor contains basic season data, root-only organization scope, artist selection, season dates, tier milestone cards, fan-app preview, status, and sticky actions.
- Root administrators see all artist filters; scoped partner administrators are limited to their assigned artists by the existing admin context and backend scope validator.
- A real Dreamscape comeback season was created through the browser, returned to the list, reopened, and saved through `PATCH /admin/engagement/pass-seasons/{id}`.
- The first 0 XP tier and the following 100/300 XP tiers persisted as three milestones.
- Draft passes do not expose the publish-approval action; approval is available only in `pending_review` state.
- Admin static tests: 88 passed. Targeted backend season-pass contract tests: 4 passed.
- The full backend suite has a pre-existing unrelated failure in partner-member creation caused by the unique admin nickname index; no fan-pass contract failed.

## Reward Builder Design QA

Reference: `/Users/gojaewoong/.codex/generated_images/01a01424-a309-7ab2-883d-cfd15ded9ce5/exec-6b0c6b99-3bf1-45bb-b654-b55c430a531e.png`

Implementation capture: `/Users/gojaewoong/Desktop/ko/fanfolio/reward-builder-implementation-final.png`

Combined comparison: `/Users/gojaewoong/Desktop/ko/fanfolio/reward-builder-comparison-v2.png`

Viewport: reference 1536×963 pixels; implementation 1533×963 CSS pixels at deviceScaleFactor 1. The three-pixel width difference is outside the fixed 500px drawer and does not affect drawer geometry.

State: local `reward-builder` preview, first generated ticket preset selected, Dreamscape artist, badge reward type, populated fan-app preview.

Checks completed:

- Header, image preview, upload action, generated image choices, form fields, fan-app preview, dimmed workspace, and fixed action footer follow the approved composition.
- The four visible reward images are generated 512×512 PNG assets, not placeholders or CSS drawings.
- Initial iteration exposed a P1 footer containment defect: the absolutely positioned footer used the viewport as its containing block and spanned the full screen. The drawer is now positioned and the footer measures exactly from x=1033 to x=1533, matching the 500px drawer bounds.
- Initial iteration exposed a P2 stale selection indicator after image changes. Preset changes now leave exactly one selected thumbnail and move the check indicator with the selected asset; uploads clear the preset selection.
- The ambiguous `미디어 라이브러리` control was renamed `기본 이미지 선택`, explains that four bundled images are available, scrolls to the choices, focuses the first option, and briefly highlights the selection area.
- A custom-select regression replaced the chevron glyph with the chosen reward label, producing duplicated text such as `뱃지 뱃지`. The label now has its own target node, and browser verification confirmed `칭호` plus an intact `expand_more` icon.
- The generic save error was reproduced as `401 Unauthorized` because the visual-only preview URL had no administrator session. The browser was moved to the real authenticated admin route; a reward POST returned `201 Created`, and expired sessions now receive a specific login-expired message.
- Clicking a preset updates the main image and fan-app preview. Browser evidence confirmed one selected preset and focused keyboard target.
- The full drawer is legible in the combined comparison, including the image picker and footer, so a separate focused crop was not required.
- JavaScript syntax validation passed and all 14 fan-growth admin contract tests passed.

final result: passed
