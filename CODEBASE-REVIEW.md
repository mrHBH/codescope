# Codebase Review — Windfoil / codescope

**Date:** 2026-07-27
**Scope:** 163 TypeScript files, 1 WGSL shader (~23,500 LOC), 5 runtime deps, 4 dev deps.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Critical Performance Issues](#3-critical-performance-issues)
4. [High-Impact Performance Issues](#4-high-impact-performance-issues)
5. [Medium-Impact Performance Issues](#5-medium-impact-performance-issues)
6. [Type Safety](#6-type-safety)
7. [Code Duplication](#7-code-duplication)
8. [Code Organization & Structure](#8-code-organization--structure)
9. [Error Handling](#9-error-handling)
10. [Memory Management](#10-memory-management)
11. [Missing Infrastructure](#11-missing-infrastructure)
12. [What's Already Done Well](#12-whats-already-done-well)
13. [Prioritized Action Plan](#13-prioritized-action-plan)

---

## 1. Executive Summary

The codebase is architecturally ambitious and largely well-engineered. The shader
is state-of-the-art, the render pipeline is clean (one draw call, closed-form
coverage), and documentation is excellent. However, there are two critical
performance bugs, systemic `any` usage undermining type safety, significant
per-frame GC pressure from hot-path allocations, and missing dev infrastructure
(linter, test runner, CI).

**Overall health: Good foundations, needs a cleanup pass.**

| Dimension | Rating |
|---|---|
| Rendering architecture | Excellent |
| Shader quality | Excellent |
| Type safety | Poor (systemic `any`) |
| Per-frame allocation discipline | Fair (many hot-path allocs) |
| Code duplication | Fair (utility functions repeated 5-7x) |
| Documentation | Excellent |
| Dead code | Excellent (1 TODO in 163 files) |
| Dev infrastructure | Missing (no linter, no test runner, no CI) |
| Memory management | Good (disposer pattern, AbortController) |
| Module organization | Good |

---

## 2. Architecture Overview

```
src/
  windfoil/     GPU core: shader, atlas, bands, geometry, SVG, mesh3d, upscale, postfx
  camera/       2D pan/zoom + 3D orbit (camera-controls), mat4 kit
  layout/       DOM walk (measurement only), flow layout, metrics, editable text
  css/          Custom CSS engine (selector matching, color parsing, themes)
  editor/       Code editor, terminal, file tree, syntax highlighting
  frame.ts      The per-frame render loop (579 lines) — the heart
  state.ts      AppState god-object (~80 fields)
  precompute.ts Static buffer baking
  authoring/    Scene IR, declarative builder, runtime, islands, REPL (49 files)
  windgraph/    Math plotting, animation, interaction, 3D, typesetting (23 files)
  playground/   App shell, engine, demos, boards, content (20 files)
  ide/          IDE demo with 24 FX effect modules (28 files)
  ui/           Context menu, toolbar, icons, input router (6 files)
  taffy/        Taffy WASM CSS layout bridge (3 files)
```

**Key design decisions (all sound):**
- Browser DOM used only as a measurement engine; all rendering is GPU.
- Single mutable `AppState` passed everywhere (game-engine pattern).
- One `requestAnimationFrame` loop, one draw call.
- Pre-baked static buffers with per-page visibility culling.
- Grow-on-demand typed arrays with 2x overallocation.

---

## 3. Critical Performance Issues

### 3.1 Immutable GPU Buffers Re-Uploaded Every Frame

**File:** `src/windfoil/gpu.ts:120-122`

```ts
device.queue.writeBuffer(curveBuf, 0, curves);
device.queue.writeBuffer(rowBuf, 0, rows);
device.queue.writeBuffer(instBuf, 0, instances);
```

The curve atlas (`curves`) and row-band table (`rows`) are **immutable after
startup** — they never change after `buildGlyphAtlas`. Yet `draw()`
unconditionally re-uploads all three storage buffers every frame. Initial
capacity: `INIT_CURVE = 4MB`, `INIT_ROW = 1MB`.

**Impact:** ~300 MB/s of wasted CPU-to-GPU bandwidth at 60 fps.

**Fix:** Add a dirty flag. Upload curves/rows once, skip on subsequent frames.
`mesh3d.ts` already does this correctly with `lastTris`/`lastLines` reference
checks (lines 64-65, 79, 86).

### 3.2 Editable Layout Bypasses Font Metric Cache

**File:** `src/layout/editable.ts:9,25`

```ts
import { advanceOf, kerningOf } from '../windfoil/font';
// ...
let adv = advanceOf(font, ch) * s;
if (prev) adv += kerningOf(font, prev, ch) * s;
```

This calls uncached `advanceOf`/`kerningOf` (opentype.js cmap lookups) per
character per frame. The cached wrappers `advCached`/`kernCached` in
`metrics.ts:17-27` were specifically created to fix this — the comment says:
*"This is what made a text-heavy frame tank when the mouse moved."*

**Fix:** Import `advCached`/`kernCached` from `metrics.ts` instead.

---

## 4. High-Impact Performance Issues

### 4.1 Per-Frame Theme Object Allocation

**File:** `src/frame.ts:55-103`

`terminalTheme()`, `fileTreeTheme()`, `editorTheme()` each create a fresh object
with 8-12 `number[]` color arrays **every frame**. These depend only on
`s.isDark`/`s.themeCol` which change on theme switch.

**Fix:** Compute once, cache on `AppState`, invalidate on theme change.

### 4.2 Per-Frame `Set` Allocation for Hover

**File:** `src/frame.ts:202`

```ts
const hoveredSet = new Set<StyledEl>();
```

**Fix:** Module-level reusable `Set` with `.clear()` at frame start.

### 4.3 Per-Frame `Float32Array` for 2D View-Projection

**File:** `src/camera/camera.ts:120`

```ts
const m = new Float32Array(16) as Mat4;
```

Compare with `orbit.ts:25-28` which pre-allocates four module-level scratch
buffers. The 2D path should do the same.

### 4.4 Per-Frame `Float32Array` in Mesh `setViewProj`

**File:** `src/windfoil/mesh3d.ts:74`

```ts
setViewProj(vp: ArrayLike<number>) {
  device.queue.writeBuffer(uniform, 0, new Float32Array(vp as number[]));
}
```

**Fix:** Pre-allocated scratch `Float32Array(16)`.

### 4.5 Tuple Array Allocation in `rect3DVisible`

**File:** `src/frame.ts:40`

```ts
const cs: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
```

Called dozens of times per frame in 3D mode (every page, every board, the 3D
graph). Allocates 4 tuples + 1 array per call.

**Fix:** Inline the four corner transforms without arrays.

### 4.6 Per-Frame Allocations in Editable Layout

**File:** `src/layout/editable.ts:17-20`

```ts
const cx0: number[] = new Array(n + 1).fill(0);
const cline: number[] = new Array(n + 1).fill(0);
const lineTops: number[] = [top];
const glyphs: { x: number; bl: number; gl: any }[] = [];
```

Four allocations per editable element per frame. `cx0`/`cline` could be
grow-on-demand arrays stored on the element. `glyphs` could be module-level
scratch.

### 4.7 Element-by-Element Push Copy of Static Buffers

**File:** `src/frame.ts:218-231, 319-323`

```ts
for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
```

Tens of thousands of `.push()` calls per frame for visible page backgrounds and
text. V8 optimizes typed-array `.set()` to a memcpy.

**Fix:** Use `instFA.set(buf, offset)` with offset tracking instead of building
a JS array and converting later.

---

## 5. Medium-Impact Performance Issues

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 5.1 | Marquee: DOM read + string split + width calc per frame | `flow.ts:16,21,34` | Cache word list + total width; only vary scroll offset |
| 5.2 | Inline color array literals in dynamic elements loop | `frame.ts:258-298` | Module-level scratch `_tmpColor` mutated in place |
| 5.3 | `boardView` object allocated per frame | `frame.ts:368-370` | Reusable object mutated in place |
| 5.4 | `highlightCode` re-parses constant hex strings | `metrics.ts:74-86` | Module-level parsed color constants |
| 5.5 | `orbitViewProj` recomputes projection matrix every frame | `orbit.ts:72-73` | Cache; recompute only on canvas resize |
| 5.6 | No frame-level dirty-checking | `frame.ts:123-576` | Skip rebuild when scene is fully static |
| 5.7 | `EmitCache.replay` pushes element-by-element | `emitCache.ts:61-71` | Use `.set()` with offset |
| 5.8 | Base atlas restore via truncation + element push loop | `frame.ts:218-223` | Pre-concatenate `baseCrv ++ preCrv` once in `buildStatic` |

---

## 6. Type Safety

### 6.1 Systemic `any` Usage (~420 occurrences)

The single biggest code quality issue. `strict: true` is enabled in tsconfig
but undermined by pervasive `any`.

**Worst offenders:**

| File | `as any` count | Pattern |
|---|---|---|
| `authoring/builder/scene.ts` | 78 | `(this.s as any).doc` / `(this.s as any).uid()` on every method |
| `authoring/runtime/runtime.ts` | 49 | `font: any`, `atlas: any`, `Map<string, any>` |
| `authoring/ir/validate.ts` | 19 | Casts `unknown` to `any` instead of narrowing |
| `authoring/emitTS.ts` | 16 | |
| `authoring/repl.ts` | 16 | `(runtime as any).liveParams` |
| `state.ts` | 5 | `renderer: any`, `atlas: any`, `null as any` |

**Systemic patterns:**

- **`atlas: any` (47+ occurrences):** The `GlyphAtlas` interface exists in
  `windfoil/bands.ts:123` but is almost never used as a type annotation.
- **`font: any` (15+ occurrences):** `FontFace` is defined in
  `windfoil/font.ts:4` but the authoring layer ignores it.
- **Builder `this.s as any` (78x):** `ChapterBuilder`/`PageBuilder` hold a
  `private s: SceneBuilder` but cast to `any` to access `.doc` and `.uid()`.
- **`null as any` in state factory** (`state.ts:193-199`): Partial-init pattern.

**Fix priority:**
1. Replace `atlas: any` / `font: any` with `GlyphAtlas` / `FontFace` (~50 signatures).
2. Give builders a typed internal API to `SceneBuilder` (eliminate 78 casts).
3. Type `evalScene(doc: any)` → `evalScene(doc: SceneDoc)` in `timeline.ts:81`.
4. Replace `null as any` with a proper `Partial<AppState>` + assertion pattern.

### 6.2 What's Good

- Discriminated unions in the IR layer (`ObjectSpec` on `kind`) — textbook.
- `WeakMap` for clip index caching (avoids memory leaks).
- Generics used sparingly but correctly (`ConstraintGraph.add<T>`).
- No `@ts-ignore` or `@ts-expect-error` anywhere.

---

## 7. Code Duplication

### 7.1 `clamp01` Defined 7 Times

| File | Line |
|---|---|
| `windgraph/anim/easing.ts` | 8 |
| `authoring/builder/helpers.ts` | 4 |
| `ide/fx/types.ts` | 11 |
| `playground/timelineHud.ts` | 25 |
| `playground/explainer.ts` | 65 |
| `playground/cinematic.ts` | 31 |
| `authoring/runtime/cinematicHud.ts` | 31 |

### 7.2 `lerp` Defined 5+ Times

- `authoring/builder/helpers.ts:8`
- `playground/explainer.ts:69`
- `windfoil/geometry.ts:70` (inline)
- `authoring/islands/glyphAsset.ts:65` (inline)
- `authoring/islands/builtin/lossContour.ts:63` (4-arg variant)

### 7.3 `getGlyph(font: any)` Cached Helper Copy-Pasted Across 5 Islands

- `bitmapDissolve.ts:9`
- `gpuPipeline.ts:11`
- `glyphAnalytic.ts:9`
- `tessellationFan.ts:12`
- `sdfField.ts:9`

### 7.4 Board Emit Pattern Repeated 6x in `frame.ts:396-460`

```ts
if (s.XXX) {
  const g = s.XXX;
  const gR = g.x0 + g.width, gB = g.y0 + g.height;
  if (boardVis(g.x0, g.y0, gR, gB)) {
    g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
  }
}
```

**Fix:** Create `src/util/math.ts` with `clamp`, `clamp01`, `lerp`, `loop01`.
Extract a `Board` interface. Extract a `getGlyph` factory into `islands/`.

---

## 8. Code Organization & Structure

### 8.1 God-Function: `frame.ts` (579 lines)

The entire per-frame pipeline is one imperative function. Each board/panel is
guarded by `if (s.X)` but the function grows with every feature. Consider
splitting into composable phases:

```
buildStaticLayer() → buildDynamicLayer() → buildTextLayer() →
buildPanels() → buildBoards() → uploadAndEncode()
```

### 8.2 God-Object: `AppState` (~80 fields)

Deliberate game-engine pattern, but:
- 6 inline structural types for boards should be a shared `Board` interface.
- `renderer: any`, `atlas: any` lose type safety at the most critical junction.
- No change tracking — prevents dirty-checking optimizations.

### 8.3 Oversized Files

| File | Lines | Concern |
|---|---|---|
| `ide/ide.ts` | 1,603 | FX refactor (SPRINT.md) is actively extracting |
| `editor/fileTree.ts` | 694 | Could split tree-model from rendering |
| `editor/terminal.ts` | 663 | Could split TUI logic from widget rendering |
| `camera/input.ts` | 592 | Handles camera + editing + terminal + tree + menu |
| `frame.ts` | 579 | See above |

### 8.4 Empty Directories (Dead Artifacts)

- `src/animations/` — empty (animations are inline)
- `src/render/` — empty (render core stayed in `windfoil/`)
- `scripts/` — empty

**Fix:** Delete them.

### 8.5 Unused Dependencies

- `box3d.js` — no visible usage in `src/`.
- `png-tools` — no visible usage in `src/`.
- `three` — imported only in `orbit.ts` for `camera-controls` interop. Heavy
  dependency for a thin wrapper. Consider vendoring the 3 math functions needed.

### 8.6 Missing Path Aliases

Deep relative imports (`../../../windfoil/emitCache`) are rare (3 found) but a
`@/` or `@windfoil/` alias in tsconfig would improve readability as the project
grows.

---

## 9. Error Handling

**Rating: Adequate.**

- Only 19 try/catch blocks across 163 files — crash-or-continue by design
  (reasonable for a real-time renderer).
- GPU device request properly throws on missing adapter.
- Test harness error handling is uniform and clean.

**Issues:**
- `authoring/layout/measure.ts:72` — completely silent `catch { }`.
- `authoring/runtime/runtime.ts:703-704` — swallows island lookup failure with
  magic fallback `{ w: 480, h: 360 }`.
- 6x `.catch(() => {})` on clipboard operations — defensible but a debug log
  would help.

---

## 10. Memory Management

**Rating: Good.**

**Strengths:**
- `AbortController` for all listener cleanup (`camera/input.ts:62-67`).
- Consistent disposer pattern: `attachInput()`, `bootPlayground()`, `runFrame()`
  all return `() => void`.
- GPU `.destroy()` on buffer resize and depth texture recreation.
- `WeakMap` for document-identity caching.

**Issues:**
- `ui/contextMenu.ts:40-43` — adds 4 global listeners in constructor with no
  `dispose()` method. Multiple instances accumulate listeners.
- `playground/timelineHud.ts:177-190` — pointer listeners with no cleanup path.
- `gpu.ts:83` — `buf.destroy()` on realloc could theoretically race with
  in-flight GPU reads (WebGPU queue serialization likely prevents this, but
  deferred destruction would be safer).

---

## 11. Missing Infrastructure

### 11.1 No Linter / Formatter

No ESLint, Biome, Prettier, or Stylelint configuration exists. Style is
maintained by convention only.

**Recommendation:** Add Biome (fast, zero-config, handles both lint + format):
```json
// biome.json
{
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 }
}
```

### 11.2 No Test Runner

Hand-rolled `__test_*.ts` files (46+ tests) have no automated execution. No
`test` script in package.json.

**Recommendation:** Add Vitest (Vite-native, zero-config for this project):
```bash
bun add -d vitest
```
```json
// package.json
"scripts": { "test": "vitest run" }
```
Migrate `__test_*.ts` files to `*.test.ts` with `describe`/`it`/`expect`.

### 11.3 No CI/CD

No GitHub Actions, no pre-commit hooks.

**Recommendation:** Minimal CI:
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx tsc --noEmit
      - run: bunx biome check src/
      - run: bun run test
```

### 11.4 No Pre-Commit Hook

**Recommendation:** `lint-staged` + `husky` (or Biome's built-in git hook) to
enforce formatting and catch type errors before commit.

---

## 12. What's Already Done Well

- **Shader:** Rect fast path, minification/magnification guards, x-sorted bands
  with early break, lazy control-point load, ULP-based degenerate skip,
  anisotropic supersampling, branchless vec4 root solve. State-of-the-art.
- **Render pipeline:** One draw call, closed-form coverage, zero aliasing.
- **Static baking:** Per-page background/text buffers with visibility culling.
- **EmitCache:** Tile-quantized signature replay for boards.
- **Font metric cache:** `advCached`/`kernCached` (just not used everywhere).
- **Grow-on-demand typed arrays:** 2x overallocation + `.set()`.
- **Deferred cursor write:** Only on change (avoids style recalc).
- **Consolidated pointer handler:** Single listener, cached bounding rect.
- **FPS overlay:** DOM write throttled to ~8 Hz.
- **Wheel-cooldown gate:** Skips hit-test during zoom.
- **Documentation:** File headers, JSDoc, performance-rationale comments.
- **Dead code hygiene:** 1 TODO in 163 files. No commented-out blocks.
- **Disposer pattern:** AbortController + return-a-cleanup everywhere.
- **Async:** Correct `Promise.all`, lazy WASM init with promise memoization.

---

## 13. Prioritized Action Plan

### Phase 1: Critical Fixes (immediate, measurable FPS impact)

- [ ] Stop re-uploading immutable curve/row buffers every frame (`gpu.ts`)
- [ ] Use cached font metrics in `editable.ts`
- [ ] Cache theme objects; invalidate on theme switch (`frame.ts:55-103`)

### Phase 2: Hot-Path Allocation Cleanup (1-2 days)

- [ ] Module-level reusable `Set` for hover (`frame.ts:202`)
- [ ] Pre-allocated `Float32Array(16)` for 2D view-proj (`camera.ts:120`)
- [ ] Pre-allocated scratch in `mesh3d.ts:setViewProj`
- [ ] Inline corner transforms in `rect3DVisible` (no tuple arrays)
- [ ] Grow-on-demand arrays for editable layout (`editable.ts:17-20`)
- [ ] Replace element-by-element `.push()` with `.set()` for static buffers
- [ ] Pre-concatenate base + precomputed atlas arrays in `buildStatic`
- [ ] Module-level scratch color arrays for dynamic elements loop

### Phase 3: Type Safety (2-3 days)

- [ ] Replace `atlas: any` → `GlyphAtlas` across ~50 signatures
- [ ] Replace `font: any` → `FontFace` across ~15 signatures
- [ ] Refactor builder to eliminate 78x `(this.s as any)` casts
- [ ] Type `evalScene(doc: SceneDoc)` in timeline.ts
- [ ] Replace `null as any` in state factory with proper partial-init
- [ ] Extract `Board` interface for the 6 inline structural types in AppState

### Phase 4: Code Deduplication (1 day)

- [ ] Create `src/util/math.ts` (`clamp`, `clamp01`, `lerp`, `loop01`, `remap`)
- [ ] Replace 7x `clamp01`, 5x `lerp` definitions
- [ ] Extract shared `getGlyph` factory for islands
- [ ] Extract board-emit helper in `frame.ts`

### Phase 5: Infrastructure (1 day)

- [ ] Add Biome (lint + format)
- [ ] Add Vitest; migrate `__test_*.ts` → `*.test.ts`
- [ ] Add GitHub Actions CI (typecheck + lint + test)
- [ ] Add pre-commit hook (lint-staged)
- [ ] Delete empty directories (`src/animations/`, `src/render/`, `scripts/`)
- [ ] Audit `box3d.js` / `png-tools` usage; remove if unused

### Phase 6: Structural Improvements (ongoing)

- [ ] Split `frame.ts` into composable phase functions
- [ ] Split `camera/input.ts` by concern (camera / editor / terminal / tree)
- [ ] Add `dispose()` to `ContextMenu`
- [ ] Add frame-level dirty-checking (skip rebuild for static scenes)
- [ ] Add path aliases (`@/` → `src/`) in tsconfig + vite config
- [ ] Consider vendoring the 3 `three` math functions used by `orbit.ts`
- [ ] Cache marquee word lists + total width (only vary scroll offset per frame)
- [ ] Cache projection matrix in `orbit.ts`; recompute only on resize

---

## Appendix: File Size Distribution

| Range | Count | Files |
|---|---|---|
| > 1000 lines | 1 | `ide/ide.ts` (1,603) |
| 500-1000 lines | 5 | `fileTree.ts`, `terminal.ts`, `input.ts`, `frame.ts`, `editor.ts` |
| 200-500 lines | ~25 | runtime, scenes, islands, windgraph modules |
| < 200 lines | ~130 | Most utility/leaf modules |

The long tail is healthy. The 6 oversized files are the primary refactoring
targets.
