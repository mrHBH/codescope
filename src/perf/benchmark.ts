// ── Scripted performance benchmark ───────────────────────────────────────────
// A repeatable scripted camera run that visits the known problem spots (page
// idle, real synthetic mouse motion, full-document overview, far zoom-out with
// every board visible, zoomed-out panning, deep glyph zoom, editor, file-tree
// hover, and every perf-bench stress mode zoomed in AND out), sampling every
// frame: frame gap (dt), main-thread time inside frame() (js), and instance
// count. Mouse phases dispatch REAL PointerEvents on the canvas so the actual
// input path (browser dispatch + our handlers + hover hit-test) is measured.
// Results render as a world-space board through our own renderer — a dt/js
// chart with colour-coded phase bands and a matching summary table — and a
// fixed DOM button copies the table as markdown (clipboard needs a gesture).

import type { AppState } from '../state';
import type { FontFace } from '../windfoil/font';
import { addRect, layoutStr } from '../layout/metrics';

const INK = [0.90, 0.92, 0.98, 1];
const DIM = [0.60, 0.64, 0.74, 1];
const GREEN = [0.40, 0.82, 0.52, 1];
const ORANGE = [0.95, 0.66, 0.30, 1];
const RED = [0.92, 0.42, 0.40, 1];
const GRID = [1, 1, 1, 0.10];
const PANEL = [0.055, 0.06, 0.075, 1];

// One colour per phase — shared by the chart bands and the table rows so
// sections can be matched at a glance.
const PALETTE = [
  [0.36, 0.62, 0.98, 1], [0.40, 0.82, 0.52, 1], [0.95, 0.66, 0.30, 1], [0.78, 0.60, 0.98, 1],
  [0.35, 0.82, 0.94, 1], [0.95, 0.76, 0.35, 1], [0.92, 0.42, 0.40, 1], [0.55, 0.90, 0.75, 1],
  [0.90, 0.55, 0.80, 1], [0.70, 0.75, 0.45, 1], [0.50, 0.55, 0.95, 1], [0.85, 0.85, 0.60, 1],
  [0.45, 0.70, 0.60, 1], [0.90, 0.60, 0.50, 1], [0.60, 0.85, 0.95, 1], [0.75, 0.65, 0.85, 1],
  [0.95, 0.85, 0.55, 1], [0.55, 0.65, 0.75, 1], [0.85, 0.50, 0.65, 1], [0.65, 0.90, 0.55, 1],
];
const phaseCol = (i: number) => PALETTE[i % PALETTE.length];

// Frame segments profiled in frame.ts (in execution order). Kept here so the
// results table/chart share one canonical order + colour per segment.
const SEG_ORDER = ['setup', 'hover', 'staticCopy', 'dynamic', 'textCopy', 'editable', 'editor', 'term+tree', 'windgraph', 'morph', 'interact', 'math', 'bench', 'upload', 'encode'];
const SEG_COL: Record<string, number[]> = {
  setup: [0.50, 0.55, 0.62, 1], hover: [0.95, 0.42, 0.40, 1], staticCopy: [0.36, 0.62, 0.98, 1],
  dynamic: [0.95, 0.66, 0.30, 1], textCopy: [0.40, 0.82, 0.52, 1], editable: [0.78, 0.60, 0.98, 1],
  editor: [0.35, 0.82, 0.94, 1], 'term+tree': [0.55, 0.90, 0.75, 1],
  windgraph: [0.90, 0.55, 0.80, 1], morph: [0.70, 0.75, 0.45, 1], interact: [0.50, 0.55, 0.95, 1],
  math: [0.85, 0.50, 0.65, 1], bench: [0.45, 0.70, 0.60, 1],
  upload: [0.95, 0.85, 0.55, 1], encode: [0.60, 0.64, 0.74, 1],
};

interface Phase {
  name: string;
  dur: number; // ms
  enter(s: AppState): void;
  tick?(s: AppState, t: number): void; // t = seconds into phase
}

