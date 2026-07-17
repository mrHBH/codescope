// ── Animation clip constructors ──────────────────────────────────────────────

import type {
  AnimationClip, ObjectSpec, Vec2, EasingName,
  TextSpec, PolygonSpec,
} from '../ir/types';

export interface AnimOpts { duration?: number; ease?: EasingName; }
export interface WriteOpts extends AnimOpts { charsPerSec?: number; }
export interface DrawOpts extends AnimOpts {}
export interface FadeOpts extends AnimOpts {}
export interface MoveToOpts extends AnimOpts {}
export interface ShiftOpts extends AnimOpts {}
export interface ScaleToOpts extends AnimOpts {}
export interface RotateToOpts extends AnimOpts {}
export interface MorphToOpts extends AnimOpts {}
export interface ParamAnimOpts extends AnimOpts {}

export function createClips(
  clips: AnimationClip[],
  _objects: Record<string, ObjectSpec>,
  genId: (base: string) => number | string,
  trackDuration: (t: number) => void,
) {
  let lastGroupStart = 0;

  function makeClip(
    kind: AnimationClip['kind'],
    target: ObjectSpec,
    start: number,
    duration: number,
    ease: EasingName,
    props: Record<string, unknown>,
  ): AnimationClip {
    const clip: AnimationClip = {
      id: `clip_${genId(kind)}`,
      target: target.id,
      kind,
      start,
      duration,
      ease,
      props,
    };
    clips.push(clip);
    trackDuration(start + duration);
    return clip;
  }

  return {
    at(time: number) {
      lastGroupStart = time;
      return {
        play(...anims: AnimationClip[]) {
          for (const a of anims) {
            a.start = time;
            trackDuration(time + a.duration);
          }
        },
        with(...anims: AnimationClip[]) {
          for (const a of anims) {
            a.start = lastGroupStart;
            trackDuration(lastGroupStart + a.duration);
          }
        },
      };
    },

    clip(a: AnimationClip): AnimationClip {
      clips.push(a);
      trackDuration(a.start + a.duration);
      return a;
    },

    write(target: TextSpec, opts: WriteOpts = {}): AnimationClip {
      return makeClip('write', target, 0, opts.duration ?? target.content.length / (opts.charsPerSec ?? 30), opts.ease ?? 'linear', {});
    },

    draw(target: ObjectSpec, opts: DrawOpts = {}): AnimationClip {
      return makeClip('draw', target, 0, opts.duration ?? 1, opts.ease ?? 'cubicOut', {});
    },

    fadeIn(target: ObjectSpec, opts: FadeOpts = {}): AnimationClip {
      return makeClip('fadeIn', target, 0, opts.duration ?? 1, opts.ease ?? 'smootherstep', {});
    },

    fadeOut(target: ObjectSpec, opts: FadeOpts = {}): AnimationClip {
      return makeClip('fadeOut', target, 0, opts.duration ?? 1, opts.ease ?? 'smootherstep', {});
    },

    moveTo(target: ObjectSpec, to: Vec2, opts: MoveToOpts = {}): AnimationClip {
      return makeClip('moveTo', target, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { x: to[0], y: to[1] });
    },

    shift(target: ObjectSpec, delta: Vec2, opts: ShiftOpts = {}): AnimationClip {
      return makeClip('shift', target, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { dx: delta[0], dy: delta[1] });
    },

    scaleTo(target: ObjectSpec, scale: number | [number, number?], opts: ScaleToOpts = {}): AnimationClip {
      const [sx, sy] = typeof scale === 'number' ? [scale, scale] : [scale[0], scale[1] ?? scale[0]];
      return makeClip('scaleTo', target, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { sx, sy });
    },

    rotateTo(target: ObjectSpec, radians: number, opts: RotateToOpts = {}): AnimationClip {
      return makeClip('rotateTo', target, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { radians });
    },

    morphTo(target: PolygonSpec, points: Vec2[], opts: MorphToOpts = {}): AnimationClip {
      return makeClip('morphTo', target, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { points });
    },

    animateParam(paramId: string, from: number, to: number, opts: ParamAnimOpts = {}): AnimationClip {
      return makeClip('param', { id: paramId } as ObjectSpec, 0, opts.duration ?? 1, opts.ease ?? 'smoothstep', { paramId, from, to });
    },
  };
}
