import type { Graph } from './namedGraphs';
import { adjacencyList } from './namedGraphs';

export function degrees(g: Graph): number[] {
  const deg = new Array(g.nodes).fill(0);
  for (const [u, v] of g.edges) { deg[u]++; deg[v]++; }
  return deg;
}

export function isEulerianCircuit(g: Graph): boolean {
  if (g.edges.length === 0) return true;
  const deg = degrees(g);
  const reachable = reachableNodes(g);
  for (let i = 0; i < g.nodes; i++) {
    if (reachable.has(i) && deg[i] % 2 !== 0) return false;
  }
  return true;
}

export function isEulerianPath(g: Graph): boolean {
  if (g.edges.length === 0) return true;
  const deg = degrees(g);
  const reachable = reachableNodes(g);
  let odd = 0;
  for (let i = 0; i < g.nodes; i++) {
    if (reachable.has(i) && deg[i] % 2 !== 0) odd++;
  }
  return odd === 0 || odd === 2;
}

function reachableNodes(g: Graph): Set<number> {
  const adj = adjacencyList(g);
  const visited = new Set<number>();
  let start = -1;
  for (const [u] of g.edges) { start = u; break; }
  if (start === -1) return new Set();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    if (visited.has(n)) continue;
    visited.add(n);
    for (const nb of adj[n]) if (!visited.has(nb)) stack.push(nb);
  }
  return visited;
}

export function eulerianCircuit(g: Graph): number[] | null {
  if (!isEulerianCircuit(g)) return null;
  return hierholzer(g);
}

export function eulerianPath(g: Graph): number[] | null {
  if (!isEulerianPath(g)) return null;
  return hierholzer(g);
}

function hierholzer(g: Graph): number[] | null {
  if (g.edges.length === 0) return g.nodes > 0 ? [0] : [];
  const adj: { to: number; edgeIdx: number }[][] = Array.from({ length: g.nodes }, () => []);
  g.edges.forEach(([u, v], i) => {
    adj[u].push({ to: v, edgeIdx: i });
    adj[v].push({ to: u, edgeIdx: i });
  });
  const used = new Array(g.edges.length).fill(false);
  const deg = degrees(g);
  let start = 0;
  for (let i = 0; i < g.nodes; i++) {
    if (deg[i] % 2 === 1) { start = i; break; }
    if (deg[i] > 0 && deg[start] === 0) start = i;
  }

  const stack = [start];
  const circuit: number[] = [];
  const ptr = new Array(g.nodes).fill(0);

  while (stack.length) {
    const v = stack[stack.length - 1];
    let advanced = false;
    while (ptr[v] < adj[v].length) {
      const { to, edgeIdx } = adj[v][ptr[v]];
      ptr[v]++;
      if (used[edgeIdx]) continue;
      used[edgeIdx] = true;
      stack.push(to);
      advanced = true;
      break;
    }
    if (!advanced) circuit.push(stack.pop()!);
  }
  circuit.reverse();
  return circuit.length === g.edges.length + 1 ? circuit : null;
}

export function edgeTraceFromPath(path: number[]): [number, number][] {
  const edges: [number, number][] = [];
  for (let i = 0; i < path.length - 1; i++) edges.push([path[i], path[i + 1]]);
  return edges;
}
