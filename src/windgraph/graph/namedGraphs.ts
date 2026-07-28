export interface Graph {
  nodes: number;
  edges: [number, number][];
  directed: boolean;
}

export function completeGraph(n: number): Graph {
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push([i, j]);
  return { nodes: n, edges, directed: false };
}

export function cycleGraph(n: number): Graph {
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  return { nodes: n, edges, directed: false };
}

export function pathGraph(n: number): Graph {
  const edges: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  return { nodes: n, edges, directed: false };
}

export function gridGraph(rows: number, cols: number): Graph {
  const edges: [number, number][] = [];
  const id = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) edges.push([id(r, c), id(r, c + 1)]);
      if (r < rows - 1) edges.push([id(r, c), id(r + 1, c)]);
    }
  }
  return { nodes: rows * cols, edges, directed: false };
}

export function petersenGraph(): Graph {
  const edges: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    edges.push([i, (i + 1) % 5]);
    edges.push([i, i + 5]);
    edges.push([i + 5, ((i + 2) % 5) + 5]);
  }
  return { nodes: 10, edges, directed: false };
}

export function starGraph(n: number): Graph {
  const edges: [number, number][] = [];
  for (let i = 1; i <= n; i++) edges.push([0, i]);
  return { nodes: n + 1, edges, directed: false };
}

export function wheelGraph(n: number): Graph {
  const edges: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    edges.push([0, i]);
    edges.push([i, i === n ? 1 : i + 1]);
  }
  return { nodes: n + 1, edges, directed: false };
}

export function binaryTree(depth: number): Graph {
  const edges: [number, number][] = [];
  const nodes = Math.pow(2, depth + 1) - 1;
  for (let i = 0; i < nodes; i++) {
    const left = 2 * i + 1, right = 2 * i + 2;
    if (left < nodes) edges.push([i, left]);
    if (right < nodes) edges.push([i, right]);
  }
  return { nodes, edges, directed: false };
}

export function randomGraph(n: number, p: number, rng: () => number = Math.random): Graph {
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (rng() < p) edges.push([i, j]);
  }
  return { nodes: n, edges, directed: false };
}

export function adjacencyList(g: Graph): number[][] {
  const adj: number[][] = Array.from({ length: g.nodes }, () => []);
  for (const [u, v] of g.edges) {
    adj[u].push(v);
    if (!g.directed) adj[v].push(u);
  }
  return adj;
}

export function adjacencyMatrix(g: Graph): number[][] {
  const m: number[][] = Array.from({ length: g.nodes }, () => new Array(g.nodes).fill(0));
  for (const [u, v] of g.edges) {
    m[u][v] = 1;
    if (!g.directed) m[v][u] = 1;
  }
  return m;
}

export function degreeSequence(g: Graph): number[] {
  const deg = new Array(g.nodes).fill(0);
  for (const [u, v] of g.edges) { deg[u]++; deg[v]++; }
  return deg.sort((a, b) => b - a);
}

export function circularLayout(n: number, radius = 1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI - Math.PI / 2;
    pts.push([radius * Math.cos(t), radius * Math.sin(t)]);
  }
  return pts;
}
