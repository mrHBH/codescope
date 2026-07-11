// ── Quad primitives ──────────────────────────────────────────────────────────
// The renderer represents every outline as a flat array of quadratic pieces,
// each 6 floats: x0,y0, cx,cy, x1,y1. These helpers build that representation and
// are shared by the font outline reader (font.ts) and the SVG path parser (svg.ts).

// A straight line as a degenerate quad (control point at the midpoint).
export function lineToQuad(x0: number, y0: number, x1: number, y1: number, out: number[]) {
  out.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1);
}

// A cubic bezier split into two quadratics via midpoint approximation.
export function cubicToQuads(x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, out: number[]) {
  const m = (a: number, b: number) => (a + b) / 2;
  const ax = m(x0, c1x), ay = m(y0, c1y), bx = m(c1x, c2x), by = m(c1y, c2y);
  const cx = m(c2x, x1), cy = m(c2y, y1), dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy);
  const mx = m(dx, ex), my = m(dy, ey);
  out.push(x0, y0, 1.5 * dx - 0.25 * (x0 + mx), 1.5 * dy - 0.25 * (y0 + my), mx, my);
  out.push(mx, my, 1.5 * ex - 0.25 * (mx + x1), 1.5 * ey - 0.25 * (my + y1), x1, y1);
}

// Axis-aligned bounding box [x0,y0,x1,y1] of a flat quads array (every 2 floats
// is a point). Returns null for an empty array.
export function quadsBBox(quads: number[]): number[] | null {
  if (quads.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < quads.length; i += 2) {
    x0 = Math.min(x0, quads[i]); x1 = Math.max(x1, quads[i]);
    y0 = Math.min(y0, quads[i + 1]); y1 = Math.max(y1, quads[i + 1]);
  }
  return [x0, y0, x1, y1];
}

function extremumT(p0: number, p1: number, p2: number): number | null {
  const a = p0 - 2 * p1 + p2;
  if (a === 0) return null;
  const t = (p0 - p1) / a;
  return t > 0 && t < 1 ? t : null;
}

function subdivide(q: number[], t: number): [number[], number[]] {
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const x01 = lerp(q[0], q[2]), y01 = lerp(q[1], q[3]);
  const x12 = lerp(q[2], q[4]), y12 = lerp(q[3], q[5]);
  const xm = lerp(x01, x12), ym = lerp(y01, y12);
  return [
    [q[0], q[1], x01, y01, xm, ym],
    [xm, ym, x12, y12, q[4], q[5]],
  ];
}

export function pushMonotonePieces(q: number[], out: number[]) {
  const tx = extremumT(q[0], q[2], q[4]);
  const ty = extremumT(q[1], q[3], q[5]);
  let first: number | null = null, second: number | null = null;
  if (tx !== null && ty !== null) {
    first = Math.min(tx, ty);
    second = Math.max(tx, ty);
  } else {
    first = tx !== null ? tx : ty;
  }
  let rest = q;
  let consumed = 0;
  for (const t of [first, second]) {
    if (t === null) continue;
    const denom = 1 - consumed;
    const local = denom > 0 ? (t - consumed) / denom : 1;
    if (!(local > 0 && local < 1)) continue;
    const [l, r] = subdivide(rest, local);
    out.push(...l);
    rest = r;
    consumed = t;
  }
  out.push(...rest);
}
