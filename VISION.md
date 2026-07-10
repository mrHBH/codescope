# Windfoil — Vision & Roadmap

## Current State

A GPU text renderer that renders a full multi-page CSS-styled document via WebGPU,
with interactive hover/click, page navigation, dark mode, and animations — all rendered
through an analytic GPU pipeline (one draw call, zero aliasing at any zoom).

**Tech stack:** TypeScript, WebGPU, WGSL shaders, opentype.js, custom CSS engine.

---

## 1. Color Scheme & Dark Mode

### Problem

Inside cards in dark mode the text and background colors are not legible enough.
The contrast between card backgrounds (`#222738`) and page backgrounds (`#14171f`)
is still too subtle. Text on cards lacks punch.

### Plan

- Redesign the dark palette with higher contrast ratios (WCAG AA minimum 4.5:1)
- Cards should be noticeably lighter than the page background — aim for `#2a2f42` min
- Ensure muted text on cards stays readable (contrast >= 3:1 against card bg)
- Add a subtle inner glow or border highlight on cards to separate them visually
- Test both light and dark themes at every zoom level (contrast perception changes)
- Consider a "high contrast" dark theme option

---

## 2. Code Architecture — Split main.ts

### Problem

`src/main.ts` is a monolithic ~1300-line file containing the CSS engine, layout,
rendering, HTML content, themes, and the frame loop. Hard to maintain and extend.

### Proposed Structure

```
src/
  main.ts                  — Entry point, wires everything together
  css/
    engine.ts              — parseCSS, resolveStyle, matchesSelector
    rules.ts               — CSSRule types, selector matching
    theme.ts               — palettes, buildCSS, applyTheme
  layout/
    walk.ts                — walkDOM, StyledEl type, styledEls/pageRoots
    flow.ts                — layoutFlow, layoutStr, tw (text metrics)
    pre.ts                 — layoutPre, syntax highlighting
    types.ts               — StyledEl, Seg, FontFace interfaces
  render/
    gpu.ts                 — WebGPU device, createGlyphRenderer, buffers
    bands.ts               — bandPieces, buildGlyphAtlas, band sorting
    geometry.ts            — pushMonotonePieces, monotone decomposition
    windfoil.wgsl          — Vertex/fragment shader
  content/
    home.html              — Page 0 HTML
    features.html          — Page 1 HTML
    showcase.html          — Page 2 HTML
    design.html            — Page 3 HTML
    animations.html        — Page 4 HTML
    typography.html        — Page 5 HTML
    components.html        — Page 6 HTML
    blog.html              — Page 7 HTML
    pricing.html           — Page 8 HTML
    faq.html               — Page 9 HTML
    playground.html        — Page 10 HTML
    styles.css             — Shared CSS (all component classes)
  animations/
    registry.ts            — Animation class names + render functions
    bounce.ts              — bounce, heartbeat
    glow.ts                — glow, float
    spin.ts                — spin, shimmer
    progress.ts            — progress, pulse, marquee
  camera/
    camera.ts              — camX/Y/Z, goToPage, hitTest, easing
    input.ts               — pointer, wheel, keyboard handlers
  frame.ts                 — The main frame() loop
```

### Key Decisions

- **HTML files** imported as raw strings (Vite `?raw` or similar)
- **CSS** in one shared file — the `buildCSS(palette)` function stays but the
  static component classes move to a `.css` file for clarity
- **Per-page content** is separate files so pages can be added/removed independently
- **Animation registry** — new animations are just adding a file + registering the class name
- **This should become a reusable reference** — clean enough to fork and adapt

---

## 3. Interactivity — Text Editing & Caret

### Goal

Make text elements editable with a blinking caret, selection, and smooth cursor
movement. This is the foundation for building a code editor.

### Components

#### Caret (text cursor)
- A thin vertical rect rendered as a GPU instance
- Blinks at ~530ms interval (standard cursor blink rate)
- Position: world-space (x, y) derived from glyph metrics
- Must track the current character index within the text content

#### Text editing
- Click on an editable element → enter edit mode, place caret
- Arrow keys → move caret by character (with kerning-aware stepping)
- Home/End → jump to line start/end
- Backspace/Delete → remove character before/after caret
- typing → insert character at caret position
- Shift+arrows → selection range
- Selection highlight rendered as a colored rect behind selected glyphs

#### Smooth caret movement
- When caret moves (e.g. arrow key repeat), interpolate position over ~80ms
- Use the same easing system as camera movement (exponential decay)
- Selection anchors stay fixed while the other end animates

#### Focus management
- Only one element can be in edit mode at a time
- Click outside → exit edit mode, commit changes
- Tab → move to next editable element
- Escape → exit edit mode without committing

---

## 4. The Grand Goal — An Analytical Code Editor

### Vision

