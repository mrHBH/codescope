import type { Box3DModule, b3WorldId, b3BodyId, EventsBuffer, BodyMoveEvent } from 'box3d.js';
import { fxHash, type Fx } from './types';

const PX2M = 0.01;
const M2PX = 1 / PX2M;
const GRAVITY = 30;
const STEP = 1 / 60;
const SUBSTEPS = 2;
const RADIUS = 230;
const COMBO_MS = 450;
const SIG_MOD = 999983;
const THICK = 0.05;
const FLOOR_T = 0.1;
const FLOOR_HALF = 500;
const RECT_AREA_MAX = 400000;
const RECT_ALPHA = 0.9;
const KPLANES = 6;
const CLIP_STRIDE = KPLANES * 4;
const GRID_CELL = 64;

const LAY_AB = 50;
const LAY_SB = 340;
const LAY_TREE_Y = 141;
const LAY_TAB_H = 36;
const IDQ = { v: { x: 0, y: 0, z: 0 }, s: 1 };

interface Shard {
  body: b3BodyId;
  bkey: string;
  snap: Float32Array;
  homeX: number;
  homeY: number;
  sig: number;
  homeCx: number;
  homeCy: number;
  homeHx: number;
  homeHy: number;
  sc: number;
  isRect: boolean;
  sx: number;
  sy: number;
  bw: number;
  bh: number;
  hx: number;
  hy: number;
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  fa: Float32Array;
  xf: Float32Array;
  clip: Float32Array | null;
  asleep: boolean;
  dorm: boolean;
  dormIdx: number;
  claimedFrame: number;
}

let b3: Box3DModule | null = null;
let loading: Promise<void> | null = null;
let world: b3WorldId | null = null;
let worldW = 0;
let worldH = 0;

let live: Shard[] = [];
let dormant: Shard[] = [];
let dormFA = new Float32Array(16384);
let dormXF = new Float32Array(8192);
let dormCL = new Float32Array(8192);
let dormN = 0;

let byBKey = new Map<string, Shard>();
let shardByKey = new Map<number, Shard>();
let rectKeys = new Set<number>();
let grid = new Map<number, Shard[]>();
let homeGrid = new Map<number, Shard[]>();
let gridDirty = true;

let frameId = 0;
let hov: Shard | null = null;
let acc = 0;
let extraFA = new Float32Array(16384);
let extraXF = new Float32Array(8192);
let extraCL = new Float32Array(8192);
let extraN = 0;
let clickSeq = 0;
let lastCoverage = 0;
const ZERO24 = new Float32Array(CLIP_STRIDE);
let lastClickNow = -1e9;
let combo = 0;
let evBuf: EventsBuffer | null = null;
let moveEvt: BodyMoveEvent | null = null;
let pendingTreeDy = 0;
let pendingEdDy = 0;

const LARGE_RECT_AREA = 18000;
const CLICKS_PER_PHASE = 3;
let phase = 0;
let clicksInPhase = 0;

function ensureBox3D(): void {
  if (b3 || loading) return;
  loading = import('box3d.js/inline')
    .then((m) => m.default())
    .then((m) => { b3 = m; });
}

function bodyKey(id: b3BodyId): string {
  return id.index1 + ':' + id.generation;
}

function instSig(inst: ArrayLike<number>, i: number): number {
  return Math.round((inst[i + 6] - inst[i + 4]) * (inst[i + 7] - inst[i + 5])) % SIG_MOD;
}

function hideKey(x: number, y: number, sig: number): number {
  return ((Math.round(x * 2) + 40000) * 100000 + (Math.round(y * 2) + 40000)) * SIG_MOD + sig;
}

function scrollCfg(inst: ArrayLike<number>, i: number): number {
  const x = inst[i], y = inst[i + 1];
  if (y > worldH - 24) return 0;
  if (x >= LAY_AB && x < LAY_AB + LAY_SB && y > LAY_TREE_Y) return 1;
  if (x >= LAY_AB + LAY_SB && x <= worldW && y >= LAY_TAB_H) return 2;
  return 0;
}

function setPose(s: Shard, px: number, py: number, pz: number, rx: number, ry: number, rz: number, rw: number): void {
  s.px = px * M2PX;
  s.py = -py * M2PX;
  s.pz = pz * M2PX;
  const qx = -rx, qy = ry, qz = -rz;
  const qw = rw;
  const inv = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  s.qx = qx * inv;
  s.qy = qy * inv;
  s.qz = qz * inv;
  s.qw = qw * inv;
}

