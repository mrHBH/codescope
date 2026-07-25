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
const CELLS_PER_RECT = 90;
const RECT_AREA_MAX = 40000;
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
  sc: number;
  isRect: boolean;
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
let dormN = 0;

let byBKey = new Map<string, Shard>();
let shardByKey = new Map<number, Shard>();
let rectKeys = new Set<number>();
let grid = new Map<number, Shard[]>();
let gridDirty = true;

let frameId = 0;
let hov: Shard | null = null;
let acc = 0;
let extraFA = new Float32Array(16384);
let extraXF = new Float32Array(8192);
let extraN = 0;
let clickSeq = 0;
let lastClickNow = -1e9;
let combo = 0;
let evBuf: EventsBuffer | null = null;
let moveEvt: BodyMoveEvent | null = null;
let pendingTreeDy = 0;
let pendingEdDy = 0;

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
  fa[o + 8] = Math.min(1, s.snap[8] + 0.28);
  fa[o + 9] = Math.min(1, s.snap[9] + 0.24);
  fa[o + 10] = Math.min(1, s.snap[10] + 0.1);
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
  gridDirty = true;
  hov = null;
  extraN = 0;
  acc = 0;
  pendingTreeDy = 0;
  pendingEdDy = 0;
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
  dormFA.set(s.fa, dormN * 16);
  dormXF.set(s.xf, dormN * 8);
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

