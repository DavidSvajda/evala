# Extension engines (2.7.0)

Evala's bar offers Stockfish 19 Lite (default, smaller network) and Stockfish 19 Full NNUE (larger network). Both are bundled, run locally in a single-threaded worker, and require no server/account. Switching models terminates the old worker. Time, depth and Hash remain bounded. Hash is the position cache, not total process memory. Profiles control calculation effort, not opponent Elo.

Install `release/evala-bar-2.7.0.zip`: extract it to a permanent folder, open `chrome://extensions`, enable Developer mode and use Load unpacked. Select the folder containing `manifest.json`. For an existing installation, keep its folder path, replace its files, click Reload in Chrome and refresh chess tabs. `dist/` is the complete application extension; `dist-bar/` contains only the bar. Neither updates an installed unpacked extension automatically.

## Human-like play research, 31 October 2026

[Maia-3](https://github.com/CSSLab/maia3) provides rating-conditioned human move predictions through UCI; its 5M model is the upstream CPU starting point. Its WDL/compatibility centipawns describe predicted human outcomes, so they must not silently replace Stockfish evaluation-bar scores. The upstream repository is AGPL-3.0; deployment needs corresponding-source and model-license handling.

Recommended follow-up: a separate practice opponent using Maia for moves and Stockfish for feedback. An attacking/sacrifice style would be an additional tested candidate-selection policy, not a capability established by Maia's human-move prediction. This release does not bundle or claim a working Maia opponent. See also the [upstream runtime documentation](https://raw.githubusercontent.com/CSSLab/maia3/main/README.md).
