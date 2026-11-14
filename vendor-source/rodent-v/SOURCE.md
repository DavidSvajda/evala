# Rodent V Tal browser build

Upstream: `nescitus/Rodent-V` revision `b55a1d142a4254dd091ede86845b2b9ac036653e`,
version 1.2.03, GPL-3.0. The included `tal_nnue.txt` selects
`rodent_4kb_768hl_tal_aggressive.bin` (SHA-256
`8211aea5a9d66fe8424523e2adb5384dcb4256b76ff791e04523357f187ca26f`).

This browser port replaces standard-input reading with a `syscall/js` command
callback, uses scalar NNUE routines because WebAssembly has no AVX2, embeds
the Tal network, and applies its upstream scale and mirroring values. Opening
books are omitted; `OwnBook` remains disabled. The UCI search and evaluation
code otherwise follow the pinned upstream source. `wasm_exec.js` comes from
Go 1.27.4 and is covered by `GO-LICENSE.txt`. The `golang.org/x/sys` v0.47.0
dependency is vendored for an offline rebuild with its BSD-style license.

Rebuild using Go 1.27.4 from this directory:

```sh
GOOS=js GOARCH=wasm go build -o rodent-tal.wasm .
```

The browser wrapper is `public/engine/rodent-tal-worker.js`. The source,
network and Go runtime are shipped in `engine/rodent-source.zip` in both
extension packages.
