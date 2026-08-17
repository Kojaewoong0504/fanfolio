# Fanfolio post-signup onboarding design

## Goal

Translate the three approved onboarding images into the existing authenticated signup flow without changing the profile API contract, session draft restoration, or back navigation behavior.

## Visual direction

- Use the existing Fanfolio pale-lavender canvas, deep navy type, violet-to-blue accents, fine lavender borders, and soft shadows.
- Treat each step as a focused mobile screen with a compact circular back control, centered `최초 설정` label, `n / 3` counter, and a three-segment progress rail.
- Keep the primary action visually anchored at the bottom of the content while allowing the page to scroll on short viewports.
- Use real catalog/member images and crisp SVG icons already available in the application.

## Screen contracts

### 1. Artist selection

- Heading: `좋아하는 아티스트를 선택해 주세요`.
- Supporting copy explains that recommendations are personalized.
- Search field uses a leading search icon.
- Artist choices are two-column portrait cards with image, name, supporting label, and a circular selected check.
- CTA: `다음: 멤버 선택`.

### 2. Member selection

- Heading names the selected artist.
- A compact selected-artist summary appears before the grid.
- Member choices are two-column portrait cards with image, name, supporting label, and a circular selected check.
- CTA: `다음: 닉네임 설정`.

### 3. Nickname and profile

- Heading: `팬포리오에서 사용할 닉네임을 정해 주세요`.
- Profile preview card contains the current avatar/fallback, collection label, live nickname, selected artist/member, and a camera edit affordance.
- Nickname input shows a live character count and a note that the name can be changed later.
- CTA: `나만의 컬렉션 시작하기`.

## Responsive and accessibility rules

- Maintain two columns down to 320px by allowing text to truncate rather than forcing card overflow.
- Buttons keep native semantics, selected choices expose `aria-pressed`, and progress exposes `aria-valuenow`.
- Decorative images have empty alt text; the profile preview keeps a descriptive alt.
- Visible focus rings must remain available for keyboard users.

## Non-goals

- No API schema changes.
- No new image generation or dependency installation.
- No change to authentication, onboarding draft persistence, or post-save navigation.
