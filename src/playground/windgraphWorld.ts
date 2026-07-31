// ── windgraph world (sprint-v2, pre-CP2 demo space) ──────────────────────────
// A standalone infinite-canvas demo holding ONLY windgraph v2 scenes: authored
// SceneDocs resolved live (constraints + plots + param sliders). The playground
// keeps its own copy; this world is the dedicated home for the math.
//
//   · "triangle"  — the v1 Phase-5 interact demo, reborn authored (demoDoc)
//   · "geometry"  — the constraint catalog: intersections, perpendicular foot,
//                   reflection, parallel, glider, live angle + distance
//   · "plots"     — function/damped/rose/Lissajous/lemniscate/vector-field
//                   gallery with live sliders (petals, damping)
//
// The world itself implements the s.interactive board contract: pointer events
// route to whichever board sits under the pointer; everything else is canvas
// (pan/zoom). Backdrop = static masthead, tile-cached (per-plot grids live in
// each board's NumberPlane).

import type { Engine } from './engine';
import type { SceneDoc, Color } from '../authoring/ir/types';
import type { AppState } from '../state';
import { scene } from '../authoring/builder/scene';
import { isTilted, toggleTilt } from '../camera/camera';
import { orbitFrameRect } from '../camera/orbit';
import { createBaseApp, finishApp, snapTo, makeQualityPanel, qualityToolbarButton } from './app';
import { WindgraphSceneBoard, demoDoc } from './boards/windgraphScene';
import { WindgraphExtrudeBoard } from './boards/windgraphExtrude';
import { WindgraphCurve3DBoard } from './boards/windgraphCurve3d';
import { EmitCache } from '../windfoil/emitCache';
import { strokeInto } from '../windgraph/stroke/stroke';
import { layoutStr, tw } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';
import type { PlaneView } from '../windgraph/coords/numberPlane';
import type { GlyphAtlas } from '../windfoil/bands';
import { positionBoardPanel, panelHitXY } from './boards/sliderOverlay';

const BLUE: Color = [0.36, 0.62, 0.98, 1];
const GOLD: Color = [0.92, 0.74, 0.42, 1];
const TEAL: Color = [0.30, 0.85, 0.75, 1];
const PINK: Color = [0.94, 0.55, 0.75, 1];
const VIOLET: Color = [0.75, 0.62, 0.95, 1];

// ── scene docs ───────────────────────────────────────────────────────────────

/** Constraint catalog: two free lines meet at I; C drops a perpendicular foot
 *  onto l1, reflects across it, and a parallel rides through D; G glides l2. */
export function geometryDoc(): SceneDoc {
  return scene({ title: 'constraint geometry — drag anything' }, (s) => {
    s.wg.point('A', [-7, -2.5], { free: true, label: 'A' });
    s.wg.point('B', [3, 3.5], { free: true, label: 'B' });
    s.wg.point('C', [6, -3], { free: true, label: 'C' });
    s.wg.point('D', [-5, 4], { free: true, label: 'D' });
    s.wg.lineThrough('l1', 'A', 'B', { stroke: { color: BLUE, width: 2 } });
    s.wg.lineThrough('l2', 'C', 'D', { stroke: { color: TEAL, width: 2 } });
    s.wg.intersection('I', 'l1', 'l2', { label: 'I' });
    s.wg.perpendicular('perp', 'l1', 'C', { stroke: { color: GOLD, width: 1.6 } });
    s.wg.intersection('foot', 'l1', 'perp', { label: 'F', radius: 4 });
    s.wg.segment('drop', 'C', 'foot', { stroke: { color: GOLD, width: 1.6 } });
    s.wg.parallel('para', 'l1', 'D', { stroke: { color: PINK, width: 1.4 } });
    s.wg.reflection('Cr', 'C', 'l1', { label: "C'" });
    s.wg.glider('G', 'l2', 2, { label: 'G' });
    s.wg.distance('dCf', 'C', 'foot');
    s.wg.angle('ang', 'foot', 'I', 'D');
  });
}

/** Plot gallery on one plane — every curve analytic; rose + damping are
 *  slider-bound so the board breathes without being touched. */
