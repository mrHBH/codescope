// ── Scene IR types — the single source of truth for the authoring system ──
// Every editor (code, GUI, terminal) reads and writes this shape.
// All types are JSON-serializable — no class instances, no functions.

// ── Primitives ───────────────────────────────────────────────────────────────

export type Vec2 = [number, number];
export type Color = [number, number, number, number]; // RGBA 0-1
export type Padding = number | [number, number] | [number, number, number, number];

// ── Scene IR ─────────────────────────────────────────────────────────────────

export interface SceneIR {
  version: 1;
  meta: SceneMeta;
  objects: Record<string, ObjectSpec>;
  clips: AnimationClip[];
  camera: CameraTrack;
  params: ParamDef[];
}

export interface SceneMeta {
  title: string;
  duration: number; // total timeline in seconds
  fps?: number;     // default 60
}

// ── Object specs ─────────────────────────────────────────────────────────────

export type ObjectKind =
  | 'text'
  | 'glyph'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'arc'
  | 'line'
  | 'arrow'
  | 'group'
  | 'plot';

export type ObjectSpec =
  | TextSpec
  | GlyphSpec
  | RectSpec
  | CircleSpec
  | EllipseSpec
  | PolygonSpec
  | ArcSpec
  | LineSpec
  | ArrowSpec
  | GroupSpec
  | PlotSpec;

export interface ObjectBase {
  kind: ObjectKind;
  id: string;
  at?: Vec2;               // position (absolute or resolved by layout)
  opacity?: number;        // 0-1, default 1
  visible?: boolean;       // default true
  zIndex?: number;         // rendering order (higher = on top)
  rotation?: number;       // radians
  scaleX?: number;         // default 1
  scaleY?: number;         // default 1
  reveal?: number;         // 0-1 draw-on fraction, default 1
}

// ── Text ─────────────────────────────────────────────────────────────────────

export interface TextStyle {
  size: number;            // font size
  color: Color;
  font?: string;           // font family name
  weight?: number;         // 100-900, default 400
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;     // multiplier, default 1.2
}

export interface TextSpec extends ObjectBase {
  kind: 'text';
  content: string;
  style: TextStyle;
}

// ── Glyph (single character with optional sub-region zoom) ───────────────────

export interface GlyphStyle {
  color?: Color;           // default white
}

export interface GlyphSpec extends ObjectBase {
  kind: 'glyph';
  char: string;            // single Unicode character
  scale?: number;          // default 1
  subregion?: GlyphSubregion; // zoomed sub-region [cx, cy, scale]
  style: GlyphStyle;
}

export type GlyphSubregion = [number, number, number]; // [cx, cy, scale] in glyph-atlas units

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface StrokeStyle {
  color: Color;
  width: number;           // world-space width
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  dash?: number[];         // dash pattern [solid, gap, ...]
}

export interface FillStyle {
  color: Color;
}

export interface RectSpec extends ObjectBase {
  kind: 'rect';
  size: Vec2;              // [width, height] — local-space (position = origin)
  fill?: Color;
  stroke?: StrokeStyle;
  radius?: number | [number, number, number, number]; // corner radius
}

export interface CircleSpec extends ObjectBase {
  kind: 'circle';
  radius: number;
  fill?: Color;
  stroke?: StrokeStyle;
}

export interface EllipseSpec extends ObjectBase {
  kind: 'ellipse';
  rx: number;
  ry: number;
  fill?: Color;
  stroke?: StrokeStyle;
}

export interface PolygonSpec extends ObjectBase {
  kind: 'polygon';
  points: Vec2[];          // local-space vertices
  closed?: boolean;        // default true (auto-close to first point)
  fill?: Color;
  stroke?: StrokeStyle;
}

export interface ArcSpec extends ObjectBase {
  kind: 'arc';
  radius: number;
  startAngle: number;      // radians
  endAngle: number;
  stroke: StrokeStyle;
}

export interface LineSpec extends ObjectBase {
  kind: 'line';
  points: Vec2[];          // at least 2 points; first point is at [0,0] if at is set
  stroke: StrokeStyle;
}

export interface ArrowSpec extends ObjectBase {
  kind: 'arrow';
  from: Vec2;              // tail position (optional; at overrides)
  to: Vec2;                // head position (optional; at + size overrides)
  stroke: StrokeStyle;
  headSize?: number;       // arrowhead length, default 12
}

// ── Group ────────────────────────────────────────────────────────────────────

export interface GroupSpec extends ObjectBase {
  kind: 'group';
  children: string[];      // object IDs
  layout?: LayoutSpec;
}

// ── Layout (Taffy-backed) ────────────────────────────────────────────────────

export type LayoutSpec =
  | FlexLayout
  | GridLayout
  | StackLayout
  | AbsoluteLayout;

export interface FlexLayout {
  kind: 'flex';
  direction: 'row' | 'column';
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: number;
  padding?: Padding;
  align?: Align;           // cross-axis
  justify?: Justify;       // main-axis
}

