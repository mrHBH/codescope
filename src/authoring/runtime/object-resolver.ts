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
} from '../../windgraph/interact/constraints';
import { Mobject, Group, type RenderCtx } from '../../windgraph/mobject/mobject';
import { Dot, Segment, Polyline, Polygon, Vector, Circle, Arc, Ellipse, Label } from '../../windgraph/mobject/primitives';
import type { NumberPlane, PlaneView, PlaneCtx } from '../../windgraph/coords/numberPlane';
import { plotImplicit } from '../../windgraph/plot/implicit';
import { plotVectorField, plotSlopeField } from '../../windgraph/plot/field';
import { EmitCache } from '../../windfoil/emitCache';
import { compileExpr } from '../../windgraph/expr';
import { DragController } from '../../windgraph/interact/drag';
import type { Pt } from '../../windgraph/stroke/stroke';

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
  private syncables: (() => void)[] = [];
  /** View-dependent draws (implicit contours, fields). Each carries the param
   *  names its expression actually reads — the cache signature includes only
   *  those, so an unrelated slider never re-runs marching squares. */
  private directDraws: { draw: (ctx: PlaneCtx, view: PlaneView) => void; deps: string[] }[] = [];
  private directCache = new EmitCache();
  private plotResamples: (() => void)[] = [];
  private lastParamSig = '';
  /** Zoom-LOD sample density for plots (set by the hosting board each emit). */
  private lodScale = 1;

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

  private strokeProps(s: Record<string, any>, fallback: number[]): { color: number[]; width: number } {
    return { color: s.stroke?.color ?? fallback, width: s.stroke?.width ?? DEFAULT_WIDTH };
  }

  private register(id: string, m: Mobject, s: Record<string, any>) {
    m.visible = s.visible ?? true;
    m.opacity = s.opacity ?? 1;
    this.mobjects.set(id, m);
  }

  private addDot(id: string, p: GPoint, s: Record<string, any>, derived: boolean) {
    const dot = new Dot(p.x, p.y, s.radius ?? (derived ? 5 : 7), s.color ?? (derived ? COL_DERIVED : COL_POINT));
    this.register(id, dot, s);
    this.syncables.push(() => { dot.position = p.pos; dot.markDirty(); });
    if (s.label) {
      const size = this.plane.unitX * 0.26;
      const r = dot.radius;
      const lab = new Label(s.label, 0, 0, size, COL_LABEL);
      const labId = id + ':label';
      this.mobjects.set(labId, lab);
      this.order.push(labId);
      this.syncables.push(() => { lab.position = [p.x + r + size * 0.35, p.y - r - size * 0.55]; lab.markDirty(); });
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
        this.syncables.push(() => { m.position = [c.cx, c.cy]; m.radius = c.r; m.markDirty(); });
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
        this.syncables.push(() => { m.position = [c.cx, c.cy]; m.radius = c.r; m.markDirty(); });
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
        this.syncables.push(() => {
          const p = cSrc();
          m.position = p; m.radius = rSrc() * plane.unitX; m.a0 = a0Src(); m.a1 = a1Src(); m.markDirty();
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
        this.syncables.push(() => {
          const p = cSrc();
          m.position = p; m.scaleX = rxSrc() * plane.unitX; m.scaleY = rySrc() * plane.unitY; m.rotation = rotSrc(); m.markDirty();
        });
        break;
      }
      case 'wg-segment': {
        const aSrc = this.pt(s.from as WgPoint, who), bSrc = this.pt(s.to as WgPoint, who);
        const props = this.strokeProps(s, COL_LINE);
        const m = new Segment(aSrc(), bSrc(), props);
        this.register(id, m, s);
        this.syncables.push(() => { m.a = aSrc(); m.b = bSrc(); m.markDirty(); });
        break;
      }
      case 'wg-vector': {
        const aSrc = this.pt(s.from as WgPoint, who), bSrc = this.pt(s.to as WgPoint, who);
        const m = new Vector(aSrc(), bSrc(), { color: s.color ?? COL_LINE, width: s.width ?? DEFAULT_WIDTH });
        this.register(id, m, s);
        this.syncables.push(() => { m.a = aSrc(); m.b = bSrc(); m.markDirty(); });
        break;
      }
      case 'wg-polyline': {
        const srcs = (s.points as WgPoint[]).map((p) => this.pt(p, who));
        const props = this.strokeProps(s, COL_LINE);
        const m = new Polyline(srcs.map((g) => g()), props);
        this.register(id, m, s);
        this.syncables.push(() => { m.points = srcs.map((g) => g()); m.markDirty(); });
        break;
      }
      case 'wg-polygon': {
        const srcs = (s.points as WgPoint[]).map((p) => this.pt(p, who));
        const props = this.strokeProps(s, COL_LINE);
        const m = new Polygon(srcs.map((g) => g()), props, s.fill ? { color: s.fill } : undefined);
        this.register(id, m, s);
        this.syncables.push(() => { m.points = srcs.map((g) => g()); m.markDirty(); });
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
        this.syncables.push(() => {
          arc.position = v.pos; arc.a0 = ang.a0; arc.a1 = ang.a1; arc.markDirty();
          const mid = (ang.a0 + ang.a1) / 2, rr = plane.unitX * 0.45;
          lab.position = [v.x + Math.cos(mid) * rr, v.y + Math.sin(mid) * rr];
          lab.text = (ang.value * 180 / Math.PI).toFixed(1) + '°';
          lab.markDirty();
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
        this.syncables.push(() => {
          lab.position = [(a.x + b.x) / 2, (a.y + b.y) / 2 - plane.unitX * 0.18];
          lab.text = (dist.value / plane.unitX).toFixed(2);
          lab.markDirty();
        });
        break;
      }
      case 'wg-plot-fn': {
        const fn = compileExpr(s.expr);
        const d0 = this.num((s.domain?.[0] ?? plane.xMin) as WgNum);
        const d1 = this.num((s.domain?.[1] ?? plane.xMax) as WgNum);
        const base = s.samples ?? 240;
        // Miter joins: round joins cost a 24-quad disc PER SAMPLE (the instance
        // dominator); on dense smooth samples miter is visually identical.
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = Math.max(48, Math.round(base * this.lodScale));
          group.children.length = 0;
          for (const seg of this.sampleCurve(d0(), d1(), n, (x) => ({ y: fn(this.scope({ x })) }))) {
            group.add(new Polyline(seg, props));
          }
        };
        this.plotResamples.push(resample);
        resample();
        break;
      }
      case 'wg-plot-parametric': {
        const fx = compileExpr(s.xExpr), fy = compileExpr(s.yExpr);
        const t0 = this.num(s.tRange[0] as WgNum), t1 = this.num(s.tRange[1] as WgNum);
        const base = s.samples ?? 320;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = Math.max(48, Math.round(base * this.lodScale));
          group.children.length = 0;
          for (const seg of this.sampleCurve(t0(), t1(), n, (t) => ({ x: fx(this.scope({ t })), y: fy(this.scope({ t })) }))) {
            group.add(new Polyline(seg, props));
          }
        };
        this.plotResamples.push(resample);
        resample();
        break;
      }
      case 'wg-plot-polar': {
        const fr = compileExpr(s.rExpr);
        const t0 = this.num(s.tRange[0] as WgNum), t1 = this.num(s.tRange[1] as WgNum);
        const base = s.samples ?? 320;
        const props = { ...this.strokeProps(s, COL_PLOT), join: 'miter' as const };
        const group = new Group();
        this.register(id, group, s);
        const resample = () => {
          const n = Math.max(48, Math.round(base * this.lodScale));
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
      case 'wg-conic':
        throw new Error(`${who}: live conics resolve in Phase 4 (B5) — not yet supported`);
      default:
        throw new Error(`object-resolver: unhandled kind "${s.kind}"`);
    }
  }

  /** Infinite line as a very long segment spanning the plane's world extent. */
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
    this.syncables.push(() => { const [na, nb] = ends(); m.a = na; m.b = nb; m.markDirty(); });
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
    for (const id of this.order) {
      const m = this.mobjects.get(id);
      if (m) m.emit(ctx);
    }
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