export function plotsDoc(): SceneDoc {
  return scene({ title: 'plot gallery — every curve a closed form' }, (s) => {
    s.param.number('k', { default: 5, min: 1, max: 12, step: 1, label: 'petals' });
    s.param.number('damp', { default: 0.10, min: 0, max: 0.5, step: 0.01, label: 'damping' });
    s.wg.plotFn('sin', 'sin(x)', { domain: [-20, 20], stroke: { color: TEAL, width: 2.5 } });
    s.wg.plotFn('damped', 'sin(x)*exp(-damp*x^2)', { domain: [-20, 20], stroke: { color: GOLD, width: 2.5 } });
    s.wg.plotPolar('rose', '2.2*cos(k*t)', [0, 6.2832], { samples: 400, stroke: { color: PINK, width: 2 } });
    s.wg.plotParametric('liss', '4.5*sin(3*t)', '4.5*sin(2*t + 0.6)', [0, 6.2832], { samples: 400, stroke: { color: BLUE, width: 2 } });
    s.wg.plotImplicit('lemn', '(x^2+y^2)^2 - (x^2-y^2)', { stroke: { color: VIOLET, width: 2 } });
    s.wg.field('flow', 'vector', { x: '-y', y: 'x' }, { density: 0.5, color: [0.45, 0.55, 0.70, 0.5] });
  });
}

const GREEN: Color = [0.35, 0.80, 0.55, 1];
const RED: Color = [0.90, 0.45, 0.45, 1];
const ORANGE: Color = [0.95, 0.65, 0.30, 1];

/** Lane B geometry catalog: triangle centers, conics, inversion, n-gon. */
export function geometryCatalogDoc(): SceneDoc {
  return scene({ title: 'geometry catalog — centers, conics, inversion' }, (s) => {
    s.param.number('n', { default: 6, min: 3, max: 24, step: 1, label: 'polygon sides' });
    s.wg.point('A', [-4, -3], { free: true, label: 'A' });
    s.wg.point('B', [0, 4], { free: true, label: 'B' });
    s.wg.point('C', [5, -2], { free: true, label: 'C' });
    s.wg.polygon('tri', ['A', 'B', 'C'], { stroke: { color: BLUE, width: 2.5 } });
    s.wg.circumcircle('cc', 'A', 'B', 'C', { stroke: { color: GOLD, width: 1.6 } });
    s.wg.ninePoint('npc', 'A', 'B', 'C', { stroke: { color: ORANGE, width: 1.4 } });
    s.wg.incircle('inc', 'A', 'B', 'C', { stroke: { color: TEAL, width: 1.6 } });
    s.wg.circumcenter('O', 'A', 'B', 'C', { label: 'O', color: GOLD });
    s.wg.incenter('I', 'A', 'B', 'C', { label: 'I', color: TEAL });
    s.wg.orthocenter('H', 'A', 'B', 'C', { label: 'H', color: PINK });
    s.wg.point('F1', [-7, 2.5], { free: true, label: 'F₁' });
    s.wg.point('F2', [-3, 2.5], { free: true, label: 'F₂' });
    s.wg.conic('ell', 'ellipse', { foci: ['F1', 'F2'], stroke: { color: VIOLET, width: 2 } });
    s.wg.regularPolygon('ngon', [7.5, 0], { $param: 'n' }, 2.4, { stroke: { color: GREEN, width: 2 }, fill: [0.35, 0.80, 0.55, 0.12] });
    s.wg.length('len', 'A', 'B');
    s.wg.area('ar', ['A', 'B', 'C']);
  });
}

