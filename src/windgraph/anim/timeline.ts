// ── windgraph · timeline + value tracker (Phase 4) ───────────────────────────
// Sequences animations on a single clock. `play(...)` runs a parallel group and
// advances the cursor by the group's longest duration; `wait(t)` inserts a gap.
// Everything is seeked from absolute time so playback is deterministic and loops
// cleanly (reset() rewinds without popping when paired with a state restore).

import { Animation } from './animations';
import { type Easing, clamp01 } from './easing';

interface Item { start: number; anim: Animation; }

export class Timeline {
  private items: Item[] = [];
  private cursor = 0;   // where the next appended group starts (seconds)
  t = 0;                // current playhead (seconds)

  /** Schedule a parallel group at the current cursor; advance cursor by its max duration. */
  play(...anims: Animation[]): this {
    let max = 0;
    for (const a of anims) { this.items.push({ start: this.cursor, anim: a }); max = Math.max(max, a.duration); }
    this.cursor += max;
    return this;
  }

  /** Schedule a group WITHOUT advancing the cursor (overlaps with the previous group). */
  playWith(...anims: Animation[]): this {
    let max = 0;
    const base = this.groupStart();
    for (const a of anims) { this.items.push({ start: base, anim: a }); max = Math.max(max, a.duration); }
    this.cursor = Math.max(this.cursor, base + max);
    return this;
  }

  /** Schedule an animation at an explicit absolute start time. */
  at(start: number, ...anims: Animation[]): this {
    for (const a of anims) { this.items.push({ start, anim: a }); this.cursor = Math.max(this.cursor, start + a.duration); }
    return this;
  }

  wait(seconds: number): this { this.cursor += seconds; return this; }

  private groupStart(): number {
    // Start time of the most recently appended group.
    let s = 0;
    for (const it of this.items) s = Math.max(s, it.start);
    return s;
  }

  get duration(): number { return this.cursor; }

  /** Advance the playhead and seek every scheduled animation. */
  update(dt: number) {
    this.t += dt;
    for (const it of this.items) it.anim.seek(this.t - it.start);
  }

  /** Rewind to the start (call together with a state restore to loop cleanly). */
  reset() { this.t = 0; for (const it of this.items) it.anim.reset(); }

  get finished(): boolean { return this.t >= this.cursor; }
}

// A tracked scalar. Attach updaters to Mobjects that read `.value` each frame so
// dependent objects (a dot riding a curve, a shaded area) stay perfectly in sync.
export class ValueTracker {
  constructor(public value = 0) {}
  set(v: number): this { this.value = v; return this; }
  get(): number { return this.value; }
}

// Animate a ValueTracker from a→b over a duration (drives dependent updaters).
export class TrackerAnim extends Animation {
  private from = 0;
  constructor(private tracker: ValueTracker, private to: number, opts: { duration?: number; easing?: Easing } = {}) {
    // Animation needs a Mobject target; ValueTracker isn't one, so use a stub.
    super({ position: [0, 0], visible: true, opacity: 1, reveal: 1 } as any, opts);
  }
  protected onBegin() { this.from = this.tracker.value; }
  protected apply(a: number) { this.tracker.value = this.from + (this.to - this.from) * a; }
}

export { clamp01 };
