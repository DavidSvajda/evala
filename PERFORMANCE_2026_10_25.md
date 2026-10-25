# Analysis performance — 25 October 2026

Search limits, engine/NNUE, requested MultiPV, refinement depth/time and brilliant proof thresholds are unchanged. Azure remains at 2 vCPUs / 4 GiB / one engine slot; no paid capacity increase is introduced.

## Findings and changes

- Stockfish 19's [Hash option callback](https://github.com/official-stockfish/Stockfish/blob/sf_19/src/engine.cpp) invokes [TT reallocation/clear](https://github.com/official-stockfish/Stockfish/blob/sf_19/src/tt.cpp) even at the same size. Evala sent it before every position. Configure options only when changed, retaining TT work within a game. Explicit `ucinewgame` / `isready` boundaries reset search state between games or session scopes, following the [UCI protocol](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html).
- A bounded result cache (64 entries, at most 2 MiB, 15-minute expiry) is scoped to the server-issued technical session or owner. It requires exact FEN, full move history and all search settings. Every requested PV must reach the requested depth; time-capped shallow results are not reused. Responses are cloned. No cross-session result reuse or quota bypass is introduced.
- Adjacent critical moves share an identical refined position. Compute each such position once per review; preserve full history and the same deeper search limits.
- Protocol v2 transmits changed evaluations/classifications, then one final full snapshot. Old clients still receive the old protocol, and new clients support old servers. Incremental scores now reach the UI while the game is being processed. The browser avoids rebuilding the entire board/notation/graph more often than once per 180 ms; numerical progress stays live and completion always repaints.
- Reclassification updates only moves whose before/after/previous evaluation changed. Final labels are checked against a full recalculation.

## Small measurements, not a universal speed claim

One eight-position diagnostic on local single-thread Stockfish 19 WASM, depth 12 / 400 ms / MultiPV 2 / Hash 64 MiB, excluding process boot:

| Scenario | Old behaviour | Optimized |
|---|---:|---:|
| First calculation | 644 ms | 737 ms |
| Identical repeated calculation | 700 ms / 8 searches | 1 ms / 0 searches |
| Minimum achieved depth / PV count | 12 / 2 | 12 / 2 |

The initial measurement did **not** demonstrate faster fresh search. Keeping TT state changes move ordering and search work, and is not a fixed wall-clock speed multiplier. This diagnostic is not an Azure benchmark, a statistically stable estimate, or a chess-strength study. At a hard time cap, additional useful search work can improve the result without shortening that cap. Engine scores may differ slightly due to normal heuristic search.

A deterministic transport fixture based on the public demo game transmitted about 387 kB of repeated snapshots versus 35 kB of deltas, a 91% reduction. Final scores, PVs and classifications reconstruct identically. A critical-move fixture eliminates duplicated refinement searches while preserving requested depth, time, MultiPV and full history.

The [Stockfish FAQ](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html) notes that extra PVs consume search resources and recommends adequate CPU/Hash. We retain MultiPV because Evala uses alternatives for explanations, training and special classifications. A blanket lower depth, smaller time budget, or one-line-only analysis would change that product contract.

Verification is bounded: five focused optimization tests, two short public-API tests, a brief real engine check and the short release browser flow. `scripts/benchmark-analysis.mjs` reproduces the limited A/B diagnostic without personal games.
