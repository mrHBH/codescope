// ── windgraph v2 · authored scene board (sprint-v2 Phase 1.4) ────────────────
// The windgraph board adapter: hosts a WgScene resolved from an AUTHORED
// SceneDoc (built with the SceneBuilder — see demoDoc below). Implements the
// s.interactive board contract (same slot as the v1 Phase-5 InteractDemo, which
// this supersedes: same triangle, now authored + param-bound + plot-bearing).
// Emit is cached on (scene rev, hover id, quantized view) — drag/param changes
// bump rev; panning replays the cache within a tile.

import { scene } from '../../authoring/builder/scene';
import type { SceneDoc, Color } from '../../authoring/ir/types';
import { validateSceneDoc } from '../../authoring/ir/validate';
import { emitTS } from '../../authoring/emitTS';
import { WgScene } from '../../authoring/runtime/object-resolver';
import { NumberPlane, type PlaneView } from '../../windgraph/coords/numberPlane';
import { EmitCache } from '../../windfoil/emitCache';
import { strokeInto, fillQuads, circleQuads } from '../../windgraph/stroke/stroke';
import { layoutStr } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

const BLUE: Color = [0.36, 0.62, 0.98, 1];
const GOLD: Color = [0.92, 0.74, 0.42, 1];
const TEAL: Color = [0.30, 0.85, 0.75, 1];
const PINK: Color = [0.94, 0.55, 0.75, 1];
const BORDER: Color = [0.25, 0.26, 0.30, 1];
const TITLE: Color = [0.60, 0.64, 0.74, 1];

/** The CP2 demo scene: an authored triangle kit + a param-bound plot. */
export function demoDoc(): SceneDoc {
  return scene({ title: 'windgraph v2 · authored scene' }, (s) => {
    s.param.number('a', { default: 1.2, min: 0.2, max: 3, step: 0.05, label: 'amplitude' });
    s.param.number('r', { default: 2.2, min: 0.5, max: 5, step: 0.1, label: 'radius' });
    s.wg.point('A', [-4.6, -1.6], { free: true, label: 'A' });
    s.wg.point('B', [1.6, -2.3], { free: true, label: 'B' });
    s.wg.point('C', [-1.1, 2.7], { free: true, label: 'C' });
    s.wg.polygon('tri', ['A', 'B', 'C'], { stroke: { color: BLUE, width: 2.5 } });
    s.wg.circumcircle('cc', 'A', 'B', 'C', { stroke: { color: GOLD, width: 1.8 } });
    s.wg.centroid('G', ['A', 'B', 'C'], { label: 'G' });
    s.wg.midpoint('M', 'B', 'C', { label: 'M' });
    s.wg.glider('P', 'cc', -1.2, { label: 'P' });
    s.wg.angle('angA', 'B', 'A', 'C');
    s.wg.distance('dBC', 'B', 'C');
    s.wg.circle('orbit', [-1, 0.4], { $param: 'r' }, { stroke: { color: PINK, width: 2 } });
    s.wg.plotFn('wave', 'a*sin(x)', { domain: [-9.5, 9.5], stroke: { color: TEAL, width: 2.5 } });
  });
}

