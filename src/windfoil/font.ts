import { parse, Glyph } from 'opentype.js';
import { cubicToQuads, lineToQuad, quadsBBox } from './geometry';

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

export function glyphQuads(font: FontFace, ch: string) {
  const g = font.charToGlyph(ch);
  if (g.index === 0) return null; // skip .notdef
  const path = g.getPath(0, 0, font.unitsPerEm);
  const quads: number[] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of path.commands) {
    if (c.type === 'M') { cx = c.x; cy = c.y; sx = c.x; sy = c.y; }
    else if (c.type === 'L') { lineToQuad(cx, cy, c.x, c.y, quads); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') { quads.push(cx, cy, c.x1, c.y1, c.x, c.y); cx = c.x; cy = c.y; }
    else if (c.type === 'C') { cubicToQuads(cx, cy, c.x1, c.y1, c.x2, c.y2, c.x, c.y, quads); cx = c.x; cy = c.y; }
    else if (c.type === 'Z') { if (cx !== sx || cy !== sy) lineToQuad(cx, cy, sx, sy, quads); cx = sx; cy = sy; }
  }
  const bbox = quadsBBox(quads);
  if (!bbox) return null;
  return { quads, advance: g.advanceWidth, bbox };
}

export function advanceOf(font: FontFace, ch: string): number {
  return font.charToGlyph(ch).advanceWidth || 0;
}

export function kerningOf(font: FontFace, a: string, b: string): number {
  return font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b));
}
