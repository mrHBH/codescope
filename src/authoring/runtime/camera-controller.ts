// ── Camera controller — splines CameraKeyframe[] into poses ─────────────────

import type { CameraKeyframe, CameraTrack, EasingName } from '../ir/types';
import type { CameraPose } from './timeline-engine';

export class CameraController {
  private keyframes: CameraKeyframe[];

  constructor(track: CameraTrack) {
    this.keyframes = [...track.keyframes].sort((a, b) => a.time - b.time);
  }

  getPose(t: number): CameraPose {
    const kfs = this.keyframes;
    if (kfs.length === 0) {
      return { center: [0, 0], zoom: 1, rotation: 0 };
    }

    // Before first keyframe
    if (t <= kfs[0].time) {
      return { center: kfs[0].center, zoom: kfs[0].zoom, rotation: kfs[0].rotation ?? 0 };
    }

    // After last keyframe
    const last = kfs[kfs.length - 1];
    if (t >= last.time) {
      return { center: last.center, zoom: last.zoom, rotation: last.rotation ?? 0 };
    }

    // Between two keyframes — linear interpolation
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      if (t >= a.time && t <= b.time) {
        const alpha = (t - a.time) / (b.time - a.time);
        // Use the easing specified on the destination keyframe
        const eased = b.ease ? this.ease(b.ease, alpha) : alpha;
        return {
          center: [
            a.center[0] + (b.center[0] - a.center[0]) * eased,
            a.center[1] + (b.center[1] - a.center[1]) * eased,
          ],
          zoom: a.zoom + (b.zoom - a.zoom) * eased,
          rotation: (a.rotation ?? 0) + ((b.rotation ?? 0) - (a.rotation ?? 0)) * eased,
        };
      }
    }

    return { center: last.center, zoom: last.zoom, rotation: last.rotation ?? 0 };
  }

  private ease(name: EasingName, t: number): number {
    // Simple cubic for now — the runtime ties into the full easing set
    switch (name) {
      case 'smoothstep': return t * t * (3 - 2 * t);
      case 'smootherstep': return t * t * t * (t * (t * 6 - 15) + 10);
      case 'cubicOut': return --t * t * t + 1;
      case 'rushInto': return 2 * (t * t * (3 - 2 * t));
      default: return t;
    }
  }

  updateTrack(track: CameraTrack): void {
    this.keyframes = [...track.keyframes].sort((a, b) => a.time - b.time);
  }
}
