// ── Camera ───────────────────────────────────────────────────────────────────
// Owns the pan/zoom transform and page navigation. All state lives on AppState;
// these are stateless operations over it.

import type { AppState } from '../state';
import { type Mat4 } from './mat4';
import {
  enterOrbit, flattenOrbit, updateOrbit, orbitViewProj, orbitScale,
  orbitPolar, orbitTargetLocal, disableOrbit, screenToDocLocal,
} from './orbit';

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

// Screen (device px) → document-space (x, y), valid in both 2D and 3D. In 3D it
// ray-casts the pointer onto the grounded document plane (see orbit.ts).
export function scrToDoc(s: AppState, sx: number, sy: number) {
  if (s.cam3d.active) return screenToDocLocal(sx, sy, s.tCanvas.width, s.tCanvas.height);
  return scrToWorld(s, sx, sy);
}

export function goToPage(s: AppState, i: number) {
  const p = s.pages[i]; if (!p) return;
  // Leaving the 3D free camera for a 2D page view (e.g. editor/terminal buttons).
  if (s.cam3d.active) { disableOrbit(); s.cam3d.active = false; s.cam3d.exiting = false; }
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

  // 3D free camera — the yasmineOS `camera-controls` library owns the motion,
  // damping and input; we just advance it and hand back to 2D on exit.
  const c = s.cam3d;
  if (c.active) {
    updateOrbit(dt);
    if (c.exiting && orbitPolar() < 1e-2) {
      const Ch = s.tCanvas.height;
      const { x, y } = orbitTargetLocal();
      const z2d = orbitScale(Ch);
      s.camX = s.tgtX = s.viewX = x;
      s.camY = s.tgtY = s.viewY = y;
      s.camZ = s.tgtZ = s.viewZ = z2d;
      disableOrbit();
      c.active = false; c.exiting = false;
    }
  }
}

// The effective world-px→device-px scale (drives the AA-skirt pad and caret
// width). In 2D it's the zoom; in 3D it's the camera's on-axis scale.
export function cameraScale(s: AppState): number {
  if (!s.cam3d.active) return s.viewZ;
  return orbitScale(s.tCanvas.height);
}

// This frame's view-projection matrix: orthographic (legacy 2D) or the
// camera-controls perspective camera with the document laid flat on the ground.
export function cameraViewProj(s: AppState, Cw: number, Ch: number): Mat4 {
  if (!s.cam3d.active) {
    // Origin-centered orthographic matrix — camera translation is handled via
    // the camCenter uniform (subtracted in the vertex shader). This keeps the
    // matrix terms small and avoids catastrophic cancellation at extreme zoom.
    const sx = s.viewZ, sy = s.viewZ;
    const m = new Float32Array(16) as Mat4;
    m[0] = (2 * sx) / Cw;
    m[5] = -(2 * sy) / Ch;
    m[15] = 1;
    return m;
  }
  return orbitViewProj(Cw, Ch);
}

// Enter 3D from the current 2D framing (seamless: top-down view of the grounded
// document is pixel-identical to the 2D view).
export function enter3D(s: AppState) {
  const c = s.cam3d;
  if (c.active && !c.exiting) return;
  enterOrbit(s.viewX, s.viewY, s.viewZ, s.tCanvas.height);
  c.exiting = false; c.active = true;
  s.velX = s.velY = 0;
}

// Ease back to top-down, then stepCamera hands control to the 2D path.
export function exit3D(s: AppState) {
  const c = s.cam3d;
  if (!c.active) return;
  c.exiting = true;
  flattenOrbit();
}

export function toggle3D(s: AppState) {
  if (s.cam3d.active && !s.cam3d.exiting) exit3D(s); else enter3D(s);
}
