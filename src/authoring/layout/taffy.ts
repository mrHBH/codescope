// ── Taffy WASM wrapper — loads the WASM module and provides a clean TS API ──

// Runtime types for the wasm-bindgen generated module
interface TaffyBridgeWasm {
  new_node(): number;
  add_child(parent: number, child: number): boolean;
  remove(id: number): boolean;
  set_style(id: number, style_json: string): boolean;
  compute_layout(root: number, available_width: number, available_height: number): string;
  node_count(): number;
  clear(): void;
  free(): void;
}

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
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
}

// ── WASM loading ─────────────────────────────────────────────────────────────

let wasmModule: { default: () => Promise<void>; TaffyBridge: new () => TaffyBridgeWasm } | null = null;
let wasmInitPromise: Promise<void> | null = null;

async function loadWasm() {
  if (wasmModule) return wasmModule;
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      // Vite serves public/ at root; Bun/Node need project-relative path
      const path = typeof window !== 'undefined'
        ? '/taffy_bridge.js'
        : new URL('../../../public/taffy_bridge.js', import.meta.url).href;
      wasmModule = await import(path);
      await wasmModule!.default();
    })();
  }
  await wasmInitPromise;
  return wasmModule!;
}

// ── Style translation ────────────────────────────────────────────────────────
// Taffy's serde format is verbose: values are {Points: N} or {Percent: N}
// We translate from a friendly camelCase format to Taffy's internal JSON.

type L = { Length: number } | { Percent: number };
type Dim = { Length: number } | { Percent: number } | 'Auto';

function length(n: number): L { return { Length: n }; }
function rect(v: number | [number, number] | [number, number, number, number]): { left?: L; right?: L; top?: L; bottom?: L } {
  if (typeof v === 'number') {
    const p = length(v);
    return { left: p, right: p, top: p, bottom: p };
  }
  if (v.length === 2) return { left: length(v[0]), right: length(v[0]), top: length(v[1]), bottom: length(v[1]) };
  return { left: length(v[0]), right: length(v[1]), top: length(v[2]), bottom: length(v[3]) };
}
function size(w: number | 'auto', h: number | 'auto'): { width: Dim; height: Dim } {
  return { width: w === 'auto' ? 'Auto' : length(w), height: h === 'auto' ? 'Auto' : length(h) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTaffyStyle(s: StyleProps): any {
  const out: Record<string, unknown> = {};

  if (s.display) out.display = s.display.charAt(0).toUpperCase() + s.display.slice(1); // flex→Flex, grid→Grid, block→Block
  if (s.flexDirection) out.flex_direction = s.flexDirection === 'row' ? 'Row' : s.flexDirection === 'column' ? 'Column' : s.flexDirection === 'row-reverse' ? 'RowReverse' : 'ColumnReverse';
  if (s.flexWrap) out.flex_wrap = s.flexWrap === 'wrap' ? 'Wrap' : s.flexWrap === 'wrap-reverse' ? 'WrapReverse' : 'NoWrap';
  if (s.flexGrow !== undefined) out.flex_grow = s.flexGrow;
  if (s.flexShrink !== undefined) out.flex_shrink = s.flexShrink;
  if (s.flexBasis !== undefined) out.flex_basis = s.flexBasis === 'auto' ? 'Auto' : length(s.flexBasis);

  if (s.gap !== undefined) {
    if (typeof s.gap === 'number') out.gap = { width: length(s.gap), height: length(s.gap) };
    else out.gap = { width: length(s.gap[0]), height: length(s.gap[1] ?? s.gap[0]) };
  }

  if (s.padding !== undefined) out.padding = rect(s.padding);
  if (s.margin !== undefined) out.margin = rect(s.margin);

  if (s.width !== undefined || s.height !== undefined) {
    out.size = size(s.width ?? 'auto', s.height ?? 'auto');
  }
  if (s.size !== undefined) {
    out.size = typeof s.size === 'number' ? size(s.size, s.size) : size(s.size, s.size);
  }

  if (s.minWidth !== undefined || s.minHeight !== undefined) out.min_size = size(s.minWidth ?? 'auto', s.minHeight ?? 'auto');
  if (s.maxWidth !== undefined || s.maxHeight !== undefined) out.max_size = size(s.maxWidth ?? 'auto', s.maxHeight ?? 'auto');
  if (s.aspectRatio !== undefined) out.aspect_ratio = s.aspectRatio;

  if (s.alignSelf) out.align_self = mapAlign(s.alignSelf);
  if (s.alignItems) out.align_items = mapAlign(s.alignItems);
  if (s.justifyContent) out.justify_content = mapJustify(s.justifyContent);
  if (s.alignContent) out.align_content = mapAlign(s.alignContent);
  if (s.position) out.position = s.position.charAt(0).toUpperCase() + s.position.slice(1);

  return out;
}

// Taffy 0.7 enums use PascalCase (e.g. FlexStart), not CSS kebab-case (e.g. flex-start)
function mapAlign(v: string): string {
  switch (v) {
    case 'flex-start': return 'FlexStart';
    case 'flex-end': return 'FlexEnd';
    case 'center': return 'Center';
    case 'stretch': return 'Stretch';
    case 'baseline': return 'Baseline';
    case 'start': return 'Start';
    case 'end': return 'End';
    case 'auto': return 'Auto';
    default: return v;
  }
}
function mapJustify(v: string): string {
  switch (v) {
    case 'flex-start': return 'FlexStart';
    case 'flex-end': return 'FlexEnd';
    case 'center': return 'Center';
    case 'space-between': return 'SpaceBetween';
    case 'space-around': return 'SpaceAround';
    case 'space-evenly': return 'SpaceEvenly';
    case 'start': return 'Start';
    case 'end': return 'End';
    default: return v;
  }
}

export class TaffyLayout {
  private bridge: TaffyBridgeWasm | null = null;

  async init(): Promise<void> {
    const mod = await loadWasm();
    this.bridge = new mod.TaffyBridge();
  }

  /** Create a new layout node and return its ID. */
  newNode(style: StyleProps = {}): number {
    const id = this.bridge!.new_node();
    if (Object.keys(style).length > 0) {
      this.setStyle(id, style);
    }
    return id;
  }

  /** Add child to parent. */
  addChild(parent: number, child: number): void {
    this.bridge!.add_child(parent, child);
  }

  /** Set or update style on a node. Translates from nice StyleProps to Taffy's verbose serde format. */
  setStyle(id: number, style: StyleProps): void {
    this.bridge!.set_style(id, JSON.stringify(toTaffyStyle(style)));
  }

  /** Remove a node and all its children. */
  remove(id: number): void {
    this.bridge!.remove(id);
  }

  /** Compute layout for the tree rooted at `root`, returns positions for all nodes. */
  computeLayout(
    root: number,
    availableWidth: number = NaN,
    availableHeight: number = NaN,
  ): LayoutResult[] {
    const json = this.bridge!.compute_layout(root, availableWidth, availableHeight);
    const results: number[][] = JSON.parse(json);
    return results.map(([id, x, y, width, height]) => ({
      id: Math.round(id),
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    }));
  }

  /** Number of active nodes. */
  nodeCount(): number {
    return this.bridge!.node_count();
  }

  /** Reset the entire layout tree. */
  clear(): void {
    this.bridge?.clear();
  }
}

/** Singleton instance — call `await taffy.init()` before first use. */
export const taffy = new TaffyLayout();
