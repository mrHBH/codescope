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

function qbez(p0: [number, number], p1: [number, number], p2: [number, number], n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, v = 1 - u;
    out.push([v * v * p0[0] + 2 * v * u * p1[0] + u * u * p2[0], v * v * p0[1] + 2 * v * u * p1[1] + u * u * p2[1]]);
  }
  return out;
}

function bracePts(x: number, top: number, bottom: number, dir: number): [number, number][] {
  const mid = (top + bottom) / 2;
  return [
    [x, top], [x, top + (mid - top) * 0.42], [x + dir, mid],
    [x, bottom - (bottom - mid) * 0.42], [x, bottom],
  ];
}

/** A growing delimiter drawn as analytic vector paths/rules spanning [top,bottom]. */
function growDelim(ch: string, x: number, top: number, bottom: number, t: number): Placed[] {
  const H = bottom - top, mid = (top + bottom) / 2;
  if (ch === '.' || ch === '') return [];
  if (ch === '|') return [{ kind: 'rule', x: x - t / 2, y: top, w: t, h: H }];
  if (ch === '‖') return [{ kind: 'rule', x: x - t, y: top, w: t * 0.7, h: H }, { kind: 'rule', x: x + t * 0.35, y: top, w: t * 0.7, h: H }];
  const bulge = Math.max(0.12, Math.min(0.3, H * 0.14));
  switch (ch) {
    case '(': return [{ kind: 'path', w: t, pts: qbez([x, top], [x - bulge * 2.6, mid], [x, bottom], 16) }];
    case ')': return [{ kind: 'path', w: t, pts: qbez([x, top], [x + bulge * 2.6, mid], [x, bottom], 16) }];
    case '[': return [{ kind: 'path', w: t, pts: [[x + bulge, top], [x, top], [x, bottom], [x + bulge, bottom]] }];
    case ']': return [{ kind: 'path', w: t, pts: [[x - bulge, top], [x, top], [x, bottom], [x - bulge, bottom]] }];
    case '{': return [{ kind: 'path', w: t, pts: bracePts(x, top, bottom, -bulge) }];
    case '}': return [{ kind: 'path', w: t, pts: bracePts(x, top, bottom, bulge) }];
    case '⟨': return [{ kind: 'path', w: t, pts: [[x + bulge, top], [x - bulge, mid], [x + bulge, bottom]] }];
    case '⟩': return [{ kind: 'path', w: t, pts: [[x - bulge, top], [x + bulge, mid], [x - bulge, bottom]] }];
    default: return [{ kind: 'rule', x: x - t / 2, y: top, w: t, h: H }];
  }
}

function delimAdvance(ch: string): number {
  if (ch === '.' || ch === '') return 0;
  if (ch === '|' || ch === '‖') return 0.22;
  return 0.42;
}


export function layout(node: Node, atlas: Atlas, scale = 1): Box {
  switch (node.t) {
    case 'row': return layoutRow(node.items, atlas, scale);
    case 'char': return glyphBox(atlas, node.ch, node.cls, scale);
    case 'func': return layoutFunc(node, atlas, scale);
    case 'limop': return layoutLimop(node, atlas, scale);
    case 'space': return { w: node.w * scale, h: 0, d: 0, items: [] };
    case 'limits': return { w: 0, h: 0, d: 0, items: [] };
    case 'scripted': return layoutScripted(node, atlas, scale);
    case 'frac': return layoutFrac(node, atlas, scale);
    case 'sqrt': return layoutSqrt(node, atlas, scale);
    case 'bigop': return layoutBigop(node, atlas, scale);
    case 'leftright': return layoutLeftRight(node, atlas, scale);
    case 'matrix': return layoutMatrix(node, atlas, scale);
    case 'cases': return layoutCases(node, atlas, scale);
    case 'align': return layoutAlign(node, atlas, scale);
    case 'accent': return layoutAccent(node, atlas, scale);
    case 'brace': return layoutBrace(node, atlas, scale);
    case 'xarrow': return layoutXarrow(node, atlas, scale);
  }
}

// An upright function name (sin, cos, log, …). Spacing before its ARGUMENT is
// added by the row layouter (so a superscript like \cos^2 binds to the name).
function layoutFunc(node: Extract<Node, { t: 'func' }>, atlas: Atlas, scale: number): Box {
  return layoutRow([...node.name].map((ch) => ({ t: 'char', ch, cls: 'rm' } as Node)), atlas, scale);
}

