// ── windgraph · Phase 0+1+2+3 demo scene ─────────────────────────────────────
// Exercises all finished phases: stroke engine, primitives, coordinate system,
// function plotting, data series, implicit contours, vector fields, and more.
// Lives in world space so the camera gives pan/zoom/infinite-zoom for free.
// Frame it with the 📈 toolbar button.

import { strokeInto, strokeQuadPath, fillQuads, circleQuads, type Pt } from './stroke/stroke';
import { Group, type RenderCtx } from './mobject/mobject';
import { Polygon, Circle, Dot, Label, Vector } from './mobject/primitives';
import { NumberPlane, type PlaneView } from './coords/numberPlane';
import { plotFunction, areaUnder, scatter, bars, stepSeries, errorBars, riemannRectangles, plotImplicit, plotVectorField, plotSlopeField } from './plot/plot';
import type { FontFace } from '../windfoil/font';

const INK = [0.90, 0.92, 0.98, 1];
const BLUE = [0.30, 0.60, 0.98, 1];
const RED = [0.92, 0.34, 0.34, 1];
const GREEN = [0.34, 0.82, 0.48, 1];
const GOLD = [0.86, 0.71, 0.48, 1];
const TEAL = [0.24, 0.76, 0.70, 1];
const PURPLE = [0.72, 0.44, 0.92, 1];

function dist(a: Pt, b: Pt): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

export class WindgraphDemo {
  x0 = 0;
  y0 = 0;
  width = 2500;
  height = 10300;
  private scene: Group | null = null;
  private plane1 = new NumberPlane();
  private plane2 = new NumberPlane();
  private plane3 = new NumberPlane();
  private plane4 = new NumberPlane();

