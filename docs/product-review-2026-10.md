# Evala: review and training product audit

Research checked 28–29 October 2026. This is a feature comparison, not a claim of feature parity or a comparative accuracy benchmark. Competitor UI preference is subjective; Evala preserves its parchment/sage design and dark counterpart.

## Market evidence and implementation mapping

| Source | Relevant workflow | Evala implementation / remaining boundary |
| --- | --- | --- |
| [Chess.com Game Review](https://support.chess.com/en/articles/8584089-how-does-game-review-work) | Guided key moments, explanations, retry, voice, candidate playback | 2.4 adds a dedicated Coach tab, side filter, chronological moments, best/reply playback and verified alternate solutions. Browser speech already exists. No claim to reproduce the proprietary coach. |
| [Chess.com Game Rating](https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review) | Single-game performance relative to player rating | Evala remains an explicitly experimental, rating-anchored heuristic. Current-score recomputation replaces stale cached labels; both position evaluations must be sufficiently deep. No public coefficient formula or independent ground truth was supplied, so parity cannot be validated. |
| [Lichess features](https://lichess.org/features) | Engine, study, insights, opening exploration, learning from mistakes | Existing local/server engines, analysis branches, notes, annotated PGN export/import, insights and personal training. A global master database and seven-piece tablebase service are not implemented. |
| [Aimchess](https://aimchess.com/) | Aggregate weaknesses and personal training | Existing phase/time/opening/color statistics, example positions, personal lessons, defense and conversion practice. No claim of peer-population benchmarks without a representative dataset. |
| [Chessigma](https://www.chessigma.com/) | Username import and local analysis | Both already supported. Evala also offers bounded shared server computation. Local computation does not use the shared cloud compute allowance. |
| [DecodeChess](https://decodechess.com/faq/) | Explain ideas and show supporting variations | Existing tactical probes, positional facts and engine-backed move comments; Coach now exposes playback directly. Explanations are deterministic and limited, not an unrestricted conversational AI or full causal account of a position. |
| [Chessbook](https://chessbook.com/) | Opening repertoire and practice | Existing personal opening positions and practice from imported games. No licensed course catalog, master-game library, population coverage model, or full editable repertoire tree. |
| [Chessbook soft fails](https://wiki.chessbook.com/soft-fails) | Distinguish a sound move from a remembered move | Coach retries now accept sufficiently deep, near-equivalent MultiPV alternatives. Unsearched moves are explicitly unknown, not automatically wrong. |
| [Noctie](https://noctie.ai/faq/) | Human-like sparring and recurring mistake practice | Existing adaptive puzzles, scheduled review and engine-based practice. Stockfish is not a human-like learned opponent; Evala does not claim otherwise. |

## Product boundaries

The coherent workflow is import → review → explain and compare → retry → personal practice → aggregate progress. These features work with local or remote review output. Purchased competitor lessons, their proprietary models and user databases are not copied. Full duplication of every competitor is not delivered by this release.

Priorities after this release: validated rating calibration by platform/time control, repertoire editing with persistent branches, a licensed/open reference-game dataset, and evidence linking practice to subsequent game decisions. These require separate data and product work rather than fabricated metrics or buttons without functionality.

## Performance audit

Previous issues: the WeakMap retained estimates after an analysis object was refined; imported move accuracy could be stale; only the before-position depth was checked, and missing depth passed a numeric comparison. Version 2 recomputes move quality from current before/after scores, validates finite scores and both depths, tolerates invalid FEN by withholding that sample, and preserves minimum evidence and repeated-position filtering.

The coefficients remain uncalibrated. A nicer-looking number does not establish accuracy. The existing calibration script uses held-out players but their PGN ratings are not ground truth for individual-game strength. The UI therefore uses Estimated performance and Experimental estimate rather than implying an official Elo. No data was collected from private accounts for this audit.

## Verification

Unit regression checks cover stale marks, in-place refinement, missing after-depth, both colors, legal bounded playback, chronological side-filtered moments, equivalent alternatives and unknown moves. Browser coverage checks guided navigation, replay, arrow-key scrolling, retry hint concealment, CS/EN, and desktop/mobile layout. Native engine and public-session integration remain required in the release image workflow, followed by vulnerability/secret scanning before image publication.
