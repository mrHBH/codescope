# Phase 3 — The moat (flagships)

Two lanes run **in parallel** — disjoint modules: lane G owns mobject/mesh
emit; lane H owns the physics wrapper over `src/ide/fx/physics.ts` machinery.

**Gates: CP4** (contour→surface) and **CP5** (Galton board).
**Milestone:** after both pass, the project has two genuinely novel demos even
if nothing else ever ships. Deliberate pause point.

---

## Lane G — continuous 2D↔3D (depends on Phase 2)

- [ ] **G1** Bars ↔ 3D columns morph — same instances, elevation animates;
      slider + auto-play. Board `bars_to_columns`. *Acceptance: one object
      changing representation, never a crossfade of two.*
- [ ] **G2** Scatter ↔ point cloud · heatmap cells ↔ height field (cells rise
      to their values). Board `scatter_cloud_heatmap`. *Acceptance: per-cell
      elevation continuous; sharp cell edges at zoom.*
- [ ] **G3** Pie ↔ donut ↔ cylinder-segments morph (arc primitives + extrude).
      Board `pie_to_cylinder`.
- [ ] **G4** `y=f(x)` ribbon → `z=f(x,y)` surface morph — the function gains a
      second argument while the ribbon extrudes along z; cross-fade geometry
      weight between the analytic pass and mesh3d, never switch pipelines by cut.
      Board `ribbon_to_surface`.
- [ ] **G5** **Contours → surface (flagship).** `plotImplicit` level curves
      lift to their heights; a skin interpolates between them on one slider.
      Reuse marching-squares output from `plot/implicit.ts` (NOTES §2). Board
      `contour_lift`. *Acceptance: sharp contour lines sitting on a smooth
      Gouraud skin; the slider reads as one continuous object.*
- [ ] **G6** Cinematic flight capture of G5 + camera-keyframe polish (extend
      `story/` CameraRig). *Acceptance: a flight shot that orbits the lift
      mid-sweep without a stutter.*

**→ CP4 after G6.**

## Lane H — physics (depends on Phase 1 adapter)

- [ ] **H1** `PhysicsBoard`: generic Mobject→body mapping (bars→boxes,
      dots→circles, polylines→segment chains) wrapping the `physics.ts` shard
      machinery (clip planes, home transforms, sleep/dormancy, reassembly).
      Debris via the `fireworks.ts` `extras()` spawn pattern. Board
      `shatter_rebuild`. *Acceptance: any board can shatter on trigger and
      reassemble to home; dormant bodies cost ~nothing.*
- [ ] **H2** Event-triggered bursts — e.g. root found → spark burst at the
      intersection (fireworks particle pattern, board-scoped). Board `event_burst`.
- [ ] **H3** Spring easing family (under/critically damped) as first-class
      easings in `windgraph/anim/easing.ts` + elastic glider drag
      (overshoot + settle). Board `spring_gallery`.
- [ ] **H4** **Galton board (flagship).** Static peg bodies + circle balls via
      box3d; pile forms binomial→normal; live histogram counts landings.
      Address OQ-4 (scale/substeps) with an early benchmark. Board `galton_board`.
      *Acceptance: 500 balls, normal curve emerges, 60fps, grab-and-throw works.*
- [ ] **H5** Physics beeswarm (collision-resolved strip jitter) + ball rolling
      on `z=f(x,y)` with real dynamics (pairs with `authoring/scenes/lossSurface3d.ts`).
      Board `beeswarm_gradient`.

**→ CP5 after H4** (H5 may finish before or after the checkpoint; CP5 focuses
on the flagship).
