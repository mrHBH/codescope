# windgraph v2 — Notes, decisions, tips, open questions

Append-only working memory. Anything a fresh agent needs that isn't obvious
from the code lives here. Newest entries at the bottom of each section.

---

## 1. Decisions log (locked — do not relitigate without user sign-off)

- **D1 — Primitives vs islands (user decision, 2026-07-27).** Object-like
  content (typed parameters, identity, draggable/measurable/serializable,
  per-object animation) = **first-class IR primitives**: new `ObjectSpec`
  kinds → windgraph `Mobject` instances. Field-like content (per-pixel,
  procedural, no sub-object identity) = **islands / shader passes**. Islands
  additionally provide the *hosting plumbing* (board slot, `DrawHelpers`,
  `s.interactive` routing) that windgraph boards reuse. Consequence: math-ish
  islands (`gdCurve`, `lineFit`, `lossContour`, `network`) are misfiled and
  migrate to primitives in Phase 6. Full table in `../SPRINT-windgraph-v2.md` §1.
- **D2 — Moat-first sequencing.** Continuous 2D↔3D (lane G) and physics (lane H)
  ship before parity work. Nobody chooses this engine for a histogram; they
  choose it for the contour→surface lift and the Galton board. Parity trails
  behind, culled by actual taste verdicts at CP6.
- **D3 — Acceptance-bar carve-out.** "Analytic, zero aliasing, any zoom" is the
  contract for 2D content (strokes, fills, glyphs, math, chart chrome). Sampled
  3D (marching cubes, volume raymarch, 4D projection) is explicitly labeled
  "sampled", gets adaptive tessellation + silhouette refinement, and never
  claims the analytic guarantee. (`WINDGRAPH.md` §5 fixed in task 0.3.)
- **D4 — Chrome is not foundation.** Sidebar/inspector demoted out of the
  foundation phase; moat demos run on hardcoded specs + sliders. Chrome is
  Phase 6.
- **D5 — Chrome is analytic-rendered, not DOM.** The repo already replaced the
  DOM toolbar and context menu with GPU-rendered analytic ones (commits
  `d83c839`, `1abc027`, `a4473e4`, plus soft shadows + transform support).
  Track I (tooltips, sidebar, inspector) follows that pattern: rounded-rect
  coverage + windfoil text, themed via the existing palette. No new DOM overlays.
- **D6 — Execution contract.** Autonomous churn; stops only at the 8 🔍
  checkpoints (`checkpoints.md`). Typecheck + tests after every task. No
  commits unless asked; no new npm deps; targeted edits, never file overwrites.
- **D7 — Phase 1 extends the existing IR, it does not fork it.** `ir/types.ts`
  already has `ObjectSpec` kinds (text, glyph, rect, circle, polygon, line,
  math, group, island), `ClipSpec` kinds (fadeIn/out, draw, write, moveTo,
  scaleTo, rotateTo, **morph, param**), and a **parameter system**
  (`{kind:'number', min, max, step}`, boolean, point, color —
  `ir/types.ts:208-215`; `ParamRef = {$param}` is the slider-binding wire,
  already used by `IslandSpec.params`). New windgraph kinds and slider binding
  plug into these. Full spec sketches: `contracts.md`.
- **D8 — runtime.ts split seams (settles OQ-7, Phase 0.1).** The split shipped
  as: `runtime/shared.ts` (state-free: DragState, PlanPage, constants, sigVal,
  trimPolyline, emitGlow, emitGlyph, resolveIslandParams), `runtime/emitObject.ts`
  (emitObject/emitObjectAt behind an `ObjectEmitHost` interface),
  `runtime/dragControl.ts` (all drag/hit-testing behind a `DragHost` interface).
  runtime.ts: 1311 → 677 lines. Pattern for future extraction: free functions
  + narrow host interface that SceneRuntime satisfies structurally; `import
  type` for back-references (no runtime cycles). Cost: ~15 class members
  de-privatized (grabbed, hoveredHandle, hudPeel, lastView, liveParams,
  paramVersion, livePageSize, liveItemWH, layoutMap, font, atlas, frameState,
  ensureLayout, invalidateLayout, findPageParent, isNestedPage) + 2 new public
  methods (texFor, grabbedHandleName). External API unchanged; tsc + all 58
  authoring tests green.

- **D9 — Extrude side-walls = analytic fills, NOT mesh3d (settles OQ-1, 2.2).**
  The moat is "silhouette sharp at any zoom / grazing orbit"; mesh3d triangles
  alias their silhouette edges (the very thing CP3 zooms 1000× onto). So walls
  stay in the SINGLE analytic windfoil pass: each wall is one flat fill quad
  stood vertical by a per-instance quaternion in `fxXforms` (the shader's quat
  path, `windfoil.wgsl:94-101`). A wall along unit edge `e=(ex,ey,0)` rising h
  uses the rotation with columns (+x→e, +y→up=+z, +z→(ey,−ex,0)); emitted as an
  axis-aligned rect centered at the edge midpoint (width=edgeLen, height=h) with
  A=(0,0,h/2,1), B=that quaternion. The coverage integral gives the rectangle a
  razor-sharp boundary at any zoom. Per-face flat Lambert shade (LIGHT_DIR·normal)
  — one color per instance (windfoil has no per-fragment lighting). Painter order:
  a CONVEX prism's visible faces tile the silhouette with no interior overlap, so
  emit top face + camera-facing walls; sort back-to-front by `project3d.depthOf`
  (az/el from the live orbit pose) as a safety net. Top face = the polygon fill
  translated by z=extrude (Euler path, `fxXforms` A.z). Compositing risk noted in
  OQ-1 is moot: everything is one pass, one depth-agnostic blend.
- **D10 — Per-instance z wiring without the IDE FX system (2.1).** `Mobject`
  gains `elevation/extrude/faceTilt`; `RenderCtx` gains an optional `xf:number[]`
  (the `fxXforms` layout, 8 floats/instance). `emitOp` pads `xf` to match the
  instance count and writes (rotX,rotY,z,scale) for elevated ops (Euler path;
  quat slots 0 → shader falls to Euler when |A.xyz|>1e-6). The windgraph world
  composes a parallel `cXf` comp buffer alongside `cInst`, then builds a FULL
  `xfBuf:Float32Array` covering prefix+world instances (prefix zeroed) and exposes
  `xfBuffer()`; frame.ts passes it to `renderer.draw(..., xforms)` + sets
  `fxActive:1`. Under the 2D ortho VP the shader's clip-z row is zero, so elevation
  is invisible in 2D and reveals continuously on tilt (OQ-9 seamlessness). The IDE
  FX path is untouched — it still owns `fxXforms` when `fxActive` is set by ide.ts;
  the windgraph world sets it independently via the same uniform. Constraint:
  `xfBuf` must cover EVERY instance the frame draws (prefix included) or the shader
  reads garbage for un-covered instances — the world zeroes the prefix region.
- **D11 — Contact shadows = layered analytic fills (settles OQ-2, 2.5).** See OQ-2
  resolution. Silhouette projected along LIGHT_DIR to z=0; ~4 concentric fills,
  alpha `strength·0.55^i`, penumbra widens with height. Sharp at any zoom (each
  edge is a coverage integral). Drawn first so the prism paints over the core.
- **D12 — Back-face culling IS required; depth-sign convention (CP3 round 1).**
  First CP3 build emitted ALL walls → a short cylinder's far wall poked through as
  a dark crescent. Fix: cull walls whose outward normal faces away from the camera
  (`nx·sinA + ny·cosA > 0` = visible). The painter-depth sign was ALSO flipped in
  the first build (nearer objects drew first → a flat caption painted over a box
  top). Correct convention, derived from GROUND_MODEL=rotX(90) (doc (x,y,z)→world
  (x,−z,y)) + the orbit spherical pose + the shader feeding doc-z=−(per-inst z):
  `camDepth(x,y,z,az,po) = −sinP·(x·sinA + y·cosA) − cosP·z` (smaller = nearer;
  top-down → −z, so a raised face is nearer ✓). Inter-object order = two passes
  (all ground shadows, then bodies sorted far→near by min camDepth). Culling test
  in `__test_extrude.ts` (az=0 → only the +y wall survives).
- **D13 — Extruded text = a z-loft, not a translated glyph (CP3 round 1).** A glyph
  lifted by z only floats flat ("elevated + shadow, flat" — user). Fix: `Tex` with
  extrude>0 stacks L=clamp(ex/10,2,7) copies from the back face (z=base+0.25·ex) to
  the lit front face (z=base+ex); back copies use a 0.42× "wall" colour, the front
  the lit face, drawn far→near. Tilted, the offset copies fill the letter's
  thickness (reads as a solid 3D glyph); top-down they coincide into one sharp flat
  glyph (seamless, OQ-9 — the loft never changes the 2D read). Blob shadow grounds
  it. Applied to the headline only; the caption stays flat on the ground, placed
  clear of the prisms' footprints so painter order never has to hide it.
