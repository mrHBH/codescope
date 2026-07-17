// ── Scene Builder — the manim-beating declarative TS API ────────────────────
//
// Usage:
//   export default scene((sc) => {
//     const title = sc.text('Hello', { size: 48, color: [1, 0.8, 0.2, 1] });
//     sc.at(0).play(sc.write(title));
//     sc.at(1).play(sc.camera.to({ center: [100, 0], zoom: 2 }));
//   });
//
// The builder records IR. Nothing animates until loaded into the runtime.

import type {
  SceneIR, SceneMeta, ObjectSpec, AnimationClip,
  CameraKeyframe, ParamDef,
  Vec2, Color, EasingName,
} from '../ir/types';
import * as IR from '../ir/types';
import { createObjects } from './objects';
import { createClips } from './clips';
import type { TextOpts, GlyphOpts, RectOpts, CircleOpts, EllipseOpts, PolygonOpts, ArcOpts, LineOpts, ArrowOpts, GroupOpts } from './objects';
import type { WriteOpts, DrawOpts, FadeOpts, MoveToOpts, ShiftOpts, ScaleToOpts, RotateToOpts, MorphToOpts, ParamAnimOpts } from './clips';
import type { ParamOpts } from './params';
import { createCameraBuilder } from './camera';
import { createParams } from './params';
import { star, arrow, align } from './helpers';
import type { AlignHelpers } from './helpers';

// ── Public helpers ───────────────────────────────────────────────────────────

const color = (r: number, g: number, b: number, a = 1): Color => [r / 255, g / 255, b / 255, a];

// ── Scene function export ────────────────────────────────────────────────────

export function scene(fn: (sc: SceneBuilder) => void, meta?: Partial<SceneMeta>): SceneIR {
  const builder = createScene(meta);
  fn(builder);
  return builder.build();
}

// ── SceneBuilder factory ─────────────────────────────────────────────────────

export function createScene(meta?: Partial<SceneMeta>): SceneBuilder {
  const objects: Record<string, ObjectSpec> = {};
  const clips: AnimationClip[] = [];
  const cameraKeyframes: CameraKeyframe[] = [];
  const params: ParamDef[] = [];
  const idCounter = new Map<string, number>();
  let duration = meta?.duration ?? 0;

  function genId(base: string): string {
    const key = base.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const n = idCounter.get(key) ?? 0;
    idCounter.set(key, n + 1);
    return n === 0 ? key : `${key}_${n}`;
  }

  function trackDuration(t: number) {
    if (t > duration) duration = t;
  }

  // ── Object factories ─────────────────────────────────────────────────────

  const objApi = createObjects(objects, genId);

  const camBuilder = createCameraBuilder(cameraKeyframes, trackDuration);

  // ── Clip scheduling ──────────────────────────────────────────────────────

  const clipBuilder = createClips(clips, objects, genId, trackDuration);

  // ── Params ─────────────────────────────────────────────────────────────────

  const paramBuilder = createParams(params);

  // ── Build ─────────────────────────────────────────────────────────────────

  function build(): SceneIR {
    return {
      version: 1,
      meta: {
        title: meta?.title ?? 'Untitled',
        duration: duration > 0 ? duration : 1,
      },
      objects,
      clips,
      camera: { keyframes: cameraKeyframes },
      params,
    };
  }

  const builder: SceneBuilder = {
    ...objApi,
    ...clipBuilder,
    ...paramBuilder,
    camera: { ...camBuilder, keyframes: cameraKeyframes },
    build,
    star,
    color,
    align,
    get duration() { return duration; },
    get objects() { return objects; },
    get clips() { return clips; },
  };

  return builder;
}

// ── Builder interface ────────────────────────────────────────────────────────

export interface SceneBuilder {
  // Objects
  text(content: string, opts?: TextOpts): IR.TextSpec;
  glyph(char: string, opts?: GlyphOpts): IR.GlyphSpec;
  rect(opts?: RectOpts): IR.RectSpec;
  circle(opts?: CircleOpts): IR.CircleSpec;
  ellipse(opts?: EllipseOpts): IR.EllipseSpec;
  polygon(opts?: PolygonOpts): IR.PolygonSpec;
  arc(opts?: ArcOpts): IR.ArcSpec;
  line(opts?: LineOpts): IR.LineSpec;
  arrow(opts?: ArrowOpts): IR.ArrowSpec;
  group(children?: string[], opts?: GroupOpts): IR.GroupSpec;

  // Scheduling
  at(time: number): ClipScheduler;
  clip(animation: IR.AnimationClip): IR.AnimationClip;

  // Animation factories
  write(target: IR.TextSpec, opts?: WriteOpts): IR.AnimationClip;
  draw(target: IR.ObjectSpec, opts?: DrawOpts): IR.AnimationClip;
  fadeIn(target: IR.ObjectSpec, opts?: FadeOpts): IR.AnimationClip;
  fadeOut(target: IR.ObjectSpec, opts?: FadeOpts): IR.AnimationClip;
  moveTo(target: IR.ObjectSpec, to: Vec2, opts?: MoveToOpts): IR.AnimationClip;
  shift(target: IR.ObjectSpec, delta: Vec2, opts?: ShiftOpts): IR.AnimationClip;
  scaleTo(target: IR.ObjectSpec, scale: number | [number, number?], opts?: ScaleToOpts): IR.AnimationClip;
  rotateTo(target: IR.ObjectSpec, radians: number, opts?: RotateToOpts): IR.AnimationClip;
  morphTo(target: IR.PolygonSpec, points: Vec2[], opts?: MorphToOpts): IR.AnimationClip;
  animateParam(paramId: string, from: number, to: number, opts?: ParamAnimOpts): IR.AnimationClip;

  // Params
  param(id: string, def: ParamOpts): IR.ParamDef;
  paramRef(id: string): IR.ParamRef;

  // Camera
  camera: CameraBuilder;

  // Helpers
  star(innerR: number, outerR: number, points: number): Vec2[];
  color(r: number, g: number, b: number, a?: number): Color;
  align: AlignHelpers;

  // Finalize
  build(): SceneIR;

  readonly duration: number;
  readonly objects: Record<string, ObjectSpec>;
  readonly clips: AnimationClip[];
}

export interface ClipScheduler {
  play(...anims: IR.AnimationClip[]): void;
  /** Schedule overlapping with the most recent play() group. */
  with(...anims: IR.AnimationClip[]): void;
}

export interface CameraBuilder {
  to(target: { center: Vec2; zoom: number; rotation?: number }, opts?: { duration: number; ease?: EasingName }): IR.AnimationClip;
  keyframe(time: number, center: Vec2, zoom: number, rotation?: number, ease?: EasingName): void;
  keyframes: CameraKeyframe[];
}

// Re-export helpers
export { star, arrow, align, color };
