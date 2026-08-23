# Discover Journeys Design

## Goal

Turn the Discover tab into a navigable hub without replacing Fanfolio's existing visual system. The hub should help a fan choose one of three clear journeys: explore an artist, inspect a card pack or event, or meet other fans and their public collections.

## Information architecture

- `/discover`: discovery hub with category controls and compact content previews.
- `/discover/artists/dreamscape`: dedicated artist hub with schedule, news, cards, and event entries.
- `/discover/packs/:packId`: dedicated card-pack collection view, reusing the existing pack odds and opening flow.
- `/fans`, `/fans/:userId/collection`, `/trades`: existing community, public collection, and trade flows.
- `/events/:eventId`: existing event detail flow.

## Interaction rules

- The Discover root keeps the global app header and bottom navigation.
- Detail destinations use a back button and centered title; they do not add notification or profile controls.
- Category controls change the content shown on the hub rather than opening inert mock panels.
- Featured content cards are buttons and always lead to a destination.
- Existing backend-connected card-pack, event, fan-follow, public collection, and trade features are reused.

## Visual direction

Use the current purple Fanfolio palette, typography, radii, spacing, image assets, and mobile shell. The generated mockups guide content hierarchy only; they are not copied pixel-for-pixel.

## Verification

- Source contract tests cover routes and callbacks.
- The production build passes.
- The in-app browser verifies the Discover root, artist detail, and card-pack detail transitions at the mobile viewport.