/** Phase 4 · Lane A/K gallery: a curated board exercising the new plot catalog. */
export function plotGalleryDoc(): SceneDoc {
  return scene({ title: 'windgraph v2 · plot catalog' }, (s) => {
    s.param.number('n', { default: 8, min: 1, max: 40, step: 1, label: 'riemann n' });
    s.param.number('terms', { default: 5, min: 1, max: 20, step: 1, label: 'fourier terms' });
    s.param.number('t0', { default: 1, min: -3, max: 3, step: 0.05, label: 'tangent at' });

    s.wg.plotPiecewise('pw', [{ cond: 'x < 0', expr: 'sin(x)*2' }, { cond: 'x >= 0', expr: 'sqrt(x)*2' }], { domain: [-6, 6], stroke: { color: TEAL, width: 2.5 } });
    s.wg.plotInequality('ineq', ['x^2 + y^2 - 9'], { cmps: ['<'], fill: [0.36, 0.62, 0.98, 0.10] });

    s.wg.point('S0', [-5, -2], { free: true });
    s.wg.point('S1', [-3, 1.5], { free: true });
    s.wg.point('S2', [-1, -1], { free: true });
    s.wg.point('S3', [1, 2], { free: true });
    s.wg.plotSpline('spline', ['S0', 'S1', 'S2', 'S3'], { spline: 'catmull', stroke: { color: GOLD, width: 2.5 } });

    s.wg.plotTangent('tan', 'sin(x)', { $param: 't0' }, { domain: [-6, 6], showNormal: true, showDerivatives: true, color: PINK, stroke: { color: [0.55, 0.6, 0.75, 0.7], width: 1.8 } });
    s.wg.plotAccumulation('acc', 'cos(x)', 0, { domain: [-6, 6], stroke: { color: [0.85, 0.6, 0.4, 1], width: 2 } });
    s.wg.plotRiemann('riemann', '0.3*x^2', [-3, 3], { $param: 'n' }, { mode: 'midpoint', fill: [0.30, 0.85, 0.75, 0.18], stroke: { color: TEAL, width: 1 } });

    s.wg.point('ode0', [-3, 2], { free: true });
    s.wg.plotOde('ode', '-y', ['ode0'], { domain: [-3, 4], h: 0.05, stroke: { color: PINK, width: 2 } });

    s.wg.plotFourier('fourier', 'x', { $param: 'terms' }, { domain: [-3.14, 3.14], epicycles: false, stroke: { color: [0.9, 0.75, 0.4, 1], width: 2 } });

    s.wg.contours('contours', 'sin(x) + cos(y)', { count: 5, filled: false, stroke: { color: [0.5, 0.55, 0.7, 0.5], width: 1 } });

    s.wg.histogram('hist', [-2, -1.5, -1, -1, -0.5, 0, 0, 0, 0.5, 1, 1.5, 2, 0, -0.5, 0.5], { method: 'sturges', fill: [0.36, 0.62, 0.98, 0.4], stroke: { color: BLUE, width: 1 } });
    s.wg.regression('reg', [[-3, -5], [-2, -3.2], [-1, -1.1], [0, 0.8], [1, 3], [2, 5.1], [3, 6.9]], 'linear', { showResiduals: true, color: GOLD, stroke: { color: GOLD, width: 2 } });
  });
}

export class WindgraphSceneBoard {
  x0 = 0;
  y0 = 0;
  width = 1400;
  height = 900;

  readonly doc: SceneDoc;
  readonly params = new Map<string, any>();
  readonly plane = new NumberPlane();
  scene!: WgScene;
  /** Bumped on every visible change (drag/param) — emit-cache key. */
  rev = 0;

  private cache = new EmitCache();
  private built = false;
  private homeB: { x: number; y: number } | null = null;
  /** Numeric params surface as analytic sliders (task 1.5). */
  private sliders: { name: string; label: string; min: number; max: number; step: number }[] = [];
  private sliderDrag: string | null = null;
  private lastZoom = 1;

  constructor(doc: SceneDoc = demoDoc()) {
    this.doc = doc;
    for (const [k, p] of Object.entries(doc.params)) this.params.set(k, p.default);
  }

  /** Place the plane in the board bounds, then resolve the scene (lazy — the
   *  playground positions the board after construction). */
  ensure() {
    if (this.built) return;
    const u = 70;
    const plane = this.plane;
    plane.worldX0 = this.x0 + this.width / 2;
    plane.worldY0 = this.y0 + this.height / 2;
    plane.unitX = plane.unitY = u;
    plane.xMin = -(this.width / 2) / u; plane.xMax = (this.width / 2) / u;
    plane.yMin = -(this.height / 2) / u; plane.yMax = (this.height / 2) / u;
    this.scene = new WgScene(this.doc, this.params, plane, () => { this.rev++; });
    const B = this.scene.points.get('B');
    if (B?.free) this.homeB = { x: B.x, y: B.y };
    for (const [name, p] of Object.entries(this.doc.params)) {
      if ((p as any).kind !== 'number') continue;
      const def = (p as any).default ?? 0;
      const min = (p as any).min ?? def - 5, max = (p as any).max ?? def + 5;
      this.sliders.push({ name, label: (p as any).label ?? name, min, max, step: (p as any).step ?? (max - min) / 200 });
    }
    this.built = true;
  }

  /** Slider row geometry in world units (constant screen size via k = 1/zoom). */
  private sliderGeom(k: number) {
    const x = this.x0 + 20 * k, w = 240 * k, rowH = 36 * k;
    const yTop = this.y0 + 52 * k;
    return this.sliders.map((sl, i) => {
      const y = yTop + i * rowH;
      const val = this.params.get(sl.name) ?? sl.min;
      const t = Math.max(0, Math.min(1, (val - sl.min) / (sl.max - sl.min || 1)));
      return { sl, x, y, w, knobX: x + t * w, k };
    });
  }

