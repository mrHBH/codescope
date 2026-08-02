// ── Analytic TestInfra board — zero-DOM recordings list ───────────────────────
// A world-space, fully interactive board (the reference-design pattern) that lists
// every recording in the store: per-row icon buttons (play / stats / delete), a
// hover state, an empty state, and a stats table for the most recent replay (the
// replay engine persists it to localStorage['cs-last-report']). Everything is drawn
// through the analytic pipeline (addRect + layoutStr + geometric icons) — no DOM.

import type { FontFace } from '../../windfoil/font';
import type { PlaneView } from '../../windgraph/coords/numberPlane';
import { addRect, layoutStr, tw } from '../../layout/metrics';
import { fillQuads, polygonQuads, type Pt } from '../../windgraph/stroke/stroke';
import { createStore, type RecMeta, type Store } from '../../recorder/store';
import type { ReplayReport } from '../../recorder/replay';

const BG       = [0.145, 0.145, 0.149, 0.97];
const BORDER   = [0.20, 0.20, 0.20, 1];
const TEXT     = [0.80, 0.80, 0.80, 1];
const DIM      = [0.533, 0.533, 0.533, 1];
const ACCENT   = [0.365, 0.839, 1.0, 1];
const GREEN    = [0.51, 0.86, 0.66, 1];
const RED      = [0.92, 0.45, 0.45, 1];
const ROW_BG   = [0.175, 0.18, 0.20, 0.9];
const ROW_HOV  = [0.21, 0.24, 0.29, 0.95];
const BTN_BG   = [0.06, 0.07, 0.09, 0.6];
const BTN_HOV  = [0.16, 0.20, 0.26, 0.9];
const ICON_COL = [0.86, 0.88, 0.93, 1];
const DOT      = [1, 1, 1, 0.06];

const PAD = 26;
const HEADER = 96;
const ROW_H = 78;
const BTN = 30;
const BTN_GAP = 8;

type RowAction = 'play' | 'delete';

export class TestInfraBoard {
  x0 = 0; y0 = 0; width = 1200; height = 800;
  /** Bumped on load / hover / delete so the world's frame-skip re-emits. */
  rev = 0;
  panel: null = null;

  private store: Store | null = null;
  private metas: RecMeta[] = [];
  private loaded = false;
  private loadErr = '';
  private hoveredRow = -1;
  private hoveredBtn: RowAction | null = null;
  private hoveredHeader: 'refresh' | 'home' | null = null;
  /** Confirm-delete state (first click arms, second deletes). */
  private armDelete = -1;
  /** Last replay report for a recording (stats table + chart). */
  private lastReport: ReplayReport | null = null;
  /** Copy-all button rect (world) + transient "copied" label. */
  private copyRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private copyLabel = 'copy all';

  constructor() {
    createStore().then((s) => { this.store = s; this.reload(); });
    try { const raw = localStorage.getItem('cs-last-report'); if (raw) this.lastReport = JSON.parse(raw); } catch { /* ignore */ }
  }

  async reload() {
    this.loaded = false;
    try {
      this.metas = this.store ? await this.store.list() : [];
      this.loadErr = '';
    } catch (e) { this.metas = []; this.loadErr = e instanceof Error ? e.message : String(e); }
    this.loaded = true;
    this.rev++;
  }

  private rowY(i: number): number { return this.y0 + HEADER + i * ROW_H; }
  private headerBtnX(): number { return this.x0 + this.width - PAD - BTN * 2 - BTN_GAP; }
  private headerBtnY(): number { return this.y0 + PAD; }
  private hitHeader(wx: number, wy: number): 'refresh' | 'home' | null {
    const hy = this.headerBtnY();
    if (wy < hy || wy > hy + BTN) return null;
    const bx = this.headerBtnX();
    if (wx >= bx && wx <= bx + BTN) return 'refresh';
    if (wx >= bx + BTN + BTN_GAP && wx <= bx + BTN * 2 + BTN_GAP) return 'home';
    return null;
  }

