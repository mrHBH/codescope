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
import { createBaseApp, finishApp, snapTo } from './app';
import { WindgraphSceneBoard, demoDoc } from './boards/windgraphScene';
import { EmitCache } from '../windfoil/emitCache';
import { strokeInto } from '../windgraph/stroke/stroke';
import { layoutStr, tw, addRect } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';
import type { PlaneView } from '../windgraph/coords/numberPlane';

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

// ── world ────────────────────────────────────────────────────────────────────

const GAP = 140;
const TILE = 800;

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

  private active: WindgraphSceneBoard | null = null;
  private backdropCache = new EmitCache();

  constructor() {
    const tri = new WindgraphSceneBoard(demoDoc());
    tri.x0 = 0; tri.y0 = 300;
    const geom = new WindgraphSceneBoard(geometryDoc());
    geom.x0 = tri.width + GAP; geom.y0 = 300;
    const plots = new WindgraphSceneBoard(plotsDoc());
    plots.width = tri.width * 2 + GAP;
    plots.x0 = 0; plots.y0 = 300 + tri.height + GAP;
    this.boards = [tri, geom, plots];

    const contentW = tri.width * 2 + GAP;
    const contentH = plots.y0 + plots.height;
    this.overview = { x: -80, y: -250, w: contentW + 160, h: contentH + 250 + 80 };
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
  updateHover(wx: number, wy: number, scale: number): boolean {
    const b = this.boardAt(wx, wy);
    return b ? b.updateHover(wx, wy, scale) : false;
  }
  /** Cinematic feed: the triangle board drives vertex B on a wall-clock path. */
  autoDrive() { this.boards[0].autoDrive(); }

  // ── emit ────────────────────────────────────────────────────────────────

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    const z = Math.max(view.zoom, 1e-4);
    const sentinel = view.left < -1e11;
    const vL = sentinel ? this.overview.x - 2000 : view.left;
    const vT = sentinel ? this.overview.y - 2000 : view.top;
    const vR = sentinel ? this.overview.x + this.overview.w + 2000 : view.right;
    const vB = sentinel ? this.overview.y + this.overview.h + 2000 : view.bottom;

    // Backdrop (LOD dot grid + masthead), cached per quantized view tile.
    const eL = Math.floor(vL / TILE) * TILE, eT = Math.floor(vT / TILE) * TILE;
    const eR = Math.ceil(vR / TILE) * TILE, eB = Math.ceil(vB / TILE) * TILE;
    this.backdropCache.run(`g|${z.toPrecision(4)}|${eL},${eT},${eR},${eB}`, inst, crv, rws, () => {
      const step = niceStep(44 / z);
      const x0 = Math.ceil(eL / step) * step, y0 = Math.ceil(eT / step) * step;
      let i = 0;
      for (let x = x0; x <= eR; x += step, i++) {
        let j = 0;
        for (let y = y0; y <= eB; y += step, j++) {
          const major = i % 5 === 0 && j % 5 === 0;
          const r = major ? 3.2 : 2.0;
          addRect(x - r, y - r, x + r, y + r, [1, 1, 1, major ? 0.10 : 0.045], crv, rws, inst);
        }
      }
      this.drawMasthead(font, atlas, inst, crv, rws, eL, eT, eR, eB);
    });

    // Boards (each carries its own rev/hover/tile cache).
    for (const b of this.boards) {
      if (b.x0 <= vR && b.x0 + b.width >= vL && b.y0 <= vB && b.y0 + b.height >= vT) {
        b.emit(font, atlas, inst, crv, rws, now, view);
      }
    }
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
  s.interactive = world;

  const frameRect = (x: number, y: number, w: number, h: number) => {
    const z = Math.min((s.tCanvas.width / (w + 240)) * 0.9, (s.tCanvas.height / (h + 240)) * 0.9);
    s.tgtX = x + w / 2; s.tgtY = y + h / 2; s.tgtZ = z;
    s.velX = s.velY = 0;
  };
  const ov = world.overview;
  snapTo(s, ov.x + ov.w / 2, ov.y + ov.h / 2,
    Math.min((s.tCanvas.width / (ov.w + 240)) * 0.9, (s.tCanvas.height / (ov.h + 240)) * 0.9));

  return finishApp(s, onBack, [
    { id: 'overview', icon: 'compass', title: 'Frame all boards', onClick: () => frameRect(ov.x, ov.y, ov.w, ov.h) },
    { id: 'wg-tri', icon: 'triangle', title: 'Interactive triangle: centroid, circumcircle, glider, measures — plus a slider-bound wave', onClick: () => { const b = world.boards[0]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-geom', icon: 'ruler', title: 'Constraint geometry: intersection, perpendicular foot, reflection, parallel, glider — all live', onClick: () => { const b = world.boards[1]; frameRect(b.x0, b.y0, b.width, b.height); } },
    { id: 'wg-plots', icon: 'chart', title: 'Plot gallery: functions, rose (petals slider), Lissajous, lemniscate, vector field', onClick: () => { const b = world.boards[2]; frameRect(b.x0, b.y0, b.width, b.height); } },
  ]);
}