- **D14 — A standalone board must own its xf buffer + expose xfBuffer() (CP3 r1).**
  The standalone `#extrude` route rendered flat because frame.ts only sets
  `fxActive`/uploads xforms when `s.interactive.xfBuffer()` returns a buffer — and
  the board only wrote z when the WORLD handed it `xfTarget`. Fix: the board owns
  `_xf/_xfFA/_xfLen`; in emit it uses `xfTarget` if present (world comp path) else
  `_xf`, zero-pads the leading prefix gap, and pads the trailing chrome gap at the
  end so the buffer covers every drawn instance 1:1 (the same invariant the world's
  `padXf` enforces for the comp path). `xfBuffer()` returns the exact-length slice
  (or null when extrude=0 → flat → fxActive off → seamless 2D). Regression tests in
  `__test_windgraphWorld.ts` cover standalone alignment, the flat null case, and the
  world comp-buffer path.
- **D15 — CP3 round-2: shadow halo + text comb were the real defects.** User round-2:
  (a) "portions hidden near top" + (c) "don't like the shadows" traced to ONE bug:
  `emitShadow` scaled the silhouette by `sc = 1+(i+1)*(spread+h·0.0006)` → at h=130
  the outer layer was ~1.74× the object = a dark HALO bigger than the shape, reading
  as a hole that swallowed the base/walls (the perceived "hidden portions"). Fix:
  penumbra is now an ABSOLUTE feather (`expandPoly` by i·(feather+h·0.02) world px,
  not a scale factor), 3 layers, strength 0.42→0.20, offset 0.45→0.35 — a tight
  grounded contact shadow that stays footprint-sized at any height. (b) The text
  "comb" was the loft using too few copies (cap 7) AND the wrong overlap trig:
  copies separate on screen by dz·sin(polar) but a ground-plane glyph's vertical
  thickness foreshortens to stroke·cos(polar), so overlap needs dz < stroke/tan(polar)
  — the binding ratio is **tan(polar)**, not sin. `glyphLoftLayers(ex, stroke, polar)`
  (exported, headless-tested) gives the count; at the screenshot's ~24° tilt it now
  yields 8 (overlapping) instead of 7 (gapped). Copies overlap → one smooth shaded
  side under a lit top cap (wall shade 0.55×); top-down → 1 copy → flat (OQ-9). At
  grazing the edge-on glyph is thin so the cap is 96 (a slight comb only where the
  letter is already illegible edge-on — acceptable). Culling sign re-verified
  analytically at az=0 (camera on +docY sees the +y wall); the round-1 "dark
  crescent" was the far wall, correctly gone after culling — so the round-2 hidden
  look was the halo, not culling. If a genuine occlusion gap reappears post-shadow-
  fix, re-examine `wallFacing` sign vs the live azimuth next.
