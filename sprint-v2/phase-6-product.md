# Phase 6 — Product surface

Mostly sequential: chrome touches everything, so it goes first and carefully.
Export + perf follow; island migration cleanup last.

**Gate: CP8** (final).

---

## Lane I — analytic chrome (10, sequential; pattern = D5, GPU-rendered)

- [ ] **I1** Hover tooltips: value readout on any curve/point/surface
      (analytic rounded-rect + text, camera-facing in 3D).
- [ ] **I2** Crosshair + trace: pointer x → moving dot on every plotted curve
      + coordinate readout (Desmos core UX).
- [ ] **I3** Expression sidebar: object/expression list, visibility eye, color
      chip, lock, inline edit (click label → edit formula) — analytic-rendered
      panel, following the AnalyticToolbar pattern (commits `d83c839`+).
- [ ] **I4** Object inspector / style panel (stroke width, dash, color, fill opacity).
- [ ] **I5** Undo/redo stack over construction mutations (spec-level ops).
- [ ] **I6** Selection: click, box, lasso; multi-select; delete/duplicate.
- [ ] **I7** Snapping: to grid, to object, to intersection (magnet cursor).
- [ ] **I8** Context menu per object (edit, style, trace, physics, export) —
      extends the existing analytic context menu (commit `a4473e4`).
- [ ] **I9** Ticker/actions: `on click`, `on tick` rules driving variables —
      the declarative bridge to physics triggers (H2 events).
- [ ] **I10** Linked views / brushing: select in scatter → same rows highlight
      in histogram, contour, and 3D cloud (extends E5's first instance).

## Lane M — export & interop (6)

- [ ] **M1** SVG export (contours are Béziers — near-free) · PNG via GPU readback.
- [ ] **M2** Copy-expression-as-LaTeX · board-state URL serialization
      (SceneDoc is JSON — mostly free).
- [ ] **M3** PDF export · WebM/GIF animation capture (frame-sequence encoder).
- [ ] **M4** TikZ/pgfplots codegen (GeoGebra parity).
- [ ] **M5** CSV/JSON drag-and-drop import → auto scatter/line/bars specs.
- [ ] **M6** glTF export of the 3D scene (mesh3d geometry is already triangles).

## Lane N — perf gates (acceptance criteria, verified not built)

- [ ] **N1** Dirty-tracking proven: slider drag recomputes only the
      ConstraintGraph dependency cone; idle frames upload nothing.
- [ ] **N2** Geometry caching: re-tessellation only on param change (extend
      `EmitCache` usage across all new boards).
- [ ] **N3** GPU picking (color-id pass) for dense scenes beyond current hit-test.
- [ ] **N4** Benchmark boards, all @60fps: 10k-segment curve · 5k-point scatter
      · 200-slider scene · 500-ball Galton. Numbers recorded in NOTES.md.

## Cleanup — taxonomy enforcement (D1)

- [ ] **X1** Migrate `gdCurve`, `lineFit`, `lossContour`, `network` islands to
      windgraph primitives (spec kinds + board adapter hosting).
- [ ] **X2** Retire their island registrations; unify discovery UI (resolve OQ-5).
- [ ] **X3** Settle the name (OQ-6) before any export/branding surface ships.

---

**After everything:** run CP8.
