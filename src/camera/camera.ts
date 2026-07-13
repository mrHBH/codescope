// ── Camera ───────────────────────────────────────────────────────────────────
// Owns the pan/zoom transform and page navigation. All state lives on AppState;
// these are stateless operations over it.

import type { AppState } from '../state';
import { type Mat4, orthoWorld2D, perspective, lookAt, mul, type Vec3 } from './mat4';

export function setSize(s: AppState) {
  const w = innerWidth, h = innerHeight;
  [s.rCanvas, s.tCanvas].forEach((c) => { c.width = w * s.dpr; c.height = h * s.dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; });
  if (s.pages.length) {
    const allH = Math.max(...s.pages.map(p => p.y + p.h)) + 60;
    s.minZoom = Math.min(s.tCanvas.width / s.PAGE_W, s.tCanvas.height / allH) * 0.95;
  } else s.minZoom = 0.002;
}

export function bufCoords(s: AppState, clientX: number, clientY: number) {
  const rc = s.rCanvas.getBoundingClientRect();
  return { x: (clientX - rc.left) * (s.rCanvas.width / rc.width), y: (clientY - rc.top) * (s.rCanvas.height / rc.height) };
}

export function scrToWorld(s: AppState, sx: number, sy: number) {
  return { x: (sx - s.tCanvas.width / 2) / s.camZ + s.camX, y: (sy - s.tCanvas.height / 2) / s.camZ + s.camY };
}

export function goToPage(s: AppState, i: number) {
  const p = s.pages[i]; if (!p) return;
  s.tgtZ = (s.tCanvas.width / s.PAGE_W) * 0.96;
  s.tgtX = p.x + p.w / 2;
  // Position so page top appears ~40px from top of viewport
  const halfViewH = s.tCanvas.height / (2 * s.tgtZ);
  s.tgtY = p.y + 40 + halfViewH;
  s.velX = s.velY = 0;
}

// Frame the whole document within the viewport (used by the context menu).
export function fitDocument(s: AppState) {
  s.tgtZ = Math.max(s.minZoom, (s.tCanvas.height / s.docH) * 0.94);
  s.tgtX = s.PAGE_W / 2;
  s.tgtY = s.docH / 2;
  s.velX = s.velY = 0;
}

// Per-frame camera integration: momentum, easing toward target, zoom clamp.
export function stepCamera(s: AppState, dt: number, now: number) {
  if (!s.dragging) {
    if (Math.abs(s.velX) > 0.01 || Math.abs(s.velY) > 0.01) {
      s.camX -= (s.velX * dt) / s.camZ; s.camY -= (s.velY * dt) / s.camZ; s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
      s.velX *= Math.pow(.85, dt / 16); s.velY *= Math.pow(.85, dt / 16);
      if (Math.abs(s.velX) < .01 && Math.abs(s.velY) < .01) s.velX = s.velY = 0;
    } else {
      const e = 1 - Math.pow(0.01, dt / 1000);
      s.camX += (s.tgtX - s.camX) * e; s.camY += (s.tgtY - s.camY) * e; s.camZ += (s.tgtZ - s.camZ) * e;
    }
  }
  s.camZ = Math.max(s.minZoom, s.camZ);
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;

  // 3D orbit easing — yaw/pitch/dist glide toward their targets so every move
  // (and the 2D↔3D handoff) is continuous, never stepped.
  const c = s.cam3d;
  if (c.active) {
    const e = 1 - Math.pow(0.0025, dt / 1000);
    c.yaw += (c.tgtYaw - c.yaw) * e;
    c.pitch += (c.tgtPitch - c.pitch) * e;
    c.dist += (c.tgtDist - c.dist) * e;
    // Finishing an exit: once flattened back to head-on, hand control to the 2D
    // path from the exact same framing (seamless — a flat plane facing the
    // camera has no perspective distortion, so the images match).
    if (c.exiting && Math.abs(c.yaw) < 1e-3 && Math.abs(c.pitch) < 1e-3) {
      const Ch = s.tCanvas.height;
      const z = Ch / (2 * c.dist * Math.tan(c.fov / 2));
      s.camZ = s.tgtZ = s.viewZ = z;
      c.active = false; c.exiting = false;
    }
  }
}

// The effective world-px→device-px scale at the target plane (drives the AA-skirt
// pad and caret width). In 2D it's the zoom; in 3D it's the on-axis scale.
export function cameraScale(s: AppState): number {
  const c = s.cam3d;
  if (!c.active) return s.viewZ;
  return s.tCanvas.height / (2 * c.dist * Math.tan(c.fov / 2));
}

// Build this frame's view-projection matrix: orthographic (legacy 2D) or a real
// perspective camera orbiting the target plane point (viewX, viewY, 0).
export function cameraViewProj(s: AppState, Cw: number, Ch: number): Mat4 {
  const c = s.cam3d;
  if (!c.active) {
    const sx = s.viewZ, sy = s.viewZ;
    const tx = Cw / 2 - s.viewZ * s.viewX, ty = Ch / 2 - s.viewZ * s.viewY;
    return orthoWorld2D(sx, sy, tx, ty, Cw, Ch);
  }
  const target: Vec3 = [s.viewX, s.viewY, 0];
  // Orbit offset: start on the +z axis (in front of the plane), then yaw about
  // world-Y and pitch about world-X. World is Y-down, so we build with a Y-up
  // basis and flip Y in the projection to land the image right-side-up.
  const cy = Math.cos(c.yaw), sy2 = Math.sin(c.yaw);
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  // dir = Ry(yaw) · Rx(pitch) · (0,0,1)
  const dir: Vec3 = [sy2 * cp, -sp, cy * cp];
  const up: Vec3 = [sy2 * sp, cp, cy * sp]; // Ry(yaw) · Rx(pitch) · (0,1,0)
  const eye: Vec3 = [target[0] + dir[0] * c.dist, target[1] + dir[1] * c.dist, target[2] + dir[2] * c.dist];
  const view = lookAt(eye, target, up);
  const aspect = Cw / Ch;
  const near = Math.max(1, c.dist * 0.02);
  const far = c.dist * 100 + s.docH;
  const proj = perspective(c.fov, aspect, near, far);
  // flipY (world Y-down → screen Y-down): negate clip-space y.
  const flipY = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return mul(mul(flipY, proj), view);
}

// Enter 3D free-camera mode from the current 2D framing (seamless: pitch/yaw
// start at 0 and dist is chosen so the on-axis scale equals the current zoom).
export function enter3D(s: AppState) {
  const c = s.cam3d;
  if (c.active && !c.exiting) return;
  const Ch = s.tCanvas.height;
  c.dist = c.tgtDist = Ch / (2 * s.viewZ * Math.tan(c.fov / 2));
  c.yaw = c.tgtYaw = 0; c.pitch = c.tgtPitch = 0;
  c.exiting = false; c.active = true;
  s.velX = s.velY = 0;
}

// Ease back to head-on, then stepCamera hands control to the 2D path.
export function exit3D(s: AppState) {
  const c = s.cam3d;
  if (!c.active) return;
  c.tgtYaw = 0; c.tgtPitch = 0; c.exiting = true;
}

export function toggle3D(s: AppState) {
  if (s.cam3d.active && !s.cam3d.exiting) exit3D(s); else enter3D(s);
}
