# Windfoil Authoring System — Sprint Plan (v2)

A document-centric authoring system for realtime, interactive, cinematic
explainers — authored by **both an AI and a human**, inspectable and editable
**in code, in JSON, in a terminal, and in a GUI**. Rendered entirely through
the existing analytic pipeline. No video rendering: the canvas *is* the product.

This document supersedes the v1 plan (archived in `oldsprintplan/` with the
postmortem). The postmortem's lessons are baked into §11 (execution rules) and
into the phase order: **pixels first, schema second, GUI last**.

---

## 0. What we learned (constraints that shaped this design)

From the postmortem and the tooling landscape (Manim, Motion Canvas, Remotion,
Theatre.js, Rive, tldraw/Excalidraw, ShaderToy, Vega-Lite):

1. **The explainer's signature visuals are per-pixel procedural simulations**
   (bitmap dissolve, SDF field, tessellation fan, coverage sweep). A declarative
   object tree cannot express them. Therefore procedural **islands** are
   first-class citizens, not an escape hatch.
2. **Nobody does arbitrary code ↔ GUI round-trip** — not Motion Canvas, not
   Theatre.js, not tldraw. The winning pattern is *document-centric*: JSON is
   the truth; code and GUI are both projections/editors of it.
3. **Generators (Motion Canvas `yield*`) are unserializable** — an AI can't
   diff them, a GUI can't edit them. Timeline-as-data wins: `state = f(t)`.
4. **Islands + gallery is proven**: Rive Scripting (code inside a GUI file),
   ShaderToy (fork culture), Excalidraw libraries (insert & customize).
5. **The user owns visual testing.** No automated screenshot harness in this
   sprint. Every visual task ends with a user-confirmation checkpoint.

---

## 1. Architecture decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **SceneDoc (JSON) is the single source of truth.** Every editor (builder code, GUI, REPL, AI) reads/writes it. | Serializable, diffable, AI-writable, GUI-editable. The only model where "inspect/edit every aspect anywhere" is achievable. |
| D2 | **Islands are first-class.** Procedural visuals live in a code registry with typed param schemas; the doc holds *instances* (`island` id + param overrides). | Matches the explainer's actual structure. AI authors islands (plain TS); humans tweak params without reading code; gallery enables remix. |
| D3 | **Timeline is data.** Clips are values in the doc; `state = f(t)`; deterministic seek; no `dt` accumulators, no generators. | Scrubbing, diffing, serialization, AI editing all become trivial. |
| D4 | **Code view is a projection of the doc**, lossless by construction (the doc is fully declarative; island *code* lives in the registry and projects as references). v1: read-only projection. | Avoids the code↔GUI round-trip trap entirely. |
| D5 | **Camera = keyframes + compiled gestures.** Named parametric moves (`drop/sweep/rise/arc/pull/dive`) compile down to plain keyframes (+ optional `drift`) at builder time. Runtime only knows keyframes. | The explainer's 6 camera moves are its identity; gestures keep them authorable, keyframes keep the runtime dead simple. |
| D6 | **Runtime implements the existing `s.interactive` board contract** (`state.ts:137`) and drives the existing 3D orbit camera via `orbitSetPose`/`orbitDistForZoom`/`updateOrbit`/`enter3D`, exactly like `ExplainerBoard` does. | Reuses proven integration points instead of inventing new ones (postmortem: "match the system's grain"). |
| D7 | **Zero new npm dependencies.** Taffy WASM (already integrated) for group layout; everything else is pure TS over existing modules. | Postmortem: infrastructure fights kill sprints. |
| D8 | **Reuse, don't rewrite.** Easing from `windgraph/anim/easing.ts`, draw primitives from `windgraph/stroke/stroke.ts` + `layout/metrics.ts`, text measure via `tw()`, math via `MathTex`, caching via `EmitCache`, HUD via `playground/timelineHud.ts`, terminal via `editor/terminal.ts`. | All proven in production. The windgraph `Animation`/`Timeline` classes are reference implementations but are NOT reused directly — the runtime uses a fresh pure-function evaluator over doc clips (D3). |

---

## 2. The SceneDoc — canonical schema

The single JSON-serializable value every tool reads and writes.

