# Phase 0 — Substrate repair

Sequential. Goal: make the codebase safe to build on — split the 62KB runtime,
fix stale docs, lock the integration contracts. Zero behavior change.

**Gate: CP1** (regression smoke) — see `checkpoints.md`.

---

## 0.1 — Split `src/authoring/runtime/runtime.ts` (62KB) ✅

- [x] Read the file fully first; confirm/refute the proposed seams (→ D8).
- [x] Extracted: `runtime/shared.ts` (state-free helpers), `runtime/emitObject.ts`
      (object emit behind `ObjectEmitHost`), `runtime/dragControl.ts` (drag/hit
      behind `DragHost`). Camera/playback/layout stayed on the class (too
      state-entangled). 1311 → 677 lines.
- [x] No API changes visible to `demo.ts`, `frame.ts`, scenes, or islands.
- **Acceptance:** `bunx tsc --noEmit` clean ✅; all 58 authoring tests green ✅;
  visual identity to be confirmed at CP1.

## 0.2 — Fix stale docs ✅

- [x] `AGENTS.md`: active-sprint line → windgraph v2 + `sprint-v2/` read-order;
      §3 map updated (windgraph = active focus; authoring/fx/playground roles);
      removed dead `memories/repo/codescope.md` reference (file doesn't exist).
- [x] `PROGRESS.md`: §0c added (IDE FX sprint: registry, fxXforms, effects,
      box3d physics, analytic chrome) + windgraph v2 pointer; date bumped.
- **Acceptance:** a fresh reader of AGENTS.md → PROGRESS.md gets a true picture
  of what's active, done, and where. ✅

## 0.3 — Fix `WINDGRAPH.md` §5 acceptance bar (decision D3) ✅

- [x] Carve-out written: analytic-AA contract covers 2D content (strokes,
      fills, glyphs, math, chart chrome, shadow *edges*); sampled content is
      labeled, gets adaptive tessellation + silhouette refinement, never claims
      the guarantee.
- [x] Tagged affected items inline: implicit surfaces, 4D projection, volume
      raymarch, fractal interiors (boundary stays analytic where feasible).
- **Acceptance:** no internal contradiction remains between the headline pitch
  and the 3D catalog. ✅

## 0.4 — Integration contracts note ✅

- [x] `sprint-v2/contracts.md` written: primitives-vs-islands table (D1),
      ObjectSpec kind sketches (geometry, constraints, plots, surface),
      clip→Animation mapping, board-adapter contract, ParamRef reuse note (D7).
- [x] Linked from NOTES.md (D7) and README doc map.
- **Acceptance:** Phase 1 tasks can be executed by an agent that reads only
  this contract + `ir/types.ts`. ✅

---

**After 0.4:** run CP1. Only then enter Phase 1.
