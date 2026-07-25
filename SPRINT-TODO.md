# Windfoil IDE Effects — Master Task List (v3)

**Zero-decision executor document.** Every task tells you exactly what file to
create or edit, what to write, what command to verify, and when to mark done.
If anything is ambiguous, **STOP and ask the user**.

**Context:** Read `SPRINT.md` for architecture, the Fx contract, morph engine
design, and file map.

---

## 0. Execution protocol

1. **Read before you write.** Each phase lists required reading.
2. **Never overwrite.** Use `edit` for existing files, `write` for new.
3. **One task at a time.** Verify after each. Mark `[x]` only when done.
4. **Typecheck after every task:** `bunx tsc --noEmit`.
5. **Visual checkpoints belong to the user.**
6. **No git commits.** No new npm dependencies. No scope creep.
7. **No comments** unless the existing file already has them in the section
   you're editing.

---

## Command reference

```bash
bun run dev           # Vite dev server port 3000
bunx tsc --noEmit     # Typecheck after EVERY task
```

---

## Phase 1 — FX Module Refactor

**Goal:** Port 4 remaining stateful effects to per-file modules. Build
registry + index. Rewire ide.ts to a tiny dispatcher. Delete all inline
FX logic from ide.ts.

**Required reading:** `src/ide/fx/types.ts` (the Fx contract), the 7 already-
ported effect files (cloth.ts … earthquake.ts) for the pattern, and the
current inline FX code in `src/ide/ide.ts` lines 23–41 (constants), 566–575
(state vars), 988–1018 (logo setup + fx3dActive), 1020–1274 (the FX switch),
1280–1340 (spawned particles), 1459–1487 (onClick routing).

---

### P1-001 — Create `src/ide/fx/fireworks.ts`

**Files to create:** `src/ide/fx/fireworks.ts`

**What to write:** A stateful Fx module. Module-level state:
- `fxClicks: { x: number; y: number; t: number }[]`
- `fwParticles: FwParticle[]` (interface: src, x, y, vx, vy, vz, z, rotX, rotY, spinX, spinY, birth, life)
- `extraFA: Float32Array` and `extraXF: Float32Array` for spawned particle instances/xforms
- `extraCount: number`

Constants: `FW_R = 220, FW_R2 = FW_R*FW_R, FW_STR = 40, FW_LIFE = 3.0, FW_GRAV = 90, FW_Z_STR = 260, FW_SPIN = 4.5`

Import `fxHash` from `./types`.

Export `const fireworks: Fx` with:
- `uses3d: true`
- `onExit`: clear fxClicks, fwParticles, extraCount = 0
- `onClick(ctx, wx, wy)`: push to fxClicks if < 10; if cam3d, tilt to 0.55 if polar < 0.35; spawn up to 40 particles from nearby glyphs (copy the exact spawn logic from ide.ts lines 1461–1484)
- `preFrame(ctx)`: clear fxXforms for all instances (fill 0)
- `apply(ctx)`: the per-glyph firework displacement + 3D xform (copy exact logic from ide.ts lines 1102–1136). Use `ctx.fxXforms[ctx.xi]` etc. instead of local `xi` computation.
- `postFrame(ctx)`: advance spawned particles (copy exact logic from ide.ts lines 1281–1340). Write extra instances into `extraFA` and extra xforms into `extraXF`. Set `ctx.extraCount`.
- `extras()`: return `{ instFA: extraFA, xforms: extraXF, count: extraCount }` if extraCount > 0, else null.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-002 — Create `src/ide/fx/supernova.ts`

**Files to create:** `src/ide/fx/supernova.ts`

**What to write:** Stateful Fx module. Module-level state: `clicks: { x: number; y: number; t: number }[]`.

Constants: `SN_R = 240, SN_R2 = SN_R*SN_R, SN_LIFE = 1.8, SN_SPEED = 320`

Export `const supernova: Fx` with:
- `onExit`: clear clicks
- `onClick(ctx, wx, wy)`: push to clicks if < 10
- `apply(ctx)`: copy exact logic from ide.ts lines 1167–1202, using `clicks` instead of `fxClicks`.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-003 — Create `src/ide/fx/dissolve.ts`

