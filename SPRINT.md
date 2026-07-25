# Windfoil IDE Effects — Sprint Plan (v3)

True 3D effects, a modular per-file FX architecture, a reusable morph engine,
and morph-driven spatial effects that are **impossible in a CSS-based IDE**.

This document covers the active sprint. The Authoring System v2 sprint
(`SPRINT.md` archive) is complete — see `PROGRESS.md` for its status.

---

## 0. What this sprint delivers

1. **Modular FX architecture** — every effect lives in its own file under
   `src/ide/fx/`, registered via a central registry. `ide.ts` holds zero
   effect logic; it calls a single dispatcher. Adding a new effect = one
   new file + one line in the registry.
2. **Per-instance 3D transform pipeline** — `fxXforms` storage buffer
   (rotX, rotY, z, scale) in the vertex shader, driven per-frame from JS.
   Already shipped; this sprint extends it to 9 new 3D effects.
3. **Morph engine** — a reusable glyph-correspondence + interpolation system
   that generalizes the `logo` effect's formation logic into a first-class
   utility. Any effect (or external trigger) can compute per-glyph target
   positions/rotations/colors and the engine interpolates with easing.
4. **Morph-driven spatial effects** — function↔card collapse, rename flight,
   timeline scrub, extract-detach. These exploit the analytic pipeline's
   unique property: glyphs are vector instances that can morph continuously
   between arbitrary configurations while staying perfectly anti-aliased.

---

## 1. Architecture decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **One effect per file** under `src/ide/fx/`. Each exports a `Fx` object implementing the `Fx` interface from `types.ts`. | Modularity, readability, zero risk to siblings when adding/editing. |
| D2 | **Central registry** (`registry.ts`) maps FxMode string → Fx object. `index.ts` re-exports `FX_NAMES`, `FxMode`, and `REG`. | Single source of truth for the menu and the dispatcher. |
| D3 | **`ide.ts` holds zero effect logic.** It imports `REG` and calls `REG[fxMode]?.apply(ctx)` in a one-line dispatcher. Stateful effects own their state internally (closures or class instances). | Keeps ide.ts under 1200 lines; effects are independently testable. |
| D4 | **Morph engine is a utility** (`src/ide/fx/morph.ts`), not an effect. Effects import it. External triggers (zoom, rename, timeline scrub) also import it. | Reusable across multiple effects and non-effect triggers. |
| D5 | **`fxXforms` buffer** (binding 4, `vec4f` per instance: rotX, rotY, z, scale) is the 3D transform channel. The vertex shader applies Euler X→Y rotation around glyph center + z-offset + scale. Fragment shader unchanged. | Already shipped; the analytic coverage integral is rotation-invariant. |
| D6 | **Depth write stays OFF** on the windfoil pass. Flying glyphs are appended last in the instance buffer (painter order) and are always z≥0 (above the plane), so they composite correctly without depth writes. Depth writes cause z-fighting on coplanar 2D instances under perspective. | Proven by the banding bug fix. |
| D7 | **No new npm dependencies.** Pure TS over existing modules. | Sprint rule from v2. |

---

## 2. The Fx contract

```ts
interface FxCtx {
  now: number;           // wall-clock ms
  t: number;             // seconds (now / 1000)
  dt: number;            // frame delta ms
  w: number; h: number;  // layout dimensions (CSS px)
  mx: number; my: number; // mouse position (doc-local)
  cam3d: boolean;        // orbit camera active
  inst: number[];        // original instance buffer (read-only)
  instFA: Float32Array;  // working instance buffer (mutate freely)
  fxXforms: Float32Array; // per-instance 3D transforms (4 floats each)
  instCount: number;     // inst.length / 16
  i: number;             // current instance byte-offset (0, 16, 32, …)
  wx: number; wy: number; // world position of current instance
  glyph: boolean;        // inst[i+3] < 1.5
  hash: number;          // deterministic per-instance hash [0,1)
  xi: number;            // (i/16)*4 — index into fxXforms
  ox: number; oy: number; // accumulated 2D offset (applied after apply())
  fx3dActive: boolean;   // set true if any xform is non-zero
  extraCount: number;    // extra instances appended by postFrame
  ensureInstFA(floats: number): void;
  allocXforms(totalInstances: number): void;
  tilt?: (polar: number) => void; // request orbit camera tilt
}

interface Fx {
  uses3d?: boolean;
  onEnter?(ctx: FxCtx): void;
  onExit?(ctx: FxCtx): void;
  onClick?(ctx: FxCtx, wx: number, wy: number): void;
  preFrame?(ctx: FxCtx): void;
  apply(ctx: FxCtx): void;       // called per-instance
  postFrame?(ctx: FxCtx): void;
  extras?(): { instFA: Float32Array; xforms: Float32Array; count: number } | null;
}
```

