# Evala security review — 27 October 2026

Scope: version 2.3.1, Node HTTP API, Google login, local/Blob document storage, web client, release pipeline and Evala's Azure resources. This is a source review plus reproducible regression tests and automated scans, not an independent penetration test or an ASVS certification. Active malformed-input tests run on disposable local servers, never on real users' accounts.

## Findings and changes

| Finding | Risk | Resolution |
|---|---|---|
| Public CPU budget lived only in process memory | Restart/scale-to-zero replenished the budget | One daily Blob document with compare-and-swap, shared across replicas; storage failures fail closed |
| PGN parsed on the HTTP thread before the move limit was checked | Malformed/complex files could block all users | Maximum 200 kB per server PGN; at most two worker threads, 3-second deadline, V8 heap/stack limits |
| Account API lacked general request/write limits | Storage-cost amplification and excessive concurrent work | Client/global request limits, in-flight limits, authenticated-user write limits; header/body/time/connection bounds |
| Rate counters used the proxy socket address | A client could exhaust limits shared with other visitors | Only ACA's rightmost, verified forwarded IP is used; local installations ignore forwarded IPs |
| Review endpoint accepted text/plain JSON | Avoidable simple-request CSRF surface | JSON Content-Type required; unsupported compression rejected; fetch-metadata defense added |
| Public web CSP allowed connections to any HTTPS host | Broad outbound channel if another browser vulnerability existed | Public mode permits only same origin, Google Identity, Chess.com API and Lichess |
| No account-wide sign-out control; old session could delete an account | Limited recovery from stolen current sessions | Sign-out-all rotates account epoch, invalidating every device; deletion needs login within 15 minutes |
| JWT claim requirements were partly implicit | Unexpected claim sets insufficiently constrained | Required signed claims, explicit expiry/issued-at and subject validation; existing RS256/issuer/audience/nonce retained |
| Temporary authentication records had no automatic cleanup | Unbounded retained authentication metadata | New records tagged; Azure lifecycle expires login markers after 1 day and sessions after 31 days, plus existing soft-delete retention |
| Conflicting writes could leave unindexed game revisions | Orphaned storage after revoked/failed updates | Delete only revisions proven unindexed; preserve data when storage outcome is ambiguous |
| Slow stream consumers could accumulate output | Memory pressure | Abort streams with excessive buffered output; drain engine stderr |
| Brilliant verification compute estimate was below maximum | Quota under-accounting | Reservation includes up to 18 bounded verification searches |
| GitHub secret scanning and security updates disabled | Future leaks/dependency regressions missed | Secret scanning, push protection, private vulnerability reporting, Dependabot and scanning workflows |

## Verification matrix

“Test” means an executable local regression; “review” means inspected implementation/configuration. No SQL database, XML/LDAP parser, payment system, arbitrary server-side URL fetch, archive upload or external LLM inference exists in this application; irrelevant controls are marked N/A rather than claimed as tested.