function pushShard(
  body: b3BodyId, snap: Float32Array, isRect: boolean,
  homeX: number, homeY: number, sig: number, homeCx: number, homeCy: number,
  hx: number, hy: number, px: number, py: number, pz: number,
): void {
  const s: Shard = {
    body, bkey: bodyKey(body), snap,
    homeX, homeY, sig, homeCx, homeCy,
    sc: scrollCfg(snap, 0), isRect, hx, hy,
    px, py, pz, qx: 0, qy: 0, qz: 0, qw: 1,
    fa: new Float32Array(16), xf: new Float32Array(8),
    asleep: false, dorm: false, dormIdx: -1, claimedFrame: -1,
  };
  writeFloats(s);
  live.push(s);
  byBKey.set(s.bkey, s);
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
  const add = (s: Shard) => {
    const k = cellKey(s.px, s.py);
    const arr = grid.get(k);
    if (arr) arr.push(s);
    else grid.set(k, [s]);
  };
  for (const s of dormant) add(s);
  for (const s of live) if (s.asleep) add(s);
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

export function physicsPick(x: number, y: number): { x: number; y: number } | null {
  const s = pickShard(x, y);
  return s ? { x: s.homeCx, y: s.homeCy } : null;
}

export function physicsScroll(panel: 'tree' | 'editor', contentDy: number): void {
  if (panel === 'tree') pendingTreeDy += contentDy;
  else pendingEdDy += contentDy;
}

export const physics: Fx = {
  uses3d: true,

  onEnter() {
    ensureBox3D();
    combo = 0;
    lastClickNow = -1e9;
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
    const rad = RADIUS * (1 + 0.4 * (combo - 1)) * (0.9 + fxHash(clickSeq * 7) * 0.2);
    const boost = (0.75 + 0.45 * (combo - 1)) * (0.9 + fxHash(clickSeq * 13) * 0.25);
    ctx.tilt?.(0.5 + 0.15 * (combo - 1));

    for (const s of live) kickRubble(s, wx, wy, rad, boost);
    for (const s of dormant) kickRubble(s, wx, wy, rad, boost);

    const inst = ctx.inst;
    const glyphs: number[] = [];
    const rects: { gi: number; d2: number }[] = [];
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
        if (wpx < 2 || hpx < 2 || wpx * hpx > RECT_AREA_MAX || inst[gi + 11] < 0.25) continue;
        rects.push({ gi, d2 });
      }
    }

    for (let k = glyphs.length - 1; k > 0; k--) {
      const j = Math.floor(fxHash(k * 91 + clickSeq * 17) * (k + 1));
      const tmp = glyphs[k]; glyphs[k] = glyphs[j]; glyphs[j] = tmp;
    }
    let seed = 0;
    const glyphTake = Math.min(glyphs.length, 160 + 80 * (combo - 1));
    for (let n = 0; n < glyphTake; n++) {
      const gi = glyphs[n];
      const u2px = inst[gi + 2];
      const wpx = (inst[gi + 6] - inst[gi + 4]) * u2px;
      const hpx = (inst[gi + 7] - inst[gi + 5]) * u2px;
      if (wpx < 2 || hpx < 2) continue;
      const cx = inst[gi] + ((inst[gi + 4] + inst[gi + 6]) / 2) * u2px;
      const cy = inst[gi + 1] + ((inst[gi + 5] + inst[gi + 7]) / 2) * u2px;
      const body = spawnBody(cx, cy, wpx / 2, hpx / 2);
      kick(body, cx, cy, wx, wy, rad, boost, seed++);
      const snap = new Float32Array(16);
      for (let j = 0; j < 16; j++) snap[j] = inst[gi + j];
      pushShard(body, snap, false, inst[gi], inst[gi + 1], instSig(inst, gi), cx, cy, wpx / 2, hpx / 2, cx, cy, (THICK / 2 + 0.02) * M2PX);
    }

    rects.sort((a, b) => a.d2 - b.d2);
    let cellBudget = 180 + 90 * (combo - 1);
    for (const { gi } of rects) {
      if (cellBudget <= 0) break;
      const x0 = inst[gi], y0 = inst[gi + 1];
      const wpx = inst[gi + 6], hpx = inst[gi + 7];
      let cell = Math.min(40, Math.max(12, Math.sqrt((wpx * hpx) / CELLS_PER_RECT)));
      let nx = Math.max(1, Math.ceil(wpx / cell));
      let ny = Math.max(1, Math.ceil(hpx / cell));
      if (nx * ny > CELLS_PER_RECT) {
        const k = Math.sqrt((nx * ny) / CELLS_PER_RECT);
        nx = Math.max(1, Math.ceil(nx / k));
        ny = Math.max(1, Math.ceil(ny / k));
      }
      const take = Math.min(nx * ny, cellBudget);
      cellBudget -= take;
      const cw = wpx / nx, ch = hpx / ny;
      const sig = instSig(inst, gi);
      let made = 0;
      for (let iy = 0; iy < ny && made < take; iy++) {
        for (let ix = 0; ix < nx && made < take; ix++) {
          const x = x0 + ix * cw, y = y0 + iy * ch;
          const ccx = x + cw / 2, ccy = y + ch / 2;
          const body = spawnBody(ccx, ccy, cw / 2, ch / 2);
          kick(body, ccx, ccy, wx, wy, rad, boost, seed++);
          const snap = new Float32Array(16);
          snap[0] = x; snap[1] = y; snap[2] = 1; snap[3] = 2;
          snap[6] = cw; snap[7] = ch;
          snap[8] = inst[gi + 8]; snap[9] = inst[gi + 9]; snap[10] = inst[gi + 10]; snap[11] = inst[gi + 11];
          pushShard(body, snap, true, x0, y0, sig, ccx, ccy, cw / 2, ch / 2, ccx, ccy, (THICK / 2 + 0.02) * M2PX);
          made++;
        }
      }
    }
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
        for (const s of live) if (s.sc === sc) shift(s);
        for (const s of dormant) if (s.sc === sc) shift(s);
        if (rectKeys.size > 0) {
          rectKeys = new Set();
          for (const s of live) if (s.isRect) rectKeys.add(hideKey(s.homeX, s.homeY, s.sig));
          for (const s of dormant) if (s.isRect) rectKeys.add(hideKey(s.homeX, s.homeY, s.sig));
        }
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
        ctx.instFA[i + 8] = Math.min(1, inst[i + 8] + 0.28);
        ctx.instFA[i + 9] = Math.min(1, inst[i + 9] + 0.24);
        ctx.instFA[i + 10] = Math.min(1, inst[i + 10] + 0.1);
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
      extraFA.set(dormFA.subarray(0, dormN * 16), 0);
      extraXF.set(dormXF.subarray(0, dormN * 8), 0);
      extraN = dormN;
      if (hov && hov.dorm) tint(extraFA, hov.dormIdx * 16, hov);
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
        extraFA.set(s.fa, extraN * 16);
        extraXF.set(s.xf, extraN * 8);
        if (s === hov) tint(extraFA, extraN * 16, s);
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
    return { instFA: extraFA, xforms: extraXF, count: extraN };
  },
};
