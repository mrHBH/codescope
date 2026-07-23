// ── Island: loss-contour ─────────────────────────────────────────────────────
// A top-down map of the loss landscape L(w₁,w₂): a viridis heat field with
// marching-squares contour rings, the global minimum marked, and the gradient
// -descent path drawn as a trail "seen from above". This is the flat map the
// true-3D mesh chapter later lifts off the ground — same function, two views.

import { registerIsland, type IslandDef } from '../registry';
import { colormap } from '../../../windgraph/space3d/project3d';
import { loop01, clamp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
};

const G = 44;
const D0 = -5, D1 = 5;
const PX0 = 70, PX1 = 510, PY0 = 70, PY1 = 510;
function L(x: number, y: number): number {
  return 0.055 * (x * x + y * y)
    + 0.85 * Math.sin(1.1 * x) * Math.cos(1.1 * y)
    + 0.35 * Math.cos(2.2 * x) * Math.sin(1.6 * y);
}
function grad(x: number, y: number): [number, number] {
  const h = 0.02;
  return [(L(x + h, y) - L(x - h, y)) / (2 * h), (L(x, y + h) - L(x, y - h)) / (2 * h)];
}
const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Precompute the value grid + normalisation.
const VAL: number[] = new Array((G + 1) * (G + 1));
let vMin = Infinity, vMax = -Infinity;
for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
  const v = L(D0 + (D1 - D0) * i / G, D0 + (D1 - D0) * j / G);
  VAL[j * (G + 1) + i] = v; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
}
const vSpan = Math.max(vMax - vMin, 1e-6);
const val = (i: number, j: number) => VAL[j * (G + 1) + i];
const px = (x: number) => PX0 + ((x - D0) / (D1 - D0)) * (PX1 - PX0);
const py = (y: number) => PY1 - ((y - D0) / (D1 - D0)) * (PY1 - PY0); // w₂ up

// Descent path (top-down).
const PATH: [number, number][] = (() => {
  const p: [number, number][] = []; let x = 3.9, y = -3.4; p.push([x, y]);
  for (let k = 0; k < 70; k++) {
    const [gx, gy] = grad(x, y);
    x = clampN(x - 0.09 * gx, D0, D1); y = clampN(y - 0.09 * gy, D0, D1);
    p.push([x, y]);
  }
  return p;
})();
const MIN = PATH[PATH.length - 1];

// Marching-squares edge segments per case (edges: 0 top, 1 right, 2 bottom, 3 left).
const SEG: number[][][] = [
  [], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 2], [1, 0]], [[0, 2]], [[3, 2]],
  [[2, 3]], [[2, 0]], [[0, 3], [2, 1]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], [],
];
function edgePt(edge: number, i: number, j: number, lv: number): [number, number] {
  const x0 = D0 + (D1 - D0) * i / G, x1 = D0 + (D1 - D0) * (i + 1) / G;
  const y0 = D0 + (D1 - D0) * j / G, y1 = D0 + (D1 - D0) * (j + 1) / G;
  const v00 = val(i, j), v10 = val(i + 1, j), v11 = val(i + 1, j + 1), v01 = val(i, j + 1);
  const lerp = (a: number, b: number, va: number, vb: number) => a + (b - a) * ((lv - va) / (vb - va || 1e-9));
  if (edge === 0) return [lerp(x0, x1, v00, v10), y0];
  if (edge === 1) return [x1, lerp(y0, y1, v10, v11)];
  if (edge === 2) return [lerp(x1, x0, v11, v01), y1];
  return [x0, lerp(y1, y0, v01, v00)];
}

const island: IslandDef = {
  id: 'loss-contour',
  title: 'Loss contour map',
  kind: 'visual',
  params: { showPath: { kind: 'boolean', label: 'Descent path', default: true } },
  defaultSize: [560, 560],
  emit(ctx, params, time) {
    const a = time.alpha;

    // Heat field.
    const cw = (PX1 - PX0) / G, ch = (PY1 - PY0) / G;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const v = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4;
      const cm = colormap((v - vMin) / vSpan);
      ctx.draw.rect(PX0 + i * cw, PY0 + j * ch, PX0 + (i + 1) * cw, PY0 + (j + 1) * ch, [cm[0], cm[1], cm[2], 1], 0.9 * a);
    }

    // Contour rings.
    const levels = [0.12, 0.26, 0.4, 0.54, 0.68, 0.82, 0.93];
    for (const lf of levels) {
      const lv = vMin + lf * vSpan;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const v00 = val(i, j), v10 = val(i + 1, j), v11 = val(i + 1, j + 1), v01 = val(i, j + 1);
        const cs = (v00 >= lv ? 1 : 0) | (v10 >= lv ? 2 : 0) | (v11 >= lv ? 4 : 0) | (v01 >= lv ? 8 : 0);
        for (const [e0, e1] of SEG[cs]) {
          const p0 = edgePt(e0, i, j, lv), p1 = edgePt(e1, i, j, lv);
          ctx.draw.line([[px(p0[0]), py(p0[1])], [px(p1[0]), py(p1[1])]], [0.92, 0.94, 0.98, 1], 1.4, 0.5 * a);
        }
      }
    }

    // Frame + axis labels.
    ctx.draw.rectStroke(PX0, PY0, PX1, PY1, C.border, 1.6, 0.9 * a);
    ctx.draw.text('w₁', (PX0 + PX1) / 2, PY1 + 26, 17, C.dim, 0.9 * a, 'middle');
    ctx.draw.text('w₂', PX0 - 34, (PY0 + PY1) / 2, 17, C.dim, 0.9 * a, 'middle');
    ctx.draw.text('L(w₁,w₂) — every point is an error', PX0, PY0 - 22, 16, C.body, 0.9 * a);

    if (params.showPath) {
      const proj = PATH.map(([x, y]) => [px(x), py(y)] as [number, number]);
      const t = loop01(time.now, 9);
      const head = Math.min(PATH.length - 1, Math.floor(t * PATH.length));
      ctx.draw.line(proj.slice(0, head + 1), C.gold, 3.5, 0.9 * a);
      ctx.draw.fillCircle(proj[0][0], proj[0][1], 6, C.cyan, a);
      ctx.draw.fillCircle(proj[head][0], proj[head][1], 8, C.gold, a);
      ctx.draw.strokeCircle(proj[head][0], proj[head][1], 13, C.gold, 2, 0.6 * a);
    }

    // Global minimum marker.
    ctx.draw.strokeCircle(px(MIN[0]), py(MIN[1]), 11, [0.99, 0.9, 0.5, 1], 2.5, 0.9 * a);
    ctx.draw.text('min', px(MIN[0]) + 15, py(MIN[1]) + 5, 14, [0.99, 0.9, 0.5, 1], 0.9 * a);
  },
};
registerIsland(island);
