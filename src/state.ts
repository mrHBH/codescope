// ── App state ───────────────────────────────────────────────────────────────
// Single mutable container holding every piece of runtime state. Modules
// (camera, input, frame) receive this object rather than reaching into a
// tangle of closure variables, which keeps main.ts a thin wiring layer.

import type { FontFace } from './windfoil/font';
import type { StyledEl, PageRect, Seg } from './layout/types';
import type { CodeEditor } from './editor/editor';
import type { Terminal } from './editor/terminal';
import type { FileTree } from './editor/fileTree';

export interface ThemeCol {
  backdrop: number[]; pageBg: number[]; prog: number[]; pulse: number[];
  shadow: number[]; caret: number[]; sel: number[];
}

export interface AppState {
  // canvases + contexts
  dpr: number;
  PAGE_W: number;
  rCanvas: HTMLCanvasElement;
  tCanvas: HTMLCanvasElement;
  rCtx: CanvasRenderingContext2D;
  gpuCtx: GPUCanvasContext;
  device: GPUDevice;
  renderer: any;
  font: FontFace;
  atlas: any;

  // DOM + layout tree
  container: HTMLElement;
  styledEls: StyledEl[];
  pageRoots: StyledEl[];
  editableEls: StyledEl[];
  dynamicEls: StyledEl[];
  marqueeEls: StyledEl[];
  pages: PageRect[];
  docH: number;
  docRoot: StyledEl;

  // theme
  cssRules: { selector: string; props: Record<string,string> }[];
  isDark: boolean;
  themeMode: string;
  cycleTheme?: () => void;
  themeCol: ThemeCol;
  themeBtn: HTMLButtonElement | null;
  fpsEl: HTMLElement;

  // camera
  camX: number; camY: number; camZ: number;
  viewX: number; viewY: number; viewZ: number;
  tgtX: number; tgtY: number; tgtZ: number;
  velX: number; velY: number;
  dragging: boolean;
  lastMoveT: number;
  minZoom: number;
  pointers: Map<number, { x: number; y: number }>;
  mx: number; my: number; mwx: number; mwy: number;
  lastWheelT: number;
  rightDown: boolean;

  // 3D free camera (Phase 2). When `active`, the document lies flat on the ground
  // and is driven by the `camera-controls` library (same as yasmineOS) for
  // identical pan/zoom/rotate/damping. `exiting` marks the eased flatten-back to
  // the 2D view. All camera motion state lives inside the library (see orbit.ts).
  cam3d: {
    active: boolean;
    exiting: boolean;
  };

  // precomputed static buffers
  preCrv: number[]; preRws: number[];
  preCrvLen: number; preRwsLen: number;
  highlightCache: Map<StyledEl, Seg[]>;
  bgByPage: number[][]; textByPage: number[][];
  pageVisible: boolean[];
  baseCrv: number[]; baseRws: number[];
  baseCrvLen: number; baseRwsLen: number;

  // reusable typed-array scratch (grow on demand)
  crvFA: Float32Array; rwsUA: Uint32Array; instFA: Float32Array;
  instJS: number[];

  // editing + press tracking
  activeEdit: StyledEl | null;
  pressed: StyledEl | null;
  selecting: boolean;

  // code editor
  editor: CodeEditor | null;
  editorMode: boolean;
  editorSelecting: boolean;

  // terminal
  terminal: Terminal | null;
  terminalMode: boolean;

  // file tree
  fileTree: FileTree | null;
  fileTreeMode: boolean;

  // cinematic demo flight (optional controller; see ui/demo.ts)
  demo: { running: boolean; toggle(): void; start(): void; stop(): void; update(now: number): void } | null;

  // windgraph Phase-0/1/2 demo (world-space board; see windgraph/demo.ts)
  windgraph: { x0: number; y0: number; width: number; height: number; emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }, camX?: number, camY?: number): void } | null;

  // windgraph Phase-4 animation demo (world-space board; see windgraph/anim/demo.ts)
  morphDemo: { x0: number; y0: number; width: number; height: number; emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }): void } | null;

  // windgraph Phase-5 interactivity demo (world-space, draggable; see windgraph/interact/demo.ts)
  interactive: {
    x0: number; y0: number; width: number; height: number;
    emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }): void;
    tryBeginDrag(wx: number, wy: number, scale: number): boolean;
    dragTo(wx: number, wy: number): void;
    endDrag(): void;
    updateHover(wx: number, wy: number, scale: number): boolean;
    autoDrive(): void;
    readonly dragging: boolean;
  } | null;

  // windgraph Phase-7 3D graphing demo (true 3D mesh; see windgraph/space3d/demo.ts)
  graph3d: {
    cx: number; cy: number; readonly halfSpan: number;
    buildMesh(): { tris: Float32Array; lines: Float32Array };
  } | null;
  // 3D mesh renderer (companion pipeline sharing the depth buffer).
  meshRenderer: import('./windfoil/mesh3d').MeshRenderer | null;

  // windgraph Phase-6 math typesetting demo (world-space; see windgraph/math/demo.ts)
  mathDemo: { x0: number; y0: number; width: number; height: number; emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }): void } | null;

  // Perf isolation bench (world-space; see perf/bench.ts)
  bench: { x0: number; y0: number; width: number; height: number; mode: number; cycle(): void; emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }): void } | null;
}

export function createAppState(partial: Partial<AppState>): AppState {
  return {
    dpr: 1, PAGE_W: 1040,
    rCanvas: null as any, tCanvas: null as any, rCtx: null as any, gpuCtx: null as any,
    device: null as any, renderer: null, font: null as any, atlas: null,
    container: null as any,
    styledEls: [], pageRoots: [], editableEls: [], dynamicEls: [], marqueeEls: [], pages: [], docH: 0, docRoot: null as any,
    cssRules: [], isDark: false, themeMode: 'light', themeCol: {
      backdrop: [0,0,0,0], pageBg: [0,0,0,0], prog: [0,0,0,0], pulse: [0,0,0,0],
      shadow: [0,0,0,0], caret: [0,0,0,0], sel: [0,0,0,0],
    }, themeBtn: null, fpsEl: null as any,
    camX: 0, camY: 0, camZ: 0.5, viewX: 0, viewY: 0, viewZ: 0.5,
    tgtX: 0, tgtY: 0, tgtZ: 0.5, velX: 0, velY: 0,
    dragging: false, lastMoveT: 0, minZoom: 0.02,
    pointers: new Map(), mx: 0, my: 0, mwx: 0, mwy: 0, lastWheelT: 0, rightDown: false,
    cam3d: {
      active: false, exiting: false,
    },
    preCrv: [], preRws: [], preCrvLen: 0, preRwsLen: 0,
    highlightCache: new Map(),
    bgByPage: [], textByPage: [], pageVisible: [],
    baseCrv: [], baseRws: [], baseCrvLen: 0, baseRwsLen: 0,
    crvFA: new Float32Array(4096), rwsUA: new Uint32Array(1024), instFA: new Float32Array(16384),
    instJS: [], activeEdit: null, pressed: null, selecting: false,
    editor: null, editorMode: false, editorSelecting: false,
    terminal: null, terminalMode: false,
    fileTree: null, fileTreeMode: false,
    demo: null,
    windgraph: null,
    morphDemo: null,
    interactive: null,
    graph3d: null,
    mathDemo: null,
    bench: null,
    meshRenderer: null,
    ...partial,
  } as AppState;
}
