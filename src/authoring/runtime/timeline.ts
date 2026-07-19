// ── Timeline engine — pure function of t ─────────────────────────────────────
// Deterministic clip evaluation. State = f(t), no accumulators.

import { clamp01 } from '../../windgraph/anim/easing';
import * as easing from '../../windgraph/anim/easing';
import type { SceneDoc, EasingName } from '../ir/types';

const EASING_MAP: Record<string, (t: number) => number> = {
  linear: easing.linear, easeInQuad: easing.easeInQuad, easeOutQuad: easing.easeOutQuad,
  easeInOutQuad: easing.easeInOutQuad, easeInCubic: easing.easeInCubic, easeOutCubic: easing.easeOutCubic,
  easeInOutCubic: easing.easeInOutCubic, easeInQuint: easing.easeInQuint, easeOutQuint: easing.easeOutQuint,
  easeInOutQuint: easing.easeInOutQuint, smoothstep: easing.smoothstep, smootherstep: easing.smootherstep,
  easeInSine: easing.easeInSine, easeOutSine: easing.easeOutSine, easeInOutSine: easing.easeInOutSine,
  easeOutBack: easing.easeOutBack, easeOutElastic: easing.easeOutElastic, easeOutBounce: easing.easeOutBounce,
  rushInto: easing.rushInto, rushFrom: easing.rushFrom,
};
function getEase(name: EasingName | undefined): (t: number) => number {
  return (name && EASING_MAP[name]) || EASING_MAP.smoothstep;
}

export interface ChapterWindow { id: string; start: number; duration: number; title: string; sub: string; }

export function chapterWindows(doc: any): ChapterWindow[] {
  const ch: ChapterWindow[] = [];
  let acc = 0;
  for (const [id, spec] of Object.entries(doc.objects)) {
    if ((spec as any).kind === 'group' && (spec as any).chapter) {
      const chMeta = (spec as any).chapter;
      ch.push({ id, start: acc, duration: chMeta.duration, title: chMeta.title, sub: chMeta.sub });
      acc += chMeta.duration;
    }
  }
  return ch;
}

export function docDuration(doc: any): number {
  let d = 0;
  for (const [id, spec] of Object.entries(doc.objects)) {
    if ((spec as any).kind === 'group' && (spec as any).chapter) d += (spec as any).chapter.duration;
  }
  return d;
}

export interface ObjFrame {
  opacityMult: number; reveal: number; dx: number; dy: number;
  scaleX: number; scaleY: number; rotation: number; chars: number; visible: boolean;
}

export interface FrameState {
  objects: Map<string, ObjFrame>;
  params: Map<string, any>;
  chapters: Map<string, { alpha: number; local: number }>;
  currentChapterId: string | null;
}

