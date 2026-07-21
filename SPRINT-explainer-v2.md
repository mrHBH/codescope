# Sprint — Explainer v2: Safe-Area Pages, Living UI, Glyph-Trace Dives

**Status:** proposed (not started)
**Relation to main sprint:** *Additive.* Does **not** replace or edit `SPRINT.md` /
`SPRINT-TODO.md`. Builds on the authoring stack (`SceneDoc`, builder, `SceneRuntime`,
islands) and on the pages sprint (`page` groups, Taffy flex, `livePageSize`,
`layoutMap`). Its only product is a better **explainer v2** (`/#explainer2`,
cinematic mode) — the acceptance test of the authoring system.

---

## 0. Goal

Three pillars, one scene:

- **Pillar A — Bands-safe reactive layout.** The cinematic letterbox bars
  (`0.11·H` top + bottom, `cinematicHud.ts:208`) currently cover chapter content
  because the camera fit targets the *full* canvas (`runtime.ts:676`) and chapter
  interiors are absolutely positioned. Re-author every chapter as a **Taffy page**
  that is sized for the **covered state** (bands up) and **reflows to fill the
  screen when the bands disappear** (pause/stop). Many cards, varied layout tricks
  (flex-wrap grids, space-between strips, nested sub-pages, grow spacers,
  aspect-preserving island slots).
- **Pillar B — Living UI.** All UI is already analytic (`CinematicHud` emits pure
  vector instances). Prove it in-scene: during the *"everything is analytic,
  including the UI"* chapter, the **real timeline + fps bar peel off the screen,
  land as a card inside the chapter layout**, keep animating, **stay interactive**
  (scrubbing, buttons), and the camera **dives into them in 3D** to show they
  never lose quality.
- **Pillar C — Layout-resolved, glyph-trace dives.** Kill the hardcoded dive
  coordinates (`glyphBox` fractions, `explainerScene.ts:63`). Dive targets resolve
  from the **laid-out boxes** (`layoutMap`) at runtime, and the deep-zoom finale
  **follows the actual letter outline** (`glyphQuads` polyline) instead of a
  magic `[0.78, 0.55]` fraction.

**Out of scope:** REPL / GUI chrome / code projection, DOM-chrome demo path,
new npm deps, video export, pedagogy rewrite of chapter text (only restructuring
into layouts), changes to the pages demo.

---

## 1. Background — why each pillar exists

### 1.1 The bands problem (today)

- Bars slide in when the tour plays (`hud.setBars(true)` in `demo.ts:104`),
  `barT` damps 0→1; bars cover `0.11·H·barT` at top and bottom.
- Camera `fit` (`resolveFit`, `runtime.ts:670-679`) uses **full** `canvasW/canvasH`
  → the chapter box is framed for a screen that is then 22% covered. Top/bottom
  content (kicker rows, verdict chips, island captions) slides under the bars.
- Chapter interiors are absolute `at`s (`LX=76, RX=700`, `explainerScene.ts:9`) —
  nothing can move out of the way.

### 1.2 The living-UI opportunity (today)

- `CinematicHud.build()` already emits the whole chrome (letterbox, timeline,
  buttons, caption, fps panel) as **analytic instances** through `DrawHelpers`,
  into arbitrary buffers, in its own `W×H` coordinate space.
- `DrawHelpers.setTransform` (`draw.ts:21`) transforms **every** primitive,
  including text (`fsize = size·sx`, glyph placement via `layoutStr`). So the HUD
  can be emitted **into the scene buffers in world space** with one affine
  transform — zero shader/pipeline work, razor-sharp at any zoom by construction.
- Hit-testing is one affine away too: world point → HUD-local px → existing
  `hitScreen`/`pointerDownScreen`/`dragToScreen` (`cinematicHud.ts:142-184`).

### 1.3 The fragile dives (today)

- `cam.dive({ into: [fx, fy], zoom, box: glyphBox })` where `glyphBox` is a
  hand-computed guess (`explainerScene.ts:63`): wrong whenever an island slot
  moves, and meaningless once interiors are Taffy-laid.
