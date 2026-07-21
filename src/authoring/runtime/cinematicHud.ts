// ── Cinematic HUD — fully analytic screen-space overlay, zero DOM ────────────
// Letterbox bars + the sleek chapter timeline (ported 1:1 from timelineHud.ts) +
// play/replay/home controls + the lower-third caption, all emitted in SCREEN
// PIXELS into a dedicated instance buffer. frame.ts draws that buffer with a
// screen-ortho matrix in the same pass as the 3D scene (depth stays 1 because
// the cinematic has no mesh, so the overlay composites on top). Hit-testing is
// done in screen space too: world points are projected through the live
// view-projection, so it works under the 3D perspective camera.

import { DrawHelpers, type DrawCtx, type EmitBuffers } from '../islands/draw';
import { tw } from '../../layout/metrics';
import type { ChapterWindow } from './timeline';
import type { SceneRuntime } from './runtime';
import type { AppState } from '../../state';
import { cameraViewProj } from '../../camera/camera';

export interface HudActions {
  toggle: () => void;
  replay: () => void;
  back: () => void;
  sync: () => void;   // refresh playhead-driven effects (postfx) after a seek
}

export interface HudInfo {
  t: number; total: number; playing: boolean;
  chapters: ChapterWindow[]; activeIdx: number;
}

type Hit = 'play' | 'replay' | 'back' | 'scrub' | 'debug' | null;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── palette (matches timelineHud.ts CSS) ────────────────────────────────────
const BAR_COL   = [0.027, 0.031, 0.047, 1];   // #07080c
const LINE_COL  = [0.494, 0.541, 0.651, 0.52];// rgba(126,138,166,.52)
const MARK_COL  = [0.518, 0.569, 0.675, 0.7]; // rgba(132,145,172,.7)
const HEAD_COL  = [0.365, 0.839, 1.0, 1];     // #5dd6ff
const TIME_COL  = [0.659, 0.698, 0.765, 1];   // #a8b2c3
const TITLE_COL = [0.839, 0.867, 0.914, 1];   // #d6dde9
const SUB_COL   = [0.498, 0.541, 0.627, 1];   // #7f8aa0
const BTN_BG    = [0.06, 0.07, 0.09, 0.55];
const BTN_HOV   = [0.14, 0.16, 0.21, 0.80];
const BTN_BD    = [0.30, 0.33, 0.42, 0.6];
const ICON      = [0.86, 0.88, 0.93, 1];
const CAP_TITLE = [0.933, 0.941, 0.957, 1];   // #eef0f4
const CAP_SUB   = [0.541, 0.553, 0.584, 1];   // #8a8d95

const ACTIVE_STRETCH = 1.9;

interface Btn { id: 'play' | 'replay' | 'back'; x: number; y: number; s: number; }
interface Geo {
  d: number; W: number; H: number;
  trackL: number; trackR: number; trackW: number;
  scrubY0: number; scrubY1: number;
  buttons: Btn[];
}

export class CinematicHud {
  private runtime: SceneRuntime;
  private s: AppState;
  private actions: HudActions;
  private barT = 0;
  private barTarget = 1;
  private lastNow = -1;
  mode: 'none' | 'scrub' | 'button' = 'none';
  private hoverBtn: string | null = null;
  private hoverScrub = false;
  private geo: Geo | null = null;
  /** 0 = compact (fps only), 1 = detailed readout. Click the panel or press D. */
  debugDetail = 0;
  /** True while the HUD is detached into a world card (Living UI). The world copy
   *  then renders its timeline at full strength and stays scrubbable even when
   *  the screen overlay's timeline has faded with the bars (e.g. while paused). */
  worldDetached = false;
  private screenGeo: Geo | null = null;
  private worldGeo: Geo | null = null;
  private _debugRect: { x0: number; y0: number; x1: number; y1: number } | null = null;

  toggleDebug() { this.debugDetail = this.debugDetail ? 0 : 1; }

  constructor(runtime: SceneRuntime, s: AppState, actions: HudActions) {
    this.runtime = runtime;
    this.s = s;
    this.actions = actions;
  }

  setBars(on: boolean) { this.barTarget = on ? 1 : 0; }
  get barValue(): number { return this.barT; }