/** Lane C stats: distributions, CLT, random walks, Monte Carlo, correlation. */
export function statsDoc(): SceneDoc {
  return scene({ title: 'stats & probability — distributions, walks, regression' }, (s) => {
    s.param.number('mu', { default: 0, min: -3, max: 3, step: 0.1, label: 'μ' });
    s.param.number('sigma', { default: 1, min: 0.3, max: 3, step: 0.1, label: 'σ' });
    s.param.number('steps', { default: 24, min: 4, max: 120, step: 2, label: 'walk steps' });
    s.wg.distribution('norm', 'normal', { params: [{ $param: 'mu' }, { $param: 'sigma' }], showCdf: true, domain: [-6, 6], stroke: { color: BLUE, width: 2.5 } });
    s.wg.randomWalk('walk', 2, { $param: 'steps' }, { walks: 3, seed: 99, stroke: { color: GREEN, width: 1.6 } });
    s.wg.correlation('corr', { points: [[-3, -2.5], [-2, -1.2], [-1, -0.6], [0, 0.3], [1, 0.9], [2, 1.8], [3, 2.6], [2.5, 2.1], [-1.5, -1.0], [0.5, 0.1]], showRegression: true, color: GOLD, radius: 4, stroke: { color: RED, width: 2 } });
  });
}

/** Lane D linear algebra: matrix grid morph, determinant, eigenvectors, SVD. */
export function linalgDoc(): SceneDoc {
  return scene({ title: 'linear algebra — the 3b1b shot' }, (s) => {
    s.param.number('a', { default: 1, min: -3, max: 3, step: 0.1, label: 'a' });
    s.param.number('b', { default: 0, min: -3, max: 3, step: 0.1, label: 'b' });
    s.param.number('c', { default: 0, min: -3, max: 3, step: 0.1, label: 'c' });
    s.param.number('d', { default: 1, min: -3, max: 3, step: 0.1, label: 'd' });
    s.wg.matrixGrid('grid', [{ $param: 'a' }, { $param: 'b' }, { $param: 'c' }, { $param: 'd' }], { extent: 5, stroke: { color: BLUE, width: 1.5 } });
    s.wg.determinant('det', [{ $param: 'a' }, { $param: 'b' }, { $param: 'c' }, { $param: 'd' }], { fill: [0.36, 0.62, 0.98, 0.25], stroke: { color: GOLD, width: 2 } });
    s.wg.eigenvectors('eigen', [{ $param: 'a' }, { $param: 'b' }, { $param: 'c' }, { $param: 'd' }], { extent: 5, color: RED, stroke: { color: RED, width: 2.5 } });
    s.wg.dotProduct('dot', [3, 1], [1, 2], { color: TEAL, stroke: { color: TEAL, width: 2 } });
    s.wg.svd('svd', [{ $param: 'a' }, { $param: 'b' }, { $param: 'c' }, { $param: 'd' }], { extent: 3, stroke: { color: VIOLET, width: 2 } });
  });
}

/** Lane E graph theory: named graphs, traversal, MST, Eulerian paths. */
export function graphTheoryDoc(): SceneDoc {
  return scene({ title: 'graph theory — random graph + BFS traversal' }, (s) => {
    s.param.number('n', { default: 7, min: 3, max: 12, step: 1, label: 'nodes n' });
    s.param.number('p', { default: 0.45, min: 0.1, max: 0.9, step: 0.05, label: 'edge prob p' });
    s.wg.traversal('trav', 'random', 'bfs', { n: { $param: 'n' }, p: { $param: 'p' }, seed: 11, start: 0, layout: 'force', color: GOLD, radius: 6, stroke: { color: TEAL, width: 1.8 } });
  });
}

// ── world ────────────────────────────────────────────────────────────────────

const GAP = 500;

// A board the world hosts: the authored-scene boards + the Phase-2 extrude board
// + the analytic-3D curve board. All satisfy the s.interactive board contract
// (emit/sigFor/drag/hover/rev).
type WgBoard = WindgraphSceneBoard | WindgraphExtrudeBoard | WindgraphCurve3DBoard;

// Tilted 3/4 view for the continuous 2D↔3D toggle (radians from top-down).
const WG_TILT_POLAR = 0.9;

export class WindgraphWorld {
  readonly boards: WgBoard[];
  /** The analytic-3D board (D26) — space curves as watertight mesh tubes; its
   *  mesh is composed into `getMesh()` alongside the extrude board's walls. */
  readonly curve3d: WindgraphCurve3DBoard;
  readonly overview: { x: number; y: number; w: number; h: number };
  /** Huge culling bounds centered on the content — the canvas feels infinite. */
  x0 = 0; y0 = 0; width = 0; height = 0;
  /** Live perf readout (fed to the fps chip's 3rd mode via onDebug): section
   *  ms, instance delta, cumulative cache misses — climbing while idle = thrash. */
  debug = '';
  onDebug?: (line: string) => void;
  /** AppState ref (set on boot) so double-tap / the cube button can drive the
   *  shared orbit camera's continuous tilt (task 2.4). */
  app: AppState | null = null;

