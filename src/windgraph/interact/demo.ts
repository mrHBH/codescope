// ── windgraph · Phase-5 interactivity demo ───────────────────────────────────
// A draggable triangle with a live reactive dependency graph: drag any vertex
// and the centroid, circumcircle, circumcenter, median, an angle arc, a glider
// on the circumcircle, and the edge-length readouts all recompute and redraw in
// the same frame — JSXGraph's core value, rendered analytically (crisp at any
// zoom). Lives in world space so the camera gives pan/zoom for free.

import { strokeInto, strokeQuadPath, fillQuads, circleQuads, arcQuads, polygonQuads, type Pt } from '../stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';
import type { PlaneView } from '../coords/numberPlane';
import { ConstraintGraph } from './graph';
import { GPoint, Midpoint, Centroid, Circumcircle, Angle, Distance, Glider } from './constraints';
import { DragController } from './drag';

const INK = [0.90, 0.92, 0.98, 1];
const DIM = [0.60, 0.64, 0.74, 1];
const BLUE = [0.36, 0.62, 0.98, 1];
const GOLD = [0.92, 0.74, 0.42, 1];
const GREEN = [0.40, 0.82, 0.52, 1];
const TEAL = [0.30, 0.82, 0.72, 1];
const PURPLE = [0.74, 0.50, 0.94, 1];
const GRID = 60; // world px per grid unit (edge-length readouts use this)

export class InteractDemo {
  x0 = 0;
  y0 = 0;
  width = 1120;
  height = 780;

  private graph = new ConstraintGraph();
  private drag = new DragController(() => this.graph.update());
  private A!: GPoint; private B!: GPoint; private C!: GPoint;
  private centroid!: Centroid;
  private circum!: Circumcircle;
  private midBC!: Midpoint;
  private angleA!: Angle;
  private distBC!: Distance;
  private glider!: Glider;
  private built = false;

  private build() {
    const cx = this.x0 + this.width / 2, cy = this.y0 + this.height / 2;
    this.A = new GPoint(cx - 210, cy + 150);
    this.B = new GPoint(cx + 230, cy + 190);
    this.C = new GPoint(cx + 40, cy - 210);
    const g = this.graph;
    g.add(this.A); g.add(this.B); g.add(this.C);

    // Derived constructions (order doesn't matter — graph sorts topologically).
    this.centroid = g.add(new Centroid([this.A, this.B, this.C]));
    this.circum = g.add(new Circumcircle(this.A, this.B, this.C));
    this.midBC = g.add(new Midpoint(this.B, this.C));
    this.angleA = g.add(new Angle(this.B, this.A, this.C));
    this.distBC = g.add(new Distance(this.B, this.C));
    // A glider constrained to ride the circumcircle (drag it around the ring).
    this.glider = g.add(new Glider(this.circum, -Math.PI / 2));

    g.update();
    // Draggable handles: the three free vertices + the glider.
    this.drag.register(this.A, this.B, this.C, this.glider);
    this.built = true;
  }

  private ensure() { if (!this.built) this.build(); }

  // ── interaction hooks (called from input.ts / frame.ts) ───────────────────
  tryBeginDrag(wx: number, wy: number, scale: number): boolean { this.ensure(); return this.drag.begin(wx, wy, scale); }
  dragTo(wx: number, wy: number): void { this.drag.drag(wx, wy); }
  endDrag(): void { this.drag.end(); }
  get dragging(): boolean { return this.drag.dragging; }
  updateHover(wx: number, wy: number, scale: number): boolean {
    this.ensure();
    if (wx < this.x0 - 40 || wx > this.x0 + this.width + 40 || wy < this.y0 - 40 || wy > this.y0 + this.height + 40) { this.drag.hover = null; return false; }
    return this.drag.updateHover(wx, wy, scale);
  }

  // Auto-drive a vertex on a smooth continuous path (for the cinematic flight),
  // so the reactive graph visibly recomputes without a user. Uses wall-clock so
  // it never jumps when the camera revisits the board.
  private baseB: [number, number] | null = null;
  autoDrive(): void {
    this.ensure();
    if (this.drag.dragging) return; // a real drag wins
    if (!this.baseB) this.baseB = [this.B.x, this.B.y];
    const t = performance.now() / 1000;
    const r = 90;
    this.B.set(this.baseB[0] + Math.cos(t * 0.8) * r, this.baseB[1] + Math.sin(t * 1.25) * r * 0.6);
    this.graph.update();
    this.drag.hover = this.B; // show the handle ring during the auto-demo
  }

