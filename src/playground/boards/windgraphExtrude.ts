// ── windgraph v2 · extrude demo board (sprint-v2 Phase 2, CP3) ───────────────
// The moat in one board: a polygon + a cylinder that extrude on a slider, a LaTeX
// headline whose glyphs rise — and the whole thing lifts into a continuous tilted
// orbit on double-tap (no 2D/3D mode switch). Implements the world's board
// contract; emits through the per-instance z buffer (D10) so elevation is
// invisible flat in 2D and reveals as the camera tilts (OQ-9).

import type { FontFace } from '../../windfoil/font';
import type { AppState } from '../../state';
import type { PlaneView } from '../../windgraph/coords/numberPlane';
import { Polygon, Circle, Label, Tex } from '../../windgraph/mobject/primitives';
import type { RenderCtx } from '../../windgraph/mobject/mobject';
import { pushWalls, pushCap } from '../../windgraph/space3d/extrude';
import { strokeInto } from '../../windgraph/stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import { AnalyticPanel } from '../../ui/analyticPanel';
import { positionBoardPanel, renderBoardPanel, panelHitXY } from './sliderOverlay';
import { orbitPolar, isEnabled } from '../../camera/orbit';
import { isTilted, toggleTilt } from '../../camera/camera';

const BLUE: number[] = [0.36, 0.62, 0.98, 1];
const TEAL: number[] = [0.30, 0.85, 0.75, 1];
const GOLD: number[] = [0.92, 0.74, 0.42, 1];
const BORDER: number[] = [0.25, 0.26, 0.30, 1];
const TITLE: number[] = [0.92, 0.94, 0.99, 1];

const MAX_H = 130;

export class WindgraphExtrudeBoard {
  x0 = 0;
  y0 = 0;
  width = 1060;
  height = 800;
  /** Bumped on slider drag — the world's frame-skip signature reads it. */
  rev = 0;
  /** Live extrusion height (world px), slider-bound. */
  extrude = 52;
  /** Quality dial, read from the app's settings panel when hosted (fallback for
   *  headless/standalone-without-panel). smooth = Gouraud the round walls (cylinder
   *  + glyph sides). `meshAA` = MSAA 4× (the AA dial). Shadows were removed
   *  (2026-07-31, user). */
  get smooth(): boolean { return this.app?.meshSmooth ?? true; }
  /** AppState ref (set when hosted standalone) for the continuous tilt toggle. */
  app: AppState | null = null;
  /** Per-instance 3D buffer the world sets before emit (D10); standalone = none. */
  xfTarget?: number[];
  /** Standalone per-instance 3D buffer (D10): built during emit, exposed via
   *  xfBuffer() so frame.ts enables fxActive without the world's composition. */
  private _xf: number[] = [];
  private _xfFA = new Float32Array(0);
  private _xfLen = 0;
  private _xfOn = false;
  /** Cached depth-tested mesh (7 floats/vert), rebuilt when extrude or the smooth
   *  dial changes (smooth bakes per-vertex colors). Drawn by frame.ts through mesh3d
   *  before the analytic pass so the solids are watertight at every angle. */
  private _meshKey = '';
  private _meshFA = new Float32Array(0);
  private _atlas: any = null;

  private square!: Polygon;
  private cyl!: Circle;
  private headline!: Tex;
  private tag!: Label;
  /** World-space slider panel (analytic, fixed-size by default; D21). */
  panel: AnalyticPanel | null = null;
  private built = false;
  private emits = 0;

  ensure() {
    if (this.built) return;
    const cy = this.y0 + 520;
    const s = 128;
    const cx = this.x0 + 300;
    this.square = new Polygon(
      [[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]],
      { color: BLUE, width: 2.5 }, { color: BLUE });
    this.cyl = new Circle(this.x0 + 760, cy, 104, { color: TEAL, width: 2 }, { color: TEAL });
    // Headline floats above the shapes (its z-loft + shadow stay clear of them);
    // the caption sits below, flat on the ground — no footprint overlap, so the
    // analytic painter order never has to hide one behind the other.
    this.headline = new Tex('z = f(x, y)', this.x0 + this.width / 2, this.y0 + 210, 76, GOLD, 'middle');
    this.tag = new Label('drag the slider · double-tap (or the cube) to tilt into 3D', this.x0 + this.width / 2, this.y0 + 720, 22, TITLE, 'middle');
    this.panel = new AnalyticPanel([{
      kind: 'slider' as const, id: 'extrude', label: 'extrude', min: 0, max: MAX_H, step: 1,
      get: () => this.extrude, set: (v: number) => { if (v !== this.extrude) { this.extrude = v; this.rev++; } },
    }]);
    this.built = true;
  }