- The actual letter outline is already available: `glyphQuads(font, ch)` →
  `flattenNorm` (`glyphAsset.ts:17`) gives an arc-length-walkable polyline of the
  exact glyph the islands render. A camera path can be sampled from it.

---

## 2. Acceptance tests (user-owned visual)

### Pillar A — safe-area layout

Open `/#explainer2`. Confirm:

| # | Check |
|---|-------|
| A1 | During the tour (bands up), **no chapter content is covered** by the letterbox bars in any of the 12 chapters. |
| A2 | Pausing (bars slide out) makes the active chapter **visibly reflow** — cards grow, gaps redistribute, text re-wraps — it does **not** merely scale up. |
| A3 | Resuming (bars slide in) reflows back to the compact covered state, smoothly, without jumps or one-frame glitches. |
| A4 | At least **6 chapters** use visibly different layout structures (per §3.3 catalog); at least **3** use multi-card arrangements; at least **1** uses flex-wrap and **1** uses nested sub-pages. |
| A5 | Islands inside cards still animate and their drag handles still work, in both covered and uncovered states. |
| A6 | Canvas resize mid-tour re-fits and re-flows correctly. |

### Pillar B — living UI

| # | Check |
|---|-------|
| B1 | In the designated chapter, the timeline + fps bar **detach from the screen** and fly to a card slot inside the chapter layout (smooth peel, no pop). |
| B2 | While detached, the playhead keeps sweeping and the fps counter keeps counting — visibly live, not a snapshot. |
| B3 | While detached, the timeline **still scrubs** and the play button still toggles, hit-tested in world space. |
| B4 | The camera dives into the detached HUD with a 3D tilt; at deep zoom the timeline text and playhead edges stay **razor sharp**. |
| B5 | Scrubbing **while zoomed deep** into the timeline works. |
| B6 | At chapter end the HUD reattaches to the screen cleanly; the rest of the tour behaves as before. |

### Pillar C — layout-resolved + glyph-trace dives

| # | Check |
|---|-------|
| C1 | No `glyphBox`-style hardcoded boxes remain in `explainerScene.ts`; every dive targets a **laid-out object box**. |
| C2 | Resizing the canvas or toggling bands does not make any dive miss its target. |
| C3 | The finale dive visibly **traces the letter's contour** (follows the curve of the glyph, not a straight zoom to a point). |
| C4 | The traced glyph is the one actually rendered by the island (same char, same box) — verified by eye, the camera never leaves the ink. |

### Global

| # | Check |
|---|-------|
| G1 | `bunx tsc --noEmit` clean; new unit tests (`__test_safeArea.ts`, `__test_trace.ts`) green. |
| G2 | `/#pages` demo and `/#authoring` demo unchanged and working. |
| G3 | No new dependencies. |

---

## 3. Architecture (locked for this sprint)

### 3.1 Safe-area model — the math

One number drives everything: `barT ∈ [0,1]` (owned by `CinematicHud`, smooth-
damped; `0` = no bands, `1` = full letterbox).

```
bandFrac      = 0.11                                 (matches cinematicHud.ts:208)
H_eff(barT)   = H · (1 − 2·bandFrac·barT)            (visible height between bands)
```

A chapter page marked **safe** (`page.safe: true`) gets:

```
W_p           = page.nominalW ?? 1260                (fixed world width, authored)
H_p(barT)     = W_p · H_eff(barT) / W                (world height tracks bands)
camera fit z  = W / (W_p + 2·mX)                     (mX ≈ 40 world px margin)
```

**Consequences (the key invariants):**

1. `z` does **not** depend on `barT` → **the camera never moves when bands
   toggle**. The page's on-screen height is exactly `H_eff` at all times, so
   content always fills the safe area and is never covered.
2. When bands drop, `H_p` grows (≈ +28% on 16:9) and **Taffy reflows** the
   interior — the visible "layout reacts to fill the screen" moment.
3. Safe pages are **center-anchored**: world top = `at[1] − H_p/2`. The page
   grows/shrinks symmetrically around its center, so the fit center is invariant
   under `barT` too. (For safe pages, `at` is interpreted as the page center;
   documented in the schema.)
