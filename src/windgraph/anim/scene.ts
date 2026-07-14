// ── windgraph · Scene (Phase 4) ──────────────────────────────────────────────
// Owns a Mobject tree + a Timeline + a clock. Each frame: advance the timeline,
// run updaters (dependent animation), then emit the tree through the renderer.
// A Scene can loop by restoring a captured snapshot and resetting the timeline —
// so the demo replays with no popping.

import { Group, Mobject, type RenderCtx } from '../mobject/mobject';
import { Timeline } from './timeline';

export class Scene {
  root = new Group();
  timeline = new Timeline();
  private lastNow = -1;
  private snapshots = new Map<Mobject, () => void>();
  private loopCbs: (() => void)[] = [];

  add(...m: Mobject[]): this { this.root.add(...m); return this; }

  /** Register a callback run whenever the scene loops (reset ValueTrackers here). */
  onLoop(fn: () => void): this { this.loopCbs.push(fn); return this; }

  /** Capture a restore closure for a mobject's animatable state (for clean loops). */
  snapshot(m: Mobject) {
    const pos: [number, number] = [m.position[0], m.position[1]];
    const rot = m.rotation, sx = m.scaleX, sy = m.scaleY, op = m.opacity, vis = m.visible, rev = m.reveal;
    const pts = (m as any).points ? [...(m as any).points] : null;
    this.snapshots.set(m, () => {
      m.position = [pos[0], pos[1]]; m.rotation = rot; m.scaleX = sx; m.scaleY = sy;
      m.opacity = op; m.visible = vis; m.reveal = rev;
      if (pts && (m as any).points) { (m as any).points = [...pts]; m.markDirty(); }
    });
  }

  /** Snapshot every mobject currently in the tree (call once, after setup). */
  snapshotAll() { this.walk((m) => this.snapshot(m)); }

  private walk(fn: (m: Mobject) => void, node: Mobject = this.root) {
    fn(node);
    for (const c of node.children) this.walk(fn, c);
  }

  private restoreAll() { for (const r of this.snapshots.values()) r(); }

  /** Advance by wall-clock `now` (ms). Loops when the timeline finishes (+tail). */
  update(now: number, loopTail = 1.0) {
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    if (this.timeline.t >= this.timeline.duration + loopTail) {
      this.restoreAll();
      for (const cb of this.loopCbs) cb();
      this.timeline.reset();
    }
    // Run updaters BEFORE seeking so timeline animations win on contested fields,
    // then seek; but dependent updaters that read trackers should run AFTER the
    // trackers are advanced — so: seek first, then tick.
    this.timeline.update(dt);
    this.root.tick(this.timeline.t, dt);
  }

  emit(ctx: RenderCtx) { this.root.emit(ctx); }
}
