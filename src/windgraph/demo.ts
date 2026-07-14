// ── windgraph · Phase 0+1 demo scene ─────────────────────────────────────────
// A world-space board exercising the stroke engine (caps/joins/curves/dashes)
// AND the Mobject primitives (a labeled triangle with its incircle + vectors).
// Lives in world space so the camera gives pan/zoom/infinite-zoom for free.
// Frame it with the 📈 toolbar button.

import { strokeInto, strokeQuadPath, fillQuads, circleQuads, type Pt } from './stroke/stroke';
import { Group, type RenderCtx } from './mobject/mobject';
import { Polygon, Circle, Dot, Label, Vector } from './mobject/primitives';
import type { FontFace } from '../windfoil/font';

const INK = [0.90, 0.92, 0.98, 1];
const BLUE = [0.30, 0.60, 0.98, 1];
const RED = [0.92, 0.34, 0.34, 1];
const GREEN = [0.34, 0.82, 0.48, 1];
const GOLD = [0.86, 0.71, 0.48, 1];

function dist(a: Pt, b: Pt): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

export class WindgraphDemo {
  x0 = 0;
  y0 = 0;
  width = 1500;
  height = 2050;
  private scene: Group | null = null;

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

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number) {
    const ox = this.x0, oy = this.y0;
    const grid = [1, 1, 1, 0.07];
    const ink = INK, blue = BLUE, red = RED, green = GREEN, gold = GOLD;

    // Thin grid — the infinite-zoom sharpness test.
    for (let gx = 0; gx <= this.width + 1; gx += 100) strokeInto([[ox + gx, oy], [ox + gx, oy + this.height]], { width: 1 }, grid, inst, crv, rws);
    for (let gy = 0; gy <= this.height + 1; gy += 100) strokeInto([[ox, oy + gy], [ox + this.width, oy + gy]], { width: 1 }, grid, inst, crv, rws);

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

    // ── Phase 1: Mobject geometry scene (below the stroke samples) ──────────
    if (!this.scene) this.scene = this.buildScene();
    this.scene.position = [ox, oy + 1320];
    const ctx: RenderCtx = { font, atlas, inst, crv, rws };
    this.scene.emit(ctx);
  }
}
