# windgraph v2 — Integration contracts (task 0.4)

The design boundary between the authoring system and windgraph. Phase 1
executes against this doc; an agent should be able to build 1.1–1.6 from this
+ `src/authoring/ir/types.ts` alone.

---

## 1. Primitives vs islands (decision D1)

| Content kind | Nature | Home | Examples |
|---|---|---|---|
| **Object-like** | typed parameters, identity (named, addressable by id), draggable/measurable/serializable, per-object clips | **IR primitives**: `ObjectSpec` kinds → windgraph `Mobject`/`GObject` instances via `object-resolver` | points, segments, circles, conics, function plots, surfaces, labels, math, constraint constructions |
| **Field-like** | per-pixel / procedural, no sub-object identity, coarse config at most | **islands / shader passes** (existing `IslandSpec` + registry) | sdfField, coverageSweep, domain coloring, Mandelbrot/Julia, volume raymarch |
| **Hosting** | board slot, `DrawHelpers`, `s.interactive` input routing, discovery UI | **island plumbing, reused** by windgraph boards | windgraph board adapter (§4) |

Rules of thumb when classifying a new feature:
- Can the user grab *part* of it? → primitive.
- Does it have a formula with named coefficients worth binding sliders to? → primitive.
- Is it a pixel field or a renderer demo? → island.
- When unsure: primitive. Islands are the escape hatch, not the default.

Migration debt: `gdCurve`, `lineFit`, `lossContour`, `network` islands are
misfiled object-like content → Phase 6 cleanup (X1).

## 2. ObjectSpec kinds for Phase 1 (extends the existing union)

Existing kinds stay untouched: `text, glyph, rect, circle, polygon, line,
math, group, island`. New kinds (field sketches — final names/types in 1.1):

**Geometry primitives** (resolve to `windgraph/mobject/primitives`):
- `wg-point`: `{ at: Vec2 | ParamRef, free?: boolean, label?: string, color?, radius? }` → `Dot` + optional `Label`; `free` points are draggable and become `GPoint(free=true)` in the board's `ConstraintGraph`.
- `wg-segment`: `{ from: string, to: string }` (object ids) → `Segment` between resolved points.
- `wg-vector`: `{ from: Vec2|id, to: Vec2|id }` → `Vector` (arrow).
- `wg-polyline` / `wg-polygon`: `{ points: (Vec2|string)[] }` (mix of literal coords and point ids).
- `wg-circle`: `{ center: string|Vec2, radius: number|string(id) }` → `Circle`.
- `wg-arc` / `wg-ellipse`: analogous.
- `wg-conic`: `{ kind: 'ellipse'|'hyperbola'|'parabola', foci?: string[], directrix?: string, ... }` (Phase 4 B5; stub kind in 1.1, full resolution later).

**Constraint constructions** (resolve to `windgraph/interact/constraints`,
registered in the board's `ConstraintGraph`; `inputs` = referenced object ids):
- `wg-midpoint {a, b}` · `wg-centroid {points[]}` · `wg-intersection {a, b}` ·
  `wg-glider {curve, t}` · `wg-reflection {p, axis}` ·
  `wg-line-through {a, b}` · `wg-perpendicular {line, point}` ·
  `wg-parallel {line, point}` · `wg-circumcircle {a, b, c}` ·
  `wg-angle {a, vertex, b}` · `wg-distance {a, b}` (last two render as labels).
- Validation mirrors `ConstraintGraph` cycle detection: referential integrity
  + acyclicity checked in `validate.ts` (extend, don't fork).

**Plots** (resolve to `windgraph/plot/*`; functions are JS at builder level,
serialized as expression strings once lane L lands — until then, specs carry
an `expr: string` parsed by a minimal evaluator, or builder-time closures for
programmatic scenes):
- `wg-plot-fn { expr|fn, domain?: [number,number], style? }` → `plotFunction`.
- `wg-plot-parametric { xExpr, yExpr, tRange }` → `plotParametric`.
- `wg-plot-polar { rExpr, tRange }` → `plotPolar`.
- `wg-plot-implicit { expr, style? }` → `plotImplicit` (marching squares exists).
- `wg-field { kind: 'vector'|'slope', expr(s), density? }` → field plotters.
- `wg-surface { expr, domain, res? }` → mesh3d surface (Phase 2+/lane F3D).

**Composite**:
- `wg-group`: reuse existing `group` — windgraph objects can be children of
  pages/groups like any spec.

Every numeric/point field accepts `ParamValue | ParamRef` exactly like
`IslandSpec.params` — that is the slider-binding mechanism (D7); no new
parameter system.

## 3. Clip → Animation mapping (extends `ClipSpec.kind`)

Existing kinds: `fadeIn, fadeOut, draw, write, moveTo, scaleTo, rotateTo,
morph, param`. `builder/clips.ts` (task 1.3) maps:

| Clip kind | windgraph target |
|---|---|
| `draw` | `Create` (partial-length reveal) |
| `write` | MathTex write-on |
| `fadeIn/fadeOut` | `FadeIn/FadeOut` |
| `moveTo/scaleTo/rotateTo` | `MoveTo/ScaleTo/Rotate` |
| `morph` | `Transform` (path-correspondence morph; `resample`/`pointAtFraction`) |
| `param` | `TrackerAnim` on a `ValueTracker` bound to a scene param |
| **new** `moveAlongPath` | `MoveAlongPath` (target object + path object id) |

`EasingName` already matches the windgraph easing library 1:1 — reuse
`windgraph/anim/easing` directly (the authoring runtime already imports it).

## 4. Windgraph board adapter contract (task 1.4)

A board that hosts a resolved windgraph scene. Mirrors the island plumbing so
it composes with everything existing:

- **Emit signature** (match the system's grain):
  `emit(font, atlas, inst, crv, rws, now, view)` — same as windgraph v1 boards
  (`src/frame.ts:398-430` pattern), wrapped in `EmitCache` with a signature
  built from param values + constraint outputs (dirty-tracking comes free:
  unchanged signature → replay cached slice).
- **Owns one `ConstraintGraph`**: object-resolver (1.2) registers free +
  constrained GObjects; `update()` runs once per frame only when a param or a
  dragged point changed (`paramVersion`-style rev counter).
- **Input routing**: registers through the existing `s.interactive` contract —
  reuse the priority pattern in `src/camera/input.ts:143,169,321` (handle grab
  before camera pan). Drag maps pointer world-coords → nearest free `GPoint`
  within pick radius → `DragController`. No new input paths.
- **Sliders** (1.5): every `ParamDef` in the doc surfaces as a live slider;
  writes go through `setParam` → constraint recompute → cache invalidation.
- **REPL** (1.6): commands operate on the live doc + `invalidateCaches()`
  (the existing SceneRuntime hook) so edits re-resolve.
- **Discovery**: playground toolbar button per board (existing pattern,
  `playground.ts:298-302`). Gallery question deferred to OQ-5/CP6.

## 5. What explicitly does NOT change

- `SceneDoc` JSON shape stays round-trippable; new kinds are additive.
- Island registry/contract untouched.
- `SceneRuntime` public API untouched (Phase 0.1 split preserved it).
- Authoring runtime's own shape drawing (rect/text/circle via `DrawHelpers`)
  stays — it is the document chrome path, not the math path.
