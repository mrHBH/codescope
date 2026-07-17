# Windfoil Authoring System — Master Task List

Granular, ordered, actionable. Each task is sized (S=<1h, M=1-4h, L=1d,
XL=2-3d). Tasks marked `[blocked by …]` depend on earlier tasks.

---

## Phase 0 — Prep & Research

- [x] **P0-001** Audit existing Animation system for reuse — all 10 Animation subclasses are deterministic and seek-based. Easing functions reusable (4 missing: `backIn`, `backInOut`, `elasticIn`, `bounceIn`). Major gaps: no camera animation, no param animation, no write/reveal, no clip composition rules, Timeline's `update()` is last-write-wins with no property awareness. Verdict: easing fns + Animation.apply() logic reusable; Timeline runtime must be replaced with pure `seek(t) → FrameState` evaluator. — `M`
- [x] **P0-002** Audit existing Mobject primitives — 9 subclasses mapped to ObjectSpec counterparts. Gaps: no `Rect` Mobject (only `addRect` helper), no glyph subregion, no `zIndex`, no layout engine. `Label` supports size/color/anchor but not font/weight/lineHeight/multi-line/typewriter. `Vector` Mobject exists but no corresponding `ArrowSpec` in IR. `EllipseSpec`/`ArcSpec`/`LineSpec`/`PlotSpec` are in the union type but have no interface definitions in SPRINT.md. — `S`
- [x] **P0-003** Audit `src/frame.ts` emit pipeline — integration points identified: `advance(dt)` at line ~154 (after camera tick, before viewProj), `emit(ctx)` between line 353–354 (after fileTree, before windgraph boards). AppState gets `sceneRuntime?: SceneRuntime` field. RenderCtx = `{ font, atlas, inst, crv, rws }`. No plugin system — boards check inline via `if (s.X)`. — `M`
- [x] **P0-004** Audit `src/playground/scriptRuntime.ts` — `new Function('wf', src)` pattern works for script execution. `setCommandHandler` is single-slot (must chain: scene → fallthrough). `handleTerminal` has try/catch; `execute()` does not — Scene REPL needs its own error boundary. `term.runCommand(raw)` enables programmatic command injection. Tab completion not implemented (reserved Tab key in `terminalInput.ts:38`). Widget system is single-slot, can be extended for live param displays. — `S`
- [x] **P0-005** Research + test Taffy WASM integration — Taffy has no pre-built npm package. Must build from source: create a `taffy-bridge` Rust crate (wasm-bindgen wrapper around the `taffy` crate), compile with wasm-pack, load the WASM in TypeScript. Requires `rustup` + `wasm-pack` toolchain. The built `.wasm` gets checked into `public/taffy.wasm` so end-users don't need Rust. Verified the approach is sound — Taffy's wasm-bindgen support is documented upstream. — `M`

---

## Phase 1 — IR Foundation + Taffy Layout

**Goal:** Can serialize a scene to JSON and deserialize it back. Taffy computes
positions for object trees. Nothing renders yet.

### 1.1 — Scene IR types

- [x] **P1-001** Create `src/authoring/ir/types.ts` — define `Vec2`, `Color`, `SceneIR`,
  `ObjectSpec` union (TextSpec, GlyphSpec, RectSpec, CircleSpec, EllipseSpec, PolygonSpec,
  ArcSpec, LineSpec, ArrowSpec, GroupSpec, PlotSpec), `LayoutSpec` union, `AnimationClip`, `AnimationKind`,
  `EasingName`, `CameraTrack`, `CameraKeyframe`, `ParamDef` union, `ParamRef`.
  Everything from the schema in `SPRINT.md` §1. — `L`
- [x] **P1-002** Create `src/authoring/ir/schema.ts` — runtime validation functions:
  `validateSceneIR(ir: unknown): ir is SceneIR`, `validateObjectSpec(spec)`, etc.
  Hand-rolled validator with detailed error messages. Validates all 11 object kinds,
  cross-references clip targets against object IDs, enforces sorted camera keyframes. — `M`
- [x] **P1-003** Create `src/authoring/ir/serialize.ts` — `serialize(ir: SceneIR): string`,
  `deserialize(json: string): SceneIR`. Round-trip safety verified. `deserializeUnsafe` for
  graceful failure. — `M`