- **D16 — CP3 round-3: extrusion walls moved to the depth-tested mesh3d pipeline
  (the real fix; supersedes the analytic-wall attempts in D9/D12).** The user's
  "rotating notch / filled from the side" + "text still stacked" + "gaps at some
  angles" all trace to ONE root: analytic fills with painter-order + back-face
  culling are NOT watertight — at some angle a culled wall or an open cap shows
  through, and the culling seam itself is the rotating notch. Stacked glyph copies
  are also wrong: the z-step is in world units, so the comb gets WORSE on zoom
  (fundamentally unfixable by density). The fix uses the depth buffer that already
  exists for graph3d (`mesh3d.ts`): `pushWalls(mesh, loops, z0v, z1v, color)` builds
  real triangles for the vertical side walls (per-edge quads, flat-Lambert shaded),
  drawn by frame.ts BEFORE the analytic pass into the shared depth buffer. The
  analytic pass then draws only the SHARP top faces (polygon fill / glyph) with
  depth-test (less-equal, no write) — so silhouettes stay razor-sharp while the
  body is watertight at EVERY angle (no culling, no painter sort). Vertex-z
  convention = −elevation (matches the analytic shader's `vec4(…,−z,…)` + the orbit
  GROUND_MODEL, verified against `surface3dDemo`'s P()). In 2D the flat ortho VP
  collapses vertical walls to zero area → mesh3d draws nothing → seamless flat read
  (OQ-9); no bottom cap needed (depth occludes the opening). Shadows are sunk to
  z=−1 so the walls occlude them, and gated off at top-down (polar<0.12) so a flat
  shape never casts an offset shadow. **Text extrusion = true geometry, not a
  stack:** the glyph OUTLINE is now stored on the math atlas entries at bake time
  (`bands.ts` `quadsToContours` from the opentype path that `glyphQuads` already
  flattens — no font needed at draw time); `MathTex.outlineLoops` → `Tex.wallLoops`
  feeds those contours (transformed to world coords with the same placement as the
  analytic top glyph) to `pushWalls`. Result: a solid extruded letter (sharp top +
  depth-tested side tube), resolution-independent. The board caches the wall mesh
  on extrude-height change (`buildMesh`/`getMesh`); the world exposes it via
  `getMesh()`; frame.ts draws `(s.interactive).getMesh()` like graph3d; `app.ts`
  now hands every demo the engine's `meshRenderer`. This is consistent with D3
  (extruded solids are 3D content → sampled/depth-tested is the sanctioned path;
  the analytic guarantee is for the 2D top faces, which stay analytic). Tests
  rewritten for the new split (pushWalls vert/z/shade, top-only emitPrism, shadow
  z=−1, outlineLoops transform); 379 green.
- **D17 — CP3 round-4: hybrid was the wrong tool for flat 3D shapes (user verdict,
  accepted).** Three concrete bugs + the strategic call. (1) "Lost faces on right-
  click" = `frame.ts` turned `fxActive` OFF whenever the buffer was longer than the
  board's xf buffer — and the world-projected 3D context menu is appended AFTER the
  board emits, so opening the menu flattened the whole scene (tops dropped to z=0,
  hid inside their mesh walls; mesh3d walls, independent of fxActive, stayed →
  exactly the screenshot). Fix: pad the board's xf with zeros up to the full frame
  count (`_xfPad`); trailing flat instances get zero xform, fxActive stays on. (2)
  Double context menu = `app.ts` screen-HUD rendered the menu unconditionally AND
  frame.ts rendered it world-projected in 3D; gate the HUD copy on `!menuWorldPose`.
  (3) The analytic-top-vs-mesh-wall silhouette seam (the sliver) + the user's
  strategic point: a flat-colored box/cylinder top gains NOTHING from the coverage
  integral — its 3D edges don't need analytic AA — and the two-pipeline hybrid is
  what mis-seams. So per the user: **box + cylinder = closed pure-mesh solids**
  (`pushWalls` + `pushCap` top + bottom from ONE loop → shared verts → watertight,
  no seam possible). The analytic top is kept ONLY as a 2D sharpness overlay, gated
  to near-top-down (polar<0.06) where no wall is visible to seam with; above 0.06
  the mesh solid owns the body (a curved cylinder top aliasing at extreme zoom is
  the accepted trade — D3 sanctions sampled/depth-tested 3D). The grounded shadow is
  gated to polar>0.06 (mutually exclusive with the analytic top → no double). The
  TEXT keeps the hybrid (sharp analytic glyph top IS the moat) but its mesh wall
  loop is `insetLoop`'d 0.75px so the wall tucks under the glyph and never z-fights
  it. `pushCap`/`insetLoop` exported + tested. Net: 3D shapes are now plain meshes
  (simple, watertight), analytic sharpness reserved for the one place it matters
  (text) + the 2D flat read. 381 green.
- **D18 — CP3 round-5: universal quality panel + smooth + plug + MSAA + real shadows
  (user: "all behind a universal settings panel like the IDE quality panel").**
  Reused the existing `AnalyticPanel` (src/ui/analyticPanel.ts) via two new helpers
  in app.ts — `makeQualityPanel(s, include3D)` (res + low-res-sharpen dials, plus a
  "3D extrusion" group: smooth walls / MSAA / real shadows) and
  `qualityToolbarButton(s, panel)` (reads s.toolbar at click time so it anchors
  under itself though the toolbar is built after extras). finishApp now renders
  `s.panel` + repositions it (so any demo that sets s.panel gets it free); wired
  into bootWindgraphWorld + bootExtrude. State flags on AppState: `meshSmooth`
  (default ON — facets were the complaint), `meshAA` (off), `realShadows` (off);
  the board reads smooth/realShadows via getters on `this.app` (fallbacks for
  headless). **Smooth** = per-vertex outward normals in `pushWalls` (average of the
  two incident edge normals → radial on a circle); the mesh fragment shader already
  interpolates per-vertex color, so Gouraud is free — box stays flat (correct crisp
  faces), cylinder + glyph sides smooth. **Plug** = the analytic glyph top is raised
  by `EXTRUDE_PLUG_EPS` (1.5 world px) above the mesh wall top; since the camera is
  clamped above the horizon (orbit maxPolar=π/2), higher = nearer = wins the depth
  test at the shared silhouette → the sliver is gone; the wall inset was REMOVED
  (it was the sliver's cause). **MSAA** = `sampleCount` added to createGlyphRenderer
  + createMeshRenderer; frame.ts recreates both via `s.rebuildRenderers` when
  `meshAA` flips (old GPU buffers leak — acceptable for a rare manual toggle) and
  renders the shared pass into lazily-cached 4× color+depth targets that resolve to
  the normal colorView (format-safe: every demo pipeline + the swapchain target
  rgba8unorm). **Real shadows** = a depth-only caster pass (`mesh3d.beginShadow`/
  `castVerts`) from `lightViewProj` (a lookAt+ortho in doc space, exported from
  mesh3d) into a 1024² depth32float map; the solid pass samples it via
  `textureSampleCompare`('less', reference = ndc.z − bias) and a transparent
  ground-catcher pass (`drawCatcher`, depthWrite OFF, depthCompare 'less') paints
  the grounded shadow; the caster set = solids + the ground quad (board.getGround)
  so open ground isn't self-shadowed; polygon-offset depthBias on the caster + a
  tiny shader bias (0.0012) handle acne. When real shadows are ON the analytic fake
  blobs are skipped (board gates on `!realShadows`). Gated to `realShadows &&
  cam3d.active` so top-down stays the clean flat 2D read (OQ-9). **Bind-group
  gotchas (would be silent validation errors):** the caster vertex shader uses only
  group 1 (the shadow uniform) → its bind group is built from getBindGroupLayout(1)
  and set at index 1; the LINE pipeline's group 1 holds ONLY the uniform (fsLine
  never samples the map) → its shadow bind group has a single entry (binding the
  texture/sampler there fails validation). Every pipeline whose vs references the
  shadow uniform must setBindGroup(1,…) or the draw errors. **Shadow-precision
  lesson:** a frustum sized to the whole board wastes depth range → detached
  shadows at any sane bias; tightened getBounds to the shapes + a height-scaled
  margin. **Honesty note:** MSAA + real shadows are GPU-only and I cannot see them;
  they default OFF (known-good baseline) and WebGPU logs validation errors to the
  console on any wiring mistake, so a mis-wire is loud, not a silent visual
  regression — the user flips the toggle to try, flips off to revert with no code
  round. 382 green; tsc clean.
- **D19 — CP3 round-6: the two hand-rolled GPU features were fragile → made robust by
  construction (user: MSAA→black, real shadows→black flicker).** (a) **MSAA resolve
  black-screened:** a multisample color attachment with a `resolveTarget` does NOT get
  `clearValue`/`loadOp:'clear'` applied to the MSAA view — WebGPU clears the *resolve
  target*, so the 4× color buffer was never cleared → garbage/black. Replaced the
  whole multisample path with **2× supersampling**: the AA toggle drives `renderScale`
  (same proven tech as the resolution slider). `makeQualityPanel.setAA` stashes the
  prior resolution on enable, sets max(2,base), restores on disable, disables the
  resolution slider while AA is on. Deleted resolve targets / `ensureMSAAViews` /
  `_aaCount` / `s.rebuildRenderers` (dead). Mesh curves still get true edge AA. (b)
  **Real-shadow flicker = the SOLIDS self-sampling the map** (the box's own lit top
  shimmered — classic co-planar acne no sane bias kills). The grounded shadow (dark
  ring under the cylinder = the catcher working) is the payoff, so **fsTri no longer
  samples**; only `fsCatch` (flat ground, no self-shadow) samples; solids keep baked
  Lambert. (c) **Bind-group layout must track each pipeline's ACTUAL group-1 use —
  editing a fragment's resources invalidates the auto-layout bind group built from
  it.** Removing `shadowFactor` from `fsTri` collapsed triPipeS group-1 from {0,1,2}
  to {0}, but `triShadowBind` was still 3-entry `mkShadowBind` → "binding 1 not
  present" → invalid bind group → 250 SetBindGroup errors → black. Fix:
  `uniformOnlyBind(triPipeS)` + `uniformOnlyBind(linePipe)`; only `catchPipe` (still
  samples) keeps `mkShadowBind`. Rule: after changing which resources a fragment
  reads, rebuild that pipeline's bind groups from its NEW getBindGroupLayout. 382
  green; tsc clean.
- **D11 — Plot-catalog wiring pattern (Lane A, Phase 4).** Each of the 18 A-kinds
  is a full vertical slice: math helper in `src/windgraph/plot/<area>.ts` (pure,
  data-space, unit-tested in `plot/__test_plot.ts`) + an `ObjectSpec` kind wired
  through `ir/types.ts` → `validate.ts` → `builder/objects.ts` →
  `runtime/object-resolver.ts buildOne` → `emitTS`. The object-like/field-like
  split (D1) holds for the new kinds: function-shaped plots (piecewise, spline,
  tangent, accumulation, riemann, ODE trajectories, fourier, histogram, box/violin,
  cells, regression, charts) resolve to **Mobject groups** (animatable/morphable);
  per-pixel/field content (inequality shading, streamlines, bifurcation splats,
  contours) resolve to **view-dependent direct draws** registered in
  `WgScene.directDraws` with `exprDeps` (so unrelated sliders never re-run them —
  same caching as implicit/field). Point-id-driven curves (spline ctrl pts, ODE
  initial points) gate their rebuild on a point-position sig inside the `track()`
  sync so idle frames stay byte-identical; param-driven curves reuse the
  `plotResamples` + `lastParamSig|lodScale` sig. New plot modules: `spline.ts`,
  `sequence.ts`, `calculus.ts`, `ode.ts`, `fourier.ts`, `stats.ts`, `contour.ts`
  (reuses `plotImplicit` for line levels + per-triangle slab clipping for filled
  bands), `inequality.ts`, `charts.ts`.
- **D12 — Growing delimiters as analytic vector paths (Lane K).** `\left(…\right)`,
  matrices, `\cases` delimiters are NOT scaled glyphs — `layout.ts growDelim`
  draws each as a stroked Bézier/rule path spanning the body's height, so they stay
  razor-sharp at any zoom (the brand) instead of stretching a glyph bitmap. Parens
  = quadratic Bézier, brackets/angles = polylines, braces = 5-pt path, `|`/`‖` =
  rules. Mathtex also gained `matrix/cases/align/accent/brace/xarrow` AST nodes +
  layout (vertical row stacking centered on the math axis; `align` right-aligns the
  LHS column at the `&`). K6 binding = `MathTex.locate(char)` returns the world box
  of the first matching glyph (a board hit-tests it to focus a param slider — the
  Phase-1 parameter system does the rest). **Prereq pulled forward:** `expr.ts`
  grew comparison/logical operators (`> < >= <= == != && || !`, precedence
  `||`<`&&`<cmp<`+`<`*`<unary<`^`) so piecewise conditions `{x>0: …}` compile — this
  is the Lane-L grammar extension; Lane L should extend, not re-add it.
- **D20 — Board chrome must live OUTSIDE the zoom-quantized geometry cache;
  sliders use the reference affordance (2026-07-30, polish pass).** Two coupled
  rules born of the "chrome resizes on zoom + only-n-updates" report. (a) The
  board's `EmitCache` is keyed on `sigFor` which quantizes zoom to ~9% log2 bands
  (`windgraphScene.ts sigFor`) so panning/zoom replay cheaply — but screen-constant
  chrome (title, sliders, hover ring) computed with `k=1/zoom` MUST NOT be baked
  into that cache, or it snaps at every band while the frame-skip sig (`frame.ts`
  embeds raw `viewZ`) forces a per-frame replay anyway = worst of both. Fix: the
  cache wraps ONLY world-space geometry (border, plane grid, scene, hover ring);
  title + sliders emit after `cache.run(...)` every frame at exact `k` (~10 inst,
  negligible). (b) A slider's grab target is the FULL ROW, not the knob — the old
  `hypot(wx-knobX,wy-g.y)<=14*k` missed most presses on the track line, so a
  continuous slider (μ/σ, step 0.1 ≈ 2px of bell shift) read as dead while an
  integer-stepped `n` (visible vertex-count change) was the only one that "worked".
  Now `tryBeginDrag`/`updateHover` test the row rect (`x0..x0+panelW*k ×
  rowY..rowY+rowH`) and click-to-position from pointer x, matching `AnalyticPanel`
  (`analyticPanel.ts:121-131`). The slider visual is the AnalyticPanel language
  (track rect + accent fill + square thumb + right-aligned value chip, yasmineOS
  palette via `addRect`) — D5's "chrome themed via the palette" finally holds for
  board sliders too. **Meta-lesson (why green tests ≠ product):** Phase-4 counted a
  kind done at engine-wiring + a headless unit test; the surfacing boards were
  stubs and CP6 (the taste gate that forces panels to become rich) was still
  pending, so nothing ever reconciled "tests green" with "looks/works like a
  product". Future parity work: a kind is NOT done until its board reads as a
  showcase AND its chrome is on-brand — verify at the board level, not just the
  resolver. Headless has no WebGPU adapter, so pixel verification is the user's
  machine at CP6; headless contract tests (track-grab, live-bind, grid-skip) are
  the reproducible stand-in.
- **D20 addendum — `plotResamples` is PARAM-only; point-driven geometry must
  rebuild in the track closure (2026-07-30).** `WgScene.update()` runs the
  `plotResamples` list ONLY when `paramSig()` changes (`object-resolver.ts`
  `update`). So any kind whose shape depends on a *draggable point* (conic foci,
  a spline's control pts, a locus driver) will FREEZE on drag if its rebuild is
  parked in `plotResamples` — the track sync notices the point move and marks the
  slice dirty, but re-emits the group's stale children. Rule: param-driven
  resample → `plotResamples` is fine; point-driven resample → call `resample()`
  inside the `track(group, () => { sig = …; if (sig !== last) resample(); return sig; })`
  closure, with the point coords in `sig` (see `wg-plot-spline`, and the fixed
  `wg-conic`). Caught by the user dragging the ellipse's foci; pinned by the
  `wg-conic ellipse rebuilds when a focus is dragged` test.
- **D21 — 3D zoom parity + screen-space board sliders (user: 3D zoom freezes the
  chip & tanks fps; panel sliders must be analytic + fixed-size in BOTH modes,
  2026-07-30).** Two bugs, both traced to "world-space chrome under a perspective
  camera". (1) **3D zoom ≠ 2D.** The fps chip reads `s.viewZ` (`frame.ts:973`), but
  in 3D `stepCamera` set `viewZ = camZ` and never read the orbit camera back → the
  chip's number froze at the entry zoom. Fix: `camera.ts stepCamera` now reflects
  the orbit pose into `viewX/viewY/viewZ` (`orbitTargetLocal` + `orbitScale(Ch)`)
  every frame while `cam3d.active && !exiting` → the chip tracks the dolly live,
  exactly like the 2D wheel path; the 2D→3D handoff on exit still overwrites with
  the flattened top-down framing. The **fps tank** was separate: a 3D dolly is a
  *camera* move, so world geometry need not change — yet each board's `sigFor` put
  the LIVE quantized zoom `zq` in the 3D cache key, and `frame.ts`'s frame-skip sig
  embeds it too, so the eased glide swept ~9% zoom bands and forced a full
  marching-squares/plot-resample rebuild (×8 boards) continuously. 2D needs `zq`
  (its tile clip depends on zoom); 3D's clip is the ±1e12 sentinel, so `zq` there
  was pure waste. Fix: in 3D the board freezes the zoom band to a SETTLED value
  (`zq3d`, committed 120ms after the last change — the same settle-debounce the LOD
  path already uses, no timers in the hot path, idle-safe), so the glide zooms via
  the view-projection matrix with zero JS emit and one rebuild on settle. Verified
  safe: the skip path (`frame.ts:1376`) only guards the buffer upload; the render
  pass redraws the persistent instances + the board's cached `xfBuffer()`/mesh
  through the live VP (`frame.ts:1460-1511`), so a skipped emit still draws
  correctly through the moving camera. (2) **3D sliders warped.** The board sliders
  were a hand-rolled copy of `AnalyticPanel`'s constants drawn in WORLD space
  (`k=1/zoom`); a rect on the tilted ground plane projects to a trapezoid — world
  space *cannot* be screen-constant under perspective. Fix: each board now owns a
  real `AnalyticPanel` (`panel` field) drawn as a SCREEN-SPACE overlay through the
  existing screen HUD (`app.ts onBuild` → new optional `renderScreenChrome` on the
  `s.interactive` contract; `frame.ts` folds a cheap `screenChromeSig` into the HUD
  skip key so the panel tracks pan/zoom/orbit without defeating HUD frame-skip).
  The panel is pinned to the board's projected top-left corner via
  `boards/sliderOverlay.ts worldToScreenPx` (2D = ortho formula, 3D = the full orbit
  VP incl. GROUND_MODEL; identity at `app=null` so headless tests address it in
  board-local px). At `scale=1` the panel's device-px size is pixel-identical to the
  old 2D world-space sliders (same WIDTH/PAD/ROW_H constants) → 2D unchanged, 3D a
  crisp fixed rectangle, one component both modes (honours "no second convention").
  Hit-testing stays in the existing world-coordinate contract: the board's
  `tryBeginDrag`/`dragTo`/`updateHover` project the incoming world pointer back to
  device px (`worldToScreenPx`) before the panel's own screen-px hit-test — in 3D
  this round-trips the ray-cast click (`scrToDoc`) to the original device px; in 2D
  it cancels to the old world-space rect. **Consequence: input.ts and the headless
  slider tests are UNCHANGED** (the track-grab / quantized-drag / extrude-slider
  tests pass as-is because at `app=null` the transform is the identity and the panel
  reproduces the old track x-range `x0+20..x0+232` + row y exactly). The world's
  `tryBeginDrag`/`updateHover` test every board's panel first (screen-space chrome
  floats above world content / camera pan). The dead world-space slider code
  (`sliderGeom`, the SL_* palette consts, the per-frame slider emit loop) is deleted
  from both boards. **Verification caveat:** the headless browser has NO WebGPU
  adapter (screenshot = "No WebGPU adapter"), so pixel + fps confirmation is the
  user's machine; headless proof = `tsc` clean (only the pre-existing
  `font.ts` opentype-types error, untouched) + the two touched suites green
  (13 scene + 13 world) + the projection being the exact inverse of the screen-HUD
   ortho VP by construction.

