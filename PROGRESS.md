# Windfoil — Progress & Project State

_Last updated: 2026-07-12_

This document tracks the current state of the Windfoil codebase against the
roadmap in `VISION.md`. It supersedes the "what's done" mental model — read this
for ground truth on structure and feature completeness.

---

## 0. Current content: yasmineOS Design Language Reference

The document content is now a faithful recreation of the yasmineOS
`design_language_reference` (a VS Code-style dark component catalog), rendered
entirely through the analytic pipeline. Four pages:

0. **Foundations** — color tokens, headings, buttons (6 variants), layout primitives
1. **Controls** — inputs, textarea, dropdown, sliders, control grid, toggles, tabs
2. **Data & Status** — cards, stats grid, entity grid, progress, badges, LEDs, logs, test runner
3. **Layout & Content** — separators, header+logo, controls bar, article blocks, viewport slot

Two supporting capabilities were added for fidelity:

- **Border rendering** — `StyledEl` now carries per-side border widths/colors
  (`borderW`/`borderC`), read in `walk.ts`, re-read on theme change, and baked as
  thin edge rects in `precompute.ts` (independent of background alpha). This makes
  the design's crisp 1px dividers, card outlines, inputs, and left-accent bars
  render correctly.
- **inline-block boxes** — `walk.ts` distinguishes pure `inline` (text spans, no
  box) from `inline-block` (buttons, badges, LEDs) so the latter get their
  background + border baked.

---

## 1. What Windfoil is

An analytic WebGPU renderer that draws everything — a multi-page CSS-styled
document, filled SVG icons/illustrations, a code editor, and a terminal — through
a **single draw call**, shading each pixel via a closed-form winding-number
integral. Zero aliasing, razor-sharp at any zoom; no bitmaps, no SDF.

- Stack: TypeScript, WebGPU, WGSL, opentype.js, custom CSS engine.
- The render core lives in `src/windfoil/`.
- The app/orchestration layer is split into focused modules (see §2).

---

## 2. Architecture (current)

```
src/
  main.ts            Entry point — wires modules, owns no logic
  state.ts           AppState: single mutable state container
  precompute.ts      Static buffers: backgrounds, highlight cache, static text
  frame.ts           The per-frame render loop (single GPU draw call)
  css/
    engine.ts        parseColor, parseCSS, matchesSelector, resolveStyle
    theme.ts         reference design-system palettes + buildCSS(palette)
    themeController.ts  createThemeController — runtime theme switching + cycle
  layout/
    types.ts         StyledEl, Seg
    walk.ts          walkDOM, buildStyledEls, hitTest, findEditableAncestor
    metrics.ts       tw (text width), layoutStr, layoutIcon, addRect, highlightCode
    flow.ts          layoutFlow (inline text), layoutPre (code blocks)
    editable.ts      layoutEditable, placeCaretAtPoint
  camera/
    camera.ts        Pan/zoom transform, goToPage, stepCamera
    input.ts         Pointer/wheel/keyboard → camera + editing + navigation
  content/
    pages.ts         Ordered list; imports the 4 raw .html page files below
    pages/           00-foundations … 03-layout-content (one file per page, ?raw)
    art.ts           Filled SVG path data: ICONS + ILLUSTRATIONS (24×24 grid)
  ui/
    icons.ts         Inline SVG line-icons (currentColor, 24×24 grid)
    contextMenu.ts   Modular, data-driven right-click menu (themed via CSS vars)
    toolbar.ts       createToolbar — fixed top-right DOM buttons
  windfoil/          (render core) gpu.ts, font.ts, bands.ts, windfoil.wgsl
    geometry.ts      shared quad primitives: cubicToQuads, lineToQuad, quadsBBox,
                     pushMonotonePieces (used by font.ts + svg.ts)
    svg.ts           SVG path `d` → quad pieces (shared with the font path)
  editor/            The code editor (own model, not DOM-derived)
    document.ts      TextDocument: line buffer, {line,col} positions, edit ops, undo/redo
    highlight.ts     Incremental line tokenizer (carry state for block comments)
    editor.ts        CodeEditor: proportional layout, gutter, caret, selection, viewport cull
    editorInput.ts   handleEditorKey + ensureCaretVisible (keyboard → editor commands)
    sample.ts        Sample source shown on open
    terminal.ts      Terminal: TUI shell — scrollback, prompt, animated boot + widgets
    terminalInput.ts handleTerminalKey (keyboard → terminal commands)
```

**Design decision:** a single `AppState` object is threaded through `camera`,
`input`, and `frame` instead of closure variables. This removed the previous
tangle and avoids circular imports (modules import only types or leaf modules).

---

## 3. Feature status

### Phase 1 — Foundation ✅ (mostly)
- [x] **Split `main.ts` into modules** — done. `main.ts` is a thin wiring layer
      (~120 lines); logic lives in css/, layout/, camera/, editor/, ui/, and frame.ts.
- [x] **Extract HTML content** — done. Now 4 per-file `.html` pages under
      `content/pages/`, imported via Vite `?raw` and assembled in `content/pages.ts`.
