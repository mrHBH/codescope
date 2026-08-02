// ── windgraph scene resolver (sprint-v2 Phase 1.2) ───────────────────────────
// Resolves the wg-* ObjectSpecs of a SceneDoc into a live scene: a
// ConstraintGraph of GObjects (free + derived geometry in WORLD space) plus an
// ordered Mobject draw list synced from it. Drags and param writes drive
// graph.update() + sync; function plots resample when numeric params change.
// Implicit plots and fields stay view-dependent DIRECT draws (field-like
// content per decision D1) — everything object-like is a Mobject, so clips
// (1.3) and elevation/extrude (Phase 2) can target them.

import type { SceneDoc, WgNum, WgPoint } from '../ir/types';
import { ConstraintGraph } from '../../windgraph/interact/graph';
import {
  GPoint, Midpoint, Centroid, Reflection, Intersection, Glider,
  GLine, LineThrough, Perpendicular, Parallel,
  GCircle, Circumcircle, Distance, Angle,
  Circumcenter, Incenter, Orthocenter, Excenter, EulerLine, NinePointCircle,
  PerpBisector, AngleBisector, Median, Altitude, TangentToCircle, TangentsFromPoint,
  CircleByDiameter, Incircle, Excircle,
  RadicalAxis, PolarLine, PolePoint, CommonTangents, ApolloniusCircle,
  RotatedPoint, TranslatedPoint, DilatedPoint,
  CircleInversion, MobiusPoint,
  LocusCurve, RegularPolygon,
  HLockedPoint, VLockedPoint, GridSnappedPoint, AngleSnappedPoint,
  LengthMeasure, AngleMeasure, AreaMeasure, SlopeMeasure, RadiusMeasure,
  GConic, EllipseFromFoci, ParabolaFromFocusDirectrix, HyperbolaFromFoci, ConicThrough5Points,
} from '../../windgraph/interact/constraints';
import { Mobject, Group, type RenderCtx } from '../../windgraph/mobject/mobject';
import { Dot, Segment, Polyline, Polygon, Vector, Circle, Arc, Ellipse, Label } from '../../windgraph/mobject/primitives';
import type { NumberPlane, PlaneView, PlaneCtx } from '../../windgraph/coords/numberPlane';
import { plotImplicit } from '../../windgraph/plot/implicit';
import { plotVectorField, plotSlopeField } from '../../windgraph/plot/field';
import { EmitCache } from '../../windfoil/emitCache';
import { compileExpr } from '../../windgraph/expr';
import { DragController } from '../../windgraph/interact/drag';
import { strokeInto, fillQuads, circleQuads, type Pt } from '../../windgraph/stroke/stroke';
import { spline as splineInterp } from '../../windgraph/plot/spline';
import { sequenceSamples, cobweb } from '../../windgraph/plot/sequence';
import { sampleFn, tangentLine, normalLine, accumulation, quadratureColumns, type QuadMode } from '../../windgraph/plot/calculus';
import { rk4Ode, rk4System, streamlines, bifurcation } from '../../windgraph/plot/ode';
import { fourierCoeffs, fourierCurve, epicycles } from '../../windgraph/plot/fourier';
import { histogram, boxStats, kde, beeswarm, hexbin, regression, residuals } from '../../windgraph/plot/stats';
import { contourLevels, plotContourLines, plotFilledContours, contourLabelAnchors } from '../../windgraph/plot/contour';
import { plotInequality, type Cmp } from '../../windgraph/plot/inequality';
import { candlestick, waterfall, funnel, radar, windrose, ternaryToXY, ternaryFrame, parallelCoords, scatterMatrix } from '../../windgraph/plot/charts';
import { normal, binomial, poisson, exponential, uniform, geometric, chiSquared, tDist, fDist, type Distribution } from '../../windgraph/stats/distributions';
import { sample as statSample, histogram as statHistogram, sturgesBins } from '../../windgraph/stats/sampling';
import { cltSimulation } from '../../windgraph/stats/clt';
import { randomWalk1D, randomWalk2D, brownianMotion, multipleWalks2D } from '../../windgraph/stats/randomWalk';
import { monteCarloPi, buffonsNeedle } from '../../windgraph/stats/monteCarlo';
import { pearsonR, linearRegression as linReg, ANSCOMBE_QUARTET } from '../../windgraph/stats/correlation';
import { normalPdf, normalCdf } from '../../windgraph/stats/distributions';
import { mat2, applyMat2, det2, transformGrid, parallelogramVertices, type Mat2, type Vec2 as LVec2 } from '../../windgraph/linalg/matrix';
import { eigen2, invariantLines } from '../../windgraph/linalg/eigen';
import { dot2, project2, norm2 } from '../../windgraph/linalg/products';
import { svd2, gramSchmidt2 } from '../../windgraph/linalg/decomp';
import { completeGraph, cycleGraph, pathGraph, gridGraph, petersenGraph, starGraph, wheelGraph, binaryTree, randomGraph, circularLayout, type Graph } from '../../windgraph/graph/namedGraphs';
import { runLayout, layoutPositions } from '../../windgraph/graph/forceLayout';
import { bfs, dfs } from '../../windgraph/graph/traversal';
import { toWeighted, dijkstra, shortestPath } from '../../windgraph/graph/traversal';
import { kruskal, prim } from '../../windgraph/graph/mst';
import { eulerianCircuit, eulerianPath, edgeTraceFromPath } from '../../windgraph/graph/eulerian';

const COL_POINT = [0.97, 0.73, 0.33, 1];
const COL_DERIVED = [0.40, 0.82, 0.95, 1];
const COL_LINE = [0.72, 0.78, 0.92, 1];
const COL_CIRCLE = [0.58, 0.76, 0.95, 1];
const COL_PLOT = [0.30, 0.85, 0.75, 1];
const COL_LABEL = [0.85, 0.88, 0.96, 1];
const COL_ANGLE = [0.95, 0.80, 0.45, 1];
const DEFAULT_WIDTH = 3;

/** Point that mirrors another point (wg-point with `at` = object id). */
class AliasPoint extends GPoint {
  constructor(public src: GPoint) { super(0, 0, false); this.inputs = [src]; this.recompute(); }
  recompute() { this.x = this.src.x; this.y = this.src.y; }
}

/** Point driven by a scene parameter (wg-point with `at` = $param). */
class ParamPoint extends GPoint {
  constructor(private src: () => Pt) { super(0, 0, false); this.recompute(); }
  recompute() { const p = this.src(); this.x = p[0]; this.y = p[1]; }
}

/** Circle with center/radius from live sources (literal/param/point refs). */
class ParamCircle extends GCircle {
  constructor(private src: () => { cx: number; cy: number; r: number }) { super(); this.recompute(); }
  recompute() { const c = this.src(); this.cx = c.cx; this.cy = c.cy; this.r = c.r; }
}

export class WgScene {
  readonly graph = new ConstraintGraph();
  readonly points = new Map<string, GPoint>();
  readonly lines = new Map<string, GLine>();
  readonly circles = new Map<string, GCircle>();
  readonly mobjects = new Map<string, Mobject>();
  readonly order: string[] = [];
  readonly drag: DragController;

  private doc: SceneDoc;
  private params: Map<string, any>;
  private plane: NumberPlane;
  /** Per-mobject sync: writes the mobject's fields, returns a geometry sig.
   *  markDirty fires only on sig change — the slice cache below then rebuilds
   *  only the mobjects whose inputs actually moved (drag a vertex and the
   *  unrelated wave plot costs nothing). */
  private syncables: (() => string)[] = [];
  private emitList: Mobject[] = [];          // parallel to syncables, draw order
  private sliceCaches: EmitCache[] = [];     // parallel; per-mobject instance slices
  private scratchInst: number[] = [];
  private scratchCrv: number[] = [];
  private scratchRws: number[] = [];
  private seedRows = -1;                     // atlas+static row count the scratch is seeded with
  /** View-dependent draws (implicit contours, fields). Each carries the param
   *  names its expression actually reads — the cache signature includes only
   *  those, so an unrelated slider never re-runs marching squares. */
  private directDraws: { draw: (ctx: PlaneCtx, view: PlaneView) => void; deps: string[] }[] = [];
  private directCache = new EmitCache();
  private plotResamples: (() => void)[] = [];
  private lastParamSig = '';
  /** Zoom-LOD sample density for plots (set by the hosting board each emit). */
  private lodScale = 1;
  /** Plot sample count for the current LOD band. The LOD scales samples UP with
   *  zoom (√zoom, up to 3×) to keep the visible arc smooth at deep zoom — but the
   *  plot is sampled over its FULL domain, and at deep zoom only a small arc is
   *  on screen. 1.5× base is enough to keep the visible arc sub-pixel-smooth
   *  (the extra samples only feed OFF-screen pieces that the winding integral
   *  still pays for per-pixel — the deep-zoom plot-fill tank). Cap at 1.5× base. */
  private plotSamples(base: number): number {
    return Math.max(48, Math.min(Math.round(base * this.lodScale), Math.round(base * 1.5)));
  }

  constructor(doc: SceneDoc, params: Map<string, any>, plane: NumberPlane, onChange: () => void = () => {}) {
    this.doc = doc;
    this.params = params;
    this.plane = plane;
    this.drag = new DragController(() => { this.update(); onChange(); });
    this.build();
    this.update();
  }

  // ── source resolvers (live closures over params / resolved points) ────────

  private num(v: WgNum): () => number {
    if (typeof v === 'number') return () => v;
    const name = v.$param;
    return () => { const p = this.params.get(name); return typeof p === 'number' ? p : 0; };
  }

  /** World-space point source (data coords → world; ids resolve live). */
  private pt(v: WgPoint, who: string): () => Pt {
    if (typeof v === 'string') {
      return () => {
        const p = this.points.get(v);
        if (!p) throw new Error(`${who}: point "${v}" not resolved`);
        return p.pos;
      };
    }
    if (Array.isArray(v)) {
      const w: Pt = [this.plane.dToWx(v[0]), this.plane.dToWy(v[1])];
      return () => w;
    }
    const name = v.$param;
    return () => {
      const p = this.params.get(name);
      const d: Pt = Array.isArray(p) && p.length === 2 ? [p[0], p[1]] : [0, 0];
      return [this.plane.dToWx(d[0]), this.plane.dToWy(d[1])];
    };
  }

  /** Numeric eval scope for expressions: x/t/etc + all numeric scene params. */
  private scope(extra: Record<string, number>): Record<string, number> {
    const s: Record<string, number> = {};
    for (const [k, v] of this.params) if (typeof v === 'number') s[k] = v;
    for (const k of Object.keys(extra)) s[k] = extra[k];
    return s;
  }

  private paramSig(): string {
    let sig = '';
    for (const [k, v] of this.params) if (typeof v === 'number') sig += `${k}=${v.toFixed(4)};`;
    return sig;
  }

  // ── build ─────────────────────────────────────────────────────────────────

