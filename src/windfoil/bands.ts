import { pushMonotonePieces } from './geometry';
import { glyphQuads, FontFace } from './font';

const TARGET_PER_BAND = 10;
const MAX_BANDS = 64;
export const BAND_SORT_MIN = 4;

function chooseBands(pieceCount: number, targetPerBand: number): number {
  if (pieceCount <= targetPerBand) return 1;
  return Math.min(Math.ceil(pieceCount / targetPerBand), MAX_BANDS);
}

function bandIndex(y: number, y0: number, invH: number, R: number): number {
  if (invH <= 0) return 0;
  return Math.min(Math.max(Math.floor((y - y0) * invH), 0), R - 1);
}

function monoRootT(a: number, b: number, e0: number, e1: number, v: number, rising: boolean): number {
  if (rising ? e0 >= v : e0 <= v) return 0;
  if (rising ? e1 <= v : e1 >= v) return 1;
  const c = e0 - v;
  if (Math.abs(a) < 1e-12 * Math.max(Math.abs(b), 1)) return Math.min(Math.max(-c / b, 0), 1);
  const disc = Math.max(b * b - 4 * a * c, 0);
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc));
  const r1 = q / a, r2 = q !== 0 ? c / q : 0;
  const want = rising ? 1 : -1;
  const t = (2 * a * r1 + b) * want >= 0 ? r1 : r2;
  return Math.min(Math.max(t, 0), 1);
}

function bandWindingArea(pieces: number[], bucket: number[], x0: number, b0: number, b1: number): number {
  let area = 0;
  for (const k of bucket) {
    const p = k * 6;
    const X0 = pieces[p], Y0 = pieces[p + 1], CX = pieces[p + 2], CY = pieces[p + 3], X1 = pieces[p + 4], Y1 = pieces[p + 5];
    const lo = Math.max(b0, Math.min(Y0, Y1));
    const hi = Math.min(b1, Math.max(Y0, Y1));
    if (hi <= lo) continue;
    const rising = Y1 >= Y0;
    const ay = Y0 - 2 * CY + Y1, by = 2 * (CY - Y0);
    const tA = monoRootT(ay, by, Y0, Y1, rising ? lo : hi, rising);
    const tB = monoRootT(ay, by, Y0, Y1, rising ? hi : lo, rising);
    if (tB <= tA) continue;
    const ax = X0 - 2 * CX + X1, bx = 2 * (CX - X0), cx = X0 - x0;
    const c3 = 2 * ax * ay, c2 = ax * by + 2 * bx * ay, c1 = bx * by + 2 * cx * ay, c0 = cx * by;
    const F = (t: number) => ((c3 / 4 * t + c2 / 3) * t + c1 / 2) * t * t + c0 * t;
    area += F(tB) - F(tA);
  }
  return area;
}

const punBuf = new DataView(new ArrayBuffer(4));
function f32bits(v: number): number {
  punBuf.setFloat32(0, Math.fround(v), true);
  return punBuf.getUint32(0, true);
}

export interface BandHeader {
  rowBase: number;
  bandCount: number;
  y0: number;
  invH: number;
}

