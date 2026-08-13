# Fan Collection Spotlight Design

## Goal

Turn the signed-in fan home into a commercial-quality collection dashboard that matches the user-selected mobile reference while preserving the existing card, notification, discovery, collection, settings, and redemption flows.

## Visual direction

- Use the existing Fanfolio off-white, ink navy, and prism-violet brand tokens.
- Give one newly acquired card the dominant visual role with a large, photographic hero surface.
- Keep the page editorial and spacious: compact brand header, personal greeting, hero, progress, recent collection rail, primary registration CTA, then navigation.
- Use real card images already returned by the product API. Do not copy the mockup's administrator metadata into the fan experience.
- Keep rounded corners restrained and hierarchical: 22px hero, 14px recent cards, 16px CTA, circular profile only.

## Interaction model

- Hero and recent-card tiles open the existing card detail.
- “전체 보기” opens the existing full collection.
- The large “카드 등록” button opens the existing QR/code redemption sheet.
- The header bell remains the entry to notifications and the avatar remains the entry to settings.
- Bottom navigation becomes four fan-oriented destinations: 컬렉션(home), 탐색(discover), 보관함(collection), 마이(settings). Alerts remain fully reachable from the header.

## States

- Loading: retain a clear collection-loading status.
- Owned collection: show greeting, newest card hero, progress, recent-card rail, and registration CTA.
- Empty collection: keep registration and discovery actions, followed by current recommendations.
- Saved cards: continue to show the existing interest-card section below the primary collection experience.

## Accessibility and responsive behavior

- Keep every interactive surface as a real button with explicit labels.
- Maintain visible focus rings and 44px minimum primary navigation targets.
- Avoid horizontal page overflow at 360px; only the recent-card rail scrolls horizontally.
- Respect safe-area insets in the fixed bottom navigation.

## Acceptance criteria

- The selected reference's hierarchy is visibly recognizable at a 430px mobile viewport.
- No existing core route or card action is lost.
- The fan-growth full experience remains available from My/settings but no longer competes with the collection hero on home.
- Tests, lint, TypeScript build, browser interaction checks, and same-viewport visual QA pass.
