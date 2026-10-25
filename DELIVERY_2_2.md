# Evala 2.2 — 25 October 2026

## Research and implementation

This is a qualitative review of discussions, not a representative survey. A complaint establishes a user's experience, not the absence of a feature from a competitor. Existing Lichess defence themes and Chessigma's conversion training are explicitly acknowledged.

| Topic | Evidence read | Delivered workflow |
|---|---|---|
| Why not my move? | [Chess.com users: explanations and alternatives](https://www.reddit.com/r/chess/comments/1jvz9oa), [review criticisms](https://www.reddit.com/r/chess/comments/1secnbs/taketaketake_game_review_is_a_slop_machine/) | Analysis → My notes → compare the played move/opponent reply with the recommended line; replay either on the board and change replies. Scores and search depths stay visible. |
| Mixed realistic positions | [Puzzle recognition does not transfer automatically](https://www.reddit.com/r/chess/comments/1wim29d/does_anyone_else_have_the_issue_where_puzzles/) | Practice room → Mixed positions: ordinary and precision-sensitive positions from the linked player's analysed games, without revealing the theme or solution. Equivalent moves are graded by an on-demand engine search, not exact UCI matching. |
| Analyse before the engine | [Devon Junior Chess: self-analysis first](https://www.exeterjuniorchess.devonjuniorchess.co.uk/content/how-analyse-your-games) | Per-game self-analysis switch conceals scores, arrows, badges, coach, lines and graph. Per-position thoughts and critical markers persist locally and to the account; engine can be revealed later. |
| Families of mistakes | [Chessable users: understanding and repetition](https://www.reddit.com/r/TournamentChess/comments/1sfqzua/how_and_why_do_you_use_chessable/), [Lichess theme definitions](https://lichess.org/training/themes) | Select forks, pins, loose pieces, defence, quiet moves or mating nets; adaptive rated puzzles avoid recent diagrams. These are selectable related themes, not an invented automatic diagnosis of the player's thought process. |
| Defensive decisions | [Lichess discussion](https://lichess.org/forum/lichess-feedback/feature-request-training-defensive-moves), [existing theme catalogue](https://lichess.org/training/themes) | Hold the position: near-equal/slightly worse own positions with a significantly worse second move; play up to eight own moves against engine replies. Existing rated defence puzzles remain available. |
| Convert an advantage | [Chessigma already offers conversion training](https://play.google.com/store/apps/details?id=com.chessigma.app&hl=en) | Convert an advantage: start from an own +2 to +7 position after move six; maintain an advantage against the engine for up to eight own moves, then inspect the line. |
| Practical opening repertoire | [Chessable discussion](https://www.reddit.com/r/TournamentChess/comments/1sfqzua/how_and_why_do_you_use_chessable/), [US Chess: ideas, structures and own games](https://uscf1-nyc1.aodhosting.com/CL-AND-CR-ALL/CL-ALL/2023/2023_04.pdf) | Group the first ten moves by actual position, count the player's moves and opponents' replies, open the source game, save a plan, and practise a position against engine recommendations. Frequency is never labelled theoretical correctness. |
| Manageable repetition | [Chessable backlog discussion](https://www.reddit.com/r/chess/comments/ciqxuv), [2026 repetition discussion](https://www.reddit.com/r/TournamentChess/comments/1sfqzua/how_and_why_do_you_use_chessable/) | Daily review budget (5/10/20/50), seven-day pause and resume. Guest and account grading enforce the limit; due positions are retained, not deleted or rescheduled artificially. UTC day boundary is stated. |
| Evidence of recurring weaknesses | [Aimchess beginner experience](https://www.reddit.com/r/chessbeginners/comments/1unoe25/im_500_elo_and_paid_for_aimchess_premium_so_you/), [players asking for contextual analysis](https://www.reddit.com/r/chess/comments/1jvz9oa) | Compare the latest ten analysed games with the preceding ten, separately by time control and phase. Display denominators and clickable error examples; withhold comparisons below minimum samples. Store and show recent practice results. Existing clock-pressure analytics remain available in Statistics. |
| Private coach feedback | [Requests for move-level annotations and selective sharing](https://www.reddit.com/r/chess/comments/1shy9zj/take_take_take_app_initial_thoughts/) | Select notes explicitly, export only those in a PGN, and import feedback for the same game. Comments merge without replacing the analysis. No automatic posting or public links. Standard PGN comments and Evala plan/critical markers are supported. |

## Brilliant classification correction

The former static test could nominate an unrelated hanging piece, ignored material captured by the played move, and checked only one acceptance. Account storage then trusted a client-supplied special label, so legacy false labels persisted.

Review v4 now requires the offered piece to be the one just moved; includes material won by that move; checks a legal exchange tree (up to eight capture plies); excludes equal trades, pawn moves, promotions, check evasions and forced moves; and requires depth 18 in the original/alternative/after evaluations. The best move must have a material sacrifice of at least two pawns, a meaningful gap to a non-winning alternative, a sound resulting position and a current certificate covering every nominated acceptance. At most three acceptances are searched; more means no special badge. Insufficient or failed evidence leaves the ordinary quality label.

Local loads and account reads/writes reclassify old badges from stored evaluations. Existing analysis is preserved. New certificates are checked again on the server instead of trusting the label. This is intentionally conservative Evala classification, not a claim to reproduce Chess.com's private algorithm. [Chess.com's published definition](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc) also requires a sound sacrifice and excludes positions won without finding it; its rating-dependent generosity is not copied.

## Practical limits

- Practice room needs the linked player's imported games and stored depth-14 analysis. It does not fabricate personal exercises without data. New checks target depth 18 with a 1.2-second limit; if depth 14 is not reached, no grade is recorded.
- Defence and conversion are bounded eight-move exercises, not a tablebase-certified draw or full-game win. Opening practice is an empirical personal repertoire, not a licensed authored course.
- Feedback sharing is a private file exchange, not simultaneous editing or a hosted coach invitation system. PGN necessarily includes moves and player headers; the UI states this before export.
- Long-term comparisons are descriptive, not causal evidence of improvement. Estimated game Elo remains explicitly uncalibrated as in 2.1.
- Account records cap position notes and drill attempts; existing account isolation, CSRF, revision conflicts and storage quotas apply.
- The companion evaluation-bar ZIP is unchanged. No engine assistance during live games is introduced.

## Bounded verification

- 16 focused tests passed in about one second: brilliant counterexamples/valid proof, legacy migration, PGN feedback privacy, review limits, practice pools, account persistence/isolation, plus a short real Stockfish MultiPV/cancellation check.
- One short browser sequence verifies notes/reload, selected PGN export, hidden-engine mode, comparison/replay, all four drills (including eight-move completion), repertoire, English mobile layout and review preferences. Engine responses in this UI test are fixtures; it does not claim strength validation.
- Existing short release sequence verifies onboarding, profile, lesson completion/reload and mobile English. Both UI sequences together take a few seconds; no large screenshot matrix or full-game analysis sweep was run.
- Manual desktop/mobile inspection and one Impeccable mechanical scan. User-selected cream is retained. Existing navigation animation warnings are outside this change; new controls reuse established colours and type sizes. Design sidecar drift was reported, not repaired as an unrelated task.

## Deployment

Deployed to [the existing Azure app](https://evala.bravestone-92178a1e.germanywestcentral.azurecontainerapps.io/study.html#/practice) from code commit `2b51b59`, after [successful CI](https://github.com/DavidSvajda/evala/actions/runs/40230576810).

Image: `ghcr.io/davidsvajda/evala@sha256:820f2f6c3ad5f41a4cbf4eba33df25ea697874b07682e500a90d72d85b8bda7d`.

A short isolated production-browser check confirmed the 2.2.0 manifest, Practice room with five modes, Czech/English switching, analysis notes route, retained Google configuration and no browser errors. It did not access a real user's library or run production game analysis. Google sign-in and persistent account configuration were preserved. Deployment and verification receipts are in ignored `.local-data/deployment/deployment.json` and `delivery-2.2.json`.
