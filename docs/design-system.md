# OpenExam Design System

Last updated: 2026-05-05

## Direction

OpenExam uses a retro pixel game interface adapted for a serious learning workspace.

The base visual language is:

- Light gray-blue pixel grid background.
- White hard-edge cards.
- Thick black outlines.
- Blocky black shadows.
- Bright yellow highlights.
- Square controls with no rounded pill styling.
- Pixel/monospace type stack.
- Light CRT scanline texture.

The UI must stay readable for long study sessions, practice workflows, data tables, admin review, and AI task monitoring.

The first implementation uses Simplified Chinese (`zh-CN`) interface text. Layouts must leave enough room for Chinese labels in dense navigation, tables, and controls.

## Theme Switching

OpenExam supports switchable retro game-inspired color themes.

Theme switching changes color tokens only. It must not change:

- Layout.
- Component density.
- Card shape.
- Border thickness.
- Accessibility requirements.
- Public/private/AI status semantics.

Core tokens that themes may override:

- `background`
- `surface-subtle`
- `surface-muted`
- `primary`
- `primary-soft`
- `primary-ink`
- `teal`
- `teal-soft`
- `ai`
- `ai-soft`

Tokens that should remain stable across themes:

- White card surface.
- Black outline.
- Black hard shadow.
- Bright yellow highlight.
- Text contrast.

## Initial Theme Presets

Theme names should be inspired by retro game genres without using protected game logos, characters, sprites, or copied assets.

Initial presets:

- `gray-blue-academy`: default light gray-blue learning workspace.
- `mushroom-adventure`: red, sky-blue, green, and yellow arcade platformer palette.
- `jungle-assault`: green and olive tactical action palette.
- `star-pixel`: blue-purple sci-fi arcade palette.
- `handheld-green`: muted portable-console green palette.

The UI may mention user-friendly Chinese labels such as:

- 灰蓝学院
- 蘑菇冒险
- 丛林突击
- 星际像素
- 掌机绿屏

## IP Boundary

Themes can reference general retro game color moods, but OpenExam should not ship:

- Official game names as brand assets.
- Character art.
- Sprites.
- Logos.
- Sound effects.
- Level art copied from existing games.

The product should treat examples such as Super Mario or Contra as design inspiration only, not as licensed assets.

## Accessibility

Every theme must keep:

- Body text contrast at WCAG AA or better.
- Visible keyboard focus.
- Non-color indicators for status.
- Reduced motion support for optional effects.
- No horizontal overflow at 390px mobile width.

## Implementation Note

The design system is the source of truth for UI implementation. Any future prototype should follow this document and should not introduce separate visual rules without updating this file.

## Current Implementation

The foundation UI implements the first pass of the design direction in `apps/web/app/globals.css`, `apps/admin/app/globals.css`, and the shell components in each app:

- Light gray-blue pixel grid background.
- White hard-edge panels.
- Thick black outlines.
- Blocky black shadows.
- Bright yellow primary actions.
- Square controls without pill styling.
- Monospace type stack.
- Light CRT scanline overlay.

Theme switching is not implemented yet. Current colors are CSS custom properties on `:root`; future theme presets should override those tokens without changing layout or density.