  // ── render ─────────────────────────────────────────────────────────────
  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, view: PlaneView) {
    this.ensure();
    const px = 1 / Math.max(view.zoom, 1e-9); // ~1 screen-px in world units
    const table = atlas.table;

    // Backdrop grid.
    const gcol = [1, 1, 1, 0.06];
    for (let x = this.x0; x <= this.x0 + this.width + 1; x += GRID) strokeInto([[x, this.y0], [x, this.y0 + this.height]], { width: px }, gcol, inst, crv, rws);
    for (let y = this.y0; y <= this.y0 + this.height + 1; y += GRID) strokeInto([[this.x0, y], [this.x0 + this.width, y]], { width: px }, gcol, inst, crv, rws);

    const A = this.A, B = this.B, C = this.C;
    const P = (p: GPoint): Pt => [p.x, p.y];

    // Triangle fill + edges.
    fillQuads(polygonQuads([P(A), P(B), P(C)], true), [BLUE[0], BLUE[1], BLUE[2], 0.10], inst, crv, rws);
    strokeInto([P(A), P(B), P(C), P(A)], { width: 3.5, join: 'round', cap: 'round' }, INK, inst, crv, rws);

    // Median A → midpoint(BC) (dashed).
    strokeInto([P(A), [this.midBC.x, this.midBC.y]], { width: 2, dash: [10, 8] }, DIM, inst, crv, rws);

    // Circumcircle + circumcenter.
    if (this.circum.ok && this.circum.r > 0 && this.circum.r < 1e5) {
      const q: number[] = [];
      const segs = Math.max(24, Math.min(160, Math.round(this.circum.r / 6)));
      strokeQuadPath(circleQuads(this.circum.cx, this.circum.cy, this.circum.r, segs), { width: 3 }, true, q);
      fillQuads(q, GOLD, inst, crv, rws);
      this.dot(inst, crv, rws, this.circum.cx, this.circum.cy, 5, GOLD);
    }

    // Angle arc at A.
    {
      const arcR = 46;
      const q: number[] = [];
      strokeQuadPath(arcQuads(A.x, A.y, arcR, this.angleA.a0, this.angleA.a1), { width: 3 }, false, q);
      fillQuads(q, GREEN, inst, crv, rws);
      const mid = (this.angleA.a0 + this.angleA.a1) / 2;
      const deg = (this.angleA.value * 180 / Math.PI).toFixed(0) + '\u00b0';
      const lx = A.x + Math.cos(mid) * (arcR + 22), ly = A.y + Math.sin(mid) * (arcR + 22);
      layoutStr(inst, deg, GREEN, table, font, { x: lx - tw(deg, font, 22) / 2, y: ly - 11, size: 22 });
    }

    // Centroid + midpoint + glider dots.
    this.dot(inst, crv, rws, this.centroid.x, this.centroid.y, 6, TEAL);
    this.dot(inst, crv, rws, this.midBC.x, this.midBC.y, 4, DIM);
    this.dot(inst, crv, rws, this.glider.x, this.glider.y, 7, PURPLE);

    // Vertices (draw last so they sit on top), with hover/drag ring.
    for (const [p, name] of [[A, 'A'], [B, 'B'], [C, 'C']] as [GPoint, string][]) {
      if (this.drag.hover === p) this.ring(inst, crv, rws, p.x, p.y, 14, px, INK);
      this.dot(inst, crv, rws, p.x, p.y, 8, INK);
      layoutStr(inst, name, INK, table, font, { x: p.x + 16, y: p.y - 26, size: 26 });
    }
    if (this.drag.hover === this.glider) this.ring(inst, crv, rws, this.glider.x, this.glider.y, 13, px, PURPLE);

    // Labels: centroid + edge-length readout + glider param.
    layoutStr(inst, 'G', TEAL, table, font, { x: this.centroid.x + 12, y: this.centroid.y - 4, size: 20 });
    {
      const d = (this.distBC.value / GRID).toFixed(2);
      const mx = (B.x + C.x) / 2, my = (B.y + C.y) / 2;
      const s = `|BC| = ${d}`;
      layoutStr(inst, s, DIM, table, font, { x: mx + 14, y: my - 10, size: 18 });
    }

    // Title + hint.
    layoutStr(inst, 'Interactive: drag a vertex (or the purple glider)', INK, table, font, { x: this.x0 + 40, y: this.y0 - 10, size: 30 });
    layoutStr(inst, 'reactive dependency graph . centroid . circumcircle . angle . live recompute', DIM, table, font, { x: this.x0 + 40, y: this.y0 + 28, size: 15 });
  }

  private dot(inst: number[], crv: number[], rws: number[], x: number, y: number, r: number, color: number[]) {
    fillQuads(circleQuads(x, y, r, 20), color, inst, crv, rws);
  }
  private ring(inst: number[], crv: number[], rws: number[], x: number, y: number, r: number, px: number, color: number[]) {
    const q: number[] = [];
    strokeQuadPath(circleQuads(x, y, r, 24), { width: Math.max(2, px * 2) }, true, q);
    fillQuads(q, [color[0], color[1], color[2], 0.9], inst, crv, rws);
  }
}
