# Windfoil Authoring System — Sprint Plan

A declarative TypeScript builder that emits a serializable Scene IR, rendered
through the existing analytic pipeline. Human-authorable, realtime, interactive,
deterministic. GUI designer and terminal REPL are views over the same IR.

---

## 0. Architecture decisions (settled — no re-litigation)

| Decision | Rationale |
|----------|-----------|
| **Code-first, IR-backed** | A declarative TS builder (`src/authoring/builder/`) is the canonical authoring surface. It emits `SceneIR` JSON. GUI and terminal mutate the same IR. |
| **Single source of truth = SceneIR JSON** | Serializable, diffable, shareable. `.windfoil.json`. All editors produce and consume this single format. |
| **Taffy WASM from day 1** | Rust implementation of CSS Flexbox + Grid, compiles to ~40KB gzipped WASM. Used for authoring chrome layout AND user-authored compositions. |
| **Zero DOM** | All rendering (chrome included) through the analytic pipeline. One hidden `<div>` for text measurement + clipboard bridge only. |
| **Deterministic: `state = f(t, params)`** | No `dt`-accumulated updaters. `Animation.seek(localT)` already works this way. Params are pure bindings; changing a param instantly recomputes the scene at the current playhead. |
| **First-class interaction** | Parameters (sliders, toggles, draggable points) are IR-level primitives, not a bolt-on. The explainer's `coverageCenter`/`windingPoint`/`bandProbe` proved this works. |

---

## 1. The Scene IR — schema

The IR is a single JSON-serializable value. Every editor (code, GUI, terminal)
reads and writes this shape.

