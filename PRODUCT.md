# Evala

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Implementation choice: Chromium Manifest V3 extension and deployable web app, JavaScript, esbuild, chess.js and bundled Stockfish.js 19 Full NNUE / Lite single-thread WebAssembly. Optional Node UCI backend with Docker and streaming NDJSON.

## Users and purpose

A Czech-speaking chess player wants an immediately readable evaluation next to the current Chess.com or Lichess board. The bar follows position changes, shows a signed score, and permits control over calculation depth and time.

The user also wants a complete review application: import PGN and public completed games by username, explore MultiPV lines and custom branches, classify moves including conservative sacrifice/brilliant detection, keep a local game library, and optionally move calculation to a free/academic server. Public import has been authorized for account Schweits; personal games must not be embedded into distributable artifacts.

## Capabilities and constraints

- User-pinned: vertical white/black bar left of the board; neutral at half; visible +3.0 or -3.2 score.
- Completely free local installation and computation; no accounts, API keys, telemetry or remote executable code required for local use. A personal server can require a token.
- Chrome/Chromium desktop extension, installable from a folder. Store publication is optional and subject to Google's developer registration fee.
- Standard chess only. Full position metadata must come from site state, FEN, or validated move reconstruction; never guess turn, castling, or en passant from piece placement.
- The sites prohibit engine assistance during a user's games against people. Intended uses include analysis, training and spectating where permitted.

## Product principles

The board stays primary. Make the score unambiguous. Explain missing position data instead of showing a guessed evaluation. Keep computation local and interrupt obsolete searches.