function writeFloats(s: Shard): void {
  const u2px = s.snap[2];
  s.fa.set(s.snap);
  s.fa[0] = s.px - ((s.snap[4] + s.snap[6]) / 2) * u2px;
  s.fa[1] = s.py - ((s.snap[5] + s.snap[7]) / 2) * u2px;
  s.xf[0] = 0;
  s.xf[1] = 0;
  s.xf[2] = s.pz;
  s.xf[3] = 1;
  s.xf[4] = s.qx;
  s.xf[5] = s.qy;
  s.xf[6] = s.qz;
  s.xf[7] = s.qw;
}

function tint(fa: Float32Array, o: number, s: Shard): void {
  fa[o + 8] = Math.min(1, s.snap[8] + 0.16);
  fa[o + 9] = Math.min(1, s.snap[9] + 0.16);
  fa[o + 10] = Math.min(1, s.snap[10] + 0.16);
}

function makeTray(w: number, h: number): void {
  const wd = b3!.b3DefaultWorldDef();
  wd.gravity = { x: 0, y: 0, z: -GRAVITY };
  world = b3!.b3CreateWorld(wd);
  worldW = w;
  worldH = h;
  evBuf = b3!.createEventsBuffer();
  moveEvt = b3!.createBodyMoveEvent();
  const floorMat = b3!.b3DefaultShapeDef();
  floorMat.baseMaterial.friction = 0.55;
  floorMat.baseMaterial.restitution = 0.3;
  const fd = b3!.b3DefaultBodyDef();
  fd.position = { x: (w / 2) * PX2M, y: -(h / 2) * PX2M, z: -FLOOR_T };
  const fb = b3!.b3CreateBody(world, fd);
  b3!.b3CreateBoxShape(fb, floorMat, FLOOR_HALF, FLOOR_HALF, FLOOR_T);
}

function destroyWorld(): void {
  if (b3) {
    if (evBuf) b3.destroyEventsBuffer(evBuf);
    if (world) b3.b3DestroyWorld(world);
  }
  world = null;
  evBuf = null;
  moveEvt = null;
  live = [];
  dormant = [];
  dormN = 0;
  byBKey = new Map();
  shardByKey = new Map();
  rectKeys = new Set();
  grid = new Map();
  homeGrid = new Map();
  gridDirty = true;
  hov = null;
  extraN = 0;
  lastCoverage = 0;
  acc = 0;
  pendingTreeDy = 0;
  pendingEdDy = 0;
  phase = 0;
  clicksInPhase = 0;
}

function dormantize(s: Shard): void {
  if ((dormN + 1) * 16 > dormFA.length) {
    const nfa = new Float32Array(dormFA.length * 2);
    nfa.set(dormFA);
    dormFA = nfa;
  }
  if ((dormN + 1) * 8 > dormXF.length) {
    const nxf = new Float32Array(dormXF.length * 2);
    nxf.set(dormXF);
    dormXF = nxf;
  }
  if ((dormN + 1) * CLIP_STRIDE > dormCL.length) {
    const ncl = new Float32Array(dormCL.length * 2);
    ncl.set(dormCL);
    dormCL = ncl;
  }
  dormFA.set(s.fa, dormN * 16);
  dormXF.set(s.xf, dormN * 8);
  dormCL.set(s.clip ?? ZERO24, dormN * CLIP_STRIDE);
  s.dormIdx = dormN;
  s.dorm = true;
  dormant.push(s);
  dormN++;
  gridDirty = true;
}

function undormant(s: Shard): void {
  const i = s.dormIdx;
  const last = dormant.length - 1;
  if (i !== last) {
    const t = dormant[last];
    dormant[i] = t;
    t.dormIdx = i;
    dormFA.copyWithin(i * 16, last * 16, last * 16 + 16);
    dormXF.copyWithin(i * 8, last * 8, last * 8 + 8);
    dormCL.copyWithin(i * CLIP_STRIDE, last * CLIP_STRIDE, last * CLIP_STRIDE + CLIP_STRIDE);
  }
  dormant.pop();
  dormN--;
  s.dorm = false;
  s.dormIdx = -1;
  gridDirty = true;
  live.push(s);
}

function spawnBody(cxPx: number, cyPx: number, hxPx: number, hyPx: number): b3BodyId {
  const def = b3!.b3DefaultBodyDef();
  def.type = b3!.b3BodyType.b3_dynamicBody;
  def.position = { x: cxPx * PX2M, y: -cyPx * PX2M, z: THICK / 2 + 0.02 };
  def.linearDamping = 0.08;
  def.angularDamping = 0.12;
  const body = b3!.b3CreateBody(world!, def);
  const sd = b3!.b3DefaultShapeDef();
  sd.baseMaterial.friction = 0.5;
  sd.baseMaterial.restitution = 0.38;
  b3!.b3CreateBoxShape(body, sd, hxPx * PX2M, hyPx * PX2M, THICK / 2);
  return body;
}

