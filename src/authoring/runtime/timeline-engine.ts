// ── Timeline engine — deterministic seek(t) → FrameState ───────────────────
//
// Pure function over AnimationClip[]. No mutation, no dt accumulation.
// state = f(t) — the exact property that makes scrubbing, hot-reload,
// and interaction possible.

import type { AnimationClip, EasingName } from '../ir/types';

// ── Frame state ──────────────────────────────────────────────────────────────

export interface FrameState {
  /** Per-object property overrides for this frame. */
  objects: Map<string, ObjectState>;
  /** Camera pose for this frame. */
  camera: CameraPose | null;
}

export interface ObjectState {
  opacity: number;
  visible: boolean;
  reveal: number;
  position: [number, number] | null;    // null = not animated this frame
  scale: [number | null, number | null]; // [x, y] where null = not animated
  rotation: number | null;               // null = not animated
}

export interface CameraPose {
  center: [number, number];
  zoom: number;
  rotation: number;
}

// ── Easing functions ─────────────────────────────────────────────────────────

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => --t * t * t + 1,
  cubicInOut: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  quintIn: (t) => t * t * t * t * t,
  quintOut: (t) => 1 - --t * t * t * t * t,
  quintInOut: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,
  smoothstep: (t) => t * t * (3 - 2 * t),
  smootherstep: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  backOut: (t) => { const c = 1.70158; return --t * t * ((c + 1) * t + c) + 1; },
  elasticOut: (t) => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1,
  bounceOut: (t: number): number => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  rushInto: (t) => 2 * (t * t * (3 - 2 * t)), // 2x smoothstep first half
  rushFrom: (t) => 2 * ((t + 0.5) * (t + 0.5) * (3 - 2 * (t + 0.5))) - 1, // second half
  // Missing easings from the EasingName list — approximate
  backIn: (t) => { const c = 1.70158; return t * t * ((c + 1) * t - c); },
  backInOut: (t) => { const c = 1.70158 * 1.525; return t < 0.5 ? (2 * t * 2 * t * ((c + 1) * 2 * t - c)) / 2 : ((2 * t - 2) * (2 * t - 2) * ((c + 1) * (2 * t - 2) + c) + 2) / 2; },
  elasticIn: (t) => t === 0 || t === 1 ? t : -(2 ** (10 * (1 - t))) * Math.sin(((1 - t) - 0.075) * (2 * Math.PI) / 0.3) + 1,
  bounceIn: (t: number): number => {
    const bo = EASING_FUNCS.bounceOut(1 - t);
    return typeof bo === 'number' ? 1 - bo : 0;
  },
};

const EASING_FUNCS = EASINGS;

function ease(name: EasingName, t: number): number {
  const fn = EASING_FUNCS[name];
  if (!fn) return t;
  return Math.max(0, Math.min(1, fn(t)));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class TimelineEngine {
  private clips: AnimationClip[];

  constructor(clips: AnimationClip[]) {
    // Sort by insertion order (preserves the "latest wins" semantics)
    this.clips = [...clips];
  }

  /**
   * Compute the frame state at absolute time `t`.
   * Pure function — no mutation of clips or external state.
   */
  seek(t: number): FrameState {
    const objects = new Map<string, ObjectState>();
    let camera: CameraPose | null = null;

    for (const clip of this.clips) {
      if (t < clip.start || t > clip.start + clip.duration) continue;

      const raw = clamp01((t - clip.start) / clip.duration);
      const alpha = ease(clip.ease, raw);

      this.applyClip(clip, alpha, objects, camera, ref => { camera = ref; });
    }

    return { objects, camera };
  }

  private applyClip(
    clip: AnimationClip,
    alpha: number,
    objects: Map<string, ObjectState>,
    camera: CameraPose | null,
    setCamera: (c: CameraPose) => void,
  ): void {
    const target = clip.target;

    if (target === 'camera') {
      if (clip.kind === 'cameraTo') {
        const p = clip.props as { center: [number, number]; zoom: number; rotation?: number };
        setCamera({
          center: p.center,
          zoom: p.zoom,
          rotation: p.rotation ?? 0,
        });
      }
      return;
    }

    let obj = objects.get(target);
    if (!obj) {
      obj = { opacity: 1, visible: true, reveal: 1, position: null, scale: [null, null], rotation: null };
      objects.set(target, obj);
    }

    switch (clip.kind) {
      case 'fadeIn':
        obj.opacity = alpha;
        obj.visible = true;
        break;
      case 'fadeOut':
        obj.opacity = 1 - alpha;
        if (alpha >= 1) obj.visible = false;
        break;
      case 'draw':
        obj.reveal = alpha;
        obj.visible = true;
        obj.opacity = 1;
        break;
      case 'write':
        obj.reveal = alpha;  // approximate — text-specific reveal handled by runtime
        obj.visible = true;
        break;
      case 'moveTo': {
        const p = clip.props;
        // We store the destination; the runtime interpolates from current position
        obj.position = [p.x as number, p.y as number];
        break;
      }
      case 'shift': {
        const p = clip.props;
        obj.position = [p.dx as number, p.dy as number]; // delta
        break;
      }
      case 'scaleTo': {
        const p = clip.props;
        obj.scale = [p.sx as number, (p.sy as number) ?? (p.sx as number)];
        break;
      }
      case 'rotateTo': {
        const p = clip.props;
        obj.rotation = p.radians as number;
        break;
      }
      case 'morphTo':
        // Handled by the object resolver / Mobject system
        break;
      case 'param':
        // Handled by the param binder
        break;
    }
  }

  /** Update clips (for hot-reload). */
  updateClips(clips: AnimationClip[]): void {
    this.clips = [...clips];
  }
}