function isFuncish(n?: Node): boolean {
  if (!n) return false;
  if (n.t === 'func' || n.t === 'limop') return true;
  if (n.t === 'scripted') return isFuncish(n.base);
  return false;
}

// A limit-style operator (lim, max, min, …): the upright name with its limits
// centered ABOVE / BELOW it (display style), not to the side.
function layoutLimop(node: Extract<Node, { t: 'limop' }>, atlas: Atlas, scale: number): Box {
  const nameItems = [...node.name].map((ch) => (ch === ' ' ? { t: 'space', w: 0.22 } : { t: 'char', ch, cls: 'rm' }) as Node);
  const nb = layoutRow(nameItems, atlas, scale);
  const limScale = scale * 0.62;
  const sup = node.sup ? layout(node.sup, atlas, limScale) : null;
  const sub = node.sub ? layout(node.sub, atlas, limScale) : null;
  const maxW = Math.max(nb.w, sup?.w ?? 0, sub?.w ?? 0);
  const out: Placed[] = [];
  out.push(...shift(nb.items, (maxW - nb.w) / 2, 0));
  let h = nb.h, d = nb.d;
  if (sup) { const y = -nb.h - 0.16 * scale - sup.d; out.push(...shift(sup.items, (maxW - sup.w) / 2, y)); h = Math.max(h, -y + sup.h); }
  if (sub) { const y = nb.d + 0.16 * scale + sub.h; out.push(...shift(sub.items, (maxW - sub.w) / 2, y)); d = Math.max(d, y + sub.d); }
  return { w: maxW, h, d, items: out };
}

function layoutRow(items: Node[], atlas: Atlas, scale: number): Box {
  let x = 0, h = 0, d = 0;
  const out: Placed[] = [];
  let prev: Node | undefined;
  const isComposite = (k: Node['t'] | undefined) => k === 'frac' || k === 'sqrt' || k === 'bigop';
  for (const it of items) {
    const cls = it.t === 'char' ? it.cls : undefined;
    // Spacing before this atom.
    if (x > 0) {
      if (cls === 'bin' || cls === 'rel' || cls === 'punct') x += spacingFor(cls, scale);
      else if (isComposite(it.t) || isComposite(prev?.t)) x += 0.14 * scale; // room around frac/sqrt/bigop
      else if (isFuncish(prev)) x += 0.14 * scale;                            // space after a function, before its argument
    }
    const b = layout(it, atlas, scale);
    out.push(...shift(b.items, x, 0));
    x += b.w;
    if (cls === 'bin' || cls === 'rel') x += spacingFor(cls, scale);
    h = Math.max(h, b.h); d = Math.max(d, b.d);
    prev = it;
  }
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
  const sumLike = node.ch === '∑' || node.ch === '∏' || node.ch === '⋃' || node.ch === '⋂' || node.ch === '∐';
  // Display style: sum/product-like ops put limits ABOVE/BELOW by default;
  // integrals put them to the SIDE. `\limits`/`\nolimits` (node.over) override.
  const useLimits = node.over !== undefined ? node.over : sumLike;
  const opScale = scale * (sumLike ? 0.95 : 0.86);
  const limScale = scale * (sumLike ? 0.6 : 0.5);
  const mult = Math.max(1, node.mult ?? 1);
  let opW = 0.9 * opScale, opH = 0.9 * opScale, opD = 0.3 * opScale;
  let inkR = opW;
  const opItems: Placed[] = [];
  if (key) {
    const e = t[key], upm = upmOf(e);
    const gw = (e.advance / upm) * opScale;
    opH = Math.max(0, -e.bbox[1] / upm) * opScale;
    opD = Math.max(0, e.bbox[3] / upm) * opScale;
    const gInkR = (e.bbox[2] / upm) * opScale;
    // Center the operator on the math axis.
    const center = (opD - opH) / 2;
    const shiftY = -AXIS * scale - center;
    const step = gw * 0.58; // multiple integral signs (∬ ∭) overlap
    for (let k = 0; k < mult; k++) opItems.push({ kind: 'glyph', key, x: k * step, y: shiftY, s: opScale });
    opW = gw + step * (mult - 1);
    inkR = gInkR + step * (mult - 1);
    opH -= shiftY; // extend height by the upward shift
    opD += shiftY;
  }
  const out: Placed[] = [];
  let w = opW, h = opH, d = opD;

  if (useLimits) {
    const opTop = -opH, opBot = opD;
    let maxW = opW;
    const sup = node.sup ? layout(node.sup, atlas, limScale) : null;
    const sub = node.sub ? layout(node.sub, atlas, limScale) : null;
    if (sup) maxW = Math.max(maxW, sup.w);
    if (sub) maxW = Math.max(maxW, sub.w);
    const opX = (maxW - opW) / 2;
    out.push(...shift(opItems, opX, 0));
    if (sup) {
      const y = opTop - 0.1 * scale - sup.d;
      out.push(...shift(sup.items, (maxW - sup.w) / 2, y));
      h = Math.max(h, -y + sup.h);
    }
    if (sub) {
      const y = opBot + 0.1 * scale + sub.h;
      out.push(...shift(sub.items, (maxW - sub.w) / 2, y));
      d = Math.max(d, y + sub.d);
    }
    w = maxW;
  } else {
    // Scripts to the RIGHT of the sign (e.g. \int_a^b): small limits placed just
    // past the ink's right edge with an italic correction (the integral slants,
    // so the upper limit shifts right and the lower shifts left — like KaTeX).
    out.push(...opItems);
    const baseX = Math.max(opW, inkR) + 0.04 * scale;
    const ic = 0.1 * scale;
    if (node.sup) {
      const sb = layout(node.sup, atlas, limScale);
      const y = -opH + 0.30 * scale;               // near the top of the sign
      out.push(...shift(sb.items, baseX + ic, y));
      w = Math.max(w, baseX + ic + sb.w); h = Math.max(h, -y + sb.h);
    }
    if (node.sub) {
      const bb = layout(node.sub, atlas, limScale);
      const y = opD - 0.18 * scale;                 // near the bottom of the sign
      out.push(...shift(bb.items, baseX - ic, y));
      w = Math.max(w, baseX - ic + bb.w); d = Math.max(d, y + bb.d);
    }
  }
  void SS;
  return { w, h, d, items: out };
}