```ts
interface SceneDoc {
  version: 1;
  meta: { title: string };
  objects: Record<string, ObjectSpec>;      // z-order = insertion order
  params: Record<string, ParamDef>;
  clips: ClipSpec[];
  camera: CameraTrack;
}

// ── Objects ──────────────────────────────────────────────────────────────
// Common optional fields on every spec: opacity?: number (default 1),
// visible?: boolean (default true).

type ObjectSpec =
  | TextSpec | GlyphSpec | RectSpec | CircleSpec | PolygonSpec | LineSpec
  | MathSpec | GroupSpec | IslandSpec;

interface TextSpec   { kind: 'text';   id: string; content: string; at: Vec2;
                       size: number; color: Color; weight?: number;
                       align?: 'left' | 'center' | 'right';
                       opacity?: number; visible?: boolean; }
interface GlyphSpec  { kind: 'glyph';  id: string; char: string; at: Vec2;
                       size: number; color: Color;
                       opacity?: number; visible?: boolean; }
interface RectSpec   { kind: 'rect';   id: string; at: Vec2; size: Vec2;
                       fill?: Color; stroke?: Stroke;
                       opacity?: number; visible?: boolean; }
interface CircleSpec { kind: 'circle'; id: string; center: Vec2; radius: number;
                       fill?: Color; stroke?: Stroke;
                       opacity?: number; visible?: boolean; }
interface PolygonSpec{ kind: 'polygon';id: string; points: Vec2[]; closed?: boolean;
                       fill?: Color; stroke?: Stroke;
                       opacity?: number; visible?: boolean; }
interface LineSpec   { kind: 'line';   id: string; points: Vec2[]; width: number;
                       color: Color; dash?: number[];
                       opacity?: number; visible?: boolean; }
interface MathSpec   { kind: 'math';   id: string; latex: string; at: Vec2;
                       size: number; color: Color;
                       opacity?: number; visible?: boolean; }

// A group composes a translation over its children. A group carrying
// `chapter` meta IS a chapter: it gets an automatic fade-in window and its
// own camera base pose. Chapter start times are sequential by default:
// start(chapter[i]) = Σ duration(chapter[0..i-1]).
interface GroupSpec  { kind: 'group';  id: string; at: Vec2; children: string[];
                       size?: Vec2;    // chapter frame (default [1260, 820]); used for camera fit + culling
                       layout?: LayoutSpec;
                       chapter?: { title: string; sub: string; duration: number };
                       opacity?: number; visible?: boolean; }

// An instance of a registered procedural island. Param values may be literals
// or { $param: 'name' } refs into SceneDoc.params.
interface IslandSpec { kind: 'island'; id: string; island: string; at: Vec2;
                       size?: Vec2;   // default: island's defaultSize
                       params?: Record<string, ParamValue | ParamRef>;
                       opacity?: number; visible?: boolean; }

interface Stroke { color: Color; width: number; }

// ── Layout (Taffy-backed; v1: flex/stack only) ───────────────────────────
type LayoutSpec = {
  kind: 'flex'; direction: 'row' | 'column'; gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  align?: 'start' | 'center' | 'end'; justify?: 'start' | 'center' | 'end' | 'space-between';
};

// ── Animation (clips are data) ───────────────────────────────────────────
interface ClipSpec {
  id: string;
  target: string;              // object id, or 'param:<name>'
  kind: 'fadeIn' | 'fadeOut' | 'draw' | 'write'
      | 'moveTo' | 'scaleTo' | 'rotateTo' | 'morph' | 'param';
  start: number;               // absolute seconds
  duration: number;
  ease?: EasingName;           // default 'smoothstep'
  props: Record<string, unknown>; // moveTo:{x,y} scaleTo:{x,y?} rotateTo:{deg}
                                  // morph:{points} param:{to} others:{}
}

// EXACTLY these names — they map 1:1 to exports of windgraph/anim/easing.ts:
type EasingName =
  | 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  | 'smoothstep' | 'smootherstep'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeOutBack' | 'easeOutElastic' | 'easeOutBounce'
  | 'rushInto' | 'rushFrom';

// ── Camera ───────────────────────────────────────────────────────────────
interface CameraTrack { keyframes: CameraKeyframe[]; }
// A keyframe is EITHER explicit (center + zoom) OR fit-based (fit: chapter
// group id → runtime computes center/zoom from the chapter rect + canvas size,
// exactly like ExplainerBoard.pose()). `offset` shifts the resolved center in
// world units; `zoomMul` multiplies the resolved zoom.
interface CameraKeyframe {
  time: number;                // absolute seconds
  center?: Vec2;               // explicit mode
  zoom?: number;               // explicit mode
  fit?: string;                // fit mode: id of a chapter group
  offset?: Vec2;               // added to resolved center (default [0,0])
  zoomMul?: number;            // multiplies resolved zoom (default 1)
  polar?: number;              // orbit polar angle (default 0.06 ≈ top-down)
  azimuth?: number;            // orbit azimuth (default 0)
  ease?: EasingName;           // easing INTO this keyframe (default 'easeInOutCubic')
  drift?: {                    // idle oscillation for the segment AFTER this keyframe
    xAmp?: number; yAmp?: number; xPeriod?: number; yPeriod?: number;
    azAmp?: number; azPeriod?: number;
  };
}

// ── Params (first-class interactivity) ───────────────────────────────────
type ParamDef =
  | { kind: 'number';  label: string; default: number; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; label: string; default: boolean }
  | { kind: 'point';   label: string; default: Vec2 }
  | { kind: 'color';   label: string; default: Color };

type ParamValue = number | boolean | Vec2 | Color;
type ParamRef   = { $param: string };

// ── Common ───────────────────────────────────────────────────────────────
type Vec2  = [number, number];
type Color = [number, number, number, number];   // RGBA 0..1
```

