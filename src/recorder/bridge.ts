// ── recorder bridge ──────────────────────────────────────────────────────────
// Dev-only bridge between the live app and the record/replay harness. Exposes
// the current AppState + camera get/set on `window` so the recorder can snapshot
// a start pose and the replayer can restore it before dispatching events. The
// on-screen fps chip is GPU-drawn (not DOM), so frame.ts also publishes
// window.__perf each frame for the replayer to sample.

import type { AppState } from '../state';
import { enter3D, exit3D } from '../camera/camera';
import { orbitGetPose, orbitSetPose, isReady } from '../camera/orbit';
import { snapTo } from '../playground/app';

export interface CamState {
  active: boolean;
  x: number; y: number; z: number;
  pose: { tx: number; tz: number; dist: number; az: number; polar: number } | null;
}

export function getCam(s: AppState): CamState {
  return {
    active: s.cam3d.active,
    x: s.viewX, y: s.viewY, z: s.viewZ,
    pose: s.cam3d.active && isReady() ? orbitGetPose() : null,
  };
}

/** Restore a captured camera pose. 3D poses go through the orbit camera (exact
 *  world-space target/dist/angles); 2D poses through snapTo. Returns once the
 *  command is issued — the replayer waits a few frames for orbit damping. */
export function setCam(s: AppState, cam: CamState) {
  if (cam.active && cam.pose) {
    if (!s.cam3d.active) enter3D(s);
    const p = cam.pose;
    orbitSetPose(p.tx, p.tz, p.dist, p.az, p.polar);
  } else {
    if (s.cam3d.active) exit3D(s);
    snapTo(s, cam.x, cam.y, cam.z);
  }
}

/** Install the bridge on `window`. Called once the engine + first app exist; the
 *  live state is read from `(globalThis).__csState`, set by createBaseApp. */
export function installBridge() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  w.__rec = {
    get state() {
      const s: AppState | undefined = w.__csState;
      if (!s) return null;
      return { route: location.hash.slice(1).split('?')[0], cam: getCam(s), viewport: { w: s.tCanvas.width, h: s.tCanvas.height, dpr: s.dpr } };
    },
    getCam: () => { const s: AppState | undefined = w.__csState; return s ? getCam(s) : null; },
    setCam: (cam: CamState) => { const s: AppState | undefined = w.__csState; if (s) setCam(s, cam); },
    get perf() { return w.__perf ?? null; },
  };
}
