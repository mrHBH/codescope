// ── Island: line-fit ─────────────────────────────────────────────────────────
// A line y = w·x + b fitted to noisy data BY gradient descent on (w, b): the line
// visibly improves step by step, residuals shrink, and the loss readout falls.
// Makes "learning = minimising error" concrete before the landscape generalises it.

import { registerIsland, type IslandDef } from '../registry';
import { loop01, clamp01 } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], accent: [0.12, 0.60, 0.95, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
  green: [0.30, 0.80, 0.40, 1], rose: [0.93, 0.36, 0.34, 1], ink: [0.85, 0.87, 0.91, 1],
};

const X0 = 60, X1 = 420, Y0 = 460, Y1 = 60;
const DX0 = 0, DX1 = 10, DY0 = 0, DY1 = 18;
const px = (x: number) => X0 + ((x - DX0) / (DX1 - DX0)) * (X1 - X0);
const py = (y: number) => Y0 - ((y - DY0) / (DY1 - DY0)) * (Y0 - Y1);

const NOISE = [0.9, -1.4, 0.4, 1.8, -0.6, 0.2, -1.1, 1.3, -0.3, 0.7, -1.7, 0.5];
const DATA: [number, number][] = NOISE.map((n, i) => {
  const x = 0.6 + (i / (NOISE.length - 1)) * 8.8;
  return [x, 1.2 * x + 3 + n];
});

// Centre the inputs so slope and intercept decouple — this makes gradient
// descent well-conditioned (the raw normal equations diverge at any reasonable
// step size because x² dominates). We descend in (w, bc) on centred data and
// convert each step back to the original (w, b) for drawing.
const meanX = DATA.reduce((s, d) => s + d[0], 0) / DATA.length;
const meanY = DATA.reduce((s, d) => s + d[1], 0) / DATA.length;
const CDATA = DATA.map(([x, y]) => [x - meanX, y - meanY]);

function loss(w: number, b: number): number {
  let s = 0; for (const [x, y] of DATA) { const e = w * x + b - y; s += e * e; } return s / DATA.length;
}

const PATH: [number, number][] = (() => {
  const p: [number, number][] = [];
  let w = 0.15, bc = 9.5 - meanY + 0.15 * meanX; // centred intercept for the bad start
  const lr = 0.06;
  for (let k = 0; k < 80; k++) {
    const b = bc + meanY - w * meanX;
    p.push([w, b]);
    let gw = 0, gbc = 0;
    for (const [xc, yc] of CDATA) { const e = w * xc + bc - yc; gw += 2 * e * xc; gbc += 2 * e; }
    gw /= CDATA.length; gbc /= CDATA.length;
    w -= lr * gw; bc -= lr * gbc;
  }
  p.push([w, bc + meanY - w * meanX]);
  return p;
})();

const island: IslandDef = {
  id: 'line-fit',
  title: 'Fitting a line',
  kind: 'visual',
  params: {},
  defaultSize: [470, 540],
  emit(ctx, params, time) {
    const a = time.alpha;
    ctx.draw.line([[X0, Y0], [X1, Y0]], C.dim, 1.6, 0.7 * a);
    ctx.draw.line([[X0, Y0], [X0, Y1]], C.dim, 1.6, 0.7 * a);
    ctx.draw.text('y', X0 + 6, Y1 - 2, 16, C.dim, 0.9 * a);
    ctx.draw.text('x', X1 - 14, Y0 + 22, 16, C.dim, 0.9 * a);

    const t = loop01(time.now, 8);
    const e = clamp01(t * 1.6);
    const idx = Math.min(PATH.length - 1, Math.floor(e * (PATH.length - 1)));
    const [w, b] = PATH[idx];

    for (const [dx, dy] of DATA) {
      const pred = w * dx + b;
      ctx.draw.line([[px(dx), py(dy)], [px(dx), py(pred)]], C.rose, 2, 0.55 * a);
      ctx.draw.fillCircle(px(dx), py(dy), 5.5, C.cyan, 0.95 * a);
    }

    const xa = DX0, xb = DX1;
    ctx.draw.line([[px(xa), py(w * xa + b)], [px(xb), py(w * xb + b)]], C.gold, 4, 0.95 * a);

    const lv = loss(w, b);
    ctx.draw.text(`L = ${lv.toFixed(2)}`, 300, 30, 22, C.head, 0.95 * a);
    ctx.draw.text('ŷ = w·x + b', X0 + 10, Y1 + 22, 16, C.gold, 0.9 * a);
  },
};
registerIsland(island);
