// ── Graph theory tests (Lane E) ─────────────────────────────────────────────
// Run with: bun src/windgraph/graph/__test_graph.ts

import {
  completeGraph, cycleGraph, pathGraph, gridGraph, petersenGraph,
  starGraph, wheelGraph, binaryTree, randomGraph,
  adjacencyList, adjacencyMatrix, degreeSequence, circularLayout,
} from './namedGraphs';
import { initLayout, stepLayout, runLayout, layoutPositions } from './forceLayout';
import { bfs, dfs, dijkstra, shortestPath, toWeighted } from './traversal';
import { kruskal, prim } from './mst';
import { degrees, isEulerianCircuit, isEulerianPath, eulerianCircuit, eulerianPath, edgeTraceFromPath } from './eulerian';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 1e-4) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

function seededRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

console.log('Graph theory tests (Lane E)\n');

// E1: Named graphs
test('E1 K5 has 10 edges', () => {
  const g = completeGraph(5);
  assert(g.nodes === 5);
  assert(g.edges.length === 10);
});
test('E1 C6 has 6 edges', () => {
  const g = cycleGraph(6);
  assert(g.edges.length === 6);
});
test('E1 path graph P5', () => {
  const g = pathGraph(5);
  assert(g.edges.length === 4);
});
test('E1 grid 3×4 has 17 edges', () => {
  const g = gridGraph(3, 4);
  assert(g.nodes === 12);
  assert(g.edges.length === 17);
});
test('E1 Petersen graph: 10 nodes, 15 edges', () => {
  const g = petersenGraph();
  assert(g.nodes === 10);
  assert(g.edges.length === 15);
});
test('E1 Petersen is 3-regular', () => {
  const deg = degreeSequence(petersenGraph());
  assert(deg.every(d => d === 3));
});
test('E1 star graph S5', () => {
  const g = starGraph(5);
  assert(g.nodes === 6);
  assert(g.edges.length === 5);
});
test('E1 wheel graph W5', () => {
  const g = wheelGraph(5);
  assert(g.nodes === 6);
  assert(g.edges.length === 10);
});
test('E1 binary tree depth 2', () => {
  const g = binaryTree(2);
  assert(g.nodes === 7);
  assert(g.edges.length === 6);
});
test('E1 random G(10, 0.5)', () => {
  const g = randomGraph(10, 0.5, seededRng(42));
  assert(g.nodes === 10);
  assert(g.edges.length > 0 && g.edges.length <= 45);
});
test('E1 adjacency list symmetric', () => {
  const g = cycleGraph(4);
  const adj = adjacencyList(g);
  assert(adj[0].includes(1) && adj[1].includes(0));
});
test('E1 adjacency matrix', () => {
  const g = pathGraph(3);
  const m = adjacencyMatrix(g);
  assert(m[0][1] === 1 && m[1][0] === 1);
  assert(m[0][2] === 0);
});
test('E1 circular layout on unit circle', () => {
  const pts = circularLayout(6, 1);
  assert(pts.length === 6);
  for (const [x, y] of pts) approx(Math.hypot(x, y), 1);
});

// E2: Force-directed layout
test('E2 layout converges (energy decreases)', () => {
  const g = completeGraph(5);
  const nodes = initLayout(g, 0.5, seededRng(1));
  for (let i = 0; i < 100; i++) stepLayout(g, nodes);
  const e1 = stepLayout(g, nodes);
  for (let i = 0; i < 100; i++) stepLayout(g, nodes);
  const e2 = stepLayout(g, nodes);
  assert(e2 <= e1 + 1e-6, `energy should not increase: ${e2} <= ${e1}`);
});
test('E2 runLayout produces positions', () => {
  const g = petersenGraph();
  const nodes = runLayout(g, 200, {}, seededRng(42));
  const pos = layoutPositions(nodes);
  assert(pos.length === 10);
  for (const [x, y] of pos) assert(Number.isFinite(x) && Number.isFinite(y));
});
test('E2 connected nodes closer than disconnected', () => {
  const g = pathGraph(4);
  const nodes = runLayout(g, 300, { springLength: 1, repulsion: 0.5 }, seededRng(7));
  const d01 = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
  const d03 = Math.hypot(nodes[0].x - nodes[3].x, nodes[0].y - nodes[3].y);
  assert(d01 < d03, `adjacent ${d01} should be closer than distant ${d03}`);
});

