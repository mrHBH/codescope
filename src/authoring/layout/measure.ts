// ── Intrinsic leaf measurement for Taffy layout ──────────────────────────────
import type { ObjectSpec, Vec2 } from '../ir/types';
import type { FontFace } from '../../windfoil/font';
import { tw } from '../../layout/metrics';
import { getIsland } from '../islands/registry';
import { MathTex } from '../../windgraph/math/mathtex';

export type Size = { w: number; h: number };
export type MeasureFn = (id: string, spec: ObjectSpec) => Size;

// MathTex instances are layout-cached per latex — share them across measures.
const mathCache = new Map<string, MathTex>();
function mathTexFor(latex: string): MathTex {
  let t = mathCache.get(latex);
  if (!t) { t = new MathTex(latex); mathCache.set(latex, t); }
  return t;
}

export function wrapText(text: string, font: FontFace, size: number, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];
  const lines: string[] = [];
  const words = text.split(' ');
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (tw(candidate, font, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function measureWrapped(text: string, font: FontFace, size: number, maxWidth: number): { lines: string[]; w: number; h: number } {
  const lines = wrapText(text, font, size, maxWidth);
  const maxW = Math.max(...lines.map(l => tw(l, font, size)));
  return { lines, w: maxW, h: lines.length * size * 1.25 };
}

export function makeMeasureFn(font: FontFace, defaultIslandSize: Size = { w: 480, h: 360 }, atlas?: any): MeasureFn {
  return (id: string, spec: ObjectSpec): Size => {
    const item = (spec as any).item as { width?: number | 'auto'; height?: number | 'auto' } | undefined;
    const iw = item?.width, ih = item?.height;

    let s: Size;
    switch (spec.kind) {
      case 'text': {
        const sz = spec.size;
        const fullW = Math.max(1, tw(spec.content, font, sz));
        // Explicit width → wrap height for that width
        if (typeof iw === 'number' && iw > 0) {
          const m = measureWrapped(spec.content, font, sz, iw);
          s = { w: iw, h: m.h };
        } else {
          // Prefer stretch: report natural single-line size as soft measure.
          // Solver may assign a narrower width; runtime re-measures wrap height.
          s = { w: fullW, h: sz * 1.25 };
        }
        break;
      }
      case 'rect':
        s = { w: spec.size[0], h: spec.size[1] };
        break;
      case 'island': {
        let ds = defaultIslandSize;
        try {
          const def = getIsland(spec.island);
          if (def.defaultSize) ds = { w: def.defaultSize[0], h: def.defaultSize[1] };
        } catch { }
        s = spec.size ? { w: spec.size[0], h: spec.size[1] } : ds;
        break;
      }
      case 'math': {
        if (atlas) {
          // True typeset measure: h = height above baseline, d = depth below
          // (em units × size). The Taffy box then fits the formula exactly, so
          // siblings never collide with it.
          const m = mathTexFor(spec.latex).measure(atlas);
          s = { w: Math.max(8, m.w * spec.size), h: Math.max(spec.size * 1.1, (m.h + m.d) * spec.size) };
        } else {
          const latexLen = spec.latex.length;
          s = { w: Math.max(80, latexLen * spec.size * 0.42), h: spec.size * 1.4 };
        }
        break;
      }
      case 'circle':
        s = { w: 2 * spec.radius, h: 2 * spec.radius };
        break;
      case 'glyph':
        s = { w: spec.size, h: spec.size };
        break;
      case 'line': {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of spec.points) {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
        s = { w: maxX - minX + 8, h: maxY - minY + 8 };
        break;
      }
      case 'polygon': {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of spec.points) {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        }
        s = { w: maxX - minX + 8, h: maxY - minY + 8 };
        break;
      }
      case 'group':
        s = spec.size ? { w: spec.size[0], h: spec.size[1] } : { w: 0, h: 0 };
        break;
      default:
        s = { w: 100, h: 80 };
    }

    // item.width / item.height override intrinsic measure
    if (typeof iw === 'number') s.w = iw;
    if (typeof ih === 'number') s.h = ih;

    return s;
  };
}
