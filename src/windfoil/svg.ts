// ── SVG path → quads ─────────────────────────────────────────────────────────
// Parses a filled SVG path `d` string into the same quadratic-piece format the
// font pipeline uses (each piece is x0,y0, cx,cy, x1,y1). Lines are encoded as
// degenerate quads (control point at the midpoint). Cubics are split into two
// quads with the same midpoint approximation as font.ts's cubicToQuads. Arcs are
// flattened to cubics. Coordinates stay in the path's own (Y-down) space, which
// matches the renderer's world convention, so no axis flip is needed.

function cubicToQuads(x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, out: number[]) {
  const m = (a: number, b: number) => (a + b) / 2;
  const ax = m(x0, c1x), ay = m(y0, c1y), bx = m(c1x, c2x), by = m(c1y, c2y);
  const cx = m(c2x, x1), cy = m(c2y, y1), dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy);
  const mx = m(dx, ex), my = m(dy, ey);
  out.push(x0, y0, 1.5 * dx - 0.25 * (x0 + mx), 1.5 * dy - 0.25 * (y0 + my), mx, my);
  out.push(mx, my, 1.5 * ex - 0.25 * (mx + x1), 1.5 * ey - 0.25 * (my + y1), x1, y1);
}

// Endpoint-parameterised elliptical arc → a chain of cubic beziers.
function arcToCubics(x0: number, y0: number, rx: number, ry: number, phi: number, largeArc: number, sweep: number, x1: number, y1: number, out: number[]) {
  if (rx === 0 || ry === 0) { line(x0, y0, x1, y1, out); return; }
  const rad = (phi * Math.PI) / 180;
  const cosp = Math.cos(rad), sinp = Math.sin(rad);
  const dx2 = (x0 - x1) / 2, dy2 = (y0 - y1) / 2;
  const x1p = cosp * dx2 + sinp * dy2, y1p = -sinp * dx2 + cosp * dy2;
  let arx = Math.abs(rx), ary = Math.abs(ry);
  const lambda = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
  if (lambda > 1) { const s = Math.sqrt(lambda); arx *= s; ary *= s; }
  const sign = largeArc !== sweep ? 1 : -1;
  let num = arx * arx * ary * ary - arx * arx * y1p * y1p - ary * ary * x1p * x1p;
  const den = arx * arx * y1p * y1p + ary * ary * x1p * x1p;
  num = Math.max(num, 0);
  const co = sign * Math.sqrt(num / den || 0);
  const cxp = (co * arx * y1p) / ary, cyp = (-co * ary * x1p) / arx;
  const cx = cosp * cxp - sinp * cyp + (x0 + x1) / 2;
  const cy = sinp * cxp + cosp * cyp + (y0 + y1) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy, len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(Math.max(dot / len, -1), 1));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta0 = ang(1, 0, (x1p - cxp) / arx, (y1p - cyp) / ary);
  let dtheta = ang((x1p - cxp) / arx, (y1p - cyp) / ary, (-x1p - cxp) / arx, (-y1p - cyp) / ary);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  else if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dtheta) / (Math.PI / 2));
  const delta = dtheta / segs;
  const t = (4 / 3) * Math.tan(delta / 4);
  let px = x0, py = y0, theta = theta0;
  for (let i = 0; i < segs; i++) {
    const cos1 = Math.cos(theta), sin1 = Math.sin(theta);
    const theta2 = theta + delta;
    const cos2 = Math.cos(theta2), sin2 = Math.sin(theta2);
    const e1x = cx + arx * cos1 * cosp - ary * sin1 * sinp;
    const e1y = cy + arx * cos1 * sinp + ary * sin1 * cosp;
    const e2x = cx + arx * cos2 * cosp - ary * sin2 * sinp;
    const e2y = cy + arx * cos2 * sinp + ary * sin2 * cosp;
    const d1x = -arx * sin1 * cosp - ary * cos1 * sinp;
    const d1y = -arx * sin1 * sinp + ary * cos1 * cosp;
    const d2x = -arx * sin2 * cosp - ary * cos2 * sinp;
    const d2y = -arx * sin2 * sinp + ary * cos2 * cosp;
    cubicToQuads(px, py, e1x + t * d1x, e1y + t * d1y, e2x - t * d2x, e2y - t * d2y, e2x, e2y, out);
    px = e2x; py = e2y; theta = theta2;
  }
}

function line(x0: number, y0: number, x1: number, y1: number, out: number[]) {
  out.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1);
}

