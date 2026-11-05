# Reviewed CodeQL fixture flows

The full main-branch scan reported nine pre-existing findings that the PR's
incremental result did not show. The security gate remains enabled.

Five patterns were removed: the development asset script now verifies vendored
assets against reviewed SHA-256 checksums without downloading moving upstream
content; two browser fixtures pass their FEN through a DOM data attribute instead
of interpolating a JSON string into executable JavaScript.

Four `js/file-access-to-http` results are intentional local fixture transfers.
The CodeQL trace starts in `public/data/puzzles.json` (public CC0 data), then
sends puzzle IDs/moves to the test HTTP server created on `127.0.0.1`. These
flows do not send private files or puzzle contents to an external destination.

`scripts/codeql-reviewed.json` records the exact source SHA-256 (normalised LF),
rule, file, source lines, rationale and review expiry. The gate allows only those
four unchanged locations. Changing a test, adding a flow, moving it to production
code or allowing a review to expire makes the result blocking again. Regression
tests cover this behaviour. There is no global test-directory or rule exclusion.

Review expiry is 4 February 2027. Review these exact data flows again before
renewing it; do not regenerate hashes just to make CI pass.

On 5 November 2026, the account fixture was reviewed again after appending the
profile-sync regression. The three existing source locations and data flows are
unchanged: the source remains public CC0 puzzle data, and the destination remains
the dynamically allocated loopback test server. The added regression sends only
constructed PGN/task fixtures to that same loopback server. Only this file's
reviewed source hash was renewed; rules, locations and expiry remain unchanged.