- **D22 — 3D zoom parity: the frame-skip sig must NOT embed raw viewZ in 3D
  (2026-07-30, supersedes the zq3d freeze in D21).** The D21 fix froze the
  board's zoom band (`zq3d`) so the cache wouldn't rebuild during a dolly —
  but it left the FRAME-LEVEL skip sig (`frame.ts:1312`) embedding raw
  `s.viewX,viewY,viewZ`. A 3D dolly changes `viewZ` every frame → the sig
  never matched → the full emit+conversion+upload path ran 120×/s (replay 8
  boards + composition + bulk-copy + upload = the FPS tank). The 120ms
  `zq3d` debounce also caused the "delayed quality change" — quality snapped
  on settle instead of updating continuously like 2D. **The real fix:** (a)
  the frame-skip sig uses `'3d'` (a constant) instead of raw camera position
  in 3D — geometry is camera-independent; the VP transforms cached instances
  in the shader, so the sig is stable between geometry changes (rev/hover/
  zq-band/LOD) and frames skip between them (cost ~0), same as 2D between
  wheel ticks. (b) `frame.ts` computes the actual visible ground-plane rect
  for `boardView` in 3D (ray-casts 4 viewport corners via `scrToDoc` +
  includes the camera target as a reference point) instead of the ±1e12
  sentinel — this lets the world's `backdropParts` cull sub-boards by
  visibility (only visible boards emit, same as 2D) and lets all downstream
  code (`sigFor`, `backdropParts`, `WgScene.emit`, `emitObject`) use the
  same 2D tile-quantized clip path (no 3D special-case). (c) Removed the
  `zq3d` freeze/debounce — `sigFor` uses live `zq` (same as 2D), so quality
  updates at ~9% band boundaries during the glide (no delay). `backdropParts`
  clamps the 3D rect to the content area so behind-camera rays (looking at
  the sky above the horizon) don't inflate the grid. **Net: 3D zoom now
  behaves exactly like 2D — per-frame cost ~0 (skipped), full emit only at
  band boundaries, quality updates continuously during the glide.** The
  render pass redraws persistent instFA/xfBuf/mesh through the live
  `orbitViewProj` every frame (including skipped ones) — the VP is set as a
  uniform every frame, and `frameDataVersion` only gates the buffer UPLOAD
   (not the draw call). This is the same mechanism 2D uses (skip between
   wheel ticks, redraw through the ortho VP).

