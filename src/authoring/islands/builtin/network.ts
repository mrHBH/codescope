// ── Island: network ──────────────────────────────────────────────────────────
// A tiny MLP (3-4-1) with a signal wave that sweeps forward (activations light up
// left→right) or backward (backprop: gradients light up right→left, edges weighted
// by |∂L/∂w|). The sweep is a travelling bump so the pass reads as a flow of
// information / blame.

import { registerIsland, type IslandDef } from '../registry';
import { loop01, clamp01 } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], accent: [0.12, 0.60, 0.95, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1],
  green: [0.30, 0.80, 0.40, 1], rose: [0.93, 0.36, 0.34, 1], ink: [0.85, 0.87, 0.91, 1],
};

const LAYERS = [3, 4, 1];
const LX = [95, 235, 375];
const layerP = [0.12, 0.5, 0.88];
interface Node { x: number; y: number; layer: number; act: number; }
const ACTS = [[0.8, 0.35, 0.6], [0.5, 0.92, 0.25, 0.7], [0.66]];
const nodes: Node[] = [];
LAYERS.forEach((n, li) => {
  const span = 300, top = 260 - span / 2;
  for (let k = 0; k < n; k++) {
    const y = n === 1 ? 260 : top + (span * k) / (n - 1);
    nodes.push({ x: LX[li], y, layer: li, act: ACTS[li][k] });
  }
});
interface Edge { a: number; b: number; w: number; }
const edges: Edge[] = [];
nodes.forEach((na, ai) => nodes.forEach((nb, bi) => {
  if (nb.layer === na.layer + 1) edges.push({ a: ai, b: bi, w: ((ai * 7 + bi * 3) % 10) / 10 - 0.35 });
}));
const bump = (p: number, c: number, w: number) => Math.max(0, 1 - Math.abs(p - c) / w);

const island: IslandDef = {
  id: 'network',
  title: 'Neural network pass',
  kind: 'visual',
  params: {
    backprop: { kind: 'boolean', label: 'Backward pass', default: false },
  },
  defaultSize: [470, 520],
  emit(ctx, params, time) {
    const a = time.alpha;
    const back = params.backprop as boolean;
    const raw = loop01(time.now, 3.6);
    const p = back ? 1 - raw : raw;
    const pulseCol = back ? C.rose : C.cyan;

    for (const e of edges) {
      const na = nodes[e.a], nb = nodes[e.b];
      const midP = (layerP[na.layer] + layerP[nb.layer]) / 2;
      const pulse = bump(p, midP, 0.22);
      const base = 0.16 + 0.1 * Math.abs(e.w);
      const wCol = back
        ? [C.rose[0], C.rose[1], C.rose[2]]
        : [C.dim[0], C.dim[1], C.dim[2]];
      const alpha = base + pulse * 0.75;
      const width = 1.4 + Math.abs(e.w) * 2.2 + pulse * 2.4;
      ctx.draw.line([[na.x, na.y], [nb.x, nb.y]], wCol, width, alpha * a);
    }

    nodes.forEach((n, i) => {
      const lit = bump(p, layerP[n.layer], 0.2);
      const r = 17;
      ctx.draw.fillCircle(n.x, n.y, r, [0.10, 0.105, 0.12, 1], a);
      ctx.draw.fillCircle(n.x, n.y, r, pulseCol, (0.10 + 0.55 * lit) * a);
      ctx.draw.strokeCircle(n.x, n.y, r, lit > 0.05 ? pulseCol : C.border, 1.6 + lit * 1.6, (0.7 + 0.3 * lit) * a);
      const val = back ? (0.2 + 0.7 * ((i * 37) % 10) / 10) : n.act;
      ctx.draw.text(val.toFixed(1), n.x, n.y + 5, 13, lit > 0.3 ? C.head : C.dim, (0.65 + 0.35 * lit) * a, 'middle');
    });

    const labs = ['input', 'hidden', 'output'];
    labs.forEach((l, li) => ctx.draw.text(l, LX[li], 470, 15, C.dim, 0.9 * a, 'middle'));

    if (back) {
      ctx.draw.text('∂L/∂w — blame, backwards', 16, 24, 19, C.rose, 0.95 * a);
    } else {
      ctx.draw.text('forward — a prediction', 16, 24, 19, C.cyan, 0.95 * a);
    }
    const prog = back ? 1 - p : p;
    ctx.draw.rect(16, 496, 16 + clamp01(prog) * 438, 500, pulseCol, 0.85 * a);
  },
};
registerIsland(island);
