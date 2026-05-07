# OpenExam Design System

Last updated: 2026-05-06

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

## Knowledge Tree Views

Knowledge-point views use a tree-card pattern:

- Learner list pages must use top-level knowledge nodes as major hard-edge cards.
- A major card may show its direct child nodes as compact rows, not nested cards. Rows should carry code, title, total question count, new/practiced state, accuracy, wrong-note state, and short actions.
- Learner list pages should show only two levels: major card plus direct child rows. Third-level and deeper descendants should be summarized with a child-count chip and opened through the detail page.
- Major cards default to expanded child rows. When a major card has more than eight direct child nodes, show the first eight and use a detail link for the remainder.
- Major cards should show `description` as a short summary. `examExpectation`, notes, AI explanations, common errors, and full related-question lists belong on the detail page.
- Accuracy with no practiced questions should read as "未练", not `0%`.
- Wrong-note pressure should use a red status chip only. The whole card must not change to a danger background.
- Nodes with no practiceable questions stay visible, but their practice buttons are hidden.
- Mobile child rows must put title and chips above actions; action buttons may wrap onto a new line.
- Knowledge detail pages should use a compact indented tree list for the selected node and all descendants. The current node appears as the first root row and should not show a redundant detail button.
- Admin knowledge management should show each syllabus' nodes as an always-expanded tree with inline editing. Parent selectors should use tree indentation and show only valid parents for that node.
- Admin knowledge creation should happen inside each syllabus section; avoid a global knowledge-node create form whose parent selector spans multiple syllabi.

## Rich Question Content

Question rendering may include text and image blocks in stems, options, explanations, and reference answers.

- Practice pages, paper attempt pages, practice result pages, admin question previews, and admin material-candidate previews should render rich blocks when present.
- Compact lists, reports, wrong-note summaries, and table-like admin rows should keep using the plain `stem` fallback.
- Text blocks should preserve line breaks and wrap long words.
- Private image blocks with `assetId` render through `/assets/{assetId}` using a plain `<img>` tag.
- External image blocks without `assetId` render inline on rich question surfaces. Use `loading="lazy"`, `decoding="async"`, and `referrerPolicy="no-referrer"`. If loading fails, keep a hard-edge failure block with a "查看原图" link that opens in a new tab with `rel="noreferrer noopener"`.
- Inline images should keep their aspect ratio, use `max-width: 100%`, cap question-content height at about `480px`, and use the same hard black border language as other content blocks.
- Do not add click-to-zoom or a rich-text editor in the MVP. Admin editing can happen through existing JSON fields, with preview rendering beside the forms.

## Implementation Note

The design system is the source of truth for UI implementation. Any future prototype should follow this document and should not introduce separate visual rules without updating this file.

## Current Implementation

The foundation UI implements the first pass of the design direction in `apps/web/app/globals.css` and the shared shell components used by learner routes and `/admin` role routes:

- Light gray-blue pixel grid background.
- White hard-edge panels.
- Thick black outlines.
- Blocky black shadows.
- Bright yellow primary actions.
- Square controls without pill styling.
- Monospace type stack.
- Light CRT scanline overlay.
- Dense form layouts for admin CRUD and learner goal selection.
- Goal-scoped practice cards with stable answer option rows and explicit result feedback.
- Paper list and full-paper answer forms with stable question blocks, answer-card chips, elapsed-time display, score chips, radio rows, unanswered confirmation, and explicit submit actions.
- Attempt history, attempt report, and wrong-note review cards with status chips, paper/practice labels, knowledge chips, retry actions, knowledge filters, metrics, AI analysis blocks, and long-stem wrapping.
- Profile and AI task pages with dense BYOK forms, key-status chips, model/status chips, usage/duration chips, failed-call error panels, and retry actions.
- Admin single-choice editing and JSON import forms with dense square inputs, filter controls, review/archive action rows, select controls, and textarea rows for stems, import payloads, and explanations.
- Admin paper forms with dense filters, hide/restore actions, selected/unselected question binding rows, square checkboxes, and compact score/order inputs.
- Admin AI preset forms with compact model, task-route, temperature, max-token, enable/disable controls, and status chips.
- Material upload, job queue, candidate-question, and user-usage pages with dense forms, status chips, error panels, and compact action rows.
- Truncated account labels in sidebars so long names and emails do not cause horizontal overflow.
- Shared pixel UI form primitives for text inputs, textareas, selects, date pickers, choices, feedback messages, and submit buttons across learner and admin route groups.
- Custom pixel date picker controls with hard outlines, block shadows, yellow accent blocks, and hidden `YYYY-MM-DD` form values instead of native browser date inputs.
- The learner homepage uses the same hard-edge panels and compact status chips for exam program cards. Exam detail pages use matching cards for administrator-configured open and planned directions or subjects.
- Knowledge pages use top-level knowledge cards with compact child rows, subtree-scoped statistics, detail-page tree lists, and admin tree editing.
- Practice, paper, and admin review surfaces render rich question content blocks for stems, options, explanations, and reference answers when payload data provides them.

Theme switching is not implemented yet. Current colors are CSS custom properties on `:root`; future theme presets should override those tokens without changing layout or density.