- [x] **Extract CSS into a module** — done (`css/theme.ts` owns palettes + `buildCSS`).
- [x] **Dark-mode contrast for cards** (`VISION` §1) — **done**. Dark palette
      redesigned: cards `#2a3048` vs page `#12151d` (clear separation), brighter
      borders (`#414a6b`), muted text lifted to `#a6adc0`. A third **high-contrast**
      theme was added; the top-right button now cycles light → dark → high-contrast.

### Phase 2 — Basic Editing ✅
- [x] Blinking caret (vertical bar, ~2px on screen at any zoom)
- [x] Click-to-place caret (nearest character boundary)
- [x] Character insertion / Backspace / Delete
- [x] Arrow-key navigation (incl. line up/down, Home/End)
- [x] Basic text reflow after edits (live, every frame)
- [x] **Caret is vertically centered on the text line** (fixed during Phase 1 work)

### Phase 3 — Selection & Clipboard ✅
- [x] Shift+arrow selection
- [x] Selection highlight rendering (translucent, behind glyphs)
- [x] `Ctrl/Cmd+A` select-all
- [x] Click-and-drag selection
- [x] `Ctrl+C` / `Ctrl+X` / `Ctrl+V` clipboard (async `navigator.clipboard`)
- [x] `Tab` cycles editable fields

### Phase 4+ — Multi-file editor, Code Intelligence, Advanced
- [x] **Real code editor** (`editor/`) — a proper line-based editor, separate from
      the DOM/`StyledEl` system, rendered through the same analytic GPU pipeline.
      Toggle with the ⌨️ button (top-right). Features:
  - `TextDocument` line-buffer model with `{line,col}` positions and range-replace
    primitive; full **undo/redo** stack.
  - **Proportional advance-based layout** (fixes proportional-font spacing), with
    **tab expansion**, **line-number gutter**, and **current-line highlight**.
  - Caret + click-to-place, **mouse drag-select**, **Shift+arrow selection**,
    select-all, Home/End (smart + doc-level via Ctrl).
  - **Incremental syntax highlighting** — per-line tokenizer with carry state so
    multi-line block comments work; only lines from the first edit are re-tokenized.
  - Clipboard (Ctrl+C/X/V), auto-indent on Enter, Tab insert.
  - **Viewport line culling** — only lines intersecting the camera are laid out;
    caret auto-scrolls the camera to stay in view.
