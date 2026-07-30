// ── Camera ───────────────────────────────────────────────────────────────────
// Owns the pan/zoom transform and page navigation. All state lives on AppState;
// these are stateless operations over it.

import type { AppState } from '../state';
import { type Mat4 } from './mat4';
import {
  enterOrbit, flattenOrbit, updateOrbit, orbitViewProj, orbitScale,
  orbitPolar, orbitTargetLocal, disableOrbit, screenToDocLocal, tiltOrbit,
} from './orbit';

export function setSize(s: AppState) {
  const w = innerWidth, h = innerHeight;
  // renderScale (default 1) lets the perf benchmark render at a lower internal
  // resolution than the CSS size (browser upscales) — a direct A/B test for
  // whether a stall is fill-rate/compositor bound (helped by lower res) or
  // main-thread bound (unaffected).
  const rs = s.renderScale || 1;
  [s.rCanvas, s.tCanvas].forEach((c) => { c.width = Math.round(w * s.dpr * rs); c.height = Math.round(h * s.dpr * rs); c.style.width = w + 'px'; c.style.height = h + 'px'; });
  if (s.pages.length) {
    const allH = Math.max(...s.pages.map(p => p.y + p.h)) + 60;
    s.minZoom = Math.min(s.tCanvas.width / s.PAGE_W, s.tCanvas.height / allH) * 0.95;
  } else s.minZoom = 0.002;
  refreshCanvasRect(s);
}

// Backing-store px per CSS px — the scale screen-space chrome must be emitted at
// so its APPARENT size never moves when renderScale resizes the swapchain. The
// world camera is compensated the same way (applyRenderScale scales camZ), so the
// quality dials change sharpness only, never the size of the UI.
export function uiScale(s: AppState): number {
  return s.dpr * (s.renderScale || 1);
}

// Cached canvas bounding rect. getBoundingClientRect() forces a synchronous
// layout reflow; calling it in every pointermove handler (several of them) is the
// classic cause of mouse-move jank. The full-screen canvas only moves/resizes on
// resize or scroll, so we cache the rect and refresh it there.
let _rc = { left: 0, top: 0, width: 1, height: 1 };
export function refreshCanvasRect(s: AppState) {
  const r = s.rCanvas.getBoundingClientRect();
  _rc = { left: r.left, top: r.top, width: r.width || 1, height: r.height || 1 };
}

export function bufCoords(s: AppState, clientX: number, clientY: number) {
  return { x: (clientX - _rc.left) * (s.rCanvas.width / _rc.width), y: (clientY - _rc.top) * (s.rCanvas.height / _rc.height) };
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
    // Sync ALL 2D camera fields from the orbit camera every frame while in 3D
    // (including during exit). This keeps the 2D ortho VP continuously matched
    // to the orbit VP — at the handoff (polar→0) the 2D VP already equals the
    // flattened orbit VP, so there is no position/zoom snap. Without this, only
    // the polar animated during exit while viewX/Y/Z drifted via the 2D easing
    // path, then jumped at the handoff.
    const Ch = s.tCanvas.height;
    const t = orbitTargetLocal();
    const z = orbitScale(Ch);
    s.camX = s.tgtX = s.viewX = t.x;
    s.camY = s.tgtY = s.viewY = t.y;
    s.camZ = s.tgtZ = s.viewZ = z;
    s.velX = s.velY = 0;
    if (c.exiting && orbitPolar() < 1e-2) {
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
const _orthoVP = new Float32Array(16) as Mat4;
export function cameraViewProj(s: AppState, Cw: number, Ch: number): Mat4 {
  if (!s.cam3d.active) {
    const sx = s.viewZ, sy = s.viewZ;
    _orthoVP.fill(0);
    _orthoVP[0] = (2 * sx) / Cw;
    _orthoVP[5] = -(2 * sy) / Ch;
    _orthoVP[15] = 1;
    return _orthoVP;
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

// Continuous 2D↔3D tilt (task 2.4): glide between the flat top-down view and a
// tilted orbit with no snap. enter3D is pixel-identical to 2D at top-down (OQ-9),
// then tiltOrbit eases the polar via the camera-controls transition.
// 2D→3D: enter at top-down (no tilt) — the user tilts manually via right-drag.
// 3D→2D: smooth animated flatten back to top-down, then stepCamera hands to 2D.
export function isTilted(s: AppState): boolean {
  return s.cam3d.active && !s.cam3d.exiting;
}
export function toggleTilt(s: AppState, _polar = 0.9) {
  if (isTilted(s)) exit3D(s);
  else enter3D(s); // no tiltOrbit — stay at top-down, user tilts manually
}
