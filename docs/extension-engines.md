# Extension engines

Evala's bar offers Stockfish 19 Lite (default, smaller network) and Stockfish 19 Full NNUE (larger network). Both are bundled, run locally in a single-threaded worker, and require no server/account. Switching models terminates the old worker. Time, depth and Hash remain bounded. Hash is the position cache, not total process memory. Profiles control calculation effort, not opponent Elo.

Version 2.18.4 also bundles Rodent V 1.2.03 with the upstream Mikhail Tal NNUE personality (`tal_nnue.txt`). Its network is embedded in local WebAssembly; both the evaluation bar and move arrow use Rodent's result. The browser build uses scalar NNUE, so its reached depth depends strongly on hardware and position. A 3-second start-position search reached depth 8 on the release test machine; this is not a fixed target or an Elo measurement. When the position changes or analysis pauses, the Tal worker is terminated and restarted because Go WebAssembly cannot consume UCI `stop` while its search occupies the browser worker. Source and license are bundled in `engine/rodent-source.zip`.

Install `release/evala-bar-2.18.4.zip`: extract it to a permanent folder, open `chrome://extensions`, enable Developer mode and use Load unpacked. Select the folder containing `manifest.json`. For an existing installation, keep its folder path, replace its files, click Reload in Chrome and refresh chess tabs. `dist/` is the complete application extension; `dist-bar/` contains only the bar. Neither updates an installed unpacked extension automatically.

## Human-like play research, 31 October 2026

[Maia-3](https://github.com/CSSLab/maia3) provides rating-conditioned human move predictions through UCI; its 5M model is the upstream CPU starting point. Its WDL/compatibility centipawns describe predicted human outcomes, so they must not silently replace Stockfish evaluation-bar scores. The upstream repository is AGPL-3.0; deployment needs corresponding-source and model-license handling.

Recommended follow-up: a separate practice opponent using Maia for moves and Stockfish for feedback. An attacking/sacrifice style would be an additional tested candidate-selection policy, not a capability established by Maia's human-move prediction. This release does not bundle or claim a working Maia opponent. See also the [upstream runtime documentation](https://raw.githubusercontent.com/CSSLab/maia3/main/README.md).
