# Evala: analysis → practice → follow-up

Research checked 31 October 2026. Competitor descriptions are product claims, not independently measured learning outcomes. No claim that this release beats competitors or causes Elo gains.

| Source | Observed capability | Decision for Evala |
|---|---|---|
| [Chess.com Game Review](https://support.chess.com/en/articles/8584089-how-does-game-review-work) | Guided key moments, explanation and retry | Link each recommendation to the actual game and move, opening the coach directly. |
| [Aimchess](https://aimchess.com/) | Weakness analytics, personal exercises and a study plan | Give the home page one next action backed by measured positions; reuse existing personal puzzles. |
| [Chessable Repertoire, March 2026](https://www.chess.com/blog/Chessable/chessables-new-repertoire-feature-turns-you-from-active-learner-to-architect-of-your-chess-growth) | Editable learning material and scheduled repetition | Mix due positions, verified own mistakes and related unseen bank positions; deduplicate equivalent boards. |
| [Chessigma](https://www.chessigma.com/) | Local analysis, imports, reports and training | Free local analysis alone is not differentiation. Improve the coherent learning workflow. |
| [Lichess features](https://lichess.org/features) | Studies, explorer, tablebases and training | Do not duplicate the whole platform; retain a focused personal-learning workspace. |

## Implemented scope

- Home recommendation uses only the selected player's completed reviews and sufficiently analysed decisions. Show actual sample counts and up to three source positions.
- Classify observed consequences (mate missed, mate allowed, material loss, or game phase). Never claim to know the player's thought process. A recurring label requires at least three examples in two games.
- A six-position lesson combines due review (including personal puzzles), own verified errors matching the focus, and related bank positions. A board appears at most once. Existing account-isolated training and preference storage remain the source of truth.
- Resume the same lesson on the same local calendar day, show completion and link to whole-position practice. Completing exercises is not evidence of higher Elo.
- On mobile, coach and analysis tabs precede the evaluation graph so the explanation is closer to the board.

## Intentionally not claimed

This release does not validate strength estimates, invent benchmark peers, infer psychological causes, or establish causal learning gains. Existing exact-position follow-through remains the conservative post-training signal. Expert courses, a full opening database and a professional repertoire editor remain separate future work.

## Next product measurement

Observe new users without help: first import → first reviewed position → personal lesson completion → later return. Before adding another training mode, establish where this sequence fails. No tracking SDK or new collection of personal data is introduced here.

## Board size and browser zoom

Remove viewport-height caps from analysis and puzzle board widths. Use the actual content container width to move secondary panels below the board; keep sidebar collapse useful. Extend the same width-first layout to practice and Maia boards. Verify actual Chrome zoom at 80%, 100% and 125%, height independence, sidebar behavior and horizontal overflow. At high zoom, vertical scrolling is preferable to shrinking the board to fit the viewport height.
