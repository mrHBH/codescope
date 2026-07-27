// ── Screen ↔ world projection kernel ─────────────────────────────────────────
// Stateless math shared by every surface that projects a screen-space overlay
// into the document plane under the orbit camera: the IDE context menu (which
// peels into a zoomable world card) and the authoring "Living UI" HUD peel
// (runtime/hudWorld.ts). Keeping the arithmetic in one place means the explainer
// cinematic and the IDE menu can never drift apart.
//
// The core invariant the explainer's seamless peel relies on: at detach = 0 the
// screen-locked pose, contained into the canvas virtual resolution, reduces to a
// pure translate+scale of `1/zoom` — so a HUD emitted in backing-store px lands
// exactly where the screen overlay already was, and the peel begins with zero
// visible jump. `poseXform(screenLockedPose(Cw, Ch, cx, cy, z), Cw, Ch)` yields
// `{ ox: cx - Cw/(2z), oy: cy - Ch/(2z), sx: 1/z, sy: 1/z }`. See screenWorld.test.ts.

/** World-space rect of a screen region. `{x,y}` is the top-left in doc coords. */
export interface ScreenPose { x: number; y: number; w: number; h: number; }

/** Uniform translate+scale mapping a virtual resolution into a pose. */
export interface PoseXform { ox: number; oy: number; sx: number; sy: number; }

/**
 * World-space rect of the full viewport under an on-axis camera.
 * `cx,cy` is the ground-plane look-at (doc coords); `zoom` is on-axis scale
 * (device-px per world-px), matching orbitScale / cameraScale.
 */
export function screenLockedPose(
  canvasW: number, canvasH: number,
  cx: number, cy: number, zoom: number,
): ScreenPose {
  const z = Math.max(zoom, 1e-6);
  const w = canvasW / z;
  const h = canvasH / z;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Uniform contain: map a virtual resolution (vw×vh) into a pose without stretching. */
export function poseXform(pose: ScreenPose, vw: number, vh: number): PoseXform {
  const s = Math.min(pose.w / Math.max(vw, 1), pose.h / Math.max(vh, 1));
  return {
    ox: pose.x + (pose.w - vw * s) / 2,
    oy: pose.y + (pose.h - vh * s) / 2,
    sx: s,
    sy: s,
  };
}

/** Virtual-resolution point (sx,sy) → doc coords under a pose. */
export function poseToWorld(pose: ScreenPose, vw: number, vh: number, sx: number, sy: number): [number, number] {
  const xf = poseXform(pose, vw, vh);
  return [xf.ox + sx * xf.sx, xf.oy + sy * xf.sy];
}

/** Doc coords (wx,wy) → virtual-resolution point under a pose (inverse of poseToWorld). */
export function worldToPose(pose: ScreenPose, vw: number, vh: number, wx: number, wy: number): [number, number] {
  const xf = poseXform(pose, vw, vh);
  return [(wx - xf.ox) / xf.sx, (wy - xf.oy) / xf.sy];
}
