// ── Parameter binder — resolves $param refs + drives param animation ─────────

import type { ParamDef, ParamRef, Color, Vec2 } from '../ir/types';
import type { AnimationClip } from '../ir/types';

export class ParamBinder {
  private params: Map<string, ParamDef> = new Map();
  private values: Map<string, number | boolean | Vec2 | Color> = new Map();

  constructor(params: ParamDef[]) {
    for (const p of params) {
      this.params.set(p.id, p);
      this.values.set(p.id, p.default);
    }
  }

  /** Get the current value of a parameter. */
  get(id: string): number | boolean | Vec2 | Color | undefined {
    return this.values.get(id);
  }

  /** Set a parameter value directly (from UI, REPL, or animation). */
  set(id: string, value: number | boolean | Vec2 | Color): void {
    const def = this.params.get(id);
    if (!def) return;
    if (def.kind === 'slider') {
      const v = value as number;
      if (v < def.min) value = def.min;
      if (v > def.max) value = def.max;
    }
    this.values.set(id, value);
  }

  /**
   * Resolve a value that might be a ParamRef.
   * Returns the literal value if it's not a ref, or the current param value if it is.
   */
  resolve<T>(value: T | ParamRef): T {
    if (value && typeof value === 'object' && '$param' in value) {
      const paramValue = this.values.get((value as ParamRef).$param);
      if (paramValue !== undefined) return paramValue as unknown as T;
    }
    return value as T;
  }

  /**
   * Apply param animation clips to advance param values.
   * Called each frame with the list of active param clips.
   */
  applyClips(clips: AnimationClip[], t: number): void {
    for (const clip of clips) {
      if (clip.kind !== 'param') continue;
      if (t < clip.start || t > clip.start + clip.duration) continue;

      const raw = (t - clip.start) / clip.duration;
      const alpha = Math.max(0, Math.min(1, raw));
      const { paramId, from, to } = clip.props as { paramId: string; from: number; to: number };
      this.set(paramId, from + (to - from) * alpha);
    }
  }

  updateParams(params: ParamDef[]): void {
    this.params.clear();
    this.values.clear();
    for (const p of params) {
      this.params.set(p.id, p);
      this.values.set(p.id, p.default);
    }
  }
}