  private active: WgBoard | null = null;
  private backdropCache = new EmitCache();
  // Section timings are EMA-smoothed — single-frame snapshots at 120Hz are
  // noise-dominated (GC/scheduler) and mislead diagnosis.
  private ema = { total: 0, grid: 0, tri: 0, geom: 0, plots: 0, inst: 0, warm: false };

  constructor() {
    const tri = new WindgraphSceneBoard(demoDoc());
    tri.x0 = 0; tri.y0 = 200;
    const geom = new WindgraphSceneBoard(geometryDoc());
    geom.x0 = tri.width + GAP; geom.y0 = 200;
    const plots = new WindgraphSceneBoard(plotsDoc());
    plots.width = tri.width * 2 + GAP;
    plots.x0 = 0; plots.y0 = 200 + tri.height + GAP;
    const extrude = new WindgraphExtrudeBoard();
    extrude.x0 = 0; extrude.y0 = plots.y0 + plots.height + GAP;

    const HGAP = GAP * 2.4;
    const VGAP = GAP * 1.8;
    const catalogTop = extrude.y0 + extrude.height + GAP * 2.2;
    const geoCat = new WindgraphSceneBoard(geometryCatalogDoc());
    geoCat.x0 = 0; geoCat.y0 = catalogTop;
    const stats = new WindgraphSceneBoard(statsDoc());
    stats.x0 = geoCat.width + HGAP; stats.y0 = catalogTop;
    const linalg = new WindgraphSceneBoard(linalgDoc());
    linalg.x0 = 0; linalg.y0 = catalogTop + geoCat.height + VGAP;
    const graphTh = new WindgraphSceneBoard(graphTheoryDoc());
    graphTh.x0 = linalg.width + HGAP; graphTh.y0 = linalg.y0;
    const curve3d = new WindgraphCurve3DBoard();
    curve3d.x0 = 0; curve3d.y0 = graphTh.y0 + graphTh.height + VGAP;

    this.boards = [tri, geom, plots, extrude, geoCat, stats, linalg, graphTh, curve3d];
    this.curve3d = curve3d;

    const contentW = Math.max(tri.width * 2 + GAP, extrude.width, geoCat.width + HGAP + stats.width);
    const contentH = curve3d.y0 + curve3d.height;
    this.overview = { x: -60, y: -230, w: contentW + 120, h: contentH + 230 + 60 };
    const cx = contentW / 2, cy = contentH / 2, HALF = 30000;
    this.x0 = cx - HALF; this.y0 = cy - HALF;
    this.width = HALF * 2; this.height = HALF * 2;
  }

  // ── s.interactive contract (routes to the board under the pointer) ──────

  private boardAt(wx: number, wy: number): WgBoard | null {
    const m = 40;
    for (const b of this.boards) {
      if (wx >= b.x0 - m && wx <= b.x0 + b.width + m && wy >= b.y0 - m && wy <= b.y0 + b.height + m) return b;
    }
    return null;
  }

