// ── Explainer demo ───────────────────────────────────────────────────────────
// A persistent analytic canvas plus a guided tour. The tour explains the core
// renderer math, then stops and leaves the whole canvas available for pan/zoom
// and interactive plot inspection.

import type { Engine } from './engine';
import type { AppState } from '../state';
import { createBaseApp, finishApp } from './app';
import { addRect, layoutStr, tw } from '../layout/metrics';
import { fillQuads, strokeInto, polygonQuads, circleQuads, type Pt } from '../windgraph/stroke/stroke';
import { MathTex } from '../windgraph/math/mathtex';
import { enter3D } from '../camera/camera';
import { disableOrbit, orbitDistForZoom, orbitGetPose, orbitSetPose, updateOrbit } from '../camera/orbit';

type BoardView = { zoom: number; left: number; right: number; top: number; bottom: number };
type EmitCtx = { font: any; atlas: any; inst: number[]; crv: number[]; rws: number[]; view: BoardView; now: number };
type Handle = 'coverageCenter' | 'coverageRadius' | 'windingPoint' | 'bandProbe' | null;

const SEC_W = 900;
const SEC_H = 760;
const SEC_POS: Pt[] = [[0, 90], [1160, -160], [2360, 220], [760, 1180], [2140, 1220]];
const TOUR_STEP = 7.2;
const TOUR_TRAVEL = 1.45;

const C = {
  bg: [0.045, 0.050, 0.066, 1],
  panel: [0.070, 0.078, 0.104, 0.94],
  panel2: [0.095, 0.105, 0.136, 0.88],
  border: [0.22, 0.25, 0.34, 1],
  faint: [0.55, 0.60, 0.72, 1],
  text: [0.90, 0.93, 0.98, 1],
  dim: [0.58, 0.64, 0.76, 1],
  blue: [0.32, 0.58, 1.00, 1],
  cyan: [0.34, 0.84, 0.94, 1],
  green: [0.54, 0.90, 0.58, 1],
  gold: [0.92, 0.73, 0.34, 1],
  rose: [0.96, 0.45, 0.55, 1],
  violet: [0.66, 0.62, 1.00, 1],
};

function sx(i: number) { return SEC_POS[i][0]; }
function sy(i: number) { return SEC_POS[i][1]; }
function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
function clamp01(v: number) { return clamp(v, 0, 1); }
function smooth(v: number) { v = clamp01(v); return v * v * (3 - 2 * v); }
function easeInOut(v: number) { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }
function rgba(c: number[], a = 1): number[] { return [c[0], c[1], c[2], (c[3] ?? 1) * a]; }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function text(ctx: EmitCtx, s: string, x: number, y: number, size: number, color = C.text, alpha = 1, anchor: 'start' | 'middle' | 'end' = 'start') {
  let tx = x;
  if (anchor !== 'start') {
    const w = tw(s, ctx.font, size);
    tx -= anchor === 'middle' ? w / 2 : w;
  }
  layoutStr(ctx.inst, s, rgba(color, alpha), ctx.atlas.table, ctx.font, { x: tx, y, size });
}

function line(ctx: EmitCtx, pts: Pt[], color: number[], width = 3, alpha = 1, dash?: number[]) {
  strokeInto(pts, { width, cap: 'round', join: 'round', dash }, rgba(color, alpha), ctx.inst, ctx.crv, ctx.rws);
}

function rectStroke(ctx: EmitCtx, x0: number, y0: number, x1: number, y1: number, color: number[], width = 2, alpha = 1) {
  line(ctx, [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], color, width, alpha);
}

function fillPoly(ctx: EmitCtx, pts: Pt[], color: number[], alpha = 1) {
  fillQuads(polygonQuads(pts, true), rgba(color, alpha), ctx.inst, ctx.crv, ctx.rws);
}

function fillCircle(ctx: EmitCtx, x: number, y: number, r: number, color: number[], alpha = 1) {
  fillQuads(circleQuads(x, y, r, 32), rgba(color, alpha), ctx.inst, ctx.crv, ctx.rws);
}

