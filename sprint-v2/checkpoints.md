# windgraph v2 — Human feel-checkpoints

The ONLY authorized stops during execution. Each CP: the agent prepares the
build, hands the user these exact steps, and records the verdict below it.
A verdict can cull tasks — strike them in the phase files with a reason.

---

## CP1 — Regression smoke (after Phase 0)

**Purpose:** prove the substrate repair changed nothing visible.
**Steps:** `bun run dev`, then visit in order: `#authoring`, `#explainer-v2`,
`#islands`, `#pages`, and the playground cinematic flight (🎬).
**Should feel:** exactly as before — no layout shift, no missing islands,
explainer timing intact, typecheck + all `src/authoring/**/__test_*.ts` green.
**Report:** anything off, else "clear".

> **Verdict: PASSED (2026-07-27).** "all is still identical." (User also
> reported idle-IDE js ~4 ms vs bento-era 0.8–1.4 — established as pre-existing
> drift, NOT this split; tracked as NOTES.md OQ-8, deferred to Lane N.)

---

## CP2 — The drag feel (after Phase 1)

**Purpose:** validate the board-adapter + primitives contract before 100 tasks build on it.
**Steps:** `bun run dev` → **`#windgraph`** (the dedicated infinite-canvas
world; the playground's triangle button hosts the same scene).
1. **Triangle board:** drag vertices A/B/C — circumcircle, centroid G, midpoint
   M, angle arc + degree readout, and the |BC| distance label recompute live.
   Drag the glider P around the circumcircle (must stay on the ring). Scrub the
   `amplitude` slider (teal `a·sin(x)` wave) and `radius` (pink circle).
2. **Geometry board:** drag A/B (the two lines pivot about their intersection
   I), drag C — the perpendicular foot F slides along l1, the gold drop
   segment, reflection C′, distance readout and angle at I all follow. Drag the
   glider G along the teal line.
3. **Plots board:** scrub `petals` (rose morphs) and `damping` (gold envelope
   tightens); the lemniscate + vector field stay crisp.
4. Pan the open canvas (dot grid glides), then zoom deep (1000×) onto a point
   label and onto a curve — razor-sharp; panning must not stutter (caches).
5. Hover points — gold ring + grab cursor.
(REPL commands are headless-only at this stage — `wgRepl` is unit-tested;
terminal wiring is Phase-6 chrome.)
**Should feel:** as responsive as the v1 Phase-5 interact demo — no lag, no
snapping; the scene is visibly *authored* (SceneDoc) yet fully
direct-manipulable.
**Questions:** Does the adapter contract hold? Is anything about object
selection/grab feel wrong? Sliders usable? (This is the last cheap moment to
change the contract.)

> **Verdict:** _pending_

---

## CP3 — The thesis kill-gate (after Phase 2)

**Purpose:** decide whether continuous 2D↔3D reads as *one space*. If this
fails, the plan stops and rethinks — do not proceed to Phase 3 on a maybe.
**Steps:** on the extrude board: sweep extrusion 0→h while double-tapping the
tilt toggle mid-sweep; orbit freely; zoom 1000× onto an extruded silhouette
edge and onto a shadow penumbra; tilt an extruded math headline.
**Should feel:** no mode switch, no snap, no pop; silhouette edges stay sharp
at grazing angle; shadow reads as grounded, not pasted.
**Questions:** One continuous space, or a 2D mode and a 3D mode? Does extruded
glyph text feel premium or gimmicky? Kill / continue / rework-what?

> **Verdict:** _pending_

---

## CP4 — Flagship #1: contour→surface (after G6)

**Purpose:** is this the "nobody else can do this" shot?
**Steps:** open `contour_lift`. Scrub the lift slider slowly (contours rise,
skin stretches between them), then fast; orbit; zoom into the skin and into a
contour line where it meets the skin. Play the cinematic flight capture.
**Should feel:** one continuous object changing representation — never two
things crossfading. Sharp contour lines on a smooth shaded surface.
**Questions:** Launch-worthy / needs-work (what) / wrong idea?

> **Verdict:** _pending_

---

## CP5 — Flagship #2: Galton board (after H4)

**Purpose:** does physics feel real?
**Steps:** open `galton_board`. Drop 500 balls; watch the pile build and the
live histogram approach the normal curve. Grab and throw a ball mid-fall.
Tilt the board in 3D while balls are live.
**Should feel:** weight, bounce variance, satisfying clatter-into-order —
physics, not a simulation-of-physics cutscene. Histogram genuinely tracks the pile.
**Questions:** Launch-worthy? Any uncanny stiffness? Perf at 500 balls?

> **Verdict:** _pending_

---

## CP6 — Gallery cull (after Phase 4)

**Purpose:** taste-driven backlog pruning before depth work.
**Steps:** one sitting — fly the gallery, open any ~5 boards per lane (A/B/C/D/K),
drag things, scrub sliders.
**Questions:** Which boards feel weak? Which parity items should be CUT from
Phases 5–6 entirely? Which deserve extra polish? (Record culls as struck tasks.)

> **Verdict:** _pending_

---

## CP7 — Depth check (after Phase 5)

**Purpose:** ship/fix/cut per lane.
**Steps:** gyroid implicit surface under deep zoom (verify the "sampled"
labeling reads honestly, no aliasing lies); type live expressions and watch
plots update; grab-and-throw in the force-directed graph; scrub an animation
with the new scrub bar.
**Questions:** Per lane (F3D / L / E / J): ship / fix (what) / cut?

> **Verdict:** _pending_

---

## CP8 — Final (after Phase 6)

**Purpose:** done or not done.
**Steps:** the full flight — an authored SceneDoc scene with sliders → contour
lift → Galton drop → orbit → SVG export of a frame → reopen via URL state.
**Questions:** Is this a product? What's the one thing still embarrassing?

> **Verdict:** _pending_
