// ── windgraph · Phase-7 true-3D surface ──────────────────────────────────────
// Builds a REAL 3D triangle mesh (+ axes/grid/wireframe lines) for z = f(x,y),
// in document-local coordinates so the shared orbit view-projection places it in
// the same 3D world as the document — the surface rises off the ground plane and
// you orbit it with the real free-camera. Faces are pre-shaded (height colormap ×
// Lambert); the mesh pipeline handles depth/self-occlusion.
//
// Coordinate note: the ground model maps doc (x, y, z) → world (x, -z, y), so a
// positive height becomes doc-local -z (which rises to world +y, i.e. UP).

import { colormap, LIGHT_DIR } from '../../windgraph/space3d/project3d';

export interface Mesh3 { tris: Float32Array; lines: Float32Array; }

export class Surface3DDemo {
  // Ground footprint centre (doc-local) + scales.
  cx = 0;
  cy = 0;
  uScale = 78;    // doc px per data unit (x/y)
  hScale = 150;   // doc px per unit height (z)
  res = 72;

  readonly xMin = -5; readonly xMax = 5; readonly yMin = -5; readonly yMax = 5;
  private mesh: Mesh3 | null = null;
  private zBase = 0;   // data-z that maps to the ground plane (doc z = 0)

  // footprint half-extent (doc px) — for camera framing.
  get halfSpan(): number { return (this.xMax - this.xMin) / 2 * this.uScale; }

  private f(x: number, y: number): number { return 2.4 * Math.sin(Math.sqrt(x * x + y * y)); }

  // doc-local position of a data point (x, y, height=f). The surface's LOWEST
  // point sits on the ground plane (doc z = 0, coplanar with the 2D document /
  // boards) and rises UP from there (height → doc -z → world +Y).
  private P(x: number, y: number, z: number): [number, number, number] {
    return [this.cx + x * this.uScale, this.cy + y * this.uScale, -(z - this.zBase) * this.hScale];
  }

  buildMesh(): Mesh3 {
    if (this.mesh) return this.mesh;
    const N = this.res;
    const dx = (this.xMax - this.xMin) / N, dy = (this.yMax - this.yMin) / N;
    const gw = N + 1;
    const zg: number[] = new Array(gw * gw);
    let zMin = Infinity, zMax = -Infinity;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const z = this.f(this.xMin + i * dx, this.yMin + j * dy);
      zg[j * gw + i] = z; if (z < zMin) zMin = z; if (z > zMax) zMax = z;
    }
    const zSpan = Math.max(zMax - zMin, 1e-6);
    const zAt = (i: number, j: number) => zg[j * gw + i];
    this.zBase = zMin; // floor of the surface → ground plane (doc z = 0)

    // SMOOTH per-vertex normals from the height-field gradient (central diffs),
    // scaled by the geometry's aspect (hScale/uScale) so the lighting matches the
    // rendered steepness. Gouraud-interpolated across triangles → no faceting.
    const slope = this.hScale / this.uScale;
    const vColor: number[][] = new Array(gw * gw);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const zR = zAt(Math.min(i + 1, N), j), zL = zAt(Math.max(i - 1, 0), j);
      const zU = zAt(i, Math.min(j + 1, N)), zD = zAt(i, Math.max(j - 1, 0));
      const dzdx = (zR - zL) / (2 * dx) * slope;
      const dzdy = (zU - zD) / (2 * dy) * slope;
      let nx = -dzdx, ny = -dzdy, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
      const lambert = Math.max(0, nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
      const shade = 0.4 + 0.6 * lambert;
      const cm = colormap((zAt(i, j) - zMin) / zSpan);
      vColor[j * gw + i] = [cm[0] * shade, cm[1] * shade, cm[2] * shade, 1];
    }

    const tris: number[] = [];
    const lines: number[] = [];
    const pushV = (arr: number[], p: [number, number, number], c: number[]) => { arr.push(p[0], p[1], p[2], c[0], c[1], c[2], c[3]); };
    const vAt = (i: number, j: number): [[number, number, number], number[]] => [this.P(this.xMin + i * dx, this.yMin + j * dy, zAt(i, j)), vColor[j * gw + i]];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const [P00, c00] = vAt(i, j), [P10, c10] = vAt(i + 1, j), [P11, c11] = vAt(i + 1, j + 1), [P01, c01] = vAt(i, j + 1);
        pushV(tris, P00, c00); pushV(tris, P11, c11); pushV(tris, P10, c10);
        pushV(tris, P00, c00); pushV(tris, P01, c01); pushV(tris, P11, c11);
      }
    }

    // Sparse wireframe (major lines only) — a light read-aid without clutter.
    const wire = [0.04, 0.05, 0.08, 0.35];
    const step = Math.max(1, Math.round(N / 12));
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