  tryBeginDrag(wx: number, wy: number, scale: number, sx?: number, sy?: number): boolean {
    // Slider panels: world-space objects hit-tested in doc coords (both modes).
    for (const b of this.boards) {
      positionBoardPanel(b, this.app);
      const [px, py] = panelHitXY(b, wx, wy);
      if (b.panel && b.panel.pointerDown(px, py)) { this.active = b; return true; }
    }
    const b = this.boardAt(wx, wy);
    if (!b) return false;
    if (!b.tryBeginDrag(wx, wy, scale, sx, sy)) return false; // board background → camera pan
    this.active = b;
    return true;
  }
  dragTo(wx: number, wy: number) { this.active?.dragTo(wx, wy); }
  endDrag() { this.active?.endDrag(); this.active = null; }
  get dragging(): boolean { return this.active?.dragging ?? false; }
  private hoverKey = '';
  private hoverRes = false;
  updateHover(wx: number, wy: number, scale: number, sx?: number, sy?: number): boolean {
    // frame.ts hit-tests every frame; while pointer + zoom + board revs are
    // unchanged the answer cannot change — skip the per-board walk.
    const key = `${wx}|${wy}|${Math.round(scale * 50)}|${sx ?? -1}|${sy ?? -1}|${this.boards.map((b) => b.rev).join(',')}`;
    if (key === this.hoverKey) return this.hoverRes;
    this.hoverKey = key;
    // Slider panels hover-test in doc coords (world-space objects in both modes).
    for (const b of this.boards) {
      positionBoardPanel(b, this.app);
      const [hx, hy] = panelHitXY(b, wx, wy);
      b.panel?.updateHover(hx, hy);
      if ((b.panel?.hovered ?? -1) >= 0) return (this.hoverRes = true);
    }
    const b = this.boardAt(wx, wy);
    this.hoverRes = b ? b.updateHover(wx, wy, scale, sx, sy) : false;
    return this.hoverRes;
  }
  /** Cinematic feed: the triangle board drives vertex B on a wall-clock path. */
  autoDrive() { this.boards[0].autoDrive(); }

  // ── continuous camera tilt (task 2.4) ───────────────────────────────────
  // One shared orbit camera for the whole world: double-tap (or the cube button)
  // glides between the flat 2D view and a tilted orbit with no snap — enterOrbit
  // is pixel-identical to 2D at top-down (OQ-9), then the library eases the polar.

  /** Target polar for the tilted 3/4 view (0 = top-down, π/2 = edge-on). */
  get tilted(): boolean { return !!this.app && isTilted(this.app); }
  toggleTilt() {
    const s = this.app;
    if (!s) return;
    toggleTilt(s, WG_TILT_POLAR);
  }
  /** Double-tap hook from input.ts: toggle the tilt; consume the gesture. */
  doubleTap(_wx: number, _wy: number): boolean {
    if (this.dragging) return false;
    this.toggleTilt();
    return true;
  }

  // ── emit ────────────────────────────────────────────────────────────────

  /** Backdrop cache key + quantized clip for a view (shared by frameSig/emit).
   *  The backdrop is just the static masthead now (the old toggleable grid was
   *  removed — the per-plot planes carry the grids). Its cache key quantizes the
   *  visible rect to a coarse TILE, so a pan/dolly replays the masthead until a
   *  tile boundary (a few times/sec, not per frame). */
  private backdropParts(view: PlaneView) {
    const sentinel = view.left < -1e11;
    // In 3D the visible ground rect can extend past the horizon (behind-camera
    // rays). Clamp to the content area so the masthead + board culling stay
    // bounded. In 2D the viewport is always finite; the sentinel fallback uses
    // the overview + margin.
    const oL = this.overview.x - 2000, oT = this.overview.y - 2000;
    const oR = this.overview.x + this.overview.w + 2000, oB = this.overview.y + this.overview.h + 2000;
    const is3d = sentinel || !!this.app?.cam3d.active;
    const vL = sentinel ? oL : is3d ? Math.max(view.left, oL) : view.left;
    const vT = sentinel ? oT : is3d ? Math.max(view.top, oT) : view.top;
    const vR = sentinel ? oR : is3d ? Math.min(view.right, oR) : view.right;
    const vB = sentinel ? oB : is3d ? Math.min(view.bottom, oB) : view.bottom;
    const TILE = 2400;
    const eL = Math.floor(vL / TILE) * TILE, eT = Math.floor(vT / TILE) * TILE;
    const eR = Math.ceil(vR / TILE) * TILE, eB = Math.ceil(vB / TILE) * TILE;
    return {
      sig: `m|${eL / TILE},${eT / TILE},${eR / TILE},${eB / TILE}`,
      eL, eT, eR, eB, vL, vT, vR, vB,
    };
  }