---

## 3. Islands — the procedural citizens

An island is a TS module that self-registers into a global registry.

```ts
interface IslandDef {
  id: string;                       // e.g. 'coverage-sweep'
  title: string;
  params: Record<string, ParamDef>; // schema — drives GUI controls + validation
  defaultSize: Vec2;
  handles?: IslandHandle[];         // draggable world-space handles
  emit(ctx: IslandEmitCtx, params: ResolvedParams, time: IslandTime): void;
}

interface IslandHandle {
  param: string;                                  // which param it drives
  at(params: ResolvedParams): Vec2;               // handle position (island-local)
  set(params: ResolvedParams, to: Vec2): void;    // write-back (clamp inside)
}

// Everything an island may use — a curated, stable surface:
interface IslandEmitCtx {
  font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[];
  view: { zoom: number; left: number; right: number; top: number; bottom: number };
  now: number;                       // wall-clock ms
  draw: DrawHelpers;                 // see below
}

interface IslandTime {
  local: number;      // seconds since the island's chapter started
  now: number;        // wall-clock seconds
  playing: boolean;   // tour playing vs user exploring
  alpha: number;      // chapter fade-in multiplier (multiply into all colors)
  build: number;      // 0..1 build-in reveal (driven by a 'draw' clip on the island)
}

// Extracted from explainer.ts into islands/draw.ts — shared by runtime + islands:
interface DrawHelpers {
  text(s, x, y, size, color?, alpha?, anchor?): void;
  line(pts, color, width?, alpha?, dash?): void;
  rect(x0, y0, x1, y1, color, alpha?): void;
  rectStroke(x0, y0, x1, y1, color, width?, alpha?): void;
  fillPoly(pts, color, alpha?): void;
  fillCircle(x, y, r, color, alpha?): void;
  strokeCircle(x, y, r, color, width?, alpha?): void;
  arrow(x0, y0, x1, y1, color, width?, alpha?): void;
  starPoints(cx, cy, R, rot?): Vec2[];
  math(tex: MathTex, x, y, size, color, alpha?): void;
}
```

Registry: `registerIsland(def)`, `getIsland(id)`, `listIslands()` in
`islands/registry.ts`. `islands/index.ts` imports every island module (import
side-effect = registration). Runtime throws a clear error for an unknown
island id.

---

## 4. Timeline semantics (exact — no design freedom here)

`evalScene(doc, t, paramValues) → FrameState`, a **pure function of `t`**:

```
FrameState = {
  objects: Map<id, { opacity, reveal, dx, dy, scaleX, scaleY, rotation, chars, morphPoints? }>,
  params:  Map<name, ParamValue>,
  chapters: Map<groupId, { alpha, local }>,
  duration: number,           // sum of chapter durations (or last keyframe/clip end, whichever is later)
}
```

Rules:

