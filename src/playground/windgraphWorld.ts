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
// (pan/zoom). Backdrop = LOD dot grid + masthead, tile-cached.

import type { Engine } from './engine';
import type { SceneDoc, Color } from '../authoring/ir/types';
import { scene } from '../authoring/builder/scene';
import { toggle3D } from '../camera/camera';
import { createBaseApp, finishApp, snapTo } from './app';
import { WindgraphSceneBoard, demoDoc } from './boards/windgraphScene';
import { EmitCache } from '../windfoil/emitCache';
import { strokeInto } from '../windgraph/stroke/stroke';
import { layoutStr, tw } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';
import type { PlaneView } from '../windgraph/coords/numberPlane';

const BLUE: Color = [0.36, 0.62, 0.98, 1];
const GOLD: Color = [0.92, 0.74, 0.42, 1];
const TEAL: Color = [0.30, 0.85, 0.75, 1];
const PINK: Color = [0.94, 0.55, 0.75, 1];
const VIOLET: Color = [0.75, 0.62, 0.95, 1];
const GRID_MINOR: Color = [1, 1, 1, 0.05];
const GRID_MAJOR: Color = [1, 1, 1, 0.11];

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

// ── world ────────────────────────────────────────────────────────────────────

const GAP = 500;

function niceStep(rough: number): number {
  if (!(rough > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export class WindgraphWorld {
  readonly boards: WindgraphSceneBoard[];
  readonly overview: { x: number; y: number; w: number; h: number };
  /** Huge culling bounds centered on the content — the canvas feels infinite. */
  x0 = 0; y0 = 0; width = 0; height = 0;
  /** Dot-grid backdrop on/off (toolbar toggle; masthead always stays). */
  showGrid = true;
  /** Live perf readout (fed to the fps chip's 3rd mode via onDebug): section
   *  ms, instance delta, cumulative cache misses — climbing while idle = thrash. */
  debug = '';
  onDebug?: (line: string) => void;

  private active: WindgraphSceneBoard | null = null;
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
    this.boards = [tri, geom, plots];

    const contentW = tri.width * 2 + GAP;
    const contentH = plots.y0 + plots.height;
    this.overview = { x: -60, y: -230, w: contentW + 120, h: contentH + 230 + 60 };
    const cx = contentW / 2, cy = contentH / 2, HALF = 30000;
    this.x0 = cx - HALF; this.y0 = cy - HALF;
    this.width = HALF * 2; this.height = HALF * 2;
  }

  // ── s.interactive contract (routes to the board under the pointer) ──────

  private boardAt(wx: number, wy: number): WindgraphSceneBoard | null {
    const m = 40;
    for (const b of this.boards) {
      if (wx >= b.x0 - m && wx <= b.x0 + b.width + m && wy >= b.y0 - m && wy <= b.y0 + b.height + m) return b;
    }
    return null;
  }

  tryBeginDrag(wx: number, wy: number, scale: number): boolean {
    const b = this.boardAt(wx, wy);
    if (!b) return false;
    if (!b.tryBeginDrag(wx, wy, scale)) return false; // board background → camera pan
    this.active = b;
    return true;
  }
  dragTo(wx: number, wy: number) { this.active?.dragTo(wx, wy); }
  endDrag() { this.active?.endDrag(); this.active = null; }
  get dragging(): boolean { return this.active?.dragging ?? false; }
  private hoverKey = '';
  private hoverRes = false;
  updateHover(wx: number, wy: number, scale: number): boolean {
    // frame.ts hit-tests every frame; while pointer + zoom + board revs are
    // unchanged the answer cannot change — skip the per-board walk.
    const key = `${wx}|${wy}|${Math.round(scale * 50)}|${this.boards[0].rev},${this.boards[1].rev},${this.boards[2].rev}`;
    if (key === this.hoverKey) return this.hoverRes;
    this.hoverKey = key;
    const b = this.boardAt(wx, wy);
    this.hoverRes = b ? b.updateHover(wx, wy, scale) : false;
    return this.hoverRes;
  }
  /** Cinematic feed: the triangle board drives vertex B on a wall-clock path. */
  autoDrive() { this.boards[0].autoDrive(); }

  // ── emit ────────────────────────────────────────────────────────────────

  /** Backdrop cache key + quantized clip for a view (shared by frameSig/emit). */
  private backdropParts(view: PlaneView) {
    const z = Math.max(view.zoom, 1e-4);
    const sentinel = view.left < -1e11;
    const vL = sentinel ? this.overview.x - 2000 : view.left;
    const vT = sentinel ? this.overview.y - 2000 : view.top;
    const vR = sentinel ? this.overview.x + this.overview.w + 2000 : view.right;
    const vB = sentinel ? this.overview.y + this.overview.h + 2000 : view.bottom;
    // Line grid: screen spacing ~140-280px, cached over the view + a 3-step
    // margin quantized to the step itself — bounded line count at every zoom,
    // and the key never contains raw zoom (niceStep is a step-function of it).
    const step = niceStep(140 / z);
    const mgn = step * 3;
    const eL = Math.floor((vL - mgn) / step) * step, eT = Math.floor((vT - mgn) / step) * step;
    const eR = Math.ceil((vR + mgn) / step) * step, eB = Math.ceil((vB + mgn) / step) * step;
    return { sig: `g|${this.showGrid ? 1 : 0}|${step}|${eL},${eT},${eR},${eB}`, step, eL, eT, eR, eB, vL, vT, vR, vB };
  }

  /** Frame-skip signature: the frame loop compares this to decide whether the
   *  world would emit identically — if so it redraws persistent GPU buffers
   *  with zero JS emit / conversion / upload (a still scene costs ~nothing). */
  frameSig(view: PlaneView): string {
    const bp = this.backdropParts(view);
    let sig = bp.sig;
    for (const b of this.boards) {
      sig += '|';
      sig += (b.x0 <= bp.vR && b.x0 + b.width >= bp.vL && b.y0 <= bp.vB && b.y0 + b.height >= bp.vT)
        ? b.sigFor(view) : 'off';
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

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    const t0 = performance.now();
    const inst0 = inst.length;
    const bp = this.backdropParts(view);
    const { step, eL, eT, eR, eB, vL, vT, vR, vB } = bp;

    // Seed comp crv/rws with the frame buffer's current prefix (atlas + static
    // + editor + …). The world's content composes after it. Comp inst starts
    // empty — instances carry rowBases, no prefix of their own.
    const cCrv = this.cCrv, cRws = this.cRws, cInst = this.cInst;
    const pCrvLen = crv.length, pRwsLen = rws.length;
    for (let i = 0; i < pCrvLen; i++) cCrv[i] = crv[i];
    for (let i = 0; i < pRwsLen; i++) cRws[i] = rws[i];
    let cILen = 0, cCLen = pCrvLen, cRLen = pRwsLen;
    // strokeInto/layoutStr push to .length, so we set .length to the logical
    // offset before each build and read it back after.
    const setLen = (il: number, cl: number, rl: number) => { cInst.length = il; cCrv.length = cl; cRws.length = rl; };
    const readLen = () => { cILen = cInst.length; cCLen = cCrv.length; cRLen = cRws.length; };

    const tg0 = performance.now();
    setLen(cILen, cCLen, cRLen);
    this.backdropCache.run(bp.sig, cInst, cCrv, cRws, () => {
      if (this.showGrid) {
        // True line grid — and cheaper than dots: a full-length line is ONE
        // stroke instance, vs one instance per dot. Widths derive from `step`
        // so they stay constant within a cache band (~1 / ~1.8 screen px).
        const wMinor = step / 140, wMajor = step / 80;
        let i = 0;
        for (let x = eL; x <= eR; x += step, i++) {
          const major = ((i % 5) + 5) % 5 === 0;
          strokeInto([[x, eT], [x, eB]], { width: major ? wMajor : wMinor },
            major ? GRID_MAJOR : GRID_MINOR, cInst, cCrv, cRws);
        }
        let j = 0;
        for (let y = eT; y <= eB; y += step, j++) {
          const major = ((j % 5) + 5) % 5 === 0;
          strokeInto([[eL, y], [eR, y]], { width: major ? wMajor : wMinor },
            major ? GRID_MAJOR : GRID_MINOR, cInst, cCrv, cRws);
        }
      }
      this.drawMasthead(font, atlas, cInst, cCrv, cRws, eL, eT, eR, eB);
    });
    readLen();
    const tGrid = performance.now() - tg0;

    // Boards compose into the same comp buffers (their caches see number[] and
    // behave identically; the pre-allocated backing means no reallocs).
    const tB: number[] = [];
    for (const b of this.boards) {
      const tb0 = performance.now();
      if (b.x0 <= vR && b.x0 + b.width >= vL && b.y0 <= vB && b.y0 + b.height >= vT) {
        setLen(cILen, cCLen, cRLen);
        b.emit(font, atlas, cInst, cCrv, cRws, now, view);
        readLen();
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
  world.onDebug = (line) => { s.hudDebugExtra = line; };
  s.interactive = world;

  const frameRect = (x: number, y: number, w: number, h: number) => {
    const z = Math.min((s.tCanvas.width / (w + 240)) * 0.9, (s.tCanvas.height / (h + 240)) * 0.9);
    s.tgtX = x + w / 2; s.tgtY = y + h / 2; s.tgtZ = z;
    s.velX = s.velY = 0;
  };
  const ov = world.overview;
  snapTo(s, ov.x + ov.w / 2, ov.y + ov.h / 2,
    Math.min((s.tCanvas.width / (ov.w + 240)) * 0.9, (s.tCanvas.height / (ov.h + 240)) * 0.9));

  const dispose = finishApp(s, onBack, [
    { id: 'cam3d', icon: 'cube', title: 'Toggle 3D free camera (drag = orbit, Shift+drag = pan, wheel = dolly)', active: () => s.cam3d.active, onClick: () => toggle3D(s) },
    { id: 'grid', icon: 'grid', title: 'Toggle dot grid', active: () => world.showGrid, onClick: () => { world.showGrid = !world.showGrid; } },
    { id: 'overview', icon: 'compass', title: 'Frame all boards', onClick: () => frameRect(ov.x, ov.y, ov.w, ov.h) },
    { id: 'wg-tri', icon: 'triangle', title: 'Interactive triangle: centroid, circumcircle, glider, measures — plus a slider-bound wave', onClick: () => { const b = world.boards[0]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-geom', icon: 'ruler', title: 'Constraint geometry: intersection, perpendicular foot, reflection, parallel, glider — all live', onClick: () => { const b = world.boards[1]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-plots', icon: 'chart', title: 'Plot gallery: functions, rose (petals slider), Lissajous, lemniscate, vector field', onClick: () => { const b = world.boards[2]; frameRect(b.x0, b.y0, b.width, b.height); } },
  ]);
  return dispose;
}