function convexHull(pts: number[][]): number[][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const n = p.length;
  if (n < 3) return p.slice();
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: number[][] = [];
  for (let i = n - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  const h = lower.concat(upper);
  return h.length >= 3 ? h : p.slice(0, 3);
}

// Random convex polygon inscribed in a (sw x sh) box, returned as up to KPLANES inward
// half-planes in the polygon's own tight-AABB-local space (plus that AABB's size/offset).
function randConvexClip(seed: number, sw: number, sh: number): { planes: Float32Array; w: number; h: number; minx: number; miny: number } {
  const m = 3 + Math.floor(fxHash(seed + 0.13) * 4);
  const pts: number[][] = [];
  for (let k = 0; k < m; k++) pts.push([fxHash(seed + k * 1.37 + 5.1) * sw, fxHash(seed + k * 2.71 + 9.3) * sh]);
  let hull = convexHull(pts);
  if (hull.length < 3) hull = [[0, 0], [sw, 0], [sw * 0.5, sh]];
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  let cx = 0, cy = 0;
  for (const v of hull) {
    if (v[0] < minx) minx = v[0]; if (v[1] < miny) miny = v[1];
    if (v[0] > maxx) maxx = v[0]; if (v[1] > maxy) maxy = v[1];
    cx += v[0]; cy += v[1];
  }
  cx /= hull.length; cy /= hull.length;
  const w = Math.max(1, maxx - minx), h = Math.max(1, maxy - miny);
  const planes = new Float32Array(CLIP_STRIDE);
  const cnt = Math.min(hull.length, KPLANES);
  for (let i = 0; i < cnt; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    let nx = (b[1] - a[1]), ny = -(b[0] - a[0]);
    const len = Math.hypot(nx, ny);
    if (len < 1e-9) continue;
    nx /= len; ny /= len;
    const ax = a[0] - minx, ay = a[1] - miny;
    if (nx * (cx - minx - ax) + ny * (cy - miny - ay) < 0) { nx = -nx; ny = -ny; }
    planes[i * 4] = nx;
    planes[i * 4 + 1] = ny;
    planes[i * 4 + 2] = -(nx * ax + ny * ay);
  }
  planes[3] = cnt;
  return { planes, w, h, minx, miny };
}

function pushShard(
  body: b3BodyId, snap: Float32Array, isRect: boolean,
  homeX: number, homeY: number, sig: number, homeCx: number, homeCy: number,
  hx: number, hy: number, homeHx: number, homeHy: number,
  px: number, py: number, pz: number, clip: Float32Array | null,
): void {
  const s: Shard = {
    body, bkey: bodyKey(body), snap,
    homeX, homeY, sig, homeCx, homeCy, homeHx, homeHy,
    sc: scrollCfg(snap, 0), isRect,
    sx: snap[0], sy: snap[1],
    bw: isRect ? snap[6] : (snap[6] - snap[4]) * snap[2],
    bh: isRect ? snap[7] : (snap[7] - snap[5]) * snap[2],
    hx, hy,
    px, py, pz, qx: 0, qy: 0, qz: 0, qw: 1,
    fa: new Float32Array(16), xf: new Float32Array(8), clip,
    asleep: false, dorm: false, dormIdx: -1, claimedFrame: -1,
  };
  writeFloats(s);
  live.push(s);
  byBKey.set(s.bkey, s);
  gridDirty = true;
  if (isRect) rectKeys.add(hideKey(homeX, homeY, sig));
  else shardByKey.set(hideKey(homeX, homeY, sig), s);
}

function kick(body: b3BodyId, cx: number, cy: number, wx: number, wy: number, rad: number, boost: number, seed: number): void {
  const r0 = fxHash(seed * 31 + clickSeq * 7);
  const r1 = fxHash(seed * 53 + clickSeq * 13);
  const r2 = fxHash(seed * 19 + clickSeq * 29);
  const r3 = fxHash(seed * 67 + clickSeq * 3);
  const dx = cx - wx, dy = cy - wy;
  const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const f = Math.max(0, 1 - d / rad);
  const spd = (1.2 + 3.6 * f + r0 * 1.6) * boost;
  b3!.b3Body_SetAwake(body, true);
  b3!.b3Body_SetLinearVelocity(body, {
    x: (dx / d) * spd,
    y: -(dy / d) * spd,
    z: (2.5 + 5.5 * f * (0.4 + 0.6 * r1)) * boost,
  });
  b3!.b3Body_SetAngularVelocity(body, {
    x: (r1 - 0.5) * 26 * boost,
    y: (r2 - 0.5) * 26 * boost,
    z: (r3 - 0.5) * 18 * boost,
  });
}

function kickRubble(s: Shard, wx: number, wy: number, rad: number, boost: number): void {
  const dx = s.px - wx, dy = s.py - wy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return;
  const d = Math.max(Math.sqrt(d2), 1);
  const f = 1 - d / rad;
  const r1 = fxHash(s.px * 3.1 + clickSeq * 11);
  const r2 = fxHash(s.py * 2.7 + clickSeq * 23);
  const r3 = fxHash((s.px + s.py) * 1.9 + clickSeq * 37);
  b3!.b3Body_SetAwake(s.body, true);
  b3!.b3Body_SetLinearVelocity(s.body, {
    x: (dx / d) * (0.8 + 2.6 * f) * boost,
    y: -(dy / d) * (0.8 + 2.6 * f) * boost,
    z: (1.4 + 4.2 * f * (0.3 + 0.7 * r1)) * boost,
  });
  b3!.b3Body_SetAngularVelocity(s.body, {
    x: (r1 - 0.5) * 22 * boost,
    y: (r2 - 0.5) * 22 * boost,
    z: (r3 - 0.5) * 16 * boost,
  });
  if (s.asleep) {
    s.asleep = false;
    gridDirty = true;
  }
}

function removeShard(s: Shard): void {
  byBKey.delete(s.bkey);
  if (b3 && world) b3.b3DestroyBody(s.body);
  if (!s.isRect) shardByKey.delete(hideKey(s.homeX, s.homeY, s.sig));
  if (s.dorm) {
    const i = s.dormIdx, last = dormant.length - 1;
    if (i !== last) {
      const t = dormant[last];
      dormant[i] = t;
      t.dormIdx = i;
      dormFA.copyWithin(i * 16, last * 16, last * 16 + 16);
      dormXF.copyWithin(i * 8, last * 8, last * 8 + 8);
      dormCL.copyWithin(i * CLIP_STRIDE, last * CLIP_STRIDE, last * CLIP_STRIDE + CLIP_STRIDE);
    }
    dormant.pop();
    dormN--;
    s.dorm = false;
    s.dormIdx = -1;
  } else {
    const i = live.indexOf(s);
    if (i >= 0) {
      const last = live.length - 1;
      if (i !== last) live[i] = live[last];
      live.pop();
    }
  }
  if (hov === s) hov = null;
  gridDirty = true;
}

// Recursive fracture: shatter a big convex tile into a few smaller irregular pieces
// that burst outward (their dynamic bodies then shove neighbours via real collisions).
function fracture(s: Shard, wx: number, wy: number, boost: number, seedRef: { v: number }): void {
  const n = 2 + Math.floor(fxHash(seedRef.v + 0.5) * 3);
  const col = [s.snap[8], s.snap[9], s.snap[10], s.snap[11]];
  const fullW = s.hx * 2, fullH = s.hy * 2;
  for (let k = 0; k < n; k++) {
    seedRef.v++;
    const chw = Math.max(10, fullW * (0.3 + fxHash(seedRef.v * 2.1 + 2) * 0.7));
    const chh = Math.max(10, fullH * (0.3 + fxHash(seedRef.v * 3.3 + 3) * 0.7));
    const ox = (fxHash(seedRef.v * 4.7 + 4) - 0.5) * s.hx * 1.1;
    const oy = (fxHash(seedRef.v * 5.9 + 5) - 0.5) * s.hy * 1.1;
    const ccx = s.px + ox, ccy = s.py + oy;
    const rc = randConvexClip(seedRef.v * 7.1 + 6, chw, chh);
    if (rc.w < 4 || rc.h < 4) continue;
    const tlx = ccx - rc.w / 2, tly = ccy - rc.h / 2;
    const body = spawnBody(ccx, ccy, rc.w / 2, rc.h / 2);
    const ddx = ccx - wx, ddy = ccy - wy;
    const dd = Math.max(Math.hypot(ddx, ddy), 1);
    const sp = (1.2 + fxHash(seedRef.v * 8.3 + 7) * 3.2) * boost;
    b3!.b3Body_SetLinearVelocity(body, {
      x: (ddx / dd) * sp + (fxHash(seedRef.v * 9.1) - 0.5) * 2.4,
      y: -(ddy / dd) * sp + (fxHash(seedRef.v * 9.7) - 0.5) * 2.4,
      z: (1.2 + fxHash(seedRef.v * 10.3) * 3.4) * boost,
    });
    b3!.b3Body_SetAngularVelocity(body, {
      x: (fxHash(seedRef.v * 11.1) - 0.5) * 22,
      y: (fxHash(seedRef.v * 11.7) - 0.5) * 22,
      z: (fxHash(seedRef.v * 12.3) - 0.5) * 18,
    });
    const snap = new Float32Array(16);
    snap[0] = tlx; snap[1] = tly; snap[2] = 1; snap[3] = 2; snap[6] = rc.w; snap[7] = rc.h;
    snap[8] = col[0] * 0.95; snap[9] = col[1] * 0.95; snap[10] = col[2] * 0.95; snap[11] = col[3];
    pushShard(body, snap, true, s.homeX, s.homeY, s.sig, ccx, ccy, rc.w / 2, rc.h / 2, rc.w / 2, rc.h / 2, ccx, ccy, (THICK / 2 + 0.02) * M2PX, rc.planes);
  }
  removeShard(s);
}

function rotCorner(s: Shard, lx: number, ly: number): [number, number] {
  const cx = -s.qz * ly + s.qw * lx;
  const cy = s.qz * lx + s.qw * ly;
  const cz = s.qx * ly - s.qy * lx;
  return [
    s.px + lx + 2 * (s.qy * cz - s.qz * cy),
    s.py + ly + 2 * (s.qz * cx - s.qx * cz),
  ];
}

function hitShard(s: Shard, x: number, y: number): boolean {
  const grow = 1.15 + Math.min(1.5, s.pz * 0.004);
  const hx = s.hx * grow, hy = s.hy * grow;
  const c0 = rotCorner(s, -hx, -hy);
  const c1 = rotCorner(s, hx, -hy);
  const c2 = rotCorner(s, hx, hy);
  const c3 = rotCorner(s, -hx, hy);
  const d0 = (c1[0] - c0[0]) * (y - c0[1]) - (c1[1] - c0[1]) * (x - c0[0]);
  const d1 = (c2[0] - c1[0]) * (y - c1[1]) - (c2[1] - c1[1]) * (x - c1[0]);
  const d2 = (c3[0] - c2[0]) * (y - c2[1]) - (c3[1] - c2[1]) * (x - c2[0]);
  const d3 = (c0[0] - c3[0]) * (y - c3[1]) - (c0[1] - c3[1]) * (x - c3[0]);
  const neg = (d0 < 0 ? 1 : 0) + (d1 < 0 ? 1 : 0) + (d2 < 0 ? 1 : 0) + (d3 < 0 ? 1 : 0);
  return neg === 0 || neg === 4;
}

function cellKey(x: number, y: number): number {
  return (Math.floor(x / GRID_CELL) + 4096) * 8192 + (Math.floor(y / GRID_CELL) + 4096);
}

function rebuildGrid(): void {
  grid = new Map();
  homeGrid = new Map();
  const addPos = (s: Shard) => {
    const k = cellKey(s.px, s.py);
    const arr = grid.get(k);
    if (arr) arr.push(s);
    else grid.set(k, [s]);
  };
  const addHome = (s: Shard) => {
    const x0 = Math.floor((s.homeCx - s.homeHx) / GRID_CELL), x1 = Math.floor((s.homeCx + s.homeHx) / GRID_CELL);
    const y0 = Math.floor((s.homeCy - s.homeHy) / GRID_CELL), y1 = Math.floor((s.homeCy + s.homeHy) / GRID_CELL);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = (gx + 4096) * 8192 + (gy + 4096);
        const arr = homeGrid.get(k);
        if (arr) arr.push(s);
        else homeGrid.set(k, [s]);
      }
    }
  };
  for (const s of dormant) {
    addPos(s);
    addHome(s);
  }
  for (const s of live) {
    addHome(s);
    if (s.asleep) addPos(s);
  }
  gridDirty = false;
}

