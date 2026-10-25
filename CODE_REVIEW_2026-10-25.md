# Code review and production refactor — 25 October 2026

Scope: application/server source, extension message boundaries, HTTP/auth/storage handling, public assets, build/source packaging and deployment workflow. Preserve existing layout and product features; include the preceding analysis-performance changes. This is a timeboxed engineering review, not a claim of 100% security or an independent penetration test.

## Findings addressed

| Priority | Finding | Resolution / evidence |
|---|---|---|
| P1 | An account could be deleted while another request was writing; interrupted cleanup had no resumable state. | Revoke the authentication epoch first, then perform idempotent cleanup. Verified login can complete an interrupted deletion. Concurrent-write and failed-cleanup tests pass. |
| P1 | Same-ID account recreation and late browser responses could carry old pending data into the new generation. | Server-issued generation, request identity binding, guarded client responses/saves/migration and generation-aware local cache reset. Browser check preserves guest data and rejects old data. |
| P2 | Cookies lacked host-prefix binding; rotation left the previous browser session alive. | Secure `__Host-` cookies, session-version migration and rotation/revocation tests. One renewed login may be required. |
| P2 | Lexical static-path checks did not resolve symlinks; static large files were buffered entirely. | Real-path containment, blocked hidden/private file types, streamed assets, HEAD/ETag and traversal/symlink tests. |
| P2 | Async HTTP exceptions outside route-local catches could become unhandled rejections. Error handling/JSON bounds were duplicated. | Shared typed errors/byte limits and one outer request boundary. Private-error and malformed-input tests prove continued availability. |
| P2 | Rate-counter maps could exceed their intended size while entries were unexpired. | Shared limiter with a hard key cap and expiry tests. |
| P2 | FEN accepted line separators before constructing UCI commands. | Explicit newline/null rejection and canonicalized API positions; command-injection inputs are tested. |
| P2 | Public/source packaging had no enforced secret/symlink/inline-style policy. | Build/release guards, broader ignore rules and explicit source/config inclusion. Historical text-object scan found no credential patterns. |
| Maintenance | Dense server/frontend files mixed routing, identity, storage validation and rendering. Static privacy/popup styles lived in HTML. | Separate modules, shared escaping, external styles, readable formatting, ESLint and immutable CI action references. |

## Verification

- All 54 unit/integration checks passed locally in about 2.8 seconds, including real Stockfish, authentication, account isolation, deletion races, file serving, byte limits and classification/transport invariants. This is the small unit suite, not a long engine-analysis or screenshot sweep.
- Short browser flows cover onboarding, public-profile linking, lesson completion/reload, real streamed four-ply review, notes/export, HTML-injection text, all practice modes and English/mobile navigation. A separate isolated storage flow verifies account recreation, stale-save rejection, late-response rejection and guest preservation.
- Five fixed captures before/after (home, analysis, settings, mobile practice and privacy) showed zero changed pixels. This is evidence for those states, not every possible UI state.
- ESLint reports no errors or warnings. Source formatting is checked in CI. Public HTML no longer contains static style blocks/style attributes/event handlers.
- npm audit reported zero known production vulnerabilities; the complete dependency install also reported zero known vulnerabilities. A redacted scan of 239 historical text objects found no private-key, Google-secret, GitHub-token or Azure-connection-key patterns. This is pattern-based evidence, not proof that no secret was ever disclosed elsewhere.
- Azure configuration was checked read-only: storage public-blob access false, HTTPS-only true, minimum TLS 1.2. Application secrets remain secret references. Production capacity/cost settings are unchanged.

## Handoff

See `ARCHITECTURE.md` for module boundaries and `SECURITY.md` for the threat model, session migration and operational limits. See `PERFORMANCE_2026_10_25.md` for the measured benefits and the fresh-search result that did not show a speedup. Independent penetration testing, transient-record retention, ingress abuse policy and full disaster-recovery verification are not represented as completed.

Deployment and final CI receipt are recorded after publishing the verified image.
