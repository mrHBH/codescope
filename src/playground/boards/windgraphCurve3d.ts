// ── windgraph v2 · 3D space curves board (Phase 5 · F3D-2, D26 mesh pivot) ───
// A torus knot + helix + doc axes as WATER-TIGHT GOURAUD MESH TUBES (pushTube →
// the shared mesh3d depth buffer), with flat analytic labels/title on top. The
// mesh is built once (fixed, camera-independent sampling) and cached, so orbit
// is rock-stable — no per-frame analytic resampling, no z-fighting, and the
// tubes self-occlude correctly at every angle through the mesh3d depth test.
// Double-tap / the cube glides into a tilted orbit.

import type { FontFace } from '../../windfoil/font';
import type { AppState } from '../../state';
import type { PlaneView } from '../../windgraph/coords/numberPlane';
import { sampleCurve3D, pushTube, polyToQuads, type Vec3 } from '../../windgraph/space3d/curve3d';
import { strokeInto, strokeQuadPath, fillQuads } from '../../windgraph/stroke/stroke';
import { layoutStr, tw } from '../../layout/metrics';
import { isTilted, toggleTilt } from '../../camera/camera';
import { orbitPolar, isEnabled } from '../../camera/orbit';

const RED: number[] = [0.92, 0.45, 0.40, 1];
const GREEN: number[] = [0.38, 0.82, 0.55, 1];
const BLUE: number[] = [0.40, 0.65, 0.98, 1];
const GOLD: number[] = [0.95, 0.76, 0.45, 1];
const VIOLET: number[] = [0.80, 0.65, 0.97, 1];
const AXIS: number[] = [0.42, 0.45, 0.54, 1];
const TITLE: number[] = [0.92, 0.94, 0.99, 1];
const SUB: number[] = [0.55, 0.60, 0.70, 1];

/** Helix around the z axis, 2.5 turns rising ~150 world px. */
function helix(t: number): Vec3 {
  return [Math.cos(t) * 120, Math.sin(t) * 120, (t / (5 * Math.PI)) * 150];
}

/** (2,3) torus knot, ~570px across, 2.8× taller than wide on z. */
function torusKnot(t: number): Vec3 {
  const c = Math.cos(3 * t), s = Math.sin(3 * t);
  const r = 2 + c;
  return [r * Math.cos(2 * t) * 95, r * Math.sin(2 * t) * 95, s * 132];
}

// The mesh rebuilds at QUANTIZED √2 zoom bands (the plot-LOD pattern), so the
// silhouette stays round as you zoom: detail ~ z^0.75 scales BOTH the centerline
// tolerance and the radial segment count. Base = 64-gon/10px-chord (the same
// relative smoothness as the approved extrude cylinder); the cap (detail ≤ 3,
// ~460k verts) keeps facets sub-pixel to ~5× zoom, then the deep-zoom facets are
// the accepted D3 "sampled content" tradeoff. Rebuilds are one-frame hitches at
// band crossings only — a still frame redraws the SAME Float32Array (mesh3d
// gates the upload on the reference), so orbiting never rebuilds and never pops.
function lodDetail(viewZ: number): number {
  const z = Math.max(viewZ, 0.5);
  const zq = Math.pow(2, Math.round(Math.log2(z) * 2) / 2);
  return Math.min(Math.pow(zq, 0.75), 3);
}

// Polar angle gate: below this the camera is "2D" (top-down) — the board shows
// the analytic silhouette bands, not the 3D tube mesh (which would flatten into
// a jumbled blob with all faces on one depth layer). Mirrors the extrude board's
// shadow gate.
const TILT_GATE = 0.06;
function po(): number {
  return isEnabled() ? orbitPolar() : 0;
}

export class WindgraphCurve3DBoard {
  x0 = 0;
  y0 = 0;
  width = 1240;
  height = 880;
  rev = 0;
  app: AppState | null = null;
  /** No slider panel (the SliderBoard contract's `panel` is null). */
  panel: null = null;
  private _mesh = new Float32Array(0);
  private _meshKey = '';
  private samples: { helix: Vec3[]; knot: Vec3[] } | null = null;
  private sampleKey = '';
  private built = false;
  private emits = 0;

  ensure() {}

  /** In the flat 2D view the tube mesh is NOT drawn: the 2D ortho collapses all
   *  faces onto one depth layer, so back/side faces overlap the front into a
   *  jumbled blob (3D top-down looks different only because depth occludes the
   *  far side). Instead the board emits the tube's TOP-DOWN SILHOUETTE — a clean
   *  analytic band of the tube's diameter along the curve's xy-projection, razor
   *  sharp at any zoom (the extrude board's seamless 2D↔3D pattern, OQ-9). */
  getMesh(): Float32Array | null {
    if (po() <= TILT_GATE) return null;
    const detail = this.app ? lodDetail(this.app.viewZ) : 1;
    if (this._meshKey !== `d${detail}`) {
      this._meshKey = `d${detail}`;
      this.buildMesh(detail);
    }
    return this._mesh.length ? this._mesh : null;
  }

  /** The sampled centerlines, cached per zoom band and shared by the 3D tube
   *  mesh and the 2D silhouette bands. */
  private polylines(detail: number): { helix: Vec3[]; knot: Vec3[] } {
    const key = `d${detail}`;
    if (this.sampleKey === key && this.samples) return this.samples;
    this.sampleKey = key;
    const ct = 0.3 / detail;
    this.samples = {
      helix: sampleCurve3D(helix, 0, 5 * Math.PI, { tolWorld: ct, maxSegs: 6000 }),
      knot: sampleCurve3D(torusKnot, 0, 2 * Math.PI, { tolWorld: ct * 0.9, maxSegs: 9000 }),
    };
    return this.samples;
  }

  private buildMesh(detail: number) {
    const { x0, y0 } = this;
    const radial = Math.min(Math.round(64 * Math.sqrt(detail)), 112);
    const m: number[] = [];
    // Doc axes as thin tubes (x red, y green, z blue — z rises from the origin).
    const axLen = 330;
    const ax = [x0 + 200, y0 + 760] as const;
    pushTube(m, [[ax[0], ax[1], 0], [ax[0] + axLen, ax[1], 0]], { radius: 2.5, color: RED, segs: 8 });
    pushTube(m, [[ax[0], ax[1], 0], [ax[0], ax[1] - axLen * 0.7, 0]], { radius: 2.5, color: GREEN, segs: 8 });
    pushTube(m, [[ax[0], ax[1], 0], [ax[0], ax[1], axLen]], { radius: 2.5, color: BLUE, segs: 8 });
    // The two hero curves, tessellated to the zoom band.
    const { helix: hlx, knot } = this.polylines(detail);
    const hx = x0 + 330, hy = y0 + 420;
    pushTube(m, hlx.map((p) => [p[0] + hx, p[1] + hy, p[2]] as Vec3), { radius: 8, color: VIOLET, segs: radial });
    const kx = x0 + 900, ky = y0 + 420;
    pushTube(m, knot.map((p) => [p[0] + kx, p[1] + ky, p[2]] as Vec3), { radius: 7, color: GOLD, segs: radial });
    this._mesh = new Float32Array(m);
  }

  get cacheMisses(): number { return this.emits; }
  get directMisses(): number { return 0; }

  // ── s.interactive contract (nothing draggable — camera owns the canvas) ────

  tryBeginDrag(_wx: number, _wy: number, _scale: number, _sx?: number, _sy?: number): boolean { return false; }
  dragTo(_wx: number, _wy: number) {}
  endDrag() {}
  get dragging(): boolean { return false; }
  updateHover(_wx: number, _wy: number, _scale: number, _sx?: number, _sy?: number): boolean { return false; }

  get tilted(): boolean { return !!this.app && isTilted(this.app); }
  toggleTilt() { if (this.app) toggleTilt(this.app, 0.9); }
  doubleTap(_wx: number, _wy: number): boolean {
    if (this.dragging || !this.app) return false;
    this.toggleTilt();
    return true;
  }
  autoDrive(): void {}

