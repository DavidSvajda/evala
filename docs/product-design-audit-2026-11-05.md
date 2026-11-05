# Product Design follow-up: Evala 2.15.1

Audited the deployed application with Product Design's combined UX and
accessibility framework on 5 November 2026. Preserved the existing parchment,
sage and forest palette. No Impeccable workflow was used.

## Captured flow

1. **Analysis, 1280 × 720:** the complete board and move controls fit. The
   summary remains alongside it with its own scroll area. Screenshot:
   `test-results/product-design-audit/01-analysis-laptop.jpg`.
2. **Review with the coach:** the action opens the Coach tab and selects a key
   moment on the board. Three key moments is the default. Explanation and
   continuation actions stay in the adjacent panel. Screenshot:
   `test-results/product-design-audit/02-coach-laptop.jpg`.
3. **Practice room → My study:** repertoire, endgame foundations and portable
   coach exercises are grouped into four sections on the laptop. Explicit save
   controls were inconsistent with the blanket “Changes save automatically”
   promise. Corrected the English and Czech introduction to distinguish manual
   saving from automatic practice-result storage. Screenshot before correction:
   `test-results/product-design-audit/03-study-laptop.jpg`.
4. **My study, 390 × 844, dark:** sections reflow into one column; lesson choices
   remain two columns. No visible horizontal clipping in this capture. The long
   page is a tool library, rather than an active-board layout. Screenshot:
   `test-results/product-design-audit/04-study-mobile-dark.jpg`.
5. **Endgame lesson on mobile:** selecting Queen checkmate scrolls to the
   exercise. Board, instructions, close action and turn status fit together in
   the viewport. Screenshot:
   `test-results/product-design-audit/05-endgame-mobile.jpg`.

Screenshots are local development artifacts and excluded from Git. The audit
used fresh browser captures of production, not previous test screenshots.

## Remaining opportunities and evidence limits

- The laptop coach panel is narrow. Long native select labels truncate, although
  their labels and selected values remain available to assistive technology.
  A dedicated wider review mode deserves usability testing before further
  layout changes.
- My study requires finding its Practice room tab. Observe new-user navigation
  before adding another competing primary action to the overview.
- An English DOM snapshot still exposed Czech names on the move-quality count
  buttons and the personal-plan region. These predate this release and need a
  targeted accessibility-localization pass; visible main copy was English.
- Screenshot inspection does not certify WCAG compliance, contrast ratios,
  screen-reader usability, learning outcomes or every responsive breakpoint.
- This follow-up did not independently rerun every learning workflow or measure
  engine strength. Focused regression checks for the release are recorded in
  `study-workspace-2026-11-05.md`.

The editorial overall score remains **7.9/10**. Installing a design plugin or
correcting one sentence is not evidence for raising a product score.
