# Local extension build 2.16.2

Both `dist/` (complete extension) and `dist-bar/` (bar only) include Stockfish 19
Lite, Stockfish 19 Full NNUE, Maia-3 5M and their local WASM/model assets. Build
with `npm run build:bar`; ZIP archives are written to `release/`. Generated output
is ignored by Git; source and packaging scripts are tracked.

Controls include independent computation/bar/arrows switches and position time
limits of 0.3, 0.75, 1.5, 3, 5, 7.5, 10, 15 and 30 seconds. The extension's Maia
rating selector now spans 800–2800 in steps of 200. The setting is passed to the
actual model, including 2600/2800, rather than being clipped to 2400. This is a
conditioning input, not a calibrated playing-strength guarantee. The website's
practice-room selector is unchanged.

The pinned upstream model supports continuous rating conditioning with an
internal range of 0–5000; see `interpolate_elo` in
[the corresponding source](https://github.com/CSSLab/maia3/blob/1e13597c42d4858b7cfd7cfdae01e297263364b2/maia3/models.py).
The numeric evaluation bar continues to use Stockfish Lite when Maia is selected;
Maia supplies the human move/arrow. All inference runs locally.

For an installed unpacked extension, replace files at the existing folder path,
reload it at `chrome://extensions`, then refresh open chess tabs. Browser settings
remain in the existing Chrome extension storage.