**Files to create:** `src/ide/fx/dissolve.ts`

**What to write:** Stateful Fx module. Module-level state: `t0 = -1`.

Constant: `DISSOLVE_MS = 2800`

Export `const dissolve: Fx` with:
- `onExit`: t0 = -1
- `onClick(ctx)`: if t0 < 0, t0 = ctx.now
- `apply(ctx)`: copy exact logic from ide.ts lines 1204–1226, using `t0` and `ctx.now`.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-004 — Create `src/ide/fx/logo.ts`

**Files to create:** `src/ide/fx/logo.ts`

**What to write:** Stateful Fx module. Module-level state: `t0 = -1`, `targets: Float32Array | null`, `glyphMap = new Map<number, number>()`.

Import `wSDF` from `./types`.

Export `const logo: Fx` with:
- `onExit`: t0 = -1; targets = null; glyphMap.clear()
- `preFrame(ctx)`: if t0 < 0, build formation (copy exact logic from ide.ts lines 988–1009). Use `ctx.w`, `ctx.h`, `ctx.inst`, `ctx.now`.
- `apply(ctx)`: copy exact logic from ide.ts lines 1245–1268. Use `ctx.i` for instance index, `ctx.glyph` etc. When the glyph is in the map, set `ctx.instFA[ctx.i]` and `ctx.instFA[ctx.i+1]` directly (the logo effect overrides position, not just offset), then `continue` is not possible in the Fx contract — instead, set `ctx.ox = 0; ctx.oy = 0` and skip the offset application by checking a flag. Actually: the logo effect sets instFA[i] and instFA[i+1] directly AND uses `continue` to skip the `instFA[i] += ox` at the end. In the Fx contract, the caller applies `ox/oy` after `apply()` returns. So logo must set `ctx.ox = 0; ctx.oy = 0` when it overrides position directly, AND for non-mapped glyphs it sets alpha fade. This works because the caller does `instFA[i] += ox` which adds 0.

  For the `continue` case (mapped glyph): set position directly in instFA, set ox=0, oy=0. The caller's `instFA[i] += 0` is a no-op. Correct.

  For the non-mapped case: set `instFA[i+11] *= 1 - ease`, set ox=0, oy=0. Correct.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-005 — Create `src/ide/fx/registry.ts`

**Files to create:** `src/ide/fx/registry.ts`

**What to write:**
```ts
import type { Fx } from './types';
import { cloth } from './cloth';
import { matrix } from './matrix';
import { heartbeat } from './heartbeat';
import { glitch } from './glitch';
import { aurora } from './aurora';
import { blackhole } from './blackhole';
import { earthquake } from './earthquake';
import { fireworks } from './fireworks';
import { supernova } from './supernova';
import { dissolve } from './dissolve';
import { logo } from './logo';

export const FX_NAMES = ['off', 'cloth', 'matrix', 'heartbeat', 'glitch', 'aurora', 'fireworks', 'blackhole', 'supernova', 'dissolve', 'earthquake', 'logo'] as const;
export type FxMode = typeof FX_NAMES[number];

export const REG: Record<string, Fx | null> = {
  off: null,
  cloth, matrix, heartbeat, glitch, aurora,
  fireworks, blackhole, supernova, dissolve, earthquake, logo,
};
```

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-006 — Create `src/ide/fx/index.ts`

**Files to create:** `src/ide/fx/index.ts`

**What to write:**
```ts
export { FX_NAMES, REG } from './registry';
export type { FxMode } from './registry';
export type { Fx, FxCtx } from './types';
```

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P1-007 — Rewire `src/ide/ide.ts` to the registry dispatcher

**Files to edit:** `src/ide/ide.ts`

**What to change (targeted edits, in order):**

1. **Add import** at top (after existing imports):
   `import { REG, FX_NAMES, type FxMode, type FxCtx } from './fx';`

2. **Delete** lines 23–41 (the FX constants: REP_R, CLOTH_*, FW_*, BH_*, SN_*, DISSOLVE_MS, FX_NAMES, FxMode, fxHash, wSDF). These are now in the effect modules.

