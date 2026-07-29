// ── windgraph object builder (sprint-v2 Phase 1.3) ───────────────────────────
// Builder methods for every wg-* ObjectSpec kind (contracts.md §2). Coordinates
// are DATA-space (the board's NumberPlane maps them to world) — unlike chapter
// content, wg objects take no chapter-relative offset. Access via
// SceneBuilder.wg (scene-level) or ChapterBuilder.wg (parents under the chapter
// group so chapter fades/compositing apply).

import type { SceneBuilder } from './scene';
import type { ObjectSpec, Color, Stroke, WgNum, WgPoint } from '../ir/types';

interface CommonOpts { opacity?: number; visible?: boolean; }
interface StrokeOpts extends CommonOpts { stroke?: Stroke; }
interface PointLikeOpts extends CommonOpts { color?: Color; radius?: number; label?: string; }

export class WgBuilder {
  constructor(private s: SceneBuilder, private parentId: string | null = null) {}

  private add(spec: ObjectSpec): string {
    this.s.addSpec(spec);
    if (this.parentId) this.s.addChild(this.parentId, spec.id);
    return spec.id;
  }

  // ── geometry primitives ─────────────────────────────────────────────────

  point(id: string | null, at: WgPoint, o: PointLikeOpts & { free?: boolean } = {}) {
    return this.add({ kind: 'wg-point', id: id ?? this.s.uid('wg-point'), at, free: o.free, label: o.label, color: o.color, radius: o.radius, opacity: o.opacity, visible: o.visible });
  }
  segment(id: string | null, from: WgPoint, to: WgPoint, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-segment', id: id ?? this.s.uid('wg-segment'), from, to, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  vector(id: string | null, from: WgPoint, to: WgPoint, o: CommonOpts & { color?: Color; width?: number } = {}) {
    return this.add({ kind: 'wg-vector', id: id ?? this.s.uid('wg-vector'), from, to, color: o.color, width: o.width, opacity: o.opacity, visible: o.visible });
  }
  polyline(id: string | null, points: WgPoint[], o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-polyline', id: id ?? this.s.uid('wg-polyline'), points, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  polygon(id: string | null, points: WgPoint[], o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-polygon', id: id ?? this.s.uid('wg-polygon'), points, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  circle(id: string | null, center: WgPoint, radius: WgNum, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-circle', id: id ?? this.s.uid('wg-circle'), center, radius, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  arc(id: string | null, center: WgPoint, radius: WgNum, a0: WgNum, a1: WgNum, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-arc', id: id ?? this.s.uid('wg-arc'), center, radius, a0, a1, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  ellipse(id: string | null, center: WgPoint, rx: WgNum, ry: WgNum, o: StrokeOpts & { fill?: Color; rot?: WgNum } = {}) {
    return this.add({ kind: 'wg-ellipse', id: id ?? this.s.uid('wg-ellipse'), center, rx, ry, rot: o.rot, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  /** Stub kind — validates + serializes; resolves in Phase 4 (B5 live conics). */
  conic(id: string | null, conic: 'ellipse' | 'hyperbola' | 'parabola', o: StrokeOpts & { foci?: string[]; directrix?: string; through?: string } = {}) {
    return this.add({ kind: 'wg-conic', id: id ?? this.s.uid('wg-conic'), conic, foci: o.foci, directrix: o.directrix, through: o.through, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }

  // ── constraint constructions (inputs are object ids) ────────────────────

  midpoint(id: string | null, a: string, b: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-midpoint', id: id ?? this.s.uid('wg-midpoint'), a, b, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  centroid(id: string | null, points: string[], o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-centroid', id: id ?? this.s.uid('wg-centroid'), points, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  intersection(id: string | null, a: string, b: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-intersection', id: id ?? this.s.uid('wg-intersection'), a, b, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  glider(id: string | null, curve: string, t: WgNum, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-glider', id: id ?? this.s.uid('wg-glider'), curve, t, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  reflection(id: string | null, p: string, axis: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-reflection', id: id ?? this.s.uid('wg-reflection'), p, axis, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  lineThrough(id: string | null, a: string, b: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-line-through', id: id ?? this.s.uid('wg-line-through'), a, b, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  perpendicular(id: string | null, line: string, point: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-perpendicular', id: id ?? this.s.uid('wg-perpendicular'), line, point, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  parallel(id: string | null, line: string, point: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-parallel', id: id ?? this.s.uid('wg-parallel'), line, point, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  circumcircle(id: string | null, a: string, b: string, c: string, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-circumcircle', id: id ?? this.s.uid('wg-circumcircle'), a, b, c, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  angle(id: string | null, a: string, vertex: string, b: string, o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-angle', id: id ?? this.s.uid('wg-angle'), a, vertex, b, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  distance(id: string | null, a: string, b: string, o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-distance', id: id ?? this.s.uid('wg-distance'), a, b, color: o.color, opacity: o.opacity, visible: o.visible });
  }

  // ── plots (expressions compiled by windgraph/expr) ──────────────────────

  plotFn(id: string | null, expr: string, o: StrokeOpts & { domain?: [WgNum, WgNum]; samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-fn', id: id ?? this.s.uid('wg-plot-fn'), expr, domain: o.domain, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotParametric(id: string | null, xExpr: string, yExpr: string, tRange: [WgNum, WgNum], o: StrokeOpts & { samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-parametric', id: id ?? this.s.uid('wg-plot-parametric'), xExpr, yExpr, tRange, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotPolar(id: string | null, rExpr: string, tRange: [WgNum, WgNum], o: StrokeOpts & { samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-polar', id: id ?? this.s.uid('wg-plot-polar'), rExpr, tRange, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotImplicit(id: string | null, expr: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-plot-implicit', id: id ?? this.s.uid('wg-plot-implicit'), expr, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  field(id: string | null, kind: 'vector' | 'slope', exprs: { x?: string; y: string }, o: CommonOpts & { density?: number; color?: Color } = {}) {
    return this.add({ kind: 'wg-field', id: id ?? this.s.uid('wg-field'), field: kind, xExpr: exprs.x, yExpr: exprs.y, density: o.density, color: o.color, opacity: o.opacity, visible: o.visible });
  }

  // ── plot catalog (Phase 4 · Lane A) ─────────────────────────────────────

  plotPiecewise(id: string | null, pieces: { cond: string; expr: string }[], o: StrokeOpts & { domain?: [WgNum, WgNum]; samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-piecewise', id: id ?? this.s.uid('wg-plot-piecewise'), pieces, domain: o.domain, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotInequality(id: string | null, exprs: string[], o: CommonOpts & { cmps?: ('>' | '<' | '>=' | '<=')[]; fill?: Color; gridRes?: number } = {}) {
    return this.add({ kind: 'wg-plot-inequality', id: id ?? this.s.uid('wg-plot-inequality'), exprs, cmps: o.cmps, fill: o.fill, gridRes: o.gridRes, opacity: o.opacity, visible: o.visible });
  }
  plotSequence(id: string | null, expr: string, o: StrokeOpts & PointLikeOpts & { nRange?: [WgNum, WgNum]; cobweb?: boolean; x0?: WgNum; iters?: number } = {}) {
    return this.add({ kind: 'wg-plot-sequence', id: id ?? this.s.uid('wg-plot-sequence'), expr, nRange: o.nRange, cobweb: o.cobweb, x0: o.x0, iters: o.iters, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotSpline(id: string | null, points: WgPoint[], o: StrokeOpts & { spline?: 'catmull' | 'cubic' | 'bspline'; samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-spline', id: id ?? this.s.uid('wg-plot-spline'), points, spline: o.spline, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotTangent(id: string | null, expr: string, at: WgNum, o: StrokeOpts & { domain?: [WgNum, WgNum]; showNormal?: boolean; showDerivatives?: boolean; samples?: number; color?: Color } = {}) {
    return this.add({ kind: 'wg-plot-tangent', id: id ?? this.s.uid('wg-plot-tangent'), expr, at, domain: o.domain, showNormal: o.showNormal, showDerivatives: o.showDerivatives, samples: o.samples, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotAccumulation(id: string | null, expr: string, from: WgNum, o: StrokeOpts & { domain?: [WgNum, WgNum]; samples?: number } = {}) {
    return this.add({ kind: 'wg-plot-accumulation', id: id ?? this.s.uid('wg-plot-accumulation'), expr, from, domain: o.domain, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotRiemann(id: string | null, expr: string, domain: [WgNum, WgNum], n: WgNum, o: StrokeOpts & { mode?: 'left' | 'right' | 'midpoint' | 'trapezoid' | 'simpson'; fill?: Color } = {}) {
    return this.add({ kind: 'wg-plot-riemann', id: id ?? this.s.uid('wg-plot-riemann'), expr, domain, n, mode: o.mode, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  streamlines(id: string | null, xExpr: string, yExpr: string, o: CommonOpts & { density?: number; steps?: number; color?: Color } = {}) {
    return this.add({ kind: 'wg-streamlines', id: id ?? this.s.uid('wg-streamlines'), xExpr, yExpr, density: o.density, steps: o.steps, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  plotOde(id: string | null, yExpr: string, through: WgPoint[], o: StrokeOpts & { xExpr?: string; domain?: [WgNum, WgNum]; h?: number } = {}) {
    return this.add({ kind: 'wg-plot-ode', id: id ?? this.s.uid('wg-plot-ode'), yExpr, xExpr: o.xExpr, through, domain: o.domain, h: o.h, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotBifurcation(id: string | null, expr: string, rRange: [WgNum, WgNum], o: CommonOpts & { iters?: number; transient?: number; rSteps?: number; color?: Color } = {}) {
    return this.add({ kind: 'wg-plot-bifurcation', id: id ?? this.s.uid('wg-plot-bifurcation'), expr, rRange, iters: o.iters, transient: o.transient, rSteps: o.rSteps, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  plotFourier(id: string | null, expr: string, terms: WgNum, o: StrokeOpts & { period?: WgNum; domain?: [WgNum, WgNum]; epicycles?: boolean; samples?: number; color?: Color } = {}) {
    return this.add({ kind: 'wg-plot-fourier', id: id ?? this.s.uid('wg-plot-fourier'), expr, terms, period: o.period, domain: o.domain, epicycles: o.epicycles, samples: o.samples, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  histogram(id: string | null, data: number[], o: StrokeOpts & { method?: 'sturges' | 'fd'; bins?: number; fill?: Color } = {}) {
    return this.add({ kind: 'wg-histogram', id: id ?? this.s.uid('wg-histogram'), data, method: o.method, bins: o.bins, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  boxplot(id: string | null, data: number[], o: StrokeOpts & { variant?: 'box' | 'violin' | 'strip' | 'beeswarm'; at?: WgNum; color?: Color; fill?: Color } = {}) {
    return this.add({ kind: 'wg-boxplot', id: id ?? this.s.uid('wg-boxplot'), data, variant: o.variant, at: o.at, color: o.color, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  plotCells(id: string | null, cell: 'bubble' | 'heatmap' | 'hexbin', o: StrokeOpts & { points?: [number, number][]; sizes?: number[]; matrix?: number[][]; size?: WgNum; fill?: Color } = {}) {
    return this.add({ kind: 'wg-plot-cells', id: id ?? this.s.uid('wg-plot-cells'), cell, points: o.points, sizes: o.sizes, matrix: o.matrix, size: o.size, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  contours(id: string | null, expr: string, o: StrokeOpts & { levels?: number[]; count?: number; filled?: boolean; labels?: boolean; palette?: Color[]; gridRes?: number } = {}) {
    return this.add({ kind: 'wg-contours', id: id ?? this.s.uid('wg-contours'), expr, levels: o.levels, count: o.count, filled: o.filled, labels: o.labels, palette: o.palette, gridRes: o.gridRes, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  regression(id: string | null, points: [number, number][], fit: 'linear' | 'poly' | 'exp' | 'logistic' | 'power', o: StrokeOpts & { degree?: number; showResiduals?: boolean; showBand?: boolean; color?: Color } = {}) {
    return this.add({ kind: 'wg-regression', id: id ?? this.s.uid('wg-regression'), points, fit, degree: o.degree, showResiduals: o.showResiduals, showBand: o.showBand, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  chartFin(id: string | null, chart: 'candle' | 'waterfall' | 'funnel' | 'radar' | 'windrose', o: StrokeOpts & { ohlc?: { x: number; open: number; high: number; low: number; close: number }[]; values?: number[]; labels?: string[]; color?: Color; fill?: Color } = {}) {
    return this.add({ kind: 'wg-chart-fin', id: id ?? this.s.uid('wg-chart-fin'), chart, ohlc: o.ohlc, values: o.values, labels: o.labels, color: o.color, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  chartMulti(id: string | null, chart: 'ternary' | 'parallel' | 'scattermatrix', o: StrokeOpts & { columns?: number[][]; triples?: [number, number, number][]; color?: Color } = {}) {
    return this.add({ kind: 'wg-chart-multi', id: id ?? this.s.uid('wg-chart-multi'), chart, columns: o.columns, triples: o.triples, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }

  // ── Lane B: geometry constraints (Phase 4) ─────────────────────────────

  circumcenter(id: string | null, a: string, b: string, c: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-circumcenter', id: id ?? this.s.uid('wg-circumcenter'), a, b, c, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  incenter(id: string | null, a: string, b: string, c: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-incenter', id: id ?? this.s.uid('wg-incenter'), a, b, c, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  orthocenter(id: string | null, a: string, b: string, c: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-orthocenter', id: id ?? this.s.uid('wg-orthocenter'), a, b, c, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  excenter(id: string | null, a: string, b: string, c: string, which: 'a' | 'b' | 'c', o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-excenter', id: id ?? this.s.uid('wg-excenter'), a, b, c, which, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  eulerLine(id: string | null, a: string, b: string, c: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-euler-line', id: id ?? this.s.uid('wg-euler-line'), a, b, c, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  ninePoint(id: string | null, a: string, b: string, c: string, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-nine-point', id: id ?? this.s.uid('wg-nine-point'), a, b, c, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  perpBisector(id: string | null, a: string, b: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-perp-bisector', id: id ?? this.s.uid('wg-perp-bisector'), a, b, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  angleBisector(id: string | null, a: string, vertex: string, b: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-angle-bisector', id: id ?? this.s.uid('wg-angle-bisector'), a, vertex, b, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  median(id: string | null, vertex: string, a: string, b: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-median', id: id ?? this.s.uid('wg-median'), vertex, a, b, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  altitude(id: string | null, vertex: string, a: string, b: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-altitude', id: id ?? this.s.uid('wg-altitude'), vertex, a, b, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  tangent(id: string | null, circle: string, point: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-tangent', id: id ?? this.s.uid('wg-tangent'), circle, point, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  tangentsFrom(id: string | null, circle: string, point: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-tangents-from', id: id ?? this.s.uid('wg-tangents-from'), circle, point, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  circleDiameter(id: string | null, a: string, b: string, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-circle-diameter', id: id ?? this.s.uid('wg-circle-diameter'), a, b, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  incircle(id: string | null, a: string, b: string, c: string, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-incircle', id: id ?? this.s.uid('wg-incircle'), a, b, c, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  excircle(id: string | null, a: string, b: string, c: string, which: 'a' | 'b' | 'c', o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-excircle', id: id ?? this.s.uid('wg-excircle'), a, b, c, which, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  radicalAxis(id: string | null, c1: string, c2: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-radical-axis', id: id ?? this.s.uid('wg-radical-axis'), c1, c2, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  polarLine(id: string | null, circle: string, point: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-polar-line', id: id ?? this.s.uid('wg-polar-line'), circle, point, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  polePoint(id: string | null, circle: string, line: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-pole-point', id: id ?? this.s.uid('wg-pole-point'), circle, line, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  commonTangents(id: string | null, c1: string, c2: string, o: StrokeOpts = {}) {
    return this.add({ kind: 'wg-common-tangents', id: id ?? this.s.uid('wg-common-tangents'), c1, c2, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  apollonius(id: string | null, c1: string, c2: string, c3: string, o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-apollonius', id: id ?? this.s.uid('wg-apollonius'), c1, c2, c3, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  rotatedPt(id: string | null, p: string, center: string, angle: WgNum, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-rotated-pt', id: id ?? this.s.uid('wg-rotated-pt'), p, center, angle, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  translatedPt(id: string | null, p: string, dx: WgNum, dy: WgNum, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-translated-pt', id: id ?? this.s.uid('wg-translated-pt'), p, dx, dy, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  dilatedPt(id: string | null, p: string, center: string, factor: WgNum, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-dilated-pt', id: id ?? this.s.uid('wg-dilated-pt'), p, center, factor, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  inversion(id: string | null, p: string, circle: string, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-inversion', id: id ?? this.s.uid('wg-inversion'), p, circle, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  mobius(id: string | null, p: string, a: WgNum, b: WgNum, c: WgNum, d: WgNum, o: PointLikeOpts = {}) {
    return this.add({ kind: 'wg-mobius', id: id ?? this.s.uid('wg-mobius'), p, a, b, c, d, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  locus(id: string | null, driver: string, dependent: string, o: StrokeOpts & { samples?: number } = {}) {
    return this.add({ kind: 'wg-locus', id: id ?? this.s.uid('wg-locus'), driver, dependent, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  regularPolygon(id: string | null, center: WgPoint, n: WgNum, radius: WgNum, o: StrokeOpts & { fill?: Color; rot?: WgNum } = {}) {
    return this.add({ kind: 'wg-regular-polygon', id: id ?? this.s.uid('wg-regular-polygon'), center, n, radius, rot: o.rot, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  hLock(id: string | null, p: string, o: PointLikeOpts & { y?: WgNum } = {}) {
    return this.add({ kind: 'wg-h-lock', id: id ?? this.s.uid('wg-h-lock'), p, y: o.y, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  vLock(id: string | null, p: string, o: PointLikeOpts & { x?: WgNum } = {}) {
    return this.add({ kind: 'wg-v-lock', id: id ?? this.s.uid('wg-v-lock'), p, x: o.x, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  gridSnap(id: string | null, p: string, o: PointLikeOpts & { step?: WgNum } = {}) {
    return this.add({ kind: 'wg-grid-snap', id: id ?? this.s.uid('wg-grid-snap'), p, step: o.step, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  angleSnap(id: string | null, p: string, center: string, o: PointLikeOpts & { step?: WgNum } = {}) {
    return this.add({ kind: 'wg-angle-snap', id: id ?? this.s.uid('wg-angle-snap'), p, center, step: o.step, color: o.color, radius: o.radius, label: o.label, opacity: o.opacity, visible: o.visible });
  }
  length(id: string | null, a: string, b: string, o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-length', id: id ?? this.s.uid('wg-length'), a, b, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  slope(id: string | null, line: string, o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-slope', id: id ?? this.s.uid('wg-slope'), line, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  radiusMeasure(id: string | null, circle: string, o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-radius', id: id ?? this.s.uid('wg-radius'), circle, color: o.color, opacity: o.opacity, visible: o.visible });
  }
  area(id: string | null, points: string[], o: CommonOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-area', id: id ?? this.s.uid('wg-area'), points, color: o.color, opacity: o.opacity, visible: o.visible });
  }

  // ── Lane C: stats & probability (Phase 4) ──────────────────────────────

  distribution(id: string | null, dist: string, o: StrokeOpts & { params?: WgNum[]; showCdf?: boolean; domain?: [WgNum, WgNum]; samples?: number } = {}) {
    return this.add({ kind: 'wg-distribution', id: id ?? this.s.uid('wg-distribution'), dist: dist as any, params: o.params, showCdf: o.showCdf, domain: o.domain, samples: o.samples, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  sampling(id: string | null, dist: string, n: WgNum, o: StrokeOpts & PointLikeOpts & { params?: WgNum[]; seed?: number } = {}) {
    return this.add({ kind: 'wg-sampling', id: id ?? this.s.uid('wg-sampling'), dist: dist as any, params: o.params, n, seed: o.seed, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  clt(id: string | null, dist: string, sampleSize: WgNum, o: StrokeOpts & { params?: WgNum[]; trials?: WgNum; seed?: number; fill?: Color } = {}) {
    return this.add({ kind: 'wg-clt', id: id ?? this.s.uid('wg-clt'), dist: dist as any, params: o.params, sampleSize, trials: o.trials, seed: o.seed, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  randomWalk(id: string | null, dims: 1 | 2, steps: WgNum, o: StrokeOpts & { walks?: WgNum; seed?: number; brownian?: boolean; color?: Color } = {}) {
    return this.add({ kind: 'wg-random-walk', id: id ?? this.s.uid('wg-random-walk'), dims, steps, walks: o.walks, seed: o.seed, brownian: o.brownian, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  monteCarlo(id: string | null, method: 'pi' | 'buffon', n: WgNum, o: StrokeOpts & PointLikeOpts & { seed?: number } = {}) {
    return this.add({ kind: 'wg-monte-carlo', id: id ?? this.s.uid('wg-monte-carlo'), method, n, seed: o.seed, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  correlation(id: string | null, o: StrokeOpts & PointLikeOpts & { points?: [number, number][]; anscombe?: 1 | 2 | 3 | 4; showRegression?: boolean } = {}) {
    return this.add({ kind: 'wg-correlation', id: id ?? this.s.uid('wg-correlation'), points: o.points, anscombe: o.anscombe, showRegression: o.showRegression, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  hypothesis(id: string | null, test: 'z' | 't', mu0: WgNum, n: WgNum, o: StrokeOpts & { mu1?: WgNum; sigma?: WgNum; alpha?: WgNum; domain?: [WgNum, WgNum]; fill?: Color } = {}) {
    return this.add({ kind: 'wg-hypothesis', id: id ?? this.s.uid('wg-hypothesis'), test, mu0, mu1: o.mu1, sigma: o.sigma, n, alpha: o.alpha, domain: o.domain, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }

  // ── Lane D: linear algebra (Phase 4) ───────────────────────────────────

  matrixGrid(id: string | null, entries: [WgNum, WgNum, WgNum, WgNum], o: StrokeOpts & { extent?: WgNum; gridStep?: number } = {}) {
    return this.add({ kind: 'wg-matrix-grid', id: id ?? this.s.uid('wg-matrix-grid'), entries, extent: o.extent, gridStep: o.gridStep, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  determinant(id: string | null, entries: [WgNum, WgNum, WgNum, WgNum], o: StrokeOpts & { fill?: Color } = {}) {
    return this.add({ kind: 'wg-determinant', id: id ?? this.s.uid('wg-determinant'), entries, fill: o.fill, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  eigenvectors(id: string | null, entries: [WgNum, WgNum, WgNum, WgNum], o: StrokeOpts & { extent?: WgNum; color?: Color } = {}) {
    return this.add({ kind: 'wg-eigenvectors', id: id ?? this.s.uid('wg-eigenvectors'), entries, extent: o.extent, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  matrixCompose(id: string | null, a: [WgNum, WgNum, WgNum, WgNum], b: [WgNum, WgNum, WgNum, WgNum], o: StrokeOpts & { extent?: WgNum } = {}) {
    return this.add({ kind: 'wg-matrix-compose', id: id ?? this.s.uid('wg-matrix-compose'), a, b, extent: o.extent, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  dotProduct(id: string | null, u: [WgNum, WgNum], v: [WgNum, WgNum], o: StrokeOpts & { color?: Color } = {}) {
    return this.add({ kind: 'wg-dot-product', id: id ?? this.s.uid('wg-dot-product'), u, v, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  svd(id: string | null, entries: [WgNum, WgNum, WgNum, WgNum], o: StrokeOpts & { extent?: WgNum } = {}) {
    return this.add({ kind: 'wg-svd', id: id ?? this.s.uid('wg-svd'), entries, extent: o.extent, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }

  // ── Lane E: graph theory (Phase 4) ─────────────────────────────────────

  graph(id: string | null, graph: string, o: StrokeOpts & PointLikeOpts & { n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; layout?: 'force' | 'circular' } = {}) {
    return this.add({ kind: 'wg-graph', id: id ?? this.s.uid('wg-graph'), graph: graph as any, n: o.n, m: o.m, p: o.p, seed: o.seed, layout: o.layout, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  traversal(id: string | null, graph: string, algo: 'bfs' | 'dfs', o: StrokeOpts & PointLikeOpts & { n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; start?: WgNum; layout?: 'force' | 'circular' } = {}) {
    return this.add({ kind: 'wg-traversal', id: id ?? this.s.uid('wg-traversal'), graph: graph as any, n: o.n, m: o.m, p: o.p, seed: o.seed, layout: o.layout, algo, start: o.start, color: o.color, radius: o.radius, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  shortestPath(id: string | null, graph: string, o: StrokeOpts & { n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; from?: WgNum; to?: WgNum; color?: Color; layout?: 'force' | 'circular' } = {}) {
    return this.add({ kind: 'wg-shortest-path', id: id ?? this.s.uid('wg-shortest-path'), graph: graph as any, n: o.n, m: o.m, p: o.p, seed: o.seed, layout: o.layout, from: o.from, to: o.to, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  mst(id: string | null, graph: string, algo: 'kruskal' | 'prim', o: StrokeOpts & { n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; color?: Color; layout?: 'force' | 'circular' } = {}) {
    return this.add({ kind: 'wg-mst', id: id ?? this.s.uid('wg-mst'), graph: graph as any, n: o.n, m: o.m, p: o.p, seed: o.seed, layout: o.layout, algo, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
  eulerian(id: string | null, graph: string, mode: 'circuit' | 'path', o: StrokeOpts & { n?: WgNum; m?: WgNum; p?: WgNum; seed?: number; color?: Color; layout?: 'force' | 'circular' } = {}) {
    return this.add({ kind: 'wg-eulerian', id: id ?? this.s.uid('wg-eulerian'), graph: graph as any, n: o.n, m: o.m, p: o.p, seed: o.seed, layout: o.layout, mode, color: o.color, stroke: o.stroke, opacity: o.opacity, visible: o.visible });
  }
}
