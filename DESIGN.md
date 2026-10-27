---
name: Evala
description: A quiet cream and sage chess workspace with a separate graphite companion bar.
colors:
  surface: "#f5f4ee"
  raised: "#eeefe8"
  paper: "#fffefa"
  ink: "#26342c"
  muted: "#626c60"
  accent: "#386446"
  line: "#d9ddd2"
  focus: "#38714c"
  board-light: "#eeeedc"
  board-dark: "#88a17b"
  board-last: "#e1d86c"
  negative: "#a94739"
  companion-surface: "#191b1a"
  companion-ink: "#f2f0e9"
  companion-accent: "#d5b77a"
  companion-muted: "#b2b6ad"
typography:
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 720
    letterSpacing: "-0.025em"
  subheading:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  action:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  accuracy:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.02em"
rounded:
  board: "3px"
  notation: "4px"
  field: "6px"
  control: "7px"
  panel: "8px"
spacing:
  compact: "8px"
  control: "12px"
  row-gap: "16px"
  inset: "20px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
  button-primary-hover:
    backgroundColor: "#2a5338"
    textColor: "white"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "#e9eee3"
    textColor: "{colors.accent}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  theme-tag:
    backgroundColor: "#e7ecdf"
    textColor: "#4d6944"
    rounded: "{rounded.notation}"
    padding: "4px 8px"
  coach-card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "14px"
---

# Design System: Evala

## Overview

**Creative North Star: "Quiet chess clubhouse"**

The primary web application uses cream surfaces, forest green actions, sage and ivory chess squares, and locally hosted Manrope. A large playable board, readable notation and factual feedback give the workspace its character. Flat game rows and restrained separators keep the surrounding interface quiet.

The web has distinct overview, games, analysis, puzzles, insights, settings and account routes. Google sign-in is optional: guest and signed-in libraries remain separate, and each account has its own local library, preferences and training history. The account screen makes guest-game transfer explicit. Czech and English controls share the same visual system.

The companion browser extension is a separate compact surface: a graphite evaluation bar beside an existing chessboard, with warm white scores, muted brass accents and an anchored settings popover or popup. Its dark palette does not define the light web application's defaults. Both surfaces use Manrope, tabular score numerals and small SVG icons.

**Key Characteristics:**

- Cream and sage web surfaces with forest green actions.
- A primary playable board and restrained, separated data rows.
- Distinct routes and collapsible navigation.
- Factual labels for scores, training difficulty and unavailable estimates.
- A separate graphite companion evaluation bar.

## Colors

The web palette is warm and low in saturation, with green used for actions, selection and positive feedback. Frontmatter values are normative for the recorded default theme.

### Primary
- **Forest green** (`accent`): primary actions, links, selected tabs and positive feedback.
- **Focus green** (`focus`): keyboard outlines on interactive web controls.

### Secondary
- **Sage square** (`board-dark`) and **ivory square** (`board-light`): the default playable and preview boards.
- **Last-move yellow** (`board-last`): the board's most recent move; the selected square has its own yellow treatment.
- **Clay red** (`negative`): negative values and error feedback.

### Neutral
- **Chalk cream** (`surface`): the page canvas.
- **Soft raised cream** (`raised`): supporting containers such as coach feedback.
- **Warm paper** (`paper`): fields, account sign-in and the settings drawer.
- **Charcoal green** (`ink`): primary text.
- **Muted olive grey** (`muted`): secondary text and metadata.
- **Pale separator** (`line`): table rules, container boundaries and dividers.
- **Companion graphite, warm white, brass and secondary grey** (`companion-*`): reserved here for the extension bar and its controls.

**The Surface Context Rule.** Use the cream web palette for web routes; keep the graphite and brass treatment attached to the companion extension.

## Typography

**Display and Body Font:** Manrope, with system-ui and sans-serif fallbacks. Latin and Latin Extended variable fonts are bundled locally (weights 200–800). The web inherits the family from the shared theme and overrides that theme's dark palette.

**Character:** Compact sans-serif typography supports board operation and dense chess data. Bold headings and tabular numerals establish hierarchy without a decorative display face.

### Hierarchy
- **Headline:** page headings use the frontmatter headline role; mobile page headings reduce to (27px).
- **Title and subheading:** section titles and smaller headings use the corresponding roles. Analysis panel titles are more compact (13px).
- **Body:** the web body uses the body role; paragraphs use line height (1.65). Supporting explanations commonly use (12–13px).
- **Label and action:** labels use the label role; primary actions use the action role. Navigation uses (14px, 600) at full width.
- **Accuracy:** review accuracy uses the accuracy role, with tabular numerals; it becomes (28px) on mobile.
- **Graph labels:** White/Black labels are HTML elements at (12px) with line height (16px), positioned over the SVG plot. They do not scale with its viewBox.

**The Readable Data Rule.** Preserve tabular numerals for scores, counts and timing, and keep graph labels in HTML so chart scaling does not shrink their text.

## Layout

The full desktop navigation rail is fixed at (212px). The header is (64px) high, and standard pages use (32px) padding inside a centered maximum width of (1420px). The overview pairs a board preview with training rows; the games route pairs the library with an import area. The library is a distinct route rather than a permanent column beside analysis. Insights contains its own report setup and results; that setup is not the application entry screen.