  /** Frame-skip signature: the frame loop compares this to decide whether the
   *  world would emit identically — if so it redraws persistent GPU buffers
   *  with zero JS emit / conversion / upload (a still scene costs ~nothing).
   *  Panel interaction state (open/hover/drag) is included so hover highlights
   *  and slider drags don't stall on skipped frames. */
  frameSig(view: PlaneView): string {
    const bp = this.backdropParts(view);
    let sig = bp.sig;
    for (const b of this.boards) {
      sig += '|';
      sig += (b.x0 <= bp.vR && b.x0 + b.width >= bp.vL && b.y0 <= bp.vB && b.y0 + b.height >= bp.vT)
        ? b.sigFor(view) : 'off';
      // Panel interaction state (uncached chrome in the world buffer).
      sig += b.panel ? `p${b.panel.open ? 1 : 0},${b.panel.hovered},${b.panel.isDragging ? 1 : 0}` : '';
    }
    return sig;
  }

  // Pre-allocated composition buffers. The world composes everything (grid +
  // every board's slice caches) into these WITHOUT growing them — V8 reallocs
  // on number[] `.length` growth were the entire drag cost (15 compositions ×
  // 3 arrays × realloc+copy + GC tail). One bulk-copy at the end appends to
  // the frame buffer (a single growth). The comp crv/rws carry a copy of the
  // frame buffer's atlas+static prefix so row/quad references stay valid; the
  // duplicate prefix is dead weight after the bulk-copy (negligible).
  private cInst: number[] = new Array(65536);
  private cCrv: number[] = new Array(65536);
  private cRws: number[] = new Array(65536);
  // Per-instance 3D transform comp buffer (D10): 8 floats/instance, parallel to
  // cInst. Boards that elevate content (the extrude board) write into it via
  // RenderCtx.xf; flat emitters leave zeros. Composed into xfBuf covering the
  // full frame instance count (prefix zeroed) and handed to the shader's fxXforms.
  private cXf: number[] = new Array(65536);
  private xfBuf = new Float32Array(65536);
  private xfLen = 0;
  private xfOn = false;

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    const t0 = performance.now();
    const inst0 = inst.length;
    const bp = this.backdropParts(view);
    const { eL, eT, eR, eB, vL, vT, vR, vB } = bp;

    // Seed comp crv/rws with the frame buffer's current prefix (atlas + static
    // + editor + …). The world's content composes after it. Comp inst starts
    // empty — instances carry rowBases, no prefix of their own.
    const cCrv = this.cCrv, cRws = this.cRws, cInst = this.cInst, cXf = this.cXf;
    const pCrvLen = crv.length, pRwsLen = rws.length;
    for (let i = 0; i < pCrvLen; i++) cCrv[i] = crv[i];
    for (let i = 0; i < pRwsLen; i++) cRws[i] = rws[i];
    let cILen = 0, cCLen = pCrvLen, cRLen = pRwsLen, cXfLen = 0;
    // strokeInto/layoutStr push to .length, so we set .length to the logical
    // offset before each build and read it back after.
    const setLen = (il: number, cl: number, rl: number) => { cInst.length = il; cCrv.length = cl; cRws.length = rl; cXf.length = cXfLen; };
    const readLen = () => { cILen = cInst.length; cCLen = cCrv.length; cRLen = cRws.length; cXfLen = cXf.length; };
    // Keep cXf aligned to cInst (8 floats/instance): flat emitters advance cInst
    // without touching cXf, so zero-pad the gap. Pre-allocated backing → no realloc.
    const padXf = () => { const need = (cInst.length >> 4) << 3; for (let i = cXf.length; i < need; i++) cXf[i] = 0; cXf.length = need; cXfLen = need; };

    const tg0 = performance.now();
    setLen(cILen, cCLen, cRLen);
    this.backdropCache.run(bp.sig, cInst, cCrv, cRws, () => {
      this.drawMasthead(font, atlas, cInst, cCrv, cRws, eL, eT, eR, eB);
    });
    readLen();
    padXf();
    const tGrid = performance.now() - tg0;

    // Boards compose into the same comp buffers (their caches see number[] and
    // behave identically; the pre-allocated backing means no reallocs).
    const tB: number[] = [];
    for (const b of this.boards) b.app = this.app;
    for (const b of this.boards) {
      const tb0 = performance.now();
      if (b.x0 <= vR && b.x0 + b.width >= vL && b.y0 <= vB && b.y0 + b.height >= vT) {
        setLen(cILen, cCLen, cRLen);
        (b as any).xfTarget = cXf;
        b.emit(font, atlas, cInst, cCrv, cRws, now, view);
        readLen();
        padXf();
      }
      tB.push(performance.now() - tb0);
    }