| # | Control | Evidence / result |
|---|---|---|
| 1 | Google signature | RS256 verification with jose; accounts tests |
| 2 | JWT issuer | Fixed Google issuer allowlist; source review |
| 3 | JWT audience | Configured client ID; wrong-audience regression |
| 4 | JWT expiry | Required exp and expiry check; source review |
| 5 | JWT issued-at | Required numeric iat; future values rejected |
| 6 | Verified email | Boolean true required |
| 7 | Login nonce | Cookie/header/JWT binding; mismatch test |
| 8 | Login replay | Durable single-use marker; replay test |
| 9 | Login rate | 12/minute per client; bounded limiter |
| 10 | Session entropy | 32 random bytes; source review |
| 11 | Session at rest | SHA256 key; raw cookie not persisted |
| 12 | Cookie scope | Host-only __Host prefix in production; test |
| 13 | Cookie script access | HttpOnly; test |
| 14 | Cookie transport | Secure and TLS-only ingress; config/test |
| 15 | Cookie cross-site | Lax account / Strict anonymous; test |
| 16 | Absolute session expiry | 30 days; validated on each request |
| 17 | Session fixation | Rotation on login; old-session test |
| 18 | Logout revocation | Server record removed; test |
| 19 | All-device revocation | Epoch rotation; two-session test |
| 20 | Sensitive deletion | Recent-login requirement; old-login test |
| 21 | Account CSRF | Independent session token on mutations; test |
| 22 | Login CSRF | Nonce and CSRF header before credential verification |
| 23 | CORS | Exact permitted origins; foreign/null-origin tests |
| 24 | Fetch metadata | Foreign-site API requests without Origin rejected; test |
| 25 | Anonymous/account separation | Public engine cookie grants no account access; review/tests |
| 26 | Object ownership / IDOR | Server derives storage owner from session; Alice/Bob test |
| 27 | Concurrent stale devices | Expected user/generation + version CAS; tests |
| 28 | Deletion races | Epoch revoked before cleanup; concurrent-write test |
| 29 | Account recreation | New generation cannot reuse previous sessions; test |
| 30 | Mass assignment | Explicit preferences allowlist, no client role/userId accepted |
| 31 | Training score tampering | Server grading and single-use challenge; replay test |
| 32 | JSON size and shape | Byte bounds, object-only body; malformed/oversize tests |
| 33 | Content type | JSON required for mutations, text/plain review rejected; test |
| 34 | Compressed bombs | Compressed request bodies rejected; test |
| 35 | PGN CPU isolation | Worker/deadline/active bounds; valid, invalid, timeout tests |
| 36 | PGN memory/input | 200 kB limit, 64 MiB old heap +16 MiB young heap, 4 MiB stack; test/review |
| 37 | FEN / UCI injection | Legal FEN and coordinate moves, newline/null rejection; tests |
| 38 | Shell injection | Fixed spawn executable/argv without shell; review |
| 39 | SQL / NoSQL injection | N/A: hashed-key JSON/Blob documents, no query language |
| 40 | SSRF | No arbitrary server-side fetch; Google JWK endpoint fixed; import URLs browser-side allowlisted |
| 41 | XXE / archive traversal | N/A: no XML parser or uploaded archive extraction |
| 42 | Prototype pollution | No recursive user-object merge; persisted preferences/analysis rebuilt from allowlists; review |
| 43 | Stored/DOM XSS | PGN player names, comments and notes escaped/textContent; escaping test + source review |
| 44 | Script CSP | No unsafe-inline scripts; self/WASM/Google Identity only; test |
| 45 | Exfiltration CSP | Public connect-src allowlist; test |
| 46 | Clickjacking | X-Frame-Options and frame-ancestors; header inspection |
| 47 | MIME confusion | nosniff and explicit extension MIME table; tests |
| 48 | Path traversal | Decoding, relative containment, realpath; encoded traversal tests |
| 49 | Symlink escape | realpath containment; test where host permits symlinks; Linux CI |
| 50 | Dotfiles / Windows ADS | Explicit denial of hidden paths, backslash, colon, NUL; tests |
| 51 | Error disclosures | Generic client errors, bounded log category; injected storage-error test |
| 52 | Private caching | Account/JSON/stream responses no-store; test |
| 53 | Body/header/connection timeouts | HTTP request/header/socket deadlines and max connections; source review |
| 54 | In-flight resource bounds | Per-client/global active counters release on close/finish; test |
| 55 | Persistent public quota | CAS reservations and restart/concurrency/failure tests |
| 56 | Queue bounds | Three waiting reviews, timeout and abort handling; review |
| 57 | Engine isolation | Native child process, bounded settings/slots/cache; real-engine regression |
| 58 | Storage quota | 200 games / 50 MB per account, 3 MB per document; code review |
| 59 | Forwarded-header spoofing | Only rightmost ACA address trusted; unit test |
| 60 | Secret history | Gitleaks 8.30.1: full Git history, redacted output |
| 61 | Dependency advisories | npm audit: zero at audit start; required CI gate |
| 62 | Static analysis | CodeQL security-extended; findings >= medium block job |
| 63 | Passive web scan | ZAP baseline on disposable local server; warning report retained |
| 64 | Image vulnerabilities/secrets | Trivy runtime image scan before publishing; fixable high/critical gate |
| 65 | CI privilege | No pull_request_target; read-only default, pinned actions, CodeQL-only security-events write |
| 66 | Release provenance | Protected main, full commit tag/digest, build.json and native-container smoke |
| 67 | Container privilege | USER node, fixed engine checksum, lockfile and ignored lifecycle scripts |
| 68 | Azure Blob access | Public blob access false, HTTPS-only, TLS1_2; live config inspection |
| 69 | Recovery retention | Blob + container soft delete 7 days; live config inspection |
| 70 | Operational reporting | Private GitHub vulnerability reporting, security policy, weekly checks |