  private buildScene(): Group {
    const g = new Group();
    // A triangle (scene-local coords).
    const A: Pt = [140, 300], B: Pt = [660, 380], C: Pt = [400, 40];
    g.add(new Polygon([A, B, C], { color: INK, width: 4 }, { color: [0.30, 0.60, 0.98, 0.12] }));

    // Its incircle (a real geometry construction).
    const la = dist(B, C), lb = dist(C, A), lc = dist(A, B);
    const per = la + lb + lc;
    const inc: Pt = [(la * A[0] + lb * B[0] + lc * C[0]) / per, (la * A[1] + lb * B[1] + lc * C[1]) / per];
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
    const r = area / (per / 2);
    g.add(new Circle(inc[0], inc[1], r, { color: GOLD, width: 3 }));
    g.add(new Dot(inc[0], inc[1], 5, GOLD));

    // Vertices + labels.
    for (const [p, name] of [[A, 'A'], [B, 'B'], [C, 'C']] as [Pt, string][]) {
      g.add(new Dot(p[0], p[1], 7, INK));
      g.add(new Label(name, p[0] + 16, p[1] - 12, 30, INK));
    }

    // Vectors from A along two edges.
    g.add(new Vector(A, B, { color: RED, width: 3 }));
    g.add(new Vector(A, C, { color: GREEN, width: 3 }));
    return g;
  }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, view: PlaneView, camX?: number, camY?: number) {
    const ox = this.x0, oy = this.y0;
    const grid = [1, 1, 1, 0.07];
    const ink = INK, blue = BLUE, red = RED, green = GREEN, gold = GOLD;

    // Thin grid only for the stroke showcase so math planes don't get a second overlaid grid.
    const strokeGridTop = oy;
    const strokeGridBottom = oy + 1300;
    for (let gx = 0; gx <= this.width + 1; gx += 100) strokeInto([[ox + gx, strokeGridTop], [ox + gx, strokeGridBottom]], { width: 1 }, grid, inst, crv, rws);
    for (let gy = strokeGridTop; gy <= strokeGridBottom + 1; gy += 100) strokeInto([[ox, gy], [ox + this.width, gy]], { width: 1 }, grid, inst, crv, rws);

    // ── Phase 0: Stroke engine samples ────────────────────────────────────
    // Caps — three thick horizontal strokes.
    const cy = oy + 140;
    strokeInto([[ox + 100, cy], [ox + 400, cy]], { width: 44, cap: 'butt' }, blue, inst, crv, rws);
    strokeInto([[ox + 560, cy], [ox + 860, cy]], { width: 44, cap: 'round' }, blue, inst, crv, rws);
    strokeInto([[ox + 1020, cy], [ox + 1320, cy]], { width: 44, cap: 'square' }, blue, inst, crv, rws);

    // Joins — three zig-zags.
    const zig = (sx: number, join: 'miter' | 'round' | 'bevel', color: number[]) => {
      const p: Pt[] = [[ox + sx, oy + 470], [ox + sx + 130, oy + 330], [ox + sx + 260, oy + 470], [ox + sx + 390, oy + 330]];
      strokeInto(p, { width: 34, join, cap: 'butt' }, color, inst, crv, rws);
    };
    zig(80, 'miter', red);
    zig(560, 'round', green);
    zig(1040, 'bevel', gold);

    // Curved stroking — a stroked ring (closed Bézier path).
    { const q: number[] = []; strokeQuadPath(circleQuads(ox + 380, oy + 850, 190, 8), { width: 26 }, true, q); fillQuads(q, gold, inst, crv, rws); }

    // A smooth stroked S-curve (two quadratic pieces).
    {
      const q: number[] = [];
      const sx = ox + 760, sy = oy + 850;
      const path = [
        sx, sy - 150, sx + 200, sy - 260, sx + 260, sy,        // quad piece 1
        sx + 260, sy, sx + 320, sy + 260, sx + 520, sy + 150,   // quad piece 2
      ];
      strokeQuadPath(path, { width: 22, cap: 'round' }, false, q);
      fillQuads(q, blue, inst, crv, rws);
    }

    // Dashed line.
    strokeInto([[ox + 760, oy + 1080], [ox + 1360, oy + 1080]], { width: 7, dash: [46, 26] }, ink, inst, crv, rws);

    // ── Phase 1: Mobject geometry scene ──────────────────────────────────
    if (!this.scene) this.scene = this.buildScene();
    this.scene.position = [ox, oy + 1700];
    const ctx: RenderCtx = { font, atlas, inst, crv, rws };
    this.scene.emit(ctx);

    // ── Phase 2/3: Plane 1 — function + data plotting ─────────────────────
    const p1 = this.plane1;
    p1.worldX0 = ox + 100; p1.worldY0 = oy + 3600;
    p1.unitX = 100; p1.unitY = 100;
    p1.xMin = -4; p1.xMax = 6; p1.yMin = -3; p1.yMax = 4;
    const pctx1 = { font, atlas, inst, crv, rws };
    p1.render(pctx1, view);

    // y = sin(x) * 2.4 with area fill
    areaUnder((x) => Math.sin(x) * 2.4, p1, view, pctx1, [0.30, 0.60, 0.98, 0.14]);
    plotFunction((x) => Math.sin(x) * 2.4, p1, view, pctx1, { color: blue, widthPx: 3 });
    // y = 0.16 x² - 2.6
    plotFunction((x) => 0.16 * x * x - 2.6, p1, view, pctx1, { color: red, widthPx: 3 });
    // Riemann rectangles for sin(x) (midpoint)
    riemannRectangles((x) => Math.sin(x) * 2.4 + 1, -3, 5, 8, p1, pctx1, [0.86, 0.71, 0.48, 0.18], 0, 'midpoint');
    plotFunction((x) => Math.sin(x) * 2.4 + 1, p1, view, pctx1, { color: gold, widthPx: 2 });
    // Scatter + error bars
    const data: Pt[] = [[-2, 1.5], [0, -0.8], [2, 1.2], [4, -1.8]];
    scatter(data, p1, view, pctx1, TEAL, 5);
    errorBars(data.map(([dx, dy]) => ({ dx, dy, errY: 0.4, errX: 0.2 })), p1, view, pctx1, TEAL, 5, 1.5);

    // ── Phase 3: Plane 2 — implicit contour + vector field + slope field ──
    const p2 = this.plane2;
    p2.worldX0 = ox + 1400; p2.worldY0 = oy + 3600;
    p2.unitX = 90; p2.unitY = 90;
    p2.xMin = -5; p2.xMax = 5; p2.yMin = -4; p2.yMax = 4;
    const pctx2 = { font, atlas, inst, crv, rws };
    p2.render(pctx2, view);

    // Implicit: circle x² + y² = 16  (→ circle radius 4)
    plotImplicit((x, y) => x * x + y * y - 16, p2, view, pctx2, { color: gold, widthPx: 3, level: 0, gridRes: 0.4 });
    // Implicit: x²/9 - y²/4 = 1 (hyperbola)
    plotImplicit((x, y) => x * x / 9 - y * y / 4 - 1, p2, view, pctx2, { color: PURPLE, widthPx: 2, level: 0, gridRes: 0.5 });

    // ── Phase 3: Plane 3 — vector field only (own row) ────────────────────
    const p3 = this.plane3;
    p3.worldX0 = ox + 1400; p3.worldY0 = oy + 7000;
    p3.unitX = 90; p3.unitY = 90;
    p3.xMin = -5; p3.xMax = 5; p3.yMin = -4; p3.yMax = 4;
    const pctx3 = { font, atlas, inst, crv, rws };
    p3.render(pctx3, view);
    // Vector field V(x,y) = (-y, x)  (rotational) — fixed grid, view-independent
    plotVectorField((x, y) => [-y, x], p3, view, pctx3, { color: [0.3, 0.8, 0.5, 0.3], gridRes: 0.7, headLength: 0, fixedGrid: true });

    // ── Phase 3: Plane 4 — slope field only (separate row) ────────────────
    const p4 = this.plane4;
    p4.worldX0 = ox + 1400; p4.worldY0 = oy + 8350;
    p4.unitX = 90; p4.unitY = 90;
    p4.xMin = -5; p4.xMax = 5; p4.yMin = -4; p4.yMax = 4;
    const pctx4 = { font, atlas, inst, crv, rws };
    p4.render(pctx4, view);
    // Slope field y' = -x / y (shows circles) — fixed grid, view-independent
    plotSlopeField((x, y) => -x / (y + 0.1), p4, view, pctx4, { color: [0.6, 0.4, 0.9, 0.25], gridRes: 0.7, fixedGrid: true });

    // ── Phase 3: data series demos ────────────────────────────────────────
    // Step series + bar chart below Plane 1 using the formal data API
    const barData: Pt[] = [[0, 3], [1, 5], [2, 4], [3, 7], [4, 2], [5, 6]];
    const dataPlane = new NumberPlane();
    dataPlane.worldX0 = ox + 100; dataPlane.worldY0 = oy + 5400;
    dataPlane.unitX = 60; dataPlane.unitY = 30;
    dataPlane.xMin = -1; dataPlane.xMax = 7; dataPlane.yMin = -1; dataPlane.yMax = 8;
    const dataCtx = { font, atlas, inst, crv, rws };
    dataPlane.render(dataCtx, view);
    stepSeries(barData, dataPlane, view, dataCtx, { color: BLUE, widthPx: 3 });
    bars(barData, dataPlane, dataCtx, TEAL, 0.6);
    scatter(barData, dataPlane, view, dataCtx, PURPLE, 4);
  }
}
