// ── Living UI — HUD as a world-space object ─────────────────────────────────
// The real CinematicHud peels into a layout slot. Under the 3D orbit camera the
// board view is unbounded (left=-1e12), so screen-lock MUST be derived from the
// orbit target + on-axis scale — never from the sentinel boardView extents.

import { CinematicHud, type HudInfo } from './cinematicHud';
import { type EmitBuffers } from '../islands/draw';
import type { SceneRuntime } from './runtime';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { screenLockedPose, poseXform, worldToPose } from '../../camera/screenWorld';

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
  return screenLockedPose(canvasW, canvasH, cx, cy, zoom);
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
  return poseXform(pose, Wv, Hv);
}

export function emitHudWorld(
  hud: CinematicHud,
  _runtime: SceneRuntime,
  peel: HudPeelState,
  font: FontFace, atlas: GlyphAtlas,
  out: EmitBuffers,
  now: number,
  info: HudInfo,
  alpha = 1,
) {
  const xform = poseToXform(peel.pose, peel.Wv, peel.Hv);
  hud.build(font, atlas, now, peel.Wv, peel.Hv, info, out, {
    xform,
    masterAlpha: alpha,
    worldLetterbox: true,
  });
}

export function hudWorldToScreen(
  wx: number, wy: number,
  peel: HudPeelState,
): [number, number] {
  return worldToPose(peel.pose, peel.Wv, peel.Hv, wx, wy);
}
