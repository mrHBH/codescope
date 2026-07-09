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
