// ── App state ───────────────────────────────────────────────────────────────
// Single mutable container holding every piece of runtime state. Modules
// (camera, input, frame) receive this object rather than reaching into a
// tangle of closure variables, which keeps main.ts a thin wiring layer.

import type { FontFace } from './windfoil/font';
import type { GlyphAtlas } from './windfoil/bands';
import type { GlyphRenderer } from './windfoil/gpu';
import type { StyledEl, PageRect, Seg } from './layout/types';
import type { CodeEditor } from './editor/editor';
import type { Terminal } from './editor/terminal';
import type { FileTree } from './editor/fileTree';
import type { AnalyticContextMenu } from './ui/analyticMenu';

export interface ThemeCol {
  backdrop: number[]; pageBg: number[]; prog: number[]; pulse: number[];
  shadow: number[]; caret: number[]; sel: number[];
  accent: number[]; accentHover: number[];
}

export interface BoardView { zoom: number; left: number; right: number; top: number; bottom: number; }

export interface Board {
  x0: number; y0: number; width: number; height: number;
  emit(font: FontFace, atlas: GlyphAtlas, inst: number[], crv: number[], rws: number[], now: number, view: BoardView, camX?: number, camY?: number): void;
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
  renderer: GlyphRenderer;
  /** 1× renderers (engine originals) — the AA toggle swaps `renderer`/
   *  `meshRenderer` to the lazily-created MSAA variants and back. */
  rendererBase: GlyphRenderer;
  meshRendererBase: any;
  rendererMsaa: GlyphRenderer | null;
  meshRendererMsaa: any;
  shaderCode: string;
  font: FontFace;
  atlas: GlyphAtlas;
  // Internal render-resolution multiplier on top of dpr (default 1). The perf
  // benchmark drops this for its low-resolution comparison phases; setSize reads
  // it when sizing the canvas backing store.
  renderScale: number;
  /** Last frame's `cam3d.active` — frame.ts hooks the 2D↔3D transition to
   *  auto-enable MSAA on entering 3D (default on) and disable it in 2D. */
  lastCam3d: boolean;
  // Low-res-render + sharpen-upscale pipeline (see windfoil/upscale.ts). When
  // `lowResSharpen` is on, the analytic coverage pass renders into an offscreen
  // texture at `integralScale` × the swapchain size, then a contrast-adaptive
  // sharpen upscales it to full resolution — cheap fill-rate, crisp display.
  upscaler: import('./windfoil/upscale').Upscaler | null;
  lowResSharpen: boolean;
  integralScale: number;
  sharpenAmount: number;
  // Cinematic post-process (vignette + analytic splash). When non-null, frame.ts
  // renders the coverage pass into its offscreen target and resolves it to the
  // swapchain through the postfx fragment shader (see windfoil/postfx.ts).
  postfx: import('./windfoil/postfx').PostFx | null;
  // Dedicated glyph renderer for the DOM-free screen-space HUD overlay (only the
  // cinematic sets it; see frame.ts). Owns separate storage buffers so its draw
  // never aliases the scene draw in the same command buffer.
  hudRenderer: GlyphRenderer | null;
  // Reusable screen-space HUD overlay (toolbar + menus + panels + readouts), drawn
  // through its own renderer with a screen-ortho matrix so chrome stays fixed to
  // the screen. The playground sets it and registers ScreenHud.onBuild; frame.ts
  // calls frame() once per pass after the world draw (see ui/screenHud.ts).
  screenHud: import('./ui/screenHud').ScreenHud | null;
  // Analytic toolbar (screen-space button bar) rendered through screenHud. frame.ts
  // lays it out + hover-tests it; input.ts routes clicks (see ui/analyticToolbar.ts).
  toolbar: import('./ui/analyticToolbar').AnalyticToolbar | null;
  // Analytic settings panel (screen-space sliders/toggles) rendered through
  // screenHud; input.ts routes its clicks + slider drags (see ui/analyticPanel.ts).
  panel: import('./ui/analyticPanel').AnalyticPanel | null;
  // 3D-extrusion quality dials (windgraph moat, Phase 2). `meshSmooth` = Gouraud the
  // round extruded walls (cylinder + glyph sides) instead of flat facets. `meshAA` =
  // MSAA 4× (the anti-aliasing toggle — default ON in 3D, see frame.ts's cam3d
  // transition hook). Shadows were removed (2026-07-31, user). meshSmooth defaults
  // on (facets were the complaint); meshAA defaults off until a 3D camera is entered.
  meshSmooth: boolean;
  meshAA: boolean;
  // Per-frame debug readout (fps · zoom · js · worst · ev) written by the frame
  // loop; the cinematic HUD draws it analytically (the DOM #fps is hidden there).
  hudDebugText: string;
  /** Analytic fps/perf chip (screen HUD) — zero-DOM replacement for #fps.
   *  Click cycles fps → full → full+diagnostics; long press copies. */
  fpsChip: import('./ui/fpsChip').FpsChip | null;
  /** Extra diagnostic line the active demo feeds the chip's third mode. */
  hudDebugExtra: string;
  /** Bumped whenever buildStatic re-bakes (theme/resize) — frame-skip key. */
  staticRev: number;
  /** Bumped when the main instance buffers get new content — tells the glyph
   *  renderer whether it can redraw from its persistent GPU buffers. */
  frameDataVersion: number;

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
  // Pointer-move instrumentation (perf): raw dispatched events, coalesced native
  // events, and accumulated ms spent inside the single consolidated pointermove
  // handler — all reset each HUD/benchmark sample. Lets us tell browser event
  // dispatch cost apart from a GPU/compositor stall while moving the mouse.
  evCount: number;
  evCoalesced: number;
  evHandlerMs: number;
  // Input kill-switches (toolbar toggles, mainly for perf isolation): when
  // pointerInput is off, pointer handlers + hover work are skipped entirely;
  // when cameraInput is off, drag-pan and wheel-zoom don't move the camera.
  pointerInput: boolean;
  cameraInput: boolean;

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
  staticCrv: number[]; staticRws: number[];
  staticCrvLen: number; staticRwsLen: number;
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

