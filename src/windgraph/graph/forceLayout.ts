import type { Graph } from './namedGraphs';
import { adjacencyList } from './namedGraphs';

export interface LayoutNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ForceLayoutOptions {
  springLength: number;
  springK: number;
  repulsion: number;
  damping: number;
  dt: number;
}

const DEFAULTS: ForceLayoutOptions = {
  springLength: 1,
  springK: 0.1,
  repulsion: 1,
  damping: 0.9,
  dt: 0.1,
};

export function initLayout(g: Graph, radius = 2, rng: () => number = Math.random): LayoutNode[] {
  return Array.from({ length: g.nodes }, (_, i) => {
    const t = (i / g.nodes) * 2 * Math.PI;
    return {
      x: radius * Math.cos(t) + (rng() - 0.5) * 0.1,
      y: radius * Math.sin(t) + (rng() - 0.5) * 0.1,
      vx: 0, vy: 0,
    };
  });
}

export function stepLayout(g: Graph, nodes: LayoutNode[], opts: Partial<ForceLayoutOptions> = {}): number {
  const o = { ...DEFAULTS, ...opts };
  const adj = adjacencyList(g);
  const fx = new Array(g.nodes).fill(0);
  const fy = new Array(g.nodes).fill(0);

  for (let i = 0; i < g.nodes; i++) {
    for (let j = i + 1; j < g.nodes; j++) {
      let dx = nodes[i].x - nodes[j].x;
      let dy = nodes[i].y - nodes[j].y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1e-6) { dx = (Math.random() - 0.5) * 0.01; dy = (Math.random() - 0.5) * 0.01; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const f = o.repulsion / d2;
      fx[i] += f * dx / d; fy[i] += f * dy / d;
      fx[j] -= f * dx / d; fy[j] -= f * dy / d;
    }
  }

  for (const [u, v] of g.edges) {
    const dx = nodes[v].x - nodes[u].x;
    const dy = nodes[v].y - nodes[u].y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const f = o.springK * (d - o.springLength);
    fx[u] += f * dx / d; fy[u] += f * dy / d;
    fx[v] -= f * dx / d; fy[v] -= f * dy / d;
  }

  let energy = 0;
  for (let i = 0; i < g.nodes; i++) {
    nodes[i].vx = (nodes[i].vx + fx[i] * o.dt) * o.damping;
    nodes[i].vy = (nodes[i].vy + fy[i] * o.dt) * o.damping;
    nodes[i].x += nodes[i].vx * o.dt;
    nodes[i].y += nodes[i].vy * o.dt;
    energy += nodes[i].vx * nodes[i].vx + nodes[i].vy * nodes[i].vy;
  }
  return energy;
}

export function runLayout(g: Graph, iterations = 300, opts: Partial<ForceLayoutOptions> = {}, rng: () => number = Math.random): LayoutNode[] {
  const nodes = initLayout(g, 2, rng);
  for (let i = 0; i < iterations; i++) {
    const energy = stepLayout(g, nodes, opts);
    if (energy < 1e-8) break;
  }
  return nodes;
}

export function layoutPositions(nodes: LayoutNode[]): [number, number][] {
  return nodes.map(n => [n.x, n.y]);
}
