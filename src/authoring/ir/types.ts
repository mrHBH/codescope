// ── SceneDoc — canonical schema ────────────────────────────────────────────
// The single JSON-serializable value. Every tool reads and writes this shape.

export interface SceneDoc {
  version: 1;
  meta: { title: string };
  objects: Record<string, ObjectSpec>;
  params: Record<string, ParamDef>;
  clips: ClipSpec[];
  camera: CameraTrack;
}

// ── Objects ──────────────────────────────────────────────────────────────

export type ObjectSpec =
  | TextSpec | GlyphSpec | RectSpec | CircleSpec | PolygonSpec | LineSpec
  | MathSpec | GroupSpec | IslandSpec;

export interface TextSpec {
  kind: 'text'; id: string;
  content: string; at: Vec2;
  size: number; color: Color;
  weight?: number; align?: 'left' | 'center' | 'right';
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface GlyphSpec {
  kind: 'glyph'; id: string;
  char: string; at: Vec2;
  size: number; color: Color;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface RectSpec {
  kind: 'rect'; id: string;
  at: Vec2; size: Vec2;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface CircleSpec {
  kind: 'circle'; id: string;
  center: Vec2; radius: number;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface PolygonSpec {
  kind: 'polygon'; id: string;
  points: Vec2[]; closed?: boolean;
  fill?: Color; stroke?: Stroke;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface LineSpec {
  kind: 'line'; id: string;
  points: Vec2[]; width: number;
  color: Color; dash?: number[];
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface MathSpec {
  kind: 'math'; id: string;
  latex: string; at: Vec2;
  size: number; color: Color;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface GroupSpec {
  kind: 'group'; id: string;
  at: Vec2; children: string[];
  size?: Vec2;
  layout?: LayoutSpec;
  chapter?: ChapterMeta;
  page?: PageMeta;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface ChapterMeta {
  title: string; sub: string; duration: number;
}

export interface IslandSpec {
  kind: 'island'; id: string;
  island: string; at: Vec2;
  size?: Vec2;
  params?: Record<string, ParamValue | ParamRef>;
  item?: LayoutItem;
  opacity?: number; visible?: boolean;
}

export interface Stroke {
  color: Color; width: number;
}

// ── Layout (Taffy-backed; v1: flex/stack only) ───────────────────────────

export type LayoutSpec = {
  kind: 'flex'; direction: 'row' | 'column'; gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
};

export interface PageMeta {
  title?: string;
  resizable?: boolean;
  minSize?: Vec2;
  maxSize?: Vec2;
}

export interface LayoutItem {
  width?: number | 'auto';
  height?: number | 'auto';
  flexGrow?: number;
  flexShrink?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  resizable?: boolean;
  /** Islands only: scale content to fill the layout slot (true = reactive fill,
   *  false/absent = fixed at def.defaultSize, centered in slot). */
  fill?: boolean;
  /** Emit a soft glow aura behind the object. `true` = default glow;
   *  object form: { layers?, spread?, alpha? }. */
  glow?: true | { layers?: number; spread?: number; alpha?: number };
}

// ── Animation ────────────────────────────────────────────────────────────

export interface ClipSpec {
  id: string;
  target: string;
  kind: 'fadeIn' | 'fadeOut' | 'draw' | 'write'
      | 'moveTo' | 'scaleTo' | 'rotateTo' | 'morph' | 'param';
  start: number;
  duration: number;
  ease?: EasingName;
  props: Record<string, unknown>;
}

export type EasingName =
  | 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  | 'smoothstep' | 'smootherstep'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeOutBack' | 'easeOutElastic' | 'easeOutBounce'
  | 'rushInto' | 'rushFrom';

// ── Camera ───────────────────────────────────────────────────────────────

export interface CameraTrack { keyframes: CameraKeyframe[]; }

export interface CameraKeyframe {
  time: number;
  center?: Vec2;
  zoom?: number;
  fit?: string;
  offset?: Vec2;
  zoomMul?: number;
  polar?: number;
  azimuth?: number;
  ease?: EasingName;
  drift?: {
    xAmp?: number; yAmp?: number; xPeriod?: number; yPeriod?: number;
    azAmp?: number; azPeriod?: number;
  };
}

// ── Params ───────────────────────────────────────────────────────────────

export type ParamDef =
  | { kind: 'number';  label: string; default: number; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; label: string; default: boolean }
  | { kind: 'point';   label: string; default: Vec2 }
  | { kind: 'color';   label: string; default: Color };

export type ParamValue = number | boolean | Vec2 | Color;
export type ParamRef   = { $param: string };

// ── Common ───────────────────────────────────────────────────────────────

export type Vec2  = [number, number];
export type Color = [number, number, number, number];
