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
}