1. **Chapter timing**: chapter groups are ordered by object-map insertion order.
   `start(ch_i) = Σ duration(ch_0..i-1)`. `local(ch_i, t) = t - start(ch_i)`.
2. **Chapter alpha** (mirrors the explainer exactly): for the chapter whose
   window contains `t`, and all earlier chapters: `alpha = 1`. For chapter `i`:
   `alpha_i(t) = smoothstep(clamp01((t - start_i + 0.5) / 1.5))`. It NEVER
   decreases — chapters stay alive on the canvas.
3. **Clip evaluation** for a target/property at time `t`:
   - Collect all clips on that target affecting that property, sorted by `start`.
   - The driver = the last clip with `start <= t`. None → base value from the spec.
   - If `t >= driver.start + driver.duration` → the driver's END value persists.
   - Else `progress = ease((t - start) / duration)`; value = lerp(from, to, progress)
     where `from` = the previous clip's end value for that property, or the base
     value if there is no previous clip.
4. **Property mapping**: `fadeIn`/`fadeOut`→opacity multiplier; `draw`→reveal;
   `write`→chars (int count); `moveTo`→dx,dy (offset from spec `at`);
   `scaleTo`→scaleX,scaleY; `rotateTo`→rotation; `morph`→morphPoints;
   `param`→animated param value (evaluated FIRST, before objects that `$param`-ref it).
5. **Independent properties compose** (a moveTo and a fadeIn overlap freely);
   same property → last-started clip wins (rule 3).
6. **Draw-on for strokes** (line/polygon stroke): trim the polyline to `reveal`
   of its arc length (copy `trimPolyline`/`flattenQuads` from
   `src/windgraph/mobject/mobject.ts`). Fills fade with `reveal × opacity`.

---

## 5. Camera — keyframes + compiled gestures

Runtime knows ONLY keyframes:

`poseAt(t)`: resolve each keyframe first — `fit` mode computes the base pose as
`zoom = min(canvasW / (chW - 80), canvasH / (chH - 20)) · 1.02` and
`center = chapter.at + [chW/2, chH/2]`, then applies `offset` and `zoomMul`
(mirroring `ExplainerBoard.pose`, `explainer.ts:154`). Then bracket `t` by
keyframes `k_i ≤ t < k_{i+1}` (before first → first pose; after last → last
pose). `progress = ease_{k_{i+1}}((t - k_i.time) / (k_{i+1}.time - k_i.time))`.
Interpolate `center` linearly, `zoom` **geometrically** (`z = z0 · (z1/z0)^p`),
`polar`/`azimuth` linearly. If `k_i` has `drift`, add
`amp · sin(2π·(t - k_i.time)/period)` per component (local = time since `k_i`).

The builder's chapter `cam` methods compile gestures to keyframes (chapter
base pose = `fit` on the chapter group, arrival keyframe placed AT chapter
start with `ease: 'easeInOutCubic'` so travel blends from the previous
chapter):

| Gesture | Compiles to (times relative to chapter start S, base pose B = fit on this chapter) |
|---------|--------------------------------------------------------------|
| (base)  | `kf(S, fit, easeInOutCubic)` — automatic for every chapter |
| `drop(d=2.6)` | arrival `kf(S, fit, zoomMul 1.8)`, then `kf(S+d, fit, smoothstep, drift)` |
| `sweep(d=2.6, dx=340)` | arrival `kf(S, fit, offset [-dx,0])`, then `kf(S+d, fit, smoothstep, drift)` |
| `rise(d=2.6, dy=260)` | arrival `kf(S, fit, offset [0,-dy])`, then `kf(S+d, fit, smoothstep, drift)` |
| `arc(azAmp=0.16, xAmp=12, period=12.566)` | arrival `kf(S, fit)` with `drift { azAmp, xAmp, azPeriod=period, xPeriod=period }` |
| `pull()` | `kf(S+dur/2, fit, zoomMul 1.45, smoothstep)`, `kf(S+dur, fit, smoothstep, drift)` |
| `dive(into:[fx,fy], zoom Z, hold=3.2, d=2.2)` | `kf(S+hold, fit)` (hold), then `kf(S+hold+d, fit, offset = divePoint−chapterCenter, zoomMul 1+Z, smoothstep)` where `divePoint = chapter.at + [fx·chW, fy·chH]` |
| idle drift | default `drift { xAmp:6, yAmp:4, xPeriod:14.96, yPeriod:17.45 }` on the settle keyframe (matches explainer) |