- [x] **P1-004** Create `src/authoring/ir/index.ts` — barrel re-export of types, schema,
  serialize. — `S`
- [x] **P1-005** Write IR round-trip test — `__test.ts` with 12 tests exercising all object kinds,
  all easing names, all clip kinds, camera keyframes, params. 12/12 pass. — `M`

### 1.2 — Taffy WASM bridge (source-build)

- [x] **P1-006a** Install Rust toolchain — `rustup`, `cargo`, `wasm32-unknown-unknown` target,
  `wasm-pack v0.15.0`, `wasm-bindgen-cli v0.2.126` all installed and working. — `M`
- [x] **P1-006b** Create `src/authoring/layout/taffy-bridge/` Rust crate — `Cargo.toml` with
  `taffy 0.7.7` (grid + serde features), `wasm-bindgen 0.2`. `src/lib.rs` with `TaffyBridge`
  struct: `new_node`, `add_child`, `remove`, `set_style`, `compute_layout`, `node_count`, `clear`.
  Uses `serde_json` for JS↔Rust style transfer. — `L`
- [x] **P1-006c** Build Taffy WASM — release build: 541KB `.wasm` (est. ~150KB gzipped).
  `wasm-bindgen` generates `taffy_bridge.js` + `.d.ts`. Copied to `public/` for Vite serving.
  wasm-pack has a path-finding bug on Windows; used `cargo build --release` + `wasm-bindgen`
  directly instead. — `M`
- [x] **P1-007** Create `src/authoring/layout/taffy.ts` — wrapper class: `taffy.init()` loads WASM,
  `newNode(style)`, `addChild`, `setStyle`, `remove`, `computeLayout(root, w?, h?)`. Returns
  `LayoutResult[]`. Singleton `taffy` export. — `L`
- [x] **P1-008** Create `src/authoring/layout/spec-to-taffy.ts` — converts
  `LayoutSpec` + child ObjectSpecs → Taffy node tree. Maps flex direction/gap/align/justify,
  grid (auto-placement for v1, explicit templates deferred to Phase 3+), stack, absolute. Children
  supply measured sizes (text width estimate, rect/circle explicit). `buildTaffyTree()` returns
  Taffy node IDs + object ID map. — `L` [blocked by P1-007]
- [x] **P1-009** Create `src/authoring/layout/solver.ts` — `solveLayout(sceneIR)`:
  walks the SceneIR object tree bottom-up (topologically sorted), builds Taffy trees for each
  GroupSpec with a `layout` property, calls `computeLayout`, then writes resolved `at` positions
  back into child ObjectSpecs. Handles nesting. — `L` [blocked by P1-008]
- [x] **P1-010** Write Taffy layout tests — flex row with 3 children + gap 8 + padding 16,
  flex column with gap 4 + padding 12, stack horizontal, grid auto-placement with 4 children,
  absolute (no layout), solveLayout writes positions back, nested groups bottom-up. 7/7 pass. — `M`
- [x] **P1-011** Run `bunx tsc --noEmit` — passes clean. `bun src/authoring/ir/__test.ts` — 12/12 pass. `bun src/authoring/layout/__test.ts` — 7/7 pass. — `S`

---

## Phase 2 — Builder API

**Goal:** Declarative TS builder that emits valid SceneIR. This is the
human-facing API — the thing that beats Manim.

### 2.1 — Scene builder core

- [x] **P2-001** Create `src/authoring/builder/scene-builder.ts` — `createScene(config)` returns
  a `SceneBuilder` instance. Builder maintains internal `SceneIR` (initially empty). Exposes
  factory methods for objects, clips, camera, and params. `build()` finalizes and returns
  `SceneIR`. Also export `scene(fn)` convenience: `scene((s) => { ... })` calls fn with
  builder, auto-returns IR. — `L`
- [x] **P2-002** Implement object ID generation — auto-ids from label/content
  (e.g., `text('Hello')` → id `hello`), or explicit `id:` prop. Guarantee uniqueness
  via per-base-name counter (`hello`, `hello_1`, `hello_2`). — `S`

