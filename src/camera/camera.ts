// ── Camera ───────────────────────────────────────────────────────────────────
// Owns the pan/zoom transform and page navigation. All state lives on AppState;
// these are stateless operations over it.

import type { AppState } from '../state';

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
}
