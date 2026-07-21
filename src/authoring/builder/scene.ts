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

  // ── Page builder (Taffy-laid-out content) ───────────────────────────────
  page(id: string, opts: {
    title?: string; at: Vec2; size: Vec2;
    resizable?: boolean; minSize?: Vec2; maxSize?: Vec2;
    layout?: { direction: 'row' | 'column'; gap?: number; padding?: number | number[]; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' };
  }, build: (p: PageBuilder) => void): string {
    this.assertUnique(id);
    const grp: any = {
      kind: 'group', id, at: opts.at, size: opts.size, children: [],
      page: { title: opts.title, resizable: opts.resizable, minSize: opts.minSize, maxSize: opts.maxSize },
      layout: opts.layout ? { kind: 'flex', ...opts.layout } : { kind: 'flex', direction: 'column', gap: 16, padding: 28, align: 'start', justify: 'start' },
    };
    this.doc.objects[id] = grp;
    const pb = new PageBuilder(this, id);
    build(pb);
    return id;
  }

  // ── Chapter builder ─────────────────────────────────────────────────────
  chapter(id: string, opts: {
    title: string; sub: string; at: Vec2; dur: number; size?: Vec2;
    page?: { safe?: boolean; nominalW?: number; title?: string };
    layout?: import('../ir/types').LayoutSpec;
  }): ChapterBuilder {
    const grpId = id;
    const size = opts.size ?? [1260, 820];
    this.assertUnique(grpId);
    const grp: GroupSpec = {
      kind: 'group', id: grpId, at: opts.at, size, children: [],
      chapter: { title: opts.title, sub: opts.sub, duration: opts.dur },
      page: opts.page ? { ...opts.page } : undefined,
      layout: opts.layout,
    };
    this.doc.objects[grpId] = grp;
    return new ChapterBuilder(this, grpId, opts.at, size);
  }

  // ── Chapter-page (chapter + safe Taffy page) ────────────────────────────
  chapterPage(id: string, opts: {
    title: string; sub: string; at: Vec2; dur: number;
    nominalW?: number;
    cover?: boolean;
    layout?: { direction?: 'row' | 'column'; gap?: number; padding?: number | number[]; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; wrap?: boolean };
  }): ChapterBuilder {
    const nw = opts.nominalW ?? 1260;
    const grpId = id;
    this.assertUnique(grpId);
    const grp: GroupSpec = {
      kind: 'group', id: grpId, at: opts.at, size: [nw, nw * 0.5625],
      children: [],
      chapter: { title: opts.title, sub: opts.sub, duration: opts.dur },
      page: { safe: true, nominalW: nw, cover: opts.cover },
      layout: opts.layout ? { kind: 'flex', ...opts.layout as any } : { kind: 'flex', direction: 'column', gap: 20, padding: 40, align: 'stretch', justify: 'start' },
    };
    this.doc.objects[grpId] = grp;
    return new ChapterBuilder(this, grpId, opts.at, [nw, nw * 0.5625]);
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

  rect(id: string | null, opts: { at: Vec2; size: Vec2; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number; glow?: true | { layers?: number; spread?: number } }) {
    const oid = id ?? (this.s as any).uid('rect');
    this.s.addSpec({ kind: 'rect', id: oid, at: this.abs(opts.at), size: opts.size, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity, item: opts.glow ? { glow: opts.glow } as any : undefined });
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

  // ── Layout methods (Taffy-based) ───────────────────────────────────────
  private pUid(base: string): string { return (this.s as any).uid(base); }

  row(id: string | null, opts: { gap?: number; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; wrap?: boolean; item?: any }, build: (r: any) => void): string {
    return this.layoutGroup(id, { kind: 'flex', direction: 'row', gap: opts.gap, align: opts.align, justify: opts.justify, wrap: opts.wrap }, opts.item, build);
  }

  col(id: string | null, opts: { gap?: number; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; item?: any }, build: (c: any) => void): string {
    return this.layoutGroup(id, { kind: 'flex', direction: 'column', gap: opts.gap, align: opts.align, justify: opts.justify }, opts.item, build);
  }

  private layoutGroup(id: string | null, layout: any, item: any | undefined, build: (b: any) => void): string {
    const oid = id ?? this.pUid('group');
    const grp = { kind: 'group', id: oid, at: [0, 0] as Vec2, children: [], layout, item } as any;
    this.s.addSpec(grp);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    const pb = new PageBuilder(this.s, oid);
    build(pb);
    return oid;
  }

  lRect(id: string | null, opts: { size: Vec2; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number; item?: any }) {
    const oid = id ?? this.pUid('rect');
    this.s.addSpec({ kind: 'rect', id: oid, at: [0, 0], size: opts.size, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  lText(id: string | null, content: string, opts: { size: number; color: Color; weight?: number; align?: 'left' | 'center' | 'right'; opacity?: number; item?: any }) {
    const oid = id ?? this.pUid('text');
    this.s.addSpec({ kind: 'text', id: oid, content, at: [0, 0], size: opts.size, color: opts.color, weight: opts.weight, align: opts.align, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  lIsland(id: string | null, islandId: string, opts: { size?: Vec2; params?: Record<string, any>; opacity?: number; item?: any }) {
    const oid = id ?? this.pUid('island');
    this.s.addSpec({ kind: 'island', id: oid, island: islandId, at: [0, 0], size: opts.size, params: opts.params, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  lMath(id: string | null, latex: string, opts: { size: number; color: Color; opacity?: number; item?: any }) {
    const oid = id ?? this.pUid('math');
    this.s.addSpec({ kind: 'math', id: oid, latex, at: [0, 0], size: opts.size, color: opts.color, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  accentHead(prefix: string, opts: { kicker: string; title: string; accent: Color; item?: any }): string {
    return this.row(prefix + '-head', { gap: 12, align: 'start', item: { flexShrink: 0, ...opts.item } }, (r: any) => {
      r.rect(prefix + '-bar', { size: [6, 78], fill: opts.accent, item: { flexShrink: 0 } });
      r.col(prefix + '-hc', { gap: 2, item: { flexGrow: 1, minWidth: 60 } }, (c: any) => {
        c.text(prefix + '-kicker', opts.kicker.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, item: { flexShrink: 0 } });
        c.text(prefix + '-ttl', opts.title, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, item: { flexShrink: 0 } });
      });
    });
  }

  body(prefix: string, lines: string[], opts: { item?: any } = {}): string {
    if (lines.length === 0) return '';
    return this.col(prefix + '-body', { gap: 4, item: opts.item }, (c: any) => {
      lines.forEach((l, k) => {
        if (l) c.text(prefix + '-l' + k, l, { size: 20, color: [0.73, 0.74, 0.77, 1] as Color, item: { flexShrink: 0 } });
      });
    });
  }

  // ── Camera gestures ─────────────────────────────────────────────────────
  cam = {
    moveTo: (t: number, pose: { center?: Vec2; zoom?: number; fit?: string; fitObj?: string; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
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
    dive: (opts: { into: Vec2; zoom: number; hold?: number; d?: number; box?: { at: Vec2; size: Vec2 } }) => {
      // `into` is a fraction of `box` (default: full chapter). Pass glyph-box
      // space to match the original explainer dive targets.
      const h = opts.hold ?? 3.2, d = opts.d ?? 2.2;
      const grp = (this.s as any).doc.objects[this.grpId] as GroupSpec;
      const cw = grp.size?.[0] ?? 1260, ch = grp.size?.[1] ?? 820;
      const boxAt = opts.box?.at ?? grp.at;
      const boxSz = opts.box?.size ?? ([cw, ch] as Vec2);
      const diveCenter: Vec2 = [boxAt[0] + opts.into[0] * boxSz[0], boxAt[1] + opts.into[1] * boxSz[1]];
      const off: Vec2 = [diveCenter[0] - (grp.at[0] + cw / 2), diveCenter[1] - (grp.at[1] + ch / 2)];
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h, fit: this.grpId, ease: 'smoothstep' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h + d, fit: this.grpId, offset: off, zoomMul: 1 + opts.zoom, ease: 'smoothstep' });
    },
    hold: (t: number) => {
      (this.s as any).doc.camera.keyframes.push({ time: this.start + t, fit: this.grpId, ease: 'smoothstep' });
    },
    /** Layout-resolved dive: target an object id instead of a fraction+box. */
    diveObj: (opts: { target: string; zoom: number; hold?: number; d?: number }) => {
      const h = opts.hold ?? 3.2, d = opts.d ?? 2.2;
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h, fit: this.grpId, ease: 'smoothstep' });
      (this.s as any).doc.camera.keyframes.push({
        time: this.start + h + d,
        fitObj: opts.target,
        zoomMul: 1 + opts.zoom,
        ease: 'smoothstep',
      });
    },
    /** Glyph-trace dive: follow the glyph outline at deep zoom. */
    trace: (opts: { target: string; zoom: number; d: number; samples?: number; pullBack?: boolean; char?: string }) => {
      // Store trace metadata in a special keyframe that the runtime expands
      (this.s as any).doc.camera.keyframes.push({
        time: this.start,
        fit: this.grpId,
        ease: 'easeInOutCubic',
        trace: {
          target: opts.target,
          zoom: opts.zoom,
          d: opts.d,
          samples: opts.samples ?? 48,
          pullBack: opts.pullBack ?? false,
          char: opts.char,
        },
      } as any);
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

// ── Page builder (for layout-based pages) ────────────────────────────────
export class PageBuilder {
  constructor(
    private s: SceneBuilder,
    private grpId: string,
  ) {}

  private uid(base: string): string { return (this.s as any).uid(base); }

  text(id: string | null, content: string, opts: { size: number; color: Color; weight?: number; align?: 'left' | 'center' | 'right'; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('text');
    this.s.addSpec({ kind: 'text', id: oid, content, at: [0, 0], size: opts.size, color: opts.color, weight: opts.weight, align: opts.align, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  rect(id: string | null, opts: { size: Vec2; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('rect');
    this.s.addSpec({ kind: 'rect', id: oid, at: [0, 0], size: opts.size, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  island(id: string | null, islandId: string, opts: { size?: Vec2; params?: Record<string, any>; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('island');
    this.s.addSpec({ kind: 'island', id: oid, island: islandId, at: [0, 0], size: opts.size, params: opts.params, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  math(id: string | null, latex: string, opts: { size: number; color: Color; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('math');
    this.s.addSpec({ kind: 'math', id: oid, latex, at: [0, 0], size: opts.size, color: opts.color, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  glyph(id: string | null, char: string, opts: { size: number; color: Color; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('glyph');
    this.s.addSpec({ kind: 'glyph', id: oid, char, at: [0, 0], size: opts.size, color: opts.color, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  circle(id: string | null, opts: { center: Vec2; radius: number; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number; item?: any }) {
    const oid = id ?? this.uid('circle');
    this.s.addSpec({ kind: 'circle', id: oid, center: opts.center, radius: opts.radius, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity, item: opts.item } as any);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    return oid;
  }

  row(id: string | null, opts: { gap?: number; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; item?: any }, build: (r: PageBuilder) => void): string {
    return this.layoutGroup(id, { kind: 'flex', direction: 'row', gap: opts.gap, align: opts.align, justify: opts.justify }, opts.item, build);
  }

  col(id: string | null, opts: { gap?: number; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; item?: any }, build: (c: PageBuilder) => void): string {
    return this.layoutGroup(id, { kind: 'flex', direction: 'column', gap: opts.gap, align: opts.align, justify: opts.justify }, opts.item, build);
  }

  private layoutGroup(id: string | null, layout: any, item: any | undefined, build: (b: PageBuilder) => void): string {
    const oid = id ?? this.uid('group');
    const grp = { kind: 'group', id: oid, at: [0, 0], children: [], layout, item } as any;
    this.s.addSpec(grp);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    const pb = new PageBuilder(this.s, oid);
    build(pb);
    return oid;
  }

  // ── Nested sub-page (page inside another page's layout) ──────────────────
  subpage(id: string | null, opts: {
    title?: string;
    resizable?: boolean; minSize?: Vec2; maxSize?: Vec2;
    layout?: { direction?: 'row' | 'column'; gap?: number; padding?: number | number[]; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' };
    item?: any;
  }, build: (p: PageBuilder) => void): string {
    const oid = id ?? this.uid('page');
    const grp: any = {
      kind: 'group', id: oid, at: [0, 0], children: [], size: undefined,
      page: { title: opts.title, resizable: opts.resizable, minSize: opts.minSize, maxSize: opts.maxSize },
      layout: opts.layout ? { kind: 'flex', direction: opts.layout.direction ?? 'column', gap: opts.layout.gap, padding: opts.layout.padding, align: opts.layout.align, justify: opts.layout.justify } : { kind: 'flex', direction: 'column', gap: 12, padding: 16, align: 'start', justify: 'start' },
      item: opts.item ?? {},
    };
    this.s.addSpec(grp);
    (this.s as any).doc.objects[this.grpId].children.push(oid);
    const pb = new PageBuilder(this.s, oid);
    build(pb);
    return oid;
  }

  // ── High-level explainer helpers ────────────────────────────────────────
  accentHead(prefix: string, opts: { kicker: string; title: string; accent: Color; item?: any }): string {
    return this.row(prefix + '-head', { gap: 12, align: 'start', item: { flexShrink: 0 } }, (r) => {
      r.rect(prefix + '-bar', { size: [6, 78], fill: opts.accent, item: { flexShrink: 0 } });
      r.col(prefix + '-hc', { gap: 2, item: { flexGrow: 1, minWidth: 60 } }, (c) => {
        c.text(prefix + '-kicker', opts.kicker.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, item: { flexShrink: 0 } });
        c.text(prefix + '-ttl', opts.title, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, item: { flexShrink: 0 } });
      });
    });
  }

  body(prefix: string, lines: string[], opts: { item?: any } = {}): string {
    if (lines.length === 0) return '';
    return this.col(prefix + '-body', { gap: 4, item: opts.item }, (c) => {
      lines.forEach((l, k) => {
        if (l) c.text(prefix + '-l' + k, l, { size: 20, color: [0.73, 0.74, 0.77, 1] as Color, item: { flexShrink: 0 } });
      });
    });
  }

  vertCard(prefix: string, opts: { label: string; color: Color; body?: string; item?: any }): string {
    return this.col(prefix + '-card', { gap: 6, item: { width: 190, ...opts.item } }, (c) => {
      c.rect(prefix + '-chip', { size: [14, 28], fill: opts.color, item: { alignSelf: 'center', flexShrink: 0 } });
      c.text(prefix + '-label', opts.label, { size: 18, color: opts.color });
      if (opts.body) c.text(prefix + '-body', opts.body, { size: 14, color: [0.73, 0.74, 0.77, 1] as Color });
    });
  }
}

// ── Top-level convenience ─────────────────────────────────────────────────
export function scene(meta: { title: string }, fn: (s: SceneBuilder) => void): SceneDoc {
  const s = new SceneBuilder(meta);
  fn(s);
  return s.build();
}
