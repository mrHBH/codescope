// ── True-3D loss landscape (mesh pipeline) ───────────────────────────────────
// A REAL 3D triangle mesh for z = L(w₁,w₂) in the Surface3DDemo mould: pre-shaded
// Gouraud faces (height colormap × Lambert), floor grid + axes, and the gradient
// -descent path rendered as a glowing 3D line with a ball that rides it. Drawn by
// the mesh pipeline through the same orbit camera + shared depth buffer, so it
// rises off the ground plane and self-occludes — the analytic explainer content
// stays crisp on top. Tris are cached (static surface); lines rebuild per frame
// only while the ball is animating.

import { colormap, LIGHT_DIR } from '../../windgraph/space3d/project3d';

export interface Mesh3 { tris: Float32Array; lines: Float32Array; }

function L(x: number, y: number): number {
  return 0.055 * (x * x + y * y)
    + 0.85 * Math.sin(1.1 * x) * Math.cos(1.1 * y)
    + 0.35 * Math.cos(2.2 * x) * Math.sin(1.6 * y);
}
function grad(x: number, y: number): [number, number] {
  const h = 0.02;
  return [(L(x + h, y) - L(x - h, y)) / (2 * h), (L(x, y + h) - L(x, y - h)) / (2 * h)];
}
const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class LossSurface3D {
  cx = 0; cy = 0;
  uScale = 62; hScale = 150; res = 60;
  readonly xMin = -5; readonly xMax = 5; readonly yMin = -5; readonly yMax = 5;
  private tris: Float32Array | null = null;
  private zBase = 0;
  private path: [number, number][] = [];

  get halfSpan(): number { return ((this.xMax - this.xMin) / 2) * this.uScale + 60; }

  private P(x: number, y: number, z: number): [number, number, number] {
    return [this.cx + x * this.uScale, this.cy + y * this.uScale, -(z - this.zBase) * this.hScale];
  }

  private buildPath() {
    if (this.path.length) return;
    let x = 3.9, y = -3.4;
    this.path.push([x, y]);
    for (let k = 0; k < 70; k++) {
      const [gx, gy] = grad(x, y);
      x = clampN(x - 0.09 * gx, this.xMin, this.xMax);
      y = clampN(y - 0.09 * gy, this.yMin, this.yMax);
      this.path.push([x, y]);
    }
  }

  buildMesh(): Mesh3 {
    if (!this.tris) this.buildTris();
    // Lines rebuild each frame (the ball rides the path); tris are static.
    return { tris: this.tris!, lines: this.buildLines() };
  }

  private buildTris() {
    const N = this.res;
    const dx = (this.xMax - this.xMin) / N, dy = (this.yMax - this.yMin) / N;
    const gw = N + 1;
    const zg: number[] = new Array(gw * gw);
    let zMin = Infinity, zMax = -Infinity;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const z = L(this.xMin + i * dx, this.yMin + j * dy);
      zg[j * gw + i] = z; if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
    this.zBase = zMin;
    const zSpan = Math.max(zMax - zMin, 1e-6);
    const zAt = (i: number, j: number) => zg[j * gw + i];
    this.buildPath();

    const slope = this.hScale / this.uScale;
    const vColor: number[][] = new Array(gw * gw);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const zR = zAt(Math.min(i + 1, N), j), zLe = zAt(Math.max(i - 1, 0), j);
      const zU = zAt(i, Math.min(j + 1, N)), zD = zAt(i, Math.max(j - 1, 0));
      const dzdx = (zR - zLe) / (2 * dx) * slope, dzdy = (zU - zD) / (2 * dy) * slope;
      let nx = -dzdx, ny = -dzdy, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
      const lambert = Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
      const shade = 0.4 + 0.6 * lambert;
      const cm = colormap((zAt(i, j) - zMin) / zSpan);
      vColor[j * gw + i] = [cm[0] * shade, cm[1] * shade, cm[2] * shade, 1];
    }

    const tris: number[] = [];
    const pushV = (arr: number[], p: [number, number, number], c: number[]) => { arr.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]); };
    const vAt = (i: number, j: number): [[number, number, number], number[]] =>
      [this.P(this.xMin + i * dx, this.yMin + j * dy, zAt(i, j)), vColor[j * gw + i]];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const [P00, c00] = vAt(i, j), [P10, c10] = vAt(i + 1, j), [P11, c11] = vAt(i + 1, j + 1), [P01, c01] = vAt(i, j + 1);
      pushV(tris, P00, c00); pushV(tris, P11, c11); pushV(tris, P10, c10);
      pushV(tris, P00, c00); pushV(tris, P01, c01); pushV(tris, P11, c11);
    }
    this.tris = new Float32Array(tris);
  }

  private buildLines(): Float32Array {
    const N = this.res;
    const dx = (this.xMax - this.xMin) / N, dy = (this.yMax - this.yMin) / N;
    const zAt = (x: number, y: number) => L(x, y);
    const lines: number[] = [];
    const pushL = (p: [number, number, number], c: number[]) => { lines.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]); };

    // Floor grid + axes at the surface base.
    const grid = [0.55, 0.60, 0.74, 0.30];
    const axis = [0.85, 0.88, 0.96, 0.9];
    const zb = this.zBase;
    const G = 10;
    for (let i = 0; i <= G; i++) {
      const x = this.xMin + (this.xMax - this.xMin) * (i / G);
      const y = this.yMin + (this.yMax - this.yMin) * (i / G);
      pushL(this.P(x, this.yMin, zb), grid); pushL(this.P(x, this.yMax, zb), grid);
      pushL(this.P(this.xMin, y, zb), grid); pushL(this.P(this.xMax, y, zb), grid);
    }
    pushL(this.P(this.xMin, this.yMin, zb), axis); pushL(this.P(this.xMax, this.yMin, zb), axis);
    pushL(this.P(this.xMin, this.yMin, zb), axis); pushL(this.P(this.xMin, this.yMax, zb), axis);
    pushL(this.P(this.xMin, this.yMin, zb), axis); pushL(this.P(this.xMin, this.yMin, this.zBase + 3.2), axis);

    // Sparse wireframe over the surface (read-aid).
    const wire = [0.05, 0.06, 0.10, 0.30];
    const step = Math.max(1, Math.round(N / 12));
    for (let j = 0; j <= N; j += step) for (let i = 0; i < N; i++) {
      const x0 = this.xMin + i * dx, x1 = x0 + dx, y = this.yMin + j * dy;
      pushL(this.P(x0, y, zAt(x0, y)), wire); pushL(this.P(x1, y, zAt(x1, y)), wire);
    }
    for (let i = 0; i <= N; i += step) for (let j = 0; j < N; j++) {
      const y0 = this.yMin + j * dy, y1 = y0 + dy, x = this.xMin + i * dx;
      pushL(this.P(x, y0, zAt(x, y0)), wire); pushL(this.P(x, y1, zAt(x, y1)), wire);
    }

    // Descent path, lifted slightly above the surface.
    this.buildPath();
    const lift = 0.07;
    const gold = [0.97, 0.73, 0.33, 0.95];
    for (let k = 0; k < this.path.length - 1; k++) {
      const [ax, ay] = this.path[k], [bx, by] = this.path[k + 1];
      pushL(this.P(ax, ay, zAt(ax, ay) + lift), gold);
      pushL(this.P(bx, by, zAt(bx, by) + lift), gold);
    }

    // Ball riding the path (animated by wall clock while the surface is in view).
    const t = ((performance.now() / 1000) % 9) / 9;
    const fi = t * (this.path.length - 1);
    const k0 = Math.floor(fi), f = fi - k0;
    const a0 = this.path[Math.min(k0, this.path.length - 1)];
    const a1 = this.path[Math.min(k0 + 1, this.path.length - 1)];
    const bx = a0[0] + (a1[0] - a0[0]) * f, by = a0[1] + (a1[1] - a0[1]) * f;
    const bz = zAt(bx, by) + lift + 0.05;
    const bc = this.P(bx, by, bz);
    const ball = [1.0, 0.88, 0.5, 1.0];
    const R = 0.24, SEG = 14;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, b = ((s + 1) / SEG) * Math.PI * 2;
      pushL([bc[0] + Math.cos(a) * R * this.uScale, bc[1] + Math.sin(a) * R * this.uScale, bc[2]], ball);
      pushL([bc[0] + Math.cos(b) * R * this.uScale, bc[1] + Math.sin(b) * R * this.uScale, bc[2]], ball);
      pushL([bc[0] + Math.cos(a) * R * this.uScale, bc[1], bc[2] + Math.sin(a) * R * this.hScale * 0.6], ball);
      pushL([bc[0] + Math.cos(b) * R * this.uScale, bc[1], bc[2] + Math.sin(b) * R * this.hScale * 0.6], ball);
    }
    return new Float32Array(lines);
  }
}