// ── Phase 4 · Lane K: matrices, delimiters, cases, align, accents, arrows ──

function gridMetrics(rows: Node[][], atlas: Atlas, scale: number) {
  const cells = rows.map((r) => r.map((c) => layout(c, atlas, scale)));
  const ncols = Math.max(...cells.map((r) => r.length), 1);
  const colW = new Array(ncols).fill(0);
  for (const r of cells) r.forEach((c, j) => { colW[j] = Math.max(colW[j], c.w); });
  const rowH = cells.map((r) => Math.max(...r.map((c) => c.h), 0.5 * scale));
  const rowD = cells.map((r) => Math.max(...r.map((c) => c.d), 0));
  return { cells, ncols, colW, rowH, rowD };
}

function placeGrid(rows: Node[][], atlas: Atlas, scale: number, colGap: number) {
  const { cells, ncols, colW, rowH, rowD } = gridMetrics(rows, atlas, scale);
  const rowGap = 0.34 * scale;
  let cursor = 0; const baselines: number[] = [];
  for (let r = 0; r < cells.length; r++) { baselines.push(cursor + rowH[r]); cursor += rowH[r] + rowD[r] + rowGap; }
  const totalH = Math.max(cursor - rowGap, rowH[0] ?? scale);
  const dy = -AXIS * scale - totalH / 2;
  const colX: number[] = []; let cx = 0;
  for (let j = 0; j < ncols; j++) { colX.push(cx); cx += colW[j] + colGap; }
  const items: Placed[] = [];
  cells.forEach((row, r) => row.forEach((cell, j) => {
    items.push(...shift(cell.items, colX[j] + (colW[j] - cell.w) / 2, baselines[r] + dy));
  }));
  return { items, width: cx - colGap, top: dy, bottom: totalH + dy };
}

function layoutLeftRight(node: Extract<Node, { t: 'leftright' }>, atlas: Atlas, scale: number): Box {
  const body = layout(node.body, atlas, scale);
  const t = RULE * scale;
  const pad = 0.08 * scale;
  const oA = delimAdvance(node.open) * scale, cA = delimAdvance(node.close) * scale;
  const lp = node.open !== '.' ? oA + pad : 0;
  const rp = node.close !== '.' ? cA + pad : 0;
  const top = -body.h - pad, bottom = body.d + pad;
  const out: Placed[] = [];
  if (node.open !== '.') out.push(...growDelim(node.open, lp * 0.5, top, bottom, t * 1.2));
  out.push(...shift(body.items, lp, 0));
  if (node.close !== '.') out.push(...growDelim(node.close, lp + body.w + rp * 0.5, top, bottom, t * 1.2));
  return { w: lp + body.w + rp, h: -top, d: bottom, items: out };
}

