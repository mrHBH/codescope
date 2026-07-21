// ── Camera controller — keyframe interpolation + drift ──────────────────────
// Pure function: pose = f(t, keyframes, resolveFit)

import type { CameraTrack, Vec2, EasingName } from '../ir/types';
import { clamp01 } from '../../windgraph/anim/easing';
import * as easing from '../../windgraph/anim/easing';

const EASING_MAP: Record<string, (t: number) => number> = {
  linear: easing.linear, easeInQuad: easing.easeInQuad, easeOutQuad: easing.easeOutQuad, easeInOutQuad: easing.easeInOutQuad,
  easeInCubic: easing.easeInCubic, easeOutCubic: easing.easeOutCubic, easeInOutCubic: easing.easeInOutCubic,
  easeInQuint: easing.easeInQuint, easeOutQuint: easing.easeOutQuint, easeInOutQuint: easing.easeInOutQuint,
  smoothstep: easing.smoothstep, smootherstep: easing.smootherstep,
  easeInSine: easing.easeInSine, easeOutSine: easing.easeOutSine, easeInOutSine: easing.easeInOutSine,
  easeOutBack: easing.easeOutBack, easeOutElastic: easing.easeOutElastic, easeOutBounce: easing.easeOutBounce,
  rushInto: easing.rushInto, rushFrom: easing.rushFrom,
};
function getEase(name: EasingName | undefined): (t: number) => number { return (name && EASING_MAP[name]) || EASING_MAP.smoothstep; }

export interface CameraPose { x: number; y: number; zoom: number; azimuth: number; polar: number; }
export interface FitResult { center: Vec2; zoom: number; box?: { x: number; y: number; w: number; h: number }; }
export type FitResolver = (fitId: string) => FitResult | null;

function resolveKeyframe(kf: any, resolveFit: FitResolver, resolveFitObj?: FitResolver): { center: Vec2; zoom: number } | null {
  if (kf.center && kf.zoom) return { center: kf.center, zoom: kf.zoom };
  // Layout-resolved dive: center/zoom come from the target's laid-out world box
  // (resolved at runtime), so a dive tracks its card through reflow/resize.
  if (kf.fitObj) {
    const fit = resolveFitObj ? resolveFitObj(kf.fitObj) : null;
    if (!fit) return null;
    let cx = fit.center[0], cy = fit.center[1];
    // fitPoint aims at a FRACTION of the box (aspect-robust alternative to offset).
    if (kf.fitPoint && fit.box) {
      cx = fit.box.x + kf.fitPoint[0] * fit.box.w;
      cy = fit.box.y + kf.fitPoint[1] * fit.box.h;
    }
    if (kf.offset) { cx += kf.offset[0]; cy += kf.offset[1]; }
    return { center: [cx, cy], zoom: fit.zoom * (kf.zoomMul ?? 1) };
  }
  if (kf.fit) {
    const fit = resolveFit(kf.fit);
    if (!fit) return null;
    let cx = fit.center[0], cy = fit.center[1];
    if (kf.offset) { cx += kf.offset[0]; cy += kf.offset[1]; }
    return { center: [cx, cy], zoom: fit.zoom * (kf.zoomMul ?? 1) };
  }
  return null;
}

export function poseAt(track: CameraTrack, t: number, resolveFit: FitResolver, canvasW: number, canvasH: number, resolveFitObj?: FitResolver): CameraPose {
  const kfs = track.keyframes as any[];
  if (kfs.length === 0) return { x: 0, y: 0, zoom: 0.5, azimuth: 0, polar: 0.06 };
  // Only resolve the active pair — fitObj does layout lookups; resolving every
  // keyframe every frame was a major FPS tax on long tours.
  let i = kfs.length - 1;
  for (let j = 0; j < kfs.length - 1; j++) { if (kfs[j].time <= t && t < kfs[j + 1].time) { i = j; break; } }
  if (t >= kfs[i].time) i = Math.min(i, kfs.length - 2);
  if (t < kfs[0].time) {
    const p = resolveKeyframe(kfs[0], resolveFit, resolveFitObj);
    if (!p) return { x: 0, y: 0, zoom: 0.5, azimuth: 0, polar: 0.06 };
    return { x: p.center[0], y: p.center[1], zoom: p.zoom, azimuth: kfs[0].azimuth ?? 0, polar: kfs[0].polar ?? 0.06 };
  }
  const i1 = Math.min(i + 1, kfs.length - 1);
  const k0 = kfs[i], k1 = kfs[i1];
  const p0 = resolveKeyframe(k0, resolveFit, resolveFitObj);
  const p1 = resolveKeyframe(k1, resolveFit, resolveFitObj);
  if (!p0 || !p1) {
    const p = p0 || p1;
    if (!p) return { x: 0, y: 0, zoom: 0.5, azimuth: 0, polar: 0.06 };
    return { x: p.center[0], y: p.center[1], zoom: p.zoom, azimuth: k0?.azimuth ?? 0, polar: k0?.polar ?? 0.06 };
  }
  let baseT = k0.time, baseDur = k1.time - k0.time;
  if (baseDur <= 0) baseDur = 1;
  const localT = t - baseT;
  const progress = clamp01(baseDur > 0 ? localT / baseDur : 1);
  const ease = getEase(k1.ease)(progress);
  const x = p0.center[0] + (p1.center[0] - p0.center[0]) * ease;
  const y = p0.center[1] + (p1.center[1] - p0.center[1]) * ease;
  const z = p0.zoom * Math.pow(p1.zoom / p0.zoom, ease);
  const az = (k0.azimuth ?? 0) + ((k1.azimuth ?? 0) - (k0.azimuth ?? 0)) * ease;
  const polar = (k0.polar ?? 0.06) + ((k1.polar ?? 0.06) - (k0.polar ?? 0.06)) * ease;
  let dx = 0, dy = 0, daz = 0;
  if (k0.drift) {
    const d = k0.drift, driftT = localT;
    if (d.xAmp && d.xPeriod) dx = d.xAmp * Math.sin(2 * Math.PI * driftT / d.xPeriod);
    if (d.yAmp && d.yPeriod) dy = d.yAmp * Math.sin(2 * Math.PI * driftT / d.yPeriod);
    if (d.azAmp && d.azPeriod) daz = d.azAmp * Math.sin(2 * Math.PI * driftT / d.azPeriod);
  }
  return { x: x + dx, y: y + dy, zoom: z, azimuth: az + daz, polar };
}