function pickShard(x: number, y: number): Shard | null {
  for (let i = live.length - 1; i >= 0; i--) {
    const s = live[i];
    if (!s.asleep && hitShard(s, x, y)) return s;
  }
  if (gridDirty) rebuildGrid();
  const cx = Math.floor(x / GRID_CELL), cy = Math.floor(y / GRID_CELL);
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      const arr = grid.get((gx + 4096) * 8192 + (gy + 4096));
      if (!arr) continue;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (hitShard(arr[i], x, y)) return arr[i];
      }
    }
  }
  return null;
}

export function physics2Pick(x: number, y: number): { x: number; y: number } | null {
  const s = pickShard(x, y);
  return s ? { x: s.homeCx, y: s.homeCy } : null;
}

export function physics2Dead(x: number, y: number): boolean {
  if (shardByKey.size === 0 && rectKeys.size === 0) return false;
  if (gridDirty) rebuildGrid();
  const arr = homeGrid.get(cellKey(x, y));
  if (!arr) return false;
  for (const s of arr) {
    if (Math.abs(x - s.homeCx) <= s.homeHx * 1.1 && Math.abs(y - s.homeCy) <= s.homeHy * 1.1) return true;
  }
  return false;
}

export function physics2Scroll(panel: 'tree' | 'editor', contentDy: number): void {
  if (panel === 'tree') pendingTreeDy += contentDy;
  else pendingEdDy += contentDy;
}

