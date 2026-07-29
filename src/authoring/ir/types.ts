// ── SceneDoc — canonical schema ────────────────────────────────────────────
// The single JSON-serializable value. Every tool reads and writes this shape.

export interface SceneDoc {
  version: 1;
  meta: { title: string };
  objects: Record<string, ObjectSpec>;
  params: Record<string, ParamDef>;
  clips: ClipSpec[];
  camera: CameraTrack;
}

// ── Objects ──────────────────────────────────────────────────────────────

export type ObjectSpec =
  | TextSpec | GlyphSpec | RectSpec | CircleSpec | PolygonSpec | LineSpec
  | MathSpec | GroupSpec | IslandSpec
  | WgPointSpec | WgSegmentSpec | WgVectorSpec | WgPolylineSpec | WgPolygonSpec
  | WgCircleSpec | WgArcSpec | WgEllipseSpec | WgConicSpec
  | WgMidpointSpec | WgCentroidSpec | WgIntersectionSpec | WgGliderSpec
  | WgReflectionSpec | WgLineThroughSpec | WgPerpendicularSpec | WgParallelSpec
  | WgCircumcircleSpec | WgAngleSpec | WgDistanceSpec
  | WgPlotFnSpec | WgPlotParametricSpec | WgPlotPolarSpec | WgPlotImplicitSpec
  | WgFieldSpec
  | WgPlotPiecewiseSpec | WgPlotInequalitySpec | WgPlotSequenceSpec | WgPlotSplineSpec
  | WgPlotTangentSpec | WgPlotAccumulationSpec | WgPlotRiemannSpec | WgStreamlinesSpec
  | WgPlotOdeSpec | WgPlotBifurcationSpec | WgPlotFourierSpec | WgHistogramSpec
  | WgBoxplotSpec | WgPlotCellsSpec | WgContoursSpec | WgRegressionSpec
  | WgChartFinSpec | WgChartMultiSpec
  | WgCircumcenterSpec | WgIncenterSpec | WgOrthocenterSpec | WgExcenterSpec
  | WgEulerLineSpec | WgNinePointSpec
  | WgPerpBisectorSpec | WgAngleBisectorSpec | WgMedianSpec | WgAltitudeSpec
  | WgTangentSpec | WgTangentsFromSpec
  | WgCircleDiameterSpec | WgIncircleSpec | WgExcircleSpec
  | WgRadicalAxisSpec | WgPolarLineSpec | WgPolePointSpec | WgCommonTangentsSpec | WgApolloniusSpec
  | WgRotatedPtSpec | WgTranslatedPtSpec | WgDilatedPtSpec
  | WgInversionSpec | WgMobiusSpec
  | WgLocusSpec | WgRegularPolygonSpec
  | WgHLockSpec | WgVLockSpec | WgGridSnapSpec | WgAngleSnapSpec
  | WgLengthSpec | WgSlopeSpec | WgRadiusSpec | WgAreaSpec
  | WgDistributionSpec | WgSamplingSpec | WgCltSpec | WgRandomWalkSpec
  | WgMonteCarloSpec | WgCorrelationSpec | WgHypothesisSpec
  | WgMatrixGridSpec | WgDeterminantSpec | WgEigenvectorsSpec
  | WgMatrixComposeSpec | WgDotProductSpec | WgSvdSpec
  | WgGraphSpec | WgTraversalSpec | WgShortestPathSpec | WgMstSpec | WgEulerianSpec;

