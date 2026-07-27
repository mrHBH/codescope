# Phase 1 — windgraph objects as IR primitives

Sequential (IR is shared substrate). Builds the object-resolver layer the
archived authoring sprint designed (`oldsprintplan/SPRINT.md:196,231-234`) but
never shipped. Extends the existing IR — decision D7: `ObjectSpec`, `ClipSpec`,
and the parameter system (`ir/types.ts:209-212`) already exist.

**Gate: CP2** (the drag feel) — the adapter contract is cheap to change now
and expensive forever after.

---

## 1.1 — IR: windgraph ObjectSpec kinds ✅

- [x] 22 new kinds (`WgNum`/`WgPoint` value types; `ParamRef` reuse) in
      `ir/types.ts` per contracts.md §2; `wg-conic` is a validated stub
      (resolver throws → Phase 4 B5).
- [x] `validate.ts`: per-kind checks, wg object-ref integrity, full-graph cycle
      DFS (catches constraint cycles disconnected from any root), `$param`
      walk generalized to any spec field incl. arrays, plot `expr` syntax
      checked via the new `windgraph/expr.ts` compiler (25 tests).
- [x] `serialize.ts` needed no changes (generic); round-trip tests in
      `__test_ir.ts` (29 total).

## 1.2 — `runtime/object-resolver.ts` ✅

- [x] `WgScene`: dependency-ordered worklist build → `ConstraintGraph` (world
      space) + ordered Mobject draw list; `AliasPoint`/`ParamPoint`/
      `ParamCircle` adapter GObjects; live `pt()`/`num()` source closures;
      syncables mark mobjects dirty after each `graph.update()`.
- [x] Param mutation: `update()` re-runs the topo order; plots resample only
      when the numeric-param signature changes.
- [x] Implicit plots + fields = view-dependent direct draws; fn/parametric/
      polar plots = Mobject polylines split at discontinuities.
- [x] 12 tests (drag recompute, glider projection, out-of-order chains,
      measures, cycle + kind-mismatch errors).

## 1.3 — Builder: `builder/objects.ts` + `builder/clips.ts` ✅

- [x] `WgBuilder` with all 22 kinds; exposed as `SceneBuilder.wg` (scene-level)
      and `ChapterBuilder.wg` (parents under the chapter; data-space coords,
      NO chapter offset).
- [x] Clip mapping: existing kinds target wg ids unchanged; new
      `moveAlongPath` ClipSpec kind (types + validate props.path + builder +
      `clips.ts` helper).
- [x] 13 builder tests (incl. full construction kit + param-ref radius).

## 1.4 — Windgraph board adapter ✅

- [x] `playground/boards/windgraphScene.ts`: `WindgraphSceneBoard` hosts an
      authored `demoDoc()` (triangle kit + glider + angle/distance labels +
      `a·sin(x)` wave + param-radius circle); owns the `s.interactive` slot —
      supersedes v1 `InteractDemo` (same position/button; `autoDrive` kept for
      the cinematic flight; v1 file retained as reference).
- [x] `EmitCache` signature `rev|hoveredId|tile-quantized-view`; hover ring;
      board chrome (border + title); plane grid/axes under the scene.
- [x] 8 board tests (drag recompute, glider, hover, autoDrive).

## 1.5 — Slider binding + `emitTS` projection ✅

- [x] Analytic sliders on the board: one per numeric `ParamDef` (min/max/step
      from the IR), screen-constant size (∝ 1/zoom), knob-drag → quantized
      `setParam`, hit-tested before scene points.
- [x] `emitTS` projects all wg kinds — scene-level orphans → `s.wg.*`,
      chapter children → `ch.wg.*`, `$param` → `s.param.ref('…')`,
      `moveAlongPath` clips; deterministic. 9 emit tests.

## 1.6 — REPL windgraph commands ✅

- [x] `wgRepl(board, line)`: `help/list/params/plot/point/circle/slider/drag/
      remove/emit`; mutations validate the whole doc, roll back on error,
      rebuild the live scene; `emit` prints the builder TS of the live scene.
- [x] Terminal-agnostic by design (returns lines) — terminal UI hookup is
      Phase-6 chrome (Lane I). 13 board tests total.
- [ ] ~~`anim <clip>` command~~ — deferred: needs the runtime clip→Animation
      integration (clips currently evaluate in the authoring timeline, not the
      board; lands when the board grows timeline support — track in Phase 5 J).

---

**After 1.6:** run CP2.