---

## 6. Runtime

`SceneRuntime` owns a `SceneDoc` + live param values and implements the
`s.interactive` contract from `state.ts:137` **verbatim**:

```ts
class SceneRuntime {
  x0: number; y0: number; width: number; height: number;   // doc content bounds
  playing: boolean; tourT: number;                          // playhead (seconds)
  readonly dragging: boolean;
  constructor(doc: SceneDoc, ctx: { font: FontFace; atlas: any });
  emit(font, atlas, inst, crv, rws, now, view): void;       // per-frame
  update(now: number, s: AppState): void;                   // advances tourT, drives camera
  seek(s: AppState, seconds: number, pause?: boolean): void;
  play(s: AppState, from?: number): void;
  stopTour(s: AppState): void;
  tryBeginDrag(wx, wy, scale): boolean;                     // island handles
  dragTo(wx, wy): void; endDrag(): void;
  updateHover(wx, wy, scale): boolean;
  autoDrive(): void;                                        // no-op
  setParam(name: string, value: ParamValue): void;
  getDoc(): SceneDoc;
}
```

Emission order per frame: evaluate params (incl. `param` clips) → chapter
alphas → per-object frame state → cull groups against `view` → emit objects in
insertion order, group translations composed → island instances get
`{ local, now, playing, alpha, build }` and their resolved params.

Camera: while `playing`, `update()` computes `poseAt(tourT)` and calls
`orbitSetPose(x, y, orbitDistForZoom(z, canvasH), az, polar)` + `updateOrbit(16)`
after ensuring `enter3D(s)` — the exact pattern of `ExplainerBoard.update`
(`explainer.ts:146`). Paused → camera input is free.

Perf: each chapter group owns an `EmitCache` (`src/windfoil/emitCache.ts`)
keyed on `(alpha, animated-param signature)` — mirroring the explainer's
`sig()` strategy. Static chapters replay; the active chapter rebuilds.

---

## 7. Builder API (the human/AI authoring surface)

Thin, typed, emits `SceneDoc`. Chapter-relative coordinates and times.

```ts
import { scene } from '../authoring/builder/scene';

export const doc = scene({ title: 'How windfoil works' }, (s) => {
  s.param.number('covR', 100, { min: 40, max: 120, label: 'Coverage radius' });
  const cov = s.param.point('covCenter', [120, 340], { label: 'Coverage center' });

  const pixel = s.chapter('pixel', {
    title: 'A pixel is an area', sub: 'the coverage integral',
    at: [6200, -970], dur: 12, cam: 'sweep',       // cam gesture name (optional)
  });
  pixel.text('head', 'A pixel is an area.', { at: [76, 80], size: 40, color: C.head });
  pixel.island('cov', 'coverage-sweep', {
    at: [700, 220], size: [260, 260],
    params: { center: cov.ref(), radius: s.param.ref('covR') },
  });
  pixel.cam.dive({ into: [0.55, 0.55], zoom: 8.5 });   // extra gesture
  pixel.clip.fadeIn('head', { start: 0.3, duration: 0.8 });
});
```

- `s.chapter(id, { title, sub, at, dur, cam? })` → chapter builder. Object
  `at`s are chapter-relative; clip `start`s are chapter-relative; both are
  stored absolute in the doc.
- `chapter.cam.drop()/sweep()/rise()/arc()/pull()/dive()/moveTo(...)` compile
  per §5.
- `chapter.clip.fadeIn/draw/write/moveTo/scaleTo/rotateTo/morph(target, opts)`
  create clips; `s.clip.param(name, { start, duration, to })` animates params.
- Auto-ids from content (`'A pixel is an area.'` → `text_a_pixel_is_an_area_0`)
  with uniqueness enforcement; explicit ids always allowed.
- `build()` runs full validation (§2 + referential integrity: clip targets,
  `$param` refs, island ids, children ids) and returns the frozen `SceneDoc`.

---

## 8. REPL, code projection, GUI, gallery

- **Gallery** (`/#islands` demo): every registered island rendered live in a
  labeled grid with default params — the browsing surface AND the island test.