  // GPU-rendered context menu (shared between input.ts and frame.ts)
  analyticMenu: AnalyticContextMenu | null;
  // World-space peel pose for the context menu in 3D (mirrors the IDE): when set,
  // frame.ts emits the menu into the world buffer so it pans/zooms with the
  // document; null = plain screen overlay (2D).
  menuWorldPose: { pose: import('./camera/screenWorld').ScreenPose; Wv: number; Hv: number } | null;

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

  // cinematic demo flight (optional controller; see playground/cinematic.ts)
  demo: {
    running: boolean; playing?: boolean;
    toggle(): void; start(): void; stop(): void; update(now: number): void;
    renderHud?(out: { inst: number[]; crv: number[]; rws: number[] }, Cw: number, Ch: number, now: number): void;
  } | null;

  // windgraph Phase-0/1/2 demo (world-space board; see windgraph/demo.ts)
  windgraph: Board | null;

  // windgraph Phase-4 animation demo (world-space board; see windgraph/anim/demo.ts)
  morphDemo: Board | null;

  // windgraph Phase-5 interactivity demo (world-space, draggable; see windgraph/interact/demo.ts)
  interactive: (Board & {
    tryBeginDrag(wx: number, wy: number, scale: number, sx?: number, sy?: number): boolean;
    dragTo(wx: number, wy: number): void;
    endDrag(): void;
    updateHover(wx: number, wy: number, scale: number, sx?: number, sy?: number): boolean;
    autoDrive(): void;
    readonly dragging: boolean;
    /** Screen-space slider chrome signature (positions panels; cheap, every frame). */
    screenChromeSig?(s: AppState): string;
    /** Render screen-space slider chrome into the HUD overlay buffers. */
    renderScreenChrome?(s: AppState, hud: { inst: number[]; crv: number[]; rws: number[] }, font: FontFace, atlas: GlyphAtlas): void;
  }) | null;

