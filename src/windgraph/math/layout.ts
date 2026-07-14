// ── windgraph · math box layout (Phase 6) ────────────────────────────────────
// TeX-style box-and-glue layout: turns the parsed AST into positioned glyph,
// rule, and path primitives in EM units (1 = font size), y-DOWN with the main
// baseline at 0. `MathTex` then scales these to world px and emits analytic
// instances — so the math is razor-sharp at any zoom.

import { MI, MN, SZ } from './fonts';
import type { Node, Cls } from './parse';

export interface PGlyph { kind: 'glyph'; key: string; x: number; y: number; s: number; }
export interface PRule { kind: 'rule'; x: number; y: number; w: number; h: number; }
export interface PPath { kind: 'path'; pts: [number, number][]; w: number; }
export type Placed = PGlyph | PRule | PPath;

export interface Box { w: number; h: number; d: number; items: Placed[]; }

export interface Atlas { table: Record<string, any>; }

const AXIS = 0.25;          // math axis height (em) — fraction bars / big ops center here
const RULE = 0.048;         // default rule thickness (em)
const SCRIPT = 0.7;         // script scale factor
const SS = 0.5;             // scriptscript scale factor
const GREEKL = 'αβγδεζηθικλμνξοπρστυφχψω';
const GREEKU = 'ΓΔΘΛΞΠΣΦΨΩ';

function isLetter(ch: string): boolean { return /[a-zA-Z]/.test(ch) || GREEKL.includes(ch) || GREEKU.includes(ch); }

// Pick the atlas key (and metrics entry) for a char + class.
function resolve(atlas: Atlas, ch: string, cls: Cls): { key: string; e: any } | null {
  const t = atlas.table;
  const prefix = cls === 'var' && isLetter(ch) ? MI : MN;
  if (t[prefix + ch]) return { key: prefix + ch, e: t[prefix + ch] };
  if (t[MN + ch]) return { key: MN + ch, e: t[MN + ch] };
  if (t[MI + ch]) return { key: MI + ch, e: t[MI + ch] };
  return null;
}
function upmOf(e: any): number { return e.upm || 1000; }

function glyphBox(atlas: Atlas, ch: string, cls: Cls, scale: number): Box {
  const r = resolve(atlas, ch, cls);
  if (!r) return { w: 0.3 * scale, h: 0.5 * scale, d: 0, items: [] };
  const upm = upmOf(r.e);
  const w = (r.e.advance / upm) * scale;
  const h = Math.max(0, -r.e.bbox[1] / upm) * scale;
  const d = Math.max(0, r.e.bbox[3] / upm) * scale;
  return { w, h, d, items: [{ kind: 'glyph', key: r.key, x: 0, y: 0, s: scale }] };
}

// Horizontal spacing (em) inserted around binary / relation atoms.
function spacingFor(cls: Cls | undefined, scale: number): number {
  if (cls === 'bin') return 0.22 * scale;
  if (cls === 'rel') return 0.28 * scale;
  if (cls === 'punct') return 0.12 * scale;
  return 0;
}

function shift(items: Placed[], dx: number, dy: number): Placed[] {
  return items.map((p) => {
    if (p.kind === 'glyph') return { ...p, x: p.x + dx, y: p.y + dy };
    if (p.kind === 'rule') return { ...p, x: p.x + dx, y: p.y + dy };
    return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  });
}

export function layout(node: Node, atlas: Atlas, scale = 1): Box {
  switch (node.t) {
    case 'row': return layoutRow(node.items, atlas, scale);
    case 'char': return glyphBox(atlas, node.ch, node.cls, scale);
    case 'scripted': return layoutScripted(node, atlas, scale);
    case 'frac': return layoutFrac(node, atlas, scale);
    case 'sqrt': return layoutSqrt(node, atlas, scale);
    case 'bigop': return layoutBigop(node, atlas, scale);
  }
}

function layoutRow(items: Node[], atlas: Atlas, scale: number): Box {
  let x = 0, h = 0, d = 0;
  const out: Placed[] = [];
  let prevCls: Cls | undefined;
  for (const it of items) {
    const cls = it.t === 'char' ? it.cls : undefined;
    // Space before binary/relation (not at the very start).
    if (x > 0 && (cls === 'bin' || cls === 'rel' || cls === 'punct')) x += spacingFor(cls, scale);
    const b = layout(it, atlas, scale);
    out.push(...shift(b.items, x, 0));
    x += b.w;
    if (cls === 'bin' || cls === 'rel') x += spacingFor(cls, scale);
    h = Math.max(h, b.h); d = Math.max(d, b.d);
    prevCls = cls;
  }
  void prevCls;
  return { w: x, h, d, items: out };
}

function layoutScripted(node: Extract<Node, { t: 'scripted' }>, atlas: Atlas, scale: number): Box {
  const b = layout(node.base, atlas, scale);
  const ss = scale * SCRIPT;
  const out: Placed[] = [...b.items];
  let w = b.w, h = b.h, d = b.d;
  const kern = 0.05 * scale;
  const sx = b.w + kern;
  if (node.sup) {
    const sb = layout(node.sup, atlas, ss);
    const supBaseline = -(Math.max(b.h - 0.15 * scale, 0.45 * scale) + sb.d);
    out.push(...shift(sb.items, sx, supBaseline));
    w = Math.max(w, sx + sb.w);
    h = Math.max(h, -supBaseline + sb.h);
  }
  if (node.sub) {
    const bb = layout(node.sub, atlas, ss);
    const subBaseline = Math.max(b.d + 0.1 * scale, 0.25 * scale) + bb.h;
    out.push(...shift(bb.items, sx, subBaseline));
    w = Math.max(w, sx + bb.w);
    d = Math.max(d, subBaseline + bb.d);
  }
  return { w, h, d, items: out };
}