  /** Per-instance 3D buffer for the shader (standalone), or null when flat. */
  xfBuffer(): Float32Array | null {
    return this._xfOn ? this._xfFA.subarray(0, this._xfLen) : null;
  }

  /** Rebuild the depth-tested mesh when extrude or the smooth dial changes. Box +
   *  cylinder are CLOSED solids (walls + caps from one loop → watertight). The box
   *  walls stay FLAT (crisp faces are correct); the cylinder + glyph walls follow
   *  the smooth dial (Gouraud → no facets on the round sides). The extruded text is
   *  walls-only (its sharp top is the analytic pass, raised by EXTRUDE_PLUG_EPS so
   *  it caps the walls with no sliver — no inset, which was the old seam cause). */
  private buildMesh() {
    const key = `${this.extrude}|${this.smooth ? 1 : 0}`;
    if (this._meshKey === key) return;
    this._meshKey = key;
    if (this.extrude <= 0 || !this._atlas) { this._meshFA = new Float32Array(0); return; }
    const h = this.extrude;
    const sm = this.smooth;
    const m: number[] = [];
    const sq = this.square.wallLoops(), cy = this.cyl.wallLoops();
    pushWalls(m, sq, 0, -h, this.square.fill!.color, false);
    pushCap(m, sq, -h, this.square.fill!.color, [0, 0, 1]);
    pushCap(m, sq, 0, this.square.fill!.color, [0, 0, -1]);
    pushWalls(m, cy, 0, -h, this.cyl.fill!.color, sm);
    pushCap(m, cy, -h, this.cyl.fill!.color, [0, 0, 1]);
    pushCap(m, cy, 0, this.cyl.fill!.color, [0, 0, -1]);
    pushWalls(m, this.headline.wallLoops(this._atlas), 0, -h * 0.85, this.headline.color, sm);
    this._meshFA = new Float32Array(m);
  }

  /** Depth-tested mesh for frame.ts (null when flat / not yet built). */
  getMesh(): Float32Array | null {
    return this._meshFA.length ? this._meshFA : null;
  }

  get cacheMisses(): number { return this.emits; }
  get directMisses(): number { return 0; }

  // ── s.interactive contract (slider only; everything else → camera) ───────

  tryBeginDrag(wx: number, wy: number, _scale: number, sx?: number, sy?: number): boolean {
    this.ensure();
    positionBoardPanel(this, this.app);
    const [px, py] = panelHitXY(this, wx, wy);
    return !!(this.panel && this.panel.pointerDown(px, py));
  }
  dragTo(wx: number, wy: number) {
    if (this.panel && this.panel.isDragging) {
      // The panel is world-space in both modes → drive the drag with doc coords.
      this.panel.drag(wx, wy);
    }
  }
  endDrag() { this.panel?.endDrag(); }
  get dragging(): boolean { return this.panel?.isDragging ?? false; }

  private hoverKey = '';
  private hoverRes = false;
  updateHover(wx: number, wy: number, scale: number, sx?: number, sy?: number): boolean {
    this.ensure();
    const key = `${wx}|${wy}|${Math.round(scale * 50)}|${sx ?? -1}|${sy ?? -1}|${this.rev}`;
    if (key === this.hoverKey) return this.hoverRes;
    this.hoverKey = key;
    positionBoardPanel(this, this.app);
    const [hx, hy] = panelHitXY(this, wx, wy);
    this.panel?.updateHover(hx, hy);
    return (this.hoverRes = (this.panel?.hovered ?? -1) >= 0);
  }

