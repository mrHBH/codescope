// ── windgraph · specialized charts (Phase 4 · A17/A18) ───────────────────────
// Candlestick/OHLC, waterfall, funnel, radar/spider, wind rose, ternary,
// parallel coordinates, and scatterplot-matrix layout. Pure data-space geometry
// helpers; the resolver wraps the returned primitives in Mobjects.

import type { Pt } from '../stroke/stroke';

export interface Ohlc { x: number; open: number; high: number; low: number; close: number; }

export interface CandleGeom { wick: [Pt, Pt]; body: Pt[]; up: boolean; }

export function candlestick(data: Ohlc[], width: number): CandleGeom[] {
  return data.map((d) => {
    const up = d.close >= d.open;
    const lo = Math.min(d.open, d.close), hi = Math.max(d.open, d.close);
    const hw = width / 2;
    return {
      wick: [[d.x, d.low], [d.x, d.high]] as [Pt, Pt],
      body: [[d.x - hw, lo], [d.x + hw, lo], [d.x + hw, hi], [d.x - hw, hi]] as Pt[],
      up,
    };
  });
}

export interface WaterfallStep { label: string; value: number; }

export function waterfall(steps: WaterfallStep[]): { bar: Pt[]; running: number; kind: 'up' | 'down' | 'total' }[] {
  const out: { bar: Pt[]; running: number; kind: 'up' | 'down' | 'total' }[] = [];
  let run = 0;
  const w = 0.6;
  steps.forEach((s, i) => {
    const total = i === steps.length - 1 && s.value === 0;
    const start = total ? 0 : run;
    const end = total ? run : run + s.value;
    const lo = Math.min(start, end), hi = Math.max(start, end);
    out.push({
      bar: [[i - w / 2, lo], [i + w / 2, lo], [i + w / 2, hi], [i - w / 2, hi]] as Pt[],
      running: end,
      kind: total ? 'total' : s.value >= 0 ? 'up' : 'down',
    });
    run = end;
  });
  return out;
}

export function funnel(values: number[], height = 1): Pt[][] {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
  const n = values.length;
  const rowH = height / n;
  return values.map((v, i) => {
    const wTop = (Math.abs(v) / max) / 2;
    const wBot = (i < n - 1 ? Math.abs(values[i + 1]) / max : wTop * 0.6) / 2;
    const y0 = -i * rowH, y1 = -(i + 1) * rowH;
    return [[-wTop, y0], [wTop, y0], [wBot, y1], [-wBot, y1]] as Pt[];
  });
}

export function radar(values: number[], radius = 1): { poly: Pt[]; axes: [Pt, Pt][]; labels: Pt[] } {
  const n = values.length;
  const max = Math.max(...values.map((v) => Math.abs(v)), 1e-9);
  const at = (i: number, r: number): Pt => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const poly = values.map((v, i) => at(i, (Math.abs(v) / max) * radius));
  const axes: [Pt, Pt][] = values.map((_, i) => [[0, 0], at(i, radius)] as [Pt, Pt]);
  const labels = values.map((_, i) => at(i, radius * 1.15));
  return { poly, axes, labels };
}

export function windrose(counts: number[], radius = 1): Pt[][] {
  const n = counts.length;
  const max = Math.max(...counts, 1e-9);
  return counts.map((c, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const r = (c / max) * radius;
    const poly: Pt[] = [[0, 0]];
    const segs = 8;
    for (let s = 0; s <= segs; s++) {
      const a = a0 + (a1 - a0) * (s / segs);
      poly.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return poly;
  });
}

export function ternaryToXY(a: number, b: number, c: number): Pt {
  const s = a + b + c || 1;
  const na = a / s, nb = b / s, nc = c / s;
  return [nb + nc / 2, (Math.sqrt(3) / 2) * nc];
}

export function ternaryFrame(): { frame: Pt[]; grid: [Pt, Pt][] } {
  const A: Pt = [0, 0], B: Pt = [1, 0], C: Pt = [0.5, Math.sqrt(3) / 2];
  const grid: [Pt, Pt][] = [];
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    grid.push([lerp(A, B, t), lerp(A, C, t)]);
    grid.push([lerp(B, A, t), lerp(B, C, t)]);
    grid.push([lerp(C, A, t), lerp(C, B, t)]);
  }
  return { frame: [A, B, C], grid };
}

function lerp(p: Pt, q: Pt, t: number): Pt { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }

export function parallelCoords(columns: number[][], width = 1, height = 1): { lines: Pt[][]; axes: [Pt, Pt][] } {
  const n = columns.length;
  const axes: [Pt, Pt][] = columns.map((_, i) => [[(i / (n - 1)) * width, 0], [(i / (n - 1)) * width, height]] as [Pt, Pt]);
  const rows = columns[0]?.length ?? 0;
  const lines: Pt[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const col = columns[i];
      const lo = Math.min(...col), hi = Math.max(...col);
      const t = hi > lo ? (col[r] - lo) / (hi - lo) : 0.5;
      line.push([(i / (n - 1)) * width, t * height]);
    }
    lines.push(line);
  }
  return { lines, axes };
}

export interface ScatterMatrixFacet { row: number; col: number; origin: Pt; points: Pt[]; }

export function scatterMatrix(columns: number[][], cell = 1, gap = 0.2): { facets: ScatterMatrixFacet[]; n: number; cell: number; gap: number } {
  const n = columns.length;
  const facets: ScatterMatrixFacet[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const origin: Pt = [col * (cell + gap), -row * (cell + gap)];
      const xs = columns[col], ys = columns[row];
      const xlo = Math.min(...xs), xhi = Math.max(...xs);
      const ylo = Math.min(...ys), yhi = Math.max(...ys);
      const pts: Pt[] = xs.map((_, k) => [
        origin[0] + (xhi > xlo ? (xs[k] - xlo) / (xhi - xlo) : 0.5) * cell,
        origin[1] + (yhi > ylo ? (ys[k] - ylo) / (yhi - ylo) : 0.5) * cell,
      ]);
      facets.push({ row, col, origin, points: pts });
    }
  }
  return { facets, n, cell, gap };
}
