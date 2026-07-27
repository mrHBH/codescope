# Phase 1 — windgraph objects as IR primitives

Sequential (IR is shared substrate). Builds the object-resolver layer the
archived authoring sprint designed (`oldsprintplan/SPRINT.md:196,231-234`) but
never shipped. Extends the existing IR — decision D7: `ObjectSpec`, `ClipSpec`,
and the parameter system (`ir/types.ts:209-212`) already exist.

**Gate: CP2** (the drag feel) — the adapter contract is cheap to change now
and expensive forever after.

---

## 1.1 — IR: windgraph ObjectSpec kinds

- [ ] New kinds per the 0.4 contract, each with typed parameter schemas that
      reuse the existing param system (`number` w/ min/max/step, point, color…).
- [ ] Constraint-construction specs (midpoint, intersection, glider,
      perpendicular, circumcircle…) reference object ids — extend `validate.ts`
      referential-integrity + cycle checks (mirror `ConstraintGraph` cycle detection).
- [ ] `serialize.ts` round-trip coverage; extend `__test_ir.ts`.
- **Acceptance:** every new kind validates, rejects bad refs/cycles, and
  round-trips JSON; tests green.

## 1.2 — `runtime/object-resolver.ts`

- [ ] ObjectSpec → windgraph `Mobject` / `GObject` instances; free vs
      constrained objects feed a `ConstraintGraph` owned by the board.
- [ ] Parameter mutation re-resolves incrementally (only the dirty dependency
      cone — the topo order already exists).
- **Acceptance:** unit test: spec tree → mobject/constraint graph; parameter
  change recomputes only dependents.

## 1.3 — Builder: `builder/objects.ts` + `builder/clips.ts`

- [ ] Builder methods for every new kind, matching `builder/scene.ts` style
      (extend, never fork — reconcile with its existing vocabulary first).
- [ ] `AnimationClip` → windgraph `Animation` subclass mapping (Create, Fade,
      Transform/morph, MoveAlongPath, Shift/Scale/Rotate); extend `ClipSpec`
      kinds if needed.
- [ ] Extend `__test_builder.ts`.
- **Acceptance:** a scene authored in builder TS with windgraph objects +
  clips evaluates; tests green.

## 1.4 — Windgraph board adapter

- [ ] A board that hosts a resolved scene: emits via `DrawHelpers` + windgraph
      stroke/fill into the standard `emit(font, atlas, inst, crv, rws, now, view)`
      signature; `EmitCache`-friendly (geometry cached, dirty on param change).
- [ ] Pointer routing through the existing `s.interactive` contract →
      `DragController` (reuse `camera/input.ts:143,169,321` priority pattern).
- [ ] Register a playground board button (`playground.ts:298-302` pattern).
- **Acceptance:** board with authored draggable triangle + live
  centroid/circumcircle; drag recomputes at 60fps; idle frames upload nothing new.

## 1.5 — Slider binding + `emitTS` projection

- [ ] Free numeric/point parameters in any spec surface as live sliders
      (reuse the IR param metadata — min/max/step already there).
- [ ] `emitTS.ts` projects the new kinds + slider state back to builder TS.
- [ ] Extend `__test_emit.ts`.
- **Acceptance:** board: SceneDoc-authored `y = a·sin(x)` with a slider for
  `a`; round-trip emit reproduces the scene code.

## 1.6 — REPL windgraph commands

- [ ] `plot <expr>`, `point`, `circle`, `drag <id>`, `slider <id> <v>`,
      `anim <clip>` over the live board, following `repl.ts` registration style.
- **Acceptance:** a REPL session can build and manipulate a small scene live.

---

**After 1.6:** run CP2.