```ts
interface SceneIR {
  version: 1;
  meta: {
    title: string;
    duration: number;       // total timeline duration in seconds
  };
  objects: Record<string, ObjectSpec>;
  clips: AnimationClip[];
  camera: CameraTrack;
  params: ParamDef[];
}

// ── Objects ──────────────────────────────────────────────────────────────────

type ObjectSpec =
  | TextSpec | GlyphSpec | RectSpec | CircleSpec | EllipseSpec
  | PolygonSpec | ArcSpec | LineSpec | PlotSpec | GroupSpec;

interface TextSpec {
  kind: 'text'; id: string;
  content: string;
  at: Vec2;
  style: { size: number; color: Color; font?: string; weight?: number; align?: 'left' | 'center' | 'right'; lineHeight?: number; };
  opacity?: number; visible?: boolean; zIndex?: number;
}

interface GlyphSpec {
  kind: 'glyph'; id: string;
  char: string;             // single Unicode character or glyph index
  at: Vec2; scale?: number;
  subregion?: [number, number, number]; // [cx, cy, scale] for zoomed sub-region
  style: { color?: Color; };
  opacity?: number; visible?: boolean; zIndex?: number;
}

interface RectSpec {
  kind: 'rect'; id: string;
  origin: Vec2; size: Vec2;
  fill: Color;
  stroke?: { color: Color; width: number; };
  radius?: number | [number,number,number,number]; // corner radius
  opacity?: number; visible?: boolean; zIndex?: number;
}

interface CircleSpec {
  kind: 'circle'; id: string;
  center: Vec2; radius: number;
  fill?: Color;
  stroke?: { color: Color; width: number; };
  opacity?: number; visible?: boolean; zIndex?: number;
}

interface PolygonSpec {
  kind: 'polygon'; id: string;
  points: Vec2[]; closed?: boolean;
  fill?: Color;
  stroke?: { color: Color; width: number; };
  opacity?: number; visible?: boolean; zIndex?: number;
}

interface GroupSpec {
  kind: 'group'; id: string;
  children: string[];        // IDs
  at?: Vec2;
  layout?: LayoutSpec;
  opacity?: number; visible?: boolean; zIndex?: number;
}

// ── Layout (Taffy-backed) ────────────────────────────────────────────────────

type LayoutSpec =
  | { kind: 'flex'; direction: 'row' | 'column'; gap?: number; padding?: Padding; align?: Align; justify?: Justify; }
  | { kind: 'grid'; columns: number[]; rows: number[]; gap?: number; padding?: Padding; }
  | { kind: 'stack'; direction: 'vertical' | 'horizontal'; gap?: number; padding?: Padding; }
  | { kind: 'absolute'; };

type Padding = number | [number, number] | [number, number, number, number];
type Align = 'start' | 'center' | 'end' | 'stretch';
type Justify = 'start' | 'center' | 'end' | 'space-between' | 'space-around';

// ── Animation ────────────────────────────────────────────────────────────────

interface AnimationClip {
  id: string;
  target: string;          // object ID, or 'camera'
  kind: AnimationKind;
  start: number;           // absolute seconds
  duration: number;
  ease: EasingName;
  props: Record<string, unknown>;
}

type AnimationKind =
  | 'draw'       // stroke draw-on (reveal 0→1)
  | 'fadeIn'     // opacity 0→1
  | 'fadeOut'    // opacity 1→0
  | 'write'      // typewriter text reveal (character-by-character)
  | 'moveTo'     // animate position
  | 'scaleTo'    // animate scale
  | 'rotateTo'   // animate rotation
  | 'morphTo'    // morph polygon points
  | 'param';      // animate a parameter value

type EasingName =
  | 'linear' | 'quadIn' | 'quadOut' | 'quadInOut'
  | 'cubicIn' | 'cubicOut' | 'cubicInOut'
  | 'quintIn' | 'quintOut' | 'quintInOut'
  | 'smoothstep' | 'smootherstep'
  | 'sineIn' | 'sineOut' | 'sineInOut'
  | 'backIn' | 'backOut' | 'backInOut'
  | 'elasticIn' | 'elasticOut'
  | 'bounceIn' | 'bounceOut'
  | 'rushInto' | 'rushFrom';

// ── Camera ───────────────────────────────────────────────────────────────────

interface CameraTrack {
  keyframes: CameraKeyframe[];
  defaultZoom?: number;
}

interface CameraKeyframe {
  time: number;            // absolute seconds
  center: Vec2;
  zoom: number;
  rotation?: number;       // degrees
  ease?: EasingName;       // per-keyframe easing (default: linear between keyframes)
}

// ── Parameters (first-class interactivity) ──────────────────────────────────

type ParamDef =
  | { kind: 'slider';    id: string; label: string; default: number; min: number; max: number; step?: number; }
  | { kind: 'toggle';    id: string; label: string; default: boolean; }
  | { kind: 'point';     id: string; label: string; default: Vec2; }
  | { kind: 'color';     id: string; label: string; default: Color; };

// Enables objects to bind to live parameter values
type ParamRef = { $param: string };
type ParamValue = number | boolean | Vec2 | Color;

// ── Common types ─────────────────────────────────────────────────────────────

type Vec2 = [number, number];
type Color = [number, number, number, number]; // RGBA 0-1
```

---

## 2. Directory structure (new files)

