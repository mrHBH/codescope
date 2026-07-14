// ── windgraph · 3D→2D projection (Phase 7) ───────────────────────────────────
// The windfoil shader draws every instance flat on z=0, so 3D graphing is done
// by projecting 3D geometry to 2D WORLD coordinates on the CPU each frame and
// drawing analytic fills/strokes (painter-sorted back-to-front). This keeps the
// single-draw-call analytic pipeline (crisp at any zoom) with zero shader change.
//
// Convention: world axes x,y horizontal, z UP. `az` orbits about the z axis,
// `el` tilts the view down. project() returns a 2D screen position (pre-scale)
// plus a depth for painter sorting (larger depth = farther from the viewer).

export interface Projected { sx: number; sy: number; depth: number; }

export class Projector {
  az = 0.7;      // azimuth (radians)
  el = 0.5;      // elevation (radians), 0 = edge-on, π/2 = top-down
  scale = 1;     // world px per data unit
  ox = 0; oy = 0; // 2D world origin the projection is placed at

  project(x: number, y: number, z: number): Projected {
    const ca = Math.cos(this.az), sa = Math.sin(this.az);
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    // Rotate about z (azimuth).
    const rx = x * ca + y * sa;
    const ry = -x * sa + y * ca;
    // Tilt about x (elevation): screen-up gets height + tilted depth.
    const sx = rx;
    const sy = z * ce - ry * se;
    const depth = ry * ce + z * se;
    return { sx, sy, depth };
  }

  /** Project to 2D WORLD coordinates (y-down), ready to feed the fill/stroke engine. */
  toWorld(x: number, y: number, z: number): [number, number] {
    const p = this.project(x, y, z);
    return [this.ox + p.sx * this.scale, this.oy - p.sy * this.scale];
  }

  /** Camera-space depth only (for painter sorting). */
  depthOf(x: number, y: number, z: number): number {
    const ca = Math.cos(this.az), sa = Math.sin(this.az);
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    const ry = -x * sa + y * ca;
    return ry * ce + z * se;
  }
}

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