export const physics2: Fx = {
  uses3d: true,

  onEnter() {
    ensureBox3D();
    combo = 0;
    lastClickNow = -1e9;
    phase = 0;
    clicksInPhase = 0;
  },

  onExit() {
    destroyWorld();
  },

  onClick(ctx, wx, wy) {
    ensureBox3D();
    if (!b3 || !world) return;
    clickSeq++;
    combo = ctx.now - lastClickNow < COMBO_MS ? Math.min(3, combo + 1) : 1;
    lastClickNow = ctx.now;

    clicksInPhase++;
    if (clicksInPhase > CLICKS_PER_PHASE) {
      phase++;
      clicksInPhase = 1;
    }

    const phaseBoost = 1 + phase * 0.3;
    const rad = RADIUS * (1 + 0.4 * (combo - 1)) * (0.9 + fxHash(clickSeq * 7) * 0.2);
    const boost = (0.75 + 0.45 * (combo - 1)) * (0.9 + fxHash(clickSeq * 13) * 0.25) * phaseBoost;

    let seed = 0;
    const seedRef = { v: 0 };
    const snapArr = live.concat(dormant);
    for (const s of snapArr) {
      if (!byBKey.has(s.bkey)) continue;
      const ddx = s.px - wx, ddy = s.py - wy;
      if (ddx * ddx + ddy * ddy >= rad * rad) continue;
      if (s.isRect && s.hx * s.hy * 4 >= 150) {
        seedRef.v = seed;
        fracture(s, wx, wy, boost, seedRef);
        seed = seedRef.v;
      } else {
        kickRubble(s, wx, wy, rad, boost);
      }
    }

    const inst = ctx.inst;
    const glyphs: number[] = [];
    const smallRects: { gi: number; d2: number }[] = [];
    const largeRects: { gi: number; d2: number }[] = [];
    for (let gi = 0; gi < inst.length; gi += 16) {
      const u2px = inst[gi + 2];
      const cx = inst[gi] + ((inst[gi + 4] + inst[gi + 6]) / 2) * u2px;
      const cy = inst[gi + 1] + ((inst[gi + 5] + inst[gi + 7]) / 2) * u2px;
      const dx = cx - wx, dy = cy - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rad * rad) continue;
      const key = hideKey(inst[gi], inst[gi + 1], instSig(inst, gi));
      if (inst[gi + 3] < 1.5) {
        if (shardByKey.has(key)) continue;
        glyphs.push(gi);
      } else {
        if (rectKeys.has(key)) continue;
        const wpx = (inst[gi + 6] - inst[gi + 4]) * u2px;
        const hpx = (inst[gi + 7] - inst[gi + 5]) * u2px;
        if (wpx * hpx < LARGE_RECT_AREA) {
          smallRects.push({ gi, d2 });
        } else {
          largeRects.push({ gi, d2 });
        }
      }
    }

    for (let k = glyphs.length - 1; k > 0; k--) {
      const j = Math.floor(fxHash(k * 91 + clickSeq * 17) * (k + 1));
      const tmp = glyphs[k]; glyphs[k] = glyphs[j]; glyphs[j] = tmp;
    }
    for (let n = 0; n < glyphs.length; n++) {
      const gi = glyphs[n];
      const u2px = inst[gi + 2];
      const wpx = (inst[gi + 6] - inst[gi + 4]) * u2px;
      const hpx = (inst[gi + 7] - inst[gi + 5]) * u2px;
      if (wpx < 1 || hpx < 1) continue;
      const cx = inst[gi] + ((inst[gi + 4] + inst[gi + 6]) / 2) * u2px;
      const cy = inst[gi + 1] + ((inst[gi + 5] + inst[gi + 7]) / 2) * u2px;
      const body = spawnBody(cx, cy, wpx / 2, hpx / 2);
      kick(body, cx, cy, wx, wy, rad, boost, seed++);
      const snap = new Float32Array(16);
      for (let j = 0; j < 16; j++) snap[j] = inst[gi + j];
      pushShard(body, snap, false, inst[gi], inst[gi + 1], instSig(inst, gi), cx, cy, wpx / 2, hpx / 2, wpx / 2, hpx / 2, cx, cy, (THICK / 2 + 0.02) * M2PX, null);
    }

    smallRects.sort((a, b) => a.d2 - b.d2);
    for (const { gi } of smallRects) {
      const x0 = inst[gi], y0 = inst[gi + 1];
      const W = inst[gi + 6], H = inst[gi + 7];
      const cx = x0 + W / 2, cy = y0 + H / 2;
      const body = spawnBody(cx, cy, W / 2, H / 2);
      kick(body, cx, cy, wx, wy, rad, boost, seed++);
      const snap = new Float32Array(16);
      snap[0] = x0; snap[1] = y0; snap[2] = 1; snap[3] = 2;
      snap[6] = W; snap[7] = H;
      snap[8] = inst[gi + 8]; snap[9] = inst[gi + 9]; snap[10] = inst[gi + 10]; snap[11] = inst[gi + 11] * RECT_ALPHA;
      pushShard(body, snap, true, x0, y0, instSig(inst, gi), cx, cy, W / 2, H / 2, W / 2, H / 2, cx, cy, (THICK / 2 + 0.02) * M2PX, null);
    }

    largeRects.sort((a, b) => a.d2 - b.d2);
    let rectAreaSum = 0, tileAreaSum = 0;
    for (const { gi } of largeRects) {
      const x0 = inst[gi], y0 = inst[gi + 1];
      const W = inst[gi + 6], H = inst[gi + 7];
      rectAreaSum += W * H;
      const sig = instSig(inst, gi);
      const K = Math.max(3, Math.min(16, Math.round((W * H) / 9000)));
      const maxSW = Math.max(13, Math.min(W - 2, 0.6 * W));
      const maxSH = Math.max(13, Math.min(H - 2, 0.6 * H));
      if (maxSW < 12 || maxSH < 12) continue;
      for (let k = 0; k < K; k++) {
        const s1 = seed + k * 13.1 + gi * 0.0137;
        seed++;
        const sw = 12 + fxHash(s1 + 1.7) * (maxSW - 12);
        const sh = 12 + fxHash(s1 + 3.9) * (maxSH - 12);
        const sx = fxHash(s1 + 6.1) * (W - sw);
        const sy = fxHash(s1 + 8.3) * (H - sh);
        const rc = randConvexClip(s1, sw, sh);
        if (rc.w < 4 || rc.h < 4) continue;
        const tlx = x0 + sx + rc.minx, tly = y0 + sy + rc.miny;
        const ccx = tlx + rc.w / 2, ccy = tly + rc.h / 2;
        tileAreaSum += rc.w * rc.h;
        const body = spawnBody(ccx, ccy, rc.w / 2, rc.h / 2);
        kick(body, ccx, ccy, wx, wy, rad, boost, seed++);
        const snap = new Float32Array(16);
        snap[0] = tlx; snap[1] = tly; snap[2] = 1; snap[3] = 2;
        snap[6] = rc.w; snap[7] = rc.h;
        snap[8] = inst[gi + 8]; snap[9] = inst[gi + 9]; snap[10] = inst[gi + 10]; snap[11] = inst[gi + 11] * RECT_ALPHA;
        pushShard(body, snap, true, x0, y0, sig, ccx, ccy, rc.w / 2, rc.h / 2, rc.w / 2, rc.h / 2, ccx, ccy, (THICK / 2 + 0.02) * M2PX, rc.planes);
      }
    }
    lastCoverage = rectAreaSum > 0 ? Math.min(1, tileAreaSum / rectAreaSum) : 0;
  },

  preFrame(ctx) {
    frameId++;
    if (b3) {
      if (world && (Math.abs(ctx.w - worldW) > 60 || Math.abs(ctx.h - worldH) > 60)) destroyWorld();
      if (!world) makeTray(ctx.w, ctx.h);
    }
    if (pendingTreeDy !== 0 || pendingEdDy !== 0) {
      const applyDy = (sc: number, dy: number) => {
        if (dy === 0) return;
        const shift = (s: Shard) => {
          s.homeY += dy;
          s.homeCy += dy;
          s.py += dy;
          s.qx = 0; s.qy = 0; s.qz = 0; s.qw = 1;
          if (!s.isRect) {
            shardByKey.delete(hideKey(s.homeX, s.homeY - dy, s.sig));
            shardByKey.set(hideKey(s.homeX, s.homeY, s.sig), s);
          }
          if (world) {
            b3!.b3Body_SetTransform(s.body, { x: s.px * PX2M, y: -s.py * PX2M, z: s.pz * PX2M }, IDQ);
            b3!.b3Body_SetAwake(s.body, false);
          }
          writeFloats(s);
          if (s.dorm) {
            dormFA.set(s.fa, s.dormIdx * 16);
            dormXF.set(s.xf, s.dormIdx * 8);
          }
        };
        for (const s of live) if (s.sc === sc && !s.isRect) shift(s);
        for (const s of dormant) if (s.sc === sc && !s.isRect) shift(s);
        gridDirty = true;
      };
      applyDy(1, pendingTreeDy);
      applyDy(2, pendingEdDy);
      pendingTreeDy = 0;
      pendingEdDy = 0;
    }
    hov = pickShard(ctx.mx, ctx.my);
  },

  apply(ctx) {
    const { inst, i } = ctx;
    if (inst[i + 3] < 1.5) {
      if (shardByKey.size === 0) return;
      const s = shardByKey.get(hideKey(inst[i], inst[i + 1], instSig(inst, i)));
      if (!s) return;
      if (s.dorm) undormant(s);
      s.claimedFrame = frameId;
      const xi = ctx.xi;
      ctx.fxXforms[xi] = s.px - s.homeCx;
      ctx.fxXforms[xi + 1] = s.py - s.homeCy;
      ctx.fxXforms[xi + 2] = s.pz;
      ctx.fxXforms[xi + 3] = 1;
      ctx.fxXforms[xi + 4] = s.qx;
      ctx.fxXforms[xi + 5] = s.qy;
      ctx.fxXforms[xi + 6] = s.qz;
      ctx.fxXforms[xi + 7] = s.qw;
      ctx.fx3dActive = true;
      if (s === hov) {
        ctx.instFA[i + 8] = Math.min(1, inst[i + 8] + 0.16);
        ctx.instFA[i + 9] = Math.min(1, inst[i + 9] + 0.16);
        ctx.instFA[i + 10] = Math.min(1, inst[i + 10] + 0.16);
      }
    } else if (rectKeys.size > 0) {
      if (rectKeys.has(hideKey(inst[i], inst[i + 1], instSig(inst, i)))) {
        ctx.instFA[i + 11] = 0;
      }
    }
  },

  postFrame(ctx) {
    extraN = 0;
    if (!b3 || !world) return;
    if (live.length === 0 && dormant.length === 0) return;

    acc += Math.min(ctx.dt, 50) / 1000;
    let stepped = false;
    let steps = 0;
    while (acc >= STEP && steps < 3) {
      b3.b3World_Step(world, STEP, SUBSTEPS);
      acc -= STEP;
      steps++;
      stepped = true;
    }
    if (steps === 3) acc = 0;
    if (stepped) {
      b3.getEvents(evBuf!, world);
      const n = b3.getNumBodyMoveEvents(evBuf!);
      for (let k = 0; k < n; k++) {
        const ev = b3.getBodyMoveEventAt(moveEvt!, evBuf!, k);
        const s = byBKey.get(bodyKey(ev.bodyId));
        if (!s) continue;
        if (s.dorm) undormant(s);
        if (s.asleep && !ev.fellAsleep) gridDirty = true;
        setPose(s, ev.position.x, ev.position.y, ev.position.z, ev.rotation.x, ev.rotation.y, ev.rotation.z, ev.rotation.w);
        writeFloats(s);
        s.asleep = ev.fellAsleep;
        if (ev.fellAsleep) gridDirty = true;
      }
    }

    if (dormN > 0) {
      if (dormN * 16 > extraFA.length) extraFA = new Float32Array(dormN * 32);
      if (dormN * 8 > extraXF.length) extraXF = new Float32Array(dormN * 16);
      if (dormN * CLIP_STRIDE > extraCL.length) extraCL = new Float32Array(dormN * CLIP_STRIDE * 2);
      extraFA.set(dormFA.subarray(0, dormN * 16), 0);
      extraXF.set(dormXF.subarray(0, dormN * 8), 0);
      extraCL.set(dormCL.subarray(0, dormN * CLIP_STRIDE), 0);
      extraN = dormN;
      if (hov && hov.dorm && !hov.isRect) tint(extraFA, hov.dormIdx * 16, hov);
    }

    let w = 0;
    for (let k = 0; k < live.length; k++) {
      const s = live[k];
      const claimed = s.claimedFrame === frameId;
      if (!claimed) {
        if ((extraN + 1) * 16 > extraFA.length) {
          const nfa = new Float32Array(extraFA.length * 2);
          nfa.set(extraFA.subarray(0, extraN * 16));
          extraFA = nfa;
        }
        if ((extraN + 1) * 8 > extraXF.length) {
          const nxf = new Float32Array(extraXF.length * 2);
          nxf.set(extraXF.subarray(0, extraN * 8));
          extraXF = nxf;
        }
        if ((extraN + 1) * CLIP_STRIDE > extraCL.length) {
          const ncl = new Float32Array(extraCL.length * 2);
          ncl.set(extraCL.subarray(0, extraN * CLIP_STRIDE));
          extraCL = ncl;
        }
        extraFA.set(s.fa, extraN * 16);
        extraXF.set(s.xf, extraN * 8);
        extraCL.set(s.clip ?? ZERO24, extraN * CLIP_STRIDE);
        if (s === hov && !s.isRect) tint(extraFA, extraN * 16, s);
        extraN++;
      }
      if (!claimed && s.asleep) {
        dormantize(s);
        continue;
      }
      live[w++] = s;
    }
    live.length = w;

    if (extraN > 0) ctx.fx3dActive = true;
  },

  extras() {
    if (extraN === 0) return null;
    return { instFA: extraFA, xforms: extraXF, clip: extraCL, count: extraN };
  },
};

export function physics2Stats(): { live: number; dormant: number; coverage: number } {
  return { live: live.length, dormant: dormant.length, coverage: lastCoverage };
}
