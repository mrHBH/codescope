// ── Static precompute ───────────────────────────────────────────────────────
// One-time work done after the layout tree + atlas exist: the immutable
// background rects, the <pre> syntax-highlight cache, and the static text
// instances (everything except marquee + editable elements, which reflow
// every frame).

import type { AppState } from './state';
import type { StyledEl } from './layout/types';
import { addRect, layoutIcon } from './layout/metrics';
import { layoutFlow, layoutPre } from './layout/flow';
import { highlightCode } from './layout/metrics';

// Emit the four border edges of an element as thin rects. Widths are in world
// px (already DOM-measured). Each side draws only when width>0 and alpha>0.
function addBorders(el: StyledEl, crv: number[], rws: number[], out: number[]) {
  const [wt, wr, wb, wl] = el.borderW;
  const [ct, cr, cb, cl] = el.borderC;
  const x0 = el.x, y0 = el.y, x1 = el.x + el.w, y1 = el.y + el.h;
  if (wt > 0 && ct[3] > 0.001) addRect(x0, y0, x1, y0 + wt, ct, crv, rws, out);
  if (wb > 0 && cb[3] > 0.001) addRect(x0, y1 - wb, x1, y1, cb, crv, rws, out);
  if (wl > 0 && cl[3] > 0.001) addRect(x0, y0 + wt, x0 + wl, y1 - wb, cl, crv, rws, out);
  if (wr > 0 && cr[3] > 0.001) addRect(x1 - wr, y0 + wt, x1, y1 - wb, cr, crv, rws, out);
}

export function buildStatic(s: AppState) {
  const nPages = s.pageRoots.length;
  // Per-page static background + text instance buffers. The curve/row arrays
  // (preCrv/preRws) stay whole and are always uploaded, so every instance's
  // band index (rowBase) remains valid; only the *instances* are culled by page.
  const bgByPage: number[][] = Array.from({ length: nPages }, () => []);
  const textByPage: number[][] = Array.from({ length: nPages }, () => []);

  // Layer 1 static backgrounds: page rects + non-animated element backgrounds + borders
  const preCrv: number[] = [], preRws: number[] = [];
  for (let p = 0; p < nPages; p++) {
    const pg = s.pageRoots[p];
    addRect(pg.x, pg.y, pg.x + pg.w, pg.y + pg.h, s.themeCol.pageBg, preCrv, preRws, bgByPage[p]);
  }
  for (const el of s.styledEls) {
    if (el.inlineText || el.anim !== '') continue;
    const p = el.ownerPage; if (p < 0) continue;
    if (el.curBg[3] > 0.001) addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, preCrv, preRws, bgByPage[p]);
    addBorders(el, preCrv, preRws, bgByPage[p]);
  }
  // bandPieces numbered these rects' rows (row.start = curve-piece index) and the
  // instances' rowBase relative to the pre buffers starting at 0. But the frame
  // loop appends preCrv/preRws AFTER the base atlas buffers, so every baked band
  // index must be shifted by the base atlas size to become absolute in the
  // combined buffer the shader reads. Without this, background/border rects read
  // glyph band data instead of their own (fills vanish, borders render garbled).
  const basePieces = s.atlas.curves.length / 6; // 3 vec2 (6 floats) per monotone piece
  const baseRows = s.atlas.rows.length / 5;      // ROW_STRIDE = 5 uint32 per band row
  for (let r = 0; r < preRws.length; r += 5) preRws[r] += basePieces;
  for (const buf of bgByPage) for (let i = 12; i < buf.length; i += 16) buf[i] += baseRows;
  s.preCrv = preCrv; s.preRws = preRws;
  s.preCrvLen = preCrv.length; s.preRwsLen = preRws.length;

  // Syntax highlighting cache (text never changes, only re-layout needed)
  for (const el of s.styledEls) {
    if (el.isPre && el.text) s.highlightCache.set(el, highlightCode(el.text));
  }

  // Static text instances (non-marquee, non-editable), grouped by page.
  for (const el of s.styledEls) {
    if (el.icon) {
      const p = el.ownerPage; if (p < 0) continue;
      const gl = s.atlas.table[el.icon];
      const pad = 2; // small inset so glyph-style icons breathe inside their box
      layoutIcon(textByPage[p], gl, { x: el.x + pad, y: el.y + pad, w: el.w - 2 * pad, h: el.h - 2 * pad }, el.color);
      continue;
    }
    if (!el.hasFlow || el.skipText || el.editable) continue;
    if (el.classes.includes('marquee')) continue;
    const p = el.ownerPage; if (p < 0) continue;
    if (el.isPre) layoutPre(el, s.font, s.atlas, textByPage[p], s.highlightCache);
    else layoutFlow(el, s.font, s.atlas, textByPage[p], 0);
  }

  s.bgByPage = bgByPage;
  s.textByPage = textByPage;

  // Base atlas curve/row data (immutable after atlas build)
  s.baseCrv = Array.from(s.atlas.curves);
  s.baseRws = Array.from(s.atlas.rows);
  s.baseCrvLen = s.baseCrv.length;
  s.baseRwsLen = s.baseRws.length;
}