  private build() {
    const specs: Record<string, any>[] = [];
    for (const [id, spec] of Object.entries(this.doc.objects)) {
      if ((spec.kind as string).startsWith('wg-')) specs.push({ ...spec, id });
    }
    // Dependency-ordered worklist (validation guarantees acyclic + refs exist).
    // Non-wg objects count as "built" so a ref to one fails with a descriptive
    // kind-mismatch error in the builder instead of "unresolvable".
    const built = new Set<string>();
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (!(spec.kind as string).startsWith('wg-')) built.add(oid);
    }
    let pending = specs;
    let progress = true;
    while (pending.length && progress) {
      progress = false;
      const rest: Record<string, any>[] = [];
      for (const s of pending) {
        const deps = this.depsOf(s);
        if (deps.every((d) => built.has(d))) {
          this.buildOne(s);
          built.add(s.id);
          this.order.push(s.id);
          progress = true;
        } else rest.push(s);
      }
      pending = rest;
    }
    if (pending.length) {
      throw new Error(`object-resolver: unresolvable wg objects: ${pending.map((s) => s.id).join(', ')}`);
    }
  }

  private depsOf(s: Record<string, any>): string[] {
    const refs: string[] = [];
    const one = (v: unknown) => { if (typeof v === 'string' && v) refs.push(v); };
    const many = (v: unknown) => { if (Array.isArray(v)) for (const x of v) one(x); };
    switch (s.kind) {
      case 'wg-point': one(s.at); break;
      case 'wg-segment': case 'wg-vector': one(s.from); one(s.to); break;
      case 'wg-polyline': case 'wg-polygon': many(s.points); break;
      case 'wg-circle': case 'wg-arc': case 'wg-ellipse': one(s.center); break;
      case 'wg-midpoint': case 'wg-intersection': one(s.a); one(s.b); break;
      case 'wg-centroid': many(s.points); break;
      case 'wg-glider': one(s.curve); break;
      case 'wg-reflection': one(s.p); one(s.axis); break;
      case 'wg-line-through': one(s.a); one(s.b); break;
      case 'wg-perpendicular': case 'wg-parallel': one(s.line); one(s.point); break;
      case 'wg-circumcircle': one(s.a); one(s.b); one(s.c); break;
      case 'wg-angle': one(s.a); one(s.vertex); one(s.b); break;
      case 'wg-distance': one(s.a); one(s.b); break;
      case 'wg-plot-spline': many(s.points); break;
      case 'wg-plot-ode': many(s.through); break;
      case 'wg-circumcenter': case 'wg-incenter': case 'wg-orthocenter':
        one(s.a); one(s.b); one(s.c); break;
      case 'wg-excenter': one(s.a); one(s.b); one(s.c); break;
      case 'wg-euler-line': case 'wg-nine-point': one(s.a); one(s.b); one(s.c); break;
      case 'wg-perp-bisector': one(s.a); one(s.b); break;
      case 'wg-angle-bisector': one(s.a); one(s.vertex); one(s.b); break;
      case 'wg-median': case 'wg-altitude': one(s.vertex); one(s.a); one(s.b); break;
      case 'wg-tangent': case 'wg-tangents-from': one(s.circle); one(s.point); break;
      case 'wg-circle-diameter': one(s.a); one(s.b); break;
      case 'wg-incircle': one(s.a); one(s.b); one(s.c); break;
      case 'wg-excircle': one(s.a); one(s.b); one(s.c); break;
      case 'wg-radical-axis': case 'wg-common-tangents': one(s.c1); one(s.c2); break;
      case 'wg-polar-line': one(s.circle); one(s.point); break;
      case 'wg-pole-point': one(s.circle); one(s.line); break;
      case 'wg-apollonius': one(s.c1); one(s.c2); one(s.c3); break;
      case 'wg-rotated-pt': one(s.p); one(s.center); break;
      case 'wg-translated-pt': one(s.p); break;
      case 'wg-dilated-pt': one(s.p); one(s.center); break;
      case 'wg-inversion': one(s.p); one(s.circle); break;
      case 'wg-mobius': one(s.p); break;
      case 'wg-locus': one(s.driver); one(s.dependent); break;
      case 'wg-regular-polygon': one(s.center); break;
      case 'wg-h-lock': case 'wg-v-lock': case 'wg-grid-snap': one(s.p); break;
      case 'wg-angle-snap': one(s.p); one(s.center); break;
      case 'wg-length': one(s.a); one(s.b); break;
      case 'wg-slope': one(s.line); break;
      case 'wg-radius': one(s.circle); break;
      case 'wg-area': many(s.points); break;
    }
    return refs;
  }

  private pointOf(id: string, who: string): GPoint {
    const p = this.points.get(id);
    if (!p) throw new Error(`${who}: "${id}" is not a point-valued object`);
    return p;
  }
  private lineOf(id: string, who: string): GLine {
    const l = this.lines.get(id);
    if (!l) throw new Error(`${who}: "${id}" is not a line-valued object`);
    return l;
  }
  private circleOf(id: string, who: string): GCircle {
    const c = this.circles.get(id);
    if (!c) throw new Error(`${who}: "${id}" is not a circle-valued object`);
    return c;
  }

  private strokeProps(s: Record<string, any>, fallback: number[]): { color: number[]; width: number; cap: 'butt'; join: 'miter' } {
    // Butt caps + miter joins: round caps cost a 24-quad disc PER END (48
    // instances per segment); round joins another 24 per vertex. At typical
    // stroke widths these are imperceptible, and infinite lines have
    // off-screen ends. This cuts per-segment scratch instances from ~49 to ~3.
    return { color: s.stroke?.color ?? fallback, width: s.stroke?.width ?? DEFAULT_WIDTH, cap: 'butt', join: 'miter' };
  }

  private register(id: string, m: Mobject, s: Record<string, any>) {
    m.visible = s.visible ?? true;
    m.opacity = s.opacity ?? 1;
    this.mobjects.set(id, m);
  }

  /** Track a mobject: `sync` writes its fields and returns the geometry sig;
   *  markDirty fires only when the sig changes, so the per-mobject slice cache
   *  rebuilds only what moved. */
  private track(m: Mobject, sync: () => string) {
    let last = '\x00';
    this.syncables.push(() => {
      const sig = sync();
      if (sig !== last) { m.markDirty(); last = sig; }
      return sig;
    });
    this.emitList.push(m);
  }

  private addDot(id: string, p: GPoint, s: Record<string, any>, derived: boolean) {
    const dot = new Dot(p.x, p.y, s.radius ?? (derived ? 5 : 7), s.color ?? (derived ? COL_DERIVED : COL_POINT));
    this.register(id, dot, s);
    this.track(dot, () => { dot.position = p.pos; return `${p.x},${p.y}`; });
    if (s.label) {
      const size = this.plane.unitX * 0.26;
      const r = dot.radius;
      const lab = new Label(s.label, 0, 0, size, COL_LABEL);
      const labId = id + ':label';
      this.mobjects.set(labId, lab);
      this.order.push(labId);
      this.track(lab, () => { lab.position = [p.x + r + size * 0.35, p.y - r - size * 0.55]; return `${p.x},${p.y}`; });
    }
  }

  private buildOne(s: Record<string, any>) {
    const id = s.id as string;
    const who = `${s.kind} "${id}"`;
    const plane = this.plane;
    switch (s.kind) {
      case 'wg-point': {
        let p: GPoint;
        if (typeof s.at === 'string') {
          p = new AliasPoint(this.pointOf(s.at, who));
        } else if (s.at && typeof s.at === 'object' && !Array.isArray(s.at) && '$param' in s.at) {
          const src = this.pt(s.at as WgPoint, who);
          p = new ParamPoint(src);
        } else {
          const at = s.at as [number, number];
          p = new GPoint(plane.dToWx(at[0]), plane.dToWy(at[1]), s.free === true);
        }
        this.graph.add(p);
        this.points.set(id, p);
        this.addDot(id, p, s, false);
        if (s.free === true) this.drag.register(p);
        break;
      }
      case 'wg-midpoint': {
        const p = new Midpoint(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-centroid': {
        const pts = (s.points as string[]).map((pid) => this.pointOf(pid, who));
        const p = new Centroid(pts);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-intersection': {
        const p = new Intersection(this.lineOf(s.a, who), this.lineOf(s.b, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-glider': {
        const host = this.circles.get(s.curve) ?? this.lines.get(s.curve);
        if (!host) throw new Error(`${who}: "${s.curve}" is not a line or circle`);
        const t0 = typeof s.t === 'number' ? s.t : (this.params.get(s.t?.$param) ?? 0);
        const p = new Glider(host as any, t0);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        this.drag.register(p);
        break;
      }
      case 'wg-reflection': {
        const p = new Reflection(this.pointOf(s.p, who), this.lineOf(s.axis, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-line-through': {
        const l = new LineThrough(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-perpendicular': {
        const l = new Perpendicular(this.pointOf(s.point, who), this.lineOf(s.line, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-parallel': {
        const l = new Parallel(this.pointOf(s.point, who), this.lineOf(s.line, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-circumcircle': {
        const c = new Circumcircle(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-circle': {
        const cSrc = this.pt(s.center as WgPoint, who);
        const rSrc = this.num(s.radius as WgNum);
        const c = new ParamCircle(() => { const p = cSrc(); return { cx: p[0], cy: p[1], r: rSrc() * plane.unitX }; });
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-arc': {
        const cSrc = this.pt(s.center as WgPoint, who);
        const rSrc = this.num(s.radius as WgNum);
        const a0Src = this.num(s.a0 as WgNum), a1Src = this.num(s.a1 as WgNum);
        const props = this.strokeProps(s, COL_CIRCLE);
        const p0 = cSrc();
        const m = new Arc(p0[0], p0[1], rSrc() * plane.unitX, a0Src(), a1Src(), props);
        this.register(id, m, s);
        this.track(m, () => {
          const p = cSrc();
          const r = rSrc() * plane.unitX, a0 = a0Src(), a1 = a1Src();
          m.position = p; m.radius = r; m.a0 = a0; m.a1 = a1;
          return `${p[0]},${p[1]},${r},${a0},${a1}`;
        });
        break;
      }
      case 'wg-ellipse': {
        const cSrc = this.pt(s.center as WgPoint, who);
        const rxSrc = this.num(s.rx as WgNum), rySrc = this.num(s.ry as WgNum);
        const rotSrc = s.rot !== undefined ? this.num(s.rot as WgNum) : () => 0;
        const props = this.strokeProps(s, COL_CIRCLE);
        const p0 = cSrc();
        const m = new Ellipse(p0[0], p0[1], rxSrc() * plane.unitX, rySrc() * plane.unitY, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => {
          const p = cSrc();
          const rx = rxSrc() * plane.unitX, ry = rySrc() * plane.unitY, rot = rotSrc();
          m.position = p; m.scaleX = rx; m.scaleY = ry; m.rotation = rot;
          return `${p[0]},${p[1]},${rx},${ry},${rot}`;
        });
        break;
      }
      case 'wg-segment': {
        const aSrc = this.pt(s.from as WgPoint, who), bSrc = this.pt(s.to as WgPoint, who);
        const props = this.strokeProps(s, COL_LINE);
        const m = new Segment(aSrc(), bSrc(), props);
        this.register(id, m, s);
        this.track(m, () => { const a = aSrc(), b = bSrc(); m.a = a; m.b = b; return `${a[0]},${a[1]}|${b[0]},${b[1]}`; });
        break;
      }
      case 'wg-vector': {
        const aSrc = this.pt(s.from as WgPoint, who), bSrc = this.pt(s.to as WgPoint, who);
        const m = new Vector(aSrc(), bSrc(), { color: s.color ?? COL_LINE, width: s.width ?? DEFAULT_WIDTH });
        this.register(id, m, s);
        this.track(m, () => { const a = aSrc(), b = bSrc(); m.a = a; m.b = b; return `${a[0]},${a[1]}|${b[0]},${b[1]}`; });
        break;
      }
      case 'wg-polyline': {
        const srcs = (s.points as WgPoint[]).map((p) => this.pt(p, who));
        const props = this.strokeProps(s, COL_LINE);
        const m = new Polyline(srcs.map((g) => g()), props);
        this.register(id, m, s);
        this.track(m, () => { const pts = srcs.map((g) => g()); m.points = pts; return pts.join(';'); });
        break;
      }
      case 'wg-polygon': {
        const srcs = (s.points as WgPoint[]).map((p) => this.pt(p, who));
        const props = this.strokeProps(s, COL_LINE);
        const m = new Polygon(srcs.map((g) => g()), props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { const pts = srcs.map((g) => g()); m.points = pts; return pts.join(';'); });
        break;
      }
      case 'wg-angle': {
        const ang = new Angle(this.pointOf(s.a, who), this.pointOf(s.vertex, who), this.pointOf(s.b, who));
        this.graph.add(ang);
        const v = this.pointOf(s.vertex, who);
        const color = s.color ?? COL_ANGLE;
        const arc = new Arc(v.x, v.y, plane.unitX * 0.3, ang.a0, ang.a1, { color, width: 2 });
        const lab = new Label('', 0, 0, plane.unitX * 0.22, color, 'middle');
        this.register(id, arc, s);
        const labId = id + ':label';
        this.mobjects.set(labId, lab); this.order.push(labId);
        this.track(arc, () => {
          arc.position = v.pos; arc.a0 = ang.a0; arc.a1 = ang.a1;
          return `${v.x},${v.y},${ang.a0},${ang.a1}`;
        });
        this.track(lab, () => {
          const mid = (ang.a0 + ang.a1) / 2, rr = plane.unitX * 0.45;
          lab.position = [v.x + Math.cos(mid) * rr, v.y + Math.sin(mid) * rr];
          const text = (ang.value * 180 / Math.PI).toFixed(1) + '°';
          lab.text = text;
          return `${v.x},${v.y},${text}`;
        });
        break;
      }
      case 'wg-distance': {
        const dist = new Distance(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(dist);
        const a = this.pointOf(s.a, who), b = this.pointOf(s.b, who);
        const color = s.color ?? COL_LABEL;
        const lab = new Label('', 0, 0, plane.unitX * 0.22, color, 'middle');
        this.register(id, lab, s);
        this.track(lab, () => {
          lab.position = [(a.x + b.x) / 2, (a.y + b.y) / 2 - plane.unitX * 0.18];
          const text = (dist.value / plane.unitX).toFixed(2);
          lab.text = text;
          return `${a.x},${a.y},${b.x},${b.y},${text}`;
        });
        break;
      }
      case 'wg-plot-fn': {
        const fn = compileExpr(s.expr);
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const base = s.samples ?? 160;
        // Miter joins: round joins cost a 24-quad disc PER SAMPLE (the instance
        // dominator); on dense smooth samples miter is visually identical.
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          group.children.length = 0;
          for (const seg of this.sampleCurve(d0(), d1(), n, (x) => ({ y: fn(this.scope({ x })) }))) {
            group.add(new Polyline(seg, props));
          }
        };
        this.plotResamples.push(resample);
        resample();
        // Slice rebuilds only when params/LOD actually changed (resample ran).
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-parametric': {
        const fx = compileExpr(s.xExpr), fy = compileExpr(s.yExpr);
        const t0 = this.num(s.tRange[0] as WgNum), t1 = this.num(s.tRange[1] as WgNum);
        const base = s.samples ?? 200;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          group.children.length = 0;
          for (const seg of this.sampleCurve(t0(), t1(), n, (t) => ({ x: fx(this.scope({ t })), y: fy(this.scope({ t })) }))) {
            group.add(new Polyline(seg, props));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-polar': {
        const fr = compileExpr(s.rExpr);
        const t0 = this.num(s.tRange[0] as WgNum), t1 = this.num(s.tRange[1] as WgNum);
        const base = s.samples ?? 200;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          group.children.length = 0;
          for (const seg of this.sampleCurve(t0(), t1(), n, (t) => {
            const r = fr(this.scope({ t }));
            return { x: r * Math.cos(t), y: r * Math.sin(t) };
          })) {
            group.add(new Polyline(seg, props));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-implicit': {
        const fn = compileExpr(s.expr);
        const color = s.stroke?.color ?? COL_PLOT;
        const widthPx = s.stroke?.width ?? 2;
        const deps = this.exprDeps(s.expr);
        this.directDraws.push({
          deps,
          draw: (ctx, view) => plotImplicit((x, y) => fn(this.scope({ x, y })), plane, view, ctx, { color, widthPx }),
        });
        break;
      }
      case 'wg-field': {
        const color = s.color ?? COL_LINE;
        // density = arrows per data unit (FieldStyle.gridRes; default 1)
        const gridRes = typeof s.density === 'number' ? s.density : undefined;
        if (s.field === 'vector') {
          const fx = compileExpr(s.xExpr), fy = compileExpr(s.yExpr);
          const deps = this.exprDeps(s.xExpr + ' ' + s.yExpr);
          this.directDraws.push({
            deps,
            draw: (ctx, view) => plotVectorField((x, y) => [fx(this.scope({ x, y })), fy(this.scope({ x, y }))], plane, view, ctx, { color, gridRes }),
          });
        } else {
          const fy = compileExpr(s.yExpr);
          const deps = this.exprDeps(s.yExpr);
          this.directDraws.push({
            deps,
            draw: (ctx, view) => plotSlopeField((x, y) => fy(this.scope({ x, y })), plane, view, ctx, { color, gridRes }),
          });
        }
        break;
      }
      case 'wg-plot-piecewise': {
        const pieces = (s.pieces as { cond: string; expr: string }[]).map((p) => ({ cond: compileExpr(p.cond), expr: compileExpr(p.expr) }));
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const base = s.samples ?? 160;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          group.children.length = 0;
          for (const seg of this.sampleCurve(d0(), d1(), n, (x) => {
            const sc = this.scope({ x });
            for (const p of pieces) if (p.cond(sc) !== 0) return { y: p.expr(sc) };
            return { y: NaN };
          })) group.add(new Polyline(seg, props));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-inequality': {
        const fns = (s.exprs as string[]).map((e) => compileExpr(e));
        const cmps = (s.cmps as Cmp[] | undefined) ?? (s.exprs as string[]).map(() => '>' as Cmp);
        const fill = s.fill ?? [0.30, 0.85, 0.75, 0.16];
        const gridRes = typeof s.gridRes === 'number' ? s.gridRes : 0.5;
        const deps = this.exprDeps((s.exprs as string[]).join(' '));
        this.directDraws.push({
          deps,
          draw: (ctx, view) => plotInequality(fns.map((fn) => (x: number, y: number) => fn(this.scope({ x, y }))), cmps, plane, view, ctx, fill, gridRes),
        });
        break;
      }
      case 'wg-plot-sequence': {
        const fn = compileExpr(s.expr);
        const n0 = this.num((s.nRange?.[0] ?? 0) as WgNum);
        const n1 = this.num((s.nRange?.[1] ?? 10) as WgNum);
        const color = s.color ?? COL_POINT;
        const radius = s.radius ?? 5;
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          if (s.cobweb) {
            const x0v = typeof s.x0 === 'number' ? s.x0 : (this.params.get((s.x0 as any)?.$param) ?? 0.5);
            const iters = s.iters ?? 30;
            const path = cobweb((x) => fn(this.scope({ x, n: x })), x0v, iters, n0(), n1());
            const props = this.strokeProps(s, COL_LINE);
            group.add(new Polyline(this.toWorld(path), props));
          } else {
            for (const [nx, ny] of sequenceSamples((n) => fn(this.scope({ n, x: n })), n0(), n1())) {
              group.add(new Dot(plane.dToWx(nx), plane.dToWy(ny), radius, color));
            }
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-spline': {
        const srcs = (s.points as WgPoint[]).map((p) => this.pt(p, who));
        const kind = s.spline ?? 'catmull';
        const perSeg = Math.max(4, Math.round((s.samples ?? 24)));
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        let lastSig = '';
        const rebuild = () => {
          const ctrl = srcs.map((g) => g());
          const curve = splineInterp(kind, ctrl, perSeg);
          group.children.length = 0;
          if (curve.length >= 2) group.add(new Polyline(curve, props));
          for (const c of ctrl) group.add(new Dot(c[0], c[1], 5, COL_POINT));
        };
        rebuild();
        this.track(group, () => {
          const sig = srcs.map((g) => g().join(',')).join(';') + '|' + kind;
          if (sig !== lastSig) { rebuild(); lastSig = sig; }
          return sig;
        });
        break;
      }
      case 'wg-plot-tangent': {
        const fn = compileExpr(s.expr);
        const at = this.num(s.at as WgNum);
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const base = s.samples ?? 200;
        const color = s.color ?? COL_POINT;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          const f = (x: number) => fn(this.scope({ x }));
          const xv = at();
          const half = (d1() - d0()) * 0.5;
          group.children.length = 0;
          for (const seg of this.sampleCurve(d0(), d1(), n, (x) => ({ y: f(x) }))) group.add(new Polyline(seg, props));
          group.add(new Polyline(this.toWorld(tangentLine(f, xv, half)), { color, width: props.width, cap: 'butt', join: 'miter' }));
          if (s.showNormal) group.add(new Polyline(this.toWorld(normalLine(f, xv, half)), { color: COL_DERIVED, width: props.width, cap: 'butt', join: 'miter' }));
          group.add(new Dot(plane.dToWx(xv), plane.dToWy(f(xv)), 6, color));
          if (s.showDerivatives) {
            const h = (d1() - d0()) / n;
            for (const seg of this.sampleCurve(d0(), d1(), n, (x) => ({ y: (f(x + h) - f(x - h)) / (2 * h) }))) group.add(new Polyline(seg, { color: COL_DERIVED, width: props.width * 0.7, cap: 'butt', join: 'miter' }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-accumulation': {
        const fn = compileExpr(s.expr);
        const from = this.num(s.from as WgNum);
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const base = s.samples ?? 200;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          const f = (x: number) => fn(this.scope({ x }));
          group.children.length = 0;
          const pts = accumulation(f, from(), d0(), d1(), n);
          const seg = this.toWorld(pts);
          if (seg.length >= 2) group.add(new Polyline(seg, props));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-plot-riemann': {
        const fn = compileExpr(s.expr);
        const d0 = this.num(s.domain[0] as WgNum);
        const d1 = this.num(s.domain[1] as WgNum);
        const nSrc = this.num(s.n as WgNum);
        const mode = (s.mode ?? 'midpoint') as QuadMode;
        const fill = s.fill ?? [0.30, 0.85, 0.75, 0.22];
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = Math.max(1, Math.round(nSrc()));
          const f = (x: number) => fn(this.scope({ x }));
          group.children.length = 0;
          for (const col of quadratureColumns(f, d0(), d1(), n, mode)) {
            const x0 = plane.dToWx(col.x), x1 = plane.dToWx(col.x + col.w);
            const wy = plane.dToWy(col.y), wy0 = plane.dToWy(0);
            group.add(new Polygon([[x0, wy0], [x1, wy0], [x1, wy], [x0, wy]], props, { color: fill }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-streamlines': {
        const fx = compileExpr(s.xExpr), fy = compileExpr(s.yExpr);
        const color = s.color ?? COL_LINE;
        const steps = s.steps ?? 120;
        const density = typeof s.density === 'number' ? s.density : 1;
        const deps = this.exprDeps(s.xExpr + ' ' + s.yExpr);
        this.directDraws.push({
          deps,
          draw: (ctx, view) => {
            const seeds: Pt[] = [];
            const cell = 1 / density;
            for (let x = Math.ceil(plane.xMin / cell) * cell; x <= plane.xMax; x += cell)
              for (let y = Math.ceil(plane.yMin / cell) * cell; y <= plane.yMax; y += cell) seeds.push([x, y]);
            const V = (x: number, y: number): Pt => [fx(this.scope({ x, y })), fy(this.scope({ x, y }))];
            const h = cell * 0.25;
            const w = Math.max(2 / Math.max(view.zoom, 1e-6), 0.4);
            for (const line of streamlines(V, seeds, steps, h)) {
              if (line.length < 2) continue;
              strokeInto(this.toWorld(line), { width: w, cap: 'butt', join: 'miter' }, color, ctx.inst, ctx.crv, ctx.rws);
            }
          },
        });
        break;
      }
      case 'wg-plot-ode': {
        const fy = compileExpr(s.yExpr);
        const fx = s.xExpr ? compileExpr(s.xExpr) : null;
        const srcs = (s.through as WgPoint[]).map((p) => this.pt(p, who));
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const h = typeof s.h === 'number' ? s.h : 0.02;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        let lastSig = '';
        const rebuild = () => {
          group.children.length = 0;
          for (const src of srcs) {
            const w = src();
            const dx0 = (w[0] - plane.worldX0) / plane.unitX;
            const dy0 = (plane.worldY0 - w[1]) / plane.unitY;
            let line: Pt[];
            if (fx) {
              const F = (p: Pt): Pt => [fx(this.scope({ x: p[0], y: p[1] })), fy(this.scope({ x: p[0], y: p[1] }))];
              line = rk4System(F, [dx0, dy0], 0, (d1() - d0()), h);
            } else {
              line = rk4Ode((x, y) => fy(this.scope({ x, y })), dx0, dy0, d1(), h);
            }
            const seg = this.toWorld(line);
            if (seg.length >= 2) group.add(new Polyline(seg, props));
            group.add(new Dot(w[0], w[1], 6, COL_POINT));
          }
        };
        rebuild();
        this.track(group, () => {
          const sig = srcs.map((g) => g().join(',')).join(';') + '|' + this.lastParamSig;
          if (sig !== lastSig) { rebuild(); lastSig = sig; }
          return sig;
        });
        break;
      }
      case 'wg-plot-bifurcation': {
        const fn = compileExpr(s.expr);
        const r0 = this.num(s.rRange[0] as WgNum);
        const r1 = this.num(s.rRange[1] as WgNum);
        const iters = s.iters ?? 80;
        const transient = s.transient ?? 200;
        const rSteps = s.rSteps ?? 400;
        const color = s.color ?? COL_PLOT;
        const deps = this.exprDeps(s.expr);
        this.directDraws.push({
          deps,
          draw: (ctx, view) => {
            const pts = bifurcation((r, x) => fn(this.scope({ r, x })), r0(), r1(), rSteps, iters, transient);
            const rad = 1.2 / Math.max(view.zoom, 1e-6);
            for (const [rx, xx] of pts) {
              fillQuads(circleQuads(plane.dToWx(rx), plane.dToWy(xx), rad, 6), color, ctx.inst, ctx.crv, ctx.rws);
            }
          },
        });
        break;
      }
      case 'wg-plot-fourier': {
        const fn = compileExpr(s.expr);
        const terms = this.num(s.terms as WgNum);
        const period = this.num((s.period ?? Math.PI * 2) as WgNum);
        const d0 = this.num((s.domain?.[0] ?? 0) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? Math.PI * 2) as WgNum);
        const base = s.samples ?? 160;
        const color = s.color ?? COL_PLOT;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = this.plotSamples(base);
          const f = (x: number) => fn(this.scope({ x }));
          const coeffs = fourierCoeffs(f, Math.max(0, Math.round(terms())), period(), 400);
          group.children.length = 0;
          const curve = fourierCurve(coeffs, d0(), d1(), n, period());
          const seg = this.toWorld(curve);
          if (seg.length >= 2) group.add(new Polyline(seg, props));
          if (s.epicycles) {
            const cyc = epicycles(coeffs, d0(), period());
            for (const e of cyc) {
              const cx = plane.dToWx(e.cx), cy = plane.dToWy(e.cy), r = e.r * plane.unitX;
              group.add(new Arc(cx, cy, r, 0, Math.PI * 2, { color: COL_LINE, width: 1 }));
            }
          }
          void color;
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-histogram': {
        const data = s.data as number[];
        const bins = histogram(data, s.method ?? 'fd', s.bins);
        const fill = s.fill ?? [0.36, 0.62, 0.98, 0.5];
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        for (const b of bins) {
          const x0 = plane.dToWx(b.x0), x1 = plane.dToWx(b.x1);
          const wy = plane.dToWy(b.count), wy0 = plane.dToWy(0);
          group.add(new Polygon([[x0, wy0], [x1, wy0], [x1, wy], [x0, wy]], props, { color: fill }));
        }
        this.track(group, () => 'hist');
        break;
      }
      case 'wg-boxplot': {
        const data = s.data as number[];
        const variant = s.variant ?? 'box';
        const at = typeof s.at === 'number' ? s.at : (this.params.get((s.at as any)?.$param) ?? 0);
        const color = s.color ?? COL_PLOT;
        const fill = s.fill ?? [0.36, 0.62, 0.98, 0.35];
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const ax = plane.dToWx(at);
        if (variant === 'strip' || variant === 'beeswarm') {
          const offs = variant === 'beeswarm' ? beeswarm(data, 0.08) : data.map(() => 0);
          data.forEach((v, i) => group.add(new Dot(ax + offs[i] * plane.unitX, plane.dToWy(v), 4, color)));
        } else if (variant === 'violin') {
          const st = boxStats(data);
          const ys: number[] = [];
          for (let i = 0; i <= 40; i++) ys.push(st.min + (st.max - st.min) * (i / 40));
          const dens = kde(data, ys);
          const maxD = Math.max(...dens, 1e-9);
          const left: Pt[] = ys.map((y, i) => [plane.dToWx(at - dens[i] / maxD * 0.5), plane.dToWy(y)] as Pt);
          const right: Pt[] = ys.map((y, i) => [plane.dToWx(at + dens[i] / maxD * 0.5), plane.dToWy(y)] as Pt).reverse();
          group.add(new Polygon([...left, ...right], props, { color: fill }));
        } else {
          const st = boxStats(data);
          const w = 0.5;
          const x0 = plane.dToWx(at - w / 2), x1 = plane.dToWx(at + w / 2);
          group.add(new Polygon([[x0, plane.dToWy(st.q1)], [x1, plane.dToWy(st.q1)], [x1, plane.dToWy(st.q3)], [x0, plane.dToWy(st.q3)]], props, { color: fill }));
          group.add(new Segment([ax, plane.dToWy(st.min)], [ax, plane.dToWy(st.q1)], { color, width: props.width }));
          group.add(new Segment([ax, plane.dToWy(st.q3)], [ax, plane.dToWy(st.max)], { color, width: props.width }));
          group.add(new Segment([plane.dToWx(at - w / 2), plane.dToWy(st.median)], [plane.dToWx(at + w / 2), plane.dToWy(st.median)], { color, width: props.width }));
          for (const o of st.outliers) group.add(new Dot(ax, plane.dToWy(o), 3, color));
        }
        this.track(group, () => 'box');
        break;
      }
      case 'wg-plot-cells': {
        const color = s.fill ?? COL_PLOT;
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        if (s.cell === 'bubble') {
          const pts = (s.points ?? []) as [number, number][];
          const sizes = (s.sizes ?? pts.map(() => 1)) as number[];
          const maxS = Math.max(...sizes, 1e-9);
          pts.forEach((p, i) => group.add(new Circle(plane.dToWx(p[0]), plane.dToWy(p[1]), Math.sqrt(sizes[i] / maxS) * plane.unitX * 0.4, props, { color })));
        } else if (s.cell === 'heatmap') {
          const m = (s.matrix ?? []) as number[][];
          let lo = Infinity, hi = -Infinity;
          for (const row of m) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
          const span = hi - lo || 1;
          m.forEach((row, r) => row.forEach((v, c) => {
            const t = (v - lo) / span;
            const col: number[] = [0.2 + 0.7 * t, 0.4 + 0.3 * (1 - t), 0.9 - 0.6 * t, 0.85];
            const x0 = plane.dToWx(c), x1 = plane.dToWx(c + 1), y0 = plane.dToWy(r), y1 = plane.dToWy(r + 1);
            group.add(new Polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { color: col, width: 0.5 }, { color: col }));
          }));
        } else {
          const pts = (s.points ?? []) as Pt[];
          const size = typeof s.size === 'number' ? s.size : 0.5;
          for (const cell of hexbin(pts, size)) {
            const poly: Pt[] = [];
            for (let k = 0; k < 6; k++) {
              const a = Math.PI / 180 * (60 * k - 30);
              poly.push([plane.dToWx(cell.cx + size * Math.cos(a)), plane.dToWy(cell.cy + size * Math.sin(a))]);
            }
            const t = Math.min(1, cell.count / 5);
            group.add(new Polygon(poly, props, { color: [color[0], color[1], color[2], 0.2 + 0.6 * t] }));
          }
        }
        this.track(group, () => 'cells');
        break;
      }
      case 'wg-contours': {
        const fn = compileExpr(s.expr);
        const F = (x: number, y: number) => fn(this.scope({ x, y }));
        const levels = s.levels ?? contourLevels(F, plane, s.count ?? 6);
        const stroke = s.stroke?.color ?? COL_PLOT;
        const widthPx = s.stroke?.width ?? 2;
        const gridRes = typeof s.gridRes === 'number' ? s.gridRes : 0.5;
        const palette = s.palette ?? [[0.20, 0.35, 0.55, 0.5], [0.25, 0.55, 0.55, 0.5], [0.45, 0.70, 0.45, 0.5], [0.75, 0.75, 0.40, 0.5], [0.85, 0.55, 0.35, 0.5], [0.80, 0.35, 0.35, 0.5], [0.60, 0.30, 0.55, 0.5]];
        const deps = this.exprDeps(s.expr);
        this.directDraws.push({
          deps,
          draw: (ctx, view) => {
            if (s.filled) plotFilledContours(F, levels, palette, plane, view, ctx, gridRes);
            plotContourLines(F, levels, plane, view, ctx, { color: stroke, widthPx, gridRes });
          },
        });
        if (s.labels) {
          const anchors = contourLabelAnchors(F, levels, plane);
          const group = new Group();
          this.register(id + ':labels', group, s);
          this.order.push(id + ':labels');
          for (const a of anchors) {
            group.add(new Label(a.level.toFixed(1), plane.dToWx(a.pos[0]), plane.dToWy(a.pos[1]), plane.unitX * 0.2, COL_LABEL, 'middle'));
          }
          this.track(group, () => 'clabels');
        }
        break;
      }
      case 'wg-regression': {
        const pts = s.points as [number, number][];
        const res = regression(pts, s.fit, s.degree ?? 2);
        const color = s.color ?? COL_PLOT;
        const props = { ...this.strokeProps(s, color), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const xs = pts.map((p) => p[0]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        const curve = sampleFn(res.fn, x0, x1, 120);
        const seg = this.toWorld(curve);
        if (seg.length >= 2) group.add(new Polyline(seg, props));
        for (const [px, py] of pts) group.add(new Dot(plane.dToWx(px), plane.dToWy(py), 4, COL_POINT));
        if (s.showResiduals) for (const [rx, ry] of residuals(pts, res.fn)) group.add(new Segment([plane.dToWx(rx), plane.dToWy(ry + res.fn(rx))], [plane.dToWx(rx), plane.dToWy(ry)], { color: COL_DERIVED, width: 1 }));
        const r2 = res.r2;
        group.add(new Label(`R²=${r2.toFixed(3)}`, plane.dToWx(x1), plane.dToWy(res.fn(x1)), plane.unitX * 0.22, COL_LABEL));
        this.track(group, () => 'reg');
        break;
      }
      case 'wg-chart-fin': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        if (s.chart === 'candle') {
          for (const c of candlestick(s.ohlc ?? [], 0.6)) {
            const col = c.up ? [0.35, 0.80, 0.55, 1] : [0.90, 0.45, 0.45, 1];
            group.add(new Segment([plane.dToWx(c.wick[0][0]), plane.dToWy(c.wick[0][1])], [plane.dToWx(c.wick[1][0]), plane.dToWy(c.wick[1][1])], { color: col, width: 1 }));
            group.add(new Polygon(this.toWorld(c.body), { color: col, width: 1 }, { color: col }));
          }
        } else if (s.chart === 'waterfall') {
          const steps = ((s.values ?? []) as number[]).map((v, i) => ({ label: (s.labels as string[] | undefined)?.[i] ?? `${i}`, value: v }));
          for (const w of waterfall(steps)) {
            const col = w.kind === 'up' ? [0.35, 0.80, 0.55, 0.7] : w.kind === 'down' ? [0.90, 0.45, 0.45, 0.7] : [0.5, 0.6, 0.8, 0.7];
            group.add(new Polygon(this.toWorld(w.bar), props, { color: col }));
          }
        } else if (s.chart === 'funnel') {
          for (const poly of funnel(s.values ?? [])) group.add(new Polygon(this.toWorld(poly), props, { color: s.fill ?? [0.36, 0.62, 0.98, 0.5] }));
        } else if (s.chart === 'radar') {
          const r = radar(s.values ?? []);
          for (const ax of r.axes) group.add(new Segment([plane.dToWx(ax[0][0]), plane.dToWy(ax[0][1])], [plane.dToWx(ax[1][0]), plane.dToWy(ax[1][1])], { color: COL_LINE, width: 1 }));
          group.add(new Polygon(this.toWorld(r.poly), props, { color: s.fill ?? [0.36, 0.62, 0.98, 0.4] }));
        } else {
          for (const wedge of windrose(s.values ?? [])) group.add(new Polygon(this.toWorld(wedge), props, { color: s.fill ?? [0.36, 0.62, 0.98, 0.5] }));
        }
        this.track(group, () => 'fin');
        break;
      }
      case 'wg-chart-multi': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        if (s.chart === 'ternary') {
          const frame = ternaryFrame();
          group.add(new Polygon(this.toWorld(frame.frame), props));
          for (const g of frame.grid) group.add(new Segment([plane.dToWx(g[0][0]), plane.dToWy(g[0][1])], [plane.dToWx(g[1][0]), plane.dToWy(g[1][1])], { color: COL_LINE, width: 0.5 }));
          for (const t of s.triples ?? []) {
            const p = ternaryToXY(t[0], t[1], t[2]);
            group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), 4, color));
          }
        } else if (s.chart === 'parallel') {
          const pc = parallelCoords(s.columns ?? []);
          for (const ax of pc.axes) group.add(new Segment([plane.dToWx(ax[0][0]), plane.dToWy(ax[0][1])], [plane.dToWx(ax[1][0]), plane.dToWy(ax[1][1])], { color: COL_LINE, width: 1 }));
          for (const line of pc.lines) { const seg = this.toWorld(line); if (seg.length >= 2) group.add(new Polyline(seg, { color: [color[0], color[1], color[2], 0.5], width: 1, cap: 'butt', join: 'miter' })); }
        } else {
          const sm = scatterMatrix(s.columns ?? []);
          for (const f of sm.facets) {
            const c0 = plane.dToWx(f.origin[0]), r0 = plane.dToWy(f.origin[1]);
            const c1 = plane.dToWx(f.origin[0] + sm.cell), r1 = plane.dToWy(f.origin[1] + sm.cell);
            group.add(new Polygon([[c0, r0], [c1, r0], [c1, r1], [c0, r1]], { color: COL_LINE, width: 0.5 }));
            for (const p of f.points) group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), 2.5, color));
          }
        }
        this.track(group, () => 'multi');
        break;
      }
      case 'wg-conic': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const fociPts = ((s.foci ?? []) as string[]).map((fid) => this.points.get(fid)).filter(Boolean) as GPoint[];
        const dirLine = s.directrix ? this.lines.get(s.directrix) : undefined;
        const resample = () => {
          group.children.length = 0;
          let conic: GConic | null = null;
          if (s.conic === 'ellipse' && fociPts.length >= 2) {
            const d = Math.hypot(fociPts[0].x - fociPts[1].x, fociPts[0].y - fociPts[1].y);
            conic = new EllipseFromFoci(fociPts[0], fociPts[1], d * 0.75);
          } else if (s.conic === 'hyperbola' && fociPts.length >= 2) {
            const d = Math.hypot(fociPts[0].x - fociPts[1].x, fociPts[0].y - fociPts[1].y);
            conic = new HyperbolaFromFoci(fociPts[0], fociPts[1], Math.max(1, d * 0.3));
          } else if (s.conic === 'parabola' && fociPts.length >= 1 && dirLine) {
            conic = new ParabolaFromFocusDirectrix(fociPts[0], dirLine);
          }
          if (conic) {
            const pts = conic.sample(120);
            if (pts.length >= 2) group.add(new Polyline(pts, props));
          }
        };
        // Point-driven rebuild: the ellipse/hyperbola/parabola geometry depends
        // on the foci / directrix POINTS, not on slider params — so it must NOT
        // live in plotResamples (those only re-run on a param change, which left
        // the conic frozen while a focus was dragged). Rebuild inside the track
        // closure, gated on a sig that includes the foci + directrix positions
        // (same pattern as wg-plot-spline). lastParamSig stays in the sig so a
        // future param binding would also trigger it.
        let lastConicSig = '';
        resample();
        this.track(group, () => {
          let sig = this.lastParamSig;
          for (const p of fociPts) sig += `|${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          if (dirLine) sig += `|L${dirLine.x0.toFixed(1)},${dirLine.y0.toFixed(1)},${dirLine.dx.toFixed(1)},${dirLine.dy.toFixed(1)}`;
          if (sig !== lastConicSig) { resample(); lastConicSig = sig; }
          return sig;
        });
        break;
      }

      // ── Lane B: geometry constraints ────────────────────────────────────
      case 'wg-circumcenter': {
        const p = new Circumcenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-incenter': {
        const p = new Incenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-orthocenter': {
        const p = new Orthocenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-excenter': {
        const p = new Excenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who), s.which === 'b' ? 1 : s.which === 'c' ? 2 : 0);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-euler-line': {
        const cc = new Circumcenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        const oh = new Orthocenter(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(cc); this.graph.add(oh);
        const l = new EulerLine(cc, oh);
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-nine-point': {
        const pa = this.pointOf(s.a, who), pb = this.pointOf(s.b, who), pc = this.pointOf(s.c, who);
        const cc = new Circumcenter(pa, pb, pc);
        const oh = new Orthocenter(pa, pb, pc);
        const circ = new Circumcircle(pa, pb, pc);
        this.graph.add(cc); this.graph.add(oh); this.graph.add(circ);
        const c = new NinePointCircle(cc, oh, circ);
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-perp-bisector': {
        const l = new PerpBisector(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-angle-bisector': {
        const l = new AngleBisector(this.pointOf(s.a, who), this.pointOf(s.vertex, who), this.pointOf(s.b, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-median': {
        const l = new Median(this.pointOf(s.vertex, who), this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-altitude': {
        const opposite = new LineThrough(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(opposite);
        const l = new Altitude(this.pointOf(s.vertex, who), opposite);
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-tangent': {
        const l = new TangentToCircle(this.circleOf(s.circle, who), this.pointOf(s.point, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-tangents-from': {
        const tf = new TangentsFromPoint(this.circleOf(s.circle, who), this.pointOf(s.point, who));
        this.graph.add(tf);
        const props = this.strokeProps(s, COL_LINE);
        const group = new Group();
        this.register(id, group, s);
        this.track(group, () => {
          group.children.length = 0;
          if (!tf.lines) return 'none';
          const half = Math.abs(plane.xMax - plane.xMin) * plane.unitX + Math.abs(plane.yMax - plane.yMin) * plane.unitY;
          for (const l of tf.lines) {
            group.add(new Segment([l.x0 - l.dx * half, l.y0 - l.dy * half], [l.x0 + l.dx * half, l.y0 + l.dy * half], props));
          }
          return `${tf.lines.map(l => `${l.x0},${l.y0},${l.dx},${l.dy}`).join('|')}`;
        });
        break;
      }
      case 'wg-circle-diameter': {
        const c = new CircleByDiameter(this.pointOf(s.a, who), this.pointOf(s.b, who));
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-incircle': {
        const c = new Incircle(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who));
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-excircle': {
        const c = new Excircle(this.pointOf(s.a, who), this.pointOf(s.b, who), this.pointOf(s.c, who), s.which === 'b' ? 1 : s.which === 'c' ? 2 : 0);
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-radical-axis': {
        const l = new RadicalAxis(this.circleOf(s.c1, who), this.circleOf(s.c2, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-polar-line': {
        const l = new PolarLine(this.circleOf(s.circle, who), this.pointOf(s.point, who));
        this.graph.add(l); this.lines.set(id, l);
        this.addInfiniteLine(id, l, s);
        break;
      }
      case 'wg-pole-point': {
        const p = new PolePoint(this.circleOf(s.circle, who), this.lineOf(s.line, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-common-tangents': {
        const ct = new CommonTangents(this.circleOf(s.c1, who), this.circleOf(s.c2, who));
        this.graph.add(ct);
        const props = this.strokeProps(s, COL_LINE);
        const group = new Group();
        this.register(id, group, s);
        this.track(group, () => {
          group.children.length = 0;
          const half = Math.abs(plane.xMax - plane.xMin) * plane.unitX + Math.abs(plane.yMax - plane.yMin) * plane.unitY;
          for (const l of ct.lines) {
            group.add(new Segment([l.x0 - l.dx * half, l.y0 - l.dy * half], [l.x0 + l.dx * half, l.y0 + l.dy * half], props));
          }
          return `${ct.lines.map(l => `${l.x0},${l.y0},${l.dx},${l.dy}`).join('|')}`;
        });
        break;
      }
      case 'wg-apollonius': {
        const c1 = this.circleOf(s.c1, who), c2 = this.circleOf(s.c2, who);
        const pA = new GPoint(c1.cx, c1.cy, false);
        const pB = new GPoint(c2.cx, c2.cy, false);
        const ratio = c1.r / (c2.r || 1);
        const c = new ApolloniusCircle(pA, pB, ratio);
        this.graph.add(c); this.circles.set(id, c);
        const props = this.strokeProps(s, COL_CIRCLE);
        const m = new Circle(c.cx, c.cy, c.r, props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.track(m, () => { m.position = [c.cx, c.cy]; m.radius = c.r; return `${c.cx},${c.cy},${c.r}`; });
        break;
      }
      case 'wg-rotated-pt': {
        const angSrc = this.num(s.angle as WgNum);
        const p = new RotatedPoint(this.pointOf(s.p, who), this.pointOf(s.center, who), angSrc());
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-translated-pt': {
        const dxSrc = this.num(s.dx as WgNum), dySrc = this.num(s.dy as WgNum);
        const p = new TranslatedPoint(this.pointOf(s.p, who), dxSrc(), dySrc());
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-dilated-pt': {
        const fSrc = this.num(s.factor as WgNum);
        const p = new DilatedPoint(this.pointOf(s.p, who), this.pointOf(s.center, who), fSrc());
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-inversion': {
        const p = new CircleInversion(this.pointOf(s.p, who), this.circleOf(s.circle, who));
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-mobius': {
        const aSrc = this.num(s.a as WgNum), bSrc = this.num(s.b as WgNum);
        const cSrc = this.num(s.c as WgNum), dSrc = this.num(s.d as WgNum);
        const p = new MobiusPoint(this.pointOf(s.p, who), [aSrc(), 0], [bSrc(), 0], [cSrc(), 0], [dSrc(), 0]);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        break;
      }
      case 'wg-locus': {
        const driver = this.points.get(s.driver);
        const dependent = this.points.get(s.dependent);
        if (!driver || !dependent) throw new Error(`${who}: locus driver/dependent must be points`);
        const n = s.samples ?? 80;
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const pts: Pt[] = [];
          const ox = driver.x, oy = driver.y;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            driver.x = ox + Math.cos(t * Math.PI * 2) * 2;
            driver.y = oy + Math.sin(t * Math.PI * 2) * 2;
            this.graph.update();
            pts.push([plane.dToWx(dependent.x), plane.dToWy(dependent.y)]);
          }
          driver.x = ox; driver.y = oy;
          this.graph.update();
          if (pts.length >= 2) group.add(new Polyline(pts, props));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-regular-polygon': {
        const cSrc = this.pt(s.center as WgPoint, who);
        const nSrc = this.num(s.n as WgNum), rSrc = this.num(s.radius as WgNum);
        const rotSrc = s.rot !== undefined ? this.num(s.rot as WgNum) : () => 0;
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const c = cSrc(), nn = Math.max(3, Math.round(nSrc())), rx = rSrc() * plane.unitX, ry = rSrc() * plane.unitY, rot = rotSrc();
          const pts: Pt[] = [];
          for (let i = 0; i < nn; i++) {
            const a = rot + (Math.PI * 2 * i) / nn;
            pts.push([c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]);
          }
          group.add(new Polygon(pts, props, s.fill ? { color: s.fill } : undefined));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-h-lock': {
        const src = this.pointOf(s.p, who);
        const p = new HLockedPoint(src.x, src.y);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        this.drag.register(p);
        break;
      }
      case 'wg-v-lock': {
        const src = this.pointOf(s.p, who);
        const p = new VLockedPoint(src.x, src.y);
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        this.drag.register(p);
        break;
      }
      case 'wg-grid-snap': {
        const src = this.pointOf(s.p, who);
        const stepSrc = s.step !== undefined ? this.num(s.step as WgNum) : () => 1;
        const p = new GridSnappedPoint(src.x, src.y, stepSrc());
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        this.drag.register(p);
        break;
      }
      case 'wg-angle-snap': {
        const src = this.pointOf(s.p, who);
        const center = this.pointOf(s.center, who);
        const stepSrc = s.step !== undefined ? this.num(s.step as WgNum) : () => (Math.PI / 12);
        const p = new AngleSnappedPoint(src.x, src.y, center, stepSrc());
        this.graph.add(p); this.points.set(id, p); this.addDot(id, p, s, true);
        this.drag.register(p);
        break;
      }
      case 'wg-length': {
        const a = this.pointOf(s.a, who), b = this.pointOf(s.b, who);
        const meas = new LengthMeasure(a, b);
        this.graph.add(meas);
        const color = s.color ?? COL_LABEL;
        const m = new Label('', 0, 0, 14, color);
        this.register(id, m, s);
        this.track(m, () => {
          const v = meas.value / plane.unitX;
          m.text = v.toFixed(2);
          m.position = [(a.x + b.x) / 2, (a.y + b.y) / 2 + plane.unitY * 0.3];
          return `${v}`;
        });
        break;
      }
      case 'wg-slope': {
        const l = this.lineOf(s.line, who);
        const color = s.color ?? COL_LABEL;
        const m = new Label('', 0, 0, 14, color);
        this.register(id, m, s);
        this.track(m, () => {
          const v = Math.abs(l.dx) < 1e-9 ? Infinity : l.dy / l.dx;
          m.text = isFinite(v) ? `m=${v.toFixed(2)}` : 'm=∞';
          m.position = [l.x0, l.y0 + 0.4];
          return `${v}`;
        });
        break;
      }
      case 'wg-radius': {
        const c = this.circleOf(s.circle, who);
        const meas = new RadiusMeasure(c);
        this.graph.add(meas);
        const color = s.color ?? COL_LABEL;
        const m = new Label('', 0, 0, 14, color);
        this.register(id, m, s);
        this.track(m, () => {
          const v = meas.value;
          m.text = `r=${v.toFixed(2)}`;
          m.position = [c.cx, c.cy + c.r + 0.3];
          return `${v}`;
        });
        break;
      }
      case 'wg-area': {
        const pts = (s.points as string[]).map((pid) => this.pointOf(pid, who));
        const meas = new AreaMeasure(pts);
        this.graph.add(meas);
        const color = s.color ?? COL_LABEL;
        const m = new Label('', 0, 0, 14, color);
        this.register(id, m, s);
        this.track(m, () => {
          const v = meas.value / (plane.unitX * plane.unitY);
          m.text = `A=${v.toFixed(2)}`;
          let cx = 0, cy = 0;
          for (const p of pts) { cx += p.x; cy += p.y; }
          m.position = [cx / pts.length, cy / pts.length];
          return `${v}`;
        });
        break;
      }

      // ── Lane C: stats & probability ─────────────────────────────────────
      case 'wg-distribution': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const d = this.mkDist(s);
          if (!d) return;
          const d0 = s.domain ? (this.num(s.domain[0] as WgNum))() : -5;
          const d1 = s.domain ? (this.num(s.domain[1] as WgNum))() : 5;
          const n = s.samples ?? 200;
          const pdfPts: Pt[] = [];
          for (let i = 0; i <= n; i++) {
            const x = d0 + (d1 - d0) * i / n;
            pdfPts.push([x, d.pdf(x) * 12]);
          }
          group.add(new Polyline(this.toWorld(pdfPts), props));
          if (s.showCdf) {
            const cdfPts: Pt[] = [];
            for (let i = 0; i <= n; i++) {
              const x = d0 + (d1 - d0) * i / n;
              cdfPts.push([x, d.cdf(x) * 6]);
            }
            group.add(new Polyline(this.toWorld(cdfPts), { ...props, color: COL_ANGLE }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig + '|' + this.lodScale);
        break;
      }
      case 'wg-sampling': {
        const color = s.color ?? COL_PLOT;
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const d = this.mkDist(s);
          if (!d) return;
          const n = Math.round((this.num(s.n as WgNum))());
          const seed = s.seed ?? 42;
          let st = seed;
          const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
          const data = statSample(d, n, rng);
          const bins = sturgesBins(n);
          const hist = statHistogram(data, bins);
          const props = this.strokeProps(s, color);
          for (const b of hist) {
            const x0 = b.x0, x1 = b.x1, h = b.count / n;
            group.add(new Polygon(this.toWorld([[x0, 0], [x1, 0], [x1, h], [x0, h]]), props, { color: [...color.slice(0, 3), 0.4] as any }));
          }
          const r = s.radius ?? 3;
          for (const v of data.slice(0, 200)) group.add(new Dot(plane.dToWx(v), plane.dToWy(0), r, color));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-clt': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const d = this.mkDist(s);
          if (!d) return;
          const ss = Math.round((this.num(s.sampleSize as WgNum))());
          const trials = s.trials ? Math.round((this.num(s.trials as WgNum))()) : 500;
          const seed = s.seed ?? 42;
          let st = seed;
          const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
          const result = cltSimulation(d, ss, trials, 30, rng);
          const maxC = Math.max(...result.histogram.map(b => b.count), 1);
          for (const b of result.histogram) {
            const h = b.count / maxC;
            group.add(new Polygon(this.toWorld([[b.x0, 0], [b.x1, 0], [b.x1, h], [b.x0, h]]), props, { color: s.fill ?? [0.36, 0.62, 0.98, 0.4] }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-random-walk': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const steps = Math.round((this.num(s.steps as WgNum))());
          const walks = s.walks ? Math.round((this.num(s.walks as WgNum))()) : 3;
          const seed = s.seed ?? 42;
          let st = seed;
          const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
          if (s.dims === 1) {
            for (let w = 0; w < walks; w++) {
              const path = randomWalk1D(steps, 1, rng);
              const pts: Pt[] = path.map((y, i) => [i, y] as Pt);
              group.add(new Polyline(this.toWorld(pts), props));
            }
          } else {
            if (s.brownian) {
              const path = brownianMotion(steps, 0.01, 1, rng);
              group.add(new Polyline(this.toWorld(path as Pt[]), props));
            } else {
              const all = multipleWalks2D(walks, steps, 1, rng);
              for (const path of all) group.add(new Polyline(this.toWorld(path as Pt[]), props));
            }
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-monte-carlo': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const n = Math.round((this.num(s.n as WgNum))());
          const seed = s.seed ?? 42;
          let st = seed;
          const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
          if (s.method === 'pi') {
            const result = monteCarloPi(Math.min(n, 2000), rng);
            const r = s.radius ?? 2.5;
            for (const d of result.darts.slice(0, 500)) {
              group.add(new Dot(plane.dToWx(d.x), plane.dToWy(d.y), r, d.inside ? [0.35, 0.80, 0.55, 1] : [0.90, 0.45, 0.45, 1]));
            }
            const circPts: Pt[] = [];
            for (let i = 0; i <= 64; i++) { const a = Math.PI * 2 * i / 64; circPts.push([Math.cos(a), Math.sin(a)]); }
            group.add(new Polyline(this.toWorld(circPts), props));
          } else {
            const result = buffonsNeedle(Math.min(n, 500), 1, 1, rng);
            for (const nd of result.results.slice(0, 200)) {
              const col = nd.crosses ? [0.90, 0.45, 0.45, 1] : [0.35, 0.80, 0.55, 1];
              const half = 0.5;
              const dx = Math.cos(nd.angle) * half, dy = Math.sin(nd.angle) * half;
              group.add(new Segment([plane.dToWx(nd.x - dx), plane.dToWy(nd.y - dy)], [plane.dToWx(nd.x + dx), plane.dToWy(nd.y + dy)], { color: col, width: 1.5, cap: 'butt', join: 'miter' }));
            }
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-correlation': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const pts: [number, number][] = s.anscombe ? ANSCOMBE_QUARTET[s.anscombe - 1] : (s.points ?? []);
          const r = s.radius ?? 4;
          for (const p of pts) group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), r, color));
          if (s.showRegression !== false && pts.length >= 2) {
            const reg = linReg(pts);
            const xs = pts.map(p => p[0]);
            const x0 = Math.min(...xs), x1 = Math.max(...xs);
            group.add(new Segment([plane.dToWx(x0), plane.dToWy(reg.slope * x0 + reg.intercept)], [plane.dToWx(x1), plane.dToWy(reg.slope * x1 + reg.intercept)], { color: COL_ANGLE, width: 2, cap: 'butt', join: 'miter' }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-hypothesis': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const mu0 = (this.num(s.mu0 as WgNum))();
          const sigma = s.sigma !== undefined ? (this.num(s.sigma as WgNum))() : 1;
          const n = Math.round((this.num(s.n as WgNum))());
          const alpha = s.alpha !== undefined ? (this.num(s.alpha as WgNum))() : 0.05;
          const se = sigma / Math.sqrt(n);
          const d0 = s.domain ? (this.num(s.domain[0] as WgNum))() : mu0 - 4 * se;
          const d1 = s.domain ? (this.num(s.domain[1] as WgNum))() : mu0 + 4 * se;
          const nn = 200;
          const pdfPts: Pt[] = [];
          for (let i = 0; i <= nn; i++) {
            const x = d0 + (d1 - d0) * i / nn;
            pdfPts.push([x, normalPdf(x, mu0, se)]);
          }
          group.add(new Polyline(this.toWorld(pdfPts), props));
          if (s.mu1 !== undefined) {
            const mu1 = (this.num(s.mu1 as WgNum))();
            const altPts: Pt[] = [];
            for (let i = 0; i <= nn; i++) {
              const x = d0 + (d1 - d0) * i / nn;
              altPts.push([x, normalPdf(x, mu1, se)]);
            }
            group.add(new Polyline(this.toWorld(altPts), { ...props, color: COL_ANGLE }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }

      // ── Lane D: linear algebra ──────────────────────────────────────────
      case 'wg-matrix-grid': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const e = (s.entries as WgNum[]).map(v => (this.num(v))());
          const m: Mat2 = [e[0], e[1], e[2], e[3]];
          const ext = s.extent !== undefined ? (this.num(s.extent as WgNum))() : 4;
          const step = s.gridStep ?? 1;
          const grid = transformGrid(m, ext, step);
          for (const [a, b] of grid.lines) {
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1 }));
          }
          const bi = grid.basisI, bj = grid.basisJ;
          group.add(new Vector([plane.dToWx(0), plane.dToWy(0)], [plane.dToWx(bi[0]), plane.dToWy(bi[1])], { color: [0.90, 0.45, 0.45, 1], width: 3 }));
          group.add(new Vector([plane.dToWx(0), plane.dToWy(0)], [plane.dToWx(bj[0]), plane.dToWy(bj[1])], { color: [0.35, 0.80, 0.55, 1], width: 3 }));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-determinant': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const e = (s.entries as WgNum[]).map(v => (this.num(v))());
          const m: Mat2 = [e[0], e[1], e[2], e[3]];
          const verts = parallelogramVertices(m);
          const wPts = verts.map(v => [plane.dToWx(v[0]), plane.dToWy(v[1])] as Pt);
          const det = det2(m);
          const col = det >= 0 ? [0.35, 0.80, 0.55, 0.4] : [0.90, 0.45, 0.45, 0.4];
          group.add(new Polygon(wPts, props, { color: s.fill ?? col }));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-eigenvectors': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const e = (s.entries as WgNum[]).map(v => (this.num(v))());
          const m: Mat2 = [e[0], e[1], e[2], e[3]];
          const ext = s.extent !== undefined ? (this.num(s.extent as WgNum))() : 4;
          const lines = invariantLines(m);
          for (const il of lines) {
            const d = il.direction;
            const len = ext;
            group.add(new Segment([plane.dToWx(-d[0] * len), plane.dToWy(-d[1] * len)], [plane.dToWx(d[0] * len), plane.dToWy(d[1] * len)], { ...props, color: COL_ANGLE }));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-matrix-compose': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const ea = (s.a as WgNum[]).map((v: WgNum) => (this.num(v))());
          const eb = (s.b as WgNum[]).map((v: WgNum) => (this.num(v))());
          const ma: Mat2 = [ea[0], ea[1], ea[2], ea[3]];
          const mb: Mat2 = [eb[0], eb[1], eb[2], eb[3]];
          const ext = s.extent !== undefined ? (this.num(s.extent as WgNum))() : 3;
          const gA = transformGrid(ma, ext, 1);
          for (const [a, b] of gA.lines) group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 0.7, color: COL_LINE }));
          const composed: Mat2 = [ma[0]*mb[0]+ma[1]*mb[2], ma[0]*mb[1]+ma[1]*mb[3], ma[2]*mb[0]+ma[3]*mb[2], ma[2]*mb[1]+ma[3]*mb[3]];
          const gC = transformGrid(composed, ext, 1);
          for (const [a, b] of gC.lines) group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1.5 }));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-dot-product': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const u = (s.u as WgNum[]).map((v: WgNum) => (this.num(v))()) as LVec2;
          const v = (s.v as WgNum[]).map((v2: WgNum) => (this.num(v2))()) as LVec2;
          const o: Pt = [plane.dToWx(0), plane.dToWy(0)];
          group.add(new Vector(o, [plane.dToWx(u[0]), plane.dToWy(u[1])], { color: [0.90, 0.45, 0.45, 1], width: 3 }));
          group.add(new Vector(o, [plane.dToWx(v[0]), plane.dToWy(v[1])], { color: [0.35, 0.80, 0.55, 1], width: 3 }));
          const proj = project2(u, v);
          group.add(new Segment([plane.dToWx(proj[0]), plane.dToWy(proj[1])], [plane.dToWx(u[0]), plane.dToWy(u[1])], { ...props, color: COL_ANGLE, width: 1.5 }));
          group.add(new Dot(plane.dToWx(proj[0]), plane.dToWy(proj[1]), 4, COL_ANGLE));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-svd': {
        const props = this.strokeProps(s, COL_PLOT);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const e = (s.entries as WgNum[]).map(v => (this.num(v))());
          const m: Mat2 = [e[0], e[1], e[2], e[3]];
          const ext = s.extent !== undefined ? (this.num(s.extent as WgNum))() : 3;
          const result = svd2(m);
          const n = 64;
          const circPts: Pt[] = [];
          for (let i = 0; i <= n; i++) {
            const a = Math.PI * 2 * i / n;
            const v: LVec2 = [Math.cos(a) * ext, Math.sin(a) * ext];
            const tv = applyMat2(m, v);
            circPts.push([plane.dToWx(tv[0]), plane.dToWy(tv[1])]);
          }
          group.add(new Polyline(circPts, props));
          const u1 = result.U, s1 = result.S;
          group.add(new Vector([plane.dToWx(0), plane.dToWy(0)], [plane.dToWx(u1[0] * s1[0] * ext), plane.dToWy(u1[1] * s1[0] * ext)], { color: [0.90, 0.45, 0.45, 1], width: 3 }));
          group.add(new Vector([plane.dToWx(0), plane.dToWy(0)], [plane.dToWx(u1[2] * s1[1] * ext), plane.dToWy(u1[3] * s1[1] * ext)], { color: [0.35, 0.80, 0.55, 1], width: 3 }));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }

      // ── Lane E: graph theory ────────────────────────────────────────────
      case 'wg-graph': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const g = this.mkGraph(s);
          if (!g) return;
          const positions = this.layoutGraph(g, s);
          for (const e of g.edges) {
            const a = positions[e[0]], b = positions[e[1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1.5 }));
          }
          const r = s.radius ?? 5;
          for (const p of positions) group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), r, color));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-traversal': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const g = this.mkGraph(s);
          if (!g) return;
          const positions = this.layoutGraph(g, s);
          const start = s.start !== undefined ? Math.round((this.num(s.start as WgNum))()) : 0;
          const steps = s.algo === 'bfs' ? bfs(g, start) : dfs(g, start);
          for (const e of g.edges) {
            const a = positions[e[0]], b = positions[e[1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1, color: COL_LINE }));
          }
          for (let i = 0; i < steps.length; i++) {
            const st = steps[i];
            if (st.parent !== -1) {
              const a = positions[st.parent], b = positions[st.node];
              group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 2.5, color: COL_ANGLE }));
            }
          }
          const r = s.radius ?? 5;
          for (let i = 0; i < positions.length; i++) {
            const visited = steps.some(st => st.node === i);
            group.add(new Dot(plane.dToWx(positions[i][0]), plane.dToWy(positions[i][1]), r, visited ? color : COL_LINE));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-shortest-path': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const g = this.mkGraph(s);
          if (!g) return;
          const positions = this.layoutGraph(g, s);
          const wg = toWeighted(g);
          const from = s.from !== undefined ? Math.round((this.num(s.from as WgNum))()) : 0;
          const to = s.to !== undefined ? Math.round((this.num(s.to as WgNum))()) : g.nodes - 1;
          const result = dijkstra(wg, from);
          const path = shortestPath(result, to);
          for (const e of g.edges) {
            const a = positions[e[0]], b = positions[e[1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1, color: COL_LINE }));
          }
          for (let i = 0; i < path.length - 1; i++) {
            const a = positions[path[i]], b = positions[path[i + 1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 3, color: COL_ANGLE }));
          }
          const r = 5;
          for (let i = 0; i < positions.length; i++) {
            const onPath = path.includes(i);
            group.add(new Dot(plane.dToWx(positions[i][0]), plane.dToWy(positions[i][1]), r, onPath ? color : COL_LINE));
          }
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-mst': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const g = this.mkGraph(s);
          if (!g) return;
          const positions = this.layoutGraph(g, s);
          const wg = toWeighted(g);
          const result = s.algo === 'prim' ? prim(wg) : kruskal(wg);
          for (const e of g.edges) {
            const a = positions[e[0]], b = positions[e[1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1, color: COL_LINE }));
          }
          for (const e of result.edges) {
            const a = positions[e.from], b = positions[e.to];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 3, color: COL_ANGLE }));
          }
          const r = 5;
          for (const p of positions) group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), r, color));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }
      case 'wg-eulerian': {
        const color = s.color ?? COL_PLOT;
        const props = this.strokeProps(s, color);
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          group.children.length = 0;
          const g = this.mkGraph(s);
          if (!g) return;
          const positions = this.layoutGraph(g, s);
          const path = s.mode === 'circuit' ? eulerianCircuit(g) : eulerianPath(g);
          for (const e of g.edges) {
            const a = positions[e[0]], b = positions[e[1]];
            group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 1, color: COL_LINE }));
          }
          if (path) {
            for (let i = 0; i < path.length - 1; i++) {
              const a = positions[path[i]], b = positions[path[i + 1]];
              group.add(new Segment([plane.dToWx(a[0]), plane.dToWy(a[1])], [plane.dToWx(b[0]), plane.dToWy(b[1])], { ...props, width: 3, color: COL_ANGLE }));
            }
          }
          const r = 5;
          for (const p of positions) group.add(new Dot(plane.dToWx(p[0]), plane.dToWy(p[1]), r, color));
        };
        this.plotResamples.push(resample);
        resample();
        this.track(group, () => this.lastParamSig);
        break;
      }

      default:
        throw new Error(`object-resolver: unhandled kind "${s.kind}"`);
    }
  }

  /** Infinite line as a segment spanning the plane's world extent. */
  private addInfiniteLine(id: string, l: GLine, s: Record<string, any>) {
    const plane = this.plane;
    const half = (Math.abs(plane.xMax - plane.xMin) * plane.unitX + Math.abs(plane.yMax - plane.yMin) * plane.unitY);
    const props = this.strokeProps(s, COL_LINE);
    const ends = (): [Pt, Pt] => [
      [l.x0 - l.dx * half, l.y0 - l.dy * half],
      [l.x0 + l.dx * half, l.y0 + l.dy * half],
    ];
    const [a, b] = ends();
    const m = new Segment(a, b, props);
    this.register(id, m, s);
    this.track(m, () => {
      const [na, nb] = ends();
      m.a = na; m.b = nb;
      return `${l.x0},${l.y0},${l.dx},${l.dy}`;
    });
  }

  private toWorld(pts: Pt[]): Pt[] { return pts.map(([x, y]) => [this.plane.dToWx(x), this.plane.dToWy(y)] as Pt); }

  private mkDist(s: Record<string, any>): Distribution | null {
    const p = (s.params as WgNum[] | undefined)?.map((v: WgNum) => (this.num(v))()) ?? [];
    switch (s.dist) {
      case 'normal': return normal(p[0] ?? 0, p[1] ?? 1);
      case 'binomial': return binomial(Math.round(p[0] ?? 10), p[1] ?? 0.5);
      case 'poisson': return poisson(p[0] ?? 3);
      case 'exponential': return exponential(p[0] ?? 1);
      case 'uniform': return uniform(p[0] ?? 0, p[1] ?? 1);
      case 'geometric': return geometric(p[0] ?? 0.5);
      case 'chi2': return chiSquared(Math.round(p[0] ?? 3));
      case 't': return tDist(Math.round(p[0] ?? 5));
      case 'f': return fDist(Math.round(p[0] ?? 5), Math.round(p[1] ?? 10));
      default: return null;
    }
  }

  private mkGraph(s: Record<string, any>): Graph | null {
    const n = s.n !== undefined ? Math.round((this.num(s.n as WgNum))()) : 6;
    const m = s.m !== undefined ? Math.round((this.num(s.m as WgNum))()) : 3;
    const p = s.p !== undefined ? (this.num(s.p as WgNum))() : 0.3;
    const seed = s.seed ?? 42;
    let st = seed;
    const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
    switch (s.graph) {
      case 'petersen': return petersenGraph();
      case 'complete': return completeGraph(n);
      case 'cycle': return cycleGraph(n);
      case 'path': return pathGraph(n);
      case 'grid': return gridGraph(n, m);
      case 'star': return starGraph(n);
      case 'wheel': return wheelGraph(n);
      case 'tree': return binaryTree(Math.min(n, 5));
      case 'random': return randomGraph(n, p, rng);
      default: return null;
    }
  }

  private layoutGraph(g: Graph, s: Record<string, any>): [number, number][] {
    const scale = 4;
    const clamp = (v: number) => Math.max(-7, Math.min(7, v));
    if (s.layout === 'circular') {
      return circularLayout(g.nodes, scale).map(([x, y]) => [clamp(x), clamp(y)] as [number, number]);
    }
    const seed = s.seed ?? 42;
    let st = seed;
    const rng = () => { st = (st * 1664525 + 1013904223) & 0x7fffffff; return st / 0x7fffffff; };
    const nodes = runLayout(g, 200, {}, rng);
    return layoutPositions(nodes).map(([x, y]) => [clamp(x * scale), clamp(y * scale)] as [number, number]);
  }

  private curveGroup(segs: Pt[][], props: { color: number[]; width: number; cap: 'butt'; join: 'miter' }): Group {
    const g = new Group();
    for (const seg of segs) if (seg.length >= 2) g.add(new Polyline(seg, props));
    return g;
  }

  /** Sample a curve in DATA space → world polylines, split at discontinuities.
   *  `at(t)` returns data coords; omit `x` for y=f(t) with x=t. */
  private sampleCurve(t0: number, t1: number, n: number, at: (t: number) => { x?: number; y: number }): Pt[][] {
    const plane = this.plane;
    const jump = Math.abs(plane.yMax - plane.yMin) * plane.unitY * 4;
    const segs: Pt[][] = [];
    let cur: Pt[] = [];
    let prevWy: number | null = null;
    for (let i = 0; i <= n; i++) {
      const t = t0 + (t1 - t0) * i / n;
      const p = at(t);
      const x = p.x ?? t;
      if (!isFinite(x) || !isFinite(p.y)) {
        if (cur.length > 1) segs.push(cur);
        cur = []; prevWy = null; continue;
      }
      const wy = plane.dToWy(p.y);
      if (prevWy !== null && Math.abs(wy - prevWy) > jump) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
      }
      cur.push([plane.dToWx(x), wy]);
      prevWy = wy;
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }

  // ── live update + emit ────────────────────────────────────────────────────

  update() {
    this.graph.update();
    // Keep mobject fields eager (the sig gate inside track() makes this cheap
    // and fires markDirty only on real change); emit() re-runs the same gated
    // syncs before composing slices.
    for (const sync of this.syncables) sync();
    const sig = this.paramSig();
    if (sig !== this.lastParamSig) {
      this.lastParamSig = sig;
      for (const resample of this.plotResamples) resample();
    }
  }

  /** Cumulative direct-draw cache rebuilds (diagnostic — should be flat while idle). */
  get directMisses(): number { return this.directCache.misses; }

  /** Zoom LOD: scale plot sample counts (√zoom-ish, set by the board). Returns
   *  true when the scale actually changed and plots were resampled. */
  setLodScale(scale: number): boolean {
    if (scale === this.lodScale) return false;
    this.lodScale = scale;
    for (const resample of this.plotResamples) resample();
    return true;
  }

  /** Numeric scene-param names an expression references (substring heuristic —
   *  a false positive only costs an occasional extra re-run, never correctness). */
  private exprDeps(expr: string): string[] {
    const deps: string[] = [];
    for (const [name, def] of Object.entries((this.doc.params ?? {}) as Record<string, any>)) {
      if (def.kind === 'number' && expr.includes(name)) deps.push(name);
    }
    return deps;
  }

  emit(ctx: RenderCtx, view: PlaneView) {
    // Per-mobject slice composition: each mobject's instances are cached in a
    // typed slice, rebuilt only when its geometry sig changes (dragging one
    // vertex rebuilds ~6 slices, not the whole scene — the wave plot costs
    // nothing). Slices compose into the target buffers via direct-indexed
    // writes. The scratch buffers are seeded with the atlas+static prefix size
    // so captured rows stay distinguishable from atlas band references.
    const seedRows = ctx.rws.length / 5;
    if (seedRows !== this.seedRows) {
      this.seedRows = seedRows;
      for (const sc of this.sliceCaches) sc.invalidate();
    }
    let iOff = ctx.inst.length, cOff = ctx.crv.length, rOff = ctx.rws.length;
    const scratchCtx: RenderCtx = { font: ctx.font, atlas: ctx.atlas, inst: this.scratchInst, crv: this.scratchCrv, rws: this.scratchRws };
    for (let idx = 0; idx < this.emitList.length; idx++) {
      const sig = this.syncables[idx]();
      let sc = this.sliceCaches[idx];
      if (!sc) { sc = new EmitCache(); this.sliceCaches[idx] = sc; }
      if (!sc.captured || sig !== sc.signature) {
        this.scratchInst.length = 0;
        this.scratchCrv.length = seedRows * 6;
        this.scratchCrv.fill(0);
        this.scratchRws.length = seedRows * 5;
        this.scratchRws.fill(0);
        this.emitList[idx].emit(scratchCtx);
        sc.captureFrom(this.scratchInst, this.scratchCrv, this.scratchRws, 0, seedRows * 6, seedRows * 5);
        sc.signature = sig;
      }
      sc.appendInto(ctx.inst, ctx.crv, ctx.rws, iOff, cOff, rOff);
      iOff += sc.instLen; cOff += sc.crvLen; rOff += sc.rwsLen;
    }
    ctx.inst.length = iOff; ctx.crv.length = cOff; ctx.rws.length = rOff;
    if (this.directDraws.length) {
      const pctx: PlaneCtx = { font: ctx.font, atlas: ctx.atlas, inst: ctx.inst, crv: ctx.crv, rws: ctx.rws };
      const plane = this.plane;
      // Cache key: zoom band (px widths tolerate ≤9% variance) + a COARSE tile
      // quantization of the clip. The draws run against the widened superset
      // view, so the captured contours/arrows stay valid while panning within
      // a tile — marching squares re-runs a few times per second at most, not
      // per frame, and never for sliders its expressions don't reference.
      const z = Math.max(view.zoom, 1e-6);
      const zq = Math.pow(2, Math.round(Math.log2(z) * 8) / 8);
      const T = 2400;
      let L: number, Tp: number, R: number, B: number;
      if (view.left < -1e11) {
        L = plane.dToWx(plane.xMin); R = plane.dToWx(plane.xMax);
        Tp = plane.dToWy(plane.yMax); B = plane.dToWy(plane.yMin);
      } else {
        L = Math.floor(view.left / T) * T; Tp = Math.floor(view.top / T) * T;
        R = Math.ceil(view.right / T) * T; B = Math.ceil(view.bottom / T) * T;
      }
      let sig = `${zq}|${L},${Tp},${R},${B}`;
      for (const d of this.directDraws) {
        for (const n of d.deps) sig += `|${n}=${this.params.get(n)}`;
      }
      const wideView: PlaneView = { zoom: view.zoom, left: L, right: R, top: Tp, bottom: B };
      this.directCache.run(sig, ctx.inst, ctx.crv, ctx.rws, () => {
        for (const d of this.directDraws) d.draw(pctx, wideView);
      });
    }
  }

  // ── drag delegation ───────────────────────────────────────────────────────

  tryBeginDrag(wx: number, wy: number, scale: number): boolean { return this.drag.begin(wx, wy, scale); }
  dragTo(wx: number, wy: number) { this.drag.drag(wx, wy); }
  endDrag() { this.drag.end(); }
  updateHover(wx: number, wy: number, scale: number): boolean { return this.drag.updateHover(wx, wy, scale); }
  get dragging(): boolean { return this.drag.dragging; }

  /** Spec id of the hovered point (for emit-cache signatures / hover rings). */
  get hoveredId(): string | null {
    const h = this.drag.hover;
    if (!h) return null;
    for (const [id, p] of this.points) if (p === h) return id;
    return null;
  }
}
