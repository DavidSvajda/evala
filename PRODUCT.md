# Evala

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Implementation choice: Chromium Manifest V3 extension and deployable web app, JavaScript, esbuild, chess.js and bundled Stockfish.js 19 Full NNUE / Lite single-thread WebAssembly. Optional Node UCI backend with Docker and streaming NDJSON.

## Users and purpose

A Czech- or English-speaking chess player wants a personal analysis and training workspace, from beginner to advanced. The user pinned cream surfaces and a sage/green board, separate pages, collapsible navigation and Google-first sign-in. The companion extension keeps an immediately readable evaluation next to the current Chess.com or Lichess board.

The user also wants a complete review application: import PGN and public completed games by username, explore MultiPV lines and custom branches, classify moves including conservative sacrifice/brilliant detection, keep a local game library, and optionally move calculation to a free/academic server. Public import has been authorized for account Schweits; personal games must not be embedded into distributable artifacts.

The hosted web is shareable with friends: enter their own username, fetch 10–100 completed games, select a subset, review it in sequence on the server, and receive evidence-based priorities and training positions. No manual API token is required for this flow. Public computation uses an expiring technical session, a shared engine queue and bounded quotas. A separate owner token continues to protect administrative/extension access. The active review requires the browser tab to stay open; completed games persist locally.

## Capabilities and constraints

- User-pinned: vertical white/black bar left of the board; neutral at half; visible +3.0 or -3.2 score.
- Local installation and computation require no account. Optional Google identity syncs an isolated library, notes, preferences and training history through a private persistent store. Guest data remains separate. No advertising or analytics trackers.
- Training ships 4,459 rated CC0 Lichess puzzles, adaptive selection, scheduled review and verified positions from the player's analysed mistakes. Individual puzzle difficulty and personal training rating remain distinct.
- Per-game strength is an explicitly uncalibrated heuristic anchored to the PGN rating and withheld when evidence is insufficient. Move classifications are Evala's own.
- Chrome/Chromium desktop extension, installable from a folder. Store publication is optional and subject to Google's developer registration fee.
- Standard chess only. Full position metadata must come from site state, FEN, or validated move reconstruction; never guess turn, castling, or en passant from piece placement.
- The sites prohibit engine assistance during a user's games against people. Intended uses include analysis, training and spectating where permitted.

## Product principles

The board stays primary. Make the score unambiguous. Explain missing position data instead of showing a guessed evaluation. Keep computation local and interrupt obsolete searches.