function strokeCircle(ctx: EmitCtx, x: number, y: number, r: number, color: number[], width = 3, alpha = 1) {
  const pts: Pt[] = [];
  const samples = 40;
  for (let i = 0; i <= samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  line(ctx, pts, color, width, alpha);
}

function arrow(ctx: EmitCtx, x0: number, y0: number, x1: number, y1: number, color: number[], width = 4, alpha = 1) {
  line(ctx, [[x0, y0], [x1, y1]], color, width, alpha);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const l = width * 5.2;
  const w = width * 3.3;
  fillPoly(ctx, [
    [x1, y1],
    [x1 - Math.cos(a) * l + Math.sin(a) * w, y1 - Math.sin(a) * l - Math.cos(a) * w],
    [x1 - Math.cos(a) * l - Math.sin(a) * w, y1 - Math.sin(a) * l + Math.cos(a) * w],
  ], color, alpha);
}

function starPoints(cx: number, cy: number, R: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5;
    const r = i % 2 ? R * 0.42 : R;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function plotFrame(ctx: EmitCtx, x: number, y: number, w: number, h: number, alpha: number) {
  addRect(x, y, x + w, y + h, rgba([0.035, 0.039, 0.052, 1], alpha), ctx.crv, ctx.rws, ctx.inst);
  rectStroke(ctx, x, y, x + w, y + h, C.border, 1.5, alpha);
  line(ctx, [[x + 34, y + 18], [x + 34, y + h - 30], [x + w - 18, y + h - 30]], C.faint, 1.5, alpha * 0.55);
}

function panel(ctx: EmitCtx, x: number, y: number, w: number, h: number, title: string, sub: string, alpha: number, active: boolean) {
  text(ctx, title, x + 12, y + 35, active ? 32 : 29, C.text, alpha);
  text(ctx, sub, x + 14, y + 64, 15, C.dim, alpha * 0.95);
  line(ctx, [[x + 14, y + 84], [x + Math.min(w - 24, 560), y + 84]], active ? C.cyan : C.border, active ? 3 : 2, alpha * 0.8);
}

class ExplainerBoard {
  x0 = -260;
  y0 = -430;
  width = 3600;
  height = 2680;

  private coverageCx = sx(0) + 250;
  private coverageCy = sy(0) + 410;
  private coverageR = 168;
  private testX = sx(1) + 270;
  private testY = sy(1) + 385;
  private bandY = sy(2) + 382;
  private hover: Handle = null;
  private grabbed: Handle = null;
  private lastNow = -1;
  private manualSection = -1;
  playing = true;
  tourT = 0;

  private coverageEq = new MathTex('F = \\frac{1}{A}\\iint_B w\\,dA');
  private windingEq = new MathTex('w(p)=\\frac{1}{2\\pi}\\oint_{\\partial S} d\\theta');
  private rowEq = new MathTex('B_y \\to rows[y_0..y_1]');
  private frameEq = new MathTex('color = \\sum_i coverage_i');
  private angleKey = '';
  private anglePts: Pt[] = [];
  private coverageKey = '';
  private coverageCached = 0;

  private captions = [
    ['The edge problem', 'Point samples, fixed grids, and cached zooms all lose information at boundaries.'],
    ['Winding number', 'Inside and outside are decided by accumulated boundary angle, not by sampling guesses.'],
    ['Bands and pieces', 'Curves are split into row bands so each pixel only visits nearby boundary pieces.'],
    ['Glyphs are contours', 'Text uses the same fill rule and the same per-pixel integral as every vector shape.'],
    ['One draw call', 'Instances point at shared curve and row buffers; the shader gathers coverage for each pixel.'],
  ];

  get dragging() { return this.grabbed !== null; }

  replay(s: AppState) {
    this.playing = true;
    this.tourT = 0;
    this.lastNow = -1;
    this.manualSection = -1;
    enter3D(s);
    this.setCamera(s, this.poseForSection(s, 0));
  }

  jumpTo(s: AppState, i: number) {
    this.playing = false;
    this.tourT = this.totalTime();
    this.manualSection = clamp(i, 0, 4);
    const p = this.poseForSection(s, this.manualSection);
    if (!s.cam3d.active) enter3D(s);
    orbitSetPose(p.x, p.y, orbitDistForZoom(p.z, s.tCanvas.height), p.az, p.polar);
    updateOrbit(16);
  }

  resume(s: AppState) {
    this.playing = true;
    this.lastNow = -1;
    this.manualSection = -1;
    enter3D(s);
    this.setCamera(s, this.poseForSection(s, this.currentSection()));
  }

  stopTour(s: AppState) {
    this.playing = false;
  }

  update(now: number, s: AppState) {
    if (!this.playing) return;
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    this.tourT += dt;
    if (this.tourT >= this.totalTime()) {
      this.tourT = this.totalTime();
      this.playing = false;
      this.manualSection = -1;
      return;
    }
    const section = Math.min(4, Math.floor(this.tourT / TOUR_STEP));
    const local = this.tourT - section * TOUR_STEP;
    const next = Math.min(4, section + 1);
    const move = smooth((local - (TOUR_STEP - TOUR_TRAVEL)) / TOUR_TRAVEL);
    const a = this.poseForSection(s, section);
    const b = this.poseForSection(s, next);
    const drift = this.poseDrift(section, local);
    this.setCamera(s, {
      x: lerp(a.x, b.x, move) + drift.x,
      y: lerp(a.y, b.y, move) + drift.y,
      z: a.z * Math.pow(b.z / a.z, move) * drift.z,
      az: lerp(a.az, b.az, move) + drift.az,
      polar: lerp(a.polar, b.polar, move) + drift.polar,
    });
  }

  emit(font: any, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: BoardView) {
    const ctx: EmitCtx = { font, atlas, inst, crv, rws, view, now };
    this.drawBackdrop(ctx);
    const current = this.currentSection();
    for (let i = 0; i < 5; i++) {
      const a = this.sectionAlpha(i);
      if (a > 0.02 && this.sectionVisible(i, view, current)) this.drawSection(ctx, i, a, i === current);
    }
    this.drawCaption(ctx);
  }

  tryBeginDrag(wx: number, wy: number, scale: number): boolean {
    this.grabbed = this.pick(wx, wy, scale);
    return this.grabbed !== null;
  }

  dragTo(wx: number, wy: number) {
    if (this.grabbed === 'coverageCenter') {
      this.coverageCx = clamp(wx, sx(0) + 20, sx(0) + 395);
      this.coverageCy = clamp(wy, sy(0) + 185, sy(0) + 620);
    } else if (this.grabbed === 'coverageRadius') {
      this.coverageR = clamp(Math.hypot(wx - this.coverageCx, wy - this.coverageCy), 54, 245);
    } else if (this.grabbed === 'windingPoint') {
      this.testX = clamp(wx, sx(1) + 70, sx(1) + 445);
      this.testY = clamp(wy, sy(1) + 165, sy(1) + 600);
    } else if (this.grabbed === 'bandProbe') {
      this.bandY = clamp(wy, sy(2) + 210, sy(2) + 560);
    }
  }

  endDrag() { this.grabbed = null; }

  updateHover(wx: number, wy: number, scale: number): boolean {
    this.hover = this.pick(wx, wy, scale);
    return this.hover !== null;
  }

  autoDrive() {}

  caption() {
    const cap = this.captions[this.currentSection()];
    return { title: cap[0], sub: cap[1] };
  }

  private totalTime() { return TOUR_STEP * 5; }

  private poseForSection(s: AppState, i: number) {
    const z = Math.min(s.tCanvas.width / (SEC_W + 230), s.tCanvas.height / (SEC_H + 250)) * 0.92;
    const az = [-0.32, 0.22, -0.18, 0.30, -0.10][i] ?? 0;
    const polar = [0.50, 0.46, 0.56, 0.42, 0.48][i] ?? 0.48;
    return { x: sx(i) + SEC_W / 2, y: sy(i) + SEC_H / 2, z, az, polar };
  }

  private poseDrift(section: number, local: number) {
    const u = local / TOUR_STEP;
    if (section === 0) {
      const down = easeInOut((local - 3.2) / 2.2);
      return { x: 0, y: lerp(-120, 95, down), z: lerp(1.16, 1.0, down), az: Math.sin(local * 0.3) * 0.018, polar: 0.02 + down * 0.02 };
    }
    const amp = 14 + section * 2;
    return {
      x: Math.sin(local * 0.62 + section) * amp,
      y: Math.cos(local * 0.48 + section * 0.7) * amp * 0.45,
      z: 1 + Math.sin(local * 0.52) * 0.025,
      az: Math.sin(local * 0.34 + section) * 0.025,
      polar: Math.sin(u * Math.PI) * 0.035,
    };
  }

  private setCamera(s: AppState, p: { x: number; y: number; z: number; az?: number; polar?: number }) {
    if (this.playing) {
      if (!s.cam3d.active) enter3D(s);
      orbitSetPose(p.x, p.y, orbitDistForZoom(p.z, s.tCanvas.height), p.az ?? 0, p.polar ?? 0.48);
      updateOrbit(16);
    } else {
      s.camX = s.viewX = s.tgtX = p.x;
      s.camY = s.viewY = s.tgtY = p.y;
      s.camZ = s.viewZ = s.tgtZ = p.z;
    }
    s.velX = s.velY = 0;
  }

  private currentSection() {
    if (this.manualSection >= 0) return this.manualSection;
    return Math.min(4, Math.floor(Math.min(this.tourT, this.totalTime() - 0.001) / TOUR_STEP));
  }

  private sectionAlpha(i: number) {
    if (!this.playing && this.tourT >= this.totalTime()) return 1;
    if (this.manualSection >= 0) return 1;
    return smooth((this.tourT - i * TOUR_STEP + 0.45) / 1.6);
  }

  private sectionVisible(i: number, view: BoardView, current: number) {
    if (view.left < -1e11) {
      const p = orbitGetPose();
      const cx = sx(i) + SEC_W / 2, cy = sy(i) + SEC_H / 2;
      const dist = Math.hypot(cx - p.tx, cy - p.tz);
      const local = this.localT(current);
      const transitioning = local > TOUR_STEP - TOUR_TRAVEL - 0.2 || local < 0.25;
      return dist < 980 || (transitioning && Math.abs(i - current) <= 1);
    }
    const margin = 120 / Math.max(view.zoom, 0.05);
    const x0 = sx(i) - margin, x1 = sx(i) + SEC_W + margin;
    const y0 = sy(i) - margin, y1 = sy(i) + SEC_H + margin;
    return x0 <= view.right && x1 >= view.left && y0 <= view.bottom && y1 >= view.top;
  }

  private localT(i: number) { return clamp(this.tourT - i * TOUR_STEP, 0, TOUR_STEP); }

  private activeLocal(i: number) {
    return this.playing && this.currentSection() === i ? this.localT(i) : -1;
  }

  private drawBackdrop(ctx: EmitCtx) {
    const step = 120;
    const left = Math.floor(this.x0 / step) * step;
    const right = this.x0 + this.width;
    const top = Math.floor(this.y0 / step) * step;
    const bottom = this.y0 + this.height;
    for (let x = left; x <= right; x += step) {
      const major = x % (step * 4) === 0;
      const w = major ? 1.6 : 0.8;
      addRect(x - w / 2, top, x + w / 2, bottom, rgba(C.border, major ? 0.34 : 0.18), ctx.crv, ctx.rws, ctx.inst);
    }
    for (let y = top; y <= bottom; y += step) {
      const major = y % (step * 4) === 0;
      const w = major ? 1.6 : 0.8;
      addRect(left, y - w / 2, right, y + w / 2, rgba(C.border, major ? 0.34 : 0.18), ctx.crv, ctx.rws, ctx.inst);
    }
    text(ctx, 'windfoil analytic renderer', this.x0 + 80, this.y0 + 90, 44, C.text, 0.9);
    text(ctx, 'an infinite canvas of renderer facts: text methods, coverage, winding, bands, glyphs, frame assembly', this.x0 + 82, this.y0 + 126, 18, C.dim, 0.9);
  }

  private drawSection(ctx: EmitCtx, i: number, alpha: number, active: boolean) {
    if (i === 0) this.drawCoverage(ctx, sx(0), sy(0), alpha, active);
    else if (i === 1) this.drawWinding(ctx, sx(1), sy(1), alpha, active);
    else if (i === 2) this.drawBands(ctx, sx(2), sy(2), alpha, active);
    else if (i === 3) this.drawGlyphs(ctx, sx(3), sy(3), alpha, active);
    else this.drawPipeline(ctx, sx(4), sy(4), alpha, active);
  }

  private drawCoverage(ctx: EmitCtx, x: number, y: number, a: number, active: boolean) {
    panel(ctx, x, y, SEC_W, SEC_H, '1. How do we render text?', 'Bitmaps, SDFs, and tessellation all trade one failure mode for another', a, active);
    const tileY = y + 128;
    const methods = [
      ['bitmap atlas', 'fast', 'breaks under zoom', C.rose],
      ['SDF / MSDF', 'smooth edges', 'field error at corners', C.gold],
      ['triangulated glyph', 'real outline', 'sampled coverage', C.violet],
      ['analytic coverage', 'exact edge area', 'shader integrates', C.green],
    ] as const;
    for (let i = 0; i < methods.length; i++) {
      const tx = x + 72 + i * 198;
      const col = methods[i][3];
      addRect(tx, tileY, tx + 158, tileY + 106, rgba([0.030, 0.034, 0.046, 1], 0.72 * a), ctx.crv, ctx.rws, ctx.inst);
      rectStroke(ctx, tx, tileY, tx + 158, tileY + 106, i === 3 ? C.green : C.border, i === 3 ? 2.4 : 1.4, a);
      if (i === 0) {
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) addRect(tx + 18 + gx * 14, tileY + 17 + gy * 14, tx + 30 + gx * 14, tileY + 29 + gy * 14, rgba(gx + gy > 4 ? C.text : col, gx + gy > 4 ? 0.72 * a : 0.24 * a), ctx.crv, ctx.rws, ctx.inst);
      } else if (i === 1) {
        for (let k = 0; k < 4; k++) strokeCircle(ctx, tx + 72, tileY + 48, 12 + k * 10, col, 1.5, a * (0.16 + k * 0.06));
        line(ctx, [[tx + 34, tileY + 78], [tx + 116, tileY + 18]], col, 4, a);
      } else if (i === 2) {
        const pts: Pt[] = [[tx + 35, tileY + 82], [tx + 58, tileY + 22], [tx + 91, tileY + 62], [tx + 123, tileY + 21], [tx + 121, tileY + 84]];
        line(ctx, pts, col, 3.5, a);
        line(ctx, [[pts[0][0], pts[0][1]], [pts[2][0], pts[2][1]], [pts[4][0], pts[4][1]], [pts[0][0], pts[0][1]]], col, 1.3, a * 0.65);
      } else {
        line(ctx, [[tx + 24, tileY + 82], [tx + 47, tileY + 24], [tx + 76, tileY + 79], [tx + 113, tileY + 18], [tx + 134, tileY + 84]], col, 4, a);
        addRect(tx + 82, tileY + 48, tx + 112, tileY + 78, rgba(col, 0.24 * a), ctx.crv, ctx.rws, ctx.inst);
        rectStroke(ctx, tx + 82, tileY + 48, tx + 112, tileY + 78, col, 2, a);
      }
      text(ctx, methods[i][0], tx, tileY + 132, 15, C.text, a);
      text(ctx, methods[i][1], tx, tileY + 154, 12, C.green, a * 0.92);
      text(ctx, methods[i][2], tx, tileY + 173, 12, i === 3 ? C.cyan : C.rose, a * 0.92);
    }
    text(ctx, 'windfoil keeps the outline, but replaces edge guesses with an area integral per pixel', x + 95, y + 330, 17, C.green, a);
    const cmpX = x + 95, cmpY = y + 350, cmpW = 700, cmpH = 78;
    line(ctx, [[cmpX, cmpY + cmpH], [cmpX + cmpW, cmpY + cmpH]], C.border, 1.5, a * 0.65);
    text(ctx, 'zoom behaviour', cmpX, cmpY - 10, 13, C.dim, a);
    line(ctx, [[cmpX, cmpY + 58], [cmpX + 170, cmpY + 58], [cmpX + 210, cmpY + 28], [cmpX + 260, cmpY + 28]], C.rose, 2.4, a);
    line(ctx, [[cmpX + 280, cmpY + 50], [cmpX + 365, cmpY + 34], [cmpX + 450, cmpY + 46]], C.gold, 2.4, a);
    line(ctx, [[cmpX + 470, cmpY + 48], [cmpX + 555, cmpY + 32], [cmpX + 630, cmpY + 28], [cmpX + cmpW, cmpY + 28]], C.green, 2.8, a);
    text(ctx, 'bitmap stair-steps', cmpX + 6, cmpY + cmpH + 18, 12, C.rose, a);
    text(ctx, 'field rounds corners', cmpX + 286, cmpY + cmpH + 18, 12, C.gold, a);
    text(ctx, 'analytic stays stable', cmpX + 515, cmpY + cmpH + 18, 12, C.green, a);

    const px = x + 95, py = y + 455, ps = 205;
    const local = this.activeLocal(0);
    const integralA = local >= 0 ? smooth((local - 3.0) / 1.25) : 1;
    if (integralA <= 0.015) return;
    const n = 7;
    const scan = local >= 0 ? 0.5 + 0.5 * Math.sin(local * 1.25) : 0.62;
    const scanY = py + scan * ps;
    addRect(px, py, px + ps, py + ps, rgba([0.025, 0.030, 0.040, 1], a * integralA), ctx.crv, ctx.rws, ctx.inst);
    fillCircle(ctx, this.coverageCx, this.coverageCy, this.coverageR, C.blue, 0.13 * a * integralA);
    strokeCircle(ctx, this.coverageCx, this.coverageCy, this.coverageR + (local >= 0 ? Math.sin(local * 2.2) * 3 : 0), C.blue, 4, a * integralA);
    for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const x0 = px + k * ps / n, y0 = py + j * ps / n;
      const cx = x0 + ps / (2 * n), cy = y0 + ps / (2 * n);
      const inside = this.insideCoverage(cx, cy);
      addRect(x0 + 1.5, y0 + 1.5, x0 + ps / n - 1.5, y0 + ps / n - 1.5, rgba(inside ? C.blue : [0.10, 0.11, 0.14, 1], (inside ? 0.50 * a : 0.60 * a) * integralA), ctx.crv, ctx.rws, ctx.inst);
    }
    rectStroke(ctx, px, py, px + ps, py + ps, C.green, 4, a * integralA);
    line(ctx, [[px - 18, scanY], [px + ps + 18, scanY]], C.gold, 4, a * integralA * (local >= 0 ? 0.95 : 0.55));
    text(ctx, 'pixel footprint B', px, py - 18, 17, C.green, a * integralA);
    this.drawHandle(ctx, this.coverageCx, this.coverageCy, 'coverageCenter', a * integralA);
    this.drawHandle(ctx, this.coverageCx + this.coverageR, this.coverageCy, 'coverageRadius', a * integralA);

    const plotX = x + 455, plotY = y + 455, plotW = 342, plotH = 205;
    plotFrame(ctx, plotX, plotY, plotW, plotH, a * integralA);
    const pts: Pt[] = [];
    const plotSamples = 48;
    for (let i = 0; i <= plotSamples; i++) {
      const yy = py + (i / plotSamples) * ps;
      const c = this.coverageAtY(px, py, ps, yy);
      pts.push([plotX + 36 + c * (plotW - 64), plotY + 20 + (i / plotSamples) * (plotH - 54)]);
    }
    line(ctx, pts, C.cyan, 4, a * integralA);
    const fill: Pt[] = [[plotX + 36, plotY + plotH - 30], ...pts, [plotX + 36, pts[pts.length - 1][1]]];
    fillPoly(ctx, fill, C.cyan, 0.16 * a * integralA);
    text(ctx, 'coverage by scanline', plotX + 46, plotY + 32, 15, C.dim, a * integralA);
    const scanCoverage = this.coverageAtY(px, py, ps, scanY);
    fillCircle(ctx, plotX + 36 + scanCoverage * (plotW - 64), plotY + 20 + scan * (plotH - 54), 7, C.gold, a * integralA);
    const cov = this.coverageValue(px, py, ps);
    text(ctx, `F = ${cov.toFixed(3)}`, plotX + 44, plotY + plotH + 40, 28, C.text, a * integralA);
    this.coverageEq.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, { x: x + 455, y: y + 640, size: 54, color: rgba(C.text, a * integralA), reveal: a * integralA });
  }

  private drawWinding(ctx: EmitCtx, x: number, y: number, a: number, active: boolean) {
    panel(ctx, x, y, SEC_W, SEC_H, '2. Winding number', 'A boundary turns around points inside it exactly once', a, active);
    const cx = x + 245, cy = y + 390, r = 155;
    const local = this.activeLocal(1);
    const sweep = local >= 0 ? clamp01(local / (TOUR_STEP - 1.0)) : 1;
    const qa = sweep * Math.PI * 2;
    const qx = cx + Math.cos(qa) * r, qy = cy + Math.sin(qa) * r;
    fillCircle(ctx, cx, cy, r, C.violet, 0.08 * a);
    strokeCircle(ctx, cx, cy, r, C.violet, 5, a);
    arrow(ctx, cx + r * 0.15, cy - r * 0.99, cx + r * 0.52, cy - r * 0.86, C.violet, 4, a);
    line(ctx, [[this.testX, this.testY], [x + 430, this.testY]], C.gold, 3, a, [12, 10]);
    line(ctx, [[this.testX, this.testY], [qx, qy]], C.cyan, 2.4, a * 0.75);
    fillCircle(ctx, qx, qy, 8, C.cyan, a);
    fillCircle(ctx, this.testX, this.testY, 8, C.gold, a);
    this.drawHandle(ctx, this.testX, this.testY, 'windingPoint', a);
    const inside = Math.hypot(this.testX - cx, this.testY - cy) < r;
    text(ctx, inside ? 'inside: net turn = 1' : 'outside: net turn = 0', x + 82, y + 620, 24, inside ? C.green : C.rose, a);

    const plotX = x + 480, plotY = y + 205, plotW = 330, plotH = 300;
    plotFrame(ctx, plotX, plotY, plotW, plotH, a);
    const pts = this.anglePlot(cx, cy, r, this.testX, this.testY, plotX, plotY, plotW, plotH);
    const visiblePts = pts.slice(0, Math.max(2, Math.floor(pts.length * sweep)));
    line(ctx, visiblePts, inside ? C.green : C.rose, 4, a);
    text(ctx, 'accumulated angle', plotX + 48, plotY + 32, 15, C.dim, a);
    this.windingEq.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, { x: x + 480, y: y + 625, size: 43, color: rgba(C.text, a), reveal: a });
  }

  private drawBands(ctx: EmitCtx, x: number, y: number, a: number, active: boolean) {
    panel(ctx, x, y, SEC_W, SEC_H, '3. Bands and curve pieces', 'The shader searches only rows touched by the pixel footprint', a, active);
    const bx = x + 95, by = y + 180, bw = 345, bh = 390;
    const local = this.activeLocal(2);
    const probeY = local >= 0 ? by + (0.5 + 0.5 * Math.sin(local * 1.35)) * bh : this.bandY;
    addRect(bx, by, bx + bw, by + bh, rgba([0.030, 0.034, 0.046, 1], a), ctx.crv, ctx.rws, ctx.inst);
    const shape = starPoints(bx + 170, by + 205, 150, -Math.PI / 2 + 0.25);
    fillPoly(ctx, shape, C.gold, 0.10 * a);
    line(ctx, [...shape, shape[0]], C.gold, 4, a);
    const bands = 12, bandH = bh / bands;
    const activeBand = clamp(Math.floor((probeY - by) / bandH), 0, bands - 1);
    for (let i = 0; i < bands; i++) {
      const yy = by + i * bandH;
      if (i === activeBand) addRect(bx, yy, bx + bw, yy + bandH, rgba(C.cyan, 0.16 * a), ctx.crv, ctx.rws, ctx.inst);
      line(ctx, [[bx, yy], [bx + bw, yy]], i === activeBand ? C.cyan : C.border, i === activeBand ? 3 : 1.3, a * (i === activeBand ? 0.85 : 0.45));
    }
    rectStroke(ctx, bx, by, bx + bw, by + bh, C.border, 2, a);
    line(ctx, [[bx - 35, probeY], [bx + bw + 35, probeY]], C.cyan, 4, a);
    this.drawHandle(ctx, bx - 35, probeY, 'bandProbe', a);
    text(ctx, `active row ${activeBand}`, bx + 16, by + bh + 38, 22, C.cyan, a);

    const tx = x + 500, ty = y + 205;
    text(ctx, 'row table', tx, ty, 24, C.text, a);
    for (let i = 0; i < 8; i++) {
      const yy = ty + 34 + i * 42;
      const on = i === Math.min(7, Math.floor(activeBand * 8 / bands));
      addRect(tx, yy, tx + 295, yy + 30, rgba(on ? C.cyan : C.panel2, on ? 0.30 * a : 0.72 * a), ctx.crv, ctx.rws, ctx.inst);
      rectStroke(ctx, tx, yy, tx + 295, yy + 30, on ? C.cyan : C.border, 1.4, a);
      text(ctx, `row ${i}: start ${120 + i * 9}  count ${3 + (i % 4)}`, tx + 14, yy + 21, 15, on ? C.text : C.dim, a);
    }
    arrow(ctx, bx + bw + 10, probeY, tx - 18, ty + 34 + Math.min(7, Math.floor(activeBand * 8 / bands)) * 42 + 15, C.cyan, 3, a);
    this.rowEq.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, { x: tx, y: y + 645, size: 43, color: rgba(C.text, a), reveal: a });
  }

  private drawGlyphs(ctx: EmitCtx, x: number, y: number, a: number, active: boolean) {
    panel(ctx, x, y, SEC_W, SEC_H, '4. Glyphs are filled contours', 'Text becomes outline geometry; the pixel math is unchanged', a, active);
    const gx = x + 115, gy = y + 575;
    const local = this.activeLocal(3);
    const sweep = local >= 0 ? 0.5 + 0.5 * Math.sin(local * 1.4) : 0.48;
    layoutStr(ctx.inst, 'a', rgba(C.text, 0.16 * a), ctx.atlas.table, ctx.font, { x: gx, y: gy, size: 430 });
    layoutStr(ctx.inst, 'a', rgba(C.text, 0.85 * a), ctx.atlas.table, ctx.font, { x: gx + 385, y: gy - 80, size: 120 });
    const bandLeft = x + 100, bandRight = x + 405;
    for (let i = 0; i < 15; i++) {
      const yy = y + 190 + i * 28;
      line(ctx, [[bandLeft, yy], [bandRight, yy]], i % 3 === 0 ? C.cyan : C.border, i % 3 === 0 ? 2.2 : 1.1, a * (i % 3 === 0 ? 0.62 : 0.38));
    }
    addRect(x + 305, y + 332, x + 356, y + 383, rgba(C.green, 0.20 * a), ctx.crv, ctx.rws, ctx.inst);
    rectStroke(ctx, x + 305, y + 332, x + 356, y + 383, C.green, 3, a);
    line(ctx, [[bandLeft, y + 190 + sweep * 392], [bandRight, y + 190 + sweep * 392]], C.gold, 4, a * 0.9);
    arrow(ctx, x + 380, y + 356, x + 520, y + 356, C.green, 4, a);
    addRect(x + 535, y + 260, x + 805, y + 455, rgba([0.030, 0.034, 0.046, 1], a), ctx.crv, ctx.rws, ctx.inst);
    rectStroke(ctx, x + 535, y + 260, x + 805, y + 455, C.border, 2, a);
    text(ctx, 'deep zoom stays analytic', x + 560, y + 304, 21, C.text, a);
    text(ctx, 'the glyph is not a bitmap', x + 560, y + 336, 16, C.dim, a);
    text(ctx, 'the shader integrates the same', x + 560, y + 385, 16, C.dim, a);
    text(ctx, 'edge coverage per pixel', x + 560, y + 410, 16, C.dim, a);
    this.frameEq.emit(ctx.atlas, ctx.inst, ctx.crv, ctx.rws, { x: x + 140, y: y + 670, size: 42, color: rgba(C.text, a), reveal: a });
  }

  private drawPipeline(ctx: EmitCtx, x: number, y: number, a: number, active: boolean) {
    panel(ctx, x, y, SEC_W, SEC_H, '5. One analytic pass', 'Buffers describe contours; one shader evaluates coverage for the frame', a, active);
    const local = this.activeLocal(4);
    const activeStage = local >= 0 ? Math.min(4, Math.floor((local / TOUR_STEP) * 5)) : 3;
    const stages = [
      ['instances', 'bbox, color, rowBase'],
      ['rows', 'band start + count'],
      ['curves', 'monotone pieces'],
      ['shader', 'gather local rows'],
      ['framebuffer', 'resolved color'],
    ];
    const y0 = y + 255;
    for (let i = 0; i < stages.length; i++) {
      const bx = x + 55 + i * 165;
      const hot = i === activeStage;
      const pulse = hot && local >= 0 ? 0.75 + 0.25 * Math.sin(local * 5.0) : 1;
      addRect(bx, y0, bx + 132, y0 + 118, rgba(hot ? C.cyan : C.panel2, (hot ? 0.26 * pulse : 0.82) * a), ctx.crv, ctx.rws, ctx.inst);
      rectStroke(ctx, bx, y0, bx + 132, y0 + 118, hot ? C.cyan : C.border, hot ? 3 : 2.2, a);
      text(ctx, stages[i][0], bx + 15, y0 + 40, 20, C.text, a);
      text(ctx, stages[i][1], bx + 15, y0 + 72, 12.5, C.dim, a);
      if (i < stages.length - 1) arrow(ctx, bx + 138, y0 + 59, bx + 160, y0 + 59, i === activeStage ? C.cyan : C.faint, 3, a);
    }
    const tableX = x + 105, tableY = y + 450;
    text(ctx, 'instance buffer sample', tableX, tableY, 22, C.text, a);
    const cols = ['x', 'y', 'scale', 'rowBase', 'rgba'];
    for (let i = 0; i < cols.length; i++) {
      addRect(tableX + i * 128, tableY + 24, tableX + i * 128 + 118, tableY + 56, rgba(C.panel2, a), ctx.crv, ctx.rws, ctx.inst);
      text(ctx, cols[i], tableX + i * 128 + 12, tableY + 46, 14, C.dim, a);
    }
    for (let r = 0; r < 3; r++) for (let i = 0; i < cols.length; i++) {
      const xx = tableX + i * 128, yy = tableY + 64 + r * 34;
      addRect(xx, yy, xx + 118, yy + 28, rgba([0.035, 0.039, 0.052, 1], a), ctx.crv, ctx.rws, ctx.inst);
      const val = i === 0 ? `${240 + r * 18}` : i === 1 ? `${180 + r * 21}` : i === 2 ? '1.0' : i === 3 ? `${96 + r * 12}` : 'color';
      text(ctx, val, xx + 12, yy + 20, 13, C.text, a);
    }
    text(ctx, 'CPU work: build compact references. GPU work: evaluate exact coverage at each pixel.', x + 110, y + 675, 18, C.dim, a);
  }

  private drawCaption(ctx: EmitCtx) {
    if (!this.playing) return;
    if (ctx.view.left < -1e11) return;
    const idx = this.currentSection();
    const cap = this.captions[idx];
    const z = ctx.view.zoom;
    const cullMargin = 200 / z;
    const pad = 46 / z;
    const x = ctx.view.left + cullMargin + pad;
    const h = 96 / z;
    const y = ctx.view.bottom - cullMargin - pad - h;
    const exactW = ctx.view.right - ctx.view.left - cullMargin * 2;
    const w = Math.min(760 / z, exactW * 0.72);
    addRect(x, y, x + w, y + h, rgba([0.025, 0.028, 0.038, 1], 0.86), ctx.crv, ctx.rws, ctx.inst);
    rectStroke(ctx, x, y, x + w, y + h, C.border, 1.5 / z, 0.8);
    text(ctx, cap[0], x + 22 / z, y + 39 / z, 28 / z, C.text, 1);
    text(ctx, cap[1], x + 22 / z, y + 70 / z, 14 / z, C.dim, 1);
  }

  private drawHandle(ctx: EmitCtx, x: number, y: number, h: Exclude<Handle, null>, a: number) {
    const hot = this.hover === h || this.grabbed === h;
    fillCircle(ctx, x, y, hot ? 12 : 9, hot ? C.rose : C.green, a);
    strokeCircle(ctx, x, y, hot ? 18 : 14, hot ? C.rose : C.green, 2, a * 0.75);
  }

  private pick(wx: number, wy: number, scale: number): Handle {
    const r = Math.max(12, 18 / Math.max(scale, 0.05));
    const near = (x: number, y: number) => Math.hypot(wx - x, wy - y) <= r;
    if (near(this.coverageCx, this.coverageCy)) return 'coverageCenter';
    if (near(this.coverageCx + this.coverageR, this.coverageCy)) return 'coverageRadius';
    if (near(this.testX, this.testY)) return 'windingPoint';
    if (near(sx(2) + 60, this.bandY)) return 'bandProbe';
    return null;
  }

  private insideCoverage(x: number, y: number) {
    return Math.hypot(x - this.coverageCx, y - this.coverageCy) <= this.coverageR;
  }

  private coverageAtY(px: number, _py: number, ps: number, y: number) {
    const dy = y - this.coverageCy;
    const rr = this.coverageR * this.coverageR - dy * dy;
    if (rr <= 0) return 0;
    const dx = Math.sqrt(rr);
    const left = Math.max(px, this.coverageCx - dx);
    const right = Math.min(px + ps, this.coverageCx + dx);
    return Math.max(0, right - left) / ps;
  }

  private coverageValue(px: number, py: number, ps: number) {
    const key = `${px.toFixed(1)},${py.toFixed(1)},${ps.toFixed(1)},${this.coverageCx.toFixed(1)},${this.coverageCy.toFixed(1)},${this.coverageR.toFixed(1)}`;
    if (key === this.coverageKey) return this.coverageCached;
    const n = 24;
    let inside = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (this.insideCoverage(px + (i + 0.5) * ps / n, py + (j + 0.5) * ps / n)) inside++;
    }
    this.coverageKey = key;
    this.coverageCached = inside / (n * n);
    return this.coverageCached;
  }

  private anglePlot(cx: number, cy: number, r: number, px: number, py: number, x: number, y: number, w: number, h: number): Pt[] {
    const key = `${cx.toFixed(2)},${cy.toFixed(2)},${r.toFixed(2)},${px.toFixed(2)},${py.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`;
    if (key === this.angleKey) return this.anglePts;
    const pts: Pt[] = [];
    let prev = Math.atan2(cy - py, cx + r - px);
    let acc = 0;
    const samples = 56;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const a = t * Math.PI * 2;
      const qx = cx + Math.cos(a) * r, qy = cy + Math.sin(a) * r;
      const th = Math.atan2(qy - py, qx - px);
      let d = th - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (i > 0) acc += d;
      prev = th;
      const turns = acc / (Math.PI * 2);
      pts.push([x + 34 + t * (w - 58), y + h - 30 - clamp(turns, -0.25, 1.25) * (h - 62) / 1.5]);
    }
    this.angleKey = key;
    this.anglePts = pts;
    return this.anglePts;
  }
}