export interface GridLayout {
  kind: 'grid';
  columns: (number | 'auto' | 'fr')[];  // template columns
  rows: (number | 'auto' | 'fr')[];     // template rows
  gap?: number;
  padding?: Padding;
  align?: Align;
  justify?: Justify;
}

export interface StackLayout {
  kind: 'stack';
  direction: 'vertical' | 'horizontal';
  gap?: number;
  padding?: Padding;
  align?: Align;
}

export interface AbsoluteLayout {
  kind: 'absolute';
}

export type Align =
  | 'start'
  | 'center'
  | 'end'
  | 'stretch'
  | 'baseline';

export type Justify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

// ── Plot (placeholder — fleshed out in Phase 4) ──────────────────────────────

export type PlotSpec = FunctionPlotSpec | ScatterPlotSpec | ImplicitPlotSpec;

export interface PlaneBounds {
  xMin: number; xMax: number;
  yMin: number; yMax: number;
}

export interface FunctionPlotSpec extends ObjectBase {
  kind: 'plot';
  plotKind: 'function';
  fn: string;              // JS expression string, e.g. "Math.sin(x) * 2"
  bounds: PlaneBounds;
  stroke: StrokeStyle;
  adaptiveSample?: boolean; // default true
}

export interface ScatterPlotSpec extends ObjectBase {
  kind: 'plot';
  plotKind: 'scatter';
  points: Vec2[];
  bounds: PlaneBounds;
  fill?: Color;
  pointRadius?: number;    // default 3
}

export interface ImplicitPlotSpec extends ObjectBase {
  kind: 'plot';
  plotKind: 'implicit';
  fn: string;              // JS expression string for F(x,y)=0
  bounds: PlaneBounds;
  stroke: StrokeStyle;
  gridRes?: number;        // default 0.2
}

// ── Animation ────────────────────────────────────────────────────────────────

export interface AnimationClip {
  id: string;
  target: string;          // object ID, or 'camera'
  kind: AnimationKind;
  start: number;           // absolute seconds
  duration: number;
  ease: EasingName;
  props: Record<string, unknown>; // kind-specific params (see below)
}

export type AnimationKind =
  | 'draw'        // stroke draw-on, reveal 0→1
  | 'fadeIn'      // opacity 0→1
  | 'fadeOut'     // opacity 1→0, sets visible=false on finish
  | 'write'       // typewriter text reveal, character-by-character
  | 'moveTo'      // animate position to absolute target
  | 'shift'       // animate position by delta
  | 'scaleTo'     // animate scale to target
  | 'rotateTo'    // animate rotation to absolute target (radians)
  | 'morphTo'     // morph polygon points
  | 'cameraTo'    // move camera to keyframe pose
  | 'param';       // animate a parameter value from→to

// AnimationClip props by kind:
// draw:        { direction?: 'ltr' | 'rtl' }
// fadeIn:      {}
// fadeOut:     {}
// write:       { charsPerSec?: number }   // default 30
// moveTo:      { x: number; y: number }
// shift:       { dx: number; dy: number }
// scaleTo:     { sx: number; sy?: number } // sy defaults to sx
// rotateTo:    { radians: number }
// morphTo:     { points: Vec2[] }
// cameraTo:    { center: Vec2; zoom: number; rotation?: number }
// param:       { paramId: string; from: number; to: number }

// ── Easing ───────────────────────────────────────────────────────────────────

export type EasingName =
  | 'linear'
  | 'quadIn' | 'quadOut' | 'quadInOut'
  | 'cubicIn' | 'cubicOut' | 'cubicInOut'
  | 'quintIn' | 'quintOut' | 'quintInOut'
  | 'smoothstep' | 'smootherstep'
  | 'sineIn' | 'sineOut' | 'sineInOut'
  | 'backIn' | 'backOut' | 'backInOut'
  | 'elasticIn' | 'elasticOut'
  | 'bounceIn' | 'bounceOut'
  | 'rushInto' | 'rushFrom';

// ── Camera ───────────────────────────────────────────────────────────────────

export interface CameraTrack {
  keyframes: CameraKeyframe[];
  defaultZoom?: number;    // default 1
}

export interface CameraKeyframe {
  time: number;            // absolute seconds
  center: Vec2;
  zoom: number;
  rotation?: number;       // degrees
  ease?: EasingName;       // easing INTO this keyframe (default: linear)
}

// ── Parameters (first-class interactivity) ───────────────────────────────────

export type ParamDef =
  | SliderParam
  | ToggleParam
  | PointParam
  | ColorParam;

export interface SliderParam {
  kind: 'slider';
  id: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface ToggleParam {
  kind: 'toggle';
  id: string;
  label: string;
  default: boolean;
}

export interface PointParam {
  kind: 'point';
  id: string;
  label: string;
  default: Vec2;
}

export interface ColorParam {
  kind: 'color';
  id: string;
  label: string;
  default: Color;
}

// Enables objects to bind to live parameter values. Any property of an ObjectSpec
// that accepts a number/boolean/Vec2/Color can instead hold a ParamRef.
// The runtime resolves these each frame.
export type ParamRef = { $param: string };
export type ParamValue = number | boolean | Vec2 | Color;