4. Re-solve triggers: `barT` change (only during play/stop transitions, ~30
   frames), canvas resize (debounced 150 ms), normal edit invalidations.
   `barT` is **not** read during dives/drift — page size never depends on live
   zoom → no per-frame re-solves.
5. **Covered state is the authoring reference.** Content must read well at
   `H_p(1)`; `flexGrow` spacers / `space-between` distribute the uncovered delta.
6. The lower-third **caption stays an overlay** (movie grammar). Authoring
   guideline: nothing critical in the bottom-left ~35% × ~14% screen zone.

**Legacy chapters** (not yet migrated): `resolveFit` becomes bands-aware
(`H_eff` instead of `H`) so Pillar A phase E0 fixes coverage for the whole scene
before any re-authoring. On `stop()`, the runtime keeps driving `applyPose`
while `barT > 0.01` (a short `fitSettling` window) so the camera eases to the
uncovered fit as the bars slide out.

### 3.2 Chapter → page migration

- Schema (all additive): `PageMeta` gains `safe?: boolean`, `nominalW?: number`.
  `GroupSpec` may now carry **both** `chapter` and `page`+`layout` (a safe page
  that is also a chapter — timing/camera from `chapter`, sizing/interior from
  `page`+`layout`). Validation extended accordingly.
- `LayoutSpec` gains `wrap?: boolean` (maps to taffy `flexWrap`; the WASM bridge
  already supports it, `taffy.ts:16`).
- The runtime's existing page machinery (`solveDocLayout`, `livePageSize`,
  `layoutMap`, two-pass wrap, `emitObjectAt`) is reused unchanged; safe pages
  only add a per-frame size driver (`livePageSize.set(chId, [W_p, H_p(barT)])`
  + center-anchor in the emit/cull paths) in a new small module
  `runtime/safeArea.ts`.
- Chapter world geography (`CH[].pos`) is preserved; `at` becomes the page
  center for safe pages.

### 3.3 Layout catalog — "many cards, variety of tricks"

Each chapter gets a distinct flex structure (covered state first):

| Chapter | Layout structure | Tricks exercised |
|---------|------------------|------------------|
| splash | centered column, title + sub | two `flexGrow:1` spacer rects absorb the entire band delta |
| problem | row split: text col (kicker/head/body) + island card with caption strip | `space-between` verdict chip row; island `fill:true` |
| bitmap / sdf / tess | same skeleton, accent-colored **chip cards** for the verdict; bitmap adds a 3-stat card row | card row with `space-evenly`; `minWidth` guards |
| answer | equation **banner card** + island card + two small stat cards ("exact", "any zoom") | nested sub-page for the banner; stretch rows |
| inside | island card + **param readout card** (live point coords) + hint footer | footer `justify: space-between`; `alignSelf: center` |
| pixel | island card + coverage-% readout card | readout via param clip; grow island slot |
| bands | island card + probe readout card | same pattern, different accent (rhythm without repetition) |
| same | **2×2 card grid (flex-wrap)** text/icon/math/ui **+ the HUD card slot** (Pillar B) | `wrap:true`; nested sub-pages per card; fixed-aspect minis |
| gpu | pipeline **stage cards in a row** with arrow glyphs between, island below | `space-between` row; fixed-width stage cards |
| infinite | single island card filling the page, caption strip | the stage for the glyph trace (Pillar C) |

### 3.4 Living UI — HUD as a world object

New module `runtime/hudWorld.ts`. One doc param drives the effect:
`hudDetach: number ∈ [0,1]` (animated by an ordinary `param` clip — params are
evaluated before objects, runtime reads it per frame).

- **Emit path.** `CinematicHud.build()` gains an optional `out` mode: it already
  takes target buffers and `(W,H)`; world mode calls it with the **scene**
  buffers and its own virtual `(W_v,H_v)` (e.g. 1280×720), wrapped in
  `draw.setTransform(origin.x, origin.y, s, s)` where `s = slotW / W_v`.
  `DrawHelpers` transforms everything including text — no shader changes, no
  `frame.ts` changes (world copy rides the normal scene draw).
