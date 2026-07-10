import { parse, Font, Glyph, Path } from 'opentype.js';

export interface FontFace {
  unitsPerEm: number;
  charToGlyph(ch: string): Glyph;
  getKerningValue(a: Glyph, b: Glyph): number;
}

export function parseFont(buffer: ArrayBuffer): FontFace {
  return parse(buffer) as unknown as FontFace;
}

export async function loadFont(url: string | URL): Promise<FontFace> {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  return parseFont(buf);
}

function cubicToQuads(x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, out: number[]) {
  const m = (a: number, b: number) => (a + b) / 2;
  const ax = m(x0, c1x), ay = m(y0, c1y), bx = m(c1x, c2x), by = m(c1y, c2y);
  const cx = m(c2x, x1), cy = m(c2y, y1), dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy);
  const mx = m(dx, ex), my = m(dy, ey);
  out.push(x0, y0, 1.5 * dx - 0.25 * (x0 + mx), 1.5 * dy - 0.25 * (y0 + my), mx, my);
  out.push(mx, my, 1.5 * ex - 0.25 * (mx + x1), 1.5 * ey - 0.25 * (my + y1), x1, y1);
}

export function glyphQuads(font: FontFace, ch: string) {
  const g = font.charToGlyph(ch);
  if (g.index === 0) return null; // skip .notdef
  const path = g.getPath(0, 0, font.unitsPerEm);
  const quads: number[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => quads.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1);
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of path.commands) {
    if (c.type === 'M') { cx = c.x; cy = c.y; sx = c.x; sy = c.y; }
    else if (c.type === 'L') { line(cx, cy, c.x, c.y); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') { quads.push(cx, cy, c.x1, c.y1, c.x, c.y); cx = c.x; cy = c.y; }
    else if (c.type === 'C') { cubicToQuads(cx, cy, c.x1, c.y1, c.x2, c.y2, c.x, c.y, quads); cx = c.x; cy = c.y; }
    else if (c.type === 'Z') { if (cx !== sx || cy !== sy) line(cx, cy, sx, sy); cx = sx; cy = sy; }
  }
  if (quads.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < quads.length; i += 2) {
    x0 = Math.min(x0, quads[i]); x1 = Math.max(x1, quads[i]);
    y0 = Math.min(y0, quads[i + 1]); y1 = Math.max(y1, quads[i + 1]);
  }
  return { quads, advance: g.advanceWidth, bbox: [x0, y0, x1, y1] as number[] };
}

export function advanceOf(font: FontFace, ch: string): number {
  return font.charToGlyph(ch).advanceWidth || 0;
}

export function kerningOf(font: FontFace, a: string, b: string): number {
  return font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b));
}