### 2.2 — Object constructors

- [x] **P2-003** Create `src/authoring/builder/objects.ts` — `text()`, `glyph()`,
  `rect()`, `circle()`, `ellipse()`, `polygon()`, `arc()`, `line()`, `arrow()`, `group()`.
  Each returns a typed ObjectSpec and adds it to the builder's object map. Parameters take
  idiomatic TS (named options, practical defaults, autocomplete-friendly). Glyph supports
  `subregion: [cx, cy, scale]` for zoomed glyph fragments. — `L`
- [x] **P2-004** Implement `group()` with layout — children passed as ID array:
  `group([a.id, b.id], { layout: { kind: 'flex', direction: 'row', gap: 8 } })`.
  Layout specs: flex, grid, stack, absolute. Children's positions left undefined;
  the layout solver (Phase 1) resolves them. — `M`
- [x] **P2-005** Create `src/authoring/builder/helpers.ts` — `star(innerR, outerR, points)`
  returns polygon points, `arrow(from, to)` returns shaft + head, `align`
  namespace (`.below(obj, gap)`, `.rightOf(obj, gap)`, `.centerOf(obj)`, `.centerX(obj)`,
  `.centerY(obj)`) for computing `at` positions at builder time. `color(r,g,b,a?)` for
  0-255 → 0-1 RGBA. — `M`

### 2.3 — Animation clip constructors

- [x] **P2-006** Create `src/authoring/builder/clips.ts` — each clip kind as a factory:
  `draw()`, `fadeIn()`, `fadeOut()`, `write()`, `moveTo()`, `shift()`, `scaleTo()`,
  `rotateTo()`, `morphTo()`, `animateParam()`. Each returns an `AnimationClip` value.
  `at` scheduling: `s.at(time).play(...clips)` sets each clip's `start` to `time`.
  `s.at(time).with(...clips)` schedules overlapping with the most recent group. — `L`
- [x] **P2-007** Implement camera track builder — `camera.keyframe(time, center, zoom, rotation?, ease?)`
  adds keyframe to `SceneIR.camera.keyframes`. `camera.to({ center, zoom }, opts)` creates
  a clip and adds a keyframe at the end time. — `M`
- [x] **P2-008** Implement parameter system — `param(id, { default, min?, max?, step?, label? })`
  auto-detects kind from default value type (number→slider, boolean→toggle, Vec2→point,
  Color→color). `paramRef(id)` returns `{ $param: id }` for use in object properties.
  `animateParam()` creates an animation clip that drives a param from one value to another. — `M`

### 2.4 — Builder validation + tests

- [x] **P2-009** Implement builder validation — `build()` produces valid IR by construction
  (TypeScript checks at dev time). Schema validation via `validateSceneIR()` runs at
  test time. Cross-reference errors (unknown clip targets, dangling param refs) caught
  by the schema validator. — `M`
- [x] **P2-010** Write a `test-scene.ts` — comprehensive builder test exercising every
  object kind, clip kind, camera keyframe, layout group, and param. 13/13 pass including
  round-trip serialize/deserialize. — `L`
- [x] **P2-011** Run `bunx tsc --noEmit` — passes clean. 32 total tests passing. — `S`

---

## Phase 3 — Runtime + Rendering Bridge

**Goal:** SceneIR → animated pixels through the existing analytic pipeline.
Deterministic seek, param binding, camera splining.

### 3.1 — Object resolution

- [ ] **P3-001** Create `src/authoring/runtime/object-resolver.ts` — `resolveObject(spec: ObjectSpec): Mobject`.
  Maps each ObjectSpec kind to the appropriate Mobject subclass. TextSpec → Label (via
  `layoutStr`), GlyphSpec → glyph quad emission, RectSpec → Rect mobject, CircleSpec → Circle,
  PolygonSpec → Polyline/Polygon, GroupSpec → Group. Handles opacity, visible, zIndex.
  Uses existing `src/windgraph/mobject/` primitives. — `XL` [blocked by P2-003]
- [ ] **P3-002** Implement glyph subregion rendering — GlyphSpec with `subregion: [cx, cy, scale]`
  emits only the glyph band subset corresponding to the zoomed region. Reuses the
  existing glyph atlas + band index math from `src/windfoil/bands.ts`. — `L`

