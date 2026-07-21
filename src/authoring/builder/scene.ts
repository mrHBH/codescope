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
    noChrome?: boolean;
    layout?: { direction?: 'row' | 'column'; gap?: number; padding?: number | number[]; align?: 'start' | 'center' | 'end' | 'stretch'; justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'; wrap?: boolean };
  }): ChapterBuilder {
    const nw = opts.nominalW ?? 1260;
    const grpId = id;
    this.assertUnique(grpId);
    const grp: GroupSpec = {
      kind: 'group', id: grpId, at: opts.at, size: [nw, nw * 0.5625],
      children: [],
      chapter: { title: opts.title, sub: opts.sub, duration: opts.dur },
      page: { safe: true, nominalW: nw, cover: opts.cover, noChrome: opts.noChrome },
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

  // ── Layout archetypes (v3 explainer) ────────────────────────────────────
  /** HeroCentered: full-bleed island with overlaid title/subtitle. */
  heroCentered(prefix: string, opts: {
    island: string; islandParams?: Record<string, any>;
    title: string; subtitle: string;
    overlayStyle?: 'center' | 'bottom' | 'left';
    accent?: Color;
  }): void {
    const accent = opts.accent ?? [0.00, 0.48, 0.80, 1] as Color;
    const overlay = opts.overlayStyle ?? 'center';
    this.col(prefix + '-wrap', { gap: 0, align: 'stretch', item: { flexGrow: 1 } }, (w: any) => {
      if (overlay === 'center') {
        // Spacer top
        w.rect(prefix + '-st', { size: [10, 1], fill: [0, 0, 0, 0], item: { flexGrow: 1, minHeight: 20 } });
        // Island fills space
        w.island(prefix + '-hero', opts.island, {
          params: opts.islandParams,
          item: { flexGrow: 1, minHeight: 200, fill: true },
        });
        // Centered overlay text
        w.col(prefix + '-overlay', { gap: 8, align: 'center', item: { flexShrink: 0 } }, (o: any) => {
          o.text(prefix + '-ttl', opts.title, { size: 160, color: [0.94, 0.95, 0.97, 1] as Color, weight: 700, item: { flexShrink: 0 } });
          o.text(prefix + '-sub', opts.subtitle.toUpperCase(), { size: 22, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
        });
        // Spacer bottom
        w.rect(prefix + '-sb', { size: [10, 1], fill: [0, 0, 0, 0], item: { flexGrow: 1, minHeight: 20 } });
      } else if (overlay === 'bottom') {
        // Island fills space
        w.island(prefix + '-hero', opts.island, {
          params: opts.islandParams,
          item: { flexGrow: 1, minHeight: 200, fill: true },
        });
        // Bottom overlay text
        w.col(prefix + '-overlay', { gap: 4, padding: [20, 30, 20, 30] as any, item: { flexShrink: 0 } }, (o: any) => {
          o.rect(prefix + '-ol-bg', { size: [10, 10], fill: [0.02, 0.025, 0.04, 0.82] as Color, item: { flexGrow: 1, minHeight: 50 } });
          o.text(prefix + '-ttl', opts.title, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
          o.text(prefix + '-sub', opts.subtitle.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
        });
      } else if (overlay === 'left') {
        // Left overlay: island + overlay panel side by side in a row
        w.row(prefix + '-ol-row', { gap: 0, align: 'stretch', item: { flexGrow: 1 } }, (rw: any) => {
          rw.col(prefix + '-overlay', { gap: 4, padding: [24, 28, 24, 28] as any, item: { width: 340, flexShrink: 0 } }, (o: any) => {
            o.rect(prefix + '-ol-bg', { size: [340, 10], fill: [0.02, 0.025, 0.04, 0.82] as Color, item: { flexGrow: 1, minHeight: 50 } });
            o.text(prefix + '-ttl', opts.title, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
            o.text(prefix + '-sub', opts.subtitle.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
          });
          // Island fills the rest of the row
          rw.island(prefix + '-hero', opts.island, {
            params: opts.islandParams,
            item: { flexGrow: 1, minHeight: 200, fill: true },
          });
        });
      }
    });
    this.clip.fadeIn(prefix + '-wrap', { start: 0, duration: 0.6 });
  }

  /** SplitNarrative: asymmetric copy/visual split (visual wider by default). */
  splitNarrative(prefix: string, opts: {
    kicker: string; title: string; body: string[];
    island: string; islandParams?: Record<string, any>;
    caption?: string; ratio?: number; flip?: boolean;
    tail?: (c: any) => void;
    cardCopy?: boolean;
    accent?: Color;
  }): void {
    const accent = opts.accent ?? [0.00, 0.48, 0.80, 1] as Color;
    const ratio = opts.ratio ?? 1.6; // visual : copy
    const copyGrow = 1;
    const visGrow = Math.max(1, ratio);
    this.row(prefix + '-split', { gap: 22, align: 'stretch', item: { flexGrow: 1, minHeight: 280 } }, (r: any) => {
      // COPY column
      r.col(prefix + '-copy', { gap: 14, padding: opts.cardCopy !== false ? [24, 28, 24, 28] as any : 0 as any, item: { flexGrow: copyGrow, minWidth: 280 } }, (c: any) => {
        if (opts.cardCopy !== false) {
          c.rect(prefix + '-copy-bg', { size: [10, 10], fill: [0.176, 0.176, 0.188, 1] as Color, stroke: { color: [0.20, 0.20, 0.20, 1] as Color, width: 1 }, item: { flexGrow: 1, minHeight: 100 } });
        }
        c.row(prefix + '-head', { gap: 12, align: 'start', item: { flexShrink: 0 } }, (h: any) => {
          h.rect(prefix + '-bar', { size: [6, 74], fill: accent, item: { flexShrink: 0 } });
          h.col(prefix + '-hc', { gap: 4, item: { flexGrow: 1, minWidth: 60 } }, (hc: any) => {
            hc.text(prefix + '-kicker', opts.kicker.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
            hc.text(prefix + '-ttl', opts.title, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
          });
        });
        c.col(prefix + '-body', { gap: 6, item: { flexShrink: 0 } }, (bc: any) => {
          opts.body.forEach((l, i) => {
            if (l) bc.text(prefix + '-b' + i, l, { size: 19, color: [0.73, 0.74, 0.77, 1] as Color, item: { flexShrink: 0 } });
          });
        });
        if (opts.tail) opts.tail(c);
      });
      // VISUAL column (wider)
      r.col(prefix + '-vis', { gap: 10, padding: [12, 12, 12, 12] as any, item: { flexGrow: visGrow, minWidth: 280 } }, (v: any) => {
        v.island(prefix + '-g0', opts.island, {
          params: opts.islandParams,
          item: { flexGrow: 1, minHeight: 180, fill: true },
        });
        if (opts.caption) {
          v.row(prefix + '-cap', { gap: 8, align: 'center', item: { flexShrink: 0 } }, (cap: any) => {
            cap.rect(prefix + '-led', { size: [8, 8], fill: accent, item: { flexShrink: 0 } });
            cap.text(prefix + '-capt', opts.caption, { size: 12, color: [0.55, 0.56, 0.60, 1] as Color, item: { flexGrow: 1 } });
          });
        }
      });
    });
    this.clip.fadeIn(prefix + '-copy', { start: 0, duration: 0.5 });
    this.clip.fadeIn(prefix + '-vis', { start: 0.25, duration: 0.5 });
  }

  /** FullBleedVisual: island fills the page, text in overlay panel. */
  fullBleedVisual(prefix: string, opts: {
    island: string; islandParams?: Record<string, any>;
    kicker: string; title: string; body: string[];
    overlayPosition?: 'left' | 'bottom';
    overlayOpacity?: number;
  }): void {
    const pos = opts.overlayPosition ?? 'left';
    const op = opts.overlayOpacity ?? 0.82;
    this.col(prefix + '-wrap', { gap: 0, align: 'stretch', item: { flexGrow: 1 } }, (w: any) => {
      if (pos === 'bottom') {
        // Island fills everything
        w.island(prefix + '-bg', opts.island, {
          params: opts.islandParams,
          item: { flexGrow: 1, minHeight: 200, fill: true },
        });
        // Bottom overlay panel
        w.col(prefix + '-overlay', { gap: 4, padding: [20, 28, 20, 28] as any, item: { flexShrink: 0 } }, (o: any) => {
          o.rect(prefix + '-ol-bg', { size: [10, 10], fill: [0.02, 0.025, 0.04, op] as Color, item: { flexGrow: 1, minHeight: 50 } });
          o.text(prefix + '-kicker', opts.kicker.toUpperCase(), { size: 13, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
          o.text(prefix + '-ttl', opts.title, { size: 36, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
          o.col(prefix + '-body', { gap: 3, item: { flexShrink: 0 } }, (bc: any) => {
            opts.body.forEach((l, i) => {
              if (l) bc.text(prefix + '-b' + i, l, { size: 18, color: [0.73, 0.74, 0.77, 1] as Color, item: { flexShrink: 0 } });
            });
          });
        });
      } else {
        // Left overlay: overlay panel + island side by side
        w.row(prefix + '-ol-row', { gap: 0, align: 'stretch', item: { flexGrow: 1 } }, (rw: any) => {
          rw.col(prefix + '-overlay', { gap: 4, padding: [24, 28, 24, 28] as any, item: { width: 320, flexShrink: 0 } }, (o: any) => {
            o.rect(prefix + '-ol-bg', { size: [320, 10], fill: [0.02, 0.025, 0.04, op] as Color, item: { flexGrow: 1, minHeight: 50 } });
            o.text(prefix + '-kicker', opts.kicker.toUpperCase(), { size: 13, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
            o.text(prefix + '-ttl', opts.title, { size: 36, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
            o.col(prefix + '-body', { gap: 3, item: { flexShrink: 0 } }, (bc: any) => {
              opts.body.forEach((l, i) => {
                if (l) bc.text(prefix + '-b' + i, l, { size: 18, color: [0.73, 0.74, 0.77, 1] as Color, item: { flexShrink: 0 } });
              });
            });
          });
          rw.island(prefix + '-bg', opts.island, {
            params: opts.islandParams,
            item: { flexGrow: 1, minHeight: 200, fill: true },
          });
        });
      }
    });
    this.clip.fadeIn(prefix + '-wrap', { start: 0, duration: 0.5 });
  }

  /** Dashboard: hero island + stat row + optional insight block. */
  dashboard(prefix: string, opts: {
    island: string; islandParams?: Record<string, any>;
    kicker?: string; title?: string;
    stats: { label: string; value: string; color?: Color; accent?: Color }[];
    insight?: string;
    accent?: Color;
  }): void {
    const accent = opts.accent ?? [0.00, 0.48, 0.80, 1] as Color;
    let statsId: string | null = null;
    let insightId: string | null = null;
    this.col(prefix + '-dash', { gap: 16, item: { flexGrow: 1 } }, (d: any) => {
      // Optional header
      if (opts.kicker && opts.title) {
        d.row(prefix + '-head', { gap: 12, align: 'start', item: { flexShrink: 0 } }, (h: any) => {
          h.rect(prefix + '-bar', { size: [6, 74], fill: accent, item: { flexShrink: 0 } });
          h.col(prefix + '-hc', { gap: 4, item: { flexGrow: 1, minWidth: 60 } }, (hc: any) => {
            hc.text(prefix + '-kicker', opts.kicker!.toUpperCase(), { size: 14, color: [0.55, 0.56, 0.60, 1] as Color, weight: 600, item: { flexShrink: 0 } });
            hc.text(prefix + '-ttl', opts.title!, { size: 40, color: [0.94, 0.95, 0.97, 1] as Color, weight: 650, item: { flexShrink: 0 } });
          });
        });
      }
      // Hero island
      d.island(prefix + '-hero', opts.island, {
        params: opts.islandParams,
        item: { flexGrow: 1, minHeight: 200, fill: true },
      });
      // Stat row
      statsId = d.statRow(prefix + '-stats', opts.stats);
      // Insight block
      if (opts.insight) {
        insightId = d.insightBlock(prefix + '-insight', opts.insight, { accent });
      }
    });
    if (opts.kicker) this.clip.fadeIn(prefix + '-head', { start: 0, duration: 0.5 });
    this.clip.fadeIn(prefix + '-hero', { start: 0.2, duration: 0.6 });
    if (statsId) this.clip.fadeIn(statsId, { start: 0.6, duration: 0.5 });
    if (insightId) this.clip.fadeIn(insightId, { start: 0.9, duration: 0.6 });
  }

  /** PipelineFlow: step cards in a row + live preview below. */
  pipelineFlow(prefix: string, opts: {
    steps: { title: string; icon?: string; label?: string }[];
    previewIsland: string; previewParams?: Record<string, any>;
    animated?: boolean;
  }): void {
    this.col(prefix + '-pipe', { gap: 16, item: { flexGrow: 1 } }, (p: any) => {
      // Step cards row
      p.row(prefix + '-steps', { gap: 8, align: 'center', justify: 'center', item: { flexShrink: 0 } }, (sr: any) => {
        opts.steps.forEach((step, i) => {
          const isLast = i === opts.steps.length - 1;
          sr.col(prefix + '-step' + i, {
            gap: 4, padding: [12, 16, 12, 16] as any,
            item: { width: 130, flexShrink: 0 },
          }, (s: any) => {
            s.rect(prefix + '-stepbg' + i, { size: [130, 10], fill: [0.176, 0.176, 0.188, 1] as Color, stroke: { color: [0.20, 0.20, 0.20, 1] as Color, width: 1 }, item: { flexGrow: 1, minHeight: 60 } });
            if (step.icon) {
              s.text(prefix + '-sicon' + i, step.icon, { size: 18, color: [0.94, 0.95, 0.97, 1] as Color, item: { flexShrink: 0, alignSelf: 'center' } });
            }
            s.text(prefix + '-sttl' + i, step.title, { size: 13, color: [0.80, 0.80, 0.80, 1] as Color, weight: 600, item: { flexShrink: 0, alignSelf: 'center' } });
            if (step.label) {
              s.text(prefix + '-slbl' + i, step.label, { size: 11, color: [0.53, 0.53, 0.53, 1] as Color, item: { flexShrink: 0, alignSelf: 'center' } });
            }
          });
          // Arrow between steps
          if (!isLast) {
            sr.text(prefix + '-arr' + i, '→', { size: 24, color: [0.53, 0.53, 0.53, 1] as Color, item: { flexShrink: 0 } });
          }
        });
      });
      // Preview island
      p.island(prefix + '-preview', opts.previewIsland, {
        params: opts.previewParams,
        item: { flexGrow: 1, minHeight: 160, fill: true },
      });
    });
    this.clip.fadeIn(prefix + '-pipe', { start: 0, duration: 0.6 });
  }

  /** Comparison: side-by-side panels with optional arrow + verdict. */
  comparison(prefix: string, opts: {
    left: { label: string; island: string; params?: Record<string, any>; caption?: string };
    right: { label: string; island: string; params?: Record<string, any>; caption?: string };
    arrow?: boolean;
    verdict?: { left: string; right: string; color: Color };
  }): void {
    this.col(prefix + '-comp', { gap: 14, item: { flexGrow: 1 } }, (cp: any) => {
      // Side-by-side panels
      cp.row(prefix + '-panels', { gap: 12, align: 'stretch', justify: 'center', item: { flexGrow: 1 } }, (rw: any) => {
        // Left
        rw.col(prefix + '-left', { gap: 8, padding: [10, 10, 10, 10] as any, item: { flexGrow: 1, minWidth: 200 } }, (l: any) => {
          l.rect(prefix + '-l-bg', { size: [10, 10], fill: [0.176, 0.176, 0.188, 1] as Color, stroke: { color: [0.20, 0.20, 0.20, 1] as Color, width: 1 }, item: { flexGrow: 1, minHeight: 120 } });
          l.island(prefix + '-l-island', opts.left.island, {
            params: opts.left.params,
            item: { flexGrow: 1, minHeight: 100, fill: true },
          });
          if (opts.left.caption) {
            l.text(prefix + '-l-cap', opts.left.caption, { size: 11, color: [0.55, 0.56, 0.60, 1] as Color, item: { flexShrink: 0 } });
          }
        });
        // Arrow
        if (opts.arrow) {
          rw.col(prefix + '-arrow', { gap: 0, align: 'center', justify: 'center', item: { width: 40, flexShrink: 0 } }, (ar: any) => {
            ar.text(prefix + '-arr-glyph', '→', { size: 32, color: [0.53, 0.53, 0.53, 1] as Color, item: { flexShrink: 0 } });
          });
        }
        // Right
        rw.col(prefix + '-right', { gap: 8, padding: [10, 10, 10, 10] as any, item: { flexGrow: 1, minWidth: 200 } }, (r: any) => {
          r.rect(prefix + '-r-bg', { size: [10, 10], fill: [0.176, 0.176, 0.188, 1] as Color, stroke: { color: [0.20, 0.20, 0.20, 1] as Color, width: 1 }, item: { flexGrow: 1, minHeight: 120 } });
          r.island(prefix + '-r-island', opts.right.island, {
            params: opts.right.params,
            item: { flexGrow: 1, minHeight: 100, fill: true },
          });
          if (opts.right.caption) {
            r.text(prefix + '-r-cap', opts.right.caption, { size: 11, color: [0.55, 0.56, 0.60, 1] as Color, item: { flexShrink: 0 } });
          }
        });
      });
      // Verdict row
      if (opts.verdict) {
        cp.row(prefix + '-verdict', { gap: 20, align: 'center', justify: 'center', item: { flexShrink: 0 } }, (vr: any) => {
          vr.row(prefix + '-vl', { gap: 8, align: 'center', item: { flexShrink: 0 } }, (vl: any) => {
            vl.rect(prefix + '-vld', { size: [10, 24], fill: opts.verdict!.color, item: { flexShrink: 0 } });
            vl.text(prefix + '-vll', opts.verdict!.left, { size: 16, color: opts.verdict!.color, item: { flexShrink: 0 } });
          });
          vr.text(prefix + '-vsep', 'vs', { size: 14, color: [0.53, 0.53, 0.53, 1] as Color, item: { flexShrink: 0 } });
          vr.row(prefix + '-vr', { gap: 8, align: 'center', item: { flexShrink: 0 } }, (vr2: any) => {
            vr2.rect(prefix + '-vrd', { size: [10, 24], fill: opts.verdict!.color, item: { flexShrink: 0 } });
            vr2.text(prefix + '-vrl', opts.verdict!.right, { size: 16, color: opts.verdict!.color, item: { flexShrink: 0 } });
          });
        });
      }
    });
    this.clip.fadeIn(prefix + '-left', { start: 0, duration: 0.5 });
    this.clip.fadeIn(prefix + '-right', { start: 0.3, duration: 0.5 });
    if (opts.verdict) this.clip.fadeIn(prefix + '-verdict', { start: 0.7, duration: 0.5 });
  }

  // ── Camera gestures ─────────────────────────────────────────────────────
  cam = {
    moveTo: (t: number, pose: { center?: Vec2; zoom?: number; fit?: string; fitObj?: string; fitPoint?: Vec2; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
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
    /** Shorthand for diveObj with saner defaults. */
    diveInto: (opts: { target: string; zoom: number; hold?: number; d?: number }) => {
      const h = opts.hold ?? 2.5, d = opts.d ?? 2.0;
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h, fit: this.grpId, ease: 'smoothstep' });
      (this.s as any).doc.camera.keyframes.push({
        time: this.start + h + d,
        fitObj: opts.target,
        zoomMul: 1 + opts.zoom,
        ease: 'smoothstep',
      });
    },
    /** Sweep across a target: start at left edge, end centered, then optionally dive. */
    sweepAcross: (opts: { target: string; zoom?: number; hold?: number; d?: number }) => {
      const h = opts.hold ?? 2.5, d = opts.d ?? 2.0;
      // Start: left edge of target
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fitObj: opts.target, fitPoint: [0, 0.5], zoomMul: 1.2, ease: 'easeInOutCubic' });
      // Settle centered
      (this.s as any).doc.camera.keyframes.push({ time: this.start + h, fitObj: opts.target, ease: 'smoothstep', drift: { xAmp: 8, yAmp: 4, xPeriod: 16, yPeriod: 18 } });
      // Optional dive
      if (opts.zoom) {
        (this.s as any).doc.camera.keyframes.push({
          time: this.start + h + d,
          fitObj: opts.target,
          fitPoint: [0.5, 0.5],
          zoomMul: 1 + opts.zoom,
          ease: 'smoothstep',
        });
      }
    },
    /** Trace outline: dive and follow the edge of a glyph/shape. */
    traceOutline: (opts: { target: string; zoom: number; duration: number; samples?: number; pullBack?: boolean }) => {
      (this.s as any).doc.camera.keyframes.push({
        time: this.start,
        fit: this.grpId,
        ease: 'easeInOutCubic',
        trace: {
          target: opts.target,
          zoom: opts.zoom,
          d: opts.duration,
          samples: opts.samples ?? 48,
          pullBack: opts.pullBack ?? false,
        },
      } as any);
    },
    /** Pull back from a dive to show full page, then drift. */
    pullBack: (opts: { hold?: number; drift?: boolean }) => {
      const h = opts.hold ?? 3.0;
      const dur = this.chapterDur();
      (this.s as any).doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      if (opts.drift !== false) {
        (this.s as any).doc.camera.keyframes.push({ time: this.start + dur, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
      } else {
        (this.s as any).doc.camera.keyframes.push({ time: this.start + dur, fit: this.grpId, ease: 'smoothstep' });
      }
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

  // ── Reference-design components ────────────────────────────────────────

  /** Default palette for component helpers (yasmineOS-inspired). */
  private static C = {
    text:     [0.80, 0.80, 0.80, 1] as Color,
    textDim:  [0.53, 0.53, 0.53, 1] as Color,
    head:     [0.94, 0.95, 0.97, 1] as Color,
    bgAlt:    [0.176, 0.176, 0.188, 1] as Color,
    border:   [0.20, 0.20, 0.20, 1] as Color,
    accent:   [0.00, 0.48, 0.80, 1] as Color,
  };

  /** Horizontal row of stat cards (reference-design style).
   *  Each card shows a label + value with optional left accent bar. */
  statRow(prefix: string, items: { label: string; value: string; color?: Color; accent?: Color }[], opts: { gap?: number; item?: any } = {}): string {
    const gap = opts.gap ?? 12;
    return this.row(prefix + '-row', { gap, item: { flexShrink: 0, ...opts.item } }, (r: any) => {
      items.forEach((it, i) => {
        r.col(prefix + '-card' + i, {
          gap: 4, padding: [10, 12, 10, 12] as any,
          item: { width: 160, flexShrink: 0 },
        }, (c: any) => {
          // card background
          c.rect(prefix + '-cardbg' + i, {
            size: [160, 10], fill: PageBuilder.C.bgAlt,
            stroke: { color: it.accent ?? PageBuilder.C.border, width: 1 },
            item: { flexGrow: 1 },
          });
          // optional left accent bar
          if (it.accent) {
            c.rect(prefix + '-cardac' + i, {
              size: [4, 10], fill: it.accent,
              item: { position: 'absolute', left: 0, top: 0, bottom: 0 } as any,
            });
          }
          c.text(prefix + '-cardl' + i, it.label.toUpperCase(), {
            size: 10, color: it.color ?? PageBuilder.C.textDim, weight: 600,
            item: { flexShrink: 0 },
          });
          c.text(prefix + '-cardv' + i, it.value, {
            size: 28, color: it.color ?? PageBuilder.C.head, weight: 650,
            item: { flexShrink: 0 },
          });
        });
      });
    });
  }

  /** Insight block with left accent bar (reference-design callout). */
  insightBlock(prefix: string, text: string, opts: { accent?: Color; size?: number; item?: any } = {}): string {
    const accent = opts.accent ?? PageBuilder.C.accent;
    const sz = opts.size ?? 16;
    return this.row(prefix + '-row', { gap: 12, item: { flexShrink: 0, ...opts.item } }, (r: any) => {
      r.rect(prefix + '-bar', { size: [4, 10], fill: accent, item: { flexShrink: 0, alignSelf: 'stretch', width: 4 } });
      // The rect needs flexGrow to stretch; we use a nested col for the text
      r.col(prefix + '-content', { gap: 2, padding: [8, 0, 8, 0] as any, item: { flexGrow: 1 } }, (c: any) => {
        c.text(prefix + '-text', text, { size: sz, color: PageBuilder.C.text, item: { flexShrink: 0 } });
      });
    });
  }

  /** Control bar: button group + separator + status indicator. */
  controlsBar(prefix: string, opts: {
    buttons: { label: string; icon?: string; active?: boolean; color?: Color }[];
    status?: { label: string; color: Color };
    item?: any;
  }): string {
    return this.row(prefix + '-bar', { gap: 8, align: 'center', item: { flexShrink: 0, ...opts.item } }, (r: any) => {
      // Button group
      r.row(prefix + '-btns', { gap: 4, item: { flexGrow: 1 } }, (br: any) => {
        opts.buttons.forEach((btn, i) => {
          const active = btn.active ?? false;
          br.row(prefix + '-btn' + i, {
            gap: 6, align: 'center', padding: [6, 12, 6, 12] as any,
            item: { flexShrink: 0 },
          }, (b: any) => {
            const bg = active ? (btn.color ?? PageBuilder.C.accent) : [0.15, 0.15, 0.16, 1] as Color;
            const fg = active ? [0.94, 0.95, 0.97, 1] as Color : PageBuilder.C.text;
            b.rect(prefix + '-btnbg' + i, {
              size: [10, 10], fill: bg,
              stroke: { color: active ? bg : PageBuilder.C.border, width: 1 },
              item: { flexGrow: 1 },
            });
            if (btn.icon) {
              b.text(prefix + '-bic' + i, btn.icon, { size: 14, color: fg, item: { flexShrink: 0 } });
            }
            b.text(prefix + '-bl' + i, btn.label, { size: 12, color: fg, weight: 600, item: { flexShrink: 0 } });
          });
        });
      });
      // Separator
      if (opts.status) {
        r.rect(prefix + '-sep', { size: [1, 24], fill: PageBuilder.C.border, item: { flexShrink: 0 } });
        // Status LED + label
        r.row(prefix + '-status', { gap: 6, align: 'center', item: { flexShrink: 0 } }, (sr: any) => {
          sr.rect(prefix + '-led', { size: [8, 8], fill: opts.status!.color, item: { flexShrink: 0 } });
          sr.text(prefix + '-sl', opts.status!.label, { size: 12, color: PageBuilder.C.textDim, item: { flexShrink: 0 } });
        });
      }
    });
  }

  /** Horizontal separator line. */
  separator(prefix: string, opts: { color?: Color; thickness?: number; margin?: number; item?: any } = {}): string {
    const t = opts.thickness ?? 1;
    const m = opts.margin ?? 0;
    return this.rect(prefix + '-sep', {
      size: [10, t], fill: opts.color ?? PageBuilder.C.border,
      item: { flexShrink: 0, alignSelf: 'stretch', minHeight: t + 2 * m, ...opts.item },
    });
  }

  /** Chip row: pairs of color rect + label (for verdicts, legends). */
  chipRow(prefix: string, items: [string, Color][], opts: { labelColor?: Color; size?: number; gap?: number; item?: any } = {}): string {
    const lc = opts.labelColor ?? PageBuilder.C.text;
    const sz = opts.size ?? 16;
    const gap = opts.gap ?? 16;
    return this.row(prefix + '-chips', { gap, align: 'center', item: { flexShrink: 0, ...opts.item } }, (rr: any) => {
      items.forEach(([lab, col], i) => {
        rr.row(prefix + '-chip' + i, { gap: 8, align: 'center', item: { flexShrink: 0 } }, (ch: any) => {
          ch.rect(prefix + '-chipd' + i, { size: [10, 24], fill: col, item: { flexShrink: 0 } });
          ch.text(prefix + '-chipl' + i, lab, { size: sz, color: lc, item: { flexShrink: 0 } });
        });
      });
    });
  }
}

// ── Top-level convenience ─────────────────────────────────────────────────
export function scene(meta: { title: string }, fn: (s: SceneBuilder) => void): SceneDoc {
  const s = new SceneBuilder(meta);
  fn(s);
  return s.build();
}
