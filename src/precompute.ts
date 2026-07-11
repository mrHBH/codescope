// ── Static precompute ───────────────────────────────────────────────────────
// One-time work done after the layout tree + atlas exist: the immutable
// background rects, the <pre> syntax-highlight cache, and the static text
// instances (everything except marquee + editable elements, which reflow
// every frame).

import type { AppState } from './state';
import { addRect, layoutIcon } from './layout/metrics';
import { layoutFlow, layoutPre } from './layout/flow';
import { highlightCode } from './layout/metrics';

export function buildStatic(s: AppState) {
  const nPages = s.pageRoots.length;
  // Per-page static background + text instance buffers. The curve/row arrays
  // (preCrv/preRws) stay whole and are always uploaded, so every instance's
  // band index (rowBase) remains valid; only the *instances* are culled by page.
  const bgByPage: number[][] = Array.from({ length: nPages }, () => []);
  const textByPage: number[][] = Array.from({ length: nPages }, () => []);

  // Layer 1 static backgrounds: page rects + non-animated element backgrounds
  const preCrv: number[] = [], preRws: number[] = [];
  for (let p = 0; p < nPages; p++) {
    const pg = s.pageRoots[p];
    addRect(pg.x, pg.y, pg.x + pg.w, pg.y + pg.h, s.themeCol.pageBg, preCrv, preRws, bgByPage[p]);
  }
  for (const el of s.styledEls) {
    if (el.inline || el.curBg[3] <= 0.001) continue;
    if (el.anim !== '') continue;
    const p = el.ownerPage; if (p < 0) continue;
    addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, preCrv, preRws, bgByPage[p]);
  }
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