interface PhaseStat {
  name: string; frames: number; fps: number; avgDt: number; p95Dt: number;
  worstDt: number; avgJs: number; worstJs: number; avgInst: number;
  seg: Record<string, number>; // avg ms per frame segment
}

function snap(s: AppState, x: number, y: number, z: number) {
  s.camX = s.viewX = s.tgtX = x;
  s.camY = s.viewY = s.tgtY = y;
  s.camZ = s.viewZ = s.tgtZ = Math.max(z, s.minZoom);
  s.velX = s.velY = 0;
}

function fitZoom(s: AppState, w: number, h: number, pad = 0.9) {
  return Math.min(s.tCanvas.width / w, s.tCanvas.height / h) * pad;
}

// Park the synthetic mouse off-content so hover work is idle.
function parkMouse(s: AppState) { s.mx = 2; s.my = 2; }

// Sweep the mouse across the viewport by dispatching a REAL PointerEvent on the
// canvas each frame (Lissajous path — crosses lots of distinct elements). This
// exercises the true input path: browser dispatch, every pointermove listener,
// and the per-frame hover hit-test that follows s.mx/s.my.
function sweepMouse(s: AppState, t: number) {
  const cw = s.rCanvas.clientWidth || 1, ch = s.rCanvas.clientHeight || 1;
  const cx = cw * (0.5 + 0.42 * Math.sin(t * 2.4));
  const cy = ch * (0.5 + 0.42 * Math.sin(t * 3.1 + 1.3));
  s.rCanvas.dispatchEvent(new PointerEvent('pointermove', {
    clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', bubbles: true,
  }));
}

// Bounding box of everything in the world (pages + all boards/panels).
function contentBounds(s: AppState) {
  let x0 = 0, y0 = 0, x1 = s.PAGE_W, y1 = s.docH;
  const add = (a: number, b: number, w: number, h: number) => {
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a + w); y1 = Math.max(y1, b + h);
  };
  if (s.fileTree) add(s.fileTree.x0, s.fileTree.y0, s.fileTree.width, s.fileTree.contentHeight);
  if (s.editor) add(s.editor.x0, s.editor.y0, s.editor.contentWidth(), s.editor.contentHeight());
  if (s.terminal) add(s.terminal.x0, s.terminal.y0, s.terminal.contentW, s.terminal.contentH);
  if (s.windgraph) add(s.windgraph.x0, s.windgraph.y0, s.windgraph.width, s.windgraph.height);
  if (s.morphDemo) add(s.morphDemo.x0, s.morphDemo.y0, s.morphDemo.width, s.morphDemo.height);
  if (s.interactive) add(s.interactive.x0, s.interactive.y0, s.interactive.width, s.interactive.height);
  if (s.mathDemo) add(s.mathDemo.x0, s.mathDemo.y0, s.mathDemo.width, s.mathDemo.height);
  if (s.bench) add(s.bench.x0, s.bench.y0, s.bench.width, s.bench.height);
  return { x0, y0, x1, y1 };
}

// A big heading glyph to dive into (same heuristic as the cinematic demo).
function glyphTarget(s: AppState) {
  let best: { x: number; y: number; fs: number; h: number } | null = null;
  for (const el of s.styledEls) {
    if (el.text && el.text.trim().length > 2 && el.fs >= 24 && (!best || el.fs > best.fs)) best = el;
  }
  if (best) return { x: best.x + best.fs * 0.42, y: best.y + best.h * 0.42 };
  return { x: s.PAGE_W / 2, y: 240 };
}