3. **Delete** the `fxXforms`, `fx3dActive`, `fwTiltTarget`, `FwParticle` interface, `fwParticles` declarations (around lines 567–575). Replace with:
   ```ts
   let fxXforms = new Float32Array(65536);
   let fx3dActive = false;
   let prevFxMode: FxMode = 'cloth';
   ```

4. **Delete** `logoT0`, `logoTargets`, `logoGlyphMap` declarations (around line 569–571).

5. **Replace the logo setup block** (lines ~988–1011) and the **fx3dActive block** (lines ~1013–1018) and the **entire FX switch** (lines ~1020–1274) and the **spawned particles block** (lines ~1280–1340) with this dispatcher:

   ```ts
   const fx = REG[fxMode] ?? null;
   const prevFx = REG[prevFxMode] ?? null;
   if (fxMode !== prevFxMode) {
     if (prevFx?.onExit) prevFx.onExit(makeCtx());
     if (fx?.onEnter) fx.onEnter(makeCtx());
     prevFxMode = fxMode;
   }

   fx3dActive = false;
   if (fx?.uses3d) {
     const need = (inst.length / 16) * 4;
     if (fxXforms.length < need) fxXforms = new Float32Array(need * 2);
     fxXforms.fill(0, 0, need);
   }

   if (fx?.preFrame) fx.preFrame(makeCtx());

   if (fx) {
     const t = now / 1000;
     const n = inst.length;
     for (let i = 0; i < n; i += 16) {
       const ctx = makePerInstCtx(i, t);
       fx.apply(ctx);
       instFA[i] += ctx.ox;
       instFA[i + 1] += ctx.oy;
     }
   }

   if (fx?.postFrame) fx.postFrame(makeCtx());

   let totalInst = inst.length;
   const extra = fx?.extras?.();
   if (extra && extra.count > 0) {
     if (instFA.length < inst.length + extra.count * 16) instFA = new Float32Array((inst.length + extra.count * 16) * 2);
     instFA.set(extra.instFA.subarray(0, extra.count * 16), inst.length);
     if (fxXforms.length < (totalInst / 16 + extra.count) * 4) fxXforms = new Float32Array((totalInst / 16 + extra.count) * 4 * 2);
     fxXforms.set(extra.xforms.subarray(0, extra.count * 4), (totalInst / 16) * 4);
     totalInst += extra.count * 16;
     fx3dActive = true;
   }
   ```

   Where `makeCtx()` builds a FxCtx with the frame-level fields (now, t, dt, w, h, mx, my, cam3d, inst, instFA, fxXforms, instCount, fx3dActive, ensureInstFA, allocXforms, tilt) and dummy per-instance fields (i=0, wx=0, wy=0, glyph=false, hash=0, xi=0, ox=0, oy=0, extraCount=0).

   Where `makePerInstCtx(i, t)` builds a FxCtx with the per-instance fields filled from `inst[i]`, `inst[i+1]`, `inst[i+3] < 1.5`, `fxHash(i)`, `(i/16)*4`, and shared frame fields.

   **IMPORTANT:** `fxHash` must be imported from `./fx/types` (or re-exported from `./fx/index`). Add it to the import.

6. **Replace the onClick FX routing** (lines ~1459–1487) with:
   ```ts
   const fxFn = REG[fxMode];
   if (fxFn?.onClick) {
     const clickCtx = makeCtx();
     clickCtx.now = performance.now();
     clickCtx.t = clickCtx.now / 1000;
     fxFn.onClick(clickCtx, wx, wy);
     if (clickCtx.fx3dActive) fx3dActive = true;
   }
   ```

7. **Replace the toolbar FX menu** (lines ~1824–1828) to use the imported `FX_NAMES` and `FxMode` (remove the local `FX_NAMES` / `FxMode` type if still present).

8. **Replace the status bar fx label** (line ~944) to use the imported `fxMode` variable (which still exists as `let fxMode: FxMode = 'cloth'`).