```
src/authoring/                     # new top-level module
├── index.ts                       # barrel re-export
├── ir/
│   ├── types.ts                   # SceneIR, ObjectSpec, AnimationClip, ParamDef, Vec2, Color
│   ├── schema.ts                  # runtime validation (TypeBox or hand-rolled)
│   └── serialize.ts               # IR ↔ JSON + round-trip safety
├── builder/
│   ├── scene-builder.ts           # createScene(config) → SceneBuilder + scene(fn) export
│   ├── objects.ts                 # text(), glyph(), rect(), circle(), polygon(), group(), etc.
│   ├── clips.ts                   # draw(), fadeIn(), fadeOut(), write(), moveTo(), scaleTo(), etc.
│   ├── camera.ts                  # camera.keyframe() builder
│   ├── params.ts                  # param(), paramRef(), bindParam()
│   └── helpers.ts                 # align/position helpers, star(), arrow(), color utils
├── runtime/
│   ├── scene-runtime.ts           # SceneRuntime class — owns SceneIR + Mobject tree + tick/emit
│   ├── timeline-engine.ts         # deterministic seek(t), advance(dt), clip evaluation
│   ├── object-resolver.ts         # ObjectSpec → Mobject instances (uses windgraph primitives)
│   ├── param-binder.ts            # resolves { $param: 'x' } refs → live values
│   └── camera-controller.ts       # splines CameraKeyframe[], produces view matrix
├── layout/
│   ├── taffy.ts                   # Taffy WASM init + wrapper
│   ├── spec-to-taffy.ts           # LayoutSpec → Taffy node tree
│   └── solver.ts                  # run layout pass → resolve at/positions for all objects
├── chrome/                        # authoring tool UI (rendered analytically)
│   ├── shell.ts                   # assembles viewport + all panels
│   ├── toolbar.ts                 # top bar: file, edit, play/pause, mode toggle, zoom
│   ├── tree.ts                    # object tree / scene hierarchy panel
│   ├── timeline-panel.ts          # track view: clip lanes, scrubber, per-track controls
│   ├── inspector.ts               # property inspector for selected object
│   ├── param-panel.ts             # parameter controls (sliders, toggles)
│   └── viewport.ts                # main canvas + selection overlay + handles
├── designer/                      # direct manipulation
│   ├── selection.ts               # selected object(s) state + modifiers
│   ├── manipulators.ts            # drag-to-move, drag-to-resize, handle dragging
│   ├── snap.ts                    # snap-to-grid, snap-to-object alignment
│   └── hotkeys.ts                 # keyboard shortcuts registry
└── repl/                          # terminal extension
    ├── commands.ts                # register terminal commands (scene, param, clip, seek, play, etc.)
    └── scope.ts                   # exposes SceneRuntime + scene graph to terminal JS context
```

---

## 3. Integration points (how new code touches existing)

| New module | Touches existing | How |
|-----------|-----------------|-----|
| `ir/` | (none) | Self-contained type definitions |
| `builder/` | `src/windgraph/anim/easing.ts` | Reuses easing function list; adds string names |
| `builder/objects.ts` | `src/windgraph/mobject/primitives.ts` | Maps ObjectSpec → existing Mobject subclasses |
| `builder/clips.ts` | `src/windgraph/anim/animations.ts` | Maps AnimationClip → existing Animation subclasses |
| `runtime/` | `src/windgraph/mobject/mobject.ts` | Creates Mobject trees from ObjectSpecs |
| `runtime/` | `src/frame.ts` | SceneRuntime.emit(ctx) plugs into the per-frame emit pipeline |
| `runtime/` | `src/state.ts` | AppState gains `sceneRuntime?: SceneRuntime` |
| `layout/` | `src/layout/flow.ts` | Taffy replaces DOM-based layout for authoring; DOM measurement still used for text |
| `chrome/` | `src/layout/metrics.ts` | Uses addRect, layoutStr, strokeInto for rendering chrome elements |
| `chrome/` | `src/camera/input.ts` | Chrome handles its own hit-testing; camera pan/zoom delegate to viewport when not over chrome |
| `designer/` | `src/camera/camera.ts` | Object-space ↔ screen-space conversion for hit-testing and handle rendering |
| `repl/` | `src/editor/terminal.ts` | setCommandHandler() already exists; repl registers handler |
| `repl/` | `src/playground/scriptRuntime.ts` | Extends the existing `new Function('wf', src)` pattern |

---

## 4. Dependencies to add

| Package | Size | Purpose |
|---------|------|---------|
| `@taffy/taffy` (TBD exact package) | ~40KB gzipped WASM | Flexbox + Grid layout computation |
| (none other) | | New authoring code is pure TS over existing deps |

---

## 5. Phase plan

### Phase 1 — IR Foundation + Taffy Layout
**Goal:** Core data types, serialization round-trip, and declarative layout engine.
Can serialize a scene to JSON and deserialize it back; can compute positions for
a tree of objects via Taffy. Nothing renders yet.

