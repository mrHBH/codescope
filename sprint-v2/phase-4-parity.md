# Phase 4 — Parity fan-out

Five lanes, **max parallelism** — disjoint modules, each task = one board +
its module file(s), all built on the Phase-1 adapter (objects as specs,
sliders bound, REPL reachable). Review batched at CP6, where the user culls.

Convention: every board gets a playground button; every plot/geometry object
is authored through the IR/builder (no board-local ad-hoc drawing of
object-like content — decision D1); 1000×-zoom sharpness checked per board.

---

## Lane A — plot catalog (18)

- [x] **A1** Piecewise functions `{cond: expr}` (pairs with K2 `\cases`).
- [x] **A2** Inequality shading `f(x,y)>0` + systems of inequalities.
- [x] **A3** Sequences/discrete `aₙ` plots + cobweb input scaffolding.
- [x] **A4** Splines (Catmull-Rom, natural cubic, B-spline) with draggable
      control points + de Casteljau construction animation.
- [x] **A5** Tangent/normal at draggable point + live linked `f′`/`f″` curves.
- [x] **A6** Accumulation function `F(x)=∫ₐˣ f` live curve.
- [x] **A7** Riemann → trapezoid → Simpson toggle, animated n + error readout
      (extends v1 `riemannRectangles`).
- [x] **A8** Streamlines (RK-integrated field lines, animated flow).
- [x] **A9** ODE `y′=f(x,y)` through draggable initial points (RK4) + systems
      phase portraits with multiple trajectories.
- [x] **A10** Bifurcation diagrams (batched point splats).
- [x] **A11** Fourier partial sums + epicycle construction (rotating arcs
      drawing the curve).
- [x] **A12** Histogram with auto-binning (Sturges/Freedman–Diaconis) + animated re-bin.
- [x] **A13** Box plot · violin · strip/beeswarm (beeswarm jitter via H-lane
      collision resolution when physics is on, deterministic fallback otherwise).
- [x] **A14** Bubble chart · matrix heatmap · 2D histogram/hexbin.
- [x] **A15** Contours: line + filled bands + **labeled** (billboarded MathTex
      labels) — builds on `plotImplicit`.
- [x] **A16** Regression suite (linear/poly/exp/logistic/power) + R² + residual
      plot toggle + confidence band.
- [x] **A17** Candlestick/OHLC · waterfall · funnel · radar/spider · wind rose.
- [x] **A18** Ternary plot · parallel coordinates · scatterplot matrix (facets).

## Lane B — geometry (12)

- [x] **B1** Triangle centers: circumcenter, incenter, orthocenter, excenters
      + Euler line + nine-point circle (constraint specs from Phase 1).
- [x] **B2** Perpendicular/angle bisectors · tangent to curve at point ·
      tangents from external point.
- [x] **B3** Circle by 3 points · by diameter · incircle · excircles.
- [x] **B4** Radical axis · polar/pole · common tangents · Apollonius circle.
- [x] **B5** Live conics: ellipse from 2 foci (string definition animated),
      parabola from focus+directrix, hyperbola, conic through 5 points.
- [x] **B6** Rotation · translation · dilation with visible ghost intermediates.
- [x] **B7** Circle inversion + Möbius transforms (exact generalized circles —
      analytic arcs make this non-tessellated; differentiator).
- [x] **B8** Trace mode + **locus curve** (sample the dependent point's path as
      a free point sweeps; fit to Bézier contours).
- [x] **B9** Drag constraints: horizontal/vertical lock, snap-to-grid, snap-to-angle.
- [x] **B10** Live measurement labels: length, angle°, area, slope, radius.
- [x] **B11** Construction protocol: ordered step list with replay/step/play.
- [x] **B12** Regular n-gon with n slider; n→∞ morphs to circle.

## Lane C — stats & probability (7)

- [x] **C1** Distribution library (normal, binomial, Poisson, exponential,
      uniform, geometric, χ², t, F) — PDF/CDF curves + parameter sliders.
- [x] **C2** Live sampling: draw n → dots + histogram build up.
- [x] **C3** CLT animation: means histogram converging as n grows.
- [x] **C4** Random walks 1D/2D · Brownian motion · diffusion limit.
- [x] **C5** Monte Carlo π (animated darts, running estimate) · Buffon's needle
      (reuses H-lane physics for the needles).
- [x] **C6** Correlation playground: drag scatter, live r + regression;
      Anscombe's quartet one-click.
- [x] **C7** Confidence-interval visualizer (drag n) · hypothesis-test shading
      (two distributions, draggable μ, p-value area).

## Lane D — linear algebra (6)

- [x] **D1** Matrix transforms the plane: grid + basis vectors morph under A
      (entry sliders) — the interactive 3b1b shot.
- [x] **D2** Determinant as signed parallelogram area, animated through collapse at 0.
- [x] **D3** Eigenvectors as invariant lines under a draggable matrix.
- [x] **D4** Matrix multiplication as composition (two grids + ghost intermediate).
- [x] **D5** Dot product as projection · cross product as parallelepiped volume
      (3D, uses Phase-2 extrude/mesh).
- [x] **D6** Change of basis (dual grids) · Gram–Schmidt animation · SVD as
      rotate–scale–rotate.

## Lane K — math typesetting (6)

- [x] **K1** Matrices + growing delimiters `\left(…\right)` (v1 stretch → promote).
- [x] **K2** `\begin{cases}` piecewise brace (renders the A1 definitions).
- [x] **K3** `align`/`align*` multi-line + equation numbers.
- [x] **K4** Accents (`\hat \bar \vec \tilde \dot`) + overbrace/underbrace with labels.
- [x] **K5** Extensible arrows `\xrightarrow[text]{}`.
- [x] **K6** Formula↔graph binding: click coefficient `a` in rendered `f(x)=ax²`
      → attaches its spec slider (Phase-1 parameter system makes this wiring,
      not invention).

---

**After all lanes:** run CP6 (gallery cull). Record culls as struck tasks in
Phases 5–6 where they cascade.