export function bootExplainer(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const board = new ExplainerBoard();
  s.interactive = board;
  board.replay(s);

  let playBtn: HTMLButtonElement | null = null;
  const chrome = document.createElement('div');
  chrome.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;overflow:hidden;font-family:"Inter","Segoe UI",system-ui,sans-serif';
  const barTop = document.createElement('div');
  const barBot = document.createElement('div');
  const barCSS = 'position:absolute;left:0;right:0;height:11vh;background:#07080c;transition:transform .8s cubic-bezier(.7,0,.2,1)';
  barTop.style.cssText = barCSS + ';top:0;transform:translateY(-100%)';
  barBot.style.cssText = barCSS + ';bottom:0;transform:translateY(100%)';
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;left:7%;bottom:2.2vh;max-width:min(980px,84vw);opacity:0;will-change:opacity,transform;transition:opacity .35s ease,transform .35s ease;transform:translateY(8px)';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'color:#f4f6fb;font-size:clamp(23px,2.5vw,42px);font-weight:650;letter-spacing:-.01em;line-height:1.0;text-shadow:0 2px 30px rgba(0,0,0,.65)';
  const subEl = document.createElement('div');
  subEl.style.cssText = 'color:#8ea2c8;font-size:clamp(10px,.95vw,13px);font-weight:650;letter-spacing:.24em;text-transform:uppercase;margin-top:8px;line-height:1.25;text-shadow:0 2px 20px rgba(0,0,0,.65)';
  cap.append(titleEl, subEl);
  chrome.append(barTop, barBot, cap);
  document.body.appendChild(chrome);

  const setChrome = (on: boolean) => {
    barTop.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
    barBot.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
    cap.style.opacity = on ? '1' : '0';
    cap.style.transform = on ? 'translateY(0)' : 'translateY(8px)';
  };
  const updateCaption = () => {
    const c = board.caption();
    if (titleEl.textContent !== c.title) titleEl.textContent = c.title;
    if (subEl.textContent !== c.sub) subEl.textContent = c.sub;
  };
  updateCaption();
  setChrome(true);

  const cancelTour = (e: Event) => {
    if (!s.demo?.running) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('button')) return;
    s.demo.stop();
  };
  const addCancelListeners = () => {
    addEventListener('pointerdown', cancelTour, true);
    addEventListener('wheel', cancelTour, { capture: true, passive: true });
    addEventListener('keydown', cancelTour, true);
  };
  const removeCancelListeners = () => {
    removeEventListener('pointerdown', cancelTour, true);
    removeEventListener('wheel', cancelTour, true);
    removeEventListener('keydown', cancelTour, true);
  };
  addCancelListeners();

  s.demo = {
    running: true,
    toggle() {
      this.running ? this.stop() : this.start();
    },
    start() {
      this.running = true;
      board.resume(s);
      updateCaption();
      setChrome(true);
      addCancelListeners();
      if (playBtn) playBtn.textContent = '⏸';
    },
    stop() {
      this.running = false;
      board.stopTour(s);
      setChrome(false);
      removeCancelListeners();
      if (playBtn) playBtn.textContent = '▶';
    },
    update(now: number) {
      if (!this.running) return;
      board.update(now, s);
      updateCaption();
      if (!board.playing) this.stop();
    },
  };

  const dispose = finishApp(s, onBack, [
    { icon: '⏸', title: 'Pause/resume guided explainer', onClick: () => s.demo?.toggle(), ref: (el) => { playBtn = el; } },
    { icon: '↺', title: 'Replay guided explainer', onClick: () => { board.replay(s); s.demo?.start(); } },
    { icon: '1', title: 'Jump to pixel integral', onClick: () => { board.jumpTo(s, 0); s.demo?.stop(); } },
    { icon: '2', title: 'Jump to winding number', onClick: () => { board.jumpTo(s, 1); s.demo?.stop(); } },
    { icon: '3', title: 'Jump to bands and pieces', onClick: () => { board.jumpTo(s, 2); s.demo?.stop(); } },
    { icon: '4', title: 'Jump to glyph contours', onClick: () => { board.jumpTo(s, 3); s.demo?.stop(); } },
    { icon: '5', title: 'Jump to frame assembly', onClick: () => { board.jumpTo(s, 4); s.demo?.stop(); } },
  ]);
  return () => {
    removeCancelListeners();
    s.demo?.stop();
    disableOrbit();
    s.cam3d.active = false;
    s.cam3d.exiting = false;
    chrome.remove();
    dispose();
  };
}