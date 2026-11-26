# Clippy

**Select it. Clip it. Make it yours.**

Clippy is a desktop visual component extractor for OpenCreativeSuite. It opens a
real Chromium page, lets you inspect and select live DOM elements, then captures
the actual markup, CSS, responsive rules and assets into an editable component.

Clippy is built with **CSX** and Donkeh's embedded `webview`.

## What it does

- Navigates to any HTTP or HTTPS page in a real embedded Chromium browser.
- Provides a Chrome-style element inspector with box-model overlays.
- Selects one or many elements, with parent/child navigation and nested
  selections.
- Extracts the live DOM, not a screenshot or a reconstructed approximation.
- Recovers original CSS rules, media/container queries, keyframes, pseudo
  elements, custom properties, fonts and responsive layout context.
- Falls back to computed styles where a stylesheet cannot be read.
- Downloads images, SVG resources, fonts and other visual assets, then rewrites
  every reference to a local file.
- Generates **HTML**, **React/JSX** and **Donkeh CSX** from the same intermediate
  representation.
- Provides a workspace with a code editor, CSS editor, asset browser, live
  isolated preview, viewport presets and original-vs-extracted comparison.

## Build and run

```powershell
csx build
dotnet run --no-build
```

The project targets `net10.0` and uses the Windows `win-x64` runtime so the
native CEF binaries are copied into the output. `CefBoot` initializes the
offscreen Chromium runtime before Donkeh creates its first webview. If the
default CEF startup path is unsuitable on a machine, Clippy boots CEF with a
software-offscreen configuration instead.

Optional development flags:

```powershell
Clippy.exe --url https://example.com
Clippy.exe --url https://example.com --capture ".product-card" --workspace
Clippy.exe --url https://example.com --capture ".product-card" --export Csx --props
```

These are test/automation conveniences. Normal use is entirely through the UI.

## Workflow

1. Enter a page address.
2. Turn on **Inspect**.
3. Hover to see the real box model; click to clip.
   - `Shift` adds another element.
   - `Alt` selects the parent.
   - `Ctrl`/`Cmd` click removes a selection.
4. Review the element details, hierarchy and extracted rules.
5. Open the workspace.
6. Edit the component source or CSS, or switch between React, Donkeh CSX and
   HTML output.
7. Choose a viewport preset and check the isolated preview.
8. Export one component or the whole project.

## Export layout

```text
ProductCard/
    react/
        ProductCard.jsx
        ProductCard.css
        assets/
    csx/
        ProductCard.csx
        ProductCard.css
        assets/
    html/
        index.html
        styles.css
        assets/
```

Each format folder contains a `manifest.json` with the source URL, viewport,
asset retrieval state and extraction warnings.

## Architecture

- `src/Core` — models, naming, session and application state.
- `src/Browser` — inspector/extraction script loader.
- `src/browser/inspector.js` — browser-side selection, overlay, DOM capture,
  CSS discovery, responsive rules and asset discovery.
- `src/Extraction` — host resource retrieval, cross-origin stylesheet loading,
  font-face recovery and reference rewriting.
- `src/Generation` — HTML, React, CSX, CSS, preview and export generation.
- `src/Ui` — shell, inspector, details, workspace and editor views.

Extraction produces one format-independent representation. All three output
formats are generated from that representation.

## Donkeh notes

- Generated CSX is validated with the Donkeh CSX toolchain during development.
- CSS compatibility is checked against Donkeh's actual property/selector
  support. Unsupported features are reported in the export tab instead of being
  silently emitted.
- Donkeh's native renderer does not paint inline SVG shapes; CSX exports warn
  about this. HTML and React preserve the SVG.
- Donkeh has no user text selection model and ignores some browser-only
  selectors/pseudo-elements. These limitations are surfaced in the UI.
- Generated CSX needs the associated `.css` file added to the consuming
  project.

## Fidelity and limitations

Clippy keeps the original markup and rules wherever possible, including context
wrappers that reproduce grid/flex parent layout. When a stylesheet is
cross-origin, Clippy fetches it and re-injects a same-origin copy so selector
matching still runs against the live DOM. If a resource or stylesheet cannot be
retrieved, the export lists it instead of silently presenting an incomplete
package.

Closed shadow roots cannot be read through browser security boundaries. Open
shadow roots are flattened into normal markup. Canvas pixels and iframe content
are not part of DOM extraction. Original JavaScript application behaviour is not
recreated; Clippy preserves markup, styling, assets and CSS-driven interaction.

## Security

Page content is treated as untrusted. Extracted scripts and event handlers are
not executed by Clippy and are not emitted into generated components. The host
only downloads HTTP(S)/data visual resources, and the address bar does not grant
access to local files.
