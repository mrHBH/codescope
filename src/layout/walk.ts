// ── DOM walk + hit testing ───────────────────────────────────────────────────
// Reads layout boxes from the (hidden) browser DOM and builds the StyledEl
// tree that the renderer consumes. Also provides world-space hit testing.

import { parseColor } from '../css/engine';
import type { StyledEl, PageRect } from './types';

export function walkDOM(el: Element, parent: StyledEl | null, styledEls: StyledEl[]): StyledEl | null {
  if (el.tagName==='STYLE'||el.tagName==='SCRIPT') return null;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const cx = r.left, cy = r.top;
  if (r.width<2||r.height<2) return null;
  const pad = [parseFloat(cs.paddingTop)||0,parseFloat(cs.paddingRight)||0,parseFloat(cs.paddingBottom)||0,parseFloat(cs.paddingLeft)||0];
  let text='';for(const n of Array.from(el.childNodes))if(n.nodeType===3)text+=n.textContent||'';
  const fs=parseFloat(cs.fontSize)||16;
  const lh=cs.lineHeight==='normal'?fs*1.2:parseFloat(cs.lineHeight)||fs*1.2;
  const radius=parseFloat(cs.borderTopLeftRadius)||0;
  const display=cs.display;
  const inline=display==='inline'||display==='inline-block';
  // Pure inline (text spans) contribute no box; inline-block DOES paint a box
  // (buttons, badges, LEDs), so it gets a background/border baked.
  const inlineText=display==='inline';
  // Per-side border widths + colors. Only sides with a visible style contribute;
  // `border-style:none` reports width 0 in most browsers, but guard anyway.
  const bw = (w: string, style: string) => (style && style !== 'none' ? parseFloat(w) || 0 : 0);
  const borderW = [
    bw(cs.borderTopWidth, cs.borderTopStyle),
    bw(cs.borderRightWidth, cs.borderRightStyle),
    bw(cs.borderBottomWidth, cs.borderBottomStyle),
    bw(cs.borderLeftWidth, cs.borderLeftStyle),
  ];
  const borderC = [
    parseColor(cs.borderTopColor), parseColor(cs.borderRightColor),
    parseColor(cs.borderBottomColor), parseColor(cs.borderLeftColor),
  ];
  const isPre=el.tagName==='PRE';
  const upper=cs.textTransform==='uppercase';
  const editable=el.classList.contains('editable') && !isPre;
  const cl = el.classList;
  const dataPage = el.getAttribute('data-page');
  const pageIdx = dataPage != null ? parseInt(dataPage, 10) : -1;
  const ANIM = ['bounce','heartbeat','progress','pulse','glow','float','spin','shimmer'];
  let anim = '';
  for (const a of ANIM) if (cl.contains(a)) { anim = a; break; }
  const hoverable = cl.contains('btn') || cl.contains('card') || cl.contains('feature') || cl.contains('tab') || pageIdx >= 0 || el.tagName === 'A';
  const shadowable = cl.contains('card') || cl.contains('btn') || cl.contains('feature');
  // An element only needs per-frame dynamic-background work if it can hover,
  // cast a shadow, or run an animation. Everything else is baked into the static
  // buffers and skipped entirely by the frame loop.
  const dynamic = hoverable || shadowable || anim !== '';
  const iconName = el.getAttribute('data-icon');
  const artName = el.getAttribute('data-art');
  const icon = iconName ? 'icon:' + iconName : artName ? 'art:' + artName : '';
  const se: StyledEl = {
    tag: el.tagName, classes: Array.from(el.classList), id: el.id,
    x:cx, y:cy, w:r.width, h:r.height, pad,
    text:text.trim(),
    children:[], parent, el,
    fs, lh, radius,
    color: parseColor(cs.color),
    bg: parseColor(cs.backgroundColor),
    textAlign: cs.textAlign||'left', upper,
    curBg: parseColor(cs.backgroundColor),
    curShadow: 0,
    borderW, borderC,
    inline, skipText: false, hasFlow: false, isPre,
    inlineText,
    editable, editText: editable?text.trim():'', caret: editable?text.trim().length:0, selAnchor: -1, originText: editable?text.trim():'',
    caretXs: null, caretLines: null, lineTops: null,
    pageIdx, hoverable, shadowable, anim, dynamic, ownerPage: -1, icon,
  };
  styledEls.push(se);
  for(const child of Array.from(el.children)) {
    const c = walkDOM(child, se, styledEls);
    if(c){ if(c.inline) c.skipText=true; se.children.push(c); }
  }
  se.hasFlow = isPre || text.trim().length>0 || se.children.some(c=>c.inline);
  return se;
}

export function buildStyledEls(container: HTMLElement): { styledEls: StyledEl[]; pageRoots: StyledEl[] } {
  const styledEls: StyledEl[] = [];
  const pageRoots: StyledEl[] = [];
  for (const rootEl of Array.from(container.querySelectorAll('.page'))) {
    const before = styledEls.length;
    const r = walkDOM(rootEl, null, styledEls);
    if (r) {
      const pageNo = pageRoots.length;
      pageRoots.push(r);
      // Tag every element produced by this page walk with its owning page index,
      // so the frame loop can cull whole off-screen pages cheaply.
      for (let i = before; i < styledEls.length; i++) styledEls[i].ownerPage = pageNo;
    }
  }
  return { styledEls, pageRoots };
}

export function hitTest(root: StyledEl, wx: number, wy: number): StyledEl | null {
  function find(el: StyledEl): StyledEl | null {
    for (let i = el.children.length - 1; i >= 0; i--) {
      const c = el.children[i];
      if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) { const deeper = find(c); return deeper || c; }
    }
    return null;
  }
  if (wx >= root.x && wx <= root.x + root.w && wy >= root.y && wy <= root.y + root.h) return find(root) || root;
  return null;
}

export function findEditableAncestor(el: StyledEl | null): StyledEl | null {
  let cur = el;
  while (cur && !cur.editable) cur = cur.parent;
  return cur;
}