- **Peel choreography.** At `hudDetach = 0` the HUD renders screen-space as
  today (overlay buffers, screen hit-test). For `0 < d < 1`: the overlay alpha
  fades by `(1−d)` while the world copy's transform lerps from the
  **screen-locked pose** (the world-space rect that exactly reproduces the
  overlay under the current view-projection — computed per frame from the
  inverse camera mapping) to the **slot pose** (the laid-out box of the
  `hud-slot` card in the `same` chapter page). At `d = 1` the overlay is
  skipped entirely; the HUD is a world object pinned to the layout — it even
  **reflows with the bands** like any other card.
- **Interactivity.** `tryBeginDrag`/`dragTo`/`updateHover` map the world point
  into HUD-local px (`(w − origin)/s`) and call the existing
  `hitScreen`/`pointerDownScreen`/`dragToScreen`. Scrubbing, play, replay, back
  all work while detached — including mid-dive, because the mapping is an exact
  affine under a moving camera.
- **Dive.** The chapter's camera dives into the `hud-slot` card via `fitObj`
  (§3.5) with a polar tilt (≈ 0.5 rad) for the 3D read, holds while the user can
  scrub, pushes deep into the playhead edge (zoomMul ≈ 20), then pulls back and
  `hudDetach` returns to 0.
- **fps bar** rides along (it is part of the HUD build — the debug panel
  detaches with everything else; `D` toggle still works).
- **Optional polish tricks** (pick ≤ 2, timeboxed): (a) live caption under the
  HUD card: `"this UI = N instances · same draw call"` fed by `hudCount`;
  (b) x-ray tint of the HUD instances by row-band (ties back to the `bands`
  chapter); (c) letterbox bars themselves peel as two world rects during the
  transition.

### 3.5 Layout-resolved & glyph-trace dives

Schema (additive, `CameraKeyframe`):

```ts
interface CameraKeyframe {
  // ...existing fields...
  fitObj?: string;                 // resolve center/zoom from this object's laid-out box
  trace?: {                        // expanded by the RUNTIME into sub-keyframes
    target: string;                // glyph spec id, or island spec id (glyph islands)
    zoom: number;                  // deep zoom multiplier along the trace
    d: number;                     // seconds spent tracing
    samples?: number;              // outline samples (default 48)
    pullBack?: boolean;            // end with a keyframe back to chapter fit
  };
}
```

- **`fitObj` resolution** (`runtime/camera.ts` + `runtime.ts`): box =
  `layoutMap.get(id)` + owning page origin (+ island world transform for
  islands). Center = box center; zoom = fit box to the **safe area** at `barT=1`
  (tour reference) × `zoomMul`; `offset` composes as today. Fallback for
  non-layout objects: spec `at`/`size` directly. Constraint (validated):
  `fitObj` targets must not be `moveTo`-animated.
- **Trace expansion** (`runtime/trace.ts`): resolve the target's world glyph
  outline —
  - `glyph` spec: char + laid-out box directly;
  - glyph-island spec: `IslandDef` gains optional `contentBox?: (slot: Box) => Box`
    (islands already compute `place()` internally, `glyphAsset.ts:57`) and
    `glyphChar?: string`; implemented by `glyph-analytic`, `bitmap-dissolve`,
    `sdf-field`, `tessellation-fan`;
  then `glyphQuads` → `flattenNorm(sub=4)` → arc-length parameterize → sample
  `samples` points → emit N keyframes (center = point, zoom = trace zoom,
  `ease: 'linear'` for constant arc speed) spanning `d` seconds, plus the
  optional pull-back keyframe. Expansion is cached by `(layout generation,
  target)` and re-expanded on layout invalidation — timeline semantics stay
  `state = f(t)` within a generation.
- **Migration:** every `cam.dive({ into, zoom, box: glyphBox })` in
  `explainerScene.ts` becomes `cam.diveObj({ target: '<island-id>', zoom })`
  (builder sugar for `fitObj`), deleting all `glyphBox` math. The `infinite`
  chapter finale becomes `cam.trace({ target: 'infinite-g0', zoom: 14, d: 6,
  pullBack: true })`; `problem` gets a short intro trace at moderate zoom.