    // Bulk-copy the world content (after the seeded prefix) into the frame
    // buffer. The comp buffer's prefix is a verbatim copy of the frame buffer's
    // prefix, so the world's content lands at the same indices in both arrays —
    // row/quad references need NO adjustment (the earlier +rwsOff/+crvOff was
    // the "just gray" bug: it shifted every reference 5×/6× off).
    for (let i = pCrvLen; i < cCLen; i++) crv.push(cCrv[i]);
    for (let i = pRwsLen; i < cRLen; i += 5) {
      rws.push(cRws[i], cRws[i + 1], cRws[i + 2], cRws[i + 3], cRws[i + 4]);
    }
    for (let i = 0; i < cILen; i += 16) {
      inst.push(
        cInst[i], cInst[i + 1], cInst[i + 2], cInst[i + 3], cInst[i + 4], cInst[i + 5],
        cInst[i + 6], cInst[i + 7], cInst[i + 8], cInst[i + 9], cInst[i + 10], cInst[i + 11],
        cInst[i + 12], cInst[i + 13], cInst[i + 14], cInst[i + 15],
      );
    }

    // Compose the per-instance 3D buffer (D10): it must cover EVERY instance the
    // frame draws, so prefix instances (editor/static, before the world) get zeros
    // and the world's cXf lands at the prefix offset. frame.ts hands this to the
    // shader's fxXforms + sets fxActive only when something is actually elevated.
    const totalInst = (inst0 + cILen) >> 4;
    const need = totalInst << 3;
    if (this.xfBuf.length < need) this.xfBuf = new Float32Array(need * 2);
    this.xfBuf.fill(0, 0, need);
    const off = (inst0 >> 4) << 3;
    let any = false;
    for (let i = 0; i < cXfLen; i++) { const v = cXf[i]; this.xfBuf[off + i] = v; if (v !== 0) any = true; }
    this.xfOn = any;
    this.xfLen = need;

