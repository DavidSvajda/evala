# Human practice (2.8.0)

Practice room → Play Maia provides a complete training game from the starting position or the current review position. Controls: model rating 800–2400, natural/attacking style, White/Black. The current draft is stored locally under the current Evala identity. Explicit Save and open Review imports PGN through the existing account-isolated library. PGN download is available without sign-in. Stockfish analysis remains separate from Maia move prediction.

## Model and provenance

- Official source: CSSLab/maia3, commit `1e13597c42d4858b7cfd7cfdae01e297263364b2`.
- Source archive SHA256: `06cc1d77eac19b6cb4228c7ca6d8971c97d0284b88b3208b39191c5ca61af080`.
- Model: UofTCSSLab/Maia3-5M, revision `b6559de2398d7140b985f28fd2c19fb5e47ddabe`, `maia3-5m.pt`.
- Model SHA256: `ba14208b2992d85502f5fb501934abf6aaaeb355e9f3fdf90e326911f562524f`.
- The source is AGPL-3.0. The upstream model card refers code/weight licensing to that repository. Preserve the upstream license/card; do not relabel model weights as Evala's own work.
- `/human-source/maia3-source.tar.gz` provides complete upstream source. `/human-source/maia-runtime.py` provides the AGPL adapter source. The JavaScript service communicates with this separate process using bounded JSON messages.

Docker builds a CPU-only runtime with a local checkpoint. Safe tensor-only loading stays enabled; the runner never accepts a user-selected model/path or downloads anything during inference. Hugging Face download dependencies are omitted from the offline runtime. No external AI API is called, and no training data is added to the model.

## Styles and limits

Natural samples the Maia policy conditioned on the selected rating. This is not a calibrated opponent Elo. Attacking is a heuristic hybrid: intersect Maia candidates with up to five Stockfish candidates, require depth ≥12 and a score within 0.80 pawns of the first line, then prefer checks, captures and material offers. If sufficiently analysed candidates are absent, return natural Maia play. The policy cannot promise sacrifices or exact human strength. It does not classify the move as Brilliant.

HTTP requests require an owner token or the existing public session, validated legal history (≤600 plies), a fixed style and bounded rating. Maia uses the shared engine lease, rate limits and persistent daily compute allowance. Initialization/turn deadlines kill stalled workers; the idle process is stopped after two minutes. One CPU thread is used for inference. Its score is never substituted for the evaluation bar.

## Local server setup

Install the pinned upstream source into a Python 3.12 CPU environment, download the pinned checkpoint and verify its SHA256. Set `MAIA_PYTHON` to that environment's Python executable and `MAIA_MODEL` to the checkpoint, then run `npm run server`. This runner requires PyTorch, NumPy and python-chess; see `server/maia-requirements.txt` and `Dockerfile.azure` for the pinned environment. The hosted application includes this setup. A standalone browser extension does not include a Python model runtime.

## Verification

Tests cover illegal histories, rating/style bounds, required session, legal replies, material-offer preference versus excessive evaluation loss, both player sides/styles, draft restoration, save-to-review and responsive CS/EN UI. Browser tests isolate inference with fixtures; the release container additionally runs real pinned Maia inference for both styles before image publication and vulnerability scanning.

## Offline Chrome extension

Select Maia-3 in the extension engine selector. Maia-3 5M runs in a dedicated module worker through ONNX Runtime Web 1.24.3 WASM, one CPU thread, no network inference. Rating and natural/attacking settings are persisted. The numeric bar remains Stockfish Lite; the human move is displayed in the status panel. A standalone FEN pads history with the current position, as upstream does when history is unavailable. The ONNX export script decomposes RMSNorm into equivalent arithmetic. Model SHA256: `dd6ad82a106106d74ca18ece93fb7af856b709e859ed15297b6a4d164e472a4d`. Source weights and license remain those of Maia-3, not a newly trained proprietary model.