  // ── coordinate helpers ────────────────────────────────────────────────────
  worldToScreen(wx: number, wy: number): [number, number] {
    const s = this.s;
    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    const vp = cameraViewProj(s, Cw, Ch);
    const cx = vp[0] * wx + vp[4] * wy + vp[12];
    const cy = vp[1] * wx + vp[5] * wy + vp[13];
    const cw = vp[3] * wx + vp[7] * wy + vp[15];
    const nx = cx / cw, ny = cy / cw;
    return [(nx * 0.5 + 0.5) * Cw, (0.5 - 0.5 * ny) * Ch];
  }

  private computeGeo(W: number, H: number, dprOverride?: number): Geo {
    // World card is virtual design-px (1280×720) scaled by an affine xform — never
    // bake device DPR into that space or buttons/timeline blow past the slot.
    const d = dprOverride ?? (this.s.dpr || 1);
    const marginLR = 0.07 * W;
    const timeW = 170 * d, gap = 14 * d;
    const trackL = marginLR, trackR = W - marginLR - timeW - gap, trackW = trackR - trackL;
    const padTop = 6 * d, trackH = 20 * d, labelsMT = 8 * d, labelsH = 46 * d;
    const bottomOff = 0.024 * H;
    const elH = padTop + trackH + labelsMT + labelsH;
    const elBottom = H - bottomOff;
    const trackTop = elBottom - labelsH - labelsMT - trackH + padTop;
    const scrubY0 = trackTop - 8 * d;
    const scrubY1 = elBottom;
    const bs = 34 * d, bgap = 8 * d, mR = 14 * d, mT = 14 * d;
    const backX = W - mR - bs, replayX = backX - bgap - bs, playX = replayX - bgap - bs;
    const buttons: Btn[] = [
      { id: 'play', x: playX, y: mT, s: bs },
      { id: 'replay', x: replayX, y: mT, s: bs },
      { id: 'back', x: backX, y: mT, s: bs },
    ];
    return { d, W, H, trackL, trackR, trackW, scrubY0, scrubY1, buttons };
  }

  // ── timeline layout (ported from timelineHud.ts) ──────────────────────────
  private layout(chapters: ChapterWindow[], active: number) {
    const total = Math.max(0.001, chapters.reduce((a, c) => a + c.duration, 0));
    const baseW: number[] = [], baseStart: number[] = [];
    let acc = 0;
    for (const c of chapters) { const w = c.duration / total; baseStart.push(acc); baseW.push(w); acc += w; }
    const stretched = baseW.map((w, i) => w * (i === active ? ACTIVE_STRETCH : 1));
    const ssum = Math.max(1e-6, stretched.reduce((a, w) => a + w, 0));
    const visW = stretched.map((w) => w / ssum);
    const visStart: number[] = [];
    acc = 0; for (const w of visW) { visStart.push(acc); acc += w; }
    return { baseW, baseStart, visW, visStart };
  }
  private mapProgress(ratio: number, L: ReturnType<CinematicHud['layout']>) {
    const t = clamp01(ratio);
    let seg = L.baseW.length - 1;
    for (let i = 0; i < L.baseW.length; i++) {
      const e = L.baseStart[i] + L.baseW[i];
      if (t < e || i === L.baseW.length - 1) { seg = i; break; }
    }
    const local = L.baseW[seg] > 1e-6 ? (t - L.baseStart[seg]) / L.baseW[seg] : 0;
    return L.visStart[seg] + clamp01(local) * L.visW[seg];
  }

  // ── hit testing (screen space) ────────────────────────────────────────────
  hitScreen(sx: number, sy: number): Hit {
    const g = this.geo;
    if (!g) return null;
    if (this._debugRect) {
      const r = this._debugRect;
      if (sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1) return 'debug';
    }
    for (const b of g.buttons) {
      if (sx >= b.x && sx <= b.x + b.s && sy >= b.y && sy <= b.y + b.s) return b.id;
    }
    // The timeline is interactive while shown — on screen that's only while the
    // bars are up (playing); once detached into the world card it stays live.
    if ((this.barT > 0.5 || this.worldDetached) && sx >= g.trackL && sx <= g.W - 0.07 * g.W && sy >= g.scrubY0 && sy <= g.scrubY1) return 'scrub';
    return null;
  }
  private scrubRatio(sx: number): number {
    const g = this.geo!;
    return clamp01((sx - g.trackL) / Math.max(1, g.trackW));
  }