---

## 3. Morph engine

The morph engine generalizes the `logo` effect's glyph-formation logic into
a reusable utility. It provides:

1. **GlyphCorrespondence** — maps instance indices to sequential glyph indices
   (same as `logoGlyphMap` but reusable and cached).
2. **MorphTarget** — per-glyph target: position, rotation, z, scale, color.
3. **MorphStrategy** — a function that computes targets from current glyph
   positions. Built-in strategies: `formation(points)`, `collapse(center)`,
   `explode(center, radius)`, `grid(cols, rows, cellSize)`, `stack(z)`.
4. **MorphState** — holds targets + progress + easing. The `apply` method
   interpolates each glyph from its current position to its target.

Effects that use morphing import `morph.ts` and call:
```ts
const corr = buildGlyphMap(inst);
const targets = computeTargets(inst, corr, strategy);
applyMorph(ctx, corr, targets, progress, easing);
```

External triggers (zoom threshold, rename event, timeline scrub) set
`progress` from 0→1 and the morph engine handles the rest.

---

## 4. File map

**New (this sprint):**
```
src/ide/fx/
  types.ts              FxCtx, Fx interface, shared helpers (fxHash, hueRgb, etc.)
  cloth.ts              2D cloth wave + cursor repulsion
  matrix.ts             Matrix rain columns
  heartbeat.ts          Radial pulse wave
  glitch.ts             Slice displacement + color channel swap
  aurora.ts             Sinusoidal wave + hue shift
  blackhole.ts          Cursor-centered swirl + crush
  earthquake.ts         Seismic shake + traveling wave
  fireworks.ts          3D radial burst + spawned particles (stateful)
  supernova.ts          Expanding ring + scorch (stateful)
  dissolve.ts           Left-to-right sweep dissolve (stateful)
  logo.ts               Glyph formation morph (stateful)
  ocean.ts              3D wave field with slope-tilted glyphs
  dome.ts               Radial z-bulge breathing lens
  fan.ts                Row-staggered z-planes card fan
  tornado.ts            Cursor vortex: z-rise + orbit + spin
  standup.ts            Cursor magnet: glyphs tilt to face camera
  curl.ts               Page curl fold line follows cursor X
  shatter.ts            Violent 3D burst → eased reassembly
  ripple.ts             Concentric z-waves from click
  helix.ts              Launched glyphs settle into rotating double-helix
  morph.ts              Morph engine: GlyphCorrespondence + strategies + apply
  registry.ts           REG map + FX_NAMES + FxMode
  index.ts              Barrel re-export
```

**Modified (targeted edits only):**
- `src/ide/ide.ts` — replace inline FX switch with registry dispatcher;
  remove moved constants and state; import from `./fx`.
- `src/windfoil/windfoil.wgsl` — no changes (already has fxXforms).
- `src/windfoil/gpu.ts` — no changes (already has xformBuf + fxActive).

---

## 5. Phase plan

| Phase | Goal | Acceptance |
|-------|------|-----------|
| **P1 Refactor** | Port 4 remaining effects; build registry + index; rewire ide.ts | `bunx tsc --noEmit` clean; all 12 existing effects work identically |
| **P2 Morph engine** | GlyphCorrespondence + strategies + applyMorph | Unit-testable; logo effect refactored to use it |
| **P3 3D effects** | 9 new effects (ocean, dome, fan, tornado, standup, curl, shatter, ripple, helix) | Each visible in FX menu; typecheck clean |
| **P4 Morph effects** | function-card, rename-flight, timeline-scrub, extract-detach | CHECKPOINT per effect |
| **P5 Polish** | Menu grouping, perf verification, PROGRESS.md update | Typecheck + build clean |

Dependencies: P1→P2→P3 (P3 effects may use morph engine from P2).
P4 depends on P2. P5 last.

---

## 6. Execution rules

1. **Follow `SPRINT-TODO.md` literally.** Zero design freedom.
2. **One task at a time.** Typecheck after each.
3. **Never overwrite an existing file.** Targeted `edit` only.
4. **No new npm dependencies.**
5. **Visual checkpoints belong to the user.**
6. **No git commits unless asked.**
7. **Match existing code style.** No comments unless the existing file has them.
