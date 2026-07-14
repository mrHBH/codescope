# Phase 8 — Export, docs, gallery, polish

**Status:** not started · **Depends on:** Phases 0–6 (7 optional) · **Blocks:** —

## Goal
Make windgraph shippable: vector export, animation capture, a clean public API,
documentation, an examples gallery, and a performance pass.

## Scope
### Export (answers the "PDF?" question)
- [ ] **SVG export** of a frame: contours → SVG `<path>` (our quads → `Q`/`L` ops),
      text → outlined paths or `<text>`; styles → SVG attrs.
- [ ] **PDF export** of a frame: same contours → PDF content-stream path ops
      (publication-quality vector figures).
- [ ] Animation capture: render a frame sequence → WebM/GIF (or PNG frames).
- [ ] (Explicitly **out of scope:** rendering/importing *arbitrary* PDFs — a
      separate, much larger problem.)

### API + docs
- [ ] Ergonomic public API (`Scene`, `plot`, `MathTex`, `play`, …) — Manim-familiar
      where sensible, but idiomatic TS.
- [ ] Typedoc + a "getting started" guide.
- [ ] Examples gallery + a landing demo (reuse the cinematic-flight machinery).

### Performance
- [ ] Instance-buffer diffing / dirty-region tracking so idle frames upload less.
- [ ] Geometry caching + incremental re-tessellation only on change.
- [ ] Benchmark harness (honest FPS/overdraw numbers, tab focused).

## Acceptance criteria
- A plotted+animated figure exports to SVG **and** PDF as crisp vector output.
- An animation exports to a shareable video/GIF.
- Public API is documented; gallery runs; landing demo impresses.
- Idle scenes cost ~0 upload; large scenes stay at 60fps (tab focused).

## Notes
- SVG/PDF export is natural because everything is already Béziers + positioned
  glyphs — a direct serialization, not a re-render.
- Keep the export path independent of the GPU (pure geometry → file), so it works
  headless (server-side figure generation).
