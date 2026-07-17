// ── Camera builder ──────────────────────────────────────────────────────────

import type { CameraKeyframe, AnimationClip, Vec2, EasingName } from '../ir/types';

export function createCameraBuilder(
  keyframes: CameraKeyframe[],
  trackDuration: (t: number) => void,
) {
  return {
    keyframes,

    to(
      target: { center: Vec2; zoom: number; rotation?: number },
      opts: { duration?: number; ease?: EasingName } = {},
    ): AnimationClip {
      const start = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 0;
      const duration = opts.duration ?? 2;
      keyframes.push({
        time: start + duration,
        center: target.center,
        zoom: target.zoom,
        rotation: target.rotation,
        ease: opts.ease,
      });
      trackDuration(start + duration);
      return {
        id: 'camera_clip',
        target: 'camera',
        kind: 'cameraTo',
        start,
        duration,
        ease: opts.ease ?? 'smoothstep',
        props: { center: target.center, zoom: target.zoom, rotation: target.rotation },
      };
    },

    keyframe(time: number, center: Vec2, zoom: number, rotation?: number, ease?: EasingName): void {
      keyframes.push({ time, center, zoom, rotation, ease });
      trackDuration(time);
    },
  };
}