Analysis uses a two-column grid: flexible board workspace and a (320px) review panel, with a (28px) gap and maximum width (1500px). Its board workspace is capped by `calc(100vh - 330px)`; manually collapsing navigation changes that cap to `calc(100vh - 240px)`. The web evaluation meter sits to the left of the board in a (32px) track column. The graph follows the board controls. The review panel has local overflow with maximum height `calc(100vh - 106px)`, and notation has its own bounded list. The document itself can scroll; there is no universal viewport-only scrolling rule.

Responsive rules are shipped at (1600px minimum), (1150px maximum), (900px maximum) and (700px maximum). At 1150px the rail is (180px), and at 900px it is an icon rail of (76px). The explicit collapse setting uses a (72px) rail. At 700px navigation becomes a horizontal strip; collapsing it hides the strip. Main content loses its left margin, page padding becomes (24px 18px), and analysis and puzzles stack into one column. The mobile analysis panel allows normal overflow and follows the board, with a separately bounded notation list.

Spacing follows recurring (8px), (12px), (16px), (20px), (24px) and (32px) steps rather than a single uniform grid. Wider layouts increase page insets and board/review separation. Content remains driven by imported games and actual training state.

## Elevation & Depth

The web is predominantly flat. Tonal surfaces, thin rules and active green treatments distinguish regions. Shadows are limited to transient overlays and chess-piece rendering. The settings drawer uses `-8px 0 35px #24392c1a`; the toast uses `0 8px 28px #26342c25`. These are not card defaults. The extension track separately uses `0 2px 10px #0003`, and its popover uses `0 12px 40px #0006`.

Buttons change color over (0.14s). Rail width, content margin and board width changes use (0.22s) with `cubic-bezier(.16,1,.3,1)`. The web evaluation fill animates a transform over (0.25s ease-out). Reduced-motion rules remove animations and transitions.

## Shapes

The web uses gently rounded controls (7px), fields (6px), supporting panels (8px), notation cells (4px), and boards and evaluation tracks (3px). Chess squares stay square and flush. Game rows stay flat with bottom separators. Circular player indicators and move emblems communicate side or classification. The extension has its own track (5px) and popover (14px) radii.

## Components

### Buttons

Primary actions are compact and solid green, with warm paper text, a (44px) minimum height and the frontmatter padding. Hover darkens green. Quiet actions are transparent with a thin separator-colored border and a (35px) minimum height; secondary actions use a pale green fill and green text. Icon buttons typically use an (18px) SVG inside a (35px) square. Responsive board navigation is smaller; these observed sizes are not a universal touch-target guarantee.

Web keyboard focus uses a (3px) green outline with a (3px) offset; board-square outlines are inset. Disabled buttons reduce opacity. Controls retain text or accessible labels beside or around their SVG symbols.

### Chips

Puzzle theme tags use pale green fill, olive text, (12px) type and the theme-tag frontmatter shape. They describe puzzle themes. Review move classifications use distinct semantic colors and inline SVG emblems with adjacent names and counts; color is not their only label.

### Cards / Containers

Most content uses open sections and divided rows. The coach container uses the coach-card frontmatter values, with a vertical (10px) gap. Account sign-in uses a paper surface, a thin separator border and an (8px) radius; its desktop padding is (30px). Training invitations and import setup use muted tonal surfaces. Do not infer a shadowed-card grid from these specific containers.

### Inputs / Fields

Fields use warm paper, charcoal green text, a muted green-grey border, the field frontmatter padding and a (39px) minimum height. Textareas resize vertically. Labels remain outside the field; placeholders use muted text. Focus follows the shared keyboard outline.

### Navigation

The rail provides route icons and labels. Active navigation uses a pale green background and deeper green text; hover uses a softer tonal fill. Header controls toggle the rail and Czech/English. Desktop collapse retains icons, and mobile collapse hides the horizontal navigation strip. Google identity and sync status appear in the header and account area according to actual session state.

### Board, review and training

The playable board uses a square grid, legal-move markers, last-move highlighting and optional coordinates. The web meter and compact companion bar show White's perspective and a neutral midpoint; orientation follows the board. Review tabs switch summary, notation and engine lines. Summary rows place White's count, a named SVG move emblem and Black's count together; available counts jump to matching moves.

Rated-bank puzzle difficulty and the player's adaptive training rating are distinct. Personal mistake positions show that calibrated puzzle ratings are unavailable. Review's game-strength estimate is an explicitly uncalibrated heuristic anchored to PGN Elo, with an explanation and a missing-value state when evidence is insufficient. Classifications and accuracy are Evala's own. These labels must remain factual when styles are reused.

## Do's and Don'ts

### Do:
- **Do** keep the playable board visually primary within analysis and training.
- **Do** use flat rows, tonal containers and restrained separators for games and results.
- **Do** preserve route separation and the collapsible navigation behavior.
- **Do** pair move-summary SVG emblems with their names and counts.
- **Do** keep account, guest, unavailable-rating and heuristic-estimate states explicit.
- **Do** retain the shipped focus and reduced-motion treatments when reusing controls.

### Don't:
- **Don't** apply the companion graphite palette as the light web application's default.
- **Don't** restore a single report form as the web entry screen or a permanent analysis-library column.
- **Don't** require every route to fit the viewport or confine all scrolling to lists.
- **Don't** describe personal positions as calibrated puzzles or game-strength estimates as official ratings.
- **Don't** add fabricated statistics, marketing slogans or official Chess.com badge claims.

Not canonized: compact 11px review metadata and language controls, and smaller mobile board controls, are present in the build. Their presence does not establish a universal readability or accessibility guarantee. This documentation refresh does not alter or certify those controls.