    const [tri, geom, plots] = this.boards;
    const e = this.ema, a = e.warm ? 0.08 : 1;
    e.warm = true;
    e.total += (performance.now() - t0 - e.total) * a;
    e.grid += (tGrid - e.grid) * a;
    e.tri += (tB[0] - e.tri) * a;
    e.geom += (tB[1] - e.geom) * a;
    e.plots += (tB[2] - e.plots) * a;
    e.inst += ((inst.length - inst0) / 16 - e.inst) * a;
    this.debug = `wg ${e.total.toFixed(2)}ms · inst ${Math.round(e.inst)}`
      + ` · grid ${e.grid.toFixed(2)} · tri ${e.tri.toFixed(2)} · geom ${e.geom.toFixed(2)} · plots ${e.plots.toFixed(2)}`
      + ` · miss g${this.backdropCache.misses} t${tri.cacheMisses}/${tri.directMisses} e${geom.cacheMisses} p${plots.cacheMisses}/${plots.directMisses}`;
    this.onDebug?.(this.debug);
  }

  /** Per-instance 3D transform buffer for the shader (D10), or null when nothing
   *  is elevated (frame.ts then leaves fxActive off). Sized to the full frame
   *  instance count at the last emit. */
  xfBuffer(): Float32Array | null {
    return this.xfOn ? this.xfBuf.subarray(0, this.xfLen) : null;
  }

  /** Depth-tested mesh of the extrude + curve3d boards, for frame.ts's mesh3d
   *  pass (drawn before the analytic pass so the solids are watertight at every
   *  angle and the analytic chrome/tops stay razor-sharp on top). */
  getMesh(): Float32Array | null {
    const extrude = this.boards[3] as WindgraphExtrudeBoard;
    const a = extrude.getMesh ? extrude.getMesh() : null;
    const b = this.curve3d.getMesh ? this.curve3d.getMesh() : null;
    if (a && b) {
      const out = new Float32Array(a.length + b.length);
      out.set(a, 0);
      out.set(b, a.length);
      return out;
    }
    return a ?? b;
  }

  /** Ground quad + content bounds of the extrude board, for the shadow pass. */
  getGround(): Float32Array | null {
    const b = this.boards[3] as WindgraphExtrudeBoard;
    return b.getGround ? b.getGround() : null;
  }
  getBounds() {
    const b = this.boards[3] as WindgraphExtrudeBoard;
    return b.getBounds ? b.getBounds() : null;
  }

  private drawMasthead(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], cL: number, cT: number, cR: number, cB: number) {
    if (0 > cR || 2600 < cL || -210 > cB || 20 < cT) return;
    const title = 'windgraph';
    const tSize = 96;
    const w = tw(title, font, tSize);
    layoutStr(inst, title, [0.93, 0.95, 0.98, 1], atlas.table, font, { x: 0, y: -190, size: tSize });
    strokeInto([[0, -78], [w, -78]], { width: 3 }, GOLD, inst, crv, rws);
    layoutStr(inst, 'analytic mathematics — alive, and sharp at any zoom', [0.58, 0.62, 0.70, 1], atlas.table, font, { x: 2, y: -52, size: 24 });
    layoutStr(inst, 'drag the points · scrub the sliders · scroll to zoom', [0.42, 0.46, 0.55, 1], atlas.table, font, { x: 2, y: -16, size: 16 });
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────

export function bootWindgraphWorld(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const world = new WindgraphWorld();
  world.app = s;
  world.onDebug = (line) => { s.hudDebugExtra = line; };
  s.interactive = world;
  const qualityPanel = makeQualityPanel(s, true);
  s.panel = qualityPanel;

  const frameRect = (x: number, y: number, w: number, h: number) => {
    if (s.cam3d.active) {
      // 2D targets are overwritten by the 3D sync every frame, so frame via the
      // orbit camera (same fit margin as 2D, preserving the current tilt).
      orbitFrameRect(x, y, x + w, y + h, s.tCanvas.width, s.tCanvas.height);
      return;
    }
    const z = Math.min((s.tCanvas.width / (w + 240)) * 0.9, (s.tCanvas.height / (h + 240)) * 0.9);
    s.tgtX = x + w / 2; s.tgtY = y + h / 2; s.tgtZ = z;
    s.velX = s.velY = 0;
  };
  const ov = world.overview;
  snapTo(s, ov.x + ov.w / 2, ov.y + ov.h / 2,
    Math.min((s.tCanvas.width / (ov.w + 240)) * 0.9, (s.tCanvas.height / (ov.h + 240)) * 0.9));

  const dispose = finishApp(s, onBack, [
    { id: 'cam3d', icon: 'cube', title: 'Toggle continuous 2D↔3D tilt (or double-tap the canvas)', active: () => world.tilted, onClick: () => world.toggleTilt() },
    qualityToolbarButton(s, qualityPanel),
    { id: 'overview', icon: 'compass', title: 'Frame all boards', onClick: () => frameRect(ov.x, ov.y, ov.w, ov.h) },
    { id: 'wg-tri', icon: 'triangle', title: 'Interactive triangle: centroid, circumcircle, glider, measures — plus a slider-bound wave', onClick: () => { const b = world.boards[0]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-geom', icon: 'ruler', title: 'Constraint geometry: intersection, perpendicular foot, reflection, parallel, glider — all live', onClick: () => { const b = world.boards[1]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-plots', icon: 'chart', title: 'Plot gallery: functions, rose (petals slider), Lissajous, lemniscate, vector field', onClick: () => { const b = world.boards[2]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-extrude', icon: 'morph', title: 'Continuous 2D↔3D: extrude the prism + cylinder on a slider, rising glyphs, contact shadows — double-tap to tilt', onClick: () => { const b = world.boards[3]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-curve3d', icon: 'chart', title: '3D space curves: torus knot + helix as watertight Gouraud mesh tubes — solid and stable at any orbit, flat analytic labels on top', onClick: () => { const b = world.curve3d; frameRect(b.x0, b.y0, b.width, b.height); } },
  ]);
  return dispose;
}
