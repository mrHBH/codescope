// ── Editable text layout + caret ─────────────────────────────────────────────
// Wraps an element's edit buffer, records per-character caret x-positions (for
// click-to-place + caret rendering), draws the selection highlight behind the
// glyphs, then pushes glyph instances. Re-runs every frame so edits reflow
// live through the analytic pipeline.

import type { FontFace } from '../windfoil/font';
import type { StyledEl } from './types';
import { advanceOf, kerningOf } from '../windfoil/font';
import { addRect } from './metrics';

export function layoutEditable(el: StyledEl, font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], caretW: number, now: number, showCaret: boolean, caretColor: number[], selColor: number[]) {
  const left = el.x + el.pad[3], right = el.x + el.w - el.pad[1];
  const top = el.y + el.pad[0];
  const text = el.editText, size = el.fs, s = size / font.unitsPerEm;
  const n = text.length;
  const cx0: number[] = new Array(n + 1).fill(0);
  const cline: number[] = new Array(n + 1).fill(0);
  const lineTops: number[] = [top];
  const glyphs: { x: number; bl: number; gl: any }[] = [];
  let curX = left, curY = top, lineIdx = 0, prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (ch === '\n') { curX = left; curY += el.lh; lineIdx++; lineTops[lineIdx] = curY; prev = null; cx0[i] = curX; cline[i] = lineIdx; continue; }
    let adv = advanceOf(font, ch) * s; if (prev) adv += kerningOf(font, prev, ch) * s;
    if (curX + adv > right && curX > left) { curX = left; curY += el.lh; lineIdx++; lineTops[lineIdx] = curY; }
    const x = curX, bl = curY + size * 0.8;
    cx0[i] = x; cline[i] = lineIdx;
    if (ch !== ' ' && ch !== '\t') { const gl = atlas.table[ch]; if (gl) glyphs.push({ x, bl, gl }); }
    curX += adv; prev = ch;
  }
  cx0[n] = curX; cline[n] = lineIdx;
  el.caretXs = cx0; el.caretLines = cline; el.lineTops = lineTops;

  const a = Math.min(el.caret, el.selAnchor < 0 ? el.caret : el.selAnchor);
  const b = Math.max(el.caret, el.selAnchor < 0 ? el.caret : el.selAnchor);
  if (b > a) {
    const sel: number[] = [selColor[0], selColor[1], selColor[2], 0.35];
    for (let i = a; i < b; i++) {
      const x0 = cx0[i], x1 = cx0[i + 1]; if (x1 - x0 < 0.5) continue;
      const ln = cline[i], y0 = lineTops[ln], y1 = y0 + el.lh;
      addRect(x0, y0, x1, y1, sel, crv, rws, inst);
    }
  }
  for (const g of glyphs) { const gl = g.gl; inst.push(g.x, g.bl, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], el.color[0], el.color[1], el.color[2], el.color[3], gl.rowBase, gl.bandCount, gl.y0, gl.invH); }

  // Caret: a thin bar, vertically centered on the text line. Height tracks the
  // element font size so it lines up with the glyphs at any zoom.
  if (showCaret && (now % 1060) < 530) {
    const ci = Math.max(0, Math.min(n, el.caret)), ln = cline[ci], x = cx0[ci];
    const caretH = el.fs;
    const yc = lineTops[ln] + el.lh / 2;
    const y0 = yc - caretH / 2, y1 = yc + caretH / 2;
    addRect(x, y0, x + caretW, y1, caretColor, crv, rws, inst);
  }
}

// Place the caret at the character boundary nearest to a world-space point.
export function placeCaretAtPoint(el: StyledEl, wx: number, wy: number) {
  if (!el.caretXs || !el.caretLines || !el.lineTops) return;
  const cx0 = el.caretXs, cline = el.caretLines, lineTops = el.lineTops;
  let bestLn = 0, bestD = Infinity;
  for (let ln = 0; ln < lineTops.length; ln++) { const d = Math.abs(wy - (lineTops[ln] + el.lh / 2)); if (d < bestD) { bestD = d; bestLn = ln; } }
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i <= el.editText.length; i++) { if (cline[i] !== bestLn) continue; const d = Math.abs(cx0[i] - wx); if (d < bestDist) { bestDist = d; bestIdx = i; } }
  el.caret = bestIdx; el.selAnchor = -1;
}
