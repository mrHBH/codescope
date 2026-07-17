// ── windgraph · story (authoring API) ────────────────────────────────────────
// The declarative layer that turns the animation engine into an authoring surface
// for cinematic explainers — and the foundation the scripting layer will target.
//
// A Story is an ordered list of BEATS. Each beat builds mobjects (`setup`) and
// authors animations onto a single shared, seekable Timeline (`play`). Camera
// moves are ordinary animations (via CameraRig) so they sync on the same clock;
// the rig writes a pure `pose {x,y,zoom}` that the host applies to its camera —
// keeping this module free of any app-state dependency. MathTex is wrapped as a
// Mobject (MathMobject) so LaTeX animates + emits alongside everything else.

import { Mobject, type RenderCtx } from '../mobject/mobject';
import { identity, mul, apply, scaleOf, type Aff } from '../mobject/affine';
import { Scene } from '../anim/scene';
import { Timeline, ValueTracker } from '../anim/timeline';
import { Animation, type AnimOpts } from '../anim/animations';
import { easeInOutCubic } from '../anim/easing';
import { MathTex } from '../math/mathtex';

export interface CameraPose { x: number; y: number; zoom: number; }

export interface MathOpts { x?: number; y?: number; size?: number; color?: number[]; anchor?: 'start' | 'middle' | 'end'; }

// A MathTex wrapped as a Mobject: animates (Create = write-on via reveal, FadeIn
// via opacity) and emits through the shared RenderCtx like any other mobject.
export class MathMobject extends Mobject {
  size: number;
  color: number[];
  anchor: 'start' | 'middle' | 'end';
  private tex: MathTex;
  constructor(latex: string, opts: MathOpts = {}) {
    super();
    this.tex = new MathTex(latex);
    this.position = [opts.x ?? 0, opts.y ?? 0];
    this.size = opts.size ?? 60;
    this.color = opts.color ?? [0.92, 0.94, 0.99, 1];
    this.anchor = opts.anchor ?? 'start';
  }
  protected build() { return []; }
  emit(ctx: RenderCtx, parent: Aff = identity()) {
    if (!this.visible || this.opacity <= 0.0005) return;
    const m = mul(parent, this.localMatrix());
    const [x, y] = apply(m, 0, 0);
    this.tex.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, {
      x, y, size: this.size * scaleOf(m), opacity: this.opacity, reveal: this.reveal, color: this.color, anchor: this.anchor,
    });
    for (const c of this.children) c.emit(ctx, m);
  }
}

// A camera animation writes into a shared pose object (never the app state).
class CameraAnim extends Animation {
  private from: CameraPose = { x: 0, y: 0, zoom: 1 };
  constructor(private pose: CameraPose, private to: CameraPose, opts: AnimOpts = {}) {
    super({ position: [0, 0], visible: true, opacity: 1, reveal: 1 } as any, { duration: opts.duration ?? 1.5, easing: opts.easing ?? easeInOutCubic });
  }
  protected onBegin() { this.from = { ...this.pose }; }
  protected apply(a: number) {
    this.pose.x = this.from.x + (this.to.x - this.from.x) * a;
    this.pose.y = this.from.y + (this.to.y - this.from.y) * a;
    // Geometric zoom interpolation reads as a natural, constant-speed dolly.
    this.pose.zoom = this.from.zoom * Math.pow(this.to.zoom / this.from.zoom, a);
  }
}

export class CameraRig {
  pose: CameraPose = { x: 0, y: 0, zoom: 1 };
  /** Set the pose instantly (initial framing). */
  set(x: number, y: number, zoom: number) { this.pose.x = x; this.pose.y = y; this.pose.zoom = zoom; }
  /** Tween to a pose over time (schedule on the timeline). */
  moveTo(x: number, y: number, zoom: number, opts: AnimOpts = {}): Animation { return new CameraAnim(this.pose, { x, y, zoom }, opts); }
  /** Stay put for `duration` (a camera-side wait). */
  hold(duration = 1): Animation { return new CameraAnim(this.pose, { ...this.pose }, { duration }); }
}

export interface StoryCtx {
  add(...m: Mobject[]): void;
  cam: CameraRig;
  math(latex: string, opts?: MathOpts): MathMobject;
  tracker(v?: number): ValueTracker;
  caption(title: string, sub?: string): void;
}

export interface Beat {
  name?: string;
  setup?(c: StoryCtx): void;              // build/add mobjects, set the caption
  play?(tl: Timeline, c: StoryCtx): void; // author animations (advance the clock)
  hold?: number;                          // trailing wait (seconds)
}

interface CaptionEvent { t: number; title: string; sub?: string; }

export class StoryPlayer {
  readonly scene = new Scene();
  readonly cam = new CameraRig();
  private captions: CaptionEvent[] = [];
  private initial: CameraPose = { x: 0, y: 0, zoom: 1 };
  private lastNow = -1;
  t = 0;

  constructor(beats: Beat[]) {
    const tl = this.scene.timeline;
    const ctx: StoryCtx = {
      add: (...m) => this.scene.add(...m),
      cam: this.cam,
      math: (latex, opts) => new MathMobject(latex, opts),
      tracker: (v = 0) => new ValueTracker(v),
      caption: (title, sub) => this.captions.push({ t: tl.duration, title, sub }),
    };
    for (const beat of beats) {
      beat.setup?.(ctx);
      beat.play?.(tl, ctx);
      if (beat.hold) tl.wait(beat.hold);
    }
    this.initial = { ...this.cam.pose }; // captured after setups (first beat sets it)
    this.scene.snapshotAll();
  }

  get pose(): CameraPose { return this.cam.pose; }
  get duration(): number { return this.scene.timeline.duration; }

  // Advance by wall-clock `now` (ms); loops after a tail so the explainer replays.
  advance(now: number, loop = true) {
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    const tl = this.scene.timeline;
    if (loop && tl.t >= tl.duration + 0.8) this.reset();
    tl.update(dt);
    this.scene.root.tick(tl.t, dt);
    this.t = tl.t;
  }

  private reset() {
    this.scene.timeline.reset();
    // Restore the initial camera by MUTATING the pose object (CameraAnims hold a
    // live reference to it, so reassigning would orphan them).
    this.cam.pose.x = this.initial.x; this.cam.pose.y = this.initial.y; this.cam.pose.zoom = this.initial.zoom;
  }

  // The caption to show now: the latest one whose start time has passed, faded in.
  caption(): { title: string; sub?: string; alpha: number } {
    let cur: CaptionEvent | null = null;
    for (const e of this.captions) { if (e.t <= this.t) cur = e; else break; }
    if (!cur) return { title: '', alpha: 0 };
    return { title: cur.title, sub: cur.sub, alpha: Math.max(0, Math.min(1, (this.t - cur.t) / 0.35)) };
  }

  emit(ctx: RenderCtx) { this.scene.emit(ctx); }
}
