// ── Scene Runtime — drives SceneIR to pixels ────────────────────────────────

import type { SceneIR } from '../ir/types';
import type { FontFace } from '../../windfoil/font';
import { TimelineEngine } from './timeline-engine';
import { CameraController } from './camera-controller';
import { ParamBinder } from './param-binder';
import { resolveObjects, applyFrameState } from './object-resolver';
import { Group } from '../../windgraph/mobject/mobject';

export class SceneRuntime {
  private sceneIR: SceneIR;

  // Resolved objects
  private resolved: Map<string, any>; // id → { mobject, ... }
  private root: any; // root Group Mobject

  // Sub-systems
  private timeline: TimelineEngine;
  private camera: CameraController;
  private params: ParamBinder;

  // State
  playhead = 0;           // current time in seconds
  playing = false;
  speed = 1;
  private lastTick = 0;

  // Callbacks
  onCameraChange?: (center: [number, number], zoom: number) => void;

  constructor(ir: SceneIR) {
    this.sceneIR = ir;
    this.resolved = resolveObjects(ir.objects);
    // Build root group from top-level objects (those not in any group's children)
    this.root = this.buildRootGroup();

    this.timeline = new TimelineEngine(ir.clips);
    this.camera = new CameraController(ir.camera);
    this.params = new ParamBinder(ir.params);
  }

  private buildRootGroup(): any {
    const groupedIds = new Set<string>();
    for (const [, spec] of Object.entries(this.sceneIR.objects)) {
      if (spec.kind === 'group') {
        for (const childId of (spec as import('../ir/types').GroupSpec).children) {
          groupedIds.add(childId);
        }
      }
    }

    const root = new Group();

    for (const [id, obj] of this.resolved) {
      if (!groupedIds.has(id)) {
        root.add(obj.mobject);
      }
    }

    return root;
  }

  /**
   * Advance the timeline by dt seconds and update all state.
   * Returns the current camera pose after advancement.
   */
  advance(dt: number): { center: [number, number]; zoom: number } {
    if (!this.playing) dt = 0;

    const stepDt = Math.min(dt * this.speed, 0.1); // cap to avoid spiral
    this.playhead += stepDt;

    // Wrap around
    if (this.playhead >= this.sceneIR.meta.duration) {
      this.playhead = 0;
    }

    // Compute frame state at current playhead
    const frameState = this.timeline.seek(this.playhead);

    // Apply to resolved objects
    applyFrameState(this.resolved, frameState.objects);

    // Apply param animation
    this.params.applyClips(this.sceneIR.clips, this.playhead);

    // Compute camera pose
    const pose = this.camera.getPose(this.playhead);
    const clipPose = frameState.camera;
    const finalPose = clipPose ?? pose;

    if (this.onCameraChange) {
      this.onCameraChange(finalPose.center, finalPose.zoom);
    }

    return { center: finalPose.center, zoom: finalPose.zoom };
  }

  /**
   * Emit the current frame through the render context.
   */
  emit(ctx: { font: FontFace; atlas: any; inst: number[]; crv: number[]; rws: number[] }): void {
    if (this.root && typeof this.root.emit === 'function') {
      this.root.emit(ctx);
    }
  }

  /**
   * Seek the playhead to an absolute time. Deterministic — no dt accumulation.
   */
  seek(t: number): void {
    this.playhead = Math.max(0, Math.min(t, this.sceneIR.meta.duration));
    const frameState = this.timeline.seek(this.playhead);
    applyFrameState(this.resolved, frameState.objects);
  }

  play(): void { this.playing = true; }
  pause(): void { this.playing = false; }
  stop(): void { this.playing = false; this.playhead = 0; this.seek(0); }

  setParam(id: string, value: number | boolean | [number, number] | [number, number, number, number]): void {
    this.params.set(id, value);
  }

  getParam(id: string): number | boolean | [number, number] | [number, number, number, number] | undefined {
    return this.params.get(id);
  }

  /**
   * Hot-reload: replace the SceneIR while preserving the playhead.
   */
  reload(ir: SceneIR): void {
    this.sceneIR = ir;
    this.resolved = resolveObjects(ir.objects);
    this.root = this.buildRootGroup();
    this.timeline.updateClips(ir.clips);
    this.camera.updateTrack(ir.camera);
    this.params.updateParams(ir.params);
    // Re-seek to current playhead with new state
    this.seek(this.playhead);
  }

  get duration(): number { return this.sceneIR.meta.duration; }
  get objectCount(): number { return Object.keys(this.sceneIR.objects).length; }
  get clipCount(): number { return this.sceneIR.clips.length; }
}