A code editor like Monaco or Ace, but:
- **Rendered entirely through windfoil's analytic GPU pipeline**
- **Infinitely zoomable** — zoom into any glyph and it stays razor sharp
- **Multiple files side by side** — complete view of an entire codebase
- **Zero texture lookups** — every character is a closed-form integral

### Core Architecture

```
┌─────────────────────────────────────────────────┐
│  Document Viewport (infinitely pannable/zoomable)│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ main.ts  │ │ gpu.ts   │ │ bands.ts │  ...   │
│  │──────────│ │──────────│ │──────────│        │
│  │ line  1  │ │ line  1  │ │ line  1  │        │
│  │ line  2  │ │ line  2  │ │ line  2  │        │
│  │ line  3▸ │ │ line  3  │ │ line  3  │        │
│  │   ...    │ │   ...    │ │   ...    │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  minimap (optional, scaled-down full view)       │
└─────────────────────────────────────────────────┘
```

### Features to Build

#### Multi-file view
- Each file is a "column" with its own scroll position
- Columns can be resized by dragging dividers
- Files can be pinned, closed, reordered
- A file tab bar at the top (rendered via windfoil)

#### Syntax highlighting
- Extend the current `highlightCode` to support more languages
- Token types: keyword, string, number, comment, function, type, operator, punctuation
- Each token type maps to a color in the palette
- Highlighting runs on the CPU (tokenizer) — results cached per file/buffer state

#### Line numbers
- Rendered as a gutter on the left side of each file column
- Right-aligned, muted color
- Current line highlighted

#### Code folding
- Detect matching braces / indentation blocks
- Folded regions collapsed to a "..." indicator
- Click to expand

#### Minimap
- A scaled-down rendering of the entire file in the right gutter
- Shows the current viewport as a highlighted region
- Clickable to jump to a position

#### Search & replace
- Ctrl+F opens a search bar (rendered as an editable windfoil element)
- Highlights all matches in the document
- Regex support
- Ctrl+H for replace

#### Multi-cursor editing
- Ctrl+D to select next occurrence
- Alt+Click to place additional carets
- All carets move in sync for multi-line editing

#### Language features (future)
- LSP integration via a web worker
- Autocomplete dropdown (rendered via windfoil)
- Error/warning squiggly underlines
- Go-to-definition highlights

### Performance Considerations

- **Glyph atlas** — only atlas characters that appear in visible files
- **Lazy atlas expansion** — as user scrolls/opens new files, add glyphs on demand
- **Viewport culling** — only layout/render glyphs in visible viewport
- **Incremental layout** — only re-layout lines that changed
- **Typed array direct writes** — avoid JS array intermediate for hot paths
- **Offscreen canvas** — run layout tokenization in a web worker

### Rendering Pipeline (Current → Future)

```
Current:
  walkDOM → layoutFlow/layoutPre → addRect/layoutStr → GPU draw call

Future (editor mode):
  Document model (tree-sitter or regex tokenizer)
    → visible range selection
    → incremental line layout (glyph positions + syntax tokens)
    → GPU instance buffer fill (backgrounds + glyphs + caret + selection)
    → single GPU draw call
```

---

## 5. Milestones

### Phase 1 — Foundation
- [ ] Split main.ts into modules (see architecture above)
- [ ] Fix dark mode contrast for cards and inline elements
- [ ] Extract HTML content into separate files
- [ ] Extract CSS into a shared file

### Phase 2 — Basic Editing
- [ ] Caret rendering (blinking vertical bar)
- [ ] Click-to-place caret
- [ ] Character insertion via keyboard
- [ ] Backspace/delete
- [ ] Arrow key navigation
- [ ] Basic text reflow after edits

### Phase 3 — Selection & Clipboard
- [ ] Shift+arrow selection
- [ ] Click+drag selection
- [ ] Ctrl+A select all
- [ ] Ctrl+C / Ctrl+V clipboard
- [ ] Selection highlight rendering

### Phase 4 — Multi-file Editor
- [ ] File tab bar (rendered via windfoil)
- [ ] Side-by-side file columns
- [ ] Column resizing
- [ ] Line numbers gutter
- [ ] Current line highlight

### Phase 5 — Code Intelligence
- [ ] Extended syntax highlighting (TypeScript, Python, WGSL)
- [ ] Code folding
- [ ] Bracket matching
- [ ] Auto-indent

### Phase 6 — Advanced
- [ ] Minimap
- [ ] Search & replace
- [ ] Multi-cursor
- [ ] LSP integration (web worker)
- [ ] Autocomplete
- [ ] Infinite zoom with adaptive glyph detail

---

## 6. Design Principles

1. **Analytic rendering** — every pixel is a closed-form integral, not a sample
2. **One draw call** — the entire editor viewport is a single GPU pass
3. **Zero texture lookups** — no bitmap fonts, no SDF, just math
4. **Infinitely zoomable** — zoom in 100x and every glyph is still perfect
5. **Reusable** — the rendering engine should be separable from the editor logic
6. **Performant** — 120fps target, even with large files and multiple panes