- **REPL**: the authoring demo hosts a `Terminal` (pattern:
  `playground.ts:201-207`); `setCommandHandler` routes `scene ...` commands:
  `status / objects / params / clips / inspect <id> / seek <t> / play / pause /
  add <kind> <id> <json> / set <id>.<prop> <value> / remove <id> / save / load`.
- **Code projection** (v1 read-only): `emitTS(doc): string` — pretty-prints the
  builder code that would reconstruct the doc. Displayed in the GUI's code
  panel; eject-to-TS is a later, one-way door.
- **GUI chrome** (final phase, analytic): object tree, inspector (auto-generated
  from param schemas + spec props), timeline panel (clip lanes + scrubber),
  viewport drag-to-move with the existing handle system. Save/load
  `.windfoil.json` (Blob download + file picker).

---

## 9. File map

**New (this sprint):**
```
src/authoring/
  ir/types.ts, validate.ts, serialize.ts, index.ts, __test_ir.ts
  builder/scene.ts, helpers.ts, __test_builder.ts
  runtime/timeline.ts, camera.ts, runtime.ts, __test_timeline.ts
  islands/draw.ts, registry.ts, index.ts, gallery.ts
  islands/builtin/{bitmapDissolve,sdfField,tessellationFan,coverageSweep,windingRay,bandProbe}.ts
  scenes/sampleScene.ts, explainerScene.ts
  demo.ts, repl.ts, emitTS.ts
```

**Modified (targeted edits only — never overwrite):**
- `src/playground/demos.ts` — register `authoring` + `islands` demos.
- Nothing else. The runtime integrates via `s.interactive`, which already exists.

---

## 10. Phase plan

| Phase | Goal | Acceptance |
|-------|------|-----------|
| **P1 IR** | Schema + validation + serialization + tests | `bun src/authoring/ir/__test_ir.ts` green; typecheck clean |
| **P2 Builder** | Builder API emitting valid SceneDoc | `bun src/authoring/builder/__test_builder.ts` green |
| **P3 Runtime** | SceneDoc → pixels via `s.interactive`; smoke scene in `/#authoring` | User confirms sample scene plays, scrubs, drags a param |
| **P4 Islands + gallery** | Registry + draw helpers + `/#islands` gallery | User confirms gallery renders |
| **P5 Builtin islands** | The 6 explainer visuals extracted as islands | User confirms each matches the original explainer frame |
| **P6 Explainer recreation** | All 12 chapters rebuilt via builder; DOM HUD reused | User confirms parity chapter-by-chapter |
| **P7 REPL** | `scene` commands in a terminal inside `/#authoring` | User confirms live mutation |
| **P8 Projection + files** | `emitTS`, save/load `.windfoil.json` | Round-trip load(emit(parse)) deep-equals |
| **P9 GUI chrome** | Tree, inspector, timeline panel, viewport manipulation | User authors a scene end-to-end in GUI |
| **P10 Polish** | Perf cache verification, docs (AGENTS.md, PROGRESS.md), examples | Typecheck + build clean; docs updated |

Dependencies: P1→P2→P3→P4→P5→P6 (the acceptance spine). P7–P9 each depend on
P3 only and may run in any order after P3. P10 last.

---

## 11. Execution rules (contract for the implementing agent)

1. **Follow `SPRINT-TODO.md` literally.** It is written to remove all design
   freedom. If anything is ambiguous or contradicts the code you read, STOP
   and ask the user — never guess.
2. **One task at a time.** After each task: run `bunx tsc --noEmit` and the
   task's verification command. Only then mark the checkbox `[x]` in
   `SPRINT-TODO.md`.
3. **Never overwrite an existing file.** Targeted `edit` operations only.
   After each edit, grep for accidental duplicate definitions.
4. **New files only where the todo says so.** No speculative helpers, no
   "while I'm here" cleanups, no new dependencies.
5. **Visual checkpoints belong to the user.** When a task says CHECKPOINT,
   ask the user to open the given URL and confirm before proceeding.
6. **No git commits, ever, unless the user explicitly asks.**
7. **Match the existing code style**: `// ── Title ──` header comments,
   terse single-purpose functions, the established emit signatures
   `emit(font, atlas, inst, crv, rws, now, view)`.
8. **Reuse the modules in §1 D8.** Do not reimplement easing, stroke
   geometry, text layout, MathTex, or caching.