  // ── interactive board contract ─────────────────────────────────────────────
  get dragging(): boolean { return false; }
  autoDrive(): void {}
  sigFor(_view: PlaneView): string { return `ti|${this.rev}|${this.loaded}|${this.hoveredRow}|${this.hoveredBtn}|${this.armDelete}`; }

  updateHover(wx: number, wy: number, _scale: number): boolean {
    const prevR = this.hoveredRow, prevB = this.hoveredBtn, prevH = this.hoveredHeader;
    this.hoveredRow = -1; this.hoveredBtn = null; this.hoveredHeader = null;
    if (wx >= this.x0 && wx <= this.x0 + this.width && wy >= this.y0 && wy <= this.y0 + this.height) {
      this.hoveredHeader = this.hitHeader(wx, wy);
      for (let i = 0; i < this.metas.length; i++) {
        const ry = this.rowY(i);
        if (wy >= ry && wy <= ry + ROW_H) {
          this.hoveredRow = i;
          this.hoveredBtn = this.hitBtn(wx, wy, i);
          break;
        }
      }
    }
    if (prevR !== this.hoveredRow || prevB !== this.hoveredBtn || prevH !== this.hoveredHeader) this.rev++;
    return this.hoveredRow >= 0 || this.hoveredBtn !== null || this.hoveredHeader !== null;
  }

  tryBeginDrag(wx: number, wy: number, _scale: number): boolean {
    const hh = this.hitHeader(wx, wy);
    if (hh === 'refresh') { void this.reload(); return true; }
    if (hh === 'home') { location.hash = '#launcher'; location.reload(); return true; }
    for (let i = 0; i < this.metas.length; i++) {
      const act = this.hitBtn(wx, wy, i);
      if (!act) continue;
      const m = this.metas[i];
      if (act === 'play') {
        // Replay, then `?back=testinfra` makes the replay engine return here —
        // the board then shows the stats table (from cs-last-report).
        location.hash = `#${m.route}?replay=${encodeURIComponent(m.name)}&back=testinfra`;
        location.reload();
      }
      else if (act === 'delete') {
        if (this.armDelete === i) { void this.store?.remove(m.name); this.armDelete = -1; void this.reload(); }
        else { this.armDelete = i; this.rev++; }
      }
      return true;
    }
    // Click elsewhere: dismiss a pending delete confirm or the stats panel.
    if (this.armDelete >= 0) { this.armDelete = -1; this.rev++; return true; }
    if (this.statsCopyHit(wx, wy)) { this.copy(); return true; }
    if (this.statsDismiss(wx, wy)) { this.lastReport = null; this.copyRect = null; try { localStorage.removeItem('cs-last-report'); } catch { /* ignore */ } this.rev++; return true; }
    return false;
  }
  dragTo(_wx: number, _wy: number): void {}
  endDrag(): void {}

  private hitBtn(wx: number, wy: number, row: number): RowAction | null {
    const ry = this.rowY(row);
    const bx = this.x0 + this.width - PAD - BTN * 2 - BTN_GAP;
    const order: RowAction[] = ['delete', 'play']; // right→left
    for (let k = 0; k < order.length; k++) {
      const bxx = bx + k * (BTN + BTN_GAP);
      if (wx >= bxx && wx <= bxx + BTN && wy >= ry + (ROW_H - BTN) / 2 && wy <= ry + (ROW_H - BTN) / 2 + BTN) return order[k];
    }
    return null;
  }

  private statsDismiss(wx: number, wy: number): boolean {
    if (!this.lastReport) return false;
    const r = this.lastReport;
    const w = 720, h = 640;
    const px = this.x0 + this.width - w - 30, py = this.y0 + this.height - h - 30;
    return wx >= px + w - 26 && wx <= px + w - 4 && wy >= py + 6 && wy <= py + 28;
  }

