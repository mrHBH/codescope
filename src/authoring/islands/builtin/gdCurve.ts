// ── Island: gd-curve ─────────────────────────────────────────────────────────
// 1D gradient descent on a wavy loss L(w): a ball steps downhill along the curve.
// Modes: tangent+gradient arrow, discrete step markers, and a three-ball learning
// -rate comparison (diverge / glide / crawl). The learning rate is a live slider.

import { registerIsland, type IslandDef } from '../registry';
import { loop01, clamp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], accent: [0.12, 0.60, 0.95, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
  green: [0.30, 0.80, 0.40, 1], rose: [0.93, 0.36, 0.34, 1],
};

const PX0 = 50, PX1 = 440, PY0 = 470, PY1 = 70;
const W0 = 0, W1 = 6;
function L(w: number): number { return 0.32 * (w - 3.6) * (w - 3.6) + 0.4 * Math.sin(2.4 * w) + 1.0; }
function dL(w: number): number { return 0.64 * (w - 3.6) + 1.04 * Math.cos(2.4 * w); }
let LMAX = 1;
for (let i = 0; i <= 120; i++) LMAX = Math.max(LMAX, L(W0 + (W1 - W0) * i / 120));
const px = (w: number) => PX0 + ((w - W0) / (W1 - W0)) * (PX1 - PX0);
const py = (l: number) => PY0 - (l / LMAX) * (PY0 - PY1);
const SLIDER_Y = 528, SLIDER_X0 = 60, SLIDER_X1 = 430;
const lrToX = (lr: number) => SLIDER_X0 + ((lr - 0.05) / 1.15) * (SLIDER_X1 - SLIDER_X0);
const xToLr = (x: number) => clamp(0.05 + ((x - SLIDER_X0) / (SLIDER_X1 - SLIDER_X0)) * 1.15, 0.05, 1.2);

function traj(start: number, lr: number, steps: number): number[] {
  const ws = [start]; let w = start;
  for (let k = 0; k < steps; k++) { w = clamp(w - lr * dL(w), W0, W1); ws.push(w); }
  return ws;
}

const island: IslandDef = {
  id: 'gd-curve',
  title: 'Gradient descent (1D)',
  kind: 'visual',
  params: {
    learningRate: { kind: 'number', label: 'Learning rate η', default: 0.55, min: 0.05, max: 1.2 },
    startW: { kind: 'number', label: 'Start w', default: 0.7, min: 0, max: 6 },
    showTangent: { kind: 'boolean', label: 'Tangent + gradient', default: true },
    showSteps: { kind: 'boolean', label: 'Step markers', default: false },
    compare: { kind: 'boolean', label: 'Compare three η', default: false },
  },
  defaultSize: [470, 585],
  handles: [
    {
      param: 'learningRate',
      at(p) { return [lrToX(p.learningRate as number), SLIDER_Y]; },
      set(p, to) { (p as any).learningRate = xToLr(to[0]); },
    },
    {
      param: 'startW',
      at(p) { return [px(p.startW as number), py(L(p.startW as number))]; },
      set(p, to) { (p as any).startW = clamp(W0 + ((to[0] - PX0) / (PX1 - PX0)) * (W1 - W0), W0, W1); },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const lr = params.learningRate as number;
    const start = params.startW as number;
    const compare = params.compare as boolean;

    // Axes + loss curve.
    ctx.draw.line([[PX0, PY0], [PX1, PY0]], C.dim, 1.6, 0.7 * a);
    ctx.draw.line([[PX0, PY0], [PX0, PY1]], C.dim, 1.6, 0.7 * a);
    const curve: [number, number][] = [];
    for (let i = 0; i <= 140; i++) { const w = W0 + (W1 - W0) * i / 140; curve.push([px(w), py(L(w))]); }
    ctx.draw.line(curve, C.accent, 4, 0.95 * a);
    ctx.draw.text('L(w)', PX0 + 6, PY1 - 4, 17, C.dim, 0.9 * a);
    ctx.draw.text('w', PX1 - 16, PY0 + 24, 17, C.dim, 0.9 * a);

    const t = loop01(time.now, 6);

    if (compare) {
      const runs: { lr: number; col: number[]; lab: string }[] = [
        { lr: 1.05, col: C.rose, lab: 'too big' },
        { lr, col: C.green, lab: `η = ${lr.toFixed(2)} (yours)` },
        { lr: 0.16, col: C.cyan, lab: 'too small' },
      ];
      runs.forEach((r, ri) => {
        const ws = traj(0.7, r.lr, 26);
        const head = Math.min(ws.length - 1, Math.floor(t * ws.length));
        for (let k = 0; k < head; k++) {
          ctx.draw.line([[px(ws[k]), py(L(ws[k]))], [px(ws[k + 1]), py(L(ws[k + 1]))]], r.col, 2.5, 0.5 * a);
        }
        ctx.draw.fillCircle(px(ws[head]), py(L(ws[head])), 8, r.col, a);
        ctx.draw.text(r.lab, 300, 96 + ri * 26, 16, r.col, 0.95 * a);
        ctx.draw.fillCircle(284, 90 + ri * 26, 6, r.col, 0.95 * a);
      });
    } else {
      const ws = traj(start, lr, 30);
      const head = Math.min(ws.length - 1, Math.floor(t * ws.length));
      if (params.showSteps) {
        for (let k = 0; k < Math.min(ws.length - 1, 14); k++) {
          ctx.draw.line([[px(ws[k]), py(L(ws[k]))], [px(ws[k + 1]), py(L(ws[k + 1]))]], C.dim, 2, 0.55 * a, [6, 5]);
          ctx.draw.fillCircle(px(ws[k]), py(L(ws[k])), 4, C.dim, 0.8 * a);
        }
      }
      const bw = ws[head], bl = L(bw);
      if (params.showTangent) {
        const m = dL(bw), dw = 1.1;
        ctx.draw.line([[px(bw - dw), py(bl - m * dw)], [px(bw + dw), py(bl + m * dw)]], C.cyan, 2.5, 0.8 * a);
        const dir = m > 0 ? -1 : 1;
        ctx.draw.arrow(px(bw), py(bl) - 26, px(bw + dir * 0.9), py(bl) - 26, C.gold, 3.5, 0.9 * a);
        ctx.draw.text('−η·L′', px(bw + dir * 0.9) + (dir > 0 ? 8 : -46), py(bl) - 34, 15, C.gold, 0.9 * a);
      }
      ctx.draw.fillCircle(px(bw), py(bl), 10, C.gold, a);
      ctx.draw.strokeCircle(px(bw), py(bl), 16, C.gold, 2, 0.6 * a);
    }

    // Learning-rate slider.
    ctx.draw.line([[SLIDER_X0, SLIDER_Y], [SLIDER_X1, SLIDER_Y]], C.border, 4, 0.9 * a);
    ctx.draw.line([[SLIDER_X0, SLIDER_Y], [lrToX(lr), SLIDER_Y]], C.accent, 4, 0.9 * a);
    const hot = ctx.hoveredHandle === 'learningRate' || ctx.grabbedHandle === 'learningRate';
    ctx.draw.handle(lrToX(lr), SLIDER_Y, hot, a);
    ctx.draw.text(`η = ${lr.toFixed(2)}`, SLIDER_X1 - 92, SLIDER_Y - 26, 17, C.head, 0.95 * a);
    const startHot = ctx.hoveredHandle === 'startW' || ctx.grabbedHandle === 'startW';
    if (!compare) ctx.draw.handle(px(start), py(L(start)), startHot, a * 0.85);
  },
};
registerIsland(island);
