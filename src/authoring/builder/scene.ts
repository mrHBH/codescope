// ── Scene builder (produces SceneDoc) ──────────────────────────────────────

import type { SceneDoc, ObjectSpec, ClipSpec, CameraKeyframe, CameraTrack,
  GroupSpec, Vec2, Color, ParamDef, ParamRef, EasingName } from '../ir/types';
import { validateSceneDoc } from '../ir/validate';

// ── SceneBuilder ─────────────────────────────────────────────────────────
export class SceneBuilder {
  private doc: SceneDoc;
  private idCounter = new Map<string, number>();

  constructor(meta: { title: string }) {
    this.doc = { version: 1, meta: { ...meta }, objects: {}, params: {}, clips: [], camera: { keyframes: [] } };
  }

  private uid(base: string): string {
    const n = this.idCounter.get(base) ?? 0;
    this.idCounter.set(base, n + 1);
    return `${base}_${n}`;
  }

  private assertUnique(id: string) {
    if (this.doc.objects[id]) throw new Error(`Duplicate object id: ${id}`);
  }

  // ── Params ──────────────────────────────────────────────────────────────
  param = {
    number: (id: string, def: { default: number; min?: number; max?: number; step?: number; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'number' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    point: (id: string, def: { default: Vec2; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'point' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    boolean: (id: string, def: { default: boolean; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'boolean' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    color: (id: string, def: { default: Color; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'color' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    ref: (id: string): ParamRef => ({ $param: id }),
  };

  // ── Chapter builder ─────────────────────────────────────────────────────
  chapter(id: string, opts: { title: string; sub: string; at: Vec2; dur: number; size?: Vec2 }): ChapterBuilder {
    const grpId = id;
    const size = opts.size ?? [1260, 820];
    this.assertUnique(grpId);
    const grp: GroupSpec = { kind: 'group', id: grpId, at: opts.at, size, children: [], chapter: { title: opts.title, sub: opts.sub, duration: opts.dur } };
    this.doc.objects[grpId] = grp;
    return new ChapterBuilder(this, grpId, opts.at, size);
  }

  // ── Top-level camera keyframes ──────────────────────────────────────────
  cam = { keyframe: (time: number, pose: { center?: Vec2; zoom?: number; fit?: string; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
    this.doc.camera.keyframes.push({ time, ...pose });
  } };

  // ── Top-level clips (absolute start) ────────────────────────────────────
  clip = { add: (clip: ClipSpec) => { this.doc.clips.push(clip); } };

  // ── Top-level objects ───────────────────────────────────────────────────
  addSpec(spec: ObjectSpec): this {
    this.assertUnique(spec.id);
    this.doc.objects[spec.id] = spec;
    return this;
  }

  build(): SceneDoc {
    this.doc.camera.keyframes.sort((a, b) => a.time - b.time);
    const errors = validateSceneDoc(this.doc);
    if (errors.length > 0) {
      throw new Error('Invalid SceneDoc:\n' + errors.map((e) => '  - ' + e).join('\n'));
    }
    return this.doc;
  }
}

// ── ChapterBuilder ────────────────────────────────────────────────────────
export class ChapterBuilder {
  start = 0;

  constructor(
    private s: SceneBuilder,
    private grpId: string,
    private origin: Vec2,
    private chSize: Vec2,
  ) {}

  private abs(p: Vec2): Vec2 { return [p[0] + this.origin[0], p[1] + this.origin[1]]; }

  // Object builder methods — each adds a spec with chapter-relative `at` → absolute
  text(id: string | null, content: string, opts: { at: Vec2; size: number; color: Color; weight?: number; align?: 'left' | 'center' | 'right'; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('text');
    this.s.addSpec({ kind: 'text', id: oid, content, at: this.abs(opts.at), size: opts.size, color: opts.color, weight: opts.weight, align: opts.align, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  glyph(id: string | null, char: string, opts: { at: Vec2; size: number; color: Color; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('glyph');
    this.s.addSpec({ kind: 'glyph', id: oid, char, at: this.abs(opts.at), size: opts.size, color: opts.color, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  rect(id: string | null, opts: { at: Vec2; size: Vec2; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('rect');
    this.s.addSpec({ kind: 'rect', id: oid, at: this.abs(opts.at), size: opts.size, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  circle(id: string | null, opts: { center: Vec2; radius: number; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('circle');
    this.s.addSpec({ kind: 'circle', id: oid, center: this.abs(opts.center), radius: opts.radius, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  polygon(id: string | null, pts: Vec2[], opts: { closed?: boolean; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('polygon');
    this.s.addSpec({ kind: 'polygon', id: oid, points: pts.map((p) => this.abs(p)), closed: opts.closed, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  line(id: string | null, pts: Vec2[], opts: { width: number; color: Color; dash?: number[]; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('line');
    this.s.addSpec({ kind: 'line', id: oid, points: pts.map((p) => this.abs(p)), width: opts.width, color: opts.color, dash: opts.dash, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  math(id: string | null, latex: string, opts: { at: Vec2; size: number; color: Color; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('math');
    this.s.addSpec({ kind: 'math', id: oid, latex, at: this.abs(opts.at), size: opts.size, color: opts.color, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  island(id: string | null, islandId: string, opts: { at: Vec2; size?: Vec2; params?: Record<string, any>; opacity?: number }) {
    const oid = id ?? (this.s as any).uid('island');
    this.s.addSpec({ kind: 'island', id: oid, island: islandId, at: this.abs(opts.at), size: opts.size, params: opts.params, opacity: opts.opacity });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  group(id: string | null, opts: { at?: Vec2 }): ChapterBuilder {
    const oid = id ?? (this.s as any).uid('group');
    this.s.addSpec({ kind: 'group', id: oid, at: this.abs(opts.at ?? [0, 0]), size: undefined, children: [] });
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return new ChapterBuilder(this.s, oid, this.abs(opts.at ?? [0, 0]), this.chSize);
  }

  // ── Camera gestures ─────────────────────────────────────────────────────
  cam = {
    moveTo: (t: number, pose: { center?: Vec2; zoom?: number; fit?: string; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start + t, ...pose });
    },
    drop: (d = 2.6) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, zoomMul: 1.8, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    sweep: (d = 2.6, dx = 340) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, offset: [-dx, 0], ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    rise: (d = 2.6, dy = 260) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, offset: [0, -dy], ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    arc: (azAmp = 0.16, xAmp = 12, period = 12.566) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic', drift: { azAmp, xAmp, azPeriod: period, xPeriod: period } });
    },
    pull: () => {
      const dur = this.chapterDur();
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + dur / 2, fit: this.grpId, zoomMul: 1.45, ease: 'smoothstep' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + dur, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    dive: (opts: { into: Vec2; zoom: number; hold?: number; d?: number }) => {
      const h = opts.hold ?? 3.2, d = opts.d ?? 2.2;
      const grp = (this.s as any).doc.objects[this.grpId] as GroupSpec;
      const cw = grp.size?.[0] ?? 1260, ch = grp.size?.[1] ?? 820;
      const diveCenter: Vec2 = [grp.at[0] + opts.into[0] * cw, grp.at[1] + opts.into[1] * ch];
      const off: Vec2 = [diveCenter[0] - (grp.at[0] + cw / 2), diveCenter[1] - (grp.at[1] + ch / 2)];
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h, fit: this.grpId, ease: 'smoothstep' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h + d, fit: this.grpId, offset: off, zoomMul: 1 + opts.zoom, ease: 'smoothstep' });
    },
    hold: (t: number) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start + t, fit: this.grpId, ease: 'smoothstep' });
    },
  };

  // ── Clips (chapter-relative start → absolute) ───────────────────────────
  clip = {
    fadeIn: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'fadeIn', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    fadeOut: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'fadeOut', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    draw: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'draw', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    write: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'write', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    moveTo: (target: string, to: Vec2, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'moveTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { x: to[0], y: to[1] } });
    },
    scaleTo: (target: string, x: number, y: number, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'scaleTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { x, y } });
    },
    rotateTo: (target: string, deg: number, o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'rotateTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { deg } });
    },
    morph: (target: string, pts: Vec2[], o: { start: number; duration: number; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target, kind: 'morph', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { points: pts } });
    },
    param: (name: string, o: { start: number; duration: number; to: number | boolean | Vec2 | Color; ease?: EasingName }) => {
      (this.s as any).doc.clips.push({ id: (this.s as any).uid('clip'), target: 'param:' + name, kind: 'param', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { to: o.to } });
    },
  };

  private chapterDur(): number {
    return ((this.s as any).doc.objects[this.grpId] as GroupSpec)?.chapter?.duration ?? 10;
  }
}

// ── Top-level convenience ─────────────────────────────────────────────────
export function scene(meta: { title: string }, fn: (s: SceneBuilder) => void): SceneDoc {
  const s = new SceneBuilder(meta);
  fn(s);
  return s.build();
}