function buildPhases(s: AppState): Phase[] {
  const pageZoom = () => (s.tCanvas.width / s.PAGE_W) * 0.96;
  const framePage = () => {
    const z = pageZoom();
    snap(s, s.PAGE_W / 2, 40 + s.tCanvas.height / (2 * z), z);
  };
  const frameDoc = () => snap(s, s.PAGE_W / 2, s.docH / 2, fitZoom(s, s.PAGE_W, s.docH));
  const b = contentBounds(s);
  const frameAll = () => snap(s, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, fitZoom(s, b.x1 - b.x0, b.y1 - b.y0, 0.95));
  const g = glyphTarget(s);

  const phases: Phase[] = [
    { name: 'warmup', dur: 1200, enter: () => { framePage(); parkMouse(s); } },
    { name: 'page idle', dur: 2500, enter: () => { framePage(); parkMouse(s); } },
    { name: 'page + mouse', dur: 2500, enter: framePage, tick: (st, t) => sweepMouse(st, t) },
    { name: 'doc overview idle', dur: 2500, enter: () => { frameDoc(); parkMouse(s); } },
    { name: 'doc overview + mouse', dur: 2500, enter: frameDoc, tick: (st, t) => sweepMouse(st, t) },
    { name: 'far out idle', dur: 2500, enter: () => { frameAll(); parkMouse(s); } },
    { name: 'far out + mouse', dur: 2500, enter: frameAll, tick: (st, t) => sweepMouse(st, t) },
    {
      name: 'far out + pan', dur: 3000, enter: () => { frameAll(); parkMouse(s); },
      tick: (st, t) => {
        const r = 0.22 * (b.x1 - b.x0);
        snap(st, (b.x0 + b.x1) / 2 + Math.cos(t * 1.5) * r, (b.y0 + b.y1) / 2 + Math.sin(t * 1.5) * r * 0.4, st.camZ);
      },
    },
    { name: 'deep glyph zoom', dur: 2500, enter: () => { snap(s, g.x, g.y, 140); parkMouse(s); } },
  ];
  if (s.editor) {
    const ed = s.editor;
    phases.push({
      name: 'editor + mouse', dur: 2500,
      enter: () => snap(s, ed.x0 + ed.contentWidth() / 2, ed.y0 + ed.contentHeight() / 2, fitZoom(s, ed.contentWidth(), ed.contentHeight())),
      tick: (st, t) => sweepMouse(st, t),
    });
  }
  if (s.fileTree) {
    const ft = s.fileTree;
    phases.push({
      name: 'file tree + mouse', dur: 2500,
      enter: () => snap(s, ft.x0 + ft.width / 2, ft.y0 + Math.max(ft.contentHeight, 400) / 2, fitZoom(s, ft.width + 80, Math.max(ft.contentHeight, 400))),
      tick: (st, t) => sweepMouse(st, t),
    });
  }
  // Perf-bench stress modes, each framed close (fills the screen — overdraw /
  // fragment cost) and far (minified — instance/vertex cost).
  if (s.bench) {
    const bb = s.bench;
    const modeName = ['baseline', 'rect grid', 'glyph grid', 'rect overdraw', 'glyph overdraw'];
    for (let m = 1; m <= 4; m++) {
      const zFit = () => fitZoom(s, bb.width + 160, bb.height + 160);
      phases.push({
        name: `bench ${modeName[m]} in`, dur: 1600,
        enter: () => { bb.mode = m; parkMouse(s); snap(s, bb.x0 + bb.width / 2, bb.y0 + bb.height / 2, zFit() * 2.4); },
      });
      phases.push({
        name: `bench ${modeName[m]} out`, dur: 1600,
        enter: () => { bb.mode = m; parkMouse(s); snap(s, bb.x0 + bb.width / 2, bb.y0 + bb.height / 2, zFit() * 0.25); },
      });
    }
  }
  return phases;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export class PerfBenchmark {
  // Results board placement (world space; set from main.ts).
  x0 = -3600; y0 = 0; width = 3000; height = 2050;

  running = false;
  showResults = false;
  version = 0; // bumps each completed run → invalidates the results emit cache
  private startedAt = 0;

  private s: AppState;
  private phases: Phase[] = [];
  private idx = 0;
  private phaseStart = 0;
  // Per-frame samples across the whole run (parallel arrays).
  private sDt: number[] = [];
  private sJs: number[] = [];
  private sInst: number[] = [];
  private sPhase: number[] = [];
  private sSeg: (Record<string, number> | null)[] = [];
  private stats: PhaseStat[] = [];
  private copyBtn: HTMLButtonElement;

  constructor(s: AppState) {
    this.s = s;
    const b = document.createElement('button');
    b.textContent = '📋 copy bench results';
    b.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:20;display:none;'
      + 'padding:9px 16px;border-radius:10px;border:none;cursor:pointer;background:rgba(22,22,46,0.92);color:#fff;font:13px monospace;';
    b.onclick = () => {
      navigator.clipboard.writeText(this.markdown()).then(
        () => { b.textContent = '✓ copied — paste it back'; setTimeout(() => { b.textContent = '📋 copy bench results'; }, 1500); },
        () => { b.textContent = '✗ clipboard blocked (see console)'; console.log(this.markdown()); },
      );
    };
    document.body.appendChild(b);
    this.copyBtn = b;
  }

  toggle() {
    // Ignore a second click within 2s — with no visible motion in the first
    // phases it's almost always an accidental double-start, not a cancel.
    if (this.running && performance.now() - this.startedAt < 2000) return;
    this.running ? this.stop(false) : this.start();
  }

  status(): string {
    const ph = this.phases[this.idx];
    return ph ? `bench ${this.idx + 1}/${this.phases.length}: ${ph.name}` : 'bench';
  }

  start() {
    const s = this.s;
    if (s.cam3d.active) return; // 2D-only script
    if (s.demo?.running) s.demo.stop();
    this.phases = buildPhases(s);
    this.idx = 0;
    this.sDt.length = 0; this.sJs.length = 0; this.sInst.length = 0; this.sPhase.length = 0; this.sSeg.length = 0;
    this.stats = [];
    this.showResults = false;
    this.copyBtn.style.display = 'none';
    this.running = true;
    this.startedAt = performance.now();
    this.phaseStart = performance.now();
    this.phases[0].enter(s);
    console.log('[perf] benchmark started — hands off for ~40s');
  }

  stop(finished: boolean) {
    this.running = false;
    parkMouse(this.s);
    if (this.s.bench) this.s.bench.mode = 0; // leave the stress board empty
    if (!finished) return;
    this.computeStats();
    // Board height depends on the table length (phase count can vary): header +
    // chart + table + segment breakdown (legend + one bar per phase).
    this.height = 210 + 620 + 110 + (this.stats.length + 1) * 48 + 200 + this.stats.length * 44 + 80;
    this.showResults = true;
    this.version++;
    this.copyBtn.style.display = 'block';
    this.exportResults();
    // Frame the camera onto the results board.
    snap(this.s, this.x0 + this.width / 2, this.y0 + this.height / 2, fitZoom(this.s, this.width + 200, this.height + 200));
  }

  // Drive the script (replaces stepCamera while running).
  update(now: number) {
    const s = this.s;
    const ph = this.phases[this.idx];
    const t = now - this.phaseStart;
    if (t >= ph.dur) {
      this.idx++;
      if (this.idx >= this.phases.length) { this.stop(true); return; }
      this.phaseStart = now;
      this.phases[this.idx].enter(s);
      return;
    }
    ph.tick?.(s, t / 1000);
  }

  // Record one frame (called at the end of the frame loop while running).
  sample(dt: number, jsMs: number, instCount: number, seg: Record<string, number> | null = null) {
    if (!this.running || this.sDt.length > 20000) return;
    if (this.phases[this.idx]?.name === 'warmup') return;
    this.sDt.push(dt); this.sJs.push(jsMs); this.sInst.push(instCount); this.sPhase.push(this.idx);
    this.sSeg.push(seg);
  }

  private computeStats() {
    this.stats = [];
    for (let p = 0; p < this.phases.length; p++) {
      if (this.phases[p].name === 'warmup') continue;
      const dt: number[] = [], js: number[] = []; let inst = 0, n = 0;
      const seg: Record<string, number> = {};
      for (let i = 0; i < this.sPhase.length; i++) {
        if (this.sPhase[i] !== p) continue;
        dt.push(this.sDt[i]); js.push(this.sJs[i]); inst += this.sInst[i]; n++;
        const sg = this.sSeg[i];
        if (sg) for (const key in sg) seg[key] = (seg[key] || 0) + sg[key];
      }
      if (!n) continue;
      for (const key in seg) seg[key] /= n;
      const sum = dt.reduce((a, v) => a + v, 0);
      const sorted = [...dt].sort((a, v) => a - v);
      const jsSum = js.reduce((a, v) => a + v, 0);
      this.stats.push({
        name: this.phases[p].name, frames: n,
        fps: 1000 / (sum / n), avgDt: sum / n, p95Dt: percentile(sorted, 0.95),
        worstDt: Math.max(...dt), avgJs: jsSum / n, worstJs: Math.max(...js),
        avgInst: inst / n, seg,
      });
    }
  }

  private markdown(): string {
    const h = '| # | phase | frames | avg fps | avg dt | p95 dt | worst dt | avg js | worst js | avg inst |';
    const sep = '|---|---|---|---|---|---|---|---|---|---|';
    const rows = this.stats.map((r, i) =>
      `| ${i + 1} | ${r.name} | ${r.frames} | ${r.fps.toFixed(1)} | ${r.avgDt.toFixed(2)} | ${r.p95Dt.toFixed(2)} | ${r.worstDt.toFixed(1)} | ${r.avgJs.toFixed(2)} | ${r.worstJs.toFixed(1)} | ${Math.round(r.avgInst)} |`);
    const segH = `| # | phase | ${SEG_ORDER.join(' | ')} |`;
    const segSep = `|---|---|${SEG_ORDER.map(() => '---').join('|')}|`;
    const segRows = this.stats.map((r, i) =>
      `| ${i + 1} | ${r.name} | ${SEG_ORDER.map((k) => (r.seg[k] || 0).toFixed(2)).join(' | ')} |`);
    const env = `canvas ${this.s.tCanvas.width}x${this.s.tCanvas.height} @dpr${this.s.dpr} · ${navigator.userAgent}`;
    return [
      `### windfoil perf benchmark — ${new Date().toISOString()}`, env, '',
      h, sep, ...rows, '',
      '#### frame() segment breakdown (avg ms per frame)', segH, segSep, ...segRows,
    ].join('\n');
  }

  private exportResults() {
    const md = this.markdown();
    console.log(md);
    console.table(this.stats.map((r) => ({
      phase: r.name, frames: r.frames, 'avg fps': +r.fps.toFixed(1), 'avg dt (ms)': +r.avgDt.toFixed(2),
      'p95 dt': +r.p95Dt.toFixed(2), 'worst dt': +r.worstDt.toFixed(1),
      'avg js (ms)': +r.avgJs.toFixed(2), 'worst js': +r.worstJs.toFixed(1), 'avg inst': Math.round(r.avgInst),
    })));
    // Best-effort auto copy (may be blocked without a user gesture — the 📋
    // button at the top of the screen is the reliable path).
    navigator.clipboard?.writeText(md).catch(() => {});
  }

  // ── Results board (world-space, drawn with our own renderer) ───────────────
  // Rect-only chart: every mark is an addRect (shader fast-path, no curve
  // banding) so displaying the results costs almost nothing per frame —
  // stroked polylines here used to re-band ~1500 quads every frame, which
  // itself tanked the FPS while reading the results.
  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[]) {
    if (!this.showResults || !this.stats.length) return;
    const table = atlas.table;
    const X = this.x0, Y = this.y0, W = this.width;

    addRect(X, Y, X + W, Y + this.height, PANEL, crv, rws, inst);
    layoutStr(inst, 'PERF BENCHMARK RESULTS', INK, table, font, { x: X + 60, y: Y + 40, size: 44 });
    layoutStr(inst, 'frame gap (green columns) + main-thread js ms (orange caps) per frame · use the 📋 button at the top of the screen to copy the table', DIM, table, font, { x: X + 60, y: Y + 100, size: 18 });

    // ── Chart ──
    const px = X + 110, pw = W - 260, py = Y + 210, phh = 620;
    const N = this.sDt.length;
    let maxDt = 20;
    for (const v of this.sDt) if (v > maxDt) maxDt = v;
    maxDt = Math.min(maxDt * 1.05, 200);
    const mapX = (i: number) => px + (i / Math.max(N - 1, 1)) * pw;
    const mapY = (v: number) => py + phh - (Math.min(v, maxDt) / maxDt) * phh;

    // Phase bands (colour-coded to match the table) + numbered labels.
    let bandStart = 0, band = 0;
    for (let i = 1; i <= N; i++) {
      if (i === N || this.sPhase[i] !== this.sPhase[bandStart]) {
        const bx0 = mapX(bandStart), bx1 = mapX(i - 1);
        const c = phaseCol(band);
        addRect(bx0, py, bx1, py + phh, [c[0], c[1], c[2], 0.06], crv, rws, inst);
        addRect(bx0, py - 10, bx1, py - 4, [c[0], c[1], c[2], 0.9], crv, rws, inst);
        layoutStr(inst, String(band + 1), c, table, font, { x: (bx0 + bx1) / 2 - 8, y: py - 40, size: 20 });
        band++; bandStart = i;
      }
    }

    // Budget lines: 60fps / 30fps + axis labels.
    for (const [ms, label, col] of [[1000 / 60, '16.7ms (60fps)', GRID], [1000 / 30, '33.3ms (30fps)', [0.92, 0.42, 0.40, 0.35]]] as [number, string, number[]][]) {
      if (ms > maxDt) continue;
      const y = mapY(ms);
      addRect(px, y - 1, px + pw, y + 1, col, crv, rws, inst);
      layoutStr(inst, label, DIM, table, font, { x: px + pw + 12, y: y - 9, size: 15 });
    }
    layoutStr(inst, `${maxDt.toFixed(0)}ms`, DIM, table, font, { x: px - 84, y: py - 8, size: 15 });
    layoutStr(inst, '0', DIM, table, font, { x: px - 30, y: py + phh - 8, size: 15 });
    addRect(px - 2, py, px, py + phh, GRID, crv, rws, inst);
    addRect(px, py + phh, px + pw, py + phh + 2, GRID, crv, rws, inst);

    // Samples as rect columns (dt) + caps (js), bucketed to ≤ 700 columns.
    const buckets = Math.min(N, 700);
    const colW = pw / buckets;
    for (let bkt = 0; bkt < buckets; bkt++) {
      const i0 = Math.floor((bkt / buckets) * N), i1 = Math.max(i0 + 1, Math.floor(((bkt + 1) / buckets) * N));
      let dMax = 0, jMax = 0;
      for (let k = i0; k < i1 && k < N; k++) { dMax = Math.max(dMax, this.sDt[k]); jMax = Math.max(jMax, this.sJs[k]); }
      const x0 = px + bkt * colW, x1 = x0 + Math.max(colW - 0.5, 0.8);
      addRect(x0, mapY(dMax), x1, py + phh, [GREEN[0], GREEN[1], GREEN[2], 0.28], crv, rws, inst);
      addRect(x0, mapY(dMax) - 2, x1, mapY(dMax) + 2, GREEN, crv, rws, inst);
      addRect(x0, mapY(jMax) - 2, x1, mapY(jMax) + 2, ORANGE, crv, rws, inst);
    }

    // ── Table (rows colour-swatched to the chart bands) ──
    const cols = ['#', 'phase', 'frames', 'avg fps', 'avg dt', 'p95 dt', 'worst dt', 'avg js', 'worst js', 'avg inst'];
    const colX = [0, 110, 700, 900, 1110, 1320, 1530, 1780, 1990, 2240];
    const ty = py + phh + 110;
    const rowH = 48, fs = 23;
    for (let c = 0; c < cols.length; c++) layoutStr(inst, cols[c], DIM, table, font, { x: X + 90 + colX[c], y: ty, size: fs });
    addRect(X + 80, ty + rowH - 12, X + W - 80, ty + rowH - 10, GRID, crv, rws, inst);
    this.stats.forEach((r, i) => {
      const y = ty + rowH * (i + 1);
      const c = phaseCol(i);
      if (i % 2) addRect(X + 80, y - 6, X + W - 80, y + rowH - 14, [1, 1, 1, 0.03], crv, rws, inst);
      addRect(X + 84, y + 2, X + 84 + 18, y + 20, c, crv, rws, inst); // swatch
      const slow = r.p95Dt > 20;
      const vals = ['', r.name, String(r.frames), r.fps.toFixed(1), r.avgDt.toFixed(2), r.p95Dt.toFixed(2), r.worstDt.toFixed(1), r.avgJs.toFixed(2), r.worstJs.toFixed(1), String(Math.round(r.avgInst))];
      layoutStr(inst, String(i + 1), c, table, font, { x: X + 90 + colX[0] + 26, y, size: fs });
      for (let cI = 1; cI < vals.length; cI++) {
        const col = cI === 1 ? INK : cI >= 3 && slow ? RED : INK;
        layoutStr(inst, vals[cI], col, table, font, { x: X + 90 + colX[cI], y, size: fs });
      }
    });
    const note = 'red rows: p95 frame gap over 20ms · js close to dt = main-thread bound, js far below dt = GPU/compositor bound';
    layoutStr(inst, note, DIM, table, font, { x: X + 90, y: ty + rowH * (this.stats.length + 1) + 24, size: 17 });

    // ── Segment breakdown (stacked bars, one per phase) ──
    // Where each phase's main-thread ms went inside frame(). Bars share one ms
    // scale so phases are comparable; colours map via the legend.
    const sy = ty + rowH * (this.stats.length + 1) + 90;
    layoutStr(inst, 'MAIN-THREAD BREAKDOWN (avg ms per frame)', INK, table, font, { x: X + 60, y: sy, size: 30 });
    let lx = X + 60, ly = sy + 52;
    for (const k of SEG_ORDER) {
      const w = 22 + k.length * 10 + 46;
      if (lx + w > X + W - 60) { lx = X + 60; ly += 30; } // wrap legend rows
      const c = SEG_COL[k];
      addRect(lx, ly + 2, lx + 16, ly + 18, c, crv, rws, inst);
      layoutStr(inst, k, DIM, table, font, { x: lx + 22, y: ly, size: 17 });
      lx += w;
    }
    const barX = X + 460, barW = W - barX + X - 220, barH = 30, rowG = 44;
    let maxJsAvg = 1;
    for (const r of this.stats) maxJsAvg = Math.max(maxJsAvg, r.avgJs);
    const by0 = ly + 48;
    this.stats.forEach((r, i) => {
      const y = by0 + i * rowG;
      const c = phaseCol(i);
      addRect(X + 84, y + 5, X + 84 + 18, y + 23, c, crv, rws, inst);
      layoutStr(inst, `${i + 1}  ${r.name}`, INK, table, font, { x: X + 114, y, size: 19 });
      let x = barX;
      for (const k of SEG_ORDER) {
        const v = r.seg[k] || 0;
        const w = (v / maxJsAvg) * barW;
        if (w > 0.3) addRect(x, y + 2, x + w, y + 2 + barH, SEG_COL[k], crv, rws, inst);
        x += w;
      }
      layoutStr(inst, `${r.avgJs.toFixed(1)}ms`, DIM, table, font, { x: x + 12, y: y + 4, size: 17 });
    });
  }
}