### 3.2 — Timeline engine

- [ ] **P3-003** Create `src/authoring/runtime/timeline-engine.ts` — `TimelineEngine` class.
  Constructor takes `AnimationClip[]`. `seek(t)` evaluates all clips at absolute time `t`,
  applies easing, and returns a `FrameState` — a map of `objectId → { opacity, position, scale,
  rotation, reveal, visible, ... }`. Clips of overlapping time windows compose via
  priority rules (later clip overrides earlier for same property). Deterministic, no
  accumulator — pure function of `t`. — `XL`
- [ ] **P3-004** Implement clip composition rules — define how multiple clips targeting the
  same property on the same object compose (e.g., a `moveTo` at t=1..2 and a `fadeIn` at
  t=1.5..3). For different properties: independent. For same property: latest clip wins
  during overlap. — `M`
- [ ] **P3-005** Implement `write` (typewriter) clip — text reveal character-by-character.
  Maps to the existing Label's `reveal` property or segments the text into progressively
  expanding glyph ranges. — `M`

### 3.3 — Parameter binding

- [ ] **P3-006** Create `src/authoring/runtime/param-binder.ts` — `bindParams(objects, params,
  paramValues)` walks all ObjectSpec properties recursively, finds `ParamRef` values
  (`{ $param: 'x' }`), and replaces them with the current live param value before resolving
  to Mobjects. Runs every frame so params are interactive. — `M`
- [ ] **P3-007** Implement `animateParam` clip — treats a param as an animatable value.
  At `seek(t)`, the clip computes the eased param value between `from` and `to`.
  Other objects reading the param via `$param` ref automatically update.
  This is how `animateParam('radius', { from: 0.1, to: 1 })` drives a coverage band. — `L`

### 3.4 — Camera controller

- [ ] **P3-008** Create `src/authoring/runtime/camera-controller.ts` — `CameraController` class.
  Takes `CameraTrack`. `getPose(t)` returns `{ center, zoom, rotation }` by
  evaluating keyframe splines (Catmull-Rom or monotone cubic) between keyframes.
  Respects per-keyframe `ease` for the transition INTO that keyframe. — `L`
- [ ] **P3-009** Integrate camera controller with existing `src/camera/camera.ts` — the
  SceneRuntime drives the camera via `setTarget(center, zoom)` each frame instead of
  the existing input-driven pan/zoom. When the authoring tool chrome is active,
  input-driven camera is suppressed; the timeline drives it. — `M`

### 3.5 — Scene runtime + integration

- [ ] **P3-010** Create `src/authoring/runtime/scene-runtime.ts` — `SceneRuntime` class.
  Constructor takes `SceneIR + font + atlas`. Owns: Mobject tree (built once from
  resolved ObjectSpecs), TimelineEngine, ParamBinder, CameraController.
  `advance(dt)` increments playhead, seeks timeline, rebinds params, updates camera.
  `emit(ctx: RenderCtx)` walks the Mobject tree and emits through the existing
  `Mobject.emit()` pipeline. `seek(t)` sets absolute playhead.
  `setParam(id, value)` updates a live param. — `XL` [blocked by P3-001..P3-009]
- [ ] **P3-011** Integrate SceneRuntime into `src/frame.ts` — when `AppState.sceneRuntime` is set,
  call `sceneRuntime.advance(dt)` then `sceneRuntime.emit(ctx)` in the per-frame loop.
  The runtime's camera pose feeds into the existing camera system. — `M`
- [ ] **P3-012** Add `sceneRuntime` field to `AppState` in `src/state.ts` — optional reference,
  created when an authoring scene is loaded, destroyed when returning to document mode. — `S`
- [ ] **P3-013** Implement hot reload — when the builder source changes (Vite HMR), call
  `sceneRuntime.reload(newSceneIR)` which diffs the old/new IR, preserves objects with same
  IDs, adds/removes changed objects, and keeps the playhead at the same time. — `L`
- [ ] **P3-014** Run `bunx tsc --noEmit` and fix all errors. — `S`

---

## Phase 4 — Explainer Recreation (acceptance test)

**Goal:** `explainerV2.ts` renders indistinguishably from the original
`explainer.ts`. Camera moves, reveals, interactive handles — everything.

### 4.1 — Chapter analysis + mapping

- [ ] **P4-001** Map each of the 12 explainer chapters to builder constructs —
  which objects, which animations, which camera move. Document gaps where the builder
  API can't express something the original does. File the gap report. — `M`
- [ ] **P4-002** Implement any missing object primitives discovered — what the explainer
  draws that the ObjectSpec union doesn't cover (e.g., the background grid pattern,
  the chip/card shapes, the star burst). — `L`

### 4.2 — Chapter implementation

- [ ] **P4-003** Implement splash chapter — title, subtitle, drop camera move, ping animation. — `M`
- [ ] **P4-004** Implement problem chapter — text blocks, glyph, sweep camera move. — `M`
- [ ] **P4-005** Implement bitmap chapter — glyph sub-region zoom (dive move), chip overlay,
  build reveal animation. This is the hardest chapter — proves the subregion + camera dive
  combination. — `L`
- [ ] **P4-006** Implement SDF, tessellation chapters — similar pattern to bitmap, different
  positions and glyphs. — `M`
- [ ] **P4-007** Implement answer chapter — large glyph, coverage explanation text,
  pull/arc camera moves. — `M`
- [ ] **P4-008** Implement coverage band chapter — `coverageCenter` and `coverageRadius` params
  as draggable handles, band visualization that reads them via `$param` refs, `bandProbe`
  param. — `L`
- [ ] **P4-009** Implement remaining chapters (morph, star, comparison, outro) — any chapter-
  specific primitives (star burst, morphing polygon). — `L`

### 4.3 — Interaction + final polish

- [ ] **P4-010** Wire interactive handle dragging — param points (`coverageCenter`, `windingPoint`,
  `bandProbe`) respond to pointer drag, update param values, scene recomputes instantly. — `L`
- [ ] **P4-011** Implement timeline scrubber (analytical) — horizontal bar at bottom, playhead
  indicator, click-to-seek, play/pause button. Replaces the DOM scrubber in the original. — `M`
- [ ] **P4-012** Visual parity pass — side-by-side comparison of original vs V2, screenshot
  diff at key moments (splash, bitmap dive, coverage band, outro). Fix every discrepancy. — `M`
- [ ] **P4-013** Run `bunx tsc --noEmit` and fix all errors. — `S`

---

## Phase 5 — Authoring Tool Chrome

**Goal:** The authoring tool UI rendered entirely through the analytic pipeline.
Toolbar, object tree, timeline panel, property inspector, viewport.

### 5.1 — Chrome primitives + shell

- [ ] **P5-001** Create `src/authoring/chrome/shell.ts` — root Shell component. Defines the
  overall layout: toolbar (top, full width), main area (viewport center + panels on
  sides/bottom), status bar (bottom). Uses Taffy for responsive sizing (acts as the
  root GroupSpec with `layout: { kind: 'flex', direction: 'column' }`). Renders all
  child panels as SceneIR groups emitted through the same pipeline. — `L`
- [ ] **P5-002** Implement splitter primitive — draggable divider between two panels.
  Drag updates the flex-basis of the adjacent panel. Rendered as a thin rect + hover
  highlight. — `M`
- [ ] **P5-003** Implement scroll frame primitive — clips content to a bounds rect,
  renders a custom scrollbar (thumb + track). Scroll position driven by camera offset
  or explicit scroll state. Used by object tree and long inspector panels. — `L`

### 5.2 — Panels

- [ ] **P5-004** Create `src/authoring/chrome/toolbar.ts` — top bar with buttons:
  play/pause, stop, frame step forward/back, mode toggle (design/play), zoom controls,
  file menu (new, save, load). Rendered as horizontal flex of rects + labels + icons
  (reuse art.ts icon paths). — `M`
- [ ] **P5-005** Create `src/authoring/chrome/tree.ts` — hierarchical object tree panel
  (left sidebar). Displays all objects in the scene, grouped by parent GroupSpec.
  Expandable/collapsible groups. Click to select object. Name editable inline.
  Rendered as vertical stack of text rows with indentation + expand arrow. — `L`