  private statsCopyHit(wx: number, wy: number): boolean {
    return !!this.copyRect && wx >= this.copyRect.x0 && wx <= this.copyRect.x1 && wy >= this.copyRect.y0 && wy <= this.copyRect.y1;
  }

  private copyMarkdown(): string {
    const r = this.lastReport!;
    const side = (s: any) => `${s.fpsAvg} / ${s.fpsMin} / ${s.fpsP95}  (${s.dtAvg}ms dt)  js ${s.jsAvg}/${s.jsMax}ms  dropped ${s.dropped}  frames ${s.frames}`;
    const rows = ['| metric | recorded | replay |', '|---|---|---|',
      `| fps avg / min / p95 | ${r.recorded.fpsAvg} / ${r.recorded.fpsMin} / ${r.recorded.fpsP95} | ${r.replay.fpsAvg} / ${r.replay.fpsMin} / ${r.replay.fpsP95} |`,
      `| frame dt avg / p95 / worst (ms) | ${r.recorded.dtAvg} / ${r.recorded.dtP95} / ${r.recorded.dtWorst} | ${r.replay.dtAvg} / ${r.replay.dtP95} / ${r.replay.dtWorst} |`,
      `| js avg / max (ms) | ${r.recorded.jsAvg} / ${r.recorded.jsMax} | ${r.replay.jsAvg} / ${r.replay.jsMax} |`,
      `| dropped frames (>33ms) | ${r.recorded.dropped} | ${r.replay.dropped} |`,
      `| frames sampled | ${r.recorded.frames} | ${r.replay.frames} |`,
    ];
    const inputs = Object.entries(r.inputs || {}).map(([k, v]) => `${k} ×${v}`).join(' · ') || '—';
    return [
      `### replay · ${r.name}  (route #${r.route})`,
      `inputs: ${inputs} · duration ${(r.duration / 1000).toFixed(2)}s · viewport ${r.viewportMatch ? 'match' : 'DIFFERS'}`,
      '',
      ...rows,
    ].join('\n');
  }

  private copy() {
    const md = this.copyMarkdown();
    navigator.clipboard?.writeText(md).then(
      () => { this.copyLabel = 'copied ✓'; setTimeout(() => { this.copyLabel = 'copy all'; this.rev++; }, 1400); },
      () => { console.log(md); this.copyLabel = 'copy blocked (see console)'; setTimeout(() => { this.copyLabel = 'copy all'; this.rev++; }, 1800); },
    ).catch(() => {});
    this.rev++;
  }