export function bandPieces(
  pieces: number[], y0: number, y1: number,
  curveOut: number[], rowOut: number[],
  targetPerBand = TARGET_PER_BAND,
): BandHeader {
  const n = pieces.length / 6;
  const R = chooseBands(n, targetPerBand);
  const invH = R > 1 && y1 > y0 ? R / (y1 - y0) : 0;

  const buckets: number[][] = Array.from({ length: R }, () => []);
  let xLeft = Infinity;
  for (let k = 0; k < n; k++) {
    const yLo = Math.min(pieces[k * 6 + 1], pieces[k * 6 + 3], pieces[k * 6 + 5]);
    const yHi = Math.max(pieces[k * 6 + 1], pieces[k * 6 + 3], pieces[k * 6 + 5]);
    const lo = bandIndex(yLo, y0, invH, R);
    const hi = bandIndex(yHi, y0, invH, R);
    for (let b = lo; b <= hi; b++) buckets[b].push(k);
    xLeft = Math.min(xLeft, pieces[k * 6], pieces[k * 6 + 2], pieces[k * 6 + 4]);
  }

  const rowBase = rowOut.length / 5;
  const bandH = R > 1 ? (y1 - y0) / R : y1 - y0;
  const xMax = (k: number) => Math.max(pieces[k * 6], pieces[k * 6 + 2], pieces[k * 6 + 4]);
  const xMin = (k: number) => Math.min(pieces[k * 6], pieces[k * 6 + 2], pieces[k * 6 + 4]);
  for (let b = 0; b < R; b++) {
    const bucket = buckets[b];
    if (bucket.length > BAND_SORT_MIN) bucket.sort((a, c) => xMax(c) - xMax(a));
    const start = curveOut.length / 6;
    let bxMin = 3e38, bxMax = -3e38;
    for (const k of bucket) {
      for (let j = 0; j < 6; j++) curveOut.push(pieces[k * 6 + j]);
      bxMin = Math.min(bxMin, xMin(k));
      bxMax = Math.max(bxMax, xMax(k));
    }
    const area = n ? bandWindingArea(pieces, bucket, xLeft, y0 + b * bandH, y0 + (b + 1) * bandH) : 0;
    rowOut.push(start, bucket.length, f32bits(area), f32bits(bxMin), f32bits(bxMax));
  }
  return { rowBase, bandCount: R, y0, invH };
}

export interface GlyphAtlas {
  curves: Float32Array;
  rows: Uint32Array;
  table: Record<string, BandHeader & { advance: number; bbox: number[] }>;
  stats: { uniqueGlyphs: number; monotonePieces: number; bandCount: number; bandedPieces: number; duplication: number };
}

// Extra vector shapes (icons/illustrations) baked into the same atlas as glyphs.
// Keyed by an arbitrary name; `quads`/`bbox` come from svgPathToQuads.
export interface VectorShape { quads: number[]; bbox: number[]; }

export function buildGlyphAtlas(font: FontFace, text: string, shapes?: Record<string, VectorShape>): GlyphAtlas {
  const chars = [...new Set([...text])].filter((ch) => ch !== ' ');
  const curves: number[] = [];
  const rows: number[] = [];
  const table: Record<string, any> = {};
  let monotoneTotal = 0;
  for (const ch of chars) {
    const g = glyphQuads(font, ch);
    if (!g) continue;
    const pieces: number[] = [];
    for (let i = 0; i < g.quads.length; i += 6) pushMonotonePieces(g.quads.slice(i, i + 6), pieces);
    monotoneTotal += pieces.length / 6;
    const [, y0, , y1] = g.bbox;
    const header = bandPieces(pieces, y0, y1, curves, rows);
    table[ch] = { ...header, advance: g.advance, bbox: g.bbox };
  }
  if (shapes) {
    for (const name in shapes) {
      const sh = shapes[name];
      if (!sh.quads.length) continue;
      const pieces: number[] = [];
      for (let i = 0; i < sh.quads.length; i += 6) pushMonotonePieces(sh.quads.slice(i, i + 6), pieces);
      monotoneTotal += pieces.length / 6;
      const [, y0, , y1] = sh.bbox;
      const header = bandPieces(pieces, y0, y1, curves, rows);
      table[name] = { ...header, advance: sh.bbox[2] - sh.bbox[0], bbox: sh.bbox };
    }
  }
  const bandedPieces = curves.length / 6;
  return {
    curves: new Float32Array(curves),
    rows: new Uint32Array(rows),
    table,
    stats: {
      uniqueGlyphs: Object.keys(table).length,
      monotonePieces: monotoneTotal,
      bandCount: rows.length / 5,
      bandedPieces,
      duplication: monotoneTotal ? bandedPieces / monotoneTotal : 1,
    },
  };
}