- [ ] **P5-006** Create `src/authoring/chrome/timeline-panel.ts` — bottom panel with
  horizontal time ruler, clip lanes (one per object or group), clips rendered as colored
  rects with label. Playhead is a vertical line. Click on ruler to seek. Click clip to
  select. Drag clip edges to resize. Drag clip body to move. — `XL`
- [ ] **P5-007** Create `src/authoring/chrome/inspector.ts` — right sidebar showing
  properties of the currently selected object. Sections: position (x,y), size (w,h or
  radius), style (color, stroke, font size, opacity), animations (list of clips
  targeting this object). Editable text fields and color swatches. — `L`
- [ ] **P5-008** Create `src/authoring/chrome/param-panel.ts` — floating or docked panel
  showing all scene params with interactive controls: slider for number params, checkbox
  for toggles, draggable point display for point params, color picker for color params.
  Changing a param instantly updates the viewport. — `M`

### 5.3 — Viewport + integration

- [ ] **P5-009** Create `src/authoring/chrome/viewport.ts` — the main render surface.
  Hosts the SceneRuntime's camera and emission. Renders selection highlights (outline
  rects around selected objects), transform handles (move, rotate, scale), and param
  point handles. Input: delegates to camera pan/zoom for empty-area drags, to designer
  selection/manipulators for object interactions. — `L`
- [ ] **P5-010** Wire chrome hit-testing — pointer events hit-test chrome panels first
  (toolbar, tree, inspector, timeline). If the pointer is over a panel, that panel
  handles input. If over the viewport, input goes to camera/designer. Implement via
  a z-ordered list of panel rects, tested top-down. — `M`
- [ ] **P5-011** Run `bunx tsc --noEmit` and fix all errors. — `S`

---

## Phase 6 — Terminal REPL

**Goal:** Inspect and mutate a live scene from the in-app terminal.

### 6.1 — REPL command registration

- [ ] **P6-001** Create `src/authoring/repl/commands.ts` — register a handler with the
  existing terminal via `setCommandHandler()` (the hook at `terminal.ts:95`). Handler
  parses input for `scene ...` prefix commands, dispatches to sub-handlers. Returns
  `true` when handled, `false` to fall through to built-in commands. — `M`
- [ ] **P6-002** Create `src/authoring/repl/scope.ts` — builds the REPL scope object
  exposed to terminal commands. Contains: reference to the active `SceneRuntime`,
  helper functions for formatting (object list, clip table, param display), and
  mutation helpers (add object, remove object, update property, schedule clip).
  — `M`

### 6.2 — Scene inspection commands

- [ ] **P6-003** Implement `scene status` — prints scene title, duration, object count,
  clip count, param count, current playhead time, playing/paused state. — `S`
- [ ] **P6-004** Implement `scene objects [filter]` — lists all objects with id, kind,
  visible status. Optional filter by kind or id substring. Each object has its
  position (at) displayed. — `M`
- [ ] **P6-005** Implement `scene clips [target]` — lists all animation clips with start,
  duration, kind, target. Optional filter by target object id. — `M`
- [ ] **P6-006** Implement `scene params` — lists all params with id, kind, current
  value, default, range. — `S`
- [ ] **P6-007** Implement `scene inspect <id>` — detailed view of one object: all
  properties, all clips targeting it, computed position after layout. — `M`

### 6.3 — Scene mutation commands

- [ ] **P6-008** Implement `scene add text|rect|circle|polygon <id> <props>` — creates
  a new object and adds it to the scene. Accepts inline JSON for properties.
  Example: `scene add rect myBox { "origin": [0,0], "size": [200,100], "fill": [0.3,0.6,1,1] }`.
  Object appears instantly in the viewport. — `L`
- [ ] **P6-009** Implement `scene remove <id>` — removes an object and all clips targeting it. — `S`
- [ ] **P6-010** Implement `scene set <id>.<prop> <value>` — updates a property on an object
  or param. Example: `scene set title.style.size 64`, `scene set myRect.fill [1,0,0,1]`.
  Changes reflect instantly via hot-reload path. — `M`
