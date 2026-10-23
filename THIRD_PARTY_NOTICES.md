# Third-party software and artwork

Evala is distributed under GPL-3.0-or-later. See LICENSE. The original application source is included separately in the release source archive.

- **Stockfish.js 19.0.1 / Stockfish 19 Full NNUE and Lite single-thread**, Nathan Rugg, Chess.com LLC and the Stockfish contributors. GPL-3.0. Unmodified engine JS and WASM are bundled. License: engine/COPYING.txt in the extension. Exact npm provenance, integrity and source revision: engine-source.json. Corresponding engine source archive is supplied with the release in engine-source/. Upstream build instructions are in that source and engine/UPSTREAM-README.md. https://github.com/nmrugg/stockfish.js
- **chess.js 1.4.0**, Jeff Hlywa and contributors, BSD-2-Clause. https://github.com/jhlywa/chess.js — bundled copyright and license are preserved in generated JavaScript notices.
- **Manrope**, Mikhail Sharanda and contributors, SIL Open Font License 1.1. Bundled font files and full license: fonts/OFL.txt. https://github.com/sharanda/manrope
- **Cburnett chess pieces**, Colin M. L. Burnett, distributed through Lichess under GPL-2.0-or-later. SVGs are unmodified; source: https://github.com/lichess-org/lila/tree/master/public/piece/cburnett . Used only on the demonstration board. The license permits distribution under GPL-3.0-or-later.

Build tools are development dependencies and are not shipped as application runtime code. Evala is an independent project and is not affiliated with Chess.com or Lichess.

Move accuracy uses the published per-move transformation described at https://lichess.org/page/accuracy . Evala reports a simple mean of analyzed move scores, not Lichess's volatility-weighted whole-game accuracy and not Chess.com's proprietary accuracy. Brilliant/sacrifice labels are original conservative heuristics and must not be presented as official platform labels.
# Native server distribution

`Dockerfile.azure` uses the official Stockfish 19 Linux x86-64 universal release (GPL-3.0-or-later), commit `edb0d9db6731067ec50ce619ff372b463bc4dd5d`. SHA-256 of the official distribution is `9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f`. Its complete original archive, including corresponding source and license, is retained in the server image and served at `/engine/stockfish-19-native-distribution.tar.gz`.

Upstream: https://github.com/official-stockfish/Stockfish/releases/tag/sf_19

