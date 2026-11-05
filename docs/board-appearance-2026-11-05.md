# Evala 2.16: board appearance and safe visual polish

Product Design guided a bounded polish of the existing analysis screen and
appearance settings. The parchment, sage and forest palette is retained.
Impeccable was not used. No new design library ships to the browser.

## Changes

- A wider laptop results panel, evenly spaced review tabs that stay visible
  inside that panel, readable coach text and an untruncated review-scope select.
  The existing measured board-fit logic is unchanged.
- Selectable Classic, Merida, Chessnut and Letters pieces. The chosen SVG set
  applies immediately to full boards, mini boards, moving pieces and drag ghosts.
  A two-colour preview sits below the selector. Artwork is self-hosted and source
  revisions, authors and licenses ship with the assets.
- Solid arrows with a filled triangular head are the default. The alternative
  rounded style uses a thinner stroke. User annotations and engine arrows use
  the same preference; their legal-move and pointer behaviour is unchanged.
- Smooth, Quick and No animation modes. Smooth uses a distance-sensitive
  180–280 ms transition, Quick 90–150 ms. Existing interruption handling, castling
  and promotion continuity remain. OS reduced-motion always overrides animation.
- The puzzle promotion dialog now shows piece images with larger choice buttons.
  It retains all four promotion choices and cancel/Escape behaviour.
- Appearance values are whitelisted in server account preferences and merge
  through the existing PostgreSQL account-preference flow. Guest values stay
  local. No database migration or engine-budget change is needed.

## Focused verification

- Live-switching piece sets, image loading, letters, setting persistence after
  reload, both arrow styles, English/Czech labels, laptop and mobile layout.
- Existing gesture regression: annotations, flipping, legal and illegal drags,
  click moves, outside drops and promotion.
- Existing motion regression extended with all three modes; castling,
  interruption, promotion and OS reduced-motion coverage retained.
- Puzzle promotions: queen, rook, bishop and knight; click/drag, cancel/retry,
  real black-pawn promotion puzzles, opponent underpromotion, touch and fullscreen.
- Account-preference validation and release-version checks; protected branch
  checks and a focused image-release validation are required before deployment.

The reported promotion failure was not reproduced in these cases. This release
improves the picker and records passing coverage; it does not claim that an
unidentified historical failure has a proven root-cause fix.

## Visual evidence

Fresh browser inspection compares the production baseline at 1280 × 720 with
the local polished build, then checks 390 × 844. Screenshots are development
artifacts in `test-results/board-appearance/`, excluded from Git. Screenshot
inspection is not an accessibility certification or a promise of zero regressions.
