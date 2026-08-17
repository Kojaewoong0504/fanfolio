# Interactive Card Reveal Design

## Goal

Turn the card reveal step into a collectible-card experience rather than a static result image. After the reveal animation, the same card must support front/back inspection and data-driven material effects. The collection card detail view must use the same interaction model so behavior does not diverge between acquisition and later viewing.

## User Flow

1. The user presses `카드 공개하기` on the mystery-card screen.
2. The mystery card performs one short reveal sequence: lift, half-turn, light bloom, then settles on the revealed front.
3. Once settled, the screen exposes `앞면` and `뒷면` controls and a short gesture hint.
4. Moving a pointer or dragging horizontally changes tilt and foil lighting. Lenticular cards reveal the alternate image according to horizontal position.
5. The user may inspect both sides before pressing `컬렉션에 추가`.
6. Opening the card later from the collection presents the same renderer and effects, plus the existing optional device-motion and special-media controls.

## Shared Component Boundary

Create a reusable `InteractiveCollectibleCard` component that owns:

- front/back state and accessible side controls;
- normalized v3/legacy effect configuration;
- pointer tilt, moving light, and lenticular reveal;
- front material, foil pattern, foil coverage, and interaction mode;
- back material, edge foil, spot UV, official metadata, and hidden message;
- reduced-motion and low-memory fallbacks;
- optional device-orientation permission controls for the detail view;
- an optional `reveal` presentation mode that plays once when the card first appears.

`CardDetail` remains responsible for API loading, modal behavior, metadata, and special media. `RevealCard` remains responsible for the four-step registration flow, mystery-to-revealed transition, reward metadata, and completion CTA.

## Visual Behavior

- Reveal duration: approximately 900-1100ms total, with no looping entrance animation.
- The card starts slightly lowered and edge-on, rotates to the front, and receives a restrained violet/white light bloom.
- Foil and holographic surfaces remain interactive after the entrance animation, not continuously flashing on their own.
- The card keeps the existing physical 2:3 frame, rounded corners, badge placement, and violet palette.
- The reveal layout retains the current title, metadata row, bonus row, and CTA hierarchy.
- The side selector is compact and located directly under the revealed card so its purpose is obvious.

## Demo Card Configuration

The QA random card uses a visible demo configuration even without backend detail data:

- front material: `pearl`;
- foil pattern: `prism`;
- foil coverage: `full`;
- interaction: `tilt`;
- back material: `matte`;
- back edge foil: `silver`;
- back spot UV: `serial`;
- hidden message: a short official collection message.

## Accessibility and Performance

- `prefers-reduced-motion: reduce` replaces the 3D reveal with a short opacity transition and disables tilt transforms.
- Low-memory devices use the same reduced-effects path already present in card detail.
- Front/back controls expose `aria-pressed`; the card has a meaningful front or back label.
- Vertical touch scrolling must remain available; tilt capture begins only after a deliberate horizontal drag.
- No audio plays automatically.

## Acceptance Criteria

- The reveal result visibly animates once after the mystery-card CTA.
- The revealed card can be switched between front and back before collection addition.
- Pointer/touch movement changes the effect without blocking normal vertical page scrolling.
- The reveal and collection detail views share one collectible renderer and one normalized effect model.
- The QA reveal demonstrates a visible pearl/prism effect and a designed back side without remote data.
- Reduced-motion users receive a stable, non-3D version.
- Existing registration routing, completion CTAs, card detail metadata, and special media remain intact.
- Targeted tests, lint, build, and browser visual comparison pass.