export function evalScene(doc: any, t: number, paramOverrides?: Map<string, any>): FrameState {
  const paramValues = new Map<string, any>();
  for (const [k, p] of Object.entries(doc.params)) paramValues.set(k, (p as any).default);
  if (paramOverrides) { for (const [k, v] of paramOverrides) paramValues.set(k, v); }

  const chWindows = chapterWindows(doc);
  const chapters = new Map<string, { alpha: number; local: number }>();
  let currentChapterId: string | null = null;
  for (let i = 0; i < chWindows.length; i++) {
    const cw = chWindows[i];
    const fadeT = (t - cw.start + 0.5) / 1.5;
    const alpha = fadeT <= 0 ? 0 : fadeT >= 1 ? 1 : EASING_MAP.smoothstep(fadeT);
    chapters.set(cw.id, { alpha, local: t - cw.start });
    if (cw.start <= t && (i === chWindows.length - 1 || t < chWindows[i + 1].start)) {
      currentChapterId = cw.id;
    }
  }

  // Param clips
  for (const clip of doc.clips) {
    if (clip.kind !== 'param' || !clip.target.startsWith('param:')) continue;
    const target = clip.target.slice(6);
    if (!paramValues.has(target)) continue;
    if (clip.start <= t) {
      const local = t - clip.start;
      const to = (clip.props as any).to;
      if (local >= clip.duration) { paramValues.set(target, to); }
      else if (local >= 0) {
        const ep = getEase(clip.ease)(clamp01(local / clip.duration));
        const from = paramValues.get(target);
        if (typeof from === 'number' && typeof to === 'number') paramValues.set(target, from + (to - from) * ep);
        if (Array.isArray(from) && Array.isArray(to)) paramValues.set(target, (from as number[]).map((v, i) => v + ((to as number[])[i] - v) * ep));
      }
    }
  }

  // Per-object frame
  const objects = new Map<string, ObjFrame>();
  for (const [oid, spec] of Object.entries(doc.objects)) {
    const s = spec as any;
    const base: ObjFrame = { opacityMult: 1, reveal: 1, dx: 0, dy: 0, scaleX: 1, scaleY: 1, rotation: 0, chars: 0, visible: true };
    let textLen = 0;
    if (s.kind === 'text') textLen = s.content.length;
    const objClips = (doc.clips as any[]).filter((c) => c.target === oid).sort((a: any, b: any) => a.start - b.start);

    // opacity from fadeIn/fadeOut
    const opClips = objClips.filter((c: any) => c.kind === 'fadeIn' || c.kind === 'fadeOut');
    if (opClips.length > 0) {
      let v = base.opacityMult;
      for (const c of opClips) {
        if (c.start > t) break;
        const local = t - c.start;
        const begin = c.kind === 'fadeIn' ? 0 : v;
        const end = c.kind === 'fadeIn' ? 1 : 0;
        if (local >= c.duration) v = end;
        else if (local >= 0) v = begin + (end - begin) * getEase(c.ease)(clamp01(local / c.duration));
      }
      base.opacityMult = v;
    }
    // visible=false after fadeOut
    const fadeOuts = opClips.filter((c: any) => c.kind === 'fadeOut');
    if (fadeOuts.length > 0) {
      const last = fadeOuts[fadeOuts.length - 1];
      if (last.start <= t && t >= last.start + last.duration) base.visible = false;
    }

    // reveal from draw
    const dwClips = objClips.filter((c: any) => c.kind === 'draw');
    if (dwClips.length > 0) {
      let v = base.reveal;
      for (const c of dwClips) {
        if (c.start > t) break;
        const local = t - c.start;
        if (local >= c.duration) v = 1;
        else if (local >= 0) v = 0 + (1 - 0) * getEase(c.ease)(clamp01(local / c.duration));
      }
      base.reveal = v;
    }

    // dx,dy from moveTo (absolute target → offset)
    const mvClips = objClips.filter((c: any) => c.kind === 'moveTo');
    if (mvClips.length > 0) {
      let dx = base.dx, dy = base.dy;
      for (const c of mvClips) {
        if (c.start > t) break;
        const local = t - c.start;
        const toX = (c.props.x as number), toY = (c.props.y as number);
        if (local >= c.duration) { dx = toX; dy = toY; }
        else if (local >= 0) {
          const ep = getEase(c.ease)(clamp01(local / c.duration));
          dx = dx + (toX - dx) * ep;
          dy = dy + (toY - dy) * ep;
        }
      }
      base.dx = dx; base.dy = dy;
    }

    // scale from scaleTo
    const scClips = objClips.filter((c: any) => c.kind === 'scaleTo');
    if (scClips.length > 0) {
      let sx = base.scaleX, sy = base.scaleY;
      for (const c of scClips) {
        if (c.start > t) break;
        const local = t - c.start;
        const toX = (c.props.x as number), toY = ((c.props.y ?? c.props.x) as number);
        if (local >= c.duration) { sx = toX; sy = toY; }
        else if (local >= 0) {
          const ep = getEase(c.ease)(clamp01(local / c.duration));
          sx = sx + (toX - sx) * ep;
          sy = sy + (toY - sy) * ep;
        }
      }
      base.scaleX = sx; base.scaleY = sy;
    }

    // rotation
    const rotClips = objClips.filter((c: any) => c.kind === 'rotateTo');
    if (rotClips.length > 0) {
      let r = base.rotation;
      for (const c of rotClips) {
        if (c.start > t) break;
        const local = t - c.start;
        const deg = (c.props.deg as number);
        if (local >= c.duration) r = deg;
        else if (local >= 0) {
          const ep = getEase(c.ease)(clamp01(local / c.duration));
          r = r + (deg - r) * ep;
        }
      }
      base.rotation = r;
    }

    // write
    const wrClips = objClips.filter((c: any) => c.kind === 'write');
    if (wrClips.length > 0) {
      let chars = 0;
      for (const c of wrClips) {
        if (c.start <= t) {
          const local = t - c.start;
          if (local >= c.duration) chars = textLen;
          else if (local >= 0) chars = Math.round(textLen * getEase(c.ease)(clamp01(local / c.duration)));
        }
      }
      base.chars = chars;
    }

    objects.set(oid, base);
  }

  return { objects, params: paramValues, chapters, currentChapterId };
}
