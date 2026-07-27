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
import { buildStyledEls, HOVER_FX_MOVES_TEXT } from './layout/walk';
import { resolveStyle, parseColor } from './css/engine';

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

  // Precompute each interactive element's hover/active background ONCE (per theme).
  // The frame loop previously ran the CSS selector matcher (resolveStyle over every
  // rule) each frame for the hovered element — hovering over controls while moving
  // the mouse tanked FPS. These colours only change on theme switch (which re-runs
  // buildStatic), so cache them here.
  for (const el of s.styledEls) {
    if (!el.dynamic && !el.hoverable) { el.hoverBg = null; el.activeBg = null; continue; }
    const hov = resolveStyle(el, s.cssRules, 'hover');
    const act = resolveStyle(el, s.cssRules, 'active');
    const hc = parseColor(hov['background-color'] || hov.background || '');
    const ac = parseColor(act['background-color'] || act.background || '');
    el.hoverBg = hc[3] > 0.001 ? hc : null;
    el.activeBg = ac[3] > 0.001 ? ac : null;
  }

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
    // Physical hover effects (push/key/dent) translate the button, so their label
    // is re-laid-out every frame in the dynamic pass instead of being baked here.
    if (HOVER_FX_MOVES_TEXT.has(el.hoverFx)) continue;
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
  s.staticCrv = s.baseCrv.concat(preCrv);
  s.staticRws = s.baseRws.concat(preRws);
  s.staticCrvLen = s.staticCrv.length;
  s.staticRwsLen = s.staticRws.length;
}

// Re-derive the whole layout tree from the (mutated) hidden DOM and rebuild the
// baked buffers. Called after an interaction changes the DOM (toggle flip, tab
// switch, dropdown expand/collapse, slider move) — those may reflow the page, so
// every element's geometry is re-measured. The camera/editor state is untouched.
export function refreshLayout(s: AppState) {
  const { styledEls, pageRoots } = buildStyledEls(s.container);
  s.styledEls = styledEls;
  s.pageRoots = pageRoots;
  s.docRoot.children = pageRoots;
  s.docH = (styledEls.length ? Math.max(...styledEls.map((e) => e.y + e.h)) : 0) + 60;
  s.docRoot.h = s.docH;
  s.pages = pageRoots.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  s.editableEls = styledEls.filter((e) => e.editable);
  s.dynamicEls = styledEls.filter((e) => e.dynamic);
  s.marqueeEls = styledEls.filter((e) => e.hasFlow && !e.skipText && e.classes.includes('marquee'));
  if (s.pageVisible.length !== pageRoots.length) s.pageVisible = new Array(pageRoots.length).fill(true);
  s.activeEdit = null;
  s.pressed = null;
  s.highlightCache.clear();
  buildStatic(s);
}