- [ ] **P6-011** Implement `scene clip add <id> <kind> <start> <duration> <target> [props]` —
  adds an animation clip to the timeline. — `M`
- [ ] **P6-012** Implement `scene clip remove <id>` — removes a clip by id. — `S`

### 6.4 — Playback + utility

- [ ] **P6-013** Implement `scene play`, `scene pause`, `scene stop` — playback control. — `S`
- [ ] **P6-014** Implement `scene seek <time>` — jumps playhead to absolute seconds. — `S`
- [ ] **P6-015** Implement `scene save [path]`, `scene load <path>` — save/load SceneIR
  JSON to/from a file path (relative to workspace). — `M`
- [ ] **P6-016** Implement tab-completion for `scene` commands — autocomplete object IDs,
  property names, clip kinds, param names. Reuses terminal input completion hook. — `M`
- [ ] **P6-017** Run `bunx tsc --noEmit` and fix all errors. — `S`

---

## Phase 7 — GUI Designer

**Goal:** Direct manipulation of objects and timeline. Click, drag, resize, snap.

### 7.1 — Selection system

- [ ] **P7-001** Create `src/authoring/designer/selection.ts` — `SelectionState` class.
  Holds the set of currently selected object IDs. Supports single selection, add-to-
  selection (shift+click), toggle, deselect all (click empty space). Exposes
  `primary: id | null` (most recently selected, for inspector). Fires change events
  that panels subscribe to. — `M`
- [ ] **P7-002** Implement object hit-testing — given a screen point, find the topmost
  object at that point. Uses object bounding boxes (from resolved positions + Mobject
  bbox). For polygons and circles, do precise point-inside-shape test. Respects
  zIndex ordering. — `M`

### 7.2 — Direct manipulation

- [ ] **P7-003** Create `src/authoring/designer/manipulators.ts` — `DragHandler` class.
  On pointerdown over a selected object: begin drag. On pointermove: compute world-space
  delta (screen dx/dy ÷ camera zoom), update `object.at` plus offset. On pointerup:
  commit the new position to the object spec and update IR. Option key duplicates the
  object. — `L`
- [ ] **P7-004** Implement selection marquee — drag on empty viewport space draws a dashed
  rect. On pointerup, select all objects whose bounding boxes intersect the marquee rect. — `M`
- [ ] **P7-005** Implement snap — during drag, snap the moved object's center/edges to:
  other object centers/edges (within threshold), grid lines (configurable spacing),
  and guide lines (horizontal/vertical from other objects). Renders snap indicators as
  thin colored lines. — `L`
- [ ] **P7-006** Implement transform handles — when an object is selected, render
  handle rects at corners/edges (for resize) and above (for rotate). Drag these
  to resize/rotate the object. For groups, transforms the entire group. — `L`

### 7.3 — Timeline direct manipulation

- [ ] **P7-007** Implement clip dragging + resizing — on the timeline panel, clips
  are interactive rects. Drag clip body left/right to change `start` time. Drag
  left/right edge to change `duration` (and optionally `start` for left edge).
  Snap to other clip edges and to time ruler ticks. — `L`
- [ ] **P7-008** Implement timeline click-to-seek — clicking on the time ruler or
  empty track area sets the playhead to that time. — `S`
- [ ] **P7-009** Implement clip context menu — right-click a clip → rename, delete,
  duplicate, split at playhead. — `M`

### 7.4 — Code ↔ GUI bridge

- [ ] **P7-010** Implement code gen — when a user makes a change in the GUI (move object,
  change property, add clip), generate the corresponding builder code snippet and insert
  it at the correct location in the source file. Uses a simple literal-patching approach:
  the builder call for each object/clip must be on a single line with identifiable
  literals. Computed values (from helpers) are read-only in GUI. — `L`
- [ ] **P7-011** Implement GUI refresh — when the builder source file changes (HMR),
  rebuild the SceneIR, diff against current, and update the GUI panels to reflect
  changes (select the changed object, scroll tree to it). — `M`
- [ ] **P7-012** Run `bunx tsc --noEmit` and fix all errors. — `S`

---

## Phase 8 — Polish & Ship

**Goal:** Save/load, hot reload, performance validation, documentation.

### 8.1 — File I/O