  pointerDownScreen(sx: number, sy: number): boolean {
    const hit = this.hitScreen(sx, sy);
    if (!hit) return false;
    if (hit === 'scrub') {
      this.mode = 'scrub';
      this.runtime.stopTour(this.s);
      this.runtime.seek(this.s, this.scrubRatio(sx) * this.runtime.totalDuration(), true);
      this.actions.sync();
      return true;
    }
    if (hit === 'debug') { this.toggleDebug(); return true; }
    this.mode = 'button';
    if (hit === 'play') this.actions.toggle();
    else if (hit === 'replay') this.actions.replay();
    else this.actions.back();
    return true;
  }
  dragToScreen(sx: number) {
    if (this.mode === 'scrub') {
      this.runtime.seek(this.s, this.scrubRatio(sx) * this.runtime.totalDuration(), true);
      this.actions.sync();
    }
  }
  endDrag() { this.mode = 'none'; }
  hoverScreen(sx: number, sy: number): boolean {
    const h = this.hitScreen(sx, sy);
    this.hoverBtn = (h && h !== 'scrub') ? h : null;
    this.hoverScrub = h === 'scrub';
    return h !== null;
  }

  // ── build overlay geometry into the given buffers ───────────────────────────
  // By default emits in screen pixels (identity transform). For the Living UI,
  // `opts.xform` maps the HUD's virtual resolution into a world-space card slot
  // (DrawHelpers transforms every primitive, text included → razor-sharp), and
  // `opts.masterAlpha` drives the screen↔world crossfade during the peel.
  // `worldLetterbox` draws bars in world mode so the peel matches the screen HUD.
  build(font: any, atlas: any, now: number, W: number, H: number, info: HudInfo, out: EmitBuffers, opts?: {
    xform?: { ox: number; oy: number; sx: number; sy: number };
    masterAlpha?: number;
    worldLetterbox?: boolean;
    /** Skip barT damping (second build same frame — world then screen). */
    freezeBar?: boolean;
  }) {
    // NOTE: out.crv/out.rws are seeded by the runtime with the atlas base tables
    // (so glyph band indices resolve); out.inst is empty. We only append here.
    if (!opts?.freezeBar) {
      const dt = this.lastNow < 0 ? 0 : Math.min(now - this.lastNow, 50);
      this.lastNow = now;
      const k = 1 - Math.pow(0.0015, dt / 1000);
      this.barT += (this.barTarget - this.barT) * k;
    }

    const ma = opts?.masterAlpha ?? 1;
    const world = !!opts?.xform;
    // World peel uses canvas-sized virtual res → same DPR as the screen overlay
    // so buttons/timeline match 1:1 at detach=0.
    const g = this.computeGeo(W, H);
    if (world) this.worldGeo = g;
    else this.screenGeo = g;
    // Hit-testing must use the geo that matches the active coordinate space.
    this.geo = (this.worldDetached && this.worldGeo) ? this.worldGeo : (this.screenGeo ?? g);
    const d = g.d;
    const ctx: DrawCtx = { font, atlas, buff: out };
    const draw = new DrawHelpers(ctx);
    if (opts?.xform) draw.setTransform(opts.xform.ox, opts.xform.oy, opts.xform.sx, opts.xform.sy);
    // World copy fully faded: keep geo/barT fresh (hit-testing + bar damping) but
    // emit nothing into the card, so its instance count drops to zero.
    if (world && ma <= 0.001) return;

    // Letterbox: always on the true screen overlay (frame chrome). Also on the
    // world copy during peel so the projected HUD is optically identical — only
    // the camera dive reveals it lives in world space.
    const barH = 0.11 * H * this.barT;
    if (barH > 0.5 && (!world || opts?.worldLetterbox)) {
      // Screen bars ignore peel alpha (frame never loses its letterbox).
      // World bars ride masterAlpha so they crossfade with the rest of the HUD.
      const ba = world ? ma : 1;
      draw.rect(0, 0, W, barH, BAR_COL, ba);
      draw.rect(0, H - barH, W, H, BAR_COL, ba);
    }

    const chapters = info.chapters;
    // Timeline + controls crossfade with the peel (ma): the screen overlay fades
    // out as the world copy fades in. The WORLD copy (the Living UI) always shows
    // its timeline at full strength — it must stay visibly "live" even when the
    // screen overlay's timeline has faded with the bars (paused), so it uses tl=1.
    const tl = world ? 1 : this.barT;
    if (ma > 0.01 && chapters.length && tl > 0.01) {
      const L = this.layout(chapters, info.activeIdx);
      const total = Math.max(0.001, info.total);
      const ratio = clamp01(info.t / total);
      const vis = this.mapProgress(ratio, L);

      // geometry rows
      const padTop = 6 * d, trackH = 20 * d, labelsMT = 8 * d;
      const elBottom = H - 0.024 * H;
      const trackTop = elBottom - 46 * d - labelsMT - trackH + padTop;
      const lineY = trackTop + 0.64 * trackH;
      const headTop = trackTop + 6 * d, headBot = trackTop + trackH - 1 * d;
      const labelsTop = trackTop + trackH + labelsMT;

      // base line
      draw.rect(g.trackL, lineY - 1 * d, g.trackR, lineY + 1 * d, LINE_COL, tl * ma);
      // chapter markers
      for (let i = 0; i < chapters.length; i++) {
        const mx = g.trackL + L.visStart[i] * g.trackW;
        draw.rect(mx - 0.5 * d, trackTop + 1 * d, mx + 0.5 * d, trackTop + trackH - 1 * d, MARK_COL, tl * ma);
      }
      // playhead + glow
      const hx = g.trackL + vis * g.trackW;
      for (let i = 3; i >= 1; i--) {
        const sp = i * 2 * d;
        draw.rect(hx - sp, headTop - sp, hx + 3 * d + sp, headBot + sp, HEAD_COL, 0.16 * (1 - i / 4) * tl * ma);
      }
      draw.rect(hx, headTop, hx + 3 * d, headBot, HEAD_COL, tl * ma);
      // time label (right aligned)
      draw.text(`${info.t.toFixed(1)}s / ${total.toFixed(1)}s`, g.W - 0.07 * g.W, trackTop + 3 * d, 11 * d, TIME_COL, tl * ma, 'end');

      // chapter labels — telescoping like the DOM timeline: inactive titles are
      // clipped to their shrunken slot (so they pack/compress), the active one is
      // drawn last (on top) at full size with its subtitle and may overflow.
      const ACTIVE_SCALE = 2.0, INACT_SCALE = 0.66;
      const slotW = L.visW.map((w) => w * g.trackW);
      for (let i = 0; i < chapters.length; i++) {
        if (i === info.activeIdx) continue;
        const lx = g.trackL + L.visStart[i] * g.trackW;
        this.clippedText(draw, font, chapters[i].title, lx, labelsTop + 6 * d, 10 * d * INACT_SCALE, TITLE_COL, 0.52 * tl * ma, slotW[i]);
      }
      const ai = info.activeIdx;
      if (ai >= 0 && ai < chapters.length) {
        const lx = g.trackL + L.visStart[ai] * g.trackW;
        const ts = 10 * d * ACTIVE_SCALE, ss = 9 * d * ACTIVE_SCALE;
        draw.text(chapters[ai].title, lx, labelsTop - 1 * d, ts, TITLE_COL, tl * ma, 'start');
        draw.text((chapters[ai].sub ?? '').toUpperCase(), lx, labelsTop - 1 * d + ts * 1.15, ss, SUB_COL, tl * ma, 'start');
      }
    }

    // control buttons (top-right)
    if (ma > 0.01) for (const b of g.buttons) {
      const hot = this.hoverBtn === b.id;
      draw.rect(b.x, b.y, b.x + b.s, b.y + b.s, hot ? BTN_HOV : BTN_BG, ma);
      draw.rectStroke(b.x, b.y, b.x + b.s, b.y + b.s, hot ? HEAD_COL : BTN_BD, 1 * d, ma);
      this.icon(draw, b.id, b.x, b.y, b.s, info.playing, ma);
    }

    // lower-third caption — screen-only chrome (fades with the bars)
    if (!world && ma > 0.01 && this.barT > 0.01 && info.activeIdx >= 0 && chapters[info.activeIdx]) {
      const c = chapters[info.activeIdx];
      const titleSize = Math.max(23 * d, Math.min(40 * d, 0.025 * W));
      const subSize = Math.max(10 * d, Math.min(13 * d, 0.0095 * W));
      const lx = 0.07 * W;
      const subY = H - 0.134 * H - subSize;
      const titleY = subY - titleSize * 1.12 - 8 * d;
      draw.text(c.title, lx, titleY, titleSize, CAP_TITLE, this.barT * ma, 'start');
      draw.text((c.sub ?? '').toUpperCase(), lx, subY, subSize, CAP_SUB, this.barT * 0.9 * ma, 'start');
    }

    // Analytic debug panel (top-left) — screen-only chrome, drawn last so it sits
    // over the letterbox. Click it (or press D) to toggle compact ↔ detailed.
    const full = this.s.hudDebugText;
    if (!world && full) {
      const dbg = this.debugDetail ? full : `${parseInt(full, 10) || 0} fps`;
      const ds = 12 * d, m = 10 * d, padX = 10 * d, padY = 6 * d;
      const w = tw(dbg, font, ds) + padX * 2;
      const h = ds * 1.2 + padY * 2;
      draw.rect(m, m, m + w, m + h, [0.055, 0.055, 0.071, 0.9]);
      draw.rectStroke(m, m, m + w, m + h, [0.20, 0.22, 0.28, 0.5], 1 * d);
      draw.text(dbg, m + padX, m + padY, ds, [0.69, 0.706, 0.753, 1], 1, 'start');
      this._debugRect = { x0: m, y0: m, x1: m + w, y1: m + h };
    } else {
      this._debugRect = null;
    }
  }