- **D21 — Board slider panels: fixed-size WORLD objects in 3D, not screen-HUD
  billboards (2026-07-31, user verdict on #windgraph).** `temp1` had pinned each
  board's `AnalyticPanel` into the screen HUD in 3D (screen-ortho, backing-store
  px at the corner's projection) — a 2D billboard that never tilts or dollies.
  Reverted to the world-space design (what the 07-30 log claimed): panels emit
  into the WORLD instance buffer at the board's corner in both modes. Hit-testing
  + slider drags are always doc coords (the interactive contract delivers
  ground-plane doc coords in 3D), so `panelHitXY` lost its screen-px branch and
  `sx/sy` are unused for panels. `screenChromeSig`/`renderScreenChrome` +
  `boardScreenChromeSig`/`renderBoardScreenChrome` deleted (no panel lives in the
  HUD). `frameSig` already carried panel interaction state (open/hover/drag), so
  frame-skip still rebuilds the world buffer on hover/drag. Follow-up (same day,
  user: "in 2d mode it should also have fixed size + add a mode picker"):
  FIXED world size (`k = 1`) is now the default in BOTH modes — a real flat panel
  that zooms/tilts/dollies with the scene in 2D and 3D alike; each board panel
  gets a `fixed size` toggle row that switches to `'screen'`
  (`k = 1/cameraScale` — genuinely screen-constant in the ortho 2D VP; in 3D a
  world object sized for the current camera distance, still foreshortens under
  tilt — true billboards stay rejected). Mode lives on `SliderBoard.panelMode`
  (default `'fixed'`) and is folded into `frameSig`/`boardPanelSig` so toggling
  re-emits. Note: the toggle is per-board (no global setting). Open: user wants
  to later explore panels that keep same VISIBLE size while rotating in the
  corner — tracked in OQ-11. **Superseded same day (user: "make them fixed
  sizes, remove the option"): the `fixed size` toggle is REMOVED — FIXED world
  size (k = 1) is the only mode; `SliderBoard.panelMode`, the toggle rows, and
  the screen branch in `positionBoardPanel` are all deleted.**
- **D22 — Board titles: fixed-size world objects, like the panels (user: "the
  labels for each graph; the size change; fix them; make them bigger",
  2026-07-31).** The old titles were `T·k` with `k = 1/view.zoom`:
  screen-constant in the ortho 2D VP but a fixed-world-size object in 3D, so
  they SHRANK on tilt (the "size change") and were 18px tiny. Also,
  `positionBoardPanel` keeps each board's settings panel open at the top-left
  corner, so the old top-left title sat HIDDEN under the panel. Two attempts:
  (1) screen-constant world text via `titleSize = clamp(T/groundScaleAt, T/2,
  T·2.6)` — `groundScaleAt` projects a unit doc-y segment through the live
  view-projection, so the title would bake T device px at any camera pose; a
  quantized polar band in the world's `frameSig` re-baked it during tilt.
  USER REJECTED: "they still change size" — the banded re-bake reads as a
  continuous wobble (fixed-world object that snaps bigger at each polar band
  while the camera keeps tilting). REVERTED to the D21 philosophy: titles are
  simply FIXED world size (tSize = 40, k = 1) centered over the top edge — a
  real ground object that tilts/dollies exactly like the plot and panel, no
  compensation, no wobble. The gold underline was also removed. Kept from
  attempt (1): top-center placement (visible above the open corner panel) and
  the brighter near-white `TITLE` color ("bolder", same Lato). Lesson: **screen-
  constant world text is a lie under a live perspective camera — the per-frame
  size compensator always reads as wobble; pick either a true screen-HUD
  overlay or a plain fixed-world object, never a hybrid.** OQ-11's
  same-visible-size panel inherits the same verdict.

- **D23 — World grid: procedural per-pixel (shader fillRule 3) + camera-inside
  rect culling (user: "the grid shrinks / doesn't behave correctly as I zoom
  in"; "the line disappears halfway while zooming", 2026-07-31).** Two root
  causes found by headless simulation. (1) GRID PULSE: `niceStep(140/z)` with the
  1-2-5 ladder made on-screen spacing jump 140→280→140px during a zoom (2.5×
  sweep). Fixed with a 10-step/decade ladder `[1,1.25,1.6,2,2.5,3.2,4,5,6.3,8]`
  (`fineStep`) — sweeps ≤ ~1.29×, reads as smooth subdivision. (2) FALSE CULL:
  the old world grid emitted full-length per-line strokes cached against RAW
  view bounds — rebuilt every pan/dolly frame, with world-constant widths that
  fatten near the camera and vanish at the horizon under tilt. Replaced by a
  PROCEDURAL grid: two full-rect instances (minor at `step`, major at `5·step`),
  a new shader `fillRule 3` branch that evaluates coverage per-pixel from the
  world coord (`place.xy + rc`) with width in SCREEN px derived from the pixel
  footprint — lines are uniformly crisp at every depth under the tilted camera
  (no fat-near/thin-far) and fade past the moiré horizon (`gs/(3·s)`). Cache sig
  now quantizes a 2400px tile, so pan/dolly replays the cache until a tile
  boundary (a few times/sec, not per frame). ALSO: the camera-inside-rect guard
  in `rect3DVisible` (frame.ts culling) must run BEFORE the side-plane tests —
  with all corners behind the near plane (w≤0) the inequalities reverse and a
  behind corner with |cx|<|w| increments BOTH left and right, so the side tests
  can spuriously cull a rect the camera is standing inside. Test
  `__test_frustum.ts` caught the ordering; the guard only culls all-behind rects
  that do NOT contain the camera's ground position. **tsc clean (only pre-existing
  font.ts error); 397 tests green across 22 suites.** Visual verdict = user
  (WebGPU headless unavailable). Awaiting CP6. STOPPED.

- **D24 — Culling made conservative + world grid REMOVED + per-plot grids
  reworked from scratch (user: "culling still too aggressive"; "the main grid I
  can toggle needs to be removed, useless"; "the per-plot grids need reworking
  from scratch to be sharp, nice, performant", 2026-07-31).** (1) CULLING:
  `rect3DVisible` now NEVER culls a rect with any corner behind the near plane
  (0 < behind < 4) — the clip-space side tests are only EXACT when every corner
  has w > 0. With a mix of front/behind corners the rect's image can bleed onto
  screen even when all FRONT corners sit off one side: a behind corner far to the
  other side pulls the near-plane crossing of an edge back across the viewport
  (the spurious all-front-left cull). Mixed → always draw; all-behind → the
  camera-inside guard (D23); all-front → exact plane tests (a rect wholly
  beyond one plane is genuinely off-screen). (2) WORLD GRID: the toggleable
  backdrop grid is GONE — `showGrid`, the `grid` toolbar button, `GRID_MINOR/MAJOR`,
  `addGrid`/`fineStep` and the backdrop grid instances all deleted; the backdrop
  is now just the static masthead (tile-cached). (3) PER-PLOT GRIDS reworked
  from scratch: `NumberPlane` emits TWO procedural `fillRule 3` instances (minor
  at step/5 ~1px, major at step ~1.8px, screen-px width) instead of dozens of
  stroked lines — per-pixel AA, uniformly crisp at any zoom AND under the tilted
  3D camera (no fat-near/thin-far), moiré-faded horizon. The grid is PHASE-LOCKED
  to the data origin: the shader branch reads `band.zw` as a world point a line
  passes through (= worldX0/worldY0), so grid lines land exactly under the tick
  labels at any zoom. One shared 1.26× `step` for both axes (labels use the same
  step — identical to the old per-axis steps on the windgraph boards where
  unitX == unitY; non-square planes just show cells mirroring their scaling).
  Minor is always on now (free). (4) `EmitCache` bug found: the capture
  heuristic rebases any instance with `inst[12] >= rowBase0`, but fillRule ≥ 1.5
  instances (solid rects + grids) carry a band in inst[12..15], NOT a row
  reference — a grid's `stepWorld` can exceed rowBase0 and get corrupted by the
  rebase at replay. Fixed: the rebase only applies to fillRule < 1.5 instances.
  **tsc clean (only pre-existing font.ts error); 400 tests green across 22
  suites; vite build ok.** Visual verdict = user. Awaiting CP6. STOPPED.

- **D24-followup — 2D panning froze the per-plot grids (user: "in 3D it is
  perfect; in 2D panning does not update the grid it appears", 2026-07-31).**
  Root cause: the board's `sigFor` tile-quantizes the cache KEY (1200px tiles)
  but `emit` BUILT the cached slice against the RAW viewport. A replayed slice
  therefore covered only the build-time viewport, so panning within a tile
  revealed gridless (and label/scene-less) areas until the camera crossed a
  tile boundary. In 3D this was masked because the ray-cast ground rect spans
  most of the board and the grid rect ≈ the whole domain; in 2D a small
  viewport panning smoothly shows the hard "grid stops here" edge. Fix:
  `windgraphScene` gained `tileView(view)` (the view∩board clip snapped OUTWARD
  to 1200px tiles), used BOTH as the sigFor cache key AND as the view passed to
  `plane.render`/`scene.emit` inside the cache build — the cached slice now
  covers the full tile (the frame.ts "strict SUPERSET of the viewport, nothing
  pops in mid-tile" intent, which had only been applied to the key, not the
  build). Regression test: two viewports in the same tile emit IDENTICAL grid
  instances whose rect spans both viewports (the old build would stop at the
  first viewport's edge). **tsc clean; 401 tests green; vite build ok.**
  Visual verdict = user. Awaiting CP6. STOPPED.

- **D25 — 2D grid moved WITH the camera + 3D deep-zoom FPS tank (user: "in 2D
  panning the grid does not move with the camera; in 3D it does. In 3D zooming
  in, in some situations the grid becomes too small/fine/high-resolution →
  FPS tank; in 2D I can zoom as much as I want", 2026-07-31).** TWO root causes.
  (1) 2D GRID SLIDE: frame.ts's 2D upload makes every instance's `place.xy`
  camera-relative (`inst − cx/cy`) for deep-zoom precision, but the procedural
  grid's PHASE (`band.zw` = a world point a grid line passes through) was left
  absolute. The shader computes lines as `place + rc − phase`, so mixing the
  camera-relative place with the absolute phase gave `wx = worldX − cx − worldX0`
  → every line sits at `worldX0 + cx + k·gs` and slides WITH the camera (grid
  reads screen-anchored) instead of staying world-anchored. 3D uploads absolute
  coords, so it was unaffected ("3D moves fine"). Fix: the 2D upload now shifts
  `band.zw` by −cx/−cy for fillRule-3 instances too. (2) 3D ZOOM FPS TANK: the
  tick LABELS were built inside the board's cached slice against the
  tile/domain superset — at deep zoom the step is tiny, so a large range yielded
  THOUSANDS of glyph instances per rebuild (measured 36k instances / 28.5ms at
  cameraScale 300 with a horizon ray-cast view). 2D survived because the raw
  viewport is small; the 3D ray-cast rect can be huge → "in some situations".
  Fix: labels are now UNCACHED and emitted AFTER the board cache against the
  LIVE viewport (`NumberPlane.renderLabels`), and additionally capped to ≤48 per
  axis via a nice-integer labelStep multiple (labels still land ON grid lines at
  round values). The cached slice keeps grid + axes + scene (tile superset);
  labels re-layout each world emit (2D pan re-emits every frame → always current;
  3D at camSig bands).   Deep-zoom rebuild dropped to ~0.8ms / ~260 instances.
  **tsc clean; 403 tests green; vite build ok.** Visual verdict = user. Awaiting
  CP6. STOPPED.
  **D25-fixup (same day):** the band.zw shift was implemented with a copy loop
  that skipped inst[14]/[15] for EVERY instance while only re-setting them for
  fillRule-3 — so every text glyph and plot stroke carried a STALE band.z/w
  (glyph bandH/invH) from the previous frame → "all text and plots broken" in
  2D. Fixed: copy all 14 fields verbatim, then override 14/15 only for grids.
  Regression test mirrors the 2D upload on a reused buffer (would have caught
  the stale values). 404 tests green.
- **D26 — The 3D math renderer is the analytic pipeline + a depth-write variant
  (2026-07-31, user green-lighted Phase 5 F3D work ahead of the CP6 cull).**
  The "can windfoil do 3D" question is settled: a *specialized* windfoil-based
  3D renderer for math (planes, curves, areas, vector diagrams) is correct and
  already substantially built. The dividing line is **locally-planar vs genuinely
  curved (2-manifold)** — NOT 2D vs 3D.
  - **Locally-planar content is analytic today.** The `fxActive` quaternion
    path (windfoil.wgsl:91-122) rigidly maps any flat glyph into 3D with real
    perspective; `rc` is NOT flat-interpolated (windfoil.wgsl:78,122) so the
    winding integral runs in the correct local plane coordinates even at
    grazing angles (the anisotropic branch at windfoil.wgsl:476-494 exists for
    exactly that), and `z = r.z + xa.z` is PER-VERTEX, not per-instance-flat.
    Camera orbit = a `viewProj` change; coverage recomputes exactly per frame.
    Planes, flat regions, vector shafts/heads, polyhedra, polytope (4D)
    projections, wireframe quadrics, glyph labels — all analytic.
  - **The one real enabler is a `depthWriteEnabled: true` pipeline variant.**
    The current analytic pipeline is test-only (gpu.ts:47). Crossing 3D curves
    and planes cannot self-occlude without it. With depth-write ON, per-vertex
    z (already working) gives correct per-fragment occlusion INSIDE the single
    draw call — opaque 3D analytic content drawn first, the depth-tested
    normal content after. This is a small pipeline addition (a second pipeline
    over the same shader + bind group), not a redesign.
  - **Curved fills stay sampled** (mesh3d + MSAA, per D3) — filled parametric/
    implicit surfaces, domain coloring on curved manifolds. The unique combo is
    the ANALYTIC OVERLAY on the mesh: crisp gridlines/contours/curves riding a
    shaded surface through the shared depth buffer.
  - **Gouraud-mismatch concern is bounded for math 3D.** Planes/curves/regions
    are flat-shaded per instance (windfoil-native); interpolation lives in
    mesh3d where per-vertex color is already interpolated. The blend problem
    only bites at the boundary (an analytic region edge sitting on a shaded
    surface) — a corner case, deferred.
  - **PIVOT (2026-07-31, user verdict on the #curve3d demo: "kinda unstable and
    ugly — accept that for 3D we will need mesh3d").** Flat analytic ribbons are
    the WRONG primitive for 3D curves: a ribbon has zero thickness along its own
    normal (reads as a paper strip, collapses at grazing angles), the camera-
    adaptive resampling popped during orbit, and strict-less z-fighting between
    quads and joint discs flickered. SPACE CURVES NOW RENDER AS WATER-TIGHT
    GOURAUD MESH TUBES (`pushTube` in curve3d.ts — swept N-gon, radial per-vertex
    normals, static camera-independent sampling → no popping, depth-tested
    crossings). The depth-write pipeline variant + opaqueCount pass + the
    quaternion frame helpers REMAIN as infrastructure for the genuinely locally-
    PLANAR content (slicing/tangent planes, flat regions, grids in arbitrary
    planes) where exact coverage is the point — that is D26's actual home, and
    it is kept per user choice ("mesh tubes + keep depth-write infra").
  - Requirements that are NOT in the plan yet and follow from this: (1) adaptive
    screen-space subdivision for space curves (perspective-projected Béziers are
    rational, not quadratic — F3D-2); (2) quiver3D / 3D vector fields (F3D-8);
    (3) grids in arbitrary planes (fillRule-3 is currently ground-plane-keyed);
    (4) plane∩mesh + curve∩plane intersection primitives (F3D-5 slicing).

## 2. Technical tips (file:line anchored)

**The 3D substrate already exists — extend, don't rebuild:**
- `src/windfoil/windfoil.wgsl:69` — `fxXforms` storage buffer, `vec4f` pair per
  instance (`rotX, rotY, z, scale`), applied when `fxActive`. Task 2.1 promotes
  this from FX-only to a Mobject-emitted property.
- `SPRINT.md` decision D6 (IDE FX sprint): **depth write stays OFF** on the
  windfoil pass; flying glyphs append last (painter order, z≥0). Extruded
  side-walls routed through `mesh3d` are depth-tested in a *separate* pipeline
  — the compositing boundary between the two is the risk in 2.2. See OQ-1.
- `src/windfoil/mesh3d.ts` — true-3D triangles + lines, shared depth buffer,
  Gouraud shading. v1 perf lesson (sprint/TODO.md): static vertex buffers
  upload ONCE; depth-view cached; frustum culling exists — don't regress these.
- `src/frame.ts:398-430` — windgraph board emit + `EmitCache` signature
  pattern: `emit(font, atlas, inst, crv, rws, now, view)`. Match it exactly.
- `src/camera/input.ts:143,169,321` — pointer routing already prioritizes
  windgraph handle grabs over camera pan. The Phase-1 board adapter reuses
  this; don't invent new input paths.

**Physics + FX machinery to wrap, not rewrite:**
- `src/ide/fx/physics.ts` — box3d.js rigid bodies per instance: clip planes,
  home transforms (`homeX/homeY` + `homeCx…`), sleep/dormancy pools, broadphase
  grid (`GRID_CELL=64`), reassembly-by-home. `PhysicsBoard` (H1) generalizes
  this: bars→boxes, dots→circles, polylines→chains.
- `src/ide/fx/fireworks.ts` — the `extras()` pattern (`extraFA`/`extraXF`
  appended instances) is how spawned particles/clones join the draw. Reuse for
  event bursts (H2) and shatter debris (H1).
- `src/ide/fx/morph.ts` (if shipped) / `logo.ts` — glyph-correspondence morph
  engine; strategies formation/collapse/explode/grid/stack.

**windgraph v1 assets to reuse:**
- `src/windgraph/interact/graph.ts` — `ConstraintGraph` (Kahn topo-sort, cycle
  detection) is the dependency engine for BOTH the board adapter (Phase 1) and
  the expression engine (Phase 5 lane L: expressions become `GObject`s).
- `src/windgraph/plot/implicit.ts` — marching squares already exists. G5
  (contour→surface) and A15 (labeled contours) build on `plotImplicit`; do not
  re-derive contours.
- `src/windgraph/anim/` — Scene/Timeline/ValueTracker/easing; `Transform` does
  path-correspondence morph (`resample`, `pointAtFraction`). Representation
  morphs (G1–G4) reuse this for the 2D side.
- `src/windgraph/math/mathtex.ts` — `MathTex` with write-on; glyph morph is
  crossfade-only today (v1 stretch item).
- `src/windgraph/space3d/project3d.ts` — `colormap`, `LIGHT_DIR`, `faceNormal`
  — the shading vocabulary for extrusion (2.2) and surfaces.

**Frame-level dirty tracking (perf pass 6 — read before touching frame.ts):**
- Still-frame path: `frameSig` match → skip emit/conversion/upload → the pass
  redraws persistent GPU buffers. Invariant that keeps it correct: the sig
  covers EVERYTHING that changes the bytes — content (board revs, hover ids,
  tile/zoom-band quantizations, grid toggle), camera (`viewX/viewY/viewZ` —
  the 2D conversion subtracts them per instance! — plus `cam3d.active`),
  canvas size, `staticRev` (theme/rebake), sharpen flag.
- `gpu.ts draw(..., dataVersion?)`: version supplied → writeBuffer only on
  version change; absent → legacy behavior (all other callers unchanged).
- Eligibility is opt-in per board (`frameSig` method) AND requires no
  time-dependent emitters in the app (editor caret blink etc.). Adding a new
  always-animated board to a demo? It must either lack `frameSig` or be in
  the exclusion list in frame.ts.
- screenHud skip: `frame(..., sig)`; rebuild bumps its internal dataVersion.
  HUD sig lives in frame.ts and includes toolbar hover, chip mode/status/
  pressed, both debug texts, and a 50ms tick while menu/panel are open.
- Debug line caveat: world section timings are measured in `emit`, so on
  skipped frames they show the LAST real emit — the cumulative `skipped N`
  counter (frame.ts → chip extra) is the truth for idle cost.

**Per-mobject slice caching (drag perf — read before touching WgScene.emit):**
- Each mobject's instances live in a typed `EmitCache` slice (`sliceCaches`,
  parallel to `emitList`/`syncables`). Syncables write fields and return a
  geometry sig; `markDirty` fires only on sig change; emit composes slices
  with direct-indexed writes (no pushes).
- Scratch-buffer seeding is load-bearing: scratch crv/rws are seeded with the
  atlas+static prefix ROW count (`ctx.rws.length/5`) so `EmitCache.capture`'s
  rel-detection (rowBase ≥ threshold) distinguishes scratch rows from atlas
  band references. Capture is called with `(0, seedRows*6, seedRows*5)`.
  If atlas size changes (`seedRows` changes), all slices invalidate.
- Plot groups: sig = `paramSig|lodScale`; resample (in `update()`) replaces
  children, slice rebuilds on sig change only.
- Direct draws (implicit/field) stay view-dependent with their own coarse-tile
  `directCache` — appended after slice composition.
- Idle re-emit is byte-identical (regression test asserts it) — so any visual
  difference between first draw and replay is a rebase bug, look at
  `appendInto`/`captureFrom` offsets first.
- **Rebase unit trap (the "strokes vanished" bug):** inst[12] = rowBase is a
  ROW index; crv/rws offsets passed around are FLOAT counts. `appendInto`'s
  rel-patch MUST add `rOff/5` (rows), and the rws row's quad-pointer adds
  `cOff/6` (quads). Mixing these up renders nothing (off-buffer row) yet keeps
  glyphs alive (atlas prefix, unpatched) — a signature that looks like "half
  the scene disappeared". Byte-identity tests do NOT catch it (wrong output is
  stable); the catch is asserting `inst[i+12] ∈ [0, rws.length/5)` after
  compose. Whenever you touch slice/board rebase, the SCREENSHOT is the
  ground-truth test — run it, don't trust green units alone.

**Perf facts (measured reasoning, not vibes):**
- Idle-frame cost is dominated by `EmitCache` replay: every cached board
  re-appends its slice to the shared `inst/crv/rws` JS arrays each frame
  (frame.ts clears them per frame — appending is mandatory, skipping is not
  possible at board level). Replay was 16 conditional pushes per instance;
  now native bulk pushes + in-place rowBase patches (`emitCache.ts`; contract
  tests in `src/windfoil/__test_emitCache.ts` — extend those before touching
  the rebase logic).
- `frame.ts` then converts `instJS` (number[]) → `instFA` (Float32Array):
  `set()` in 2D (fast), per-instance camera-relative loop in 3D (the 3D toggle
  costs — expected, opt-in).
- Hover hit-testing runs every frame from `frame.ts`; world + board guard on
  `wx|wy|scaleQ|revs` — keep that guard when adding new interactive layers.
- Plot LOD: `WgScene.setLodScale` (√zoom, 10% steps, min 48 samples) — board
  bumps `rev` on LOD change so the cache rebuilds once. Marching-squares
  implicits do NOT LOD yet (gridRes fixed) — candidate for Lane N.
- The structural fix for idle frames is instance-buffer diffing / persistent
  static GPU buffers (Lane N): static boards should upload once, not replay
  per frame. Everything above is a constant-factor win; that one is asymptotic.

**Phase 1 architecture (as built — read before extending):**
- `WgScene` (`runtime/object-resolver.ts`): constraint graph runs in WORLD
  space (free points store world coords; data→world via `plane.dToWx/dToWy` at
  resolve time). Angles/circles are therefore visually true even with
  non-uniform plane scales. Worklist build tolerates any doc order; validation
  guarantees termination.
- Live values flow through closures: `pt(WgPoint)` / `num(WgNum)` return
  getters over params/points; syncables re-read them after every
  `graph.update()` and `markDirty()` the Mobjects. Plot groups resample only
  when the numeric-param signature changes (`paramSig`).
- Implicit plots + fields are NOT Mobjects — they're view-dependent direct
  draws (`directDraws(ctx, view)`) calling `plotImplicit`/`plotVectorField`/
  `plotSlopeField`. Function/parametric/polar plots ARE Mobject polylines
  (animatable/morphable — the moat needs this). Discontinuities split into
  multiple polylines (jump > 4× plane height or non-finite).
- `WindgraphSceneBoard` (`playground/boards/windgraphScene.ts`) owns the
  `s.interactive` slot (superseded v1 `InteractDemo` — same position/button;
  `autoDrive` feeds the cinematic flight). Emit is cached on
  `rev|hoveredId|tile-quantized-view`; drag/param changes bump `rev`. Sliders
  are analytic, screen-constant (geometry ∝ 1/zoom), hit-tested before scene
  points in `tryBeginDrag`.
- `wgRepl(board, line)` is terminal-agnostic (returns lines); mutations
  validate the whole doc and roll back on error, then `board.rebuild()`.
  Terminal UI hookup = Phase 6 (Lane I).
- `emitTS` projects wg kinds: scene-level wg objects are "orphans" → `s.wg.*`;
  chapter-parented → `ch.wg.*` with NO chapter offset (data space). `$param`
  refs print as `s.param.ref('name')` via the existing `fmt`.

**Authoring system facts:**
- `src/authoring/runtime/runtime.ts` is 62KB in one file — task 0.1 splits it
  before anything else piles on. Proposed seams: draw-emit, input/interactive
  contract, object-tree/chrome, orbit-camera driving.
- `src/authoring/builder/scene.ts` (30KB) has the builder's existing object
  vocabulary — reconcile with new specs in 1.1/1.3 (extend, never fork).
- `src/authoring/islands/draw.ts` — `DrawHelpers` (10+ GPU primitives) shared
  by runtime + islands; windgraph boards get the same helpers.
- `src/authoring/repl.ts` — 13 existing scene commands; windgraph commands
  (1.6) follow that registration pattern.
- Demo routing is hash-based: `#authoring`, `#explainer-v2`, `#islands`,
  `#pages` (`src/authoring/demo.ts`). Playground boards get toolbar buttons
  (`src/playground/playground.ts:298-302` pattern) — extend for windgraph v2
  boards; see OQ-5.

## 3. Open questions (answer → move to decisions log)

- ~~**OQ-1 — Extruded side-walls: mesh3d or analytic fills?**~~ **Resolved
  2026-07-28 → D9 (analytic fills).** mesh3d walls alias their silhouette edges
  (the exact thing CP3 zooms 1000× onto); analytic quaternion-oriented wall quads
  stay in the single windfoil pass → razor-sharp silhouettes + seamless orbit-VP
  alignment. Convex opaque prism: emit all walls depth-sorted back-to-front +
  top face last (no cull — azimuth-sign robust). `space3d/extrude.ts` `emitPrism`;
  5 geometry tests (`__test_extrude.ts`) verify the quaternion walls stand vertical.
- ~~**OQ-2 — Contact shadow technique (2.5).**~~ **Resolved 2026-07-28 → D11
  (layered analytic fills).** Project the elevated silhouette along `LIGHT_DIR` to
  the ground plane (z=0), then draw it as a stack of concentric analytic fills
  whose alpha falls off outward (`0.55^i`) — a penumbra where EVERY layer edge is a
  coverage integral, so it stays razor-sharp at 1000× (never a raster blur). Offset,
  spread and strength all scale with height ⇒ the shadow animates continuously with
  elevation. Batched: ~4 fills per shadow, drawn first (painter order, under the
  prism). `space3d/extrude.ts` `emitShadow` (polygon) + `emitBlobShadow` (glyph
  ellipse); `Mobject.castShadow` → `emitPrism({shadow})`. CP3 may ask for a
  shader-based coverage-falloff penumbra instead (single fill) — swap-in if so.
- **OQ-3 — Expression engine vs authored specs (lane L).** Live calculator
  expressions and static SceneDoc parameters must coexist: spec parameter
  values should be allowed to *be* expressions evaluated per frame. Decide the
  binding in L1; likely `ConstraintGraph` nodes owned by the board adapter.
- **OQ-4 — Galton board scale (H4).** physics.ts shards UI glyphs (hundreds,
  mostly dormant). Hundreds of *live* bouncing balls may need substep/grid
  tuning (`SUBSTEPS=2`, `GRID_CELL=64` in physics.ts). Benchmark early in H4;
  fallback: deterministic custom circle-packing sim if box3d chokes.
- **OQ-5 — Board discovery UI.** Playground toolbar buttons (current pattern)
  vs island gallery (`islands/gallery.ts`) vs a windgraph gallery board.
  Interim: playground buttons. Revisit at CP6 with the full board count.
- **OQ-6 — Naming.** "windgraph" is a working title (sprint/README.md:3).
  Settle before Phase 6 export/branding work.
- **OQ-8 — IDE frame-time drift (user-reported 2026-07-27).** Idle IDE js time
  ~4 ms now vs 0.8–1.4 ms in the bento era. NOT a current-sprint regression
  (predates Phase 0; the runtime split is not in the IDE path). Part of the
  delta is legitimate new workload: editor/terminal/file-tree panels (three
  per-frame dynamic emitters), screenHud pass, analytic toolbar/menus, depth
  buffer — none existed in the bento era. But 4 ms needs a section breakdown
  to judge. Diagnosis plan: the `mark()` sections in `frame.ts` exist but only
  collect while `s.perf.running` (🧪 bench) — enable always-on collection (~14
  `performance.now()`/frame, negligible) + expose via `window.__frameMarks` or
  overlay second line, read the numbers, then fix the hot section or accept it.
  Candidate hot spots to check first: editor/terminal/tree emit (uncached by
  design), instance-buffer upload size, hover hitTest/resolveStyle (regressed
  once before — sprint/TODO.md), per-frame FX plumbing with FX off. **Deferred
  unless user calls it — lands naturally in Lane N perf gates.**
- ~~**OQ-7 — runtime.ts split seams (0.1).**~~ **Resolved 2026-07-27 → D8.**
  Seams confirmed as hypothesized, minus camera/playback/layout (too
  state-entangled to separate cleanly; they stay on the class).
- **OQ-9 — 2D↔3D must be indistinguishable at top-down (user, 2026-07-28).**
  User report: in the playground, toggling 2D↔3D changes the v1 surface EVEN
  top-down — "continuous" means top-down 3D should be indistinguishable from 2D.
  Root cause: the v1 graph3d renders TWO geometries — frame.ts:1440 flattens it
  in 2D (`meshVP` row 2 → z=0.5, height ignored = flat colour map) while 3D uses
  real height, so the CONTENT pops, not just the camera. **Design rule for the
  moat (2.1/2.2/2.3/2.4):** elevated content must ALWAYS carry its true z; only
  the projection changes. Under the 2D ortho VP the shader's clip-z row is zero
  (`cameraViewProj` ortho: only [0],[5],[15] set), so per-instance z is invisible
  → flat-looking; tilting to the perspective orbit reveals height continuously.
  No flat↔raised geometry switch ⇒ top-down 3D ≡ 2D by construction. CP3 verdict
  must check this: at polar≈0 the extrude board should read identical to 2D. The
  v1 graph3d flat-map path is out of Phase-2 scope (not a moat file); revisit if
  CP3 demands it. Residual camera-handoff mismatch = `enterOrbit` eps=0.0015 tilt
  (orbit.ts:137) + perspective foreshortening of off-ground content — keep the
  toggle easing polar continuously (2.4) so any residual is a glide, not a snap.

- **Concurrent tracks (2026-07-28).** Phase 2 runs alongside Track B (IR/plot:
  `ir/types.ts`, `ir/validate.ts`, `builder/objects.ts`, `windgraph/plot/*`) and
  Track C (`windgraph/interact/*`), plus new `plot/` + `linalg/` + `stats/` files
  landing in the same tree. `bunx tsc --noEmit` may show TRANSIENT errors in those
  files (e.g. `validate.ts:556 'exprs' is of type 'unknown'` from the in-flight
  `wg-plot-inequality` kind) that are NOT Phase-2 regressions. Phase-2's bar: the
  only tsc errors are in non-owned files; `src/windgraph/mobject|space3d`,
  `src/windfoil/windfoil.wgsl`, `src/playground/windgraphWorld.ts` +
  `boards/windgraphExtrude.ts` stay clean. Don't "fix" another track's WIP.

- **Phase 4 B+C+D+E domain logic notes (2026-07-28).** Architecture decisions
  for the IR-wiring session:
  - Lane B (`constraints.ts`): all new classes follow the GObject pattern.
    Conics (`GConic` subclasses) expose `sample(n): Vec2[]` for polyline
    rendering. `LocusCurve.sweep(path)` mutates the driver + calls
    `graph.update()` — the wiring session should call it once on param change,
    not per frame. `ConstructionProtocol` is stateful (step counter) — wire as
    a board-level controller, not a GObject. `TangentsFromPoint` and
    `CommonTangents` produce child `GLine` instances NOT added to the graph —
    the wiring session must add them or read `.lines` directly.
  - Lane C (`stats/`): all pure functions, seeded RNG via `rng` param for
    deterministic tests. `inverseSample` uses bisection on CDF (60 iters) —
    fine for interactive rates (n≤10k). Distributions return a `Distribution`
    interface `{pdf, cdf, mean, variance}`.
  - Lane D (`linalg/`): `Vec2` type lives in `matrix.ts`; `products.ts`
    imports it (no duplicate export). SVD is analytic 2×2 only (no Jacobi for
    n×n — not needed for the plane-morph boards). `transformGrid` returns line
    segments + transformed basis vectors for the 3b1b shot.
  - Lane E (`graph/`): `Graph` is `{nodes, edges, directed}` with integer
    node IDs. Force layout uses simple Euler integration (no Barnes-Hut — fine
    for n<200). `WeightedGraph` is separate from `Graph` (explicit weight
    field). Hierholzer's algorithm for Eulerian paths handles both circuit and
    path cases.
  - **Ambiguity noted:** B5 "tangent to curve at point" — implemented for
    circles only (GObject context). General parametric curve tangents are a
    pure-function concern for the plot wiring session. B2 `Median`/`Altitude`
    added as bonus (WINDGRAPH.md §B P0 lists them).
- **OQ-10 — Plot gallery board slot (Lane A, 2026-07-28).** `plotGalleryDoc()`
  (in `playground/boards/windgraphScene.ts`) showcases the A-catalog on one plane
  and is validated + resolver-tested, but has no playground button / world board —
  `demos.ts` and `windgraphWorld.ts` are Track A's files. Track A: host it as a
  `WindgraphSceneBoard` (e.g. `new WindgraphSceneBoard(plotGalleryDoc())`) in the
  world masthead or a toolbar button when convenient. Also open: A5's tangent is
  y=f(x)-only (matches the B5 note above); a tangent to an arbitrary *parametric*
  Mobject curve would reuse `calculus.derivative` on the curve's sampling.
- **OQ-11 — Screen-constant panel in 3D, rotated (user idea, 2026-07-31).** After
  D21 (fixed-size world panels), the user wants to explore panels that keep the
  SAME visible size while living in the world (anchored at the board corner,
  rotated/standing in the scene). Options: (a) keep the fixed-world panel but
  compensate the emitted scale per frame with `k = 1/cameraScale` *as a world
  object* — a perspective-projected rect whose world size is scaled so its
  on-screen size is constant (depth-correct placement, not the screen-HUD
  billboard); (b) billboard-toward-camera but in world space (billboard vertex
  orientation, still depth-tested against the scene). D21 is the stepping stone;
  revisit after CP6. **D22 verdict applies here too:** a per-frame size
  compensator in world space reads as wobble under a live perspective camera —
  the user rejected it for titles ("they still change size"); a same-visible-size
  panel would likely need the same treatment to feel right.

## 4. Lessons (digest of oldsprintplan/POSTMORTEM.md + v1 sprint)

- **Mirror tests must replicate the REAL shared path, not the intended one.**
  D25-fixup (2026-07-31): the first guard test for the 2D instance-upload change
  mirrored an *idealized* copy loop (assumed correct field handling), so it
  passed while the real loop in `frame.ts` silently skipped `band.zw` for every
  instance — shipping "all text and plots broken" in 2D. Rule: when guarding a
  shared low-level path (instance upload, cache rebase, shader encoding), copy
  the ACTUAL code into the test (field-by-field, including the reused-buffer /
  stale-value trap) and make the test fail on the old version before trusting
  it. An idealized mirror only guards the ideal.
- **Static before interactive.** Prove a feature with one static board, then
  add drag/animation. Most v1 pain came from building interactive demos on
  unproven statics.
- **A second `layout:'auto'` pipeline needs its OWN bind group (D26, 2026-07-31).**
  Two auto pipelines from the same shader are structurally identical, but WebGPU
  validation rejects a bind group created from pipeline A's `getBindGroupLayout(0)`
  when bound to pipeline B ("layout not created by the pipeline") — the whole
  command buffer goes invalid and the frame renders black. Create one bind group
  per pipeline (same entries) and select on draw. This is the D19 lesson ("editing
  a fragment's resource use invalidates its auto-layout bind group") generalized:
  auto layouts are per-pipeline objects, not shareable.
- **Match the system's grain.** Reuse `s.interactive`, the `emit(...)` board
  signature, `EmitCache`, existing input routing. New patterns need justification.
- **Never overwrite a file; targeted edits only; grep for duplicates after
  `replaceAll`.** A bad replaceAll once cost hours.
- **Don't fight infrastructure.** Vite/WASM fights get a 30-minute timebox,
  then the simplest alternative.
- **Perf regressions hide in per-frame work.** v1 regressions: per-frame
  `writeBuffer` of 1MB meshes, per-frame `createView()`, per-frame CSS selector
  matching on hover, per-glyph cmap lookups. Rule: anything in `frame()` runs
  60×/s — cache, dirty-track, or precompute.
- **The user is the only visual test runner.** Agents can't see the browser —
  that's exactly what the 🔍 checkpoints are for; never fake a visual verdict.

## 5. Direction reminders (why, when tired)

- The moat is §G/§H of `WINDGRAPH.md`: continuous 2D↔3D with glyph height, and
  physics-driven graphs. If a task doesn't serve the moat or unblock something
  that does, question whether it's in the right phase.
- Sharpness is the brand. Every 2D element must survive 1000× zoom in every
  board, including new chrome and shadows. Sampled 3D says so honestly (D3).
- One draw call is the religion. New passes need justification; batch geometry;
  keep per-frame CPU bounded.
- Smooth by construction: no snapping anywhere — every mode change is an
  animatable parameter (elevation, tilt, morph weight).
