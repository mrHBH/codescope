// ── Static precompute ───────────────────────────────────────────────────────
// One-time work done after the layout tree + atlas exist: the immutable
// background rects, the <pre> syntax-highlight cache, and the static text
// instances (everything except marquee + editable elements, which reflow
// every frame).

import type { AppState } from './state';
import { addRect } from './layout/metrics';
import { layoutFlow, layoutPre } from './layout/flow';
import { highlightCode } from './layout/metrics';

const ANIMATED = ['bounce','heartbeat','progress','pulse','glow','float','spin','shimmer'];

export function buildStatic(s: AppState) {
  // Layer 1 static backgrounds: page rects + non-animated element backgrounds
  const preCrv: number[] = [], preRws: number[] = [], preInst: number[] = [];
  for (const pg of s.pageRoots) addRect(pg.x, pg.y, pg.x + pg.w, pg.y + pg.h, s.themeCol.pageBg, preCrv, preRws, preInst);
  for (const el of s.styledEls) {
    if (el.inline || el.curBg[3] <= 0.001) continue;
    if (ANIMATED.some(c => el.classes.includes(c))) continue;
    addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, preCrv, preRws, preInst);
  }
  s.preCrv = preCrv; s.preRws = preRws; s.preInst = preInst;
  s.preCrvLen = preCrv.length; s.preRwsLen = preRws.length; s.preInstLen = preInst.length;

  // Syntax highlighting cache (text never changes, only re-layout needed)
  for (const el of s.styledEls) {
    if (el.isPre && el.text) s.highlightCache.set(el, highlightCode(el.text));
  }

  // Static text instances (non-marquee, non-editable)
  const preTextTmp: number[] = [];
  for (const el of s.styledEls) {
    if (!el.hasFlow || el.skipText || el.editable) continue;
    if (el.classes.includes('marquee')) continue;
    if (el.isPre) layoutPre(el, s.font, s.atlas, preTextTmp, s.highlightCache);
    else layoutFlow(el, s.font, s.atlas, preTextTmp, 0);
  }
  s.preTextInst = preTextTmp;
  s.preTextLen = preTextTmp.length;

  // Base atlas curve/row data (immutable after atlas build)
  s.baseCrv = Array.from(s.atlas.curves);
  s.baseRws = Array.from(s.atlas.rows);
  s.baseCrvLen = s.baseCrv.length;
  s.baseRwsLen = s.baseRws.length;
}