  frameSig(view: PlaneView): string {
    const z = Math.max(view.zoom, 1e-6);
    const zq = Math.pow(2, Math.round(Math.log2(z) * 2) / 2);
    const tilted = po() > TILT_GATE ? 1 : 0;
    return `c3d|${this.rev}|${tilted}|${zq}`;
  }

  /** World boards call sigFor (frame.ts calls frameSig on the standalone route);
   *  the two are identical for this board. */
  sigFor(view: PlaneView): string {
    return this.frameSig(view);
  }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, view: PlaneView, _camX?: number, _camY?: number) {
    this.emits++;
    const { x0, y0, width, height } = this;
    const ax = [x0 + 200, y0 + 760] as const;
    const axLen = 330;

    // The curve content itself: 3D = the tube mesh (getMesh, depth-tested); 2D =
    // the tube's top-down silhouette as a smooth analytic BÉZIER band (the flat
    // ortho would collapse the tube's faces into a jumbled blob on one depth
    // layer; a raw polyline band would facet — the B-spline fit + strokeQuadPath
    // keeps the boundary a smooth curve at any zoom, exactly like the 2D plots).
    const tilted = po() > TILT_GATE;
    if (!tilted) {
      const detail = lodDetail(Math.max(view.zoom, 1e-6));
      const { helix: hlx, knot } = this.polylines(detail);
      const hx = x0 + 330, hy = y0 + 420;
      const hq: number[] = [];
      strokeQuadPath(polyToQuads(hlx.map((p) => [p[0] + hx, p[1] + hy]), false), { width: 16, cap: 'round', join: 'round' }, false, hq);
      fillQuads(hq, VIOLET, inst, crv, rws);
      const kx = x0 + 900, ky = y0 + 420;
      const kq: number[] = [];
      strokeQuadPath(polyToQuads(knot.map((p) => [p[0] + kx, p[1] + ky]), true), { width: 14, cap: 'round', join: 'round' }, false, kq);
      fillQuads(kq, GOLD, inst, crv, rws);
      // Axes: the x/y axes show as thin bands; the z axis is a point from above.
      strokeInto([[ax[0], ax[1]], [ax[0] + axLen, ax[1]]], { width: 5, cap: 'butt', join: 'miter' }, RED, inst, crv, rws);
      strokeInto([[ax[0], ax[1]], [ax[0], ax[1] - axLen * 0.7]], { width: 5, cap: 'butt', join: 'miter' }, GREEN, inst, crv, rws);
    }

    // Flat analytic chrome (2D — always readable, drawn over the mesh).
    strokeInto([[x0, y0], [x0 + width, y0], [x0 + width, y0 + height], [x0, y0 + height], [x0, y0]], { width: 1.5 }, AXIS, inst, crv, rws);
    const tTitle = '3D space curves — watertight Gouraud tubes';
    const tSize = 40;
    layoutStr(inst, tTitle, TITLE, atlas.table, font, { x: x0 + width / 2 - tw(tTitle, font, tSize) / 2, y: y0 + tSize * 0.4, size: tSize });
    const sub = 'torus knot + helix · 2D shows the top-down silhouette, tilt reveals the depth-tested solid tubes';
    const sSize = 19;
    layoutStr(inst, sub, SUB, atlas.table, font, { x: x0 + width / 2 - tw(sub, font, sSize) / 2, y: y0 + 74, size: sSize });
    const cap = 'double-tap (or the cube) to tilt into a tilted orbit · every tube edge is a depth-tested triangle';
    const cSize = 19;
    layoutStr(inst, cap, SUB, atlas.table, font, { x: x0 + width / 2 - tw(cap, font, cSize) / 2, y: y0 + height - 44, size: cSize });
    layoutStr(inst, 'x', RED, atlas.table, font, { x: ax[0] + axLen + 10, y: ax[1] - 12, size: 26 });
    layoutStr(inst, 'y', GREEN, atlas.table, font, { x: ax[0] + 6, y: ax[1] - axLen * 0.7 - 26, size: 26 });
    layoutStr(inst, 'z', BLUE, atlas.table, font, { x: ax[0] + 10, y: ax[1] - 6, size: 26 });
  }
}