9. **Delete** the `dissolveT0` variable declaration (it's now in dissolve.ts).

10. **Update the `fxMode` declaration** to use the imported `FxMode` type:
    `let fxMode: FxMode = 'cloth';` (this should already be correct if the local type alias was deleted).

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean. The IDE runs with all 12 existing effects working identically. CHECKPOINT: user opens `bun run dev`, enters the IDE, cycles through all FX modes, confirms each looks the same as before.

---

### P1-008 — P1 checkpoint

- [ ] All P1 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User confirms all 12 effects work.

---

## Phase 2 — Morph Engine

**Goal:** Reusable glyph-correspondence + interpolation system. Refactor
logo effect to use it.

**Required reading:** `src/ide/fx/logo.ts` (current formation logic),
`src/ide/fx/types.ts`.

---

### P2-001 — Create `src/ide/fx/morph.ts`

**Files to create:** `src/ide/fx/morph.ts`

**What to write:** The morph engine utility. Exports:

```ts
export interface MorphTarget {
  x: number; y: number;
  rotX: number; rotY: number;
  z: number; scale: number;
  r: number; g: number; b: number; a: number;
}

export type MorphStrategy = (
  wx: number, wy: number, glyphIdx: number, total: number, w: number, h: number, hash: number
) => MorphTarget;

export function buildGlyphMap(inst: number[]): Map<number, number> {
  const m = new Map<number, number>();
  let g = 0;
  for (let i = 0; i < inst.length; i += 16) {
    if (inst[i + 3] < 1.5) m.set(i, g++);
  }
  return m;
}

export function computeTargets(
  inst: number[], glyphMap: Map<number, number>, strategy: MorphStrategy, w: number, h: number
): MorphTarget[] {
  const targets: MorphTarget[] = [];
  const total = glyphMap.size;
  for (const [i, gi] of glyphMap) {
    const hash = fxHash(i);
    targets[gi] = strategy(inst[i], inst[i + 1], gi, total, w, h, hash);
  }
  return targets;
}

export function applyMorph(
  ctx: FxCtx, glyphMap: Map<number, number>, targets: MorphTarget[],
  progress: number, ease: (t: number) => number
): void {
  const gi = glyphMap.get(ctx.i);
  if (gi === undefined) return;
  const tgt = targets[gi];
  if (!tgt) return;
  const p = ease(progress);
  const lx = ctx.inst[ctx.i], ly = ctx.inst[ctx.i + 1];
  ctx.instFA[ctx.i] = lx + (tgt.x - lx) * p;
  ctx.instFA[ctx.i + 1] = ly + (tgt.y - ly) * p;
  ctx.instFA[ctx.i + 2] = ctx.inst[ctx.i + 2] * (1 + (tgt.scale - 1) * p);
  ctx.instFA[ctx.i + 8] = ctx.inst[ctx.i + 8] * (1 - p) + tgt.r * p;
  ctx.instFA[ctx.i + 9] = ctx.inst[ctx.i + 9] * (1 - p) + tgt.g * p;
  ctx.instFA[ctx.i + 10] = ctx.inst[ctx.i + 10] * (1 - p) + tgt.b * p;
  ctx.instFA[ctx.i + 11] = ctx.inst[ctx.i + 11] * (1 - p) + tgt.a * p;
  if (tgt.z !== 0 || tgt.rotX !== 0 || tgt.rotY !== 0) {
    ctx.fxXforms[ctx.xi] = tgt.rotX * p;
    ctx.fxXforms[ctx.xi + 1] = tgt.rotY * p;
    ctx.fxXforms[ctx.xi + 2] = tgt.z * p;
    ctx.fxXforms[ctx.xi + 3] = 1 + (tgt.scale - 1) * p;
    ctx.fx3dActive = true;
  }
  ctx.ox = 0; ctx.oy = 0;
}

// ── Built-in strategies ──

export function formationStrategy(points: number[]): MorphStrategy {
  const n = points.length / 2;
  return (_wx, _wy, gi, _total, _w, _h, _hash) => ({
    x: n > 0 ? points[(gi % n) * 2] : 0,
    y: n > 0 ? points[(gi % n) * 2 + 1] : 0,
    rotX: 0, rotY: 0, z: 0,
    scale: 0.65, r: 0, g: 0, b: 0, a: 1,
  });
}

export function collapseStrategy(cx: number, cy: number): MorphStrategy {
  return (_wx, _wy, _gi, _total, _w, _h, hash) => ({
    x: cx + (hash - 0.5) * 8, y: cy + (hash - 0.5) * 8,
    rotX: (hash - 0.5) * 3, rotY: (hash - 0.5) * 3,
    z: hash * 40, scale: 0.1, r: 1, g: 0.6, b: 0.2, a: 0,
  });
}

export function explodeStrategy(cx: number, cy: number, radius: number): MorphStrategy {
  return (wx, wy, _gi, _total, _w, _h, hash) => {
    const dx = wx - cx, dy = wy - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ang = Math.atan2(dy, dx) + (hash - 0.5) * 0.5;
    return {
      x: cx + Math.cos(ang) * radius * (0.5 + hash),
      y: cy + Math.sin(ang) * radius * (0.5 + hash),
      rotX: (hash - 0.5) * 4, rotY: (hash - 0.5) * 4,
      z: hash * 120, scale: 0.8 + hash * 0.4,
      r: 1, g: 0.4 + hash * 0.3, b: 0.1, a: 0.3,
    };
  };
}

export function gridStrategy(cols: number, rows: number, cellW: number, cellH: number, ox: number, oy: number): MorphStrategy {
  return (_wx, _wy, gi, _total, _w, _h, _hash) => ({
    x: ox + (gi % cols) * cellW,
    y: oy + Math.floor(gi / cols) * cellH,
    rotX: 0, rotY: 0, z: 0, scale: 1,
    r: 0, g: 0, b: 0, a: 1,
  });
}

export function stackStrategy(z: number): MorphStrategy {
  return (_wx, _wy, gi, total, w, h, _hash) => ({
    x: w / 2, y: h / 2,
    rotX: 0, rotY: 0, z: (gi / Math.max(total, 1)) * z,
    scale: 0.5, r: 0.5, g: 0.7, b: 1, a: 0.6,
  });
}

export function identityStrategy(): MorphStrategy {
  return (wx, wy, _gi, _total, _w, _h, _hash) => ({
    x: wx, y: wy, rotX: 0, rotY: 0, z: 0, scale: 1,
    r: 0, g: 0, b: 0, a: 1,
  });
}
```

Import `fxHash` and `FxCtx` from `./types`.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean.

---

### P2-002 — Refactor `src/ide/fx/logo.ts` to use morph engine

**Files to edit:** `src/ide/fx/logo.ts`

**What to change:** Replace the manual glyphMap + targets + per-glyph interpolation
with calls to `buildGlyphMap`, `computeTargets` with `formationStrategy`, and
`applyMorph`. The wSDF cell computation stays in logo.ts (it's the strategy's
input data). The `preFrame` builds the glyphMap + targets using the morph engine.
The `apply` calls `applyMorph` with a cubic ease.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean. Logo effect still works identically.

---

### P2-003 — P2 checkpoint

- [ ] P2 tasks `[x]`.
- [ ] Typecheck clean.
- [ ] Logo effect confirmed working by user.

---

## Phase 3 — 9 New 3D Effects

**Goal:** Add ocean, dome, fan, tornado, standup, curl, shatter, ripple,
helix. Each is one file. Register all in registry.ts.

**Required reading:** `src/ide/fx/types.ts`, any 2 existing 3D-capable effects
(fireworks.ts for the xform pattern, ocean will be the showcase).

Each task below: create the file, export a `const <name>: Fx`, register in
registry.ts (add import + entry in REG + entry in FX_NAMES). Typecheck after
each.

---

### P3-001 — `src/ide/fx/ocean.ts`

Ambient 3D wave field. `uses3d: true`. `preFrame`: clear xforms. `apply`:
for glyphs, compute `z = A1*sin(wx*f1 + t*s1) + A2*sin(wy*f2 - t*s2) + A3*cos((wx+wy)*f3 + t*s3)`.
Compute slope (partial derivatives) → `rotX = atan(dz/dy)`, `rotY = atan(dz/dx)`.
Set `fxXforms[xi] = rotX`, `[xi+1] = rotY`, `[xi+2] = z`, `[xi+3] = 1`.
Set `fx3dActive = true`. Color: subtle blue-green tint based on z height.
Suggested constants: A1=18, A2=12, A3=8, f1=0.012, f2=0.015, f3=0.008,
s1=1.2, s2=0.9, s3=0.7.

---

### P3-002 — `src/ide/fx/dome.ts`

Ambient breathing dome. `uses3d: true`. `preFrame`: clear xforms. `apply`:
radial distance from center (w/2, h/2). `z = amp * cos(d * freq) * (0.5 + 0.5*sin(t*speed))`.
`rotX/rotY` from slope. Scale: `1 + z*0.001`. Color: warm at peak, cool at trough.
Suggested: amp=60, freq=0.008, speed=1.5.

---

### P3-003 — `src/ide/fx/fan.ts`

Ambient card fan. `uses3d: true`. `preFrame`: clear xforms. `apply`:
row = floor(wy / rowH). `z = row * zStep + sin(t*0.5 + row*0.3) * wobble`.
`rotX = tiltAngle` (constant, e.g. 0.15 rad). Slight `ox` stagger per row.
Suggested: rowH=22, zStep=12, wobble=4, tiltAngle=0.15.

---

### P3-004 — `src/ide/fx/tornado.ts`

Cursor-driven vortex. `uses3d: true`. `preFrame`: clear xforms. `apply`:
distance from cursor. Within radius R: `z = lift * (1 - d/R) * (0.5 + 0.5*sin(t*3))`.
`ox/oy` = circular orbit: `ang = atan2(dy,dx) + t*spinSpeed*(1-d/R)`.
`rotY = t * spinRate * (1-d/R)`. Scale: `1 + (1-d/R)*0.3`.
Suggested: R=180, lift=200, spinSpeed=4, spinRate=6.

---

### P3-005 — `src/ide/fx/standup.ts`

Cursor magnet. `uses3d: true`. `preFrame`: clear xforms. `apply`:
distance from cursor. Within radius R: `lift = maxZ * (1-d/R)^2`.
`rotX` = tilt toward cursor (proportional to dy/d * tiltMax).
`rotY` = tilt toward cursor (proportional to dx/d * tiltMax).
`z = lift`. Scale: `1 + (1-d/R)*0.2`.
Suggested: R=150, maxZ=80, tiltMax=0.6.

---

### P3-006 — `src/ide/fx/curl.ts`

Page curl. `uses3d: true`. `preFrame`: clear xforms. `apply`:
foldX = mx (cursor X). dist = wx - foldX. If dist > 0 (right of fold):
`prog = min(dist / curlWidth, 1)`. `rotY = prog * PI * 0.8`.
`z = sin(prog * PI) * curlHeight`. `ox = -prog * curlWidth * 0.3`
(pulls curled side leftward). Alpha: `1 - prog * 0.3`.
Suggested: curlWidth=200, curlHeight=60.

---

### P3-007 — `src/ide/fx/shatter.ts`

Click-driven violent burst → reassembly. Stateful: `clicks` array.
`uses3d: true`. `onClick`: push click. `onExit`: clear clicks.
`preFrame`: clear xforms. `apply`: for each active click, compute age.
Phase 1 (age < 0.8s): explode outward with large rotX/rotY/z.
Phase 2 (age 0.8–2.5s): ease back to identity (progress = (age-0.8)/1.7).
Use eased interpolation between exploded and identity xforms.
Color: white flash at peak, fade to original.
Suggested: burst z=300, burst rot=8, radius=250, life=2.5.

---

### P3-008 — `src/ide/fx/ripple.ts`

Click-driven concentric z-waves. Stateful: `clicks` array.
`uses3d: true`. `onClick`: push click. `onExit`: clear clicks.
`preFrame`: clear xforms. `apply`: for each click, ring = age * speed.
dist from click. `wave = sin((dist - ring) * freq) * amp * decay`.
`z = wave`. `rotX/rotY` from wave slope (numerical: sample wave at ±1px).
Suggested: speed=200, freq=0.05, amp=40, decay=exp(-age*1.5), life=3.

---

### P3-009 — `src/ide/fx/helix.ts`

Click-driven double helix. Stateful: `clicks` array.
`uses3d: true`. `onClick`: push click. `onExit`: clear clicks.
`preFrame`: clear xforms. `apply`: for each click, age-based.
Glyphs within radius settle into helix: `helixAngle = glyphIdx * angleStep + t * rotSpeed`.
`strand = glyphIdx % 2`. `x = cx + cos(helixAngle + strand*PI) * helixR`.
`y = cy + (glyphIdx / total) * helixH - helixH/2`.
`z = sin(helixAngle + strand*PI) * helixR`.
Progress eases from 0→1 over 1.5s. Interpolate from original to helix position.
Suggested: helixR=60, helixH=300, angleStep=0.3, rotSpeed=2, radius=200, life=4.

---

### P3-010 — Register all 9 in registry.ts

**Files to edit:** `src/ide/fx/registry.ts`

Add imports for all 9 new effects. Add entries to REG. Extend FX_NAMES with:
`'ocean', 'dome', 'fan', 'tornado', 'standup', 'curl', 'shatter', 'ripple', 'helix'`.

**Verify:** `bunx tsc --noEmit`

**Done-when:** typecheck clean. CHECKPOINT: user cycles through all 21 FX modes.

---

### P3-011 — P3 checkpoint

- [ ] All P3 tasks `[x]`.
- [ ] Typecheck clean.
- [ ] User confirms all 21 effects visible and working.

---

## Phase 4 — Morph Effects

**Goal:** Effects that use the morph engine for spatial transformations
impossible in CSS.

---

### P4-001 — `src/ide/fx/funcCard.ts`

Function ↔ signature-card morph. Stateful: tracks zoom level via ctx.
`uses3d: true`. When zoom < threshold (zoomed out), collapse each function
body's glyphs into a small card shape at the function's signature line.
When zoom > threshold, expand back. Progress = smoothstep around threshold.
Uses `buildGlyphMap` + `collapseStrategy` per function block + `applyMorph`.

For v1: treat the entire visible code as one block (collapse to center card).
Per-function detection requires AST info not yet available.

---

### P4-002 — `src/ide/fx/renameFlight.ts`

Rename flight. Triggered by a keyboard shortcut or click. Captures current
glyph positions as "from", computes "to" positions (same text, shifted by
the rename delta), and morphs between them. For v1: simulate by shifting
all glyphs of a "word" (detected by proximity) to a new position.

---

### P4-003 — `src/ide/fx/timelineScrub.ts`

Timeline scrub. Stateful: stores two "snapshots" of glyph positions (version A
and version B). A scrub parameter (0–1, driven by mouse X or a slider)
interpolates between them. Uses `applyMorph` with linear easing and the
scrub value as progress. For v1: version A = current layout, version B =
reversed line order (a visible, fun transformation).

---

### P4-004 — `src/ide/fx/extractDetach.ts`

Extract-detach. Click selects a region; glyphs in that region lift in z
and slide to a floating card position. Uses `explodeStrategy` with z +
`applyMorph`. Progress driven by time since click (auto-animate over 1.5s).

---

### P4-005 — Register morph effects in registry.ts

Add all 4 to REG + FX_NAMES.

**Verify:** `bunx tsc --noEmit`

---

### P4-006 — P4 checkpoint

- [ ] All P4 tasks `[x]`.
- [ ] Typecheck clean.
- [ ] User confirms morph effects.

---

## Phase 5 — Polish

### P5-001 — Menu grouping

**Files to edit:** `src/ide/ide.ts` (toolbar FX menu section)

Group the FX menu into sections: "2D", "3D", "Morph" with separator items.

---

### P5-002 — Update PROGRESS.md

Add a new section documenting the IDE Effects v3 sprint: architecture,
file map, phase completion table, demo instructions.

---

### P5-003 — Final typecheck

`bunx tsc --noEmit` — must be clean.

---

### P5-004 — P5 checkpoint

- [ ] All tasks `[x]`.
- [ ] Typecheck clean.
- [ ] PROGRESS.md updated.