  // ── continuous tilt (standalone route; in the world the world owns this) ──
  get tilted(): boolean { return !!this.app && isTilted(this.app); }
  toggleTilt() { if (this.app) toggleTilt(this.app, 0.9); }
  doubleTap(_wx: number, _wy: number): boolean {
    if (this.dragging || !this.app) return false;
    this.toggleTilt();
    return true;
  }
  /** No cinematic auto-drive (the slider + tilt are the performance). */
  autoDrive(): void {}

  // ── emit ────────────────────────────────────────────────────────────────

  sigFor(view: PlaneView): string {
    this.ensure();
    const z = Math.max(view.zoom, 1e-6);
    const zq = Math.pow(2, Math.round(Math.log2(z) * 8) / 8);
    const tilted = isEnabled() && orbitPolar() > 0.06 ? 1 : 0;
    return `xtr|${this.rev}|${this.extrude}|${zq}|${tilted}`;
  }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, _view: PlaneView, _camX?: number, _camY?: number) {
    this.ensure();
    this.emits++;

    // Per-instance 3D buffer (D10): the world hands us its comp buffer (xfTarget);
    // standalone we own one. Either way it must stay 1:1 with `inst` — emitters that
    // don't write xf (chrome) leave a gap that the next writeXf zero-pads, and we
    // pad any trailing gap at the end so the buffer covers every drawn instance.
    const own = this.xfTarget === undefined;
    const xfArr = own ? this._xf : (this.xfTarget as number[]);
    const inst0 = inst.length;
    const need0 = (inst0 >> 4) << 3;
    if (own) { xfArr.length = 0; for (let i = 0; i < need0; i++) xfArr.push(0); }
    else { while (xfArr.length < need0) xfArr.push(0); }
    const ctx: RenderCtx = { font, atlas, inst, crv, rws, xf: xfArr };

    // Board chrome (flat).
    const { x0, y0, width, height } = this;
    strokeInto([[x0, y0], [x0 + width, y0], [x0 + width, y0 + height], [x0, y0 + height], [x0, y0]], { width: 1.5 }, BORDER, inst, crv, rws);
    // FIXED world-size title (k = 1, like the panel — D21/D22), centered over
    // the top edge, no underline.
    const tTitle = 'continuous 2D ↔ 3D — one space, no mode switch';
    const tSize = 40;
    const tBase = y0 + tSize * 0.4;
    const tx = x0 + width / 2 - tw(tTitle, font, tSize) / 2;
    layoutStr(inst, tTitle, TITLE, atlas.table, font, { x: tx, y: tBase, size: tSize });

    const h = this.extrude;
    this.square.extrude = h;
    this.cyl.extrude = h;
    this.headline.extrude = h * 0.85;
    this.tag.elevation = 0;

    // Build the depth-tested wall mesh (cached on extrude). The analytic pass then
    // only draws tops + chrome; the shared depth buffer occludes the solids
    // correctly at every angle (no painter-order gaps, no culling seams).
    this._atlas = atlas;
    this.buildMesh();

    // Analytic tops: box/cylinder draw theirs only near top-down (sharp 2D
    // silhouette; the closed mesh solid owns the 3D body), the headline always
    // (sharp glyphs are the moat — its mesh walls are inset so they don't fight it).
    this.square.emit(ctx);
    this.cyl.emit(ctx);
    this.headline.emit(ctx);
    this.tag.emit(ctx);

    // Slider panel: a world-space object in both modes (fixed world size by
    // default; the panel's toggle switches to screen-constant), drawn into the
    // scene buffer like the board content it controls.
    positionBoardPanel(this, this.app);
    renderBoardPanel(this, inst, crv, rws, font, atlas);

    // Standalone: pad the trailing xf gap (slider chrome) and publish the buffer.
    if (own) {
      const needEnd = (inst.length >> 4) << 3;
      while (xfArr.length < needEnd) xfArr.push(0);
      this._xfOn = h > 0;
      this._xfLen = xfArr.length;
      if (this._xfFA.length < xfArr.length) this._xfFA = new Float32Array(xfArr.length);
      for (let i = 0; i < xfArr.length; i++) this._xfFA[i] = xfArr[i];
    }
  }
}
