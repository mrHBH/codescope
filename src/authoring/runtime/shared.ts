// ── SceneRuntime shared helpers (split from runtime.ts, sprint-v2 Phase 0.1) ─
// State-free types + functions used by runtime.ts, emitObject.ts and
// dragControl.ts. Behavior-identical extraction — no logic changes.

import type { Vec2 } from '../ir/types';
import type { FrameState } from './timeline';
import type { DrawHelpers, EmitBuffers } from '../islands/draw';
import type { IslandDef } from '../islands/registry';
import { glyphQuads, type FontFace } from '../../windfoil/font';
import { fillQuads, type Pt } from '../../windgraph/stroke/stroke';

export type DragState =
  | { kind: 'island'; islandId: string; instId: string; handleName: string }
  | { kind: 'page'; id: string; startWx: number; startWy: number; startSize: Vec2 }
  | { kind: 'item'; id: string; startWx: number; startWy: number; startW: number; startH: number }
  | { kind: 'hud' }
  | null;

/** Per top-page emit plan: what to draw and when it becomes static. Built once
 *  per doc — the page is the cache/cull unit, mirroring the original explainer's
 *  per-chapter EmitCache (only the current chapter rebuilds every frame). */
export interface PlanPage {
  id: string;
  nested: string[];      // nested-page group ids (card chrome), doc order
  children: string[];    // non-group descendants, doc order
  staticAfter: number;   // latest clip end touching the page (t beyond → static)
}

export const SEC_W = 1260, SEC_H = 820;
export const TOTAL_W = 14500, TOTAL_H = 5200;

export function sigVal(v: any): string {
  if (typeof v === 'number') return v.toFixed(2);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(',');
  return String(v);
}

// ── Polyline trim (from windgraph mobject.ts) ──────────────────────────
export function trimPolyline(pts: Pt[], frac: number): Pt[] {
  if (frac >= 1 || pts.length < 2) return pts;
  if (frac <= 0) return [];
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  if (total < 1e-12) return pts;
  const target = total * frac;
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = seg[i - 1];
    if (acc + d >= target) {
      const t = d < 1e-9 ? 0 : (target - acc) / d;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
      break;
    }
    out.push(pts[i]); acc += d;
  }
  return out;
}

export function emitGlow(spec: any, draw: DrawHelpers, x: number, y: number, w: number, h: number, _frame: any, op: number) {
  const gl = spec.item?.glow;
  if (!gl) return;
  const layers = typeof gl === 'object' ? (gl as any).layers ?? 3 : 3;
  const spread = typeof gl === 'object' ? (gl as any).spread ?? 18 : 18;
  const ga = typeof gl === 'object' ? (gl as any).alpha ?? 1 : 1;
  const color = spec.fill ?? spec.color ?? [1, 1, 1, 1];
  const effAlpha = op * ga;
  if (spec.kind === 'rect') {
    draw.glowRect(x, y, x + w, y + h, color, layers, spread, effAlpha);
  } else if (spec.kind === 'circle') {
    const r = spec.radius * (_frame.scaleX ?? 1);
    draw.glowCircle(x, y, r, color, layers, spread, effAlpha);
  }
}

export function emitGlyph(font: FontFace, char: string, x: number, y: number, size: number, color: number[], alpha: number, buff: EmitBuffers) {
  const g = glyphQuads(font, char);
  if (!g) return;
  const [minx, miny, maxx, maxy] = g.bbox;
  const w = maxx - minx, h = maxy - miny;
  const sc = h > 0 ? size / h : 1;
  const q = g.quads.map((v, i) => (i % 2 === 0 ? x + (v - minx) * sc : y + (v - miny) * sc));
  const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
  fillQuads(q, c, buff.inst, buff.crv, buff.rws);
}

export function resolveIslandParams(def: IslandDef, overrideParams: Record<string, any>, fs: FrameState): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, pDef] of Object.entries(def.params)) {
    const ov = overrideParams?.[k];
    if (ov && typeof ov === 'object' && '$param' in ov) {
      const refName = (ov as any).$param;
      result[k] = fs.params.get(refName) ?? (ov as any).default;
    } else if (ov !== undefined) {
      result[k] = ov;
    } else {
      result[k] = (pDef as any).default;
    }
  }
  return result;
}