function layoutFrac(node: Extract<Node, { t: 'frac' }>, atlas: Atlas, scale: number): Box {
  const n = layout(node.num, atlas, scale * 0.95);
  const de = layout(node.den, atlas, scale * 0.95);
  const t = RULE * scale;
  const axis = AXIS * scale;
  const gap = 0.14 * scale;
  const pad = 0.12 * scale;
  const w = Math.max(n.w, de.w) + 2 * pad;
  const numX = (w - n.w) / 2, denX = (w - de.w) / 2;
  const barTop = -axis - t / 2;
  const numBaseline = barTop - gap - n.d;
  const denBaseline = -axis + t / 2 + gap + de.h;
  const out: Placed[] = [];
  out.push(...shift(n.items, numX, numBaseline));
  out.push(...shift(de.items, denX, denBaseline));
  out.push({ kind: 'rule', x: 0, y: barTop, w, h: t });
  return { w, h: -numBaseline + n.h, d: denBaseline + de.d, items: out };
}

function layoutSqrt(node: Extract<Node, { t: 'sqrt' }>, atlas: Atlas, scale: number): Box {
  const b = layout(node.body, atlas, scale);
  const t = RULE * scale;
  const pad = 0.08 * scale;
  const radW = 0.55 * scale;
  const top = -(b.h + 0.12 * scale);
  const bottom = b.d;
  const bodyX = radW + pad;
  const out: Placed[] = [];
  // Radical mark as a stroked path (crisp at any zoom via the stroke engine).
  const midLow = top + (bottom - top) * 0.55;
  out.push({ kind: 'path', w: t * 1.1, pts: [
    [0, midLow], [0.18 * scale, bottom], [0.42 * scale, top + t / 2], [bodyX + b.w, top + t / 2],
  ] });
  out.push(...shift(b.items, bodyX, 0));
  return { w: bodyX + b.w + pad, h: -top, d: bottom, items: out };
}

function layoutBigop(node: Extract<Node, { t: 'bigop' }>, atlas: Atlas, scale: number): Box {
  const t = atlas.table;
  const key = t[SZ + node.ch] ? SZ + node.ch : (t[MN + node.ch] ? MN + node.ch : null);
  const useLimits = node.ch === '∑' || node.ch === '∏' || node.ch === '⋃' || node.ch === '⋂';
  let opW = 0.9 * scale, opH = 0.9 * scale, opD = 0.3 * scale;
  const opItems: Placed[] = [];
  if (key) {
    const e = t[key], upm = upmOf(e);
    opW = (e.advance / upm) * scale;
    opH = Math.max(0, -e.bbox[1] / upm) * scale;
    opD = Math.max(0, e.bbox[3] / upm) * scale;
    // Center the operator on the math axis.
    const center = (opD - opH) / 2;
    const shiftY = -AXIS * scale - center;
    opItems.push({ kind: 'glyph', key, x: 0, y: shiftY, s: scale });
    opH -= shiftY; // extend height by the upward shift
    opD += shiftY;
  }
  const ss = scale * SCRIPT;
  const out: Placed[] = [];
  let w = opW, h = opH, d = opD;

  if (useLimits) {
    const opTop = -opH, opBot = opD;
    let maxW = opW;
    const sup = node.sup ? layout(node.sup, atlas, ss) : null;
    const sub = node.sub ? layout(node.sub, atlas, ss) : null;
    if (sup) maxW = Math.max(maxW, sup.w);
    if (sub) maxW = Math.max(maxW, sub.w);
    const opX = (maxW - opW) / 2;
    out.push(...shift(opItems, opX, 0));
    if (sup) {
      const y = opTop - 0.12 * scale - sup.d;
      out.push(...shift(sup.items, (maxW - sup.w) / 2, y));
      h = Math.max(h, -y + sup.h);
    }
    if (sub) {
      const y = opBot + 0.12 * scale + sub.h;
      out.push(...shift(sub.items, (maxW - sub.w) / 2, y));
      d = Math.max(d, y + sub.d);
    }
    w = maxW;
  } else {
    // Scripts to the right (e.g. \int_a^b).
    out.push(...opItems);
    let x = opW + 0.04 * scale;
    if (node.sup) {
      const sb = layout(node.sup, atlas, ss);
      const y = -opH + 0.1 * scale - sb.d + 0.15 * scale;
      out.push(...shift(sb.items, x, y));
      w = Math.max(w, x + sb.w); h = Math.max(h, -y + sb.h);
    }
    if (node.sub) {
      const bb = layout(node.sub, atlas, ss);
      const y = opD - 0.1 * scale + bb.h;
      out.push(...shift(bb.items, x, y));
      w = Math.max(w, x + bb.w); d = Math.max(d, y + bb.d);
    }
  }
  void SS;
  return { w, h, d, items: out };
}
