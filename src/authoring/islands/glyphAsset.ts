// ── Glyph asset helpers (extracted from explainer.ts) ────────────────────────
// Builds a normalized glyph with SDF, analytic, bitmap, field, and tessellation
// renderers. Islands use these to reproduce the explainer's visuals.

import type { FontFace } from '../../windfoil/font';
import { glyphQuads } from '../../windfoil/font';
import { fillQuads, strokeQuadPath, strokeInto, type StrokeStyle, type Pt } from '../../windgraph/stroke/stroke';
import type { DrawHelpers } from './draw';

// ── Types ──────────────────────────────────────────────────────────────────
type Seg = [number, number, number, number];
export interface GlyphAsset {
  quadsN: number[]; W: number; H: number; segs: Seg[];
  sdf: Float32Array; gw: number; gh: number; step: number;
}

export function flattenNorm(quadsN: number[], sub: number): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i + 5 < quadsN.length; i += 6) {
    const x0 = quadsN[i], y0 = quadsN[i + 1], cx = quadsN[i + 2], cy = quadsN[i + 3], x1 = quadsN[i + 4], y1 = quadsN[i + 5];
    let px = x0, py = y0;
    for (let s = 1; s <= sub; s++) { const t = s / sub, u = 1 - t; const qx = u * u * x0 + 2 * u * t * cx + t * t * x1, qy = u * u * y0 + 2 * u * t * cy + t * t * y1; segs.push([px, py, qx, qy]); px = qx; py = qy; }
  }
  return segs;
}

export function insidePoly(segs: Seg[], px: number, py: number): boolean {
  let c = false;
  for (const [ax, ay, bx, by] of segs) if ((ay > py) !== (by > py)) { const t = (py - ay) / (by - ay); if (px < ax + t * (bx - ax)) c = !c; }
  return c;
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function signedDist(segs: Seg[], px: number, py: number): number {
  let d = 1e9; for (const s of segs) d = Math.min(d, distSeg(px, py, s[0], s[1], s[2], s[3]));
  return insidePoly(segs, px, py) ? -d : d;
}

export function buildGlyphAsset(font: FontFace, ch: string): GlyphAsset {
  const g = glyphQuads(font, ch)!;
  const [minx, miny, maxx, maxy] = g.bbox;
  const w = maxx - minx, h = maxy - miny, H = Math.max(w, h);
  const quadsN = g.quads.map((v, i) => (i % 2 === 0 ? (v - minx) : (v - miny)) / H);
  const W = w / H, Hn = h / H;
  const segs = flattenNorm(quadsN, 6);
  const G = 22, gw = Math.max(2, Math.round(G * W)), gh = Math.max(2, Math.round(G * Hn)), step = 1 / G;
  const sdf = new Float32Array((gw + 1) * (gh + 1));
  for (let j = 0; j <= gh; j++) for (let i = 0; i <= gw; i++) sdf[j * (gw + 1) + i] = signedDist(segs, i * step, j * step);
  return { quadsN, W, H: Hn, segs, sdf, gw, gh, step };
}

export function place(as: GlyphAsset, bx: number, by: number, bw: number, bh: number) {
  const sc = Math.min(bw / as.W, bh / as.H) * 0.95;
  return { sc, ox: bx + (bw - as.W * sc) / 2, oy: by + (bh - as.H * sc) / 2 };
}

export function sampleSDF(as: GlyphAsset, nx: number, ny: number): number {
  const gx = Math.max(0, Math.min(nx / as.step, as.gw - 1e-4)), gy = Math.max(0, Math.min(ny / as.step, as.gh - 1e-4));
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, w1 = as.gw + 1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(lerp(as.sdf[j * w1 + i], as.sdf[j * w1 + i + 1], fx), lerp(as.sdf[(j + 1) * w1 + i], as.sdf[(j + 1) * w1 + i + 1], fx), fy);
}

// ── Render variants (adapted to accept DrawHelpers + explicit params) ────────

export function renderGlyphAnalytic(as: GlyphAsset, bx: number, by: number, bw: number, bh: number, color: number[], alpha: number, inst: number[], crv: number[], rws: number[], ox = 0, oy = 0) {
  const { sc, ox: offX, oy: offY } = place(as, bx, by, bw, bh);
  const qc = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
  fillQuads(as.quadsN.map((v, i) => (i % 2 === 0 ? ox + offX + v * sc : oy + offY + v * sc)), qc, inst, crv, rws);
}

export function renderGlyphOutline(as: GlyphAsset, bx: number, by: number, bw: number, bh: number, color: number[], width: number, alpha: number, inst: number[], crv: number[], rws: number[], ox = 0, oy = 0) {
  const { sc, ox: offX, oy: offY } = place(as, bx, by, bw, bh);
  const wq = as.quadsN.map((v, i) => (i % 2 === 0 ? ox + offX + v * sc : oy + offY + v * sc));
  const q: number[] = [];
  strokeQuadPath(wq, { width, cap: 'round', join: 'round' }, false, q);
  const qc = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
  fillQuads(q, qc, inst, crv, rws);
}

export function renderGlyphBitmap(as: GlyphAsset, bx: number, by: number, bw: number, bh: number, cells: number, color: number[], alpha: number, t: number, draw: DrawHelpers) {
  const { sc, ox, oy } = place(as, bx, by, bw, bh);
  const cs = Math.max(as.W, as.H) / cells;
  const cols = Math.ceil(as.W / cs), rows = Math.ceil(as.H / cs), sweep = Math.floor(rows * t);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const nx = (i + 0.5) * cs, ny = (j + 0.5) * cs;
    if (!insidePoly(as.segs, nx, ny)) continue;
    const X0 = ox + i * cs * sc, Y0 = oy + j * cs * sc, X1 = ox + (i + 1) * cs * sc, Y1 = oy + (j + 1) * cs * sc;
    if (j <= sweep) draw.rect(X0 + 1, Y0 + 1, X1 - 1, Y1 - 1, color, alpha);
  }
  if (t < 1) { const yy = oy + sweep * cs * sc; draw.line([[ox - 18, yy], [ox + as.W * sc + 18, yy]], [0.36, 0.85, 0.97, 1], 6, alpha); }
}

