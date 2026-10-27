# Security boundaries and operation

This project has not received an independent penetration test or a commercial security certification. Automated checks and a timeboxed review reduce known risks; they do not establish that a service is invulnerable.

## Authentication and data

- Google ID tokens require a valid RS256 signature, issuer, configured audience, expiry, verified email and matching single-use nonce. The application requests identity, not access to Google mail or documents.
- Account sessions use random 256-bit secrets. Only the secret's hash is used in storage keys. HTTPS cookies are `__Host-` bound, Secure, HttpOnly, host-only, with Path `/` and explicit SameSite. State-changing account requests also require a session CSRF token.
- A successful login rotates the current browser's session. Session schema validation rejects records issued before the host-cookie migration. Existing users may need to sign in once after the 2.2.2 release; their libraries remain stored.
- Account mutations check the current authentication epoch inside the storage transaction. Deletion rotates it before cleanup, blocking concurrent stale writes and all old sessions. Cleanup is idempotent and can finish on a subsequent verified login after interruption. The final account document is a null compare-and-swap tombstone, containing no profile, game or training data.
- Frontend requests identify their expected account and generation. Late responses, old saves and old guest-migration tasks are rejected after identity changes. A recreated account clears pending data/preferences from its previous generation.
- Public evaluation sessions are separate from Google accounts. Anonymous computation is bounded by queue, rate and global compute quotas. It does not grant account/library access.

## Input, files and execution

- JSON has bounded byte size, object shape and content type. Game data is rebuilt from validated PGN; preference fields and engine settings are allowlisted. FEN line breaks/null bytes and malformed UCI moves are rejected.
- The process starts a fixed engine executable with `spawn`, without a shell or user-controlled command text. The service has no SQL query layer.
- Static files are restricted to the public root after `realpath`, including symlink resolution. Dotfiles, Windows separators/alternate streams and unknown file types are rejected. Large WASM/source files are streamed instead of buffered per request.
- Unexpected errors produce a generic response, never an SDK stack or connection string. The outer HTTP boundary catches rejected handlers. Logs record a bounded error category, not the submitted data or credentials.
- Output inserted into dynamic HTML uses the shared escaping helper. Script CSP prohibits arbitrary inline JavaScript; the existing WASM and Google Identity requirements remain allowed. Static HTML has no inline styles or event attributes. Runtime styles remain necessary for board geometry and Google controls.

## Secrets and delivery

API owner credentials and the storage connection are Azure Container Apps secret references. Google Client ID is public configuration. `.local-data`, virtual environments, `.env` variants and private-key files are excluded from Git/container contexts and forbidden by release guards. Source packaging uses an explicit directory/root-file list and rejects symlinks/private file patterns.

CI actions are pinned to immutable commits. Package installation uses the lockfile; production runs as an unprivileged container user. Stockfish's distribution checksum and corresponding GPL source are retained. The Azure storage account was checked with public blob access disabled, HTTPS-only access enabled and minimum TLS 1.2; ingress requires HTTPS.

## Limits requiring operational ownership

Protect Azure/GitHub administrators, deployment credentials and the user's device. A compromised browser/host, stolen current bearer cookie, malicious privileged operator or supply-chain compromise cannot be ruled out by application tests. The manual custom-server owner token remains an explicit privileged tool and must not be shared.

Public anonymous compute can still be exhausted within its published quota. Internet-scale abuse protection belongs at the ingress/WAF or an authenticated product policy; adding a CAPTCHA or mandatory login would change the current product. Expired transient session/nonce storage needs operational retention/cleanup beyond lazy validity checks. Azure's seven-day soft delete is not an independent disaster-recovery backup; a full account restore exercise and an independent backup remain operational follow-ups.

The repository and bundled Stockfish are GPL-3.0 licensed. Commercial distribution must retain the applicable license/source obligations; this refactor does not convert the project to proprietary licensing.