  /** Diagnostics — cumulative cache rebuilds (flat while idle = caches hold). */
  get cacheMisses(): number { return this.cache.misses; }
  get directMisses(): number { return this.built ? this.scene.directMisses : 0; }

  /** Slider binding entry point (task 1.5 wires UI to this). */
  setParam(name: string, value: any) {
    this.ensure();
    this.params.set(name, value);
    this.scene.update();
    this.rev++;
  }

  /** Re-resolve the whole scene from the (possibly mutated) doc — the REPL
   *  path. Keeps plane + params; rebuilds the constraint graph + mobjects. */
  rebuild() {
    this.ensure();
    this.scene = new WgScene(this.doc, this.params, this.plane, () => { this.rev++; });
    const B = this.scene.points.get('B');
    if (B?.free) this.homeB = { x: B.x, y: B.y };
    this.rev++;
  }

  // ── s.interactive contract ──────────────────────────────────────────────

  tryBeginDrag(wx: number, wy: number, scale: number): boolean {
    this.ensure();
    // Sliders first (they overlay the board's top-left).
    const k = 1 / Math.max(this.lastZoom, 1e-6);
    for (const g of this.sliderGeom(k)) {
      if (Math.hypot(wx - g.knobX, wy - g.y) <= 14 * k) {
        this.sliderDrag = g.sl.name;
        this.rev++;
        return true;
      }
    }
    const began = this.scene.tryBeginDrag(wx, wy, scale);
    if (began) this.rev++;
    return began;
  }
  dragTo(wx: number, wy: number) {
    if (this.sliderDrag) {
      const k = 1 / Math.max(this.lastZoom, 1e-6);
      const g = this.sliderGeom(k).find((gg) => gg.sl.name === this.sliderDrag);
      if (g) {
        const t = Math.max(0, Math.min(1, (wx - g.x) / g.w));
        const raw = g.sl.min + t * (g.sl.max - g.sl.min);
        const val = Math.max(g.sl.min, Math.min(g.sl.max, Math.round(raw / g.sl.step) * g.sl.step));
        this.setParam(g.sl.name, val);
      }
      return;
    }
    this.scene.dragTo(wx, wy);
  }
  endDrag() { this.sliderDrag = null; this.scene.endDrag(); }
  get dragging(): boolean { return this.built && (this.sliderDrag !== null || this.scene.dragging); }
  private hoverKey = '';
  private hoverRes = false;
  updateHover(wx: number, wy: number, scale: number): boolean {
    this.ensure();
    // Static-pointer guard (frame.ts calls this every frame).
    const key = `${wx}|${wy}|${Math.round(scale * 50)}|${this.rev}`;
    if (key === this.hoverKey) return this.hoverRes;
    this.hoverKey = key;
    if (wx < this.x0 - 40 || wx > this.x0 + this.width + 40 || wy < this.y0 - 40 || wy > this.y0 + this.height + 40) {
      this.scene.drag.hover = null;
      return (this.hoverRes = false);
    }
    const k = 1 / Math.max(this.lastZoom, 1e-6);
    for (const g of this.sliderGeom(k)) {
      if (Math.hypot(wx - g.knobX, wy - g.y) <= 14 * k) return (this.hoverRes = true);
    }
    return (this.hoverRes = this.scene.updateHover(wx, wy, scale));
  }

  /** Cinematic-flight auto-drive: vertex B on a smooth wall-clock path, so the
   *  constraint graph visibly recomputes without a user (mirrors v1 demo). */
  autoDrive() {
    this.ensure();
    const B = this.scene.points.get('B');
    if (!B?.free || !this.homeB) return;
    const t = performance.now() / 1000;
    B.set(this.homeB.x + Math.sin(t * 0.5) * 130, this.homeB.y + Math.cos(t * 0.37) * 90);
    this.scene.update();
    this.rev++;
  }

  // ── emit ────────────────────────────────────────────────────────────────

