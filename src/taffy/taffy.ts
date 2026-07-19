// ── Taffy WASM wrapper — loads the Taffy CSS layout engine ──────────────────

import initTaffyWasm, { TaffyBridge as TaffyBridgeImpl } from './taffy-bridge/index.js';

export interface LayoutResult {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StyleProps {
  display?: 'flex' | 'grid' | 'block';
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexWrap?: 'no-wrap' | 'wrap' | 'wrap-reverse';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto';
  gap?: number | [number, number];
  padding?: number | [number, number] | [number, number, number, number];
  margin?: number | [number, number] | [number, number, number, number];
  width?: number | 'auto';
  height?: number | 'auto';
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'stretch';
  gridColumn?: { start: number; end: number };
  gridRow?: { start: number; end: number };
  size?: number | 'auto';
  position?: 'relative' | 'absolute';
}

interface TaffyBridgeWasm {
  new_node(): number;
  add_child(parent: number, child: number): boolean;
  remove(id: number): boolean;
  set_style(id: number, style_json: string): boolean;
  compute_layout(root: number, aw: number, ah: number): string;
  node_count(): number;
  clear(): void;
  free(): void;
}

let wasmReady = false;
let initPromise: Promise<void> | null = null;

async function loadWasm() {
  if (wasmReady) return;
  if (!initPromise) {
    initPromise = initTaffyWasm().then(() => { wasmReady = true; });
  }
  await initPromise;
}

export class TaffyLayout {
  private bridge: TaffyBridgeWasm | null = null;
  private _ready = false;

  get ready(): boolean { return this._ready; }

  async init(): Promise<void> {
    if (this._ready) return;
    await loadWasm();
    this.bridge = new TaffyBridgeImpl();
    this._ready = true;
  }

  newNode(style: StyleProps = {}): number {
    const id = this.bridge!.new_node();
    if (Object.keys(style).length > 0) this.setStyle(id, style);
    return id;
  }

  addChild(parent: number, child: number): void { this.bridge!.add_child(parent, child); }

  setStyle(id: number, style: StyleProps): void {
    this.bridge!.set_style(id, JSON.stringify(toTaffyStyle(style)));
  }

  remove(id: number): void { this.bridge!.remove(id); }

  computeLayout(root: number, aw = NaN, ah = NaN): LayoutResult[] {
    const json = this.bridge!.compute_layout(root, aw, ah);
    const r: number[][] = JSON.parse(json);
    return r.map(([id, x, y, width, height]) => ({
      id: Math.round(id), x, y, width, height,
    }));
  }

  nodeCount(): number { return this.bridge!.node_count(); }
  clear(): void { this.bridge?.clear(); }
}

export const taffy = new TaffyLayout();

// ── Taffy serde format translator ────────────────────────────────────────────

type L = { Length: number } | { Percent: number };
type Dim = { Length: number } | { Percent: number } | 'Auto';

function len(n: number): L { return { Length: n }; }
function rect(v: number | [number, number] | [number, number, number, number]) {
  if (typeof v === 'number') { const p = len(v); return { left: p, right: p, top: p, bottom: p }; }
  if (v.length === 2) return { left: len(v[0]), right: len(v[0]), top: len(v[1]), bottom: len(v[1]) };
  return { left: len(v[0]), right: len(v[1]), top: len(v[2]), bottom: len(v[3]) };
}
function sz(w: number | 'auto', h: number | 'auto') {
  return { width: w === 'auto' ? 'Auto' as Dim : len(w), height: h === 'auto' ? 'Auto' as Dim : len(h) };
}

function toTaffyStyle(s: StyleProps): any {
  const o: Record<string, unknown> = {};
  if (s.display) o.display = s.display[0].toUpperCase() + s.display.slice(1);
  if (s.flexDirection) o.flex_direction = s.flexDirection === 'row' ? 'Row' : s.flexDirection === 'column' ? 'Column' : s.flexDirection === 'row-reverse' ? 'RowReverse' : 'ColumnReverse';
  if (s.flexWrap) o.flex_wrap = s.flexWrap === 'wrap' ? 'Wrap' : s.flexWrap === 'wrap-reverse' ? 'WrapReverse' : 'NoWrap';
  if (s.flexGrow !== undefined) o.flex_grow = s.flexGrow;
  if (s.flexShrink !== undefined) o.flex_shrink = s.flexShrink;
  if (s.flexBasis !== undefined) o.flex_basis = s.flexBasis === 'auto' ? 'Auto' : len(s.flexBasis);
  if (s.gap !== undefined) {
    if (typeof s.gap === 'number') o.gap = { width: len(s.gap), height: len(s.gap) };
    else o.gap = { width: len(s.gap[0]), height: len(s.gap[1] ?? s.gap[0]) };
  }
  if (s.padding !== undefined) o.padding = rect(s.padding);
  if (s.margin !== undefined) o.margin = rect(s.margin);
  if (s.width !== undefined || s.height !== undefined) o.size = sz(s.width ?? 'auto', s.height ?? 'auto');
  if (s.size !== undefined) o.size = typeof s.size === 'number' ? sz(s.size, s.size) : sz(s.size, s.size);
  if (s.minWidth !== undefined || s.minHeight !== undefined) o.min_size = sz(s.minWidth ?? 'auto', s.minHeight ?? 'auto');
  if (s.maxWidth !== undefined || s.maxHeight !== undefined) o.max_size = sz(s.maxWidth ?? 'auto', s.maxHeight ?? 'auto');
  if (s.aspectRatio !== undefined) o.aspect_ratio = s.aspectRatio;
  if (s.alignSelf) o.align_self = ma(s.alignSelf);
  if (s.alignItems) o.align_items = ma(s.alignItems);
  if (s.justifyContent) o.justify_content = mj(s.justifyContent);
  if (s.alignContent) o.align_content = ma(s.alignContent);
  if (s.position) o.position = s.position[0].toUpperCase() + s.position.slice(1);
  return o;
}
function ma(v: string): string { switch (v) { case 'flex-start': return 'FlexStart'; case 'flex-end': return 'FlexEnd'; case 'center': return 'Center'; case 'stretch': return 'Stretch'; case 'baseline': return 'Baseline'; default: return v; } }
function mj(v: string): string { switch (v) { case 'flex-start': return 'FlexStart'; case 'flex-end': return 'FlexEnd'; case 'center': return 'Center'; case 'space-between': return 'SpaceBetween'; case 'space-around': return 'SpaceAround'; case 'space-evenly': return 'SpaceEvenly'; default: return v; } }