  /** Draw `text` clipped to `maxW` (binary-search truncation) — the analytic
   *  equivalent of the DOM label's `overflow:hidden; text-overflow:ellipsis`. */
  private clippedText(draw: DrawHelpers, font: any, text: string, x: number, y: number, size: number, color: number[], alpha: number, maxW: number) {
    if (maxW <= 1 || !text) return;
    if (tw(text, font, size) <= maxW) { draw.text(text, x, y, size, color, alpha, 'start'); return; }
    let lo = 0, hi = text.length, best = '';
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      const s = text.slice(0, m);
      if (tw(s, font, size) <= maxW) { best = s; lo = m + 1; } else hi = m - 1;
    }
    if (best) draw.text(best, x, y, size, color, alpha, 'start');
  }

  private icon(draw: DrawHelpers, id: string, bx: number, by: number, s: number, playing: boolean, ma = 1) {
    const fx = (f: number) => bx + f * s, fy = (f: number) => by + f * s;
    if (id === 'play') {
      if (playing) {
        draw.rect(fx(0.32), fy(0.28), fx(0.44), fy(0.72), ICON, ma);
        draw.rect(fx(0.56), fy(0.28), fx(0.68), fy(0.72), ICON, ma);
      } else {
        draw.fillPoly([[fx(0.36), fy(0.28)], [fx(0.36), fy(0.72)], [fx(0.72), fy(0.5)]], ICON, ma);
      }
    } else if (id === 'replay') {
      const cx = fx(0.5), cy = fy(0.52), r = s * 0.22;
      draw.strokeCircle(cx, cy, r, ICON, s * 0.07, ma);
      draw.fillPoly([[cx + r, cy - s * 0.10], [cx + r, cy + s * 0.12], [cx + r + s * 0.13, cy + s * 0.01]], ICON, ma);
    } else {
      draw.fillPoly([
        [fx(0.50), fy(0.26)], [fx(0.22), fy(0.52)], [fx(0.32), fy(0.52)],
        [fx(0.32), fy(0.76)], [fx(0.68), fy(0.76)], [fx(0.68), fy(0.52)], [fx(0.78), fy(0.52)],
      ], ICON, ma);
    }
  }
}