// E3: BFS/DFS/Dijkstra
test('E3 BFS visits all nodes in connected graph', () => {
  const g = cycleGraph(6);
  const steps = bfs(g, 0);
  assert(steps.length === 6);
  assert(steps[0].node === 0 && steps[0].depth === 0);
});
test('E3 BFS depth correct', () => {
  const g = pathGraph(5);
  const steps = bfs(g, 0);
  assert(steps[4].depth === 4);
});
test('E3 DFS visits all nodes', () => {
  const g = gridGraph(3, 3);
  const steps = dfs(g, 0);
  assert(steps.length === 9);
});
test('E3 Dijkstra shortest path', () => {
  const wg = {
    nodes: 4,
    edges: [
      { from: 0, to: 1, weight: 1 },
      { from: 1, to: 2, weight: 1 },
      { from: 0, to: 2, weight: 5 },
      { from: 2, to: 3, weight: 1 },
    ],
    directed: false,
  };
  const result = dijkstra(wg, 0);
  approx(result.dist[3], 3);
  const path = shortestPath(result, 3);
  assert(path.length === 4);
  assert(path[0] === 0 && path[3] === 3);
});
test('E3 Dijkstra on unweighted via toWeighted', () => {
  const g = cycleGraph(6);
  const wg = toWeighted(g);
  const result = dijkstra(wg, 0);
  approx(result.dist[3], 3);
});
test('E3 shortestPath returns empty for unreachable', () => {
  const wg = {
    nodes: 4,
    edges: [{ from: 0, to: 1, weight: 1 }],
    directed: false,
  };
  const result = dijkstra(wg, 0);
  const path = shortestPath(result, 3);
  assert(path.length === 0, `unreachable should give empty path, got [${path}]`);
});

// E4: MST
test('E4 Kruskal MST has n-1 edges', () => {
  const wg = {
    nodes: 4,
    edges: [
      { from: 0, to: 1, weight: 1 },
      { from: 1, to: 2, weight: 2 },
      { from: 2, to: 3, weight: 3 },
      { from: 0, to: 3, weight: 10 },
      { from: 0, to: 2, weight: 5 },
    ],
    directed: false,
  };
  const mst = kruskal(wg);
  assert(mst.edges.length === 3);
  approx(mst.totalWeight, 6);
});
test('E4 Prim MST matches Kruskal weight', () => {
  const wg = {
    nodes: 5,
    edges: [
      { from: 0, to: 1, weight: 2 },
      { from: 0, to: 3, weight: 6 },
      { from: 1, to: 2, weight: 3 },
      { from: 1, to: 3, weight: 8 },
      { from: 1, to: 4, weight: 5 },
      { from: 2, to: 4, weight: 7 },
      { from: 3, to: 4, weight: 9 },
    ],
    directed: false,
  };
  const k = kruskal(wg);
  const p = prim(wg);
  approx(k.totalWeight, p.totalWeight);
  assert(k.edges.length === p.edges.length);
});
test('E4 MST steps are ordered', () => {
  const wg = {
    nodes: 3,
    edges: [
      { from: 0, to: 1, weight: 5 },
      { from: 1, to: 2, weight: 1 },
      { from: 0, to: 2, weight: 3 },
    ],
    directed: false,
  };
  const mst = kruskal(wg);
  for (let i = 1; i < mst.edges.length; i++) {
    assert(mst.edges[i].weight >= mst.edges[i - 1].weight);
  }
});

// E5: Eulerian paths
test('E5 C4 has Eulerian circuit', () => {
  const g = cycleGraph(4);
  assert(isEulerianCircuit(g));
  const circuit = eulerianCircuit(g);
  assert(circuit !== null);
  assert(circuit!.length === 5);
  assert(circuit![0] === circuit![4]);
});
test('E5 path graph has Eulerian path but not circuit', () => {
  const g = pathGraph(4);
  assert(!isEulerianCircuit(g));
  assert(isEulerianPath(g));
  const path = eulerianPath(g);
  assert(path !== null);
  assert(path!.length === 4);
});
test('E5 K4 has no Eulerian path (odd degrees)', () => {
  const g = completeGraph(4);
  assert(!isEulerianPath(g));
});
test('E5 K5 has Eulerian circuit', () => {
  const g = completeGraph(5);
  assert(isEulerianCircuit(g));
  const circuit = eulerianCircuit(g);
  assert(circuit !== null);
  assert(circuit!.length === 11);
});
test('E5 edge trace from path', () => {
  const edges = edgeTraceFromPath([0, 1, 2, 3]);
  assert(edges.length === 3);
  assert(edges[0][0] === 0 && edges[0][1] === 1);
});
test('E5 degrees of Petersen', () => {
  const deg = degrees(petersenGraph());
  assert(deg.every(d => d === 3));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
