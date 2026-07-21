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

// ── Clip index (per clips-array, rebuilt on identity/length change) ──────────
// evalScene ran O(objects × clips) filters + per-kind sub-filters every frame —
// the index collapses that to one map lookup per object and one sorted pass.
interface ClipIndex { len: number; byTarget: Map<string, any[]>; paramClips: any[]; }
const clipIndexCache = new WeakMap<object, ClipIndex>();
const NO_CLIPS: any[] = [];

function clipIndexFor(doc: any): ClipIndex {
  const arr = doc.clips as any[];
  let idx = clipIndexCache.get(arr);
  if (idx && idx.len === arr.length) return idx;
  const byTarget = new Map<string, any[]>();
  const paramClips: any[] = [];
  for (const c of arr) {
    if (c.kind === 'param' && typeof c.target === 'string' && c.target.startsWith('param:')) paramClips.push(c);
    const list = byTarget.get(c.target);
    if (list) list.push(c); else byTarget.set(c.target, [c]);
  }
  for (const list of byTarget.values()) list.sort((a, b) => a.start - b.start);
  paramClips.sort((a, b) => a.start - b.start);
  idx = { len: arr.length, byTarget, paramClips };
  clipIndexCache.set(arr, idx);
  return idx;
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

  const clipIdx = clipIndexFor(doc);

  // Param clips
  for (const clip of clipIdx.paramClips) {
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

  // Per-object frame — ONE pass over the target's sorted clips (independent
  // properties tracked side by side; same "last-started driver" semantics).
  const objects = new Map<string, ObjFrame>();
  for (const [oid, spec] of Object.entries(doc.objects)) {
    const s = spec as any;
    const base: ObjFrame = { opacityMult: 1, reveal: 1, dx: 0, dy: 0, scaleX: 1, scaleY: 1, rotation: 0, chars: 0, visible: true };
    const objClips: any[] = clipIdx.byTarget.get(oid) ?? NO_CLIPS;
    if (objClips.length > 0) {
      const textLen = s.kind === 'text' ? s.content.length : 0;
      let lastFadeOut: any = null;
      for (const c of objClips) {
        if (c.start > t) break;
        const local = t - c.start;
        const done = local >= c.duration;
        const ep = done ? 1 : getEase(c.ease)(clamp01(local / c.duration));
        switch (c.kind) {
          case 'fadeIn': base.opacityMult = ep; break;
          case 'fadeOut': base.opacityMult = done ? 0 : base.opacityMult * (1 - ep); lastFadeOut = c; break;
          case 'draw': base.reveal = ep; break;
          case 'moveTo': {
            const toX = (c.props.x as number), toY = (c.props.y as number);
            base.dx = done ? toX : base.dx + (toX - base.dx) * ep;
            base.dy = done ? toY : base.dy + (toY - base.dy) * ep;
            break;
          }
          case 'scaleTo': {
            const toX = (c.props.x as number), toY = ((c.props.y ?? c.props.x) as number);
            base.scaleX = done ? toX : base.scaleX + (toX - base.scaleX) * ep;
            base.scaleY = done ? toY : base.scaleY + (toY - base.scaleY) * ep;
            break;
          }
          case 'rotateTo': {
            const deg = (c.props.deg as number);
            base.rotation = done ? deg : base.rotation + (deg - base.rotation) * ep;
            break;
          }
          case 'write': base.chars = done ? textLen : Math.round(textLen * ep); break;
        }
      }
      if (lastFadeOut && t >= lastFadeOut.start + lastFadeOut.duration) base.visible = false;
    }
    objects.set(oid, base);
  }

  return { objects, params: paramValues, chapters, currentChapterId };
}
