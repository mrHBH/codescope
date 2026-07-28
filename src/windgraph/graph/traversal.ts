import type { Graph } from './namedGraphs';
import { adjacencyList } from './namedGraphs';

export interface TraversalStep {
  node: number;
  parent: number;
  depth: number;
  order: number;
}

export function bfs(g: Graph, start: number): TraversalStep[] {
  const adj = adjacencyList(g);
  const visited = new Array(g.nodes).fill(false);
  const steps: TraversalStep[] = [];
  const queue: { node: number; parent: number; depth: number }[] = [{ node: start, parent: -1, depth: 0 }];
  visited[start] = true;
  let order = 0;
  while (queue.length) {
    const { node, parent, depth } = queue.shift()!;
    steps.push({ node, parent, depth, order: order++ });
    for (const nb of adj[node]) {
      if (!visited[nb]) {
        visited[nb] = true;
        queue.push({ node: nb, parent: node, depth: depth + 1 });
      }
    }
  }
  return steps;
}

export function dfs(g: Graph, start: number): TraversalStep[] {
  const adj = adjacencyList(g);
  const visited = new Array(g.nodes).fill(false);
  const steps: TraversalStep[] = [];
  let order = 0;
  const stack: { node: number; parent: number; depth: number }[] = [{ node: start, parent: -1, depth: 0 }];
  while (stack.length) {
    const { node, parent, depth } = stack.pop()!;
    if (visited[node]) continue;
    visited[node] = true;
    steps.push({ node, parent, depth, order: order++ });
    for (let i = adj[node].length - 1; i >= 0; i--) {
      if (!visited[adj[node][i]]) stack.push({ node: adj[node][i], parent: node, depth: depth + 1 });
    }
  }
  return steps;
}

export interface WeightedGraph {
  nodes: number;
  edges: { from: number; to: number; weight: number }[];
  directed: boolean;
}

export interface DijkstraResult {
  dist: number[];
  prev: number[];
  order: number[];
}

export function dijkstra(g: WeightedGraph, start: number): DijkstraResult {
  const adj: { to: number; weight: number }[][] = Array.from({ length: g.nodes }, () => []);
  for (const e of g.edges) {
    adj[e.from].push({ to: e.to, weight: e.weight });
    if (!g.directed) adj[e.to].push({ to: e.from, weight: e.weight });
  }
  const dist = new Array(g.nodes).fill(Infinity);
  const prev = new Array(g.nodes).fill(-1);
  const visited = new Array(g.nodes).fill(false);
  const order: number[] = [];
  dist[start] = 0;

  for (let iter = 0; iter < g.nodes; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < g.nodes; i++) {
      if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1) break;
    visited[u] = true;
    order.push(u);
    for (const { to, weight } of adj[u]) {
      if (!visited[to] && dist[u] + weight < dist[to]) {
        dist[to] = dist[u] + weight;
        prev[to] = u;
      }
    }
  }
  return { dist, prev, order };
}

export function shortestPath(result: DijkstraResult, target: number): number[] {
  if (result.dist[target] === Infinity) return [];
  const path: number[] = [];
  let cur = target;
  while (cur !== -1) {
    path.unshift(cur);
    cur = result.prev[cur];
  }
  return path;
}

export function toWeighted(g: Graph): WeightedGraph {
  return {
    nodes: g.nodes,
    edges: g.edges.map(([from, to]) => ({ from, to, weight: 1 })),
    directed: g.directed,
  };
}
