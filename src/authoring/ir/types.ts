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
  | MathSpec | GroupSpec | IslandSpec
  | WgPointSpec | WgSegmentSpec | WgVectorSpec | WgPolylineSpec | WgPolygonSpec
  | WgCircleSpec | WgArcSpec | WgEllipseSpec | WgConicSpec
  | WgMidpointSpec | WgCentroidSpec | WgIntersectionSpec | WgGliderSpec
  | WgReflectionSpec | WgLineThroughSpec | WgPerpendicularSpec | WgParallelSpec
  | WgCircumcircleSpec | WgAngleSpec | WgDistanceSpec
  | WgPlotFnSpec | WgPlotParametricSpec | WgPlotPolarSpec | WgPlotImplicitSpec
  | WgFieldSpec;

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

// ── windgraph objects (sprint-v2 Phase 1 — see sprint-v2/contracts.md §2) ─
// Object-like math content: typed parameters, identity, draggable/measurable,
// per-object clips. Resolved to windgraph Mobject/GObject instances by the
// board adapter's object-resolver. Field values accept ParamRef ({ $param })
// for slider binding — same wire as IslandSpec.params.

/** Numeric value: literal or parameter-bound. */
export type WgNum = number | ParamRef;
/** Point: literal [x,y], parameter-bound, or another object's id. */
export type WgPoint = Vec2 | ParamRef | string;

export interface WgPointSpec {
  kind: 'wg-point'; id: string;
  at: WgPoint;
  /** Draggable; becomes a free node in the board's constraint graph. */
  free?: boolean;
  label?: string;
  color?: Color; radius?: number;
  opacity?: number; visible?: boolean;
}

export interface WgSegmentSpec {
  kind: 'wg-segment'; id: string;
  from: WgPoint; to: WgPoint;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgVectorSpec {
  kind: 'wg-vector'; id: string;
  from: WgPoint; to: WgPoint;
  color?: Color; width?: number;
  opacity?: number; visible?: boolean;
}

export interface WgPolylineSpec {
  kind: 'wg-polyline'; id: string;
  points: WgPoint[];
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPolygonSpec {
  kind: 'wg-polygon'; id: string;
  points: WgPoint[];
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgCircleSpec {
  kind: 'wg-circle'; id: string;
  center: WgPoint; radius: WgNum;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgArcSpec {
  kind: 'wg-arc'; id: string;
  center: WgPoint; radius: WgNum;
  a0: WgNum; a1: WgNum;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgEllipseSpec {
  kind: 'wg-ellipse'; id: string;
  center: WgPoint; rx: WgNum; ry: WgNum; rot?: WgNum;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** Stub kind — validated here, resolved in Phase 4 (B5 live conics). */
export interface WgConicSpec {
  kind: 'wg-conic'; id: string;
  conic: 'ellipse' | 'hyperbola' | 'parabola';
  foci?: string[]; directrix?: string; through?: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

// Constraint constructions: inputs are object ids; the board adapter registers
// them in its ConstraintGraph (cycles rejected by validation).

export interface WgMidpointSpec {
  kind: 'wg-midpoint'; id: string;
  a: string; b: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgCentroidSpec {
  kind: 'wg-centroid'; id: string;
  points: string[];
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgIntersectionSpec {
  kind: 'wg-intersection'; id: string;
  a: string; b: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgGliderSpec {
  kind: 'wg-glider'; id: string;
  curve: string; t: WgNum;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgReflectionSpec {
  kind: 'wg-reflection'; id: string;
  p: string; axis: string;
  color?: Color; radius?: number; label?: string;
  opacity?: number; visible?: boolean;
}

export interface WgLineThroughSpec {
  kind: 'wg-line-through'; id: string;
  a: string; b: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPerpendicularSpec {
  kind: 'wg-perpendicular'; id: string;
  line: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgParallelSpec {
  kind: 'wg-parallel'; id: string;
  line: string; point: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgCircumcircleSpec {
  kind: 'wg-circumcircle'; id: string;
  a: string; b: string; c: string;
  fill?: Color; stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

/** Angle mark + live measure label at `vertex`. */
export interface WgAngleSpec {
  kind: 'wg-angle'; id: string;
  a: string; vertex: string; b: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}

/** Distance readout label between two points. */
export interface WgDistanceSpec {
  kind: 'wg-distance'; id: string;
  a: string; b: string;
  color?: Color;
  opacity?: number; visible?: boolean;
}

// Plots: expressions are compiled by windgraph/expr (variables: x / x,y / t
// plus scene param names). Function closures attach at builder level; the
// serialized form is always the expression string.

export interface WgPlotFnSpec {
  kind: 'wg-plot-fn'; id: string;
  expr: string;
  domain?: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotParametricSpec {
  kind: 'wg-plot-parametric'; id: string;
  xExpr: string; yExpr: string;
  tRange: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotPolarSpec {
  kind: 'wg-plot-polar'; id: string;
  rExpr: string;
  tRange: [WgNum, WgNum];
  samples?: number;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgPlotImplicitSpec {
  kind: 'wg-plot-implicit'; id: string;
  expr: string;
  stroke?: Stroke;
  opacity?: number; visible?: boolean;
}

export interface WgFieldSpec {
  kind: 'wg-field'; id: string;
  field: 'vector' | 'slope';
  /** vector: (xExpr, yExpr) components · slope: ignored (dy/dx = yExpr). */
  xExpr?: string; yExpr: string;
  density?: number;
  color?: Color;
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
  wrap?: boolean;
};

export interface PageMeta {
  title?: string;
  resizable?: boolean;
  minSize?: Vec2;
  maxSize?: Vec2;
  /** Safe-area page: sized for the letterbox-band state, reflows on band toggle. */
  safe?: boolean;
  /** Authored world width for safe pages (default 1260). Height tracks canvas ratio. */
  nominalW?: number;
  /** Cover page: height tracks the FULL canvas (not band-shrunk) → canvas-aspect.
   *  Used for the Living-UI chapter so the slot fills the screen at fitObj. */
  cover?: boolean;
  /** Suppress the page-card chrome rect (fill + stroke) — the content floats
   *  directly on the canvas backdrop. */
  noChrome?: boolean;
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
      | 'moveTo' | 'scaleTo' | 'rotateTo' | 'morph' | 'param' | 'moveAlongPath';
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
  /** Layout-resolved dive: resolve center/zoom from this object's laid-out box. */
  fitObj?: string;
  /** With fitObj: aim the camera at this FRACTION of the object's box instead of
   *  its center — robust to aspect changes (unlike a world-unit `offset`). */
  fitPoint?: Vec2;
  /** Trace metadata — expanded by runtime into sub-keyframes. */
  trace?: {
    target: string;
    zoom: number;
    d: number;
    samples?: number;
    pullBack?: boolean;
    char?: string;
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
