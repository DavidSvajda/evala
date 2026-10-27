# Evala architecture

Evala is a browser application and Chromium companion extension, with an optional Node server. The frontend stays plain JavaScript, HTML and CSS. esbuild bundles the application; Stockfish 19 runs as a local WASM worker or a pinned native server process.

## Server boundaries

| Module | Responsibility |
|---|---|
| `server/index.mjs` | Composition, request routing and the outer error boundary |
| `server/http.mjs` | Typed public errors, bounded JSON bodies and JSON responses |
| `server/security.mjs` | Origin policy, cookie attributes, timing-safe comparison and bounded rate counters |
| `server/static-files.mjs` | Real-path containment, public file types, conditional requests and streaming assets |
| `server/analysis-api.mjs` | Validated position/history requests and shared engine slot limits |
| `server/public-reviews.mjs` | Anonymous technical sessions, review queue, computation budget and streaming |
| `server/account-identity.mjs` | Google token verification, nonce replay protection, session/CSRF checks and rotation |
| `server/account-library.mjs` | Game validation, immutable game revisions and account storage quotas |
| `server/account-training.mjs` | Server-authoritative puzzle selection and grading |
| `server/account-preferences.mjs` | Allowed preference fields and value bounds |
| `server/account-deletion.mjs` | Resumable cleanup after immediate session revocation |
| `server/document-store.mjs` | Private Azure Blob or local-file storage, atomic writes and optimistic transactions |

No SQL database is used. Storage keys are hashed, and game keys include the authenticated account ID. Uploaded files are never placed in the public asset directory. The default production topology remains one application replica and one engine slot.

## Browser boundaries

`src/study/app.js` coordinates the library and analysis board. `platform.js` coordinates navigation, preferences, dashboard and puzzle interactions. Account DOM/lifecycle actions live in `account-panel.js`; notation, summary and game-row markup live in `src/study/views/`. Reusable icons, chess previews and HTML escaping live in `src/ui/`.

Chess rules, result validation, move classification and training selection remain separate from their views. `src/core/engine-result.js` and `src/core/game-analytics.js` serve server and browser without importing browser transport or rendering. `review-stream.js` defines the versioned incremental transport. `uci.js` serializes engine commands, handles cancellation/readiness, preserves Hash within a game and bounds scoped result reuse.

Guest and account IndexedDB libraries remain separate. A server-issued account generation invalidates old pending data after account deletion/recreation. Requests are bound to the expected account/generation; client code discards responses after identity changes. Browser preferences never contain the Google ID token or account session cookie.

## Building and maintaining

- Use Node 22.13+ and `npm ci` with the committed lockfile.
- `npm run lint` checks undefined references, dead variables and unsafe constructs; `npm run format:check` enforces source formatting.
- `npm run build` rejects private files, symlinks, credential patterns and static inline styles/event handlers in public assets before bundling.
- `npm test` is the small unit/integration suite. The release workflow adds three short browser sequences; it does not run the large historical screenshot suites.
- `npm run build:bar` packages the companion extension. `npm run package` also creates web/source archives. New configuration files are included in the source archive.

HTML contains document structure, CSS files contain static presentation, and JavaScript changes runtime state. Dynamic board coordinates and evaluation-bar values still use DOM style properties. Those are computed application state, not embedded stylesheet blocks.