export interface TextSpec {
  kind: 'text'; id: string;
  content: string; at: Vec2;
  size: number; color: Color;
  weight?: number; align?: 'left' | 'center' | 'right';
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface GlyphSpec {
  kind: 'glyph'; id: string;
  char: string; at: Vec2;
  size: number; color: Color;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface RectSpec {
  kind: 'rect'; id: string;
  at: Vec2; size: Vec2;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface CircleSpec {
  kind: 'circle'; id: string;
  center: Vec2; radius: number;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface PolygonSpec {
  kind: 'polygon'; id: string;
  points: Vec2[]; closed?: boolean;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface LineSpec {
  kind: 'line'; id: string;
  points: Vec2[]; width: number;
  color: Color; dash?: number[];
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface MathSpec {
  kind: 'math'; id: string;
  latex: string; at: Vec2;
  size: number; color: Color;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface GroupSpec {
  kind: 'group'; id: string;
  at: Vec2; children: string[];
  size?: Vec2;
  layout?: LayoutSpec;
  chapter?: ChapterMeta;
  page?: PageMeta;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface ChapterMeta {
  title: string; sub: string; duration: number;
}

export interface IslandSpec {
  kind: 'island'; id: string;
  island: string; at: Vec2;
  size?: Vec2;
  params?: Record<string, ParamValue | ParamRef>;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

// ── windgraph objects (sprint-v2 Phase 1 — see sprint-v2/contracts.md §2) ─
// Object-like math content: typed parameters, identity, draggable/measurable,
// per-object clips. Resolved to windgraph Mobject/GObject instances by the
// board adapter's object-resolver. Field values accept ParamRef ({ $param })
// for slider binding — same wire as IslandSpec.params.

/** Numeric value: literal or parameter-bound. */
export type WgNum = number | ParamRef;
/** Point: literal [x,y], parameter-bound, or another object's id. */
export type WgPoint = Vec2 | ParamRef | string;

export interface WgPointSpec {
  kind: 'wg-point'; id: string;
  at: WgPoint;
  /** Draggable; becomes a free node in the board's constraint graph. */
  free?: boolean;
  label?: string;
  color?: Color; radius?: number;
  opacity?: number; visible?: boolean;
}

export interface WgSegmentSpec {
  kind: 'wg-segment'; id: string;
  from: WgPoint; to: WgPoint;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgVectorSpec {
  kind: 'wg-vector'; id: string;
  from: WgPoint; to: WgPoint;
  color?: Color; width?: number;
  opacity?: number; visible?: boolean;
}

export interface WgPolylineSpec {
  kind: 'wg-polyline'; id: string;
  points: WgPoint[];
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPolygonSpec {
  kind: 'wg-polygon'; id: string;
  points: WgPoint[];
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgCircleSpec {
  kind: 'wg-circle'; id: string;
  center: WgPoint; radius: WgNum;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgArcSpec {
  kind: 'wg-arc'; id: string;
  center: WgPoint; radius: WgNum;
  a0: WgNum; a1: WgNum;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgEllipseSpec {
  kind: 'wg-ellipse'; id: string;
  center: WgPoint; rx: WgNum; ry: WgNum; rot?: WgNum;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** Stub kind — validated here, resolved in Phase 4 (B5 live conics). */
export interface WgConicSpec {
  kind: 'wg-conic'; id: string;
  conic: 'ellipse' | 'hyperbola' | 'parabola';
  foci?: string[]; directrix?: string; through?: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

// Constraint constructions: inputs are object ids; the board adapter registers
// them in its ConstraintGraph (cycles rejected by validation).

export interface WgMidpointSpec {
  kind: 'wg-midpoint'; id: string;
  a: string; b: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgCentroidSpec {
  kind: 'wg-centroid'; id: string;
  points: string[];
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgIntersectionSpec {
  kind: 'wg-intersection'; id: string;
  a: string; b: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgGliderSpec {
  kind: 'wg-glider'; id: string;
  curve: string; t: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgReflectionSpec {
  kind: 'wg-reflection'; id: string;
  p: string; axis: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgLineThroughSpec {
  kind: 'wg-line-through'; id: string;
  a: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPerpendicularSpec {
  kind: 'wg-perpendicular'; id: string;
  line: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgParallelSpec {
  kind: 'wg-parallel'; id: string;
  line: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgCircumcircleSpec {
  kind: 'wg-circumcircle'; id: string;
  a: string; b: string; c: string;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** Angle mark + live measure label at `vertex`. */
export interface WgAngleSpec {
  kind: 'wg-angle'; id: string;
  a: string; vertex: string; b: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** Distance readout label between two points. */
export interface WgDistanceSpec {
  kind: 'wg-distance'; id: string;
  a: string; b: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}

// Plots: expressions are compiled by windgraph/expr (variables: x / x,y / t
// plus scene param names). Function closures attach at builder level; the
// serialized form is always the expression string.

export interface WgPlotFnSpec {
  kind: 'wg-plot-fn'; id: string;
  expr: string;
  domain?: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotParametricSpec {
  kind: 'wg-plot-parametric'; id: string;
  xExpr: string; yExpr: string;
  tRange: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotPolarSpec {
  kind: 'wg-plot-polar'; id: string;
  rExpr: string;
  tRange: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotImplicitSpec {
  kind: 'wg-plot-implicit'; id: string;
  expr: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgFieldSpec {
  kind: 'wg-field'; id: string;
  field: 'vector' | 'slope';
  /** vector: (xExpr, yExpr) components · slope: ignored (dy/dx = yExpr). */
  xExpr?: string; yExpr: string;
  density?: number;
  color?: Color;
  opacity?: number; visible?: boolean;
}

// ── windgraph plot catalog (sprint-v2 Phase 4 · Lane A) ──────────────────────
// Object-like plots resolve to Mobject groups (animatable/morphable); field-like
// plots (inequality shading, streamlines, bifurcation, contours) resolve to
// view-dependent direct draws. Data arrays are literal (JSON-serializable).

export type QuadMode = 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson';
export type SplineKind = 'catmull' | 'cubic' | 'bspline';
export type RegKind = 'linear' | 'poly' | 'exp' | 'logistic' | 'power';
export type BinMethod = 'sturges' | 'fd';
export type Cmp = '>' | '<' | '>=' | '<=';

/** A1 — piecewise y = { cond: expr, … }; first matching condition wins. */
export interface WgPlotPiecewiseSpec {
  kind: 'wg-plot-piecewise'; id: string;
  pieces: { cond: string; expr: string }[];
  domain?: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A2 — shade the region where each expr satisfies its comparison (intersection). */
export interface WgPlotInequalitySpec {
  kind: 'wg-plot-inequality'; id: string;
  exprs: string[];
  cmps?: Cmp[];
  fill?: Color;
  gridRes?: number;
  opacity?: number; visible?: boolean;
}

/** A3 — discrete sequence aₙ = expr(n); optional cobweb for xₙ₊₁ = expr(xₙ). */
export interface WgPlotSequenceSpec {
  kind: 'wg-plot-sequence'; id: string;
  expr: string;
  nRange?: [WgNum, WgNum];
  cobweb?: boolean;
  x0?: WgNum;
  iters?: number;
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A4 — spline through control points (which may be draggable point ids). */
export interface WgPlotSplineSpec {
  kind: 'wg-plot-spline'; id: string;
  points: WgPoint[];
  spline?: SplineKind;
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A5 — tangent/normal at a (draggable) point + live f′/f″ companion curves. */
export interface WgPlotTangentSpec {
  kind: 'wg-plot-tangent'; id: string;
  expr: string;
  at: WgNum;
  domain?: [WgNum, WgNum];
  showNormal?: boolean;
  showDerivatives?: boolean;
  samples?: number;
  stroke?: Stroke;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** A6 — accumulation F(x) = ∫ₐˣ f(t) dt. */
export interface WgPlotAccumulationSpec {
  kind: 'wg-plot-accumulation'; id: string;
  expr: string;
  from: WgNum;
  domain?: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A7 — Riemann/trapezoid/Simpson columns with animated n. */
export interface WgPlotRiemannSpec {
  kind: 'wg-plot-riemann'; id: string;
  expr: string;
  domain: [WgNum, WgNum];
  n: WgNum;
  mode?: QuadMode;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A8 — RK-integrated streamlines through a vector field (direct draw). */
export interface WgStreamlinesSpec {
  kind: 'wg-streamlines'; id: string;
  xExpr: string; yExpr: string;
  density?: number;
  steps?: number;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** A9 — ODE y′=f(x,y) (or a system when xExpr is set) through initial points. */
export interface WgPlotOdeSpec {
  kind: 'wg-plot-ode'; id: string;
  yExpr: string;
  xExpr?: string;
  through: WgPoint[];
  domain?: [WgNum, WgNum];
  h?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A10 — bifurcation diagram of xₙ₊₁ = expr(r, x) (batched point splats). */
export interface WgPlotBifurcationSpec {
  kind: 'wg-plot-bifurcation'; id: string;
  expr: string;
  rRange: [WgNum, WgNum];
  iters?: number;
  transient?: number;
  rSteps?: number;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** A11 — Fourier partial sums + optional epicycle construction. */
export interface WgPlotFourierSpec {
  kind: 'wg-plot-fourier'; id: string;
  expr: string;
  terms: WgNum;
  period?: WgNum;
  domain?: [WgNum, WgNum];
  epicycles?: boolean;
  samples?: number;
  stroke?: Stroke;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** A12 — histogram with auto-binning. */
export interface WgHistogramSpec {
  kind: 'wg-histogram'; id: string;
  data: number[];
  method?: BinMethod;
  bins?: number;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A13 — box plot · violin · strip/beeswarm. */
export interface WgBoxplotSpec {
  kind: 'wg-boxplot'; id: string;
  data: number[];
  variant?: 'box' | 'violin' | 'strip' | 'beeswarm';
  at?: WgNum;
  color?: Color;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A14 — bubble chart · matrix heatmap · 2D histogram/hexbin. */
export interface WgPlotCellsSpec {
  kind: 'wg-plot-cells'; id: string;
  cell: 'bubble' | 'heatmap' | 'hexbin';
  points?: Vec2[];
  sizes?: number[];
  matrix?: number[][];
  size?: WgNum;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A15 — line + filled + labeled contours (builds on plotImplicit). */
export interface WgContoursSpec {
  kind: 'wg-contours'; id: string;
  expr: string;
  levels?: number[];
  count?: number;
  filled?: boolean;
  labels?: boolean;
  palette?: Color[];
  gridRes?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A16 — regression suite + R² + residual toggle + confidence band. */
export interface WgRegressionSpec {
  kind: 'wg-regression'; id: string;
  points: Vec2[];
  fit: RegKind;
  degree?: number;
  showResiduals?: boolean;
  showBand?: boolean;
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A17 — candlestick/OHLC · waterfall · funnel · radar/spider · wind rose. */
export interface WgChartFinSpec {
  kind: 'wg-chart-fin'; id: string;
  chart: 'candle' | 'waterfall' | 'funnel' | 'radar' | 'windrose';
  ohlc?: { x: number; open: number; high: number; low: number; close: number }[];
  values?: number[];
  labels?: string[];
  color?: Color;
  fill?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** A18 — ternary plot · parallel coordinates · scatterplot matrix. */
export interface WgChartMultiSpec {
  kind: 'wg-chart-multi'; id: string;
  chart: 'ternary' | 'parallel' | 'scattermatrix';
  columns?: number[][];
  triples?: [number, number, number][];
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

// ── Lane B: geometry constraint kinds (Phase 4) ────────────────────────────

export interface WgCircumcenterSpec {
  kind: 'wg-circumcenter'; id: string;
  a: string; b: string; c: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgIncenterSpec {
  kind: 'wg-incenter'; id: string;
  a: string; b: string; c: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgOrthocenterSpec {
  kind: 'wg-orthocenter'; id: string;
  a: string; b: string; c: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgExcenterSpec {
  kind: 'wg-excenter'; id: string;
  a: string; b: string; c: string; which: 'a' | 'b' | 'c';
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgEulerLineSpec {
  kind: 'wg-euler-line'; id: string;
  a: string; b: string; c: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgNinePointSpec {
  kind: 'wg-nine-point'; id: string;
  a: string; b: string; c: string;
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgPerpBisectorSpec {
  kind: 'wg-perp-bisector'; id: string;
  a: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgAngleBisectorSpec {
  kind: 'wg-angle-bisector'; id: string;
  a: string; vertex: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgMedianSpec {
  kind: 'wg-median'; id: string;
  vertex: string; a: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgAltitudeSpec {
  kind: 'wg-altitude'; id: string;
  vertex: string; a: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgTangentSpec {
  kind: 'wg-tangent'; id: string;
  circle: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgTangentsFromSpec {
  kind: 'wg-tangents-from'; id: string;
  circle: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgCircleDiameterSpec {
  kind: 'wg-circle-diameter'; id: string;
  a: string; b: string;
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgIncircleSpec {
  kind: 'wg-incircle'; id: string;
  a: string; b: string; c: string;
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgExcircleSpec {
  kind: 'wg-excircle'; id: string;
  a: string; b: string; c: string; which: 'a' | 'b' | 'c';
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgRadicalAxisSpec {
  kind: 'wg-radical-axis'; id: string;
  c1: string; c2: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgPolarLineSpec {
  kind: 'wg-polar-line'; id: string;
  circle: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgPolePointSpec {
  kind: 'wg-pole-point'; id: string;
  circle: string; line: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgCommonTangentsSpec {
  kind: 'wg-common-tangents'; id: string;
  c1: string; c2: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgApolloniusSpec {
  kind: 'wg-apollonius'; id: string;
  c1: string; c2: string; c3: string;
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgRotatedPtSpec {
  kind: 'wg-rotated-pt'; id: string;
  p: string; center: string; angle: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgTranslatedPtSpec {
  kind: 'wg-translated-pt'; id: string;
  p: string; dx: WgNum; dy: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgDilatedPtSpec {
  kind: 'wg-dilated-pt'; id: string;
  p: string; center: string; factor: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgInversionSpec {
  kind: 'wg-inversion'; id: string;
  p: string; circle: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgMobiusSpec {
  kind: 'wg-mobius'; id: string;
  p: string; a: WgNum; b: WgNum; c: WgNum; d: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgLocusSpec {
  kind: 'wg-locus'; id: string;
  driver: string; dependent: string;
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgRegularPolygonSpec {
  kind: 'wg-regular-polygon'; id: string;
  center: WgPoint; n: WgNum; radius: WgNum; rot?: WgNum;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgHLockSpec {
  kind: 'wg-h-lock'; id: string;
  p: string; y?: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgVLockSpec {
  kind: 'wg-v-lock'; id: string;
  p: string; x?: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgGridSnapSpec {
  kind: 'wg-grid-snap'; id: string;
  p: string; step?: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgAngleSnapSpec {
  kind: 'wg-angle-snap'; id: string;
  p: string; center: string; step?: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}
export interface WgLengthSpec {
  kind: 'wg-length'; id: string;
  a: string; b: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgSlopeSpec {
  kind: 'wg-slope'; id: string;
  line: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgRadiusSpec {
  kind: 'wg-radius'; id: string;
  circle: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgAreaSpec {
  kind: 'wg-area'; id: string;
  points: string[];
  color?: Color;
  opacity?: number; visible?: boolean;
}

// ── Lane C: stats & probability kinds (Phase 4) ────────────────────────────

export type DistName = 'normal' | 'binomial' | 'poisson' | 'exponential' | 'uniform' | 'geometric' | 'chi2' | 't' | 'f';

export interface WgDistributionSpec {
  kind: 'wg-distribution'; id: string;
  dist: DistName;
  params?: WgNum[];
  showCdf?: boolean;
  domain?: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgSamplingSpec {
  kind: 'wg-sampling'; id: string;
  dist: DistName;
  params?: WgNum[];
  n: WgNum;
  seed?: number;
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgCltSpec {
  kind: 'wg-clt'; id: string;
  dist: DistName;
  params?: WgNum[];
  sampleSize: WgNum;
  trials?: WgNum;
  seed?: number;
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}
export interface WgRandomWalkSpec {
  kind: 'wg-random-walk'; id: string;
  dims: 1 | 2;
  steps: WgNum;
  walks?: WgNum;
  seed?: number;
  brownian?: boolean;
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgMonteCarloSpec {
  kind: 'wg-monte-carlo'; id: string;
  method: 'pi' | 'buffon';
  n: WgNum;
  seed?: number;
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgCorrelationSpec {
  kind: 'wg-correlation'; id: string;
  points?: Vec2[];
  anscombe?: 1 | 2 | 3 | 4;
  showRegression?: boolean;
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgHypothesisSpec {
  kind: 'wg-hypothesis'; id: string;
  test: 'z' | 't';
  mu0: WgNum;
  mu1?: WgNum;
  sigma?: WgNum;
  n: WgNum;
  alpha?: WgNum;
  domain?: [WgNum, WgNum];
  stroke?: Stroke; fill?: Color;
  opacity?: number; visible?: boolean;
}

// ── Lane D: linear algebra kinds (Phase 4) ─────────────────────────────────

export interface WgMatrixGridSpec {
  kind: 'wg-matrix-grid'; id: string;
  entries: [WgNum, WgNum, WgNum, WgNum];
  extent?: WgNum;
  gridStep?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgDeterminantSpec {
  kind: 'wg-determinant'; id: string;
  entries: [WgNum, WgNum, WgNum, WgNum];
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgEigenvectorsSpec {
  kind: 'wg-eigenvectors'; id: string;
  entries: [WgNum, WgNum, WgNum, WgNum];
  extent?: WgNum;
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgMatrixComposeSpec {
  kind: 'wg-matrix-compose'; id: string;
  a: [WgNum, WgNum, WgNum, WgNum];
  b: [WgNum, WgNum, WgNum, WgNum];
  extent?: WgNum;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgDotProductSpec {
  kind: 'wg-dot-product'; id: string;
  u: [WgNum, WgNum]; v: [WgNum, WgNum];
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgSvdSpec {
  kind: 'wg-svd'; id: string;
  entries: [WgNum, WgNum, WgNum, WgNum];
  extent?: WgNum;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

// ── Lane E: graph theory kinds (Phase 4) ───────────────────────────────────

export type GraphKind = 'petersen' | 'complete' | 'cycle' | 'path' | 'grid' | 'star' | 'wheel' | 'tree' | 'random';

export interface WgGraphSpec {
  kind: 'wg-graph'; id: string;
  graph: GraphKind;
  n?: WgNum;
  m?: WgNum;
  p?: WgNum;
  seed?: number;
  layout?: 'force' | 'circular';
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgTraversalSpec {
  kind: 'wg-traversal'; id: string;
  graph: GraphKind;
  n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; layout?: 'force' | 'circular';
  algo: 'bfs' | 'dfs';
  start?: WgNum;
  color?: Color; radius?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgShortestPathSpec {
  kind: 'wg-shortest-path'; id: string;
  graph: GraphKind;
  n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; layout?: 'force' | 'circular';
  from?: WgNum; to?: WgNum;
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgMstSpec {
  kind: 'wg-mst'; id: string;
  graph: GraphKind;
  n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; layout?: 'force' | 'circular';
  algo: 'kruskal' | 'prim';
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}
export interface WgEulerianSpec {
  kind: 'wg-eulerian'; id: string;
  graph: GraphKind;
  n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; layout?: 'force' | 'circular';
  mode: 'circuit' | 'path';
  color?: Color;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface Stroke {
  color: Color; width: number;
}

// ── Layout (Taffy-backed; v1: flex/stack only) ───────────────────────────

export type LayoutSpec = {
  kind: 'flex'; direction: 'row' | 'column'; gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  wrap?: boolean;
};

export interface PageMeta {
  title?: string;
  resizable?: boolean;
  minSize?: Vec2;
  maxSize?: Vec2;
  /** Safe-area page: sized for the letterbox-band state, reflows on band toggle. */
  safe?: boolean;
  /** Authored world width for safe pages (default 1260). Height tracks canvas ratio. */
  nominalW?: number;
  /** Cover page: height tracks the FULL canvas (not band-shrunk) → canvas-aspect.
   *  Used for the Living-UI chapter so the slot fills the screen at fitObj. */
  cover?: boolean;
  /** Suppress the page-card chrome rect (fill + stroke) — the content floats
   *  directly on the canvas backdrop. */
  noChrome?: boolean;
}

export interface LayoutItem {
  width?: number | 'auto';
  height?: number | 'auto';
  flexGrow?: number;
  flexShrink?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  resizable?: boolean;
  /** Islands only: scale content to fill the layout slot (true = reactive fill,
   *  false/absent = fixed at def.defaultSize, centered in slot). */
  fill?: boolean;
  /** Emit a soft glow aura behind the object. `true` = default glow;
   *  object form: { layers?, spread?, alpha? }. */
  glow?: true | { layers?: number; spread?: number; alpha?: number };
}

// ── Animation ────────────────────────────────────────────────────────────

export interface ClipSpec {
  id: string;
  target: string;
  kind: 'fadeIn' | 'fadeOut' | 'draw' | 'write'
      | 'moveTo' | 'scaleTo' | 'rotateTo' | 'morph' | 'param' | 'moveAlongPath';
  start: number;
  duration: number;
  ease?: EasingName;
  props: Record<string, unknown>;
}

export type EasingName =
  | 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  | 'smoothstep' | 'smootherstep'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeOutBack' | 'easeOutElastic' | 'easeOutBounce'
  | 'rushInto' | 'rushFrom';

// ── Camera ───────────────────────────────────────────────────────────────

export interface CameraTrack { keyframes: CameraKeyframe[]; }

export interface CameraKeyframe {
  time: number;
  center?: Vec2;
  zoom?: number;
  fit?: string;
  offset?: Vec2;
  zoomMul?: number;
  polar?: number;
  azimuth?: number;
  ease?: EasingName;
  drift?: {
    xAmp?: number; yAmp?: number; xPeriod?: number; yPeriod?: number;
    azAmp?: number; azPeriod?: number;
  };
  /** Layout-resolved dive: resolve center/zoom from this object's laid-out box. */
  fitObj?: string;
  /** With fitObj: aim the camera at this FRACTION of the object's box instead of
   *  its center — robust to aspect changes (unlike a world-unit `offset`). */
  fitPoint?: Vec2;
  /** Trace metadata — expanded by runtime into sub-keyframes. */
  trace?: {
    target: string;
    zoom: number;
    d: number;
    samples?: number;
    pullBack?: boolean;
    char?: string;
  };
}

// ── Params ───────────────────────────────────────────────────────────────

export type ParamDef =
  | { kind: 'number';  label: string; default: number; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; label: string; default: boolean }
  | { kind: 'point';   label: string; default: Vec2 }
  | { kind: 'color';   label: string; default: Color };

export type ParamValue = number | boolean | Vec2 | Color;
export type ParamRef   = { $param: string };

// ── Common ───────────────────────────────────────────────────────────────

export type Vec2  = [number, number];
export type Color = [number, number, number, number];
