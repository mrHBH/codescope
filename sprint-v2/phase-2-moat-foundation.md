# Phase 2 — Moat foundation

Sequential — touches shader/camera substrate (`windfoil.wgsl`, `mesh3d.ts`,
camera). Every task here is a CP-grade risk; do them one at a time with
typecheck + visual self-checks (boards) between.

**Gate: CP3 — the thesis kill-gate.** If continuous 2D↔3D doesn't read as one
space here, STOP and surface it; Phases 3–6 all assume this works.

---

## 2.1 — Promote per-instance 3D from FX-only to Mobject property

- [ ] `Mobject` gains `elevation`, `extrude`, `faceTilt` (animatable via
      ValueTracker/updaters). Windgraph board emit writes the same per-instance
      xform layout the shader already consumes (`windfoil.wgsl:69` `fxXforms`,
      `rotX/rotY/z/scale`) — without requiring `fxActive`/the FX system.
- [ ] FX path unchanged and still wins when active (fireworks/physics keep working).
- **Acceptance:** any mobject rises/tilts at rest in a board; all existing FX
  effects behave identically; typecheck clean.

## 2.2 — Extrude renderer

- [ ] Polygon with `extrude>0` emits: top face (existing `polygonQuads`,
      z-offset) + side walls. **Resolve OQ-1 here**: prototype mesh3d walls vs
      analytic-fill walls; pick by silhouette sharpness + compositing correctness
      against the depth-tested surface pass; record the decision in NOTES.md.
- [ ] Shading reuses `LIGHT_DIR` Gouraud term from `space3d/project3d.ts`.
- [ ] Static geometry uploads once (v1 perf lesson); elevation changes are the
      only per-frame cost.
- **Acceptance:** board: square extrudes 0→h on a slider; silhouette edge
  razor-sharp at 1000× and at grazing orbit; no z-fighting with 2D content.

## 2.3 — Glyph & math extrusion

- [ ] Generalize the fireworks/logo per-instance 3D (the `fxXforms` write in
      `fireworks.ts:79-97`) to `Label` and `MathTex` driven by Mobject
      `extrude` — the IDE logo effect becomes a first-class capability.
- **Acceptance:** board: extruded LaTeX headline + labels; tilts with camera;
  sharp at 1000× on glyph edges.

## 2.4 — Continuous camera tilt for any board

- [ ] Generalize the 🗻 pattern (`ctx.tilt(polar)`, `surface3dDemo`) to every
      board: double-tap toggles 2D ↔ tilted orbit with eased polar — no snap,
      no per-board special-casing.
- **Acceptance:** any windgraph board lifts into orbit and back mid-animation
  without a pop; cinematic flight can visit a tilted board.

## 2.5 — Analytic contact shadows

- [ ] Elevated objects cast soft shadows on the ground plane — resolve OQ-2
      with a prototype (silhouette projection + coverage-falloff penumbra);
      keep it batched into the existing pass.
- **Acceptance:** board: extruded square + glyph cast grounded shadows;
  penumbra edge stays sharp at 1000×; shadow animates continuously with elevation.

---

**After 2.5:** run CP3. This is the highest-stakes stop in the sprint.