## Remaining operational boundaries

- Anonymous users can consume the shared daily allowance. Counters protect compute cost but are not a WAF or internet-scale DDoS protection. Fixed-window IP/account rate limits reset with a replica; the compute budget does not. Public alpha is appropriate; unlimited anonymous commercial traffic is not.
- A stolen valid session is a bearer credential until expired/revoked. HttpOnly, Secure, CSRF, rotation and sign-out-all reduce risk but cannot repair a compromised browser/device. Administrative GitHub, Google and Azure accounts need MFA and owner-managed recovery.
- Azure uses a server-side storage account credential, not a managed identity. It is not in frontend/repo/image. Managed identity with narrowly scoped Blob RBAC is a future least-privilege improvement, especially before adding other containers to that account.
- Soft delete is seven-day recovery from accidental deletion, not an independent disaster-recovery backup. A disposable blob was actually deleted and restored successfully in Azure; no full production account restore exercise was performed. Owners need a tested backup/restore plan before promising durable public service.
- New auth records have lifecycle tags; old untagged auth records remain until a separate cleanup migration. A storage outage during uncommitted-revision cleanup can also leave an orphan; deletion must never guess and risk a committed user's game.
- CSP still allows inline styles for generated chessboard coordinates and Google controls, plus wasm-unsafe-eval for Stockfish. It does not allow arbitrary inline scripts. ZAP passive warnings must be read with these documented requirements.
- Trivy blocks fixable HIGH/CRITICAL issues. Unfixed base-image advisories and lower severities must still be reviewed; a successful gate is not a claim of zero CVEs. Weekly scans catch newly disclosed advisories but require someone to act on failures.
- No external LLM receives PGN or account data; “AI prompt injection” into a hosted language model is not currently an application boundary. If an LLM coach is added, tool permissions, untrusted PGN content and data disclosure need a separate review.

## Research references

- [OWASP ASVS 5.0](https://asvs.owasp.org/) — audit coverage reference, not certification.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [DoS guidance](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).
- [Microsoft ACA ingress headers](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview) — only the rightmost X-Forwarded-For address is supplied by ACA.
- [ZAP baseline](https://www.zaproxy.org/docs/docker/baseline-scan/), [Trivy secrets](https://www.trivy.dev/docs/latest/guide/scanner/secret/), [Semgrep CE scope/limitations](https://github.com/semgrep/semgrep). CodeQL was selected for the GitHub-native static gate; Semgrep was evaluated, not run.
- [Reddit post-coding audit prompts](https://www.reddit.com/r/vibecoding/comments/1tlvpjr/security_and_maintainability_guide_for_vibecoders/) — community checklist inspiration only; findings above come from this source tree/config/tests, not copied prompt conclusions.

## Execution record

Local focused security/account tests and actual-engine tests passed; theme/language smoke passed. Full-history Gitleaks and npm audit reported no findings. The first CodeQL run flagged an imprecise substring assertion in a test, not a runtime redirect. The assertion was changed to verify the complete CSP directive. Its real SARIF also exposed missing extension-pack handling in the new gate; this was fixed and tested to reject that finding. ZAP reported only the documented inline-style and COOP/COEP compatibility findings plus informational cache/application notices. Real Azure CAS, account isolation, restart persistence, deletion and disposable-blob restore passed. Final CodeQL, image Trivy and production verification are recorded in the release PR and its workflow artifacts; review those results, not just this checklist, before deploying.
