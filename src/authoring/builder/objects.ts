// ── Object constructors for the Scene Builder ────────────────────────────────

import type {
  ObjectSpec, Vec2, Color,
  TextSpec, GlyphSpec, RectSpec, CircleSpec, EllipseSpec,
  PolygonSpec, ArcSpec, LineSpec, ArrowSpec, GroupSpec,
  TextStyle, GlyphStyle, StrokeStyle, LayoutSpec,
} from '../ir/types';

export interface TextOpts {
  at?: Vec2;
  size?: number;
  color?: Color;
  font?: string;
  weight?: number;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  rotation?: number;
  id?: string;
}

export interface GlyphOpts {
  at?: Vec2;
  scale?: number;
  subregion?: [number, number, number];
  color?: Color;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface RectOpts {
  at?: Vec2;
  size?: Vec2;
  fill?: Color;
  stroke?: { color: Color; width: number; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel' };
  radius?: number | [number, number, number, number];
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface CircleOpts {
  at?: Vec2;
  radius?: number;
  fill?: Color;
  stroke?: { color: Color; width: number };
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface EllipseOpts {
  at?: Vec2;
  rx?: number;
  ry?: number;
  fill?: Color;
  stroke?: { color: Color; width: number };
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface PolygonOpts {
  points?: Vec2[];
  closed?: boolean;
  fill?: Color;
  stroke?: { color: Color; width: number; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel' };
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface ArcOpts {
  at?: Vec2;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  stroke: { color: Color; width: number; cap?: 'butt' | 'round' | 'square' };
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface LineOpts {
  points: Vec2[];
  at?: Vec2;
  stroke: { color: Color; width: number; cap?: 'butt' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel' };
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface ArrowOpts {
  from?: Vec2;
  to?: Vec2;
  at?: Vec2;
  stroke: { color: Color; width: number };
  headSize?: number;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

export interface GroupOpts {
  at?: Vec2;
  layout?: LayoutSpec;
  opacity?: number;
  visible?: boolean;
  zIndex?: number;
  id?: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createObjects(
  objects: Record<string, ObjectSpec>,
  genId: (base: string) => string,
) {
  function ensureId<T extends ObjectSpec>(spec: T, id?: string): T {
    spec.id = id ? genId(id) : genId(spec.kind);
    objects[spec.id] = spec;
    return spec;
  }

  return {
    text(content: string, opts: TextOpts = {}): TextSpec {
      return ensureId({
        kind: 'text',
        id: opts.id ?? '',
        content,
        at: opts.at ?? [0, 0],
        style: {
          size: opts.size ?? 40,
          color: opts.color ?? [1, 1, 1, 1],
          font: opts.font,
          weight: opts.weight,
          align: opts.align,
          lineHeight: opts.lineHeight,
        },
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
        rotation: opts.rotation,
      }, opts.id ?? content);
    },

    glyph(char: string, opts: GlyphOpts = {}): GlyphSpec {
      return ensureId({
        kind: 'glyph',
        id: opts.id ?? '',
        char,
        at: opts.at ?? [0, 0],
        scale: opts.scale ?? 1,
        subregion: opts.subregion,
        style: { color: opts.color ?? [1, 1, 1, 1] },
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? `glyph_${char}`);
    },

    rect(opts: RectOpts = {}): RectSpec {
      return ensureId({
        kind: 'rect',
        id: opts.id ?? '',
        size: opts.size ?? [100, 100],
        at: opts.at ?? [0, 0],
        fill: opts.fill,
        stroke: opts.stroke,
        radius: opts.radius,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'rect');
    },

    circle(opts: CircleOpts = {}): CircleSpec {
      return ensureId({
        kind: 'circle',
        id: opts.id ?? '',
        radius: opts.radius ?? 50,
        at: opts.at ?? [0, 0],
        fill: opts.fill,
        stroke: opts.stroke,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'circle');
    },

    ellipse(opts: EllipseOpts = {}): EllipseSpec {
      return ensureId({
        kind: 'ellipse',
        id: opts.id ?? '',
        rx: opts.rx ?? 80,
        ry: opts.ry ?? 40,
        at: opts.at ?? [0, 0],
        fill: opts.fill,
        stroke: opts.stroke,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'ellipse');
    },

    polygon(opts: PolygonOpts = {}): PolygonSpec {
      const points = opts.points ?? [[0, 0], [100, 0], [50, 80]];
      return ensureId({
        kind: 'polygon',
        id: opts.id ?? '',
        points,
        closed: opts.closed ?? true,
        at: [0, 0],
        fill: opts.fill,
        stroke: opts.stroke,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'polygon');
    },

    arc(opts: ArcOpts): ArcSpec {
      return ensureId({
        kind: 'arc',
        id: opts.id ?? '',
        radius: opts.radius ?? 50,
        startAngle: opts.startAngle ?? 0,
        endAngle: opts.endAngle ?? Math.PI,
        at: opts.at ?? [0, 0],
        stroke: opts.stroke,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'arc');
    },

    line(opts: LineOpts): LineSpec {
      return ensureId({
        kind: 'line',
        id: opts.id ?? '',
        points: opts.points,
        at: opts.at ?? [0, 0],
        stroke: opts.stroke,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'line');
    },

    arrow(opts: ArrowOpts): ArrowSpec {
      return ensureId({
        kind: 'arrow',
        id: opts.id ?? '',
        from: opts.from ?? [0, 0],
        to: opts.to ?? [100, 0],
        at: opts.at,
        stroke: opts.stroke,
        headSize: opts.headSize ?? 12,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'arrow');
    },

    group(children: string[] = [], opts: GroupOpts = {}): GroupSpec {
      return ensureId({
        kind: 'group',
        id: opts.id ?? '',
        children,
        at: opts.at,
        layout: opts.layout,
        opacity: opts.opacity,
        visible: opts.visible,
        zIndex: opts.zIndex,
      }, opts.id ?? 'group');
    },
  };
}