function layoutMatrix(node: Extract<Node, { t: 'matrix' }>, atlas: Atlas, scale: number): Box {
  const g = placeGrid(node.rows, atlas, scale, 0.6 * scale);
  const t = RULE * scale;
  const oA = delimAdvance(node.open) * scale, cA = delimAdvance(node.close) * scale;
  const lp = node.open ? oA + 0.14 * scale : 0;
  const rp = node.close ? cA + 0.14 * scale : 0;
  const out = shift(g.items, lp, 0);
  const top = g.top - 0.1 * scale, bottom = g.bottom + 0.1 * scale;
  if (node.open) out.push(...growDelim(node.open, lp * 0.5, top, bottom, t * 1.2));
  if (node.close) out.push(...growDelim(node.close, lp + g.width + rp * 0.5, top, bottom, t * 1.2));
  return { w: lp + g.width + rp, h: -top, d: bottom, items: out };
}

function layoutCases(node: Extract<Node, { t: 'cases' }>, atlas: Atlas, scale: number): Box {
  const g = placeGrid(node.rows, atlas, scale, 0.5 * scale);
  const t = RULE * scale;
  const lp = 0.5 * scale;
  const out = shift(g.items, lp, 0);
  const top = g.top - 0.06 * scale, bottom = g.bottom + 0.06 * scale;
  out.push(...growDelim('{', lp * 0.35, top, bottom, t * 1.2));
  return { w: lp + g.width, h: -top, d: bottom, items: out };
}

function layoutAlign(node: Extract<Node, { t: 'align' }>, atlas: Atlas, scale: number): Box {
  const rows = node.rows.map((r) => r.map((c) => layout(c, atlas, scale)));
  const rowGap = 0.42 * scale, colGap = 0.45 * scale;
  let lhsW = 0, rhsW = 0;
  for (const r of rows) { if (r[0]) lhsW = Math.max(lhsW, r[0].w); for (let j = 1; j < r.length; j++) rhsW = Math.max(rhsW, r[j].w); }
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.h), 0.5 * scale));
  const rowD = rows.map((r) => Math.max(...r.map((c) => c.d), 0));
  let cursor = 0; const baselines: number[] = [];
  for (let r = 0; r < rows.length; r++) { baselines.push(cursor + rowH[r]); cursor += rowH[r] + rowD[r] + rowGap; }
  const totalH = Math.max(cursor - rowGap, scale);
  const dy = -AXIS * scale - totalH / 2;
  const out: Placed[] = [];
  const numW = node.numbered ? 1.4 * scale : 0;
  rows.forEach((r, ri) => {
    if (r[0]) out.push(...shift(r[0].items, lhsW - r[0].w, baselines[ri] + dy));
    for (let j = 1; j < r.length; j++) out.push(...shift(r[j].items, lhsW + colGap, baselines[ri] + dy));
    if (node.numbered) {
      const num = layout({ t: 'row', items: [{ t: 'char', ch: '(', cls: 'rm' }, { t: 'char', ch: String(ri + 1), cls: 'num' }, { t: 'char', ch: ')', cls: 'rm' }] } as Node, atlas, scale * 0.85);
      out.push(...shift(num.items, lhsW + colGap + rhsW + 0.6 * scale, baselines[ri] + dy));
    }
  });
  return { w: lhsW + colGap + rhsW + numW, h: -dy, d: totalH + dy, items: out };
}

