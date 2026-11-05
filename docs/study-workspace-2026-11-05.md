# Evala 2.15 — research, implementation and assessment

Research date: 5 November 2026. Baseline: deployed Evala 2.14.1. This review
combines public product interfaces, official documentation and the player
discussions collected in the preceding market review. Paid capabilities were
not independently tested behind every subscription. Scores are editorial
judgements, not measured learning outcomes or market-share estimates.

## What to combine

| Reference | Strongest relevant idea | Evala implementation |
|---|---|---|
| [Chess.com Game Review](https://support.chess.com/en/articles/8584089-how-does-game-review-work) | Critical moments, coach, trying alternatives | Three highlighted episodes or all grouped episodes, existing retry and variation playback, legal engine-line explanations |
| [Lichess](https://lichess.org/features) | Strong local analysis, open study workflow, persistent variations | Existing local Stockfish 19, PGN/FEN, saved variations and sharing; laptop board/results layout corrected |
| [Chessable MoveTrainer](https://support.chess.com/en/articles/10319267-when-will-the-variations-be-ready-for-my-review) | Recall at spaced intervals | Editable repertoire entries with a transparent graduated recall schedule |
| [Chessable bot practice](https://www.chess.com/blog/Chessable/train-against-bots-the-highly-requested-feature-is-here) | Continue learning through practical play | Existing practice opponent plus eight original endgame exercises against the local engine |
| [Chessbook](https://wiki.chessbook.com/spaced-repetition) | Shared recall across transposed positions; repertoire recall differs from chess quality | Cards keyed by position, side, castling and en-passant state; all stored alternatives accepted. Evala uses graduated intervals, not Chessbook's FSRS |
| [Aimchess](https://aimchess.com/) | Diagnose personal patterns and prescribe practice | Existing personal daily lessons, plus recurrence of practised themes in later analysed games and a rolling weekly practice goal |
| [ChessTempo](https://www.chesstempo.com/manual/en/manual.html) | Own opening material, notes, exports and configurable study | PGN import/edit/export, side selection, plans, recall and original endgame foundations |
| [Chessigma](https://www.chessigma.com/supercoach) | Connected report, personal plan and training tools | Review → personal practice → study material; local review itself is a shared market capability, not a unique Evala claim |

The goal is a connected study workspace. A feature present on a specialist site
does not automatically belong on every screen of Evala. Opening explorers,
large licensed course catalogues, matchmaking and authenticated classrooms
remain distinct projects.

## Player signals

- [An Aimchess beginner's review](https://www.reddit.com/r/chessbeginners/comments/1unoe25/im_500_elo_and_paid_for_aimchess_premium_so_you/)
  asks for a reusable principle and clear next action instead of a verdict and
  many competing trainers. Evala now reduces initial information, exposes one
  import destination, and explains what the opponent can do in a legal line.
- [Game Review discussion](https://www.reddit.com/r/Chesscom/comments/1wpq9jp/does_anyone_else_find_game_review_kinda_bad/)
  describes missing context across a series of mistakes. Evala groups nearby
  same-theme decisions, explicitly without claiming a common psychological cause.
- [Chess.com forum feedback](https://www.chess.com/forum/view/site-feedback/when-a-game-is-reviewed-is-there-an-alternative-choice-to-replace-explain)
  shows the importance of preserving the current move when exploring a line.
  Existing return-to-game and retry behaviour is preserved.

These are selected qualitative signals, not a representative demand survey.

## Shipped functionality

### Review and entry flow

- A normal laptop keeps the board and result panel together once the available
  content width reaches 780px, independent of sidebar width or browser zoom.
- Home recommendations retain one next action. Their detailed evidence is
  available in a disclosure, and importing opens the library directly.
- Engine presets and device performance remain prominent. Technical settings
  are in Advanced settings.
- Review-time estimates and the new review-scope controls support English and
  Czech. Existing score/depth/time budgets are unchanged.
- Three key episodes are the default; all grouped moments remain available.
- Coach principles use legal, sufficiently deep supplied engine continuations.
  Material capture is described as occurring in that line, not as a proven net
  gain or a claim to understand the player's thoughts.

### My study

Open Practice room → My study.

- Up to 24 editable main lines, with a maximum of 80 half-moves per entry.
  Branches can be stored as separate entries. PGN export remains portable.
- Transposed positions share recall. Remembered moves return after graduated
  intervals of 1, 3, 7, 14 and 30 days; a miss returns after 10 minutes.
- A legal move outside the saved repertoire is a recall miss, not an automatic
  engine mistake. Promotion offers queen, rook, bishop and knight explicitly.
- Eight original foundations: queen mate, rook mate, two rooks, opposition,
  square rule, rook pawn/stalemate, seventh-rank pawn and active rook defence.
  The local engine replies for up to 12 player moves. This is practice, not a
  tablebase certificate or proof of mastery.
- Up to 40 exercises with a position, question, optional author line and an
  answer. A recipient imports explicitly and can return an answer link.
- Shared exercise contents live in the URL fragment. The fragment is not part
  of the page HTTP request. Anyone holding the link can read it; it does not
  authenticate its author or implement a classroom permission system.
- Weekly goals are optional, from one to seven practice days. Counts describe
  activity; they do not promise Elo gains.
- After-practice recurrence groups related error themes by phase and time
  control in later analysed games. It reports both errors and analysed own
  decisions, with links to examples. Decisions are not inferred tactical
  opportunities, and observational changes do not prove training caused them.

### Persistence and safety

Study data is stored in account preferences in the existing private PostgreSQL
account record (JSONB), not in server JSON files. Guest copies remain in the
current browser. Existing authenticated account and CSRF boundaries apply.

Server-side validation replays PGNs and exercise lines, bounds fields and counts,
and rejects a study payload above 45 KB. The client reserves space within the
existing account request limit with a 44 KB study cap. Arbitrary identifiers,
foreign fields and illegal positions do not become trusted data.

Account transitions cancel exercises and clear the old account's local study
copy and in-memory cache. The next account cannot inherit a guest or another
account's study state. Concurrent edits of this preference field use the
existing account preference last-write behaviour; this is not a collaborative
real-time editor.

PGNs are validated on load/save and cached between moves. No new hosted engine,
paid AI API, external font or runtime design dependency was added.

## Design tooling

Impeccable was excluded for this release. Alternatives discovered included
Product Design, MagicPath and Figma. Product Design requires a separate user
connection; it was suggested, not claimed as connected or used.

[UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) was used
locally from its official repository, outside application assets and the code
index. Responsive layout, progressive disclosure, explicit feedback, keyboard
controls and theme consistency informed implementation. Existing cream/sage
and forest-dark visual identity is retained. No claim is made that any plugin
is objectively the best design tool.

## Focused verification

- Pure-model tests: transpositions, alternative moves, all promotion pieces,
  recall intervals, payload validation, exercise round-trips, legal endgames,
  evidence-grounded explanations, grouped moments and chronology/ownership of
  themed recurrence.
- Browser regression: saved repertoire/reload, recall, engine reply, fresh-load
  fragment exercise import, knight promotion, answer persistence, English/Czech,
  light/dark, 375px phone, landscape, 1280px laptop and Advanced settings.
- Existing review, learning, account-preference, startup and version regressions.
- Protected GitHub quality/security/database checks and tested image validation
  remain mandatory before deployment.

## Provisional editorial scores

Weights: visual 10%, usability 15%, review 20%, training 25%, personalization 15%,
breadth of study tools 10%, free access 5%. Reassess after real player sessions.

| Evala aspect | 2.14.1 | 2.15 |
|---|---:|---:|
| Visual design | 8.0 | 8.2 |
| Usability | 6.5 | 7.7 |
| Game review | 7.5 | 7.8 |
| Training | 7.5 | 8.0 |
| Personalization | 7.0 | 7.5 |
| Breadth | 6.5 | 7.5 |
| Free access | 9.5 | 9.5 |
| Overall | 7.3 | 7.9 |

Previous comparison remains provisional: Chess.com 8.7, Lichess 8.4, Chessable
8.2 within its study role, Aimchess 8.0, Chessigma 7.9, ChessTempo 7.8.
No new user-retention or learning-effectiveness experiment was performed.

The next evidence should be successful first reviews, completed personal
practice, return visits and independently checked explanations. Larger feature
counts alone do not establish market leadership.