### 3.6 Perf notes

- Safe-page re-solve: one active chapter page (~40–80 taffy nodes) — trivial;
  only during band transitions/resize, never per-frame steady state.
- HUD world copy: one extra `build()` per frame while `hudDetach > 0`
  (~hundreds of instances) — same order as today's overlay build; overlay build
  is skipped at `d = 1`, so cost does not double at rest.
- Trace expansion: ≤ 64 samples × one flatten; cached per layout generation.

---

## 4. Phase plan

Each phase ends with a **user CHECKPOINT** (the user owns visual testing).
Typecheck (`bunx tsc --noEmit`) after every task. Dependencies: E0 → E1 →
{E2, E3} (E2/E3 independent, either order) → E4.

### Phase E0 — Bands-aware fit (stop the bleeding, runtime-only)

| Task | What | Verify |
|------|------|--------|
| E0-1 | New `runtime/safeArea.ts`: `bandFrac`, `effHeight(H, barT)`, safe-page size helpers. Unit test `__test_safeArea.ts` (math only). | `bun src/authoring/runtime/__test_safeArea.ts` green |
| E0-2 | `resolveFit` uses `H_eff` (reads `cinematicHud.barT`, defaults 0 outside cinematic). | typecheck |
| E0-3 | `fitSettling`: `update()` keeps driving `applyPose` after `stopTour` until `barT < 0.01`. | typecheck |
| E0-4 | **CHECKPOINT:** tour covers nothing in any chapter; pause → bars drop → camera eases to fill screen; resume → bars + fit return. | user confirms |

### Phase E1 — Chapter → safe-page migration

| Task | What | Verify |
|------|------|--------|
| E1-1 | Schema: `PageMeta.safe/nominalW`, `LayoutSpec.wrap`, chapter+page combo; validate.ts; builder: `s.chapter(..., { page: { safe, nominalW }, layout })` or `chapterPage()` sugar. IR tests extended. | `bun src/authoring/ir/__test_ir.ts` green |
| E1-2 | Runtime: safe-page size driver + center-anchor (emit, cull, fit); invalidation on `barT`/resize. `solve.ts` maps `wrap`. | typecheck; `__test_safeArea.ts` extended |
| E1-3 | Migrate **`same`** chapter end-to-end (card grid, wrap, nested sub-pages — the showcase). | **CHECKPOINT:** user confirms reflow on pause/resume, cards grow not scale |
| E1-4 | Migrate `splash`, `problem`, `answer`. | typecheck |
| E1-5 | Migrate `bitmap`, `sdf`, `tess` (shared skeleton + per-chapter chip cards). | typecheck |
| E1-6 | Migrate `inside`, `pixel`, `bands` (island card + readout card pattern). | typecheck |
| E1-7 | Migrate `gpu`, `infinite`. | typecheck |
| E1-8 | **CHECKPOINT:** full tour chapter-by-chapter; A1–A6. | user confirms |

### Phase E2 — Living UI

| Task | What | Verify |
|------|------|--------|
| E2-1 | `runtime/hudWorld.ts`: world emit path (scene buffers + `setTransform`), `hudDetach` param read, overlay/world crossfade. | typecheck |
| E2-2 | Peel: screen-locked pose → slot pose lerp; `hud-slot` card in `same` chapter layout; pin at `d=1`. | **CHECKPOINT:** peel looks smooth, HUD lands in the card |
| E2-3 | World hit-test (inverse affine → `hitScreen` family); scrub + buttons while detached. | **CHECKPOINT:** user scrubs the detached timeline |
| E2-4 | Camera dive into `hud-slot` (`fitObj`, polar tilt, deep push on playhead edge), then pull-back + reattach clip. | **CHECKPOINT:** B4–B6 |
| E2-5 | Optional polish (≤ 2 tricks, timeboxed): instance-count caption / x-ray bands tint / bars peel. | user picks at checkpoint |

### Phase E3 — Layout-resolved + glyph-trace dives

