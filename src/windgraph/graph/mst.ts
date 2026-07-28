import type { WeightedGraph } from './traversal';

export interface MSTEdge {
  from: number;
  to: number;
  weight: number;
  step: number;
}

export interface MSTResult {
  edges: MSTEdge[];
  totalWeight: number;
}

class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; }
    return x;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else { this.parent[rb] = ra; this.rank[ra]++; }
    return true;
  }
}

export function kruskal(g: WeightedGraph): MSTResult {
  const sorted = [...g.edges].sort((a, b) => a.weight - b.weight);
  const uf = new UnionFind(g.nodes);
  const edges: MSTEdge[] = [];
  let step = 0;
  for (const e of sorted) {
    if (uf.union(e.from, e.to)) {
      edges.push({ from: e.from, to: e.to, weight: e.weight, step: step++ });
      if (edges.length === g.nodes - 1) break;
    }
  }
  return { edges, totalWeight: edges.reduce((s, e) => s + e.weight, 0) };
}

export function prim(g: WeightedGraph, start = 0): MSTResult {
  const adj: { to: number; weight: number; from: number }[][] = Array.from({ length: g.nodes }, () => []);
  for (const e of g.edges) {
    adj[e.from].push({ to: e.to, weight: e.weight, from: e.from });
    if (!g.directed) adj[e.to].push({ to: e.from, weight: e.weight, from: e.to });
  }
  const inTree = new Array(g.nodes).fill(false);
  const edges: MSTEdge[] = [];
  inTree[start] = true;
  let step = 0;

  for (let iter = 0; iter < g.nodes - 1; iter++) {
    let best: { from: number; to: number; weight: number } | null = null;
    for (let u = 0; u < g.nodes; u++) {
      if (!inTree[u]) continue;
      for (const e of adj[u]) {
        if (!inTree[e.to] && (!best || e.weight < best.weight)) {
          best = { from: u, to: e.to, weight: e.weight };
        }
      }
    }
    if (!best) break;
    inTree[best.to] = true;
    edges.push({ from: best.from, to: best.to, weight: best.weight, step: step++ });
  }
  return { edges, totalWeight: edges.reduce((s, e) => s + e.weight, 0) };
}
