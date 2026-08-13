# FANFOLIO fan app screen references v1

These are separate portrait references for implementation. Keep the visual system shared across every screen:

- Viewport: 390 × 844 mobile layout
- Page background: `#FAF9FF`
- Ink: `#171B4D`
- Primary violet: `#5B4BEB`
- Accent blue: `#376BFF`
- Typeface direction: Pretendard / Noto Sans KR-like Korean sans-serif
- Wordmark: text-only `FANFOLIO` (no emblem)
- Authenticated bottom navigation, always ordered: `탐색 / 보관함 / 홈 / 팬 레벨 / 마이`
- Active navigation item: violet filled icon treatment; inactive items: navy outline icons
- Cards: 16–24px radius, thin lavender border, restrained shadow, 8px spacing rhythm

Screen mapping:

| File | Route / purpose |
| --- | --- |
| `login.png` | Login / onboarding |
| `home.png` | Home feed and featured event |
| `artist-hub.png` | Artist hub / 탐색 |
| `events.png` | Event list |
| `event-detail.png` | Event detail |
| `collection.png` | Collection / vault |
| `fan-level.png` | Fan level and missions |
| `my.png` | Profile and settings |

Use these as visual references, not as source text. Copy, data, image URLs, and accessibility labels must remain driven by the app/API.
