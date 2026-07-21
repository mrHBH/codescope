// ── Living UI — HUD as a world-space object ─────────────────────────────────
// The real CinematicHud peels into a layout slot. Under the 3D orbit camera the
// board view is unbounded (left=-1e12), so screen-lock MUST be derived from the
// orbit target + on-axis scale — never from the sentinel boardView extents.

import { CinematicHud, type HudInfo } from './cinematicHud';
import { type EmitBuffers } from '../islands/draw';
import type { SceneRuntime } from './runtime';

export interface HudWorldSlot {
  x: number; y: number; w: number; h: number;
}

export interface HudPeelState {
  pose: HudWorldSlot;
  /** Virtual HUD resolution (= canvas backing-store px). */
  Wv: number;
  Hv: number;
}

/**
 * World-space rect of the full viewport under the current camera.
 * `zoom` is on-axis scale (device-px per world-px), matching orbitScale / cameraScale.
 * `cx,cy` is the ground-plane look-at in doc space (orbitTargetLocal).
 */
export function screenLockedHudPose(
  canvasW: number, canvasH: number,
  cx: number, cy: number, zoom: number,
): HudWorldSlot {
  const z = Math.max(zoom, 1e-6);
  const w = canvasW / z;
  const h = canvasH / z;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Smoothstep spatial morph screen-locked → slot. */
export function lerpSlot(a: HudWorldSlot, b: HudWorldSlot, t: number): HudWorldSlot {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = u * u * (3 - 2 * u);
  return {
    x: a.x + (b.x - a.x) * s,
    y: a.y + (b.y - a.y) * s,
    w: a.w + (b.w - a.w) * s,
    h: a.h + (b.h - a.h) * s,
  };
}

/** Uniform contain: map virtual (Wv×Hv) into pose without stretching. */
export function poseToXform(pose: HudWorldSlot, Wv: number, Hv: number) {
  const s = Math.min(pose.w / Math.max(Wv, 1), pose.h / Math.max(Hv, 1));
  return {
    ox: pose.x + (pose.w - Wv * s) / 2,
    oy: pose.y + (pose.h - Hv * s) / 2,
    sx: s,
    sy: s,
  };
}

export function emitHudWorld(
  hud: CinematicHud,
  _runtime: SceneRuntime,
  peel: HudPeelState,
  font: any, atlas: any,
  out: EmitBuffers,
  now: number,
  info: HudInfo,
  alpha = 1,
) {
  const xform = poseToXform(peel.pose, peel.Wv, peel.Hv);
  hud.build(font, atlas, now, peel.Wv, peel.Hv, info, out, {
    xform,
    masterAlpha: alpha,
  });
}

export function hudWorldToScreen(
  wx: number, wy: number,
  peel: HudPeelState,
): [number, number] {
  const xform = poseToXform(peel.pose, peel.Wv, peel.Hv);
  return [(wx - xform.ox) / xform.sx, (wy - xform.oy) / xform.sy];
}