  /** Cache signature for a view — pure (no side effects), so the frame loop
   *  can ask "would this frame differ?" before deciding to emit at all.
   *  Quantizes both camera axes: view∩board clip snaps to a coarse tile (pan
   *  replays within a tile), zoom snaps to ~9% log2 bands (zoom replays
   *  instead of re-running marching squares / resampling every frame). */
  sigFor(view: PlaneView): string {
    this.ensure();
    const z = Math.max(view.zoom, 1e-6);
    const lod = Math.max(0.3, Math.min(3, Math.round(Math.sqrt(z) * 10) / 10));
    const zq = Math.pow(2, Math.round(Math.log2(z) * 8) / 8);
    if (view.left < -1e11) return `3d|${this.rev}|${this.scene.hoveredId ?? ''}|${lod}|${zq}`;
    const TILE = 1200;
    const eL = Math.floor(Math.max(view.left, this.x0) / TILE) * TILE;
    const eT = Math.floor(Math.max(view.top, this.y0) / TILE) * TILE;
    const eR = Math.ceil(Math.min(view.right, this.x0 + this.width) / TILE) * TILE;
    const eB = Math.ceil(Math.min(view.bottom, this.y0 + this.height) / TILE) * TILE;
    return `${this.rev}|${this.scene.hoveredId ?? ''}|${lod}|${zq}|${eL},${eT},${eR},${eB}`;
  }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    this.ensure();
    this.lastZoom = view.zoom;
    // Zoom LOD for plots: sample density follows √zoom in 10% steps — the
    // overview decimates (chords are subpixel there), deep zoom refines.
    // A change bumps rev so the cache rebuilds once at the new density.
    const lod = Math.max(0.3, Math.min(3, Math.round(Math.sqrt(Math.max(view.zoom, 1e-6)) * 10) / 10));
    if (this.scene.setLodScale(lod)) this.rev++;
    this.cache.run(this.sigFor(view), inst, crv, rws, () => {
      // Board chrome: border + title.
      const { x0, y0, width, height } = this;
      strokeInto([[x0, y0], [x0 + width, y0], [x0 + width, y0 + height], [x0, y0 + height], [x0, y0]], { width: 1.5 }, BORDER, inst, crv, rws);
      const title = this.doc.meta.title;
      const tSize = 18 / Math.max(view.zoom, 0.05);
      layoutStr(inst, title, TITLE, atlas.table, font, { x: x0 + 16 / Math.max(view.zoom, 0.05), y: y0 + tSize * 0.4, size: tSize });
      // Grid + axes, then the resolved scene.
      this.plane.render({ font, atlas, inst, crv, rws }, view);
      this.scene.emit({ font, atlas, inst, crv, rws }, view);
      // Hover ring around the grabbed/hovered point.
      const h = this.scene.drag.hover;
      if (h) {
        const rr = 16 / Math.max(view.zoom, 0.05);
        const segs = 28;
        const ring: [number, number][] = [];
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          ring.push([h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr]);
        }
        strokeInto(ring, { width: 2 / Math.max(view.zoom, 0.05) }, GOLD, inst, crv, rws);
      }
      // Param sliders (analytic chrome; screen-constant size).
      const k = 1 / Math.max(view.zoom, 0.05);
      for (const g of this.sliderGeom(k)) {
        const active = this.sliderDrag === g.sl.name;
        const trackCol: Color = active ? [0.45, 0.50, 0.62, 1] : [0.30, 0.32, 0.40, 1];
        strokeInto([[g.x, g.y], [g.x + g.w, g.y]], { width: 4 * k }, trackCol, inst, crv, rws);
        fillQuads(circleQuads(g.knobX, g.y, (active ? 9 : 7) * k, 18), active ? GOLD : [0.80, 0.84, 0.94, 1], inst, crv, rws);
        const val = this.params.get(g.sl.name) ?? g.sl.min;
        const label = `${g.sl.label} = ${val.toFixed(2)}`;
        layoutStr(inst, label, TITLE, atlas.table, font, { x: g.x, y: g.y - 16 * k, size: 15 * k });
      }
    });
  }
}

// ── wg REPL (task 1.6) ───────────────────────────────────────────────────────
// Terminal-agnostic command handler: `wg <cmd> ...` → response lines. Mutations
// validate the whole doc and roll back on error; success rebuilds the live
// scene. Terminal wiring is Phase-6 chrome; the mechanism is testable headless.