function layoutAccent(node: Extract<Node, { t: 'accent' }>, atlas: Atlas, scale: number): Box {
  const body = layout(node.body, atlas, scale);
  const t = RULE * scale;
  const y = -body.h - 0.1 * scale;
  const out: Placed[] = [...body.items];
  const w = body.w, cx = w / 2;
  switch (node.accent) {
    case 'hat': out.push({ kind: 'path', w: t, pts: [[cx - 0.16 * scale, y + 0.13 * scale], [cx, y], [cx + 0.16 * scale, y + 0.13 * scale]] }); break;
    case 'bar': out.push({ kind: 'rule', x: 0, y: y + 0.07 * scale, w, h: t }); break;
    case 'tilde': out.push({ kind: 'path', w: t, pts: qbez([cx - 0.2 * scale, y + 0.09 * scale], [cx - 0.05 * scale, y], [cx, y + 0.06 * scale], 6).concat(qbez([cx, y + 0.06 * scale], [cx + 0.05 * scale, y + 0.13 * scale], [cx + 0.2 * scale, y + 0.04 * scale], 6)) }); break;
    case 'dot': out.push({ kind: 'rule', x: cx - t, y: y + 0.05 * scale, w: t * 2, h: t * 2 }); break;
    case 'vec': out.push({ kind: 'path', w: t, pts: [[0, y + 0.07 * scale], [w, y + 0.07 * scale]] }); out.push({ kind: 'path', w: t, pts: [[w - 0.13 * scale, y + 0.01 * scale], [w, y + 0.07 * scale], [w - 0.13 * scale, y + 0.13 * scale]] }); break;
  }
  return { w, h: body.h + 0.2 * scale, d: body.d, items: out };
}

function horizBrace(x0: number, x1: number, y: number, dir: number): [number, number][] {
  const mid = (x0 + x1) / 2;
  return [[x0, y], [x0 + (mid - x0) * 0.42, y], [mid, y + dir], [x1 - (x1 - mid) * 0.42, y], [x1, y]];
}

function layoutBrace(node: Extract<Node, { t: 'brace' }>, atlas: Atlas, scale: number): Box {
  const body = layout(node.body, atlas, scale);
  const t = RULE * scale;
  const out: Placed[] = [...body.items];
  const w = Math.max(body.w, 0.6 * scale);
  let h = body.h, d = body.d;
  if (node.over) {
    const y0 = -body.h - 0.12 * scale;
    out.push({ kind: 'path', w: t, pts: horizBrace(0, w, y0, -0.14 * scale) });
    h = body.h + 0.26 * scale;
    if (node.label) { const lb = layout(node.label, atlas, scale * 0.7); out.push(...shift(lb.items, (w - lb.w) / 2, y0 - 0.16 * scale - lb.d)); h = Math.max(h, body.h + 0.26 * scale + lb.h + 0.16 * scale); }
  } else {
    const y0 = body.d + 0.12 * scale;
    out.push({ kind: 'path', w: t, pts: horizBrace(0, w, y0, 0.14 * scale) });
    d = body.d + 0.26 * scale;
    if (node.label) { const lb = layout(node.label, atlas, scale * 0.7); out.push(...shift(lb.items, (w - lb.w) / 2, y0 + 0.16 * scale + lb.h)); d = Math.max(d, body.d + 0.26 * scale + lb.d + 0.16 * scale); }
  }
  return { w, h, d, items: out };
}

function layoutXarrow(node: Extract<Node, { t: 'xarrow' }>, atlas: Atlas, scale: number): Box {
  const label = node.label ? layout(node.label, atlas, scale * 0.7) : null;
  const text = node.text ? layout(node.text, atlas, scale * 0.7) : null;
  const t = RULE * scale;
  const w = Math.max(0.8 * scale, (label?.w ?? 0) + 0.3 * scale, (text?.w ?? 0) + 0.3 * scale);
  const y = -AXIS * scale;
  const out: Placed[] = [{ kind: 'rule', x: 0, y: y - t / 2, w, h: t }];
  const hl = 0.16 * scale, hw = 0.1 * scale;
  if (node.dir === '→') out.push({ kind: 'path', w: t, pts: [[w - hl, y - hw], [w, y], [w - hl, y + hw]] });
  else out.push({ kind: 'path', w: t, pts: [[hl, y - hw], [0, y], [hl, y + hw]] });
  let h = 0.3 * scale, d = 0.3 * scale;
  if (label) { out.push(...shift(label.items, (w - label.w) / 2, y - 0.16 * scale - label.d)); h = Math.max(h, AXIS * scale + 0.16 * scale + label.h); }
  if (text) { out.push(...shift(text.items, (w - text.w) / 2, y + 0.16 * scale + text.h)); d = Math.max(d, -AXIS * scale + 0.16 * scale + text.d); }
  return { w, h, d, items: out };
}
