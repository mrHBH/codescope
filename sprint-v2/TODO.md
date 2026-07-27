# windgraph v2 — Master TODO

Master checklist across all phases. Details, files, and acceptance criteria
live in the phase files — check boxes here AND there. Work top-down; never
start a phase before its predecessor's checkpoint passed (`checkpoints.md`).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `~~struck~~` = culled by a CP verdict

---

## Phase 0 — Substrate repair (`phase-0-substrate.md`)
- [x] 0.1 Split `runtime/runtime.ts` (62KB) — behavior-identical, tests green
- [x] 0.2 Fix stale docs (AGENTS.md, PROGRESS.md)
- [x] 0.3 Fix `WINDGRAPH.md` §5 analytic-vs-sampled carve-out (D3)
- [x] 0.4 Integration contracts note (primitives vs islands, ObjectSpec kinds, adapter contract)
- [ ] **CP1 passed** — regression smoke

## Phase 1 — Object model (`phase-1-object-model.md`)
- [ ] 1.1 IR windgraph ObjectSpec kinds + validation + round-trip tests
- [ ] 1.2 `runtime/object-resolver.ts` (spec → Mobject/GObject, incremental re-resolve)
- [ ] 1.3 `builder/objects.ts` + `builder/clips.ts`
- [ ] 1.4 Windgraph board adapter (hosts ConstraintGraph scene, s.interactive routing)
- [ ] 1.5 Slider binding + `emitTS` projection
- [ ] 1.6 REPL windgraph commands
- [ ] **CP2 passed** — the drag feel

## Phase 2 — Moat foundation (`phase-2-moat-foundation.md`)
- [ ] 2.1 Promote elevation/extrude/faceTilt to Mobject properties (fxXforms without FX)
- [ ] 2.2 Extrude renderer (resolves OQ-1)
- [ ] 2.3 Glyph & math extrusion
- [ ] 2.4 Continuous camera tilt for any board
- [ ] 2.5 Analytic contact shadows (resolves OQ-2)
- [ ] **CP3 passed** — thesis kill-gate

## Phase 3 — Moat flagships (`phase-3-moat.md`) — lanes G ‖ H
- [ ] G1 bars ↔ columns · G2 scatter↔cloud + heatmap↔heightfield · G3 pie↔cylinder
- [ ] G4 ribbon → surface morph
- [ ] G5 **contours → surface** (flagship)
- [ ] G6 cinematic flight capture
- [ ] **CP4 passed** — flagship #1
- [ ] H1 PhysicsBoard (shatter/reassemble) · H2 event bursts · H3 spring easings
- [ ] H4 **Galton board** (flagship, resolves OQ-4)
- [ ] H5 beeswarm + ball-on-surface
- [ ] **CP5 passed** — flagship #2

## Phase 4 — Parity fan-out (`phase-4-parity.md`) — lanes A ‖ B ‖ C ‖ D ‖ K
- [ ] A1–A18 plot catalog (piecewise, inequalities, splines, tangents, ODE, Fourier, histogram, box/violin, contours, regression, financial, ternary…)
- [ ] B1–B12 geometry (centers, tangents, conics, inversion, **locus**, protocol replay…)
- [ ] C1–C7 stats/probability (distributions, CLT, Monte Carlo, correlation, CI…)
- [ ] D1–D6 linear algebra (matrix plane morph, determinant, eigen, SVD…)
- [ ] K1–K6 mathtex (matrices, cases, align, accents, arrows, formula↔graph binding)
- [ ] **CP6 passed** — gallery cull (culls recorded as strikes in Phases 5–6)

## Phase 5 — Depth (`phase-5-depth.md`) — lanes F3D ‖ L ‖ E ‖ J
- [ ] F3D-1…9 3D catalog (parametric/implicit surfaces, solids of revolution, slicing, quadrics…)
- [ ] L1–L7 expression engine + lite CAS (parser→ConstraintGraph, regressions, symbolic diff, REPL calc mode)
- [ ] E1–E5 graph theory (named graphs, force layout, algorithm animations…)
- [ ] J1–J6 animation extensions (scrub, stagger, reveal, physics handoff, camera crane, explain mode)
- [ ] **CP7 passed** — ship/fix/cut per lane

## Phase 6 — Product (`phase-6-product.md`)
- [ ] I1–I10 analytic chrome (tooltips, crosshair, sidebar, inspector, undo, selection, snapping, context menu, ticker, linked views)
- [ ] M1–M6 export (SVG/PNG, LaTeX/URL, PDF/WebM, TikZ, CSV import, glTF)
- [ ] N1–N4 perf gates (dirty-tracking, caching, GPU picking, benchmarks)
- [ ] X1–X3 cleanup (math islands → primitives, gallery unification, naming)
- [ ] **CP8 passed** — final