- [x] **Terminal TUI** (`editor/terminal.ts`) — a fully animated shell rendered
      through the same pipeline. Toggle with ❯_ (top-right, next to the editor
      button). Features:
  - Styled scrollback buffer with **typewriter boot sequence**.
  - **Proportional advance-based layout** (like the editor) — glyphs placed by
    real advance width, not a fixed monospace grid, so spacing reads naturally.
  - **Smooth gliding caret** — a thin bar, vertically centered on the glyph band
    and horizontally centered on the character boundary, that eases to its target
    column with a soft sinusoidal blink (not a snapping block).
  - **Command interpreter**: `help`, `ls`, `pwd`, `whoami`, `date`, `echo`,
    `neofetch`, `colors`, `clear`.
  - **GPU-rect widget dock** (sits between scrollback and the prompt) — widgets
    draw fractional-size rects with eased motion, sub-cell smooth (a character-grid
    terminal can't): orbiting-dot spinner, smooth progress bar with moving sheen,
    eased bar chart, **live scrolling anti-aliased signal graph** (`graph`, with
    gridlines + connected line + live readout), particle-trail matrix rain, live
    clock. All animate off the frame clock.
  - Editing: history (↑/↓), **Ctrl/Alt word motion + word-delete** (Ctrl+Backspace
    / Ctrl+Delete / Ctrl+←→), Ctrl+C to cancel widgets, Ctrl+V paste.
- [ ] File tab bar, side-by-side columns (multi-file)
- [ ] Extended syntax highlighting (more languages)
- [ ] Code folding, bracket matching
- [ ] Minimap, search & replace, multi-cursor, LSP, autocomplete

### Input / camera (added during refactor)
- [x] Two-finger scroll = pan
- [x] Right-drag + wheel = zoom to cursor
- [x] **Trackpad pinch-to-zoom** (wheel event with `ctrlKey`) — added
- [x] Pinch/zoom sensitivity increased (coefficient `0.0008 → 0.0022`)
- [x] **Right-click context menu** — a *short* right-click (<350ms, no wheel/move)
      opens a modular, SVG-iconed context menu; a *long* press or any wheel during
      the press stays the zoom gesture and suppresses the menu. Menu items are
      context-aware (Cut/Copy/Paste/Select-All when editing; Fit/Reset/Theme on the
      canvas) and defined declaratively in `ui/contextMenu.ts`.

---

## 4. Known issues / deviations from VISION

1. **CSS not yet migrated to CSS variables + a static `.css` file.** `buildCSS`
   still generates the full stylesheet from a palette object in `css/theme.ts`.
   The VISION suggested moving static classes to a `.css` file; this is a clean
   follow-up, not required for modularity.

2. **HTML content is 4 per-file `.html` imports** under `content/pages/`,
   loaded via Vite `?raw` and assembled in `content/pages.ts`.

3. **`src/windfoil/` kept as-is** rather than renamed to `render/` as the VISION
   sketch suggested — it was already a clean, self-contained module, so renaming
   was avoided to limit churn.

4. **Layout-measurement ordering bug (fixed):** the stylesheet must be applied
   *before* `buildStyledEls` measures boxes; otherwise elements collapse to
   default browser styling and the whole layout breaks (cards lost, boxes wrong).
   `main.ts` now sets `themeStyle.textContent = buildCSS(...)` before measuring.

---

## 4b. Performance (frame loop)

The per-frame instance build was tightened:

- **Precomputed dispatch flags** — `walkDOM` now bakes `hoverable`,
  `shadowable`, `anim`, `dynamic`, `pageIdx`, and `ownerPage` onto each
  `StyledEl`. The frame loop no longer does `classes.includes(...)` scans or
  `getAttribute('data-page')` DOM reads in hot paths.
- **Dynamic subset** — only elements flagged `dynamic` (hover/shadow/animated)
  are walked in Layer 2; static paragraphs/headings are skipped entirely.
  `dynamicEls`, `marqueeEls`, and `editableEls` are precomputed subsets.
- **Per-page viewport culling** — static backgrounds and static text are baked
  into per-page instance buffers (`bgByPage`, `textByPage`). Each frame computes
  which pages intersect the viewport (+margin) and only those pages' instances
  are pushed / uploaded / rasterized. With only the visible page contributing,
  this cuts the instance buffer substantially. The curve/row atlas stays global so
  band indices remain valid. Runtime theme changes rebuild the baked buffers via
  `buildStatic`.

---

## 4c. Cleanup pass (pre-merge)

A structure/modularity pass before merging:

- **De-duplicated geometry** — `cubicToQuads`, `lineToQuad`, and the bbox sweep
  were copy-pasted in `font.ts` and `svg.ts`; now shared from `windfoil/geometry.ts`.
- **Removed dead code** — `renderToRGBA` (unused headless path), dead `AppState`
  fields (`shaderCode`, `container`, `themeStyle` — bootstrap artifacts never read
  back), and unused exports (`SYNTAX_COLORS`, `ICON_VIEWBOX`, `posEq`, the
  `FontFace` re-export in `layout/types.ts`), plus unused `opentype.js` imports.
- **Slimmed `main.ts`** (172 → 117 lines) — theme switching moved to
  `css/themeController.ts`, toolbar buttons to `ui/toolbar.ts`.
- **Focused `camera/input.ts`** — editor keyboard handling moved to
  `editor/editorInput.ts`, so `input.ts` is document/camera interaction only.

Type-check and production build pass clean.

---

## 5. How to run / verify

```bash
npm run dev      # Vite dev server (no typecheck) — primary way to view
npm run build    # tsc --noEmit + vite build (must pass clean)
```

Type-check and production build both pass (22 modules transformed).

To test editing: click the editable elements (home hero paragraph, the "Hover
Card" title, the typography sample line) and type. Click elsewhere to commit,
`Esc` to revert, `Tab` to move between editable fields.

To test the **code editor**: click the ⌨️ button (top-right) to open it. Click to
place the caret, drag or Shift+arrow to select, type to edit, `Ctrl+Z`/`Ctrl+Y`
to undo/redo, and scroll/zoom the wheel — glyphs stay razor-sharp at any zoom.
Click 📄 to return to the document.

To test the **terminal**: click the ❯_ button. Watch the boot sequence, then run
`help`. Try the animated widgets — `graph` (live plot), `progress`, `spinner`,
`chart`, `matrix`, `clock` — and zoom in on the graph to see fractional-pixel,
anti-aliased vector graphics inline in a shell. `Ctrl+C` cancels a widget.

---

## 6. Suggested next steps

1. **Multi-file / split panes** — the editor and terminal are already self-contained
   world-space panels; add a tab bar and tile several side by side (the grand-vision
   goal). Each `CodeEditor`/`Terminal` just needs its own `x0/y0`.
2. **Editor depth** — search & replace, bracket matching, multi-cursor, code folding,
   double-click word / triple-click line select, auto-close brackets.
3. **Minimap** — a scaled second render of the document (cheap with this pipeline).
4. **Terminal → real backend** — pipe to an actual shell via WebSocket/worker, or a
   scripting sandbox; add Tab command autocomplete.
5. **Ship a monospace font** — for authentic terminal/code columns without the
   proportional-layout workarounds.
6. **Make the design-system controls live** — wire sliders/toggles/tabs to real
   click/drag handlers, turning the catalog into an interactive playground.
7. **Perf headroom** — instance-buffer diffing / dirty regions so idle frames upload
   less; extend the tokenizer to more languages.
8. (Optional) migrate `buildCSS` → CSS variables + a static stylesheet.