| Task | What | Verify |
|------|------|--------|
| E3-1 | `fitObj` in schema + validate + `resolveFit` object path (layout boxes + fallback). IR tests. | `bun src/authoring/ir/__test_ir.ts` green |
| E3-2 | Replace all `glyphBox` dives with `cam.diveObj({ target, zoom })`; delete `glyphBox` math from `explainerScene.ts`. | **CHECKPOINT:** every dive lands on its island, C1–C2 |
| E3-3 | `IslandDef.contentBox/glyphChar` on the 4 glyph islands. | typecheck |
| E3-4 | `runtime/trace.ts`: outline resolution, arc-length sampling, keyframe expansion + cache; `cam.trace` builder. Unit test `__test_trace.ts` (deterministic samples, arc-length monotonic). | `bun src/authoring/runtime/__test_trace.ts` green |
| E3-5 | Wire trace into `infinite` (finale) + `problem` (intro). | **CHECKPOINT:** C3–C4 — camera follows the ink |

### Phase E4 — Docs + polish

| Task | What |
|------|------|
| E4-1 | Update `PROGRESS.md` (explainer v2 state), `AGENTS.md` (sprint pointer if needed). |
| E4-2 | Perf sanity: no steady-state re-solves; HUD world copy cost verified in debug panel. |
| E4-3 | Final full-tour review checkpoint with the user. |

---

## 5. File map

**New:**
```
src/authoring/runtime/safeArea.ts          __test_safeArea.ts
src/authoring/runtime/hudWorld.ts
src/authoring/runtime/trace.ts             __test_trace.ts
```

**Modified (targeted edits only):**
```
src/authoring/ir/types.ts        PageMeta.safe/nominalW, LayoutSpec.wrap, CameraKeyframe.fitObj/trace
src/authoring/ir/validate.ts     validate the new fields (+ fitObj referential integrity)
src/authoring/ir/__test_ir.ts    new validation tests
src/authoring/builder/scene.ts   chapter-page opts, diveObj/trace builders, card vocab reuse
src/authoring/runtime/runtime.ts safe-page driver, fitObj resolution, hudDetach wiring, trace expansion hook
src/authoring/runtime/camera.ts  fitObj branch; expanded-track consumption
src/authoring/runtime/cinematicHud.ts  world-out mode, detach blending, barT getter
src/authoring/islands/registry.ts      IslandDef.contentBox/glyphChar (optional)
src/authoring/islands/builtin/{glyphAnalytic,bitmapDissolve,sdfField,tessellationFan}.ts
src/authoring/scenes/explainerScene.ts  the big migration (chapters → safe pages, cards, trace)
PROGRESS.md, AGENTS.md
```

**Not touched:** `src/windfoil/`, `src/camera/`, `src/frame.ts`, pages demo,
DOM-chrome demo, REPL/GUI code. **No new dependencies.**

---

## 6. Execution rules (contract for the implementing agent)

1. Follow the phase tables literally; if anything contradicts the code, **STOP
   and ask the user** — never guess.
2. One task at a time; `bunx tsc --noEmit` after every task; run the task's
   `Verify` command before marking done.
3. Never overwrite an existing file — targeted edits only. No git commits.
4. No scope creep: no refactors, cleanups, or helpers beyond what a task says.
5. Visual checkpoints belong to the user — present each CHECKPOINT via
   `ask_user` and wait for confirmation.
6. Match existing code style (`// ── Title ──` headers, terse functions,
   no-extension imports); reuse the modules in `SPRINT-TODO.md`'s reuse table.
7. Keep `state = f(t)` sacred: trace expansion and safe-page sizing must be
   deterministic per layout generation; no wall-clock leaks into the timeline.

---

## 7. Open questions (resolve at kickoff)

1. **Band toggle feel** — center-anchored pages give zero camera motion on
   pause/resume (recommended). Alternative: top-anchored pages + a small
   "settle" camera ease. Pick after seeing E1-3.
2. **Living UI depth** — full sequence (peel → card → interactive dive →
   reattach, recommended) vs. minimal (world copy + dive, no peel choreography).
3. **Trace usage** — `infinite` finale only, or also the `problem` intro
   (recommended: both — it bookends the story).
