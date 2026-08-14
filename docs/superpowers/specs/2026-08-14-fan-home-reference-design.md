# Fan Home Reference Design

## Visual source of truth

Implement the selected `exec-38ca641f-1d78-4d1d-bdf6-b0ac828f86d5.png` home screen as the fan app home. The reference is a 426px CSS-width mobile composition rendered at 2x.

## Layout contract

- Use the shared five-item bottom navigation with `홈` centered and active.
- Use a 430px maximum fan shell with 22px horizontal gutters.
- Keep the header to the FANFOLIO wordmark, notification control, and profile avatar.
- Break the home headline into two lines; the second line is violet.
- Use a full-bleed group image for the event hero and the interested-artist panel.
- Render three portrait cards with rarity at top-left, favorite at top-right, and member/version copy at the bottom.
- End with one compact in-progress event row above the fixed navigation.

## Visual language

- Font stack: existing Korean/system sans stack; no new dependency.
- Reduce heavy 850–900 weights in fan-facing editorial content to 600–750.
- Ink `#11152f`, violet `#5a4ff2`, muted `#74788d`, off-white `#fbfaff`.
- Rounded corners: 16–20px for media panels, 12–14px for cards and rows.
- Preserve existing API data and navigation callbacks; this is a presentation refactor only.

## Acceptance criteria

- Home hierarchy and proportions visually match the selected reference at 430×922.
- No clipped copy or overlapping controls at 360px, 390px, and 430px widths.
- Hero, artist panel, card detail buttons, events CTA, header controls, and all five bottom tabs remain interactive.
- Existing home/event data fallbacks continue to work.
- Targeted tests, lint, build, and same-viewport design QA pass before deployment approval is requested.
