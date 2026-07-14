// ── windgraph · Phase-7 3D graphing demo ─────────────────────────────────────
// A rotatable z = f(x,y) surface with 3D axes/grid and razor-sharp billboarded
// labels, plus a parametric space curve. Rendered by CPU-projecting 3D geometry
// to 2D world coordinates and painter-sorting the faces (no depth buffer). Drag
// over the board to orbit; the cinematic flight auto-rotates it.

import { layoutStr } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';
import type { PlaneView } from '../coords/numberPlane';
import { Projector } from './project3d';
import { plotSurface, type Region } from './surface';
import { drawAxes3D, drawAxisLabels3D, plotCurve3D, type Region3 } from './axes3d';

const INK = [0.90, 0.92, 0.98, 1];
const DIM = [0.60, 0.64, 0.74, 1];
const GOLD = [0.94, 0.78, 0.42, 1];

export class Surface3DDemo {
  x0 = 0;
  y0 = 0;
  width = 1040;
  height = 780;

  private proj = new Projector();
  private region: Region = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
  private region3: Region3 = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -2.6, zMax: 2.6 };

  // orbit / drag state
  private _dragging = false;
  private manual = false;
  private startWx = 0; private startWy = 0; private startAz = 0; private startEl = 0;

  // z = 2.4 · sin(√(x²+y²)) — the classic ripple surface.
  private f(x: number, y: number): number { return 2.4 * Math.sin(Math.sqrt(x * x + y * y)); }

  private place() {
    this.proj.scale = 52;
    this.proj.ox = this.x0 + this.width / 2;
    this.proj.oy = this.y0 + this.height * 0.60;
    this.proj.el = 0.52;
  }

  // ── drag-to-orbit (wired like the interactive board) ──────────────────────
  tryBeginDrag(wx: number, wy: number, _scale: number): boolean {
    if (wx < this.x0 || wx > this.x0 + this.width || wy < this.y0 || wy > this.y0 + this.height) return false;
    this._dragging = true; this.manual = true;
    this.startWx = wx; this.startWy = wy; this.startAz = this.proj.az; this.startEl = this.proj.el;
    return true;
  }
  dragTo(wx: number, wy: number): void {
    if (!this._dragging) return;
    this.proj.az = this.startAz - (wx - this.startWx) * 0.006;
    this.proj.el = Math.max(0.08, Math.min(1.45, this.startEl + (wy - this.startWy) * 0.006));
  }
  endDrag(): void { this._dragging = false; }
  get dragging(): boolean { return this._dragging; }
  /** Resume the gentle auto-spin (used by the cinematic flight). */
  autoRotate(): void { this.manual = false; }

  // Flight gating: the board is heavy, so during the 3D cinematic flight it only
  // renders while its own shot is "poking" it (keeps the rest of the flight fast).
  private lastPoke = -1e9;
  pokeFlight(now: number): void { this.lastPoke = now; }
  wantsFlightEmit(now: number): boolean { return now - this.lastPoke < 200; }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    this.place();
    if (!this.manual) this.proj.az = 0.6 + now * 0.00018; // gentle idle spin
    const ctx = { inst, crv, rws };
    const zoom = view.zoom;

    // Behind: floor grid + axes.
    drawAxes3D(this.region3, this.proj, ctx, font, atlas, { zoom });
    // Surface (painter-sorted faces + subtle wireframe).
    plotSurface((x, y) => this.f(x, y), this.region, this.proj, ctx, { res: 36, zoom, wire: [0, 0, 0, 0.16] });
    // A rising helix space curve threading through the scene.
    plotCurve3D((t) => [3.0 * Math.cos(t), 3.0 * Math.sin(t), -2.2 + 4.4 * (t / (4 * Math.PI))], 0, Math.PI * 4, 160, this.proj, ctx, GOLD, 3, zoom);
    // On top: axis labels (upright, crisp).
    drawAxisLabels3D(this.region3, this.proj, ctx, font, atlas, { zoom });

    // Title + hint.
    layoutStr(inst, 'windgraph 3D: z = sin(root(x^2 + y^2))', INK, atlas.table, font, { x: this.x0 + 40, y: this.y0 - 10, size: 30 });
    layoutStr(inst, 'projected + painter-sorted . drag to orbit . crisp labels at any angle', DIM, atlas.table, font, { x: this.x0 + 40, y: this.y0 + 28, size: 15 });
  }
}