function tokenize(d: string): (number | string)[] {
  const tokens: (number | string)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) tokens.push(m[1] !== undefined ? m[1] : parseFloat(m[2]));
  return tokens;
}

export interface PathGeometry { quads: number[]; bbox: number[]; }

// Parse one or more SVG path `d` strings (a compound icon) into a single quad set.
export function svgPathToQuads(dStrings: string | string[]): PathGeometry {
  const list = Array.isArray(dStrings) ? dStrings : [dStrings];
  const quads: number[] = [];
  for (const d of list) parseOne(d, quads);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < quads.length; i += 2) {
    x0 = Math.min(x0, quads[i]); x1 = Math.max(x1, quads[i]);
    y0 = Math.min(y0, quads[i + 1]); y1 = Math.max(y1, quads[i + 1]);
  }
  return { quads, bbox: [x0, y0, x1, y1] };
}

function parseOne(d: string, out: number[]) {
  const t = tokenize(d);
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  let prevCtrlX = 0, prevCtrlY = 0, prevCmd = '';
  const num = () => t[i++] as number;
  const isNum = () => typeof t[i] === 'number';
  while (i < t.length) {
    let cmd = t[i] as string;
    if (typeof cmd === 'number') { cmd = prevCmd === 'M' ? 'L' : prevCmd === 'm' ? 'l' : prevCmd; }
    else i++;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy; }
      cx = x; cy = y; sx = x; sy = y;
      while (isNum()) { let lx = num(), ly = num(); if (rel) { lx += cx; ly += cy; } line(cx, cy, lx, ly, out); cx = lx; cy = ly; }
    } else if (C === 'L') {
      while (isNum()) { let x = num(), y = num(); if (rel) { x += cx; y += cy; } line(cx, cy, x, y, out); cx = x; cy = y; }
    } else if (C === 'H') {
      while (isNum()) { let x = num(); if (rel) x += cx; line(cx, cy, x, cy, out); cx = x; }
    } else if (C === 'V') {
      while (isNum()) { let y = num(); if (rel) y += cy; line(cx, cy, cx, y, out); cy = y; }
    } else if (C === 'C') {
      while (isNum()) {
        let c1x = num(), c1y = num(), c2x = num(), c2y = num(), x = num(), y = num();
        if (rel) { c1x += cx; c1y += cy; c2x += cx; c2y += cy; x += cx; y += cy; }
        cubicToQuads(cx, cy, c1x, c1y, c2x, c2y, x, y, out);
        prevCtrlX = c2x; prevCtrlY = c2y; cx = x; cy = y;
      }
    } else if (C === 'S') {
      while (isNum()) {
        let c2x = num(), c2y = num(), x = num(), y = num();
        if (rel) { c2x += cx; c2y += cy; x += cx; y += cy; }
        const c1x = (prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S') ? 2 * cx - prevCtrlX : cx;
        const c1y = (prevCmd.toUpperCase() === 'C' || prevCmd.toUpperCase() === 'S') ? 2 * cy - prevCtrlY : cy;
        cubicToQuads(cx, cy, c1x, c1y, c2x, c2y, x, y, out);
        prevCtrlX = c2x; prevCtrlY = c2y; cx = x; cy = y; prevCmd = cmd;
      }
    } else if (C === 'Q') {
      while (isNum()) {
        let c1x = num(), c1y = num(), x = num(), y = num();
        if (rel) { c1x += cx; c1y += cy; x += cx; y += cy; }
        out.push(cx, cy, c1x, c1y, x, y);
        prevCtrlX = c1x; prevCtrlY = c1y; cx = x; cy = y;
      }
    } else if (C === 'T') {
      while (isNum()) {
        let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        const c1x = (prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T') ? 2 * cx - prevCtrlX : cx;
        const c1y = (prevCmd.toUpperCase() === 'Q' || prevCmd.toUpperCase() === 'T') ? 2 * cy - prevCtrlY : cy;
        out.push(cx, cy, c1x, c1y, x, y);
        prevCtrlX = c1x; prevCtrlY = c1y; cx = x; cy = y; prevCmd = cmd;
      }
    } else if (C === 'A') {
      while (isNum()) {
        const rx = num(), ry = num(), rot = num(), laf = num(), sf = num();
        let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        arcToCubics(cx, cy, rx, ry, rot, laf, sf, x, y, out);
        cx = x; cy = y;
      }
    } else if (C === 'Z') {
      if (cx !== sx || cy !== sy) line(cx, cy, sx, sy, out);
      cx = sx; cy = sy;
    }
    prevCmd = cmd;
  }
}
