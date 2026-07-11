# Windfoil — Progress & Project State

_Last updated: 2026-07-10_

This document tracks the current state of the Windfoil codebase against the
roadmap in `VISION.md`. It supersedes the "what's done" mental model — read this
for ground truth on structure and feature completeness.

---

## 1. What Windfoil is

A GPU text renderer that draws a full multi-page, CSS-styled document through an
**analytic WebGPU pipeline** (one draw call, zero aliasing at any zoom). Text is
shaded via a closed-form winding-number integral per pixel — no bitmaps, no SDF.

- Stack: TypeScript, WebGPU, WGSL, opentype.js, custom CSS engine.
- The render core lives in `src/windfoil/` (unchanged, already modular).
- The app/orchestration layer was refactored out of a 1400-line `main.ts` into
  focused modules (see §3).

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
    theme.ts         palettes + buildCSS(palette)
  layout/
    types.ts         StyledEl, Seg
    walk.ts          walkDOM, buildStyledEls, hitTest, findEditableAncestor
    metrics.ts       tw (text width), layoutStr, addRect, highlightCode
    flow.ts          layoutFlow (inline text), layoutPre (code blocks)
    editable.ts      layoutEditable, placeCaretAtPoint
  camera/
    camera.ts        Pan/zoom transform, goToPage, stepCamera
    input.ts         Pointer/wheel/keyboard → camera + editing + navigation
  content/
    pages.ts         Document HTML split into 11 independent page strings
  windfoil/          (render core) gpu.ts, font.ts, bands.ts, geometry.ts, windfoil.wgsl
```

**Design decision:** a single `AppState` object is threaded through `camera`,
`input`, and `frame` instead of closure variables. This removed the previous
tangle and avoids circular imports (modules import only types or leaf modules).

---

## 3. Feature status

### Phase 1 — Foundation ✅ (mostly)
- [x] **Split `main.ts` into modules** — done. `main.ts` is now ~95 lines of wiring.
- [x] **Extract HTML content** — done (`content/pages.ts`, 11 page strings).
- [x] **Extract CSS into a module** — done (`css/theme.ts` owns palettes + `buildCSS`).
- [ ] **Dark-mode contrast for cards** (`VISION` §1) — **NOT done**. Card/inline
      contrast and the "high contrast" theme option are still pending.

### Phase 2 — Basic Editing ✅
- [x] Blinking caret (vertical bar, ~2px on screen at any zoom)
- [x] Click-to-place caret (nearest character boundary)
- [x] Character insertion / Backspace / Delete
- [x] Arrow-key navigation (incl. line up/down, Home/End)
- [x] Basic text reflow after edits (live, every frame)
- [x] **Caret is vertically centered on the text line** (fixed during Phase 1 work)

### Phase 3 — Selection & Clipboard 🟡 (partial)
- [x] Shift+arrow selection
- [x] Selection highlight rendering (translucent, behind glyphs)
- [x] `Ctrl/Cmd+A` select-all
- [ ] Click-and-drag selection
- [ ] `Ctrl+C` / `Ctrl+V` clipboard
- [ ] `Tab` cycles editable fields (implemented as a navigation aid)

### Phase 4+ — Multi-file editor, Code Intelligence, Advanced
- [ ] File tab bar, side-by-side columns, line numbers
- [ ] Extended syntax highlighting (more languages)
- [ ] Code folding, bracket matching, auto-indent
- [ ] Minimap, search & replace, multi-cursor, LSP, autocomplete

### Input / camera (added during refactor)
- [x] Two-finger scroll = pan
- [x] Right-drag + wheel = zoom to cursor
- [x] **Trackpad pinch-to-zoom** (wheel event with `ctrlKey`) — added
- [x] Pinch/zoom sensitivity increased (coefficient `0.0008 → 0.0022`)

---

## 4. Known issues / deviations from VISION

1. **CSS not yet migrated to CSS variables + a static `.css` file.** `buildCSS`
   still generates the full stylesheet from a palette object in `css/theme.ts`.
   The VISION suggested moving static classes to a `.css` file; this is a clean
   follow-up, not required for modularity.

2. **HTML content is in `content/pages.ts` as 11 strings**, not 11 raw `.html`
   files. Switching to per-file `?raw` imports is trivial from here if desired.

3. **`src/windfoil/` kept as-is** rather than renamed to `render/` as the VISION
   sketch suggested — it was already a clean, self-contained module, so renaming
   was avoided to limit churn.

4. **Layout-measurement ordering bug (fixed):** the stylesheet must be applied
   *before* `buildStyledEls` measures boxes; otherwise elements collapse to
   default browser styling and the whole layout breaks (cards lost, boxes wrong).
   `main.ts` now sets `themeStyle.textContent = buildCSS(...)` before measuring.

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

---

## 6. Suggested next steps

1. Dark-mode card contrast pass (`VISION` §1) — highest visual-impact gap.
2. Clipboard (copy/paste) + click-drag selection to finish Phase 3.
3. (Optional) migrate `buildCSS` → CSS variables + static stylesheet.
4. (Optional) split `content/pages.ts` into per-file `.html` imports.
