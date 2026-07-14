// ── windgraph · Phase-7 true-3D surface ──────────────────────────────────────
// Builds a REAL 3D triangle mesh (+ axes/grid/wireframe lines) for z = f(x,y),
// in document-local coordinates so the shared orbit view-projection places it in
// the same 3D world as the document — the surface rises off the ground plane and
// you orbit it with the real free-camera. Faces are pre-shaded (height colormap ×
// Lambert); the mesh pipeline handles depth/self-occlusion.
//
// Coordinate note: the ground model maps doc (x, y, z) → world (x, -z, y), so a
// positive height becomes doc-local -z (which rises to world +y, i.e. UP).

import { colormap, faceNormal, LIGHT_DIR } from './project3d';

export interface Mesh3 { tris: Float32Array; lines: Float32Array; }

export class Surface3DDemo {
  // Ground footprint centre (doc-local) + scales.
  cx = 0;
  cy = 0;
  uScale = 78;    // doc px per data unit (x/y)
  hScale = 150;   // doc px per unit height (z)
  res = 40;

  readonly xMin = -5; readonly xMax = 5; readonly yMin = -5; readonly yMax = 5;
  private mesh: Mesh3 | null = null;

  // footprint half-extent (doc px) — for camera framing.
  get halfSpan(): number { return (this.xMax - this.xMin) / 2 * this.uScale; }

  private f(x: number, y: number): number { return 2.4 * Math.sin(Math.sqrt(x * x + y * y)); }

  // doc-local position of a data point (x, y, height=f). Height → -z (rises up).
  private P(x: number, y: number, z: number): [number, number, number] {
    return [this.cx + x * this.uScale, this.cy + y * this.uScale, -z * this.hScale];
  }

  buildMesh(): Mesh3 {
    if (this.mesh) return this.mesh;
    const N = this.res;
    const dx = (this.xMax - this.xMin) / N, dy = (this.yMax - this.yMin) / N;
    const zg: number[] = new Array((N + 1) * (N + 1));
    let zMin = Infinity, zMax = -Infinity;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const z = this.f(this.xMin + i * dx, this.yMin + j * dy);
      zg[j * (N + 1) + i] = z; if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
    const zSpan = Math.max(zMax - zMin, 1e-6);
    const zAt = (i: number, j: number) => zg[j * (N + 1) + i];

    const tris: number[] = [];
    const lines: number[] = [];
    const pushV = (arr: number[], p: [number, number, number], c: number[]) => { arr.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]); };

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x0 = this.xMin + i * dx, y0 = this.yMin + j * dy, x1 = x0 + dx, y1 = y0 + dy;
        const z00 = zAt(i, j), z10 = zAt(i + 1, j), z11 = zAt(i + 1, j + 1), z01 = zAt(i, j + 1);
        const d00: number[] = [x0, y0, z00], d10: number[] = [x1, y0, z10], d11: number[] = [x1, y1, z11], d01: number[] = [x0, y1, z01];
        let n = faceNormal(d00, d11, d10); if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
        const lambert = Math.max(0, n[0] * LIGHT_DIR[0] + n[1] * LIGHT_DIR[1] + n[2] * LIGHT_DIR[2]);
        const shade = 0.42 + 0.58 * lambert;
        const zAvg = (z00 + z10 + z11 + z01) / 4;
        const cm = colormap((zAvg - zMin) / zSpan);
        const col = [cm[0] * shade, cm[1] * shade, cm[2] * shade, 1];
        const P00 = this.P(x0, y0, z00), P10 = this.P(x1, y0, z10), P11 = this.P(x1, y1, z11), P01 = this.P(x0, y1, z01);
        pushV(tris, P00, col); pushV(tris, P11, col); pushV(tris, P10, col);
        pushV(tris, P00, col); pushV(tris, P01, col); pushV(tris, P11, col);
      }
    }

    // Wireframe (every 2 cells) — subtle dark lines on the surface.
    const wire = [0.05, 0.06, 0.09, 0.5];
    const step = 2;
    for (let j = 0; j <= N; j += step) for (let i = 0; i < N; i++) {
      const x0 = this.xMin + i * dx, x1 = x0 + dx, y = this.yMin + j * dy;
      pushV(lines, this.P(x0, y, zAt(i, j)), wire); pushV(lines, this.P(x1, y, zAt(i + 1, j)), wire);
    }
    for (let i = 0; i <= N; i += step) for (let j = 0; j < N; j++) {
      const y0 = this.yMin + j * dy, y1 = y0 + dy, x = this.xMin + i * dx;
      pushV(lines, this.P(x, y0, zAt(i, j)), wire); pushV(lines, this.P(x, y1, zAt(i, j + 1)), wire);
    }

    // 3D axes + floor grid at z = zMin (the base plane).
    const axis = [0.85, 0.88, 0.96, 0.95];
    const grid = [0.6, 0.64, 0.75, 0.32];
    const zb = zMin;
    const G = 10;
    for (let i = 0; i <= G; i++) {
      const x = this.xMin + (this.xMax - this.xMin) * (i / G);
      const y = this.yMin + (this.yMax - this.yMin) * (i / G);
      pushV(lines, this.P(x, this.yMin, zb), grid); pushV(lines, this.P(x, this.yMax, zb), grid);
      pushV(lines, this.P(this.xMin, y, zb), grid); pushV(lines, this.P(this.xMax, y, zb), grid);
    }
    pushV(lines, this.P(this.xMin, this.yMin, zb), axis); pushV(lines, this.P(this.xMax, this.yMin, zb), axis);
    pushV(lines, this.P(this.xMin, this.yMin, zb), axis); pushV(lines, this.P(this.xMin, this.yMax, zb), axis);
    pushV(lines, this.P(this.xMin, this.yMin, zb), axis); pushV(lines, this.P(this.xMin, this.yMin, zMax), axis);

    this.mesh = { tris: new Float32Array(tris), lines: new Float32Array(lines) };
    return this.mesh;
  }
}