export function wgRepl(board: WindgraphSceneBoard, raw: string): string[] {
  const parts = raw.trim().split(/\s+/);
  if (parts[0] !== 'wg') return ['error: not a wg command'];
  board.ensure();
  const cmd = parts[1];
  const rest = parts.slice(2);
  const doc = board.doc;
  const uid = (base: string) => { let n = 0; while (doc.objects[`${base}_${n}`]) n++; return `${base}_${n}`; };
  const tryMutate = (apply: () => void, rollback: () => void): string | null => {
    apply();
    const errs = validateSceneDoc(doc);
    if (errs.length) { rollback(); board.rebuild(); return errs[0]; }
    board.rebuild();
    return null;
  };

  switch (cmd) {
    case 'help':
      return [
        'wg list                     — list objects',
        'wg params                   — list params + live values',
        'wg plot <expr>              — add y = f(x)  (e.g. wg plot cos(x)*x)',
        'wg point <x> <y>            — add a draggable point (data coords)',
        'wg circle <cx> <cy> <r>     — add a circle',
        'wg slider <name> <value>    — set a param',
        'wg drag <id> <x> <y>        — move a free point (data coords)',
        'wg remove <id>              — delete an object',
        'wg emit                     — print builder TS for the live scene',
      ];
    case 'list': {
      const entries = Object.entries(doc.objects);
      if (entries.length === 0) return ['(no objects)'];
      return entries.map(([id, s]) => `  ${id}  (${s.kind})`);
    }
    case 'params': {
      const entries = Object.entries(doc.params);
      if (entries.length === 0) return ['(no params)'];
      return entries.map(([name, p]: [string, any]) => `  ${name}  (${p.kind})  = ${JSON.stringify(board.params.get(name) ?? p.default)}`);
    }
    case 'plot': {
      const expr = rest.join(' ');
      if (!expr) return ['error: usage: wg plot <expr>'];
      const id = uid('plot');
      const err = tryMutate(
        () => { doc.objects[id] = { kind: 'wg-plot-fn', id, expr, stroke: { color: TEAL, width: 2.5 } } as any; },
        () => { delete doc.objects[id]; },
      );
      return err ? ['error: ' + err] : [`added ${id}: y = ${expr}`];
    }
    case 'point': {
      const [x, y] = rest.map(Number);
      if (!isFinite(x) || !isFinite(y)) return ['error: usage: wg point <x> <y>'];
      const id = uid('pt');
      const err = tryMutate(
        () => { doc.objects[id] = { kind: 'wg-point', id, at: [x, y], free: true } as any; },
        () => { delete doc.objects[id]; },
      );
      return err ? ['error: ' + err] : [`added ${id} at (${x}, ${y}) — draggable`];
    }
    case 'circle': {
      const [cx, cy, r] = rest.map(Number);
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(r)) return ['error: usage: wg circle <cx> <cy> <r>'];
      const id = uid('circ');
      const err = tryMutate(
        () => { doc.objects[id] = { kind: 'wg-circle', id, center: [cx, cy], radius: r, stroke: { color: PINK, width: 2 } } as any; },
        () => { delete doc.objects[id]; },
      );
      return err ? ['error: ' + err] : [`added ${id}: circle at (${cx}, ${cy}) r=${r}`];
    }
    case 'slider': {
      const [name, v] = rest;
      const val = Number(v);
      if (!doc.params[name]) return [`error: param "${name}" not found`];
      if (!isFinite(val)) return ['error: usage: wg slider <name> <value>'];
      board.setParam(name, val);
      return [`${name} = ${val}`];
    }
    case 'drag': {
      const [id, xs, ys] = rest;
      const x = Number(xs), y = Number(ys);
      const p = board.scene.points.get(id);
      if (!p) return [`error: point "${id}" not found`];
      if (!p.free) return [`error: point "${id}" is constrained (only free points can be moved)`];
      if (!isFinite(x) || !isFinite(y)) return ['error: usage: wg drag <id> <x> <y>  (data coords)'];
      p.set(board.plane.dToWx(x), board.plane.dToWy(y));
      board.scene.update();
      board.rev++;
      return [`moved ${id} to (${x}, ${y})`];
    }
    case 'remove': {
      const [id] = rest;
      const spec = doc.objects[id];
      if (!spec) return [`error: object "${id}" not found`];
      const err = tryMutate(
        () => { delete doc.objects[id]; },
        () => { doc.objects[id] = spec; },
      );
      return err ? [`error: ${err} (object kept)`] : [`removed ${id}`];
    }
    case 'emit':
      return emitTS(doc).split('\n');
    default:
      return ['error: unknown command — try "wg help"'];
  }
}
