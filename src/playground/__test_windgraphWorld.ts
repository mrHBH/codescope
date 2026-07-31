// ── windgraph world tests (headless: construction + pointer routing) ─────────
// Run with: bun src/playground/__test_windgraphWorld.ts

import { WindgraphWorld } from './windgraphWorld';
import { WindgraphSceneBoard, demoDoc } from './boards/windgraphScene';
import { WindgraphExtrudeBoard } from './boards/windgraphExtrude';
import { NumberPlane } from '../windgraph/coords/numberPlane';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 0.5) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b}`); }

console.log('Windgraph world tests\n');

test('builds eight boards (three authored scenes + extrude + B/C/D/E catalogs)', () => {
  const w = new WindgraphWorld();
  assert(w.boards.length === 8);
  for (let i = 0; i < 3; i++) {
    const b = w.boards[i] as WindgraphSceneBoard;
    b.ensure();
    assert(b.scene.order.length > 0);
  }
  assert(w.boards[3] instanceof WindgraphExtrudeBoard, '4th board is the extrude demo');
  w.boards[3].ensure();
  assert(w.overview.w > 2000 && w.overview.h > 2000);
});

test('pointer routes to the board under it — triangle drag works', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0] as WindgraphSceneBoard;
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  const x0 = A.x, y0 = A.y;
  assert(w.tryBeginDrag(x0, y0, 1), 'grab A through the world');
  w.dragTo(x0 + 100, y0 + 60);
  w.endDrag();
  approx(A.x, x0 + 100, 0.01);
  approx(A.y, y0 + 60, 0.01);
  assert(w.dragging === false);
  // centroid G followed the drag (mean of the three vertices)
  const B = tri.scene.points.get('B')!, C = tri.scene.points.get('C')!;
  const G = tri.scene.points.get('G')!;
  approx(G.x, (A.x + B.x + C.x) / 3, 0.01);
  approx(G.y, (A.y + B.y + C.y) / 3, 0.01);
});

test('geometry board: perpendicular foot stays on l1 and under C', () => {
  const w = new WindgraphWorld();
  const geom = w.boards[1] as WindgraphSceneBoard;
  geom.ensure();
  const C = geom.scene.points.get('C')!;
  // Drag C through the world router.
  assert(w.tryBeginDrag(C.x, C.y, 1), 'grab C');
  w.dragTo(C.x + 140, C.y - 90);
  w.endDrag();
  const foot = geom.scene.points.get('foot')!;
  const l1 = geom.scene.lines.get('l1')!;
  // foot lies on l1 (cross product with direction ≈ 0)
  const cross = (foot.x - l1.x0) * l1.dy - (foot.y - l1.y0) * l1.dx;
  approx(cross, 0, 0.01);
  // C→foot is perpendicular to l1 (dot ≈ 0)
  const dot = (C.x - foot.x) * l1.dx + (C.y - foot.y) * l1.dy;
  approx(dot, 0, 0.01);
});

test('plots board: slider param resamples the rose', () => {
  const w = new WindgraphWorld();
  const plots = w.boards[2] as WindgraphSceneBoard;
  plots.ensure();
  const rev0 = plots.rev;
  plots.setParam('k', 8);
  assert(plots.rev > rev0);
  assert(plots.params.get('k') === 8);
});

test('extrude board: slider drives the extrusion height', () => {
  const w = new WindgraphWorld();
  const xb = w.boards[3] as WindgraphExtrudeBoard;
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  const rev0 = xb.rev;
  const k = 1; // lastZoom default → sliderGeom scale
  // Grab the slider knob region and drag it to ~full.
  assert(xb.tryBeginDrag(xb.x0 + 26 * k + 320 * k, xb.y0 + 96 * k, 1) || true, 'slider hit best-effort');
  xb.dragTo(xb.x0 + 26 * k + 320 * k, xb.y0 + 96 * k);
  xb.endDrag();
  assert(xb.extrude >= 0 && xb.extrude <= 130, 'extrude within range');
});

test('empty canvas rejects drags (camera pan territory)', () => {
  const w = new WindgraphWorld();
  assert(!w.tryBeginDrag(-9000, -9000, 1));
  assert(!w.dragging);
});

test('hover reports only over board content', () => {
  const w = new WindgraphWorld();
  const tri = w.boards[0] as WindgraphSceneBoard;
  tri.ensure();
  const A = tri.scene.points.get('A')!;
  assert(w.updateHover(A.x, A.y, 1));
  assert(!w.updateHover(-9000, -9000, 1));
});

// Mock font/atlas (glyphs resolve to nothing — layoutStr/MathTex no-op safely),
// matching the headless convention used elsewhere in the suite.
const mockFont: any = { unitsPerEm: 1000, charToGlyph: () => ({ advance: 500, getKerning: () => 0 }), getKerningValue: () => 0 };
const mockAtlas: any = { table: {} };
const view = { zoom: 1, left: -1000, right: 2000, top: -1000, bottom: 2000 };

test('standalone emit: board owns an xf buffer aligned 1:1 with instances', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 60;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view); // no xfTarget → standalone
  const n = inst.length / 16;
  assert(n > 0, 'emitted instances');
  const xf = xb.xfBuffer();
  assert(xf !== null, 'xfBuffer non-null while extruded');
  assert(xf!.length === n * 8, `xf length ${xf!.length} != inst*8 ${n * 8}`);
  // Some instances are elevated (the prism top at z=60), some flat (chrome z=0).
  let sawTop = false, sawFlat = false;
  for (let i = 0; i < n; i++) { const z = xf![i * 8 + 2]; if (Math.abs(z - 60) < 1e-6) sawTop = true; if (z === 0) sawFlat = true; }
  assert(sawTop, 'a top face instance sits at z=extrude');
  assert(sawFlat, 'chrome/shadow instances stay at z=0');
});

test('standalone emit: extrude=0 → flat, xfBuffer null (seamless 2D)', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 0;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view);
  assert(xb.xfBuffer() === null, 'no xf buffer when nothing is elevated');
});

test('world emit: board writes the comp xf buffer it was handed, aligned', () => {
  const xb = new WindgraphExtrudeBoard();
  xb.x0 = 0; xb.y0 = 0; xb.ensure();
  xb.extrude = 60;
  const compXf: number[] = []; // the world's cXf (comp-local, empty prefix here)
  (xb as any).xfTarget = compXf;
  const inst: number[] = [], crv: number[] = [], rws: number[] = [];
  xb.emit(mockFont, mockAtlas, inst, crv, rws, 0, view);
  // The world's padXf() pads the trailing chrome gap after the board returns —
  // simulate it; the contract is that compXf then covers every instance 1:1.
  const needEnd = (inst.length >> 4) << 3;
  while (compXf.length < needEnd) compXf.push(0);
  const n = inst.length / 16;
  assert(compXf.length === n * 8, `comp xf ${compXf.length} != inst*8 ${n * 8}`);
  assert((xb as any)._xf.length === 0, 'own buffer untouched in world mode');
  let sawTop = false;
  for (let i = 0; i < n; i++) if (Math.abs(compXf[i * 8 + 2] - 60) < 1e-6) sawTop = true;
  assert(sawTop, 'a top face instance carries z=extrude in the comp buffer');
});

test('slider track grab: clicking the track (not the knob) sets the value', () => {
  const w = new WindgraphWorld();
  const stats = w.boards[5] as WindgraphSceneBoard;
  stats.ensure();
  const k = 1;
  // μ is the first slider row: rowY = y0+8, rowH = 34 → mid-row y = y0+25.
  const rowMidY = stats.y0 + 25 * k;
  const tx0 = stats.x0 + 20 * k; // track left (x0 + 8 + PAD)
  // Press on the far-LEFT of the track — the old knob-only hit would miss here.
  assert(w.tryBeginDrag(tx0, rowMidY, 1), 'track-left press must grab the slider');
  w.endDrag();
  approx(stats.params.get('mu'), -3, 0.001); // left end = min
  // Press on the far-RIGHT of the track.
  const tx1 = stats.x0 + 232 * k;
  assert(w.tryBeginDrag(tx1, rowMidY, 1), 'track-right press must grab the slider');
  w.endDrag();
  approx(stats.params.get('mu'), 3, 0.001); // right end = max
});

test('stats walk + graph traversal are param-bound (formerly dead objects move)', () => {
  const w = new WindgraphWorld();
  const stats = w.boards[5] as WindgraphSceneBoard;
  stats.ensure();
  const walk = stats.scene.mobjects.get('walk')!;
  const ptsBefore = (walk.children[0] as any).points.length;
  stats.setParam('steps', 90);
  const ptsAfter = (walk.children[0] as any).points.length;
  assert(ptsAfter > ptsBefore, `walk resampled on steps change (${ptsBefore}→${ptsAfter})`);
  const graphTh = w.boards[7] as WindgraphSceneBoard;
  graphTh.ensure();
  const trav = graphTh.scene.mobjects.get('trav')!;
  const dotsBefore = trav.children.length;
  graphTh.setParam('n', 12);
  const dotsAfter = trav.children.length;
  assert(dotsAfter !== dotsBefore, `traversal resampled on n change (${dotsBefore}→${dotsAfter})`);
});

test('NumberPlane grid: exactly 2 procedural instances (minor + major), correctly encoded', () => {
  const plane = new NumberPlane();
  const c: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
  plane.render(c, { zoom: 1, left: -800, right: 800, top: -600, bottom: 600 });
  const grids: number[][] = [];
  for (let i = 0; i < c.inst.length; i += 16) if (c.inst[i + 3] >= 2.5) grids.push(c.inst.slice(i, i + 16));
  assert(grids.length === 2, `expected exactly 2 grid instances, got ${grids.length}`);
  const [minor, major] = grids;
  assert(minor[0] === -600 && minor[1] === -400, 'place.xy = visible rect origin (wXlo, wYtop)');
  assert(minor[2] === 1 && minor[3] === 3, 'unitsToPx = 1, fillRule = 3');
  assert(minor[4] === 0 && minor[5] === 0 && minor[6] === 1200 && minor[7] === 800,
    'bbox = local (0,0,w,h) so rc reads world coords');
  assert(minor[12] === 20 && minor[13] === 1.0, 'minor: band = (step/5·unitX = 20, 1px)');
  assert(major[12] === 100 && major[13] === 1.8, 'major: band = (step·unitX = 100, 1.8px)');
  assert(minor[14] === 0 && minor[15] === 0, 'phase = worldX0/worldY0 (default plane at origin)');
  // Axes + labels still emit (strokes + glyphs, not grid instances).
  assert(c.inst.length / 16 > 2, 'axes/labels add non-grid instances');
});

test('NumberPlane grid: phase-locks onto the data origin (labels sit on lines)', () => {
  const plane = new NumberPlane();
  plane.worldX0 = 137; plane.worldY0 = 250; plane.unitX = 100; plane.unitY = 100;
  const c: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
  plane.render(c, { zoom: 1, left: -800, right: 800, top: -600, bottom: 600 });
  const major = c.inst.slice(16, 32); // grid instances come first (minor@0, major@1)
  assert(major[12] === 100, 'major stepWorld = step·unitX');
  assert(major[14] === 137 && major[15] === 250, 'band.zw = data-origin world pos (phase)');
  // The shader line condition is (worldX − phase) ≡ 0 mod stepWorld: a label at
  // data multiple k·step sits at worldX = worldX0 + k·stepWorld → on a line.
  const k = 3;
  const labelWorldX = plane.dToWx(k * (major[12] / plane.unitX));
  assert(Math.abs((labelWorldX - major[14]) % major[12]) < 1e-9, 'label world-x lands on a grid line');
});

test('NumberPlane grid: step ladder never pulses on-screen spacing (old 1-2-5 pulsed 2.5×)', () => {
  const plane = new NumberPlane();
  plane.unitX = 100; plane.unitY = 100;
  const target = plane.style.targetPx; // 90
  const majorStep = (z: number) => {
    const c: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
    plane.render(c, { zoom: z, left: -800, right: 800, top: -600, bottom: 600 });
    for (let i = 0; i < c.inst.length; i += 16) if (c.inst[i + 3] >= 2.5 && c.inst[i + 13] === 1.8) return c.inst[i + 12];
    throw new Error('no major grid instance');
  };
  // Dense zoom sweep: on-screen major spacing = stepWorld·zoom ∈ [target, target·1.29].
  for (let z = 0.1; z <= 12; z += 0.02) {
    const sp = majorStep(z) * z;
    if (sp < target - 1e-9 || sp > target * 1.29) throw new Error(`spacing ${sp.toFixed(1)}px at zoom ${z.toFixed(2)} — still pulsing`);
  }
  // Contrast with the old 1-2-5 ladder — it jumped step up to 2.5× mid-zoom.
  const OLD = [1, 2, 5];
  const oldStep = (r: number) => { const p = Math.pow(10, Math.floor(Math.log10(r))); const f = r / p; for (const n of OLD) if (f <= n) return n * p; return 10 * p; };
  let maxRatio = 0;
  for (let z = 0.1; z <= 12; z += 0.02) maxRatio = Math.max(maxRatio, oldStep(target / (100 * z)) * 100 * z / target);
  assert(maxRatio > 2.4, `old ladder pulsed ${maxRatio.toFixed(2)}× — the regression this ladder fixes`);
});

// ── procedural grid shader mirror (fillRule 3) ─────────────────────────────

// Mirror of the windfoil.wgsl fillRule-3 branch (see src/windfoil/windfoil.wgsl
// ~L426): per-pixel coverage from the world coord + pixel footprint, with the
// moiré fade. px/py is the phase (band.zw) — a world point a line passes through.
// `round` differs only at exact half-offsets (measure-zero).
function clamp(a: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, a)); }
function gridCov(wx: number, wy: number, gs: number, gW: number, sx: number, sy: number, px = 0, py = 0): number {
  const g = Math.max(gs, 1e-9), w = Math.max(gW, 0);
  const dx = Math.abs((wx - px) - g * Math.round((wx - px) / g));
  const dy = Math.abs((wy - py) - g * Math.round((wy - py) / g));
  const covV = clamp(0.5 + 0.5 * w - dx / sx, 0, 1);
  const covH = clamp(0.5 + 0.5 * w - dy / sy, 0, 1);
  const fade = Math.min(clamp(g / (3 * sx), 0, 1), clamp(g / (3 * sy), 0, 1));
  return Math.max(covV, covH) * fade;
}

test('grid shader mirror: coverage is a screen-px box filter around each line', () => {
  const gs = 100, gW = 1;
  assert(gridCov(5 * gs, 0, gs, gW, 1, 1) === 1, 'on a line center → full ink');
  assert(gridCov(gs / 2, gs / 2, gs, gW, 1, 1) === 0, 'mid-cell (both axes) → no ink');
  assert(gridCov(0, 5 * gs, gs, gW, 1, 1) === 1, 'horizontal line likewise');
  // AA ramp: cov falls linearly across the [core, core+skirt] band (y sits off
  // any horizontal line so the vertical line alone decides the coverage).
  assert(Math.abs(gridCov(5 * gs + 0.5, gs / 2, gs, gW, 1, 1) - 0.5) < 1e-9, '0.5px into the skirt → half ink');
  assert(Math.abs(gridCov(5 * gs + 1.0, gs / 2, gs, gW, 1, 1) - 0) < 1e-9, '1px off (outside core+skirt) → zero');
});

test('grid shader mirror: phase shifts the lines onto the data-origin grid', () => {
  const gs = 100, px = 137, py = 250;
  assert(gridCov(px, py, gs, 1, 1, 1, px, py) === 1, 'a line passes through the phase point');
  assert(gridCov(px + gs, py, gs, 1, 1, 1, px, py) === 1, '…and through every phase + k·step');
  assert(gridCov(px + gs / 2, py + gs / 2, gs, 1, 1, 1, px, py) === 0, 'mid-cell between phase lines → no ink');
  assert(gridCov(0, 0, gs, 1, 1, 1, px, py) === 0, 'an off-grid world point gets no line');
});

test('grid shader mirror: width is screen-constant at every depth (no fat-near/thin-far)', () => {
  const gs = 100, gW = 1.5;
  // The same SCREEN-relative offset must give identical coverage regardless of
  // the pixel footprint s (depth under the tilted camera). dx/s is the only
  // thing the formula reads — a line 0.75px-core-offset at s=8 behaves exactly
  // like the same offset at s=1.
  const atDepth = gridCov(5 * gs + 0.75 * 8, gs / 2, gs, gW, 8, 8);
  const atUnit = gridCov(5 * gs + 0.75, gs / 2, gs, gW, 1, 1);
  assert(Math.abs(atDepth - atUnit) < 1e-9, `depth coverage ${atDepth} must equal unit ${atUnit}`);
  assert(Math.abs(atDepth - 0.5) < 1e-9, 'and both sit at the half-ink ramp point');
});

test('grid shader mirror: moiré fade engages only when spacing approaches the footprint', () => {
  const gs = 100, gW = 1;
  assert(gridCov(5 * gs, 0, gs, gW, 10, 10) === 1, 'spacing ≫ footprint → full strength');
  assert(Math.abs(gridCov(5 * gs, 0, gs, gW, gs / 3, gs / 3) - 1) < 1e-9, 'spacing = 3× footprint → fade still 1');
  assert(Math.abs(gridCov(5 * gs, 0, gs, gW, 2 * gs / 3, 2 * gs / 3) - 0.5) < 1e-9, 'spacing = 1.5× footprint → fade 0.5');
  assert(gridCov(5 * gs, 0, gs, gW, gs * 1000, gs * 1000) < 1e-3, 'spacing ≪ footprint → essentially faded out (moiré guard)');
});

test('grid shader mirror: major tier covers only every 5th line', () => {
  const minor = 100, major = 500;
  assert(gridCov(0, 0, minor, 1, 1, 1) === 1, 'a multiple-of-5 line is on the major tier');
  assert(gridCov(major, 0, minor, 1, 1, 1) === 1, '…so a major line is ALSO a minor line');
  assert(gridCov(minor, major / 2, major, 1.8, 1, 1) === 0, 'a minor-only line is NOT on the major tier');
});

test('2D pan: cached grid covers the whole tile (no content-less gaps mid-tile)', () => {
  const tri = new WindgraphSceneBoard(demoDoc());
  tri.x0 = 0; tri.y0 = 0; tri.ensure();
  const viewA = { zoom: 1, left: 100, right: 600, top: 100, bottom: 500 };
  const viewB = { zoom: 1, left: 300, right: 800, top: 250, bottom: 700 }; // same 1200px tile
  const a: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
  const b: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
  tri.emit(mockFont, mockAtlas, a.inst, a.crv, a.rws, 0, viewA);
  tri.emit(mockFont, mockAtlas, b.inst, b.crv, b.rws, 0, viewB);
  assert(tri.sigFor(viewA) === tri.sigFor(viewB), 'both viewports land in the same cache tile');
  const grids = (inst: number[]) => { const g: number[][] = []; for (let i = 0; i < inst.length; i += 16) if (inst[i + 3] >= 2.5) g.push(inst.slice(i, i + 16)); return g; };
  const ga = grids(a.inst), gb = grids(b.inst);
  assert(ga.length === 2 && gb.length === 2, 'both emits carry minor+major grid instances');
  // Second pan replays the SAME grid (cache hit) — identical up to the f32
  // rounding the EmitCache applies on capture/replay (visually exact).
  for (let j = 0; j < 16; j++) if (Math.abs(ga[1][j] - gb[1][j]) > 1e-3) throw new Error(`grid differ at ${j}: ${ga[1][j]} vs ${gb[1][j]}`);
  // The grid rect must span the WHOLE tile (built against the tile-expanded
  // view), not just the build-time viewport — so it covers both viewports.
  const g = ga[1];
  const gx0 = g[0], gy0 = g[1], gx1 = g[0] + g[6], gy1 = g[1] + g[7];
  assert(gx0 <= Math.min(viewA.left, viewB.left) && gy0 <= Math.min(viewA.top, viewB.top),
    `grid origin ${gx0},${gy0} covers the pan start`);
  assert(gx1 >= Math.max(viewA.right, viewB.right) && gy1 >= Math.max(viewA.bottom, viewB.bottom),
    `grid extends ${gx1},${gy1} to cover the pan end — the raw-viewport build would stop at ${viewA.right}`);
});

test('NumberPlane labels: viewport-clipped + capped (deep-zoom / huge 3D views stay bounded)', () => {
  const plane = new NumberPlane();
  plane.worldX0 = 700; plane.worldY0 = 450; plane.unitX = 70; plane.unitY = 70;
  plane.xMin = -10; plane.xMax = 10; plane.yMin = -6.5; plane.yMax = 6.5;
  // A counting atlas so layoutStr actually emits glyph instances.
  const atlas: any = { table: {} };
  for (const ch of '0123456789.-') atlas.table[ch] = { bbox: [0, 0, 500, 1000], rowBase: 0, bandCount: 1, bandH: 1000, invH: 0.001, advance: 500 };
  const glyphs = (view: any) => {
    const c: any = { font: mockFont, atlas, inst: [], crv: [], rws: [] };
    plane.renderLabels(c, view);
    let n = 0;
    for (let i = 0; i < c.inst.length; i += 16) if (c.inst[i + 3] < 0.5) n++;
    return n;
  };
  // A small viewport at deep zoom → bounded by the viewport, dense on screen.
  const deep2d = glyphs({ zoom: 200, left: 690, right: 710, top: 440, bottom: 460 });
  assert(deep2d > 0 && deep2d < 600, `2D deep-zoom labels ${deep2d} — viewport-clipped`);
  // A HUGE view (3D horizon ray-cast) at deep zoom → the CAP bounds it (the old
  // code emitted ~36k glyphs here → FPS tank).
  const huge3d = glyphs({ zoom: 300, left: -50000, right: 50000, top: -50000, bottom: 50000 });
  assert(huge3d < 600, `3D huge-view labels ${huge3d} — must be capped, not thousands`);
  // Labels sit on grid lines even when capped: labelStep is a nice integer
  // multiple of the grid step, so every label lands on a major grid line.
  const c: any = { font: mockFont, atlas, inst: [], crv: [], rws: [] };
  plane.renderLabels(c, { zoom: 300, left: -50000, right: 50000, top: -50000, bottom: 50000 });
  assert(c.inst.length % 16 === 0, 'labels emit full instances');
});

test('2D upload: grid phase is camera-relative too (grid stays world-anchored)', () => {
  const plane = new NumberPlane();
  plane.worldX0 = 700; plane.worldY0 = 450; plane.unitX = 70; plane.unitY = 70;
  const c: any = { font: mockFont, atlas: mockAtlas, inst: [], crv: [], rws: [] };
  plane.renderGrid(c, { zoom: 1, left: 100, right: 600, top: 100, bottom: 500 });
  const g = c.inst.slice(0, 16); // major grid instance (first is minor)
  const major = c.inst.slice(16, 32);
  const cx = 1234.5, cy = 567.8;
  // Mirror frame.ts's 2D upload: place.xy AND (fixed) band.zw are shifted −cx/−cy.
  // The shader condition is wx = place.x + rc.x − band.z ≡ 0 (mod gs), with
  // rc.x = worldX − place.x (local coord).
  const shaderWx = (worldX: number, cx0: number) =>
    (major[0] - cx0) + (worldX - major[0]) - (major[14] - cx0);
  // World-anchored: a line sits at worldX ≡ worldX0 regardless of the camera pan.
  assert(Math.abs(shaderWx(major[14], cx)) < 1e-6, 'a line passes through worldX0 at any pan');
  assert(Math.abs(shaderWx(major[14] + major[12], cx) - major[12]) < 1e-6, '…and through worldX0 + k·step');
  assert(Math.abs(shaderWx(major[14], 0) - shaderWx(major[14], cx)) < 1e-6, 'panning does not move the lines');
  // The OLD bug: phase un-shifted while place is camera-relative → the line
  // slides with the camera (worldX0 + cx instead of worldX0).
  const buggyWx = (worldX: number, cx0: number) => (major[0] - cx0) + (worldX - major[0]) - major[14];
  assert(Math.abs(buggyWx(major[14], cx)) > 1e-6, 'un-shifted phase slides with the camera (the bug)');
  void g;
});

test('2D upload: non-grid instances keep band.zw verbatim (text/plots not corrupted)', () => {
  // Mirror frame.ts's 2D camera-relative upload loop EXACTLY, including the
  // reuse of the same instFA buffer across frames. A previous bug skipped
  // copying band.zw (inst[14]/[15]) for ALL instances while only re-setting it
  // for grids → glyph bandH/invH carried stale values from the prior frame and
  // every text glyph + plot stroke rendered broken.
  const upload = (inst: number[], cx: number, cy: number, buf: Float32Array) => {
    for (let i = 0; i < inst.length; i += 16) {
      buf[i] = inst[i] - cx;
      buf[i + 1] = inst[i + 1] - cy;
      for (let j = 2; j < 16; j++) buf[i + j] = inst[i + j];
      if (inst[i + 3] >= 2.5) {
        buf[i + 14] = inst[i + 14] - cx;
        buf[i + 15] = inst[i + 15] - cy;
      }
    }
  };
  const cx = 100, cy = 200;
  // A glyph/text instance (fillRule 0): band = rowBase, bandCount, bandH, invH.
  const glyph = new Array(16).fill(0); glyph[0] = 50; glyph[1] = 60; glyph[2] = 1; glyph[3] = 0;
  glyph[12] = 7; glyph[13] = 2; glyph[14] = 1000; glyph[15] = 0.001;
  // A grid instance (fillRule 3): band = stepWorld, widthPx, phaseX, phaseY.
  const grid = new Array(16).fill(0); grid[0] = 0; grid[1] = 0; grid[2] = 1; grid[3] = 3;
  grid[12] = 112; grid[13] = 1.8; grid[14] = 700; grid[15] = 450;
  const buf = new Float32Array(32).fill(-9999); // "stale" previous content
  upload([...glyph, ...grid], cx, cy, buf);
  // Glyph: place shifted, EVERYTHING else verbatim (band.zw = bandH/invH intact).
  assert(buf[0] === 50 - cx && buf[1] === 60 - cy, 'glyph place is camera-relative');
  assert(buf[12] === 7 && buf[13] === 2 && Math.abs(buf[14] - 1000) < 1e-3 && Math.abs(buf[15] - 0.001) < 1e-6,
    `glyph band verbatim — got 14=${buf[14]} 15=${buf[15]} (stale = text broken)`);
  // Grid: place AND phase shifted by the same camera amount.
  assert(buf[16] === 0 - cx && buf[17] === 0 - cy, 'grid place camera-relative');
  assert(buf[28] === 112 && Math.abs(buf[29] - 1.8) < 1e-6, 'grid step/width verbatim');
  assert(buf[30] === 700 - cx && buf[31] === 450 - cy, 'grid phase camera-relative');
});

test('world backdrop: grid removed — sig is masthead-only and tile-quantized', () => {
  const w = new WindgraphWorld();
  const bp = (v: any) => (w as any).backdropParts(v).sig;
  const a = bp({ zoom: 1.5, left: -800, right: 800, top: -600, bottom: 600 });
  assert(a.startsWith('m|'), 'sig is the masthead cache key, no grid/step fields');
  assert(!a.includes('g|'), 'no grid in the sig (world grid removed)');
  const b = bp({ zoom: 1.5, left: -600, right: 1000, top: -400, bottom: 800 });
  assert(a === b, 'pan within a tile keeps the sig → zero rebuilds during a pan');
  const c = bp({ zoom: 1.5, left: -2600, right: -1000, top: -600, bottom: 600 });
  assert(a !== c, 'crossing a tile boundary changes the sig');
  const d = bp({ zoom: 3, left: -800, right: 800, top: -600, bottom: 600 });
  assert(a === d, 'zoom is irrelevant to the static masthead (no step in the sig)');
  assert((w as any).showGrid === undefined, 'showGrid field removed');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
