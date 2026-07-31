# Phase 5 — Depth

Four lanes in parallel. Subject to CP6 culls — check `checkpoints.md` CP6
verdict before starting a lane; struck items are skipped.

**Gate: CP7** (ship/fix/cut per lane).

---

## Lane F3D — 3D catalog (9, needs Phase 2)

- [ ] **F3D-1** Parametric surfaces `S(u,v)`: torus, Möbius, helicoid, catenoid,
      Enneper, ellipsoid — u/v range sliders morph the mesh live (static buffer
      re-upload only on param change).
- [x] **F3D-2** Space curves as analytic tubes: helix, torus knots `(p,q)`,
      3D Lissajous (stroke engine extruded along the curve). **DONE (2026-07-31,
      D26).** PIVOT per user verdict: solid 3D curves = WATER-TIGHT GOURAUD MESH
      TUBES (`pushTube` in `windgraph/space3d/curve3d.ts` — swept N-gon, radial
      normals, static sampling, `#curve3d` board + world board). The depth-write
      pipeline variant (`gpu.ts depthWrite` + `frame.ts` opaque `opaqueCount()`
      pass) stays as infrastructure for locally-planar 3D content (planes,
      regions, grids); the flat-ribbon analytic emission was removed as
      user-rejected.
- [ ] **F3D-3** Implicit surfaces `f(x,y,z)=0` via marching cubes in a worker
      thread; smooth-shaded; gyroid showcase. **Labeled "sampled" per D3** —
      adaptive tessellation + silhouette refinement; never claims analytic AA.
- [ ] **F3D-4** Solid of revolution: 2D curve swept about an axis, animated
      sweep with ghost profile (the 2D→3D story made literal).
- [ ] **F3D-5** Slicing plane: draggable cross-section of any surface/volume;
      contour drawn in-plane + projected on floor (linked views).
- [ ] **F3D-6** Tangent plane + normal vector at a draggable surface point;
      gradient ascent/descent path animated on the surface.
- [ ] **F3D-7** 3D scatter/point cloud (elevated instances) · 3D bars (columns
      — reuse G1 geometry).
- [ ] **F3D-8** 3D vector field: arrows in space · streamtubes/cones on a seed line.
- [ ] **F3D-9** Quadric gallery with discriminant-driven classification (drag
      coefficients through the discriminant; watch a hyperboloid split into a cone).

## Lane L — expression engine + lite CAS (7, needs Phase 1)

- [ ] **L1** Parser: `y=…`, `r=…`, `(x(t),y(t))`, inequalities, piecewise,
      lists `[1…10]`, Σ/Π, subscripted `y₁` → expressions compile to
      `ConstraintGraph` GObjects (resolve OQ-3: spec params may be expressions).
- [ ] **L2** Stats functions: mean, median, stdev, quantile, nCr, nPr.
- [ ] **L3** Regression syntax `y₁ ~ mx₁ + b` (feeds A16).
- [ ] **L4** Symbolic differentiation (lite CAS): power/product/chain/trig
      rules → exact `f′` shown beside the numeric trace (A5).
- [ ] **L5** Symbolic integration table (pattern-matched, honest about coverage).
- [ ] **L6** `Root`/`Extremum` numeric solvers as commands (GeoGebra parity).
- [ ] **L7** REPL exposure via the authoring DSL — the REPL (1.6) grows a
      calculator mode over the live board.

## Lane E — graph theory (5, needs H3 springs)

- [ ] **E1** Named graphs: Petersen, Kₙ, Cₙ, grids, trees, random G(n,p).
- [ ] **E2** Force-directed layout via spring physics (H3) — drag nodes, layout
      settles; optional 3D layout with node heights.
- [ ] **E3** Algorithm animations: BFS/DFS wavefront, Dijkstra shortest path
      (step or play).
- [ ] **E4** Kruskal/Prim MST animation.
- [ ] **E5** Eulerian path pen-trace + adjacency-matrix linked view (click cell
      → highlight edge — first linked-views instance, feeds I10).

## Lane J — animation extensions (6)

- [ ] **J1** Scrub bar + loop/ping-pong over any timeline (analytic chrome per D5).
- [ ] **J2** Stagger/group animations (per-element delay waves).
- [ ] **J3** Partial reveal: radial/sweep/contour-rise unveilings (surface-aware).
- [ ] **J4** Animation→physics handoff: a morph ends and the object *falls*
      (H1 PhysicsBoard takes over mid-flight; seamless because same instances).
- [ ] **J5** Camera keyframe tracks: position/tilt/roll with easing (extend
      `story/` CameraRig into a full crane).
- [ ] **J6** Explain mode: auto-annotated steps (tangent appears, label writes
      itself via MathTex write-on, value counts up).

---

**After all lanes:** run CP7.