**Deliverable:** `SceneIR` type passes round-trip test; Taffy computes positions
for simple flex/grid/stack layouts.

### Phase 2 — Builder API
**Goal:** Declarative TS builder that emits valid SceneIR. The human-facing API
surface. Every existing Mobject primitive + plot function is reachable via a
builder method. Interactive parameters are constructable.

**Deliverable:** A builder script (`test-scene.ts`) produces valid SceneIR JSON.

### Phase 3 — Runtime + Rendering Bridge
**Goal:** SceneIR → animated pixels through the existing analytic pipeline.
SceneRuntime owns the Mobject tree, ticks the timeline deterministically, binds
params, splines the camera, and emits through frame.ts. Hot-reloadable.

**Deliverable:** A static SceneIR file plays back as a realtime animation with
scrubbable timeline. Changing a param slider instantly recomputes.

### Phase 4 — Explainer Recreation (acceptance test)
**Goal:** Fully reproduce `src/playground/explainer.ts` using the builder API.
All 12 chapters, camera moves, text/glyph/geometric overlays, interactive handles,
and timeline scrubber. This is the forcing function that proves the API.

**Deliverable:** `src/playground/explainerV2.ts` produces a SceneIR that renders
indistinguishably from the original. Interactive handles work.

### Phase 5 — Authoring Tool Chrome
**Goal:** The authoring tool itself rendered through the analytic pipeline.
Shell with splittable panels, toolbar, object tree, timeline panel, property
inspector, parameter controls. Layout through Taffy. State shared with SceneRuntime.

**Deliverable:** Clicking "Authoring" in the launcher opens the analytical tool
shell with functional viewport, tree, timeline, and inspector.

### Phase 6 — Terminal REPL
**Goal:** Live scene inspection and mutation from the in-app terminal. Pause the
animation, query object properties, create/delete objects, schedule clips, tweak
params — all from the terminal prompt. Extends existing PlaygroundScriptRuntime.

**Deliverable:** `scene objects`, `scene params`, `scene seek 3.2`, `param set radius 0.8`
commands work live in the terminal.

### Phase 7 — GUI Designer
**Goal:** Direct manipulation. Click-to-select objects in the viewport. Drag to
move (with snap). Drag handles for param points. Drag/resize clips on the timeline.
Property inspector edits selected object. Code view shows generated/changed code.

**Deliverable:** Full round-trip: create objects in GUI → see code gen → tweak
code → GUI reflects changes → scrub timeline → drag objects → code updates.

### Phase 8 — Polish & Ship
**Goal:** Save/load `.windfoil.json`, hot reload (edit TS, instant scene update),
performance profiling (no regressions below 60fps for current explainer complexity),
error handling, documentation in AGENTS.md.

**Deliverable:** System is ship-quality for third-party scene creation.

---

## 6. Key risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Explainer API mismatch** — the explainer's imperative, chapter-by-chapter structure doesn't map cleanly to declarative clips | High — this is the acceptance test | Prototype the 3 hardest chapters first (bitmap zoom dive, coverage band with handles, morphing star) before building full builder |
| **Taffy WASM integration complexity** — first WASM dep, potential bundler issues | Medium | Test the Vite WASM import path on day 1 of Phase 1; fallback to a pure-JS flex layout (~200 lines) if WASM blocks |
| **Chrome layout perf** — authoring tool panels compete with scene rendering for GPU time | Medium | Chrome elements are static most frames (recompute only on resize/interaction); cache their instance buffers |
| **Code→GUI round-trip** — literal patching can't handle computed positions, loops, conditionals | Low (design decision) | State this honestly: code with control flow is read-only in GUI. "Eject to full TS" is a one-way door. |
| **Text input outside DOM** — freeform text editing without contenteditable. The terminal and code editor already solve single-style text input (proportional glyph placement, caret, selection, clipboard) through the analytic pipeline. Inspector field editing and tree renaming can reuse this pattern. | Low | Extend the existing editor input handling to single-line inspector fields. |
