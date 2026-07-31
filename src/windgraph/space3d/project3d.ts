// ── windgraph · 3D shared constants (Phase 7) ─────────────────────────────────
// Shared light + shading + colormap helpers for the mesh3d pipeline and its
// content builders (loss surface, extrude walls, curve tubes). The v1 CPU
// `Projector` (painter-sorted 3D→2D projection) was REMOVED — windgraph v2
// renders all 3D bodies through the GPU mesh3d pipeline (mesh3d.ts) with one
// orbit camera; no consumer of Projector remained.

// Unit light direction for simple Lambert shading of surface faces.
export const LIGHT_DIR: [number, number, number] = (() => {
  const v: [number, number, number] = [0.35, -0.5, 0.8];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

// Cross product of (b-a)×(c-a), normalized (face normal for shading).
export function faceNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// A viridis-ish colormap: t∈[0,1] → RGB (perceptually smooth, dark→teal→yellow).
export function colormap(t: number): [number, number, number] {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.27, 0.00, 0.33]],
    [0.25, [0.23, 0.32, 0.55]],
    [0.5, [0.13, 0.57, 0.55]],
    [0.75, [0.37, 0.79, 0.38]],
    [1.0, [0.99, 0.91, 0.14]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const u = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return stops[stops.length - 1][1];
}
