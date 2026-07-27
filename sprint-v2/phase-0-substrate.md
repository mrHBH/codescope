# Phase 0 — Substrate repair

Sequential. Goal: make the codebase safe to build on — split the 62KB runtime,
fix stale docs, lock the integration contracts. Zero behavior change.

**Gate: CP1** (regression smoke) — see `checkpoints.md`.

---

## 0.1 — Split `src/authoring/runtime/runtime.ts` (62KB)

- [ ] Read the file fully first; confirm/refute the proposed seams in
      `NOTES.md` §3 OQ-7 before cutting.
- [ ] Extract focused modules (hypothesis: draw-emit, input/interactive
      contract, object-tree + chrome hooks, orbit-camera driving). Keep
      `runtime.ts` as the thin `SceneRuntime` wiring them.
- [ ] No API changes visible to `demo.ts`, `frame.ts`, scenes, or islands.
- **Acceptance:** `bunx tsc --noEmit` clean; `__test_timeline`, `__test_trace`,
  `__test_safeArea` green; `#authoring` + `#explainer-v2` render identically.

## 0.2 — Fix stale docs

- [ ] `AGENTS.md`: active-sprint line → windgraph v2 + pointer to `sprint-v2/`
      (handled with the AGENTS.md update that accompanies these docs — verify
      nothing else in it is stale).
- [ ] `PROGRESS.md`: add an IDE-FX-sprint section (registry, morph engine, 3D
      effects, physics/fireworks substrate) and mark Authoring v2 as archived-complete.
- **Acceptance:** a fresh reader of AGENTS.md → PROGRESS.md gets a true picture
  of what's active, done, and where.

## 0.3 — Fix `WINDGRAPH.md` §5 acceptance bar (decision D3)

- [ ] Carve-out: analytic-AA contract covers 2D content (strokes, fills,
      glyphs, math, chart chrome, shadow *edges*); sampled 3D (marching cubes,
      raymarch, 4D projection) is labeled "sampled", gets adaptive tessellation
      + silhouette refinement, and never claims the analytic guarantee.
- [ ] Tag the affected §F items (implicit surfaces, volume, 4D) inline.
- **Acceptance:** no internal contradiction remains between the headline pitch
  and the 3D catalog.

## 0.4 — Integration contracts note

- [ ] Write the primitives-vs-islands table (D1), the full `ObjectSpec` kind
      list for Phase 1 (point, segment, polyline, polygon, circle, arc,
      ellipse, vector, conic, plot-fn, plot-parametric, plot-polar,
      plot-implicit, field-vector, surface, curve3d, label, math, group,
      constraint-* constructions), and the board-adapter contract (hosts a
      `ConstraintGraph` scene; emits via `DrawHelpers`; routes pointer via
      `s.interactive` → `DragController`; exposes spec parameters to sliders).
- [ ] Place as `sprint-v2/contracts.md` (linked from NOTES.md) or as a header
      doc in `src/authoring/ir/` — agent's call; link it in `STATE.md`.
- **Acceptance:** Phase 1 tasks can be executed by an agent that reads only
  this contract + `ir/types.ts`.

---

**After 0.4:** run CP1. Only then enter Phase 1.