export function renderGlyphField(as: GlyphAsset, bx: number, by: number, bw: number, bh: number, fine: number, alpha: number, t: number, draw: DrawHelpers, inst: number[], crv: number[], rws: number[]) {
  const { sc, ox: offX, oy: offY } = place(as, bx, by, bw, bh);
  const cs = Math.max(as.W, as.H) / fine, iso = 0.05, ext = 0.06 + 0.30 * t;
  const cols = Math.ceil(as.W / cs) + 2, rows = Math.ceil(as.H / cs) + 2;
  for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
    const nx = (i + 0.5) * cs, ny = (j + 0.5) * cs, d = sampleSDF(as, nx, ny), ad = Math.abs(d);
    if (ad > ext) continue;
    const X0 = offX + i * cs * sc, Y0 = offY + j * cs * sc, X1 = offX + (i + 1) * cs * sc, Y1 = offY + (j + 1) * cs * sc;
    if (d < 0) draw.rect(X0, Y0, X1, Y1, [0.97, 0.73, 0.33, 1], (0.12 + 0.10 * Math.max(0, Math.min(1, -d / 0.35))) * alpha);
    else draw.rect(X0, Y0, X1, Y1, [0.36, 0.85, 0.97, 1], 0.08 * (1 - ad / ext) * alpha);
    const band = (ad / iso) % 1;
    if (band < 0.16 || band > 0.84) draw.rect(X0, Y0, X1, Y1, d < 0 ? [0.97, 0.73, 0.33, 1] : [0.36, 0.85, 0.97, 1], 0.28 * alpha);
    if (ad < iso * 0.4) draw.rect(X0, Y0, X1, Y1, [0.94, 0.95, 0.97, 1], 0.82 * alpha);
  }
  renderGlyphOutline(as, bx, by, bw, bh, [0.94, 0.95, 0.97, 1], 3, 0.62 * alpha, inst, crv, rws, draw.ox, draw.oy);
}

export function renderGlyphTess(as: GlyphAsset, bx: number, by: number, bw: number, bh: number, sub: number, color: number[], alpha: number, t: number, inst: number[], crv: number[], rws: number[], ox = 0, oy = 0) {
  const { sc, ox: offX, oy: offY } = place(as, bx, by, bw, bh);
  const coarse = flattenNorm(as.quadsN, sub);
  const lq: number[] = [];
  for (const [x0, y0, x1, y1] of coarse) {
    const ax = ox + offX + x0 * sc, ay = oy + offY + y0 * sc, b1 = ox + offX + x1 * sc, c1 = oy + offY + y1 * sc;
    lq.push(ax, ay, (ax + b1) / 2, (ay + c1) / 2, b1, c1);
  }
  const qc = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0, 3), alpha * (color[3] ?? 1)];
  fillQuads(lq, qc, inst, crv, rws);
  const oq: number[] = [];
  strokeQuadPath(lq, { width: 2, cap: 'butt', join: 'bevel' }, false, oq);
  fillQuads(oq, [0.97, 0.73, 0.33, 0.9 * alpha], inst, crv, rws);
  renderGlyphOutline(as, bx, by, bw, bh, [0.94, 0.95, 0.97, 1], 1.6, 0.35 * alpha, inst, crv, rws, ox, oy);
  const { sc: sc2, ox: offX2, oy: offY2 } = place(as, bx, by, bw, bh);
  const cxp = ox + offX2 + as.W * sc2 * 0.5, cyp = oy + offY2 + as.H * sc2 * 0.5;
  const nFan = Math.max(5, Math.floor(34 * t));
  const step = Math.max(1, Math.floor(coarse.length / nFan));
  for (let k = 0; k < coarse.length; k += step) {
    const s = coarse[k];
    strokeInto([[cxp, cyp], [ox + offX2 + s[0] * sc2, oy + offY2 + s[1] * sc2]], { width: 2.2, cap: 'round', join: 'round' }, [0.97, 0.73, 0.33, 0.72 * alpha], inst, crv, rws);
  }
}