  // windgraph Phase-7 3D graphing demo (true 3D mesh; see windgraph/space3d/demo.ts)
  graph3d: {
    cx: number; cy: number; readonly halfSpan: number;
    buildMesh(): { tris: Float32Array; lines: Float32Array };
  } | null;
  // 3D mesh renderer (companion pipeline sharing the depth buffer).
  meshRenderer: import('./windfoil/mesh3d').MeshRenderer | null;

  // windgraph Phase-6 math typesetting demo (world-space; see windgraph/math/demo.ts)
  mathDemo: Board | null;

  // Perf isolation bench (world-space; see playground/bench.ts)
  bench: (Board & { mode: number; cycle(): void }) | null;

  // Scripted performance benchmark (camera script + metrics + results board;
  // see playground/benchmark.ts). Driven from the frame loop like the demo
  // flight. Typed structurally so the engine/substrate never imports the
  // playground (keeps the showcase → engine dependency one-directional).
  perf: {
    x0: number; y0: number; width: number; height: number;
    running: boolean; showResults: boolean; version: number;
    copyVisible: boolean; copyLabel: string;
    copyRect: { x0: number; y0: number; x1: number; y1: number } | null;
    toggle(): void; status(): string; update(now: number): void; copy(): void;
    sample(dt: number, jsMs: number, instCount: number, seg?: Record<string, number> | null, ev?: number, evCoal?: number, evMs?: number): void;
    emit(font: FontFace, atlas: GlyphAtlas, inst: number[], crv: number[], rws: number[]): void;
  } | null;
}

export function createAppState(partial: Partial<AppState>): AppState {
  return {
    dpr: 1, PAGE_W: 1040,
    rCanvas: null as any, tCanvas: null as any, rCtx: null as any, gpuCtx: null as any,
    device: null as any, renderer: null, rendererBase: null as any, meshRendererBase: null as any,
    rendererMsaa: null, meshRendererMsaa: null, shaderCode: '',
    font: null as any, atlas: null,
    renderScale: 1, lastCam3d: false,
    upscaler: null, lowResSharpen: false, integralScale: 0.6, sharpenAmount: 0.6,
    postfx: null, hudRenderer: null, screenHud: null, toolbar: null, panel: null, hudDebugText: '',
    meshAA: false, meshSmooth: true,
    fpsChip: null, hudDebugExtra: '', staticRev: 0, frameDataVersion: 0,
    container: null as any,
    styledEls: [], pageRoots: [], editableEls: [], dynamicEls: [], marqueeEls: [], pages: [], docH: 0, docRoot: null as any,
    cssRules: [], isDark: false, themeMode: 'light', themeCol: {
      backdrop: [0,0,0,0], pageBg: [0,0,0,0], prog: [0,0,0,0], pulse: [0,0,0,0],
      shadow: [0,0,0,0], caret: [0,0,0,0], sel: [0,0,0,0],
      accent: [0,0,0,0], accentHover: [0,0,0,0],
    }, themeBtn: null, fpsEl: null as any,
    camX: 0, camY: 0, camZ: 0.5, viewX: 0, viewY: 0, viewZ: 0.5,
    tgtX: 0, tgtY: 0, tgtZ: 0.5, velX: 0, velY: 0,
    dragging: false, lastMoveT: 0, minZoom: 0.02,
    pointers: new Map(), mx: 0, my: 0, mwx: 0, mwy: 0, lastWheelT: 0, rightDown: false,
    evCount: 0, evCoalesced: 0, evHandlerMs: 0,
    pointerInput: true, cameraInput: true,
    cam3d: {
      active: false, exiting: false,
    },
    preCrv: [], preRws: [], preCrvLen: 0, preRwsLen: 0,
    staticCrv: [], staticRws: [], staticCrvLen: 0, staticRwsLen: 0,
    highlightCache: new Map(),
    bgByPage: [], textByPage: [], pageVisible: [],
    baseCrv: [], baseRws: [], baseCrvLen: 0, baseRwsLen: 0,
    crvFA: new Float32Array(4096), rwsUA: new Uint32Array(1024), instFA: new Float32Array(16384),
    instJS: [], activeEdit: null, pressed: null, selecting: false,
    analyticMenu: null,
    menuWorldPose: null,
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
    perf: null,
    meshRenderer: null,
    ...partial,
  } as AppState;
}