- [ ] **P8-001** Implement save — SceneIR → `.windfoil.json` via `JSON.stringify`.
  File download through a minimal browser API bridge (Blob + URL.createObjectURL
  or showSaveFilePicker). — `M`
- [ ] **P8-002** Implement load — file picker → read → `JSON.parse` → `validateSceneIR`
  → load into SceneRuntime. — `M`
- [ ] **P8-003** Implement "Export standalone" — generates a self-contained HTML file
  that embeds the SceneIR JSON + a minimal windfoil runtime bundle, playable without
  the authoring tool. — `L`

### 8.2 — Performance

- [ ] **P8-004** Benchmark explainerV2 vs original explainer — measure avg/max frame
  time for both at the same resolution, camera path, and content. Target: V2 within
  20% of original. Profile and fix any regressions. — `L`
- [ ] **P8-005** Implement chrome instance-buffer caching — chrome panels redraw only
  when their state changes (selection change, resize, scroll). Idle frames skip panel
  emission entirely. — `M`
- [ ] **P8-006** Implement timeline lazy evaluation — clips outside the current
  view-able time window don't evaluate. Objects never active in the current time
  window don't emit. — `M`

### 8.3 — Error handling + UX

- [ ] **P8-007** Implement error boundaries — builder errors (invalid IR, failed
  validation) surface as a red banner in the tool chrome, not a console crash.
  Runtime errors (broken clip, missing target) log warnings and skip the bad clip
  rather than stopping playback. — `M`
- [ ] **P8-008** Implement undo/redo — record IR mutations (object changes, clip
  changes) on a stack. Ctrl+Z / Ctrl+Shift+Z. Coalesce rapid drag mutations into
  single undo steps (debounce ~300ms). — `L`
- [ ] **P8-009** Implement keyboard shortcut panel — `?` key shows an overlay with
  all shortcuts, grouped by category. — `M`

### 8.4 — Documentation

- [ ] **P8-010** Update `AGENTS.md` — add authoring module description, dev commands,
  file layout. — `S`
- [ ] **P8-011** Update `PROGRESS.md` — mark windgraph animation/interactivity phases
  as completed, add authoring system section, update next steps. — `S`
- [ ] **P8-012** Write builder API examples — a set of annotated builder scripts showing
  common patterns: simple text animation, math plot with camera moves, interactive
  explorable with params, multi-chapter presentation. Keep in `src/authoring/examples/`. — `M`

### 8.5 — Final verification

- [ ] **P8-013** Full typecheck + build — `bunx tsc --noEmit` passes clean. — `S`
- [ ] **P8-014** Manual test pass — create a new scene from scratch using the builder,
  play it in the authoring tool, scrub the timeline, tweak objects in the GUI, adjust
  params, save and reload. — `L`

---

## Task counts by phase

| Phase | S | M | L | XL | Total |
|-------|---|---|---|----|-------|
| 0 — Prep | 2 | 3 | — | — | 5 |
| 1 — IR + Taffy | 2 | 6 | 5 | — | 13 |
| 2 — Builder API | 2 | 4 | 5 | — | 11 |
| 3 — Runtime | 2 | 5 | 4 | 3 | 14 |
| 4 — Explainer | — | 6 | 7 | — | 13 |
| 5 — Chrome | — | 4 | 5 | 2 | 11 |
| 6 — REPL | 5 | 8 | 1 | — | 14 |
| 7 — Designer | 1 | 4 | 7 | — | 12 |
| 8 — Polish | 3 | 8 | 4 | — | 15 |
| **Total** | **17** | **48** | **38** | **5** | **108** |

---

## Dependency graph (simplified)

```
P0 (prep)
 ├─► P1 (IR + Taffy)
 │    └─► P2 (Builder)
 │         └─► P3 (Runtime)
 │              └─► P4 (Explainer)
 ├─► P5 (Chrome) ─────────────────────┐
 ├─► P6 (REPL) ───────────────────────┤
 └─► P7 (Designer) ───────────────────┤
                                       └─► P8 (Polish)
```

P5, P6, P7 can begin once P3 (Runtime) is stable — they all consume SceneRuntime
and SceneIR. P8 is the final integration pass.