  // ── emit ──────────────────────────────────────────────────────────────────
  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, _view: PlaneView): void {
    const x0 = this.x0, y0 = this.y0, x1 = this.x0 + this.width, y1 = this.y0 + this.height;
    addRect(x0, y0, x1, y1, BG, crv, rws, inst);
    addRect(x0, y0, x1, y0 + 3, ACCENT, crv, rws, inst);
    addRect(x0, y0, x1, y0 + 1, BORDER, crv, rws, inst);
    addRect(x0, y1 - 1, x1, y1, BORDER, crv, rws, inst);
    addRect(x0, y0, x0 + 1, y1, BORDER, crv, rws, inst);
    addRect(x1 - 1, y0, x1, y1, BORDER, crv, rws, inst);

    // Header.
    layoutStr(inst, 'TEST INFRA', ACCENT, atlas.table, font, { x: x0 + PAD, y: y0 + PAD + 4, size: 24 });
    layoutStr(inst, 'recordings  ·  F2 in any demo records  ·  ▶ replay (then stats here)  ·  🗑 delete (click twice)', DIM, atlas.table, font, { x: x0 + PAD, y: y0 + PAD + 38, size: 13 });

    // Header buttons: ↻ refresh + 🏠 home.
    this.btn(inst, crv, rws, this.headerBtnX(), this.headerBtnY(), 'refresh');
    this.btn(inst, crv, rws, this.headerBtnX() + BTN + BTN_GAP, this.headerBtnY(), 'home');

    // Empty / error / rows.
    if (!this.loaded) {
      layoutStr(inst, 'loading…', DIM, atlas.table, font, { x: x0 + PAD, y: y0 + HEADER, size: 15 });
      return;
    }
    if (this.loadErr) {
      layoutStr(inst, 'store error: ' + this.loadErr, RED, atlas.table, font, { x: x0 + PAD, y: y0 + HEADER, size: 14 });
      return;
    }
    if (!this.metas.length) {
      layoutStr(inst, 'no recordings yet', TEXT, atlas.table, font, { x: x0 + PAD, y: y0 + HEADER + 30, size: 18 });
      layoutStr(inst, 'open any demo (e.g. #windgraph) → F2 → do the action → F2 → it lands here.', DIM, atlas.table, font, { x: x0 + PAD, y: y0 + HEADER + 56, size: 13 });
      return;
    }

    const n = Math.min(this.metas.length, Math.floor((y1 - y0 - HEADER) / ROW_H));
    for (let i = 0; i < n; i++) this.row(font, atlas, inst, crv, rws, i);

    // Stats table + chart for the most recent replay.
    this.copyRect = this.lastReport ? this.copyRect : null;
    if (this.lastReport) this.statsPanel(font, atlas, inst, crv, rws, x1, y1);
  }

  private row(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], i: number) {
    const m = this.metas[i];
    const ry = this.rowY(i), x0 = this.x0, x1 = this.x0 + this.width;
    const hov = i === this.hoveredRow;
    addRect(x0 + PAD - 6, ry, x1 - PAD + 6, ry + ROW_H - 8, hov ? ROW_HOV : ROW_BG, crv, rws, inst);
    if (hov) addRect(x0 + PAD - 6, ry, x0 + PAD - 4, ry + ROW_H - 8, ACCENT, crv, rws, inst);

    const nameX = x0 + PAD;
    layoutStr(inst, m.name, TEXT, atlas.table, font, { x: nameX, y: ry + 18, size: 16 });
    const fps = m.summary ? `${m.summary.fpsAvg}/${m.summary.fpsMin} fps` : '—';
    const fw = tw(fps, font, 12);
    layoutStr(inst, fps, m.summary ? GREEN : DIM, atlas.table, font, { x: nameX, y: ry + 42, size: 12 });
    const inputs = m.summary?.inputs ? Object.entries(m.summary.inputs).map(([k, v]) => `${k}×${v}`).join(' ') : '';
    const meta = `#${m.route}  ·  ${m.viewport.w}×${m.viewport.h}@${m.viewport.dpr}x  ·  ${inputs}  ·  ${new Date(m.recordedAt).toLocaleString()}`;
    layoutStr(inst, meta, DIM, atlas.table, font, { x: nameX + fw + 18, y: ry + 42, size: 11 });

    // Row actions (right→left: delete, play).
    const bx = x0 + this.width - PAD - BTN * 2 - BTN_GAP;
    const by = ry + (ROW_H - BTN) / 2;
    const order: { act: RowAction; icon: 'play' | 'delete' }[] = [
      { act: 'delete', icon: 'delete' },
      { act: 'play', icon: 'play' },
    ];
    for (let k = 0; k < order.length; k++) {
      const o = order[k];
      const bxx = bx + k * (BTN + BTN_GAP);
      const armed = o.act === 'delete' && this.armDelete === i;
      const isHov = hov && this.hoveredBtn === o.act;
      addRect(bxx, by, bxx + BTN, by + BTN, armed ? RED : isHov ? BTN_HOV : BTN_BG, crv, rws, inst);
      addRect(bxx, by, bxx + BTN, by + 1, armed ? RED : ACCENT, crv, rws, inst);
      addRect(bxx, by + BTN - 1, bxx + BTN, by + BTN, armed ? RED : ACCENT, crv, rws, inst);
      addRect(bxx, by, bxx + 1, by + BTN, armed ? RED : ACCENT, crv, rws, inst);
      addRect(bxx + BTN - 1, by, bxx + BTN, by + BTN, armed ? RED : ACCENT, crv, rws, inst);
      this.drawIcon(inst, crv, rws, o.icon, bxx, by, BTN, armed ? [1, 1, 1, 1] : ICON_COL);
    }
  }

  private statsPanel(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], x1: number, y1: number) {
    const r = this.lastReport!;
    const w = 720, h = 640;
    const px = x1 - w - 30, py = y1 - h - 30;
    this.copyRect = { x0: px + w - 170, y0: py + h - 46, x1: px + w - 20, y1: py + h - 16 };
    addRect(px, py, px + w, py + h, [0.12, 0.13, 0.15, 0.97], crv, rws, inst);
    addRect(px, py, px + w, py + 1, ACCENT, crv, rws, inst);
    addRect(px, py + h - 1, px + w, py + h, BORDER, crv, rws, inst);
    addRect(px, py, px + 1, py + h, BORDER, crv, rws, inst);
    addRect(px + w - 1, py, px + w, py + h, BORDER, crv, rws, inst);
    // Title + labels.
    layoutStr(inst, 'REPLAY · ' + r.name, ACCENT, atlas.table, font, { x: px + 16, y: py + 16, size: 15 });
    layoutStr(inst, (r.viewportMatch ? 'viewport: match' : 'viewport: DIFFERS') + '   ·   ' + (r.duration / 1000).toFixed(2) + 's', DIM, atlas.table, font, { x: px + 16, y: py + 34, size: 11 });
    layoutStr(inst, Object.entries(r.inputs || {}).map(([k, v]) => `${k}×${v}`).join('  ') || 'no inputs', DIM, atlas.table, font, { x: px + 16, y: py + 50, size: 11 });
    this.drawIcon(inst, crv, rws, 'close', px + w - 24, py + 4, 22, DIM);

    // ── Chart: frame dt columns (green) + js caps (orange), bucketed ≤ 360. ──
    const cX = px + 54, cW = w - 120, cY = py + 92, cH = 200;
    const sdt = r.series?.dt?.length ? r.series.dt : [0];
    const sjs = r.series?.js?.length ? r.series.js : [0];
    let maxDt = 16.7;
    for (const v of sdt) if (v > maxDt) maxDt = v;
    maxDt = Math.min(maxDt * 1.05, 200);
    const mapY = (v: number) => cY + cH - (Math.min(v, maxDt) / maxDt) * cH;
    const N = sdt.length;
    const buckets = Math.min(N, 360);
    const colW = cW / buckets;
    for (let bkt = 0; bkt < buckets; bkt++) {
      const i0 = Math.floor((bkt / buckets) * N), i1 = Math.max(i0 + 1, Math.floor(((bkt + 1) / buckets) * N));
      let dMax = 0, jMax = 0;
      for (let k = i0; k < i1 && k < N; k++) { dMax = Math.max(dMax, sdt[k]); jMax = Math.max(jMax, sjs[k]); }
      const x0 = cX + bkt * colW, x1 = x0 + Math.max(colW - 0.6, 0.8);
      addRect(x0, mapY(dMax), x1, cY + cH, [0.34, 0.8, 0.5, 0.26], crv, rws, inst);
      addRect(x0, mapY(dMax) - 1, x1, mapY(dMax) + 1, [0.34, 0.8, 0.5, 1], crv, rws, inst);
      addRect(x0, mapY(jMax) - 1, x1, mapY(jMax) + 1, [0.95, 0.62, 0.3, 1], crv, rws, inst);
    }
    // Budget lines + axis labels.
    for (const [ms, label] of [[1000 / 60, '16.7ms'], [1000 / 30, '33.3ms']] as [number, string][]) {
      if (ms > maxDt) continue;
      const y = mapY(ms);
      addRect(cX, y - 1, cX + cW, y + 1, ms <= 16.7 ? [1, 1, 1, 0.12] : [0.92, 0.42, 0.40, 0.35], crv, rws, inst);
      layoutStr(inst, label, DIM, atlas.table, font, { x: cX + cW + 6, y: y - 8, size: 11 });
    }
    layoutStr(inst, maxDt.toFixed(0) + 'ms', DIM, atlas.table, font, { x: cX - 40, y: cY - 7, size: 11 });
    layoutStr(inst, '0', DIM, atlas.table, font, { x: cX - 18, y: cY + cH - 7, size: 11 });
    addRect(cX - 2, cY, cX, cY + cH, [1, 1, 1, 0.25], crv, rws, inst);
    addRect(cX, cY + cH, cX + cW, cY + cH + 2, [1, 1, 1, 0.25], crv, rws, inst);
    layoutStr(inst, 'frame gap (green columns) + main-thread js (orange caps) per frame · dt=gap between frames; js=frame() cost', DIM, atlas.table, font, { x: cX, y: cY + cH + 18, size: 11 });

    // ── Table (recorded vs replay). ──
    const ty = cY + cH + 44;
    layoutStr(inst, 'metric', DIM, atlas.table, font, { x: px + 16, y: ty, size: 12 });
    layoutStr(inst, 'recorded', GREEN, atlas.table, font, { x: px + 250, y: ty, size: 12 });
    layoutStr(inst, 'replay', GREEN, atlas.table, font, { x: px + 420, y: ty, size: 12 });
    addRect(px + 12, ty + 12, px + w - 12, ty + 13, BORDER, crv, rws, inst);
    const row = (label: string, rec: string, rep: string, i: number, hi = false) => {
      const yy = ty + 26 + i * 26;
      layoutStr(inst, label, DIM, atlas.table, font, { x: px + 16, y: yy, size: 12 });
      layoutStr(inst, rec, hi ? GREEN : TEXT, atlas.table, font, { x: px + 250, y: yy, size: 12 });
      layoutStr(inst, rep, hi ? GREEN : TEXT, atlas.table, font, { x: px + 420, y: yy, size: 12 });
    };
    let i = 0;
    row('fps avg', String(r.recorded.fpsAvg), String(r.replay.fpsAvg), i++, true);
    row('fps min', String(r.recorded.fpsMin), String(r.replay.fpsMin), i++);
    row('fps p95', String(r.recorded.fpsP95), String(r.replay.fpsP95), i++);
    row('frame dt avg (ms)', String(r.recorded.dtAvg), String(r.replay.dtAvg), i++);
    row('frame dt p95 (ms)', String(r.recorded.dtP95), String(r.replay.dtP95), i++);
    row('frame dt worst (ms)', String(r.recorded.dtWorst), String(r.replay.dtWorst), i++);
    row('js avg (ms)', String(r.recorded.jsAvg), String(r.replay.jsAvg), i++);
    row('js max (ms)', String(r.recorded.jsMax), String(r.replay.jsMax), i++);
    row('dropped frames (>33ms)', String(r.recorded.dropped), String(r.replay.dropped), i++);
    row('frames sampled', String(r.recorded.frames), String(r.replay.frames), i++);
    if (r.error) row('error', '—', r.error, i, true);
    layoutStr(inst, 'js≈dt = main-thread bound · js≪dt = GPU/compositor bound · fps+dt = frame pacing', DIM, atlas.table, font, { x: px + 16, y: ty + 26 * (i + 1) + 12, size: 11 });

    // ── Copy-all button ──
    const cr = this.copyRect!;
    addRect(cr.x0, cr.y0, cr.x1, cr.y1, [0.10, 0.24, 0.34, 0.9], crv, rws, inst);
    addRect(cr.x0, cr.y0, cr.x1, cr.y0 + 1, ACCENT, crv, rws, inst);
    addRect(cr.x0, cr.y1 - 1, cr.x1, cr.y1, ACCENT, crv, rws, inst);
    addRect(cr.x0, cr.y0, cr.x0 + 1, cr.y1, ACCENT, crv, rws, inst);
    addRect(cr.x1 - 1, cr.y0, cr.x1, cr.y1, ACCENT, crv, rws, inst);
    layoutStr(inst, this.copyLabel, [0.9, 0.92, 0.96, 1], atlas.table, font, { x: cr.x0 + 10, y: cr.y0 + 8, size: 12 });
  }

  private btn(inst: number[], crv: number[], rws: number[], bx: number, by: number, icon: 'refresh' | 'home') {
    const hov = this.hoveredHeader === icon;
    addRect(bx, by, bx + BTN, by + BTN, hov ? BTN_HOV : BTN_BG, crv, rws, inst);
    addRect(bx, by, bx + BTN, by + 1, hov ? ACCENT : BORDER, crv, rws, inst);
    addRect(bx, by + BTN - 1, bx + BTN, by + BTN, hov ? ACCENT : BORDER, crv, rws, inst);
    addRect(bx, by, bx + 1, by + BTN, hov ? ACCENT : BORDER, crv, rws, inst);
    addRect(bx + BTN - 1, by, bx + BTN, by + BTN, hov ? ACCENT : BORDER, crv, rws, inst);
    this.drawIcon(inst, crv, rws, icon, bx, by, BTN, ICON_COL);
  }

  // ── geometric icons (bars + triangles, the reference toolbar style) ────────
  private drawIcon(inst: number[], crv: number[], rws: number[], icon: string, bx: number, by: number, s: number, col: number[]) {
    const fx = (f: number) => bx + f * s, fy = (f: number) => by + f * s;
    const bar = (a: number, b: number, c: number, d: number) => addRect(fx(a), fy(b), fx(c), fy(d), col, crv, rws, inst);
    const tri = (pts: [number, number][]) => fillQuads(polygonQuads(pts.map(([a, b]) => [fx(a), fy(b)] as Pt), true), col, inst, crv, rws);
    switch (icon) {
      case 'play':
        tri([[0.36, 0.26], [0.36, 0.74], [0.74, 0.50]]);
        break;
      case 'stats':
        bar(0.26, 0.58, 0.38, 0.74);
        bar(0.46, 0.34, 0.58, 0.74);
        bar(0.66, 0.46, 0.78, 0.74);
        break;
      case 'rename':
        bar(0.30, 0.62, 0.46, 0.44);
        bar(0.44, 0.28, 0.58, 0.42);
        bar(0.28, 0.64, 0.32, 0.74);
        bar(0.30, 0.62, 0.32, 0.74);
        bar(0.54, 0.66, 0.72, 0.72);
        break;
      case 'delete':
        bar(0.24, 0.36, 0.76, 0.38);
        bar(0.34, 0.30, 0.66, 0.34);
        bar(0.38, 0.42, 0.42, 0.68);
        bar(0.50, 0.42, 0.54, 0.68);
        bar(0.62, 0.42, 0.66, 0.68);
        break;
      case 'refresh': {
        const cx = fx(0.50), cy = fy(0.48), r = s * 0.22;
        for (let a = -0.8; a < 0.8; a += 0.17) {
          addRect(cx + Math.cos(a) * r - 0.8, cy + Math.sin(a) * r - 0.8, cx + Math.cos(a) * r + 0.8, cy + Math.sin(a) * r + 0.8, col, crv, rws, inst);
        }
        bar(0.60, 0.60, 0.76, 0.46);
        break;
      }
      case 'home':
        bar(0.26, 0.46, 0.74, 0.50);
        bar(0.34, 0.48, 0.38, 0.72);
        bar(0.62, 0.48, 0.66, 0.72);
        bar(0.36, 0.30, 0.64, 0.46);
        break;
      case 'close':
        bar(0.40, 0.26, 0.60, 0.74);
        bar(0.26, 0.40, 0.74, 0.60);
        break;
    }
  }
}
