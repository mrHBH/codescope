// ── Projection kernel pins ───────────────────────────────────────────────────
// Numeric locks on src/camera/screenWorld.ts. The explainer v2 cinematic and the
// IDE context menu both project screen-space chrome into the document plane
// through this kernel; these pins guarantee the arithmetic — especially the
// detach=0 "seamless boundary" the Living-UI peel depends on — can't silently
// drift under future edits.

import { describe, it, expect } from 'vitest';
import { screenLockedPose, poseXform, poseToWorld, worldToPose, type ScreenPose } from './screenWorld';

describe('screenLockedPose', () => {
  it('maps the full viewport to a world rect centered on the look-at', () => {
    expect(screenLockedPose(1000, 500, 100, 200, 2)).toEqual({ x: -150, y: 75, w: 500, h: 250 });
  });

  it('clamps a non-positive zoom so nothing divides by zero', () => {
    const p = screenLockedPose(100, 100, 0, 0, 0);
    expect(p.w).toBe(1e8);
    expect(p.h).toBe(1e8);
    expect(p.x).toBe(-5e7);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('poseXform (uniform contain)', () => {
  it('centers a square virtual res inside a wide pose, limited by height', () => {
    expect(poseXform({ x: 0, y: 0, w: 200, h: 100 }, 100, 100)).toEqual({ ox: 50, oy: 0, sx: 1, sy: 1 });
  });

  it('centers a square virtual res inside a tall pose, limited by width', () => {
    expect(poseXform({ x: 10, y: 20, w: 100, h: 400 }, 100, 100)).toEqual({ ox: 10, oy: 170, sx: 1, sy: 1 });
  });
});

describe('poseToWorld / worldToPose round-trip', () => {
  const pose: ScreenPose = { x: -150, y: 75, w: 500, h: 250 };
  it('worldToPose inverts poseToWorld exactly', () => {
    for (const [sx, sy] of [[0, 0], [250, 125], [1000, 500], [37.5, 480.25]] as const) {
      const [wx, wy] = poseToWorld(pose, 1000, 500, sx, sy);
      const [bx, by] = worldToPose(pose, 1000, 500, wx, wy);
      expect(bx).toBeCloseTo(sx, 9);
      expect(by).toBeCloseTo(sy, 9);
    }
  });
});

describe('seamless peel boundary (detach = 0)', () => {
  // At detach=0 the screen-locked pose, contained into the canvas virtual
  // resolution, MUST reduce to a pure translate + 1/zoom scale — so a HUD emitted
  // in backing-store px lands exactly where the screen overlay already was and the
  // peel begins with zero visible jump. This is the invariant the explainer's
  // camera choreography (sm-slot fills the screen at fitObj) is built on. Pin it
  // against the IDE's legacy inline formula across representative camera states.
  const cases: [number, number, number, number, number][] = [
    // [canvasW, canvasH, cx, cy, zoom]
    [1920, 1080, 500, 300, 3],
    [1920, 1080, 0, 0, 1],
    [800, 600, -120, 40, 0.5],
    [2560, 1440, 999.5, -77, 14],
  ];
  for (const [Cw, Ch, cx, cy, z] of cases) {
    it(`reproduces the legacy xform for ${Cw}x${Ch} @(${cx},${cy}) z=${z}`, () => {
      const xf = poseXform(screenLockedPose(Cw, Ch, cx, cy, z), Cw, Ch);
      const legacy = { ox: cx - Cw / (2 * z), oy: cy - Ch / (2 * z), sx: 1 / z, sy: 1 / z };
      expect(xf.ox).toBeCloseTo(legacy.ox, 9);
      expect(xf.oy).toBeCloseTo(legacy.oy, 9);
      expect(xf.sx).toBeCloseTo(legacy.sx, 9);
      expect(xf.sy).toBeCloseTo(legacy.sy, 9);
      // Uniform (no stretch) — the contain scale is identical on both axes.
      expect(xf.sx).toBe(xf.sy);
    });
  }
});
