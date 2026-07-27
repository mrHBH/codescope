// ── Frame loop ──────────────────────────────────────────────────────────────
// Builds the instance buffer each frame: static backgrounds, dynamic
// (hover/animated) backgrounds, then all text including editable elements, and
// submits a single GPU draw call.

import type { AppState } from './state';
import type { StyledEl } from './layout/types';
import type { FontFace } from './windfoil/font';
import type { GlyphAtlas } from './windfoil/bands';
import { addRect } from './layout/metrics';
import { layoutFlow } from './layout/flow';
import { layoutEditable } from './layout/editable';
import { hitTest, HOVER_FX_MOVES_TEXT } from './layout/walk';
import { fillQuads, polygonQuads } from './windgraph/stroke/stroke';
import { stepCamera } from './camera/camera';
import { cameraViewProj, cameraScale, scrToDoc, uiScale } from './camera/camera';
import type { EditorTheme } from './editor/editor';
import type { TerminalTheme } from './editor/terminal';
import type { FileTreeTheme } from './editor/fileTree';
import { DEPTH_FORMAT } from './windfoil/mesh3d';
import { EmitCache } from './windfoil/emitCache';
import { ANALYTIC_MENU_THEME } from './ui/analyticMenu';
import { poseXform } from './camera/screenWorld';

const _hoveredSet = new Set<StyledEl>();
const _tmpColor: number[] = [0, 0, 0, 0];
const _fxAc: number[] = [0, 0, 0, 0];
const ZERO_COLOR: number[] = [0, 0, 0, 0];
const SHIMMER_COLOR: number[] = [1, 1, 1, 0.12];
const _boardView = { zoom: 1, left: 0, right: 0, top: 0, bottom: 0 };

// ── Named analytic button hover effects ──────────────────────────────────────
// A button tagged with a `hov-*` class (walkDOM → StyledEl.hoverFx) renders one of
// these instead of the legacy background-wash + shadow hover. `t` is the hover
// progress (el.curShadow, lerped 0→1 on hover, 1→0 off) so every effect eases in
// AND out. Geometry is rect-only (the renderer has no rounded corners). The button
// face is drawn inset by its border so the baked base border stays visible unless
// an effect paints its own accent edge over it.
function renderHoverFx(el: StyledEl, s: AppState, crv: number[], rws: number[], inst: number[], now: number, font: FontFace, atlas: GlyphAtlas, isAct: boolean) {
  const t = el.curShadow;
  // Physical effects (push/key/dent) translate the whole button, so they always
  // re-draw (their label is dynamic, not baked) — even at rest.
  const moves = HOVER_FX_MOVES_TEXT.has(el.hoverFx);
  if (!moves && t <= 0.004 && !_hoveredSet.has(el)) return;
  const x0 = el.x, y0 = el.y, x1 = el.x + el.w, y1 = el.y + el.h;
  const ac = s.themeCol.accent;
  const A = (a: number) => { _fxAc[0] = ac[0]; _fxAc[1] = ac[1]; _fxAc[2] = ac[2]; _fxAc[3] = a; return _fxAc; };
  const [bt, br, bb, bl] = el.borderW;
  // Physical vertical offset: hover lifts the button, press sinks it.
  const dy = el.hoverFx === 'push' ? (isAct ? 4 : -3 * t)
    : el.hoverFx === 'key' ? (isAct ? 3 : -2 * t)
    : el.hoverFx === 'dent' ? (isAct ? 2 : 0) : 0;
  const e = 2; // accent edge thickness (world units — scales with zoom like the doc)
  const face = (oy = 0) => { if (el.curBg[3] > 0.004) addRect(x0 + bl, y0 + bt + oy, x1 - br, y1 - bb + oy, el.curBg, crv, rws, inst); };
  // Re-lay-out the label at the button's current offset (physical effects only).
  const label = () => { if (moves) layoutFlow(el, font, atlas, inst, now, 0, dy); };
  const border4 = (a: number, oy = 0) => {
    addRect(x0, y0 + oy, x1, y0 + oy + e, A(a), crv, rws, inst);
    addRect(x0, y1 - e + oy, x1, y1 + oy, A(a), crv, rws, inst);
    addRect(x0, y0 + oy, x0 + e, y1 + oy, A(a), crv, rws, inst);
    addRect(x1 - e, y0 + oy, x1, y1 + oy, A(a), crv, rws, inst);
  };

  switch (el.hoverFx) {
    case 'lift': {
      // Accent-tinted glow shadow lifts the button, then an accent border fades in.
      const g = 16 * t;
      A(0.45 * t);
      addRect(x0 - g, y0 - g, x1 + g, y1 + g, _fxAc, crv, rws, inst);
      face();
      border4(0.9 * t);
      break;
    }
    case 'sweep': {
      // A translucent accent fill sweeps in from the left with a bright leading edge.
      face();
      const w = (x1 - x0) * t;
      addRect(x0, y0, x0 + w, y1, A(0.26 * t), crv, rws, inst);
      addRect(x0 + w - e, y0, x0 + w, y1, A(0.85 * t), crv, rws, inst);
      break;
    }
    case 'underline': {
      // An accent bar grows from the left along the bottom edge.
      face();
      const w = (x1 - x0) * t;
      addRect(x0, y1 - 3, x0 + w, y1, A(0.95 * t), crv, rws, inst);
      break;
    }
    case 'glow': {
      // A pulsing accent halo breathes around the button.
      const pulse = 0.55 + 0.45 * Math.sin(now / 360);
      const g = (10 + 10 * pulse) * t;
      A(0.28 * t * pulse);
      addRect(x0 - g, y0 - g, x1 + g, y1 + g, _fxAc, crv, rws, inst);
      const g2 = g * 0.5;
      addRect(x0 - g2, y0 - g2, x1 + g2, y1 + g2, _fxAc, crv, rws, inst);
      face();
      break;
    }
    case 'border': {
      // A crisp accent border fades in; the face barely changes.
      face();
      border4(0.95 * t);
      break;
    }
    case 'topbar': {
      // An accent indicator bar slides in from the left along the top edge.
      face();
      const w = (x1 - x0) * t;
      addRect(x0, y0, x0 + w, y0 + 3, A(0.95 * t), crv, rws, inst);
      break;
    }
    case 'ring': {
      // An offset accent outline ring appears around the button (halo with a gap).
      const o = 5;
      addRect(x0 - o, y0 - o, x1 + o, y0 - o + e, A(0.9 * t), crv, rws, inst);
      addRect(x0 - o, y1 + o - e, x1 + o, y1 + o, A(0.9 * t), crv, rws, inst);
      addRect(x0 - o, y0 - o, x0 - o + e, y1 + o, A(0.9 * t), crv, rws, inst);
      addRect(x1 + o - e, y0 - o, x1 + o, y1 + o, A(0.9 * t), crv, rws, inst);
      face();
      break;
    }
    case 'corners': {
      // Accent corner brackets (a targeting reticle) fade in over a slight brighten.
      face();
      const L = Math.min(el.w, el.h) * 0.30;
      addRect(x0, y0, x0 + L, y0 + e, A(0.95 * t), crv, rws, inst);
      addRect(x0, y0, x0 + e, y0 + L, A(0.95 * t), crv, rws, inst);
      addRect(x1 - L, y0, x1, y0 + e, A(0.95 * t), crv, rws, inst);
      addRect(x1 - e, y0, x1, y0 + L, A(0.95 * t), crv, rws, inst);
      addRect(x0, y1 - e, x0 + L, y1, A(0.95 * t), crv, rws, inst);
      addRect(x0, y1 - L, x0 + e, y1, A(0.95 * t), crv, rws, inst);
      addRect(x1 - L, y1 - e, x1, y1, A(0.95 * t), crv, rws, inst);
      addRect(x1 - e, y1 - L, x1, y1, A(0.95 * t), crv, rws, inst);
      break;
    }
    case 'push': {
      // Physical: lifts on hover (soft shadow + accent thickness edge below), sinks on press.
      if (!isAct && t > 0.01) {
        A(0.20 * t);
        addRect(x0 - 3 * t, y1 - 2, x1 + 3 * t, y1 + 9 * t, _fxAc, crv, rws, inst);
        _fxAc[0] = ac[0] * 0.45; _fxAc[1] = ac[1] * 0.45; _fxAc[2] = ac[2] * 0.45; _fxAc[3] = 0.95 * t;
        addRect(x0, y1 + dy, x1, y1, _fxAc, crv, rws, inst); // thickness edge
      }
      if (isAct) { _tmpColor[0] = 0; _tmpColor[1] = 0; _tmpColor[2] = 0; _tmpColor[3] = 0.25; addRect(x0, y0 + dy, x1, y0 + dy + 4, _tmpColor, crv, rws, inst); }
      face(dy);
      border4(0.85 * t + (isAct ? 0.1 : 0), dy);
      label();
      break;
    }
    case 'key': {
      // Chunky keycap: a constant thickness edge; hover lifts + accents it, press sinks flush.
      const edgeH = isAct ? 1 : 4 + 2 * t;
      const m = 0.35 + 0.65 * t;
      _fxAc[0] = ac[0] * m; _fxAc[1] = ac[1] * m; _fxAc[2] = ac[2] * m; _fxAc[3] = 0.55 + 0.4 * t;
      addRect(x0, y1 + dy, x1, y1 + dy + edgeH, _fxAc, crv, rws, inst);
      face(dy);
      addRect(x0, y0 + dy, x1, y0 + dy + 1, A(0.5 * t), crv, rws, inst);
      label();
      break;
    }
    case 'dent': {
      // Pressable well: an inner top shadow deepens on hover, the button sinks on press.
      face(dy);
      const h = isAct ? 5 : 3 * t;
      _tmpColor[0] = 0; _tmpColor[1] = 0; _tmpColor[2] = 0; _tmpColor[3] = isAct ? 0.32 : 0.22 * t;
      addRect(x0, y0 + dy, x1, y0 + dy + h, _tmpColor, crv, rws, inst);
      addRect(x0, y1 - e + dy, x1, y1 + dy, A(0.4 * t), crv, rws, inst);
      label();
      break;
    }
    case 'tilt': {
      // Rotated accent plates fan out behind the button — a 3D card-tilt illusion.
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const hw = el.w / 2 + 3, hh = el.h / 2 + 3;
      const plate = (ang: number, a: number) => {
        const c = Math.cos(ang), sn = Math.sin(ang);
        const r = (px: number, py: number): [number, number] => [cx + px * c - py * sn, cy + px * sn + py * c];
        fillQuads(polygonQuads([r(-hw, -hh), r(hw, -hh), r(hw, hh), r(-hw, hh)], true), A(a), inst, crv, rws);
      };
      plate(-0.13 * t, 0.30 * t);
      plate(0.08 * t, 0.16 * t);
      face();
      break;
    }
    case 'spotlight': {
      // A soft vertical highlight tracks the pointer across the button.
      face();
      const bx = Math.max(x0 + 14, Math.min(x1 - 14, s.mwx));
      addRect(bx - 16, y0, bx + 16, y1, A(0.07 * t), crv, rws, inst);
      addRect(bx - 7, y0, bx + 7, y1, A(0.11 * t), crv, rws, inst);
      addRect(bx - 1.5, y0, bx + 1.5, y1, A(0.17 * t), crv, rws, inst);
      break;
    }
    case 'stack': {
      // Offset accent layers slide out behind the button like a fanned card stack.
      addRect(x0 + 5 * t, y0 + 5 * t, x1 + 5 * t, y1 + 5 * t, A(0.20 * t), crv, rws, inst);
      addRect(x0 + 10 * t, y0 + 10 * t, x1 + 10 * t, y1 + 10 * t, A(0.11 * t), crv, rws, inst);
      face();
      break;
    }
    case 'scan': {
      // A bright scan line sweeps top → bottom on loop.
      face();
      const p = (now / 950) % 1;
      const sy = y0 + p * (y1 - y0);
      addRect(x0, sy - 6, x1, sy + 6, A(0.09 * t), crv, rws, inst);
      addRect(x0, sy - 1.5, x1, sy + 1.5, A(0.7 * t), crv, rws, inst);
      break;
    }
    case 'blink': {
      // An accent border pulses in opacity.
      face();
      const pulse = 0.5 + 0.5 * Math.sin(now / 200);
      border4((0.25 + 0.7 * pulse) * t);
      break;
    }
    case 'grow': {
      // The face expands outward around its (static, centered) label + accent border.
      const g = 3 * t;
      if (el.curBg[3] > 0.004) addRect(x0 - g, y0 - g, x1 + g, y1 + g, el.curBg, crv, rws, inst);
      addRect(x0 - g, y0 - g, x1 + g, y0 - g + e, A(0.9 * t), crv, rws, inst);
      addRect(x0 - g, y1 + g - e, x1 + g, y1 + g, A(0.9 * t), crv, rws, inst);
      addRect(x0 - g, y0 - g, x0 - g + e, y1 + g, A(0.9 * t), crv, rws, inst);
      addRect(x1 + g - e, y0 - g, x1 + g, y1 + g, A(0.9 * t), crv, rws, inst);
      break;
    }
    case 'split': {
      // A center seam splits into two accent lines that slide apart.
      face();
      const cy = (y0 + y1) / 2;
      const gap = 5 * t;
      addRect(x0, cy - gap - 1.5, x1, cy - gap + 1.5, A(0.85 * t), crv, rws, inst);
      addRect(x0, cy + gap - 1.5, x1, cy + gap + 1.5, A(0.85 * t), crv, rws, inst);
      break;
    }
    default:
      face(dy);
      label();
  }
}

// ── Named analytic click effects ─────────────────────────────────────────────
// A button tagged with a `clk-*` class plays a short press-triggered animation
// timed off el.pressT (set on pointerdown). Independent of any hover effect.
function renderClickFx(el: StyledEl, s: AppState, crv: number[], rws: number[], inst: number[], now: number) {
  const age = now - el.pressT;
  const x0 = el.x, y0 = el.y, x1 = el.x + el.w, y1 = el.y + el.h;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const ac = s.themeCol.accent;
  const A = (a: number) => { _fxAc[0] = ac[0]; _fxAc[1] = ac[1]; _fxAc[2] = ac[2]; _fxAc[3] = a; return _fxAc; };
  switch (el.clickFx) {
    case 'ripple': {
      const p = age / 520;
      if (p >= 1) return;
      const r = p * Math.max(el.w, el.h) * 0.85;
      const a = (1 - p) * 0.55;
      const hw = el.w / 2 + r, hh = el.h / 2 + r, th = 2.5;
      addRect(cx - hw, cy - hh, cx + hw, cy - hh + th, A(a), crv, rws, inst);
      addRect(cx - hw, cy + hh - th, cx + hw, cy + hh, A(a), crv, rws, inst);
      addRect(cx - hw, cy - hh, cx - hw + th, cy + hh, A(a), crv, rws, inst);
      addRect(cx + hw - th, cy - hh, cx + hw, cy + hh, A(a), crv, rws, inst);
      break;
    }
    case 'burst': {
      const p = age / 560;
      if (p >= 1) return;
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4 + 0.35;
        const d = 6 + p * 46;
        const px = cx + Math.cos(ang) * d, py = cy + Math.sin(ang) * d;
        const sz = 1 + 3 * (1 - p);
        addRect(px - sz, py - sz, px + sz, py + sz, A((1 - p) * 0.85), crv, rws, inst);
      }
      break;
    }
    case 'flash': {
      const p = age / 340;
      if (p >= 1) return;
      addRect(x0, y0, x1, y1, A((1 - p) * 0.45), crv, rws, inst);
      break;
    }
  }
}

// Shared depth texture for the 3D mesh pass, recreated when the canvas resizes.
let _depthTex: GPUTexture | null = null;
let _depthView: GPUTextureView | null = null;
let _depthW = 0, _depthH = 0;
function ensureDepthView(device: GPUDevice, w: number, h: number): GPUTextureView {
  if (!_depthTex || _depthW !== w || _depthH !== h) {
    _depthTex?.destroy();
    _depthTex = device.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    _depthView = _depthTex.createView();
    _depthW = w; _depthH = h;
  }
  return _depthView!;
}

// Conservative clip-space frustum test for a doc-plane rect (z = 0). Returns
// false only when the whole rect is provably outside a single frustum plane — so
// in the 3D free camera we skip emitting boards/pages that aren't on screen
// (otherwise EVERY board + page emits every frame, tanking FPS in 3D).
function rect3DVisible(vp: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number): boolean {
  let left = 0, right = 0, top = 0, bot = 0, behind = 0;
  let cx = vp[0] * x0 + vp[4] * y0 + vp[12];
  let cy = vp[1] * x0 + vp[5] * y0 + vp[13];
  let cw = vp[3] * x0 + vp[7] * y0 + vp[15];
  if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; if (cw <= 1e-6) behind++;
  cx = vp[0] * x1 + vp[4] * y0 + vp[12];
  cy = vp[1] * x1 + vp[5] * y0 + vp[13];
  cw = vp[3] * x1 + vp[7] * y0 + vp[15];
  if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; if (cw <= 1e-6) behind++;
  cx = vp[0] * x1 + vp[4] * y1 + vp[12];
  cy = vp[1] * x1 + vp[5] * y1 + vp[13];
  cw = vp[3] * x1 + vp[7] * y1 + vp[15];
  if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; if (cw <= 1e-6) behind++;
  cx = vp[0] * x0 + vp[4] * y1 + vp[12];
  cy = vp[1] * x0 + vp[5] * y1 + vp[13];
  cw = vp[3] * x0 + vp[7] * y1 + vp[15];
  if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; if (cw <= 1e-6) behind++;
  return !(left === 4 || right === 4 || top === 4 || bot === 4 || behind === 4);
}

const TERMINAL_THEME: TerminalTheme = {
  bg: [0.086, 0.086, 0.098, 1],
  barBg: [0.13, 0.13, 0.15, 1],
  barFg: [0.7, 0.72, 0.78, 1],
  text: [0.83, 0.85, 0.90, 1],
  dim: [0.45, 0.48, 0.55, 1],
  prompt: [0.83, 0.85, 0.90, 1],
  green: [0.42, 0.80, 0.44, 1],
  cyan: [0.35, 0.82, 0.94, 1],
  yellow: [0.95, 0.76, 0.35, 1],
  red: [0.88, 0.40, 0.38, 1],
  magenta: [0.72, 0.48, 0.96, 1],
  caret: [0.62, 0.82, 0.55, 1],
};

const FILE_TREE_THEME: FileTreeTheme = {
  bg: [0.086, 0.086, 0.098, 1],
  barBg: [0.13, 0.13, 0.15, 1],
  barFg: [0.7, 0.72, 0.78, 1],
  text: [0.83, 0.85, 0.90, 1],
  dim: [0.56, 0.58, 0.64, 1],
  gold: [0.86, 0.71, 0.48, 1],
  folder: [0.83, 0.85, 0.90, 1],
  line: [0.48, 0.40, 0.27, 1],
  accent: [0.86, 0.71, 0.48, 1],
  selected: [0.10, 0.34, 0.52, 0.42],
  hover: [1, 1, 1, 0.05],
};

let _editorThemeCache: EditorTheme | null = null;
let _editorThemeDark: boolean | null = null;
let _editorThemeSel: number[] | null = null;
function editorTheme(s: AppState): EditorTheme {
  const c = s.themeCol;
  const dark = s.isDark;
  if (_editorThemeCache && _editorThemeDark === dark && _editorThemeSel === c.sel) return _editorThemeCache;
  _editorThemeDark = dark;
  _editorThemeSel = c.sel;
  _editorThemeCache = {
    bg: dark ? [0.06, 0.07, 0.10, 1] : [0.96, 0.97, 0.99, 1],
    gutterBg: dark ? [0.04, 0.05, 0.08, 1] : [0.92, 0.94, 0.97, 1],
    gutterFg: dark ? [0.42, 0.45, 0.58, 1] : [0.38, 0.42, 0.50, 1],
    curLineFg: dark ? [0.85, 0.88, 0.96, 1] : [0.18, 0.22, 0.30, 1],
    curLineBg: dark ? [1, 1, 1, 0.04] : [0.03, 0.16, 0.36, 0.08],
    text: dark ? [0.804, 0.839, 0.957, 1] : [0.14, 0.18, 0.26, 1],
    caret: dark ? [0.95, 0.96, 1, 1] : [0.10, 0.14, 0.22, 1],
    sel: [c.sel[0], c.sel[1], c.sel[2], 0.4],
  };
  return _editorThemeCache;
}

export function runFrame(s: AppState): () => void {
  let alive = true;
  let prevTs = 0, fpsDt = 16, lastFpsShown = 0, lastCursor = '';
  // Emit caches for STATIC world-space boards (see windfoil/emitCache.ts):
  // their geometry only changes with zoom/clip (windgraph LOD), mode (bench) or
  // a new benchmark run (results) — not per frame. Animated boards (morph,
  // interactive, math) are excluded and keep re-emitting.
  const windgraphCache = new EmitCache();
  const benchCache = new EmitCache();
  const resultsCache = new EmitCache();
  // Perf instrumentation (temporary): JS time spent inside frame(), worst frame
  // gap over the HUD window, and pointer-event rate — lets us tell a main-thread
  // (JS/style) stall apart from a compositor/GPU stall while moving the mouse.
  // Pointer-move counting now happens in the single consolidated handler
  // (input.ts, writing s.evCount) rather than a separate window listener here —
  // one fewer listener dispatched per event.
  let jsMs = 0, worstDt = 0, evAccum = 0, evPerS = 0, lastEvT = performance.now();

  function frame(now: number) {
    if (!alive) return; // demo torn down → stop the loop
    requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = prevTs ? now - prevTs : 16; prevTs = now;
    fpsDt = fpsDt * .9 + dt * .1;
    if (dt > worstDt) worstDt = dt;
    // Snapshot + reset this frame's pointer-move counters (written by the single
    // consolidated handler in input.ts). Per-frame reset is exactly right: every
    // move dispatched since the last frame is attributed to this frame, so the
    // benchmark can correlate a frame gap with the input burst that caused it.
    const evThisFrame = s.evCount, evCoalThisFrame = s.evCoalesced, evMsThisFrame = s.evHandlerMs;
    s.evCount = 0; s.evCoalesced = 0; s.evHandlerMs = 0;
    evAccum += evThisFrame;
    // Throttle the FPS-overlay DOM write to ~8Hz. A textContent write every frame
    // dirties layout, and a pointer event that lands between frames then forces a
    // synchronous layout flush — extra main-thread cost exactly while moving.
    if (now - lastFpsShown > 120) {
      lastFpsShown = now;
      const z = s.viewZ;
      const zoomStr = z < 1 ? z.toFixed(2) : z < 100 ? z.toFixed(1) : z < 1e4 ? `${(z / 1e3).toFixed(1)}K` : z < 1e7 ? `${(z / 1e6).toFixed(1)}M` : `${(z / 1e9).toFixed(1)}G`;
      const evDt = (t0 - lastEvT) / 1000; lastEvT = t0;
      evPerS = evDt > 0 ? Math.round(evAccum / evDt) : 0; evAccum = 0;
      const perfTag = s.perf && s.perf.running ? `  ·  ${s.perf.status()}` : '';
      s.fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps  ·  ${zoomStr}×  ·  js ${jsMs.toFixed(1)}ms  ·  worst ${worstDt.toFixed(0)}ms  ·  ev ${evPerS}/s${perfTag}`;
      // Mirror the readout for the DOM-free cinematic HUD (drawn analytically).
      s.hudDebugText = s.fpsEl.textContent ?? '';
      // Analytic fps chip: short + full + demo diagnostics (3rd click mode).
      s.fpsChip?.update(`${Math.round(1000 / fpsDt)} fps`, s.hudDebugText, s.hudDebugExtra);
      worstDt = 0;
    }

    s.fpsChip?.tick(now); // long-press detection + transient status expiry

    if (s.demo && s.demo.running) s.demo.update(now);
    else if (s.perf && s.perf.running) s.perf.update(now);
    else stepCamera(s, dt, now);

    // Per-segment JS profiling — only while the benchmark runs (performance.now()
    // per segment is not free). Marks accumulate ms since the previous mark.
    const prof: Record<string, number> | null = s.perf && s.perf.running ? Object.create(null) : null;
    let profT = prof ? performance.now() : 0;
    const mark = (name: string) => {
      if (!prof) return;
      const t = performance.now();
      prof[name] = (prof[name] || 0) + (t - profT);
      profT = t;
    };

    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    s.mwx = (s.mx - Cw / 2) / s.viewZ + s.viewX;
    s.mwy = (s.my - Ch / 2) / s.viewZ + s.viewY;
    // In 3D the world-mouse comes from ray-casting the pointer onto the ground.
    if (s.cam3d.active) { const d = scrToDoc(s, s.mx, s.my); s.mwx = d.x; s.mwy = d.y; }

    // This frame's view-projection (used for 3D frustum culling below + the draw).
    const viewProj = cameraViewProj(s, Cw, Ch);

    // Viewport bounds in world space (+margin) → which pages are on screen. Off-screen
    // pages contribute no instances, so we skip their (large) static text/bg buffers.
    const marginX = 200 / s.viewZ, marginY = 200 / s.viewZ;
    const vL = (0 - Cw / 2) / s.viewZ + s.viewX - marginX;
    const vR = (Cw - Cw / 2) / s.viewZ + s.viewX + marginX;
    const vT = (0 - Ch / 2) / s.viewZ + s.viewY - marginY;
    const vB = (Ch - Ch / 2) / s.viewZ + s.viewY + marginY;
    const visible = s.pageVisible;
    for (let p = 0; p < s.pageRoots.length; p++) {
      const pg = s.pageRoots[p];
      visible[p] = s.cam3d.active
        ? rect3DVisible(viewProj, pg.x, pg.y, pg.x + pg.w, pg.y + pg.h)
        : (pg.x <= vR && pg.x + pg.w >= vL && pg.y <= vB && pg.y + pg.h >= vT);
    }

    // Visibility test for a world-space board/panel rect (3D frustum cull in the
    // free camera, 2D viewport-overlap otherwise) so off-screen boards never emit.
    const boardVis = (x0: number, y0: number, x1: number, y1: number): boolean =>
      s.cam3d.active ? rect3DVisible(viewProj, x0, y0, x1, y1) : (x0 <= vR && x1 >= vL && y0 <= vB && y1 >= vT);

    // Skip expensive hit-test + resolveStyle during wheel zoom (200ms cooldown),
    // or entirely when pointer input is toggled off.
    const wheelCool = (performance.now() - s.lastWheelT) < 200;
    mark('setup');
    const hovered = (wheelCool || !s.pointerInput) ? null : hitTest(s.docRoot, s.mwx, s.mwy);
    _hoveredSet.clear();
    if (hovered) { let cur: StyledEl | null = hovered; while (cur) { _hoveredSet.add(cur); cur = cur.parent; } }

    // File tree hover detection (world-space panel, not in DOM)
    if (s.fileTree && !wheelCool && s.pointerInput) {
      const ft = s.fileTree;
      if (s.mwx >= ft.x0 && s.mwx <= ft.x0 + ft.width && s.mwy >= ft.y0 && s.mwy <= ft.y0 + ft.contentHeight) {
        const row = ft.rowAtY(s.mwy);
        ft.hovered = row ? row.node.path : null;
      } else {
        ft.hovered = null;
      }
    }
    mark('hover');

    // Build working arrays: pre-concatenated base atlas + precomputed static data
    const crv: number[] = s.baseCrv as number[];
    crv.length = s.staticCrvLen;
    for (let i = s.baseCrvLen; i < s.staticCrvLen; i++) crv[i] = s.staticCrv[i];
    const rws: number[] = s.baseRws as number[];
    rws.length = s.staticRwsLen;
    for (let i = s.baseRwsLen; i < s.staticRwsLen; i++) rws[i] = s.staticRws[i];
    s.instJS.length = 0;
    const inst: number[] = s.instJS;
    // Layer 1: static backgrounds (visible pages only)
    for (let p = 0; p < s.bgByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.bgByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }
    mark('staticCopy');

    const k = 1 - Math.pow(0.0015, dt / 1000);
    // Analytic toolbar (screen-space chrome): lay it out at the top-right and
    // hover-test it in backing-store px so buttons highlight + the cursor resolves
    // regardless of the world camera or the pointer-input kill-switch. Sizes track
    // uiScale (backing px per CSS px) so the buttons keep their apparent size when
    // the render-resolution dial resizes the swapchain.
    if (s.toolbar) {
      const ui = uiScale(s);
      s.toolbar.setScreen(Cw, Ch, 8 * ui, 5 * ui, 26 * ui);
      s.toolbar.updateHover(s.mx, s.my);
    }
    if (s.panel?.open && !s.panel.isDragging) s.panel.updateHover(s.mx, s.my);
    let cursor = 'default';
    // Layer 2: dynamic backgrounds (hover, bounce, heartbeat, progress, pulse) — BEFORE text.
    // Only elements flagged `dynamic` in walkDOM reach this loop; static text/boxes
    // are already baked into the precomputed buffers.
    for (const el of s.dynamicEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      const isHov = _hoveredSet.has(el), isAct = el === s.pressed;
      if (isHov || isAct) {
        // Hover/active background is precomputed in buildStatic (no per-frame CSS
        // selector matching — that was the mouse-move FPS killer).
        const hovBg = isHov ? el.hoverBg : el.activeBg;
        if (hovBg) for (let i = 0; i < 4; i++) el.curBg[i] += (hovBg[i] - el.curBg[i]) * k;
        if (isHov && el.hoverable) cursor = 'pointer';
      } else {
        for (let i = 0; i < 4; i++) el.curBg[i] += (el.bg[i] - el.curBg[i]) * k;
      }

      const tgtShadow = el.shadowable && isHov ? 1 : 0;
      el.curShadow += (tgtShadow - el.curShadow) * k;

      const anim = el.anim;
      if (anim === 'bounce') {
        const dy = Math.sin(now / 520) * 8;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
      } else if (anim === 'heartbeat') {
        const sc = 1 + Math.sin(now / 380) * 0.065;
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
      } else if (anim === 'glow') {
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600));
        const g = 18 * pulse;
        _tmpColor[0] = el.curBg[0]; _tmpColor[1] = el.curBg[1]; _tmpColor[2] = el.curBg[2]; _tmpColor[3] = 0.35 * pulse;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, _tmpColor, crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
      } else if (anim === 'float') {
        const dy = Math.sin(now / 900) * 12;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
      } else if (anim === 'spin') {
        const sc = 0.85 + 0.15 * Math.sin(now / 450);
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
      } else if (anim === 'shimmer') {
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : ZERO_COLOR, crv, rws, inst);
        const shimX = el.x + ((now * 0.12) % (el.w + 60)) - 30;
        addRect(shimX, el.y, shimX + 30, el.y + el.h, SHIMMER_COLOR, crv, rws, inst);
      }
      if (el.hoverFx) {
        // Named analytic hover effect (replaces the legacy wash + shadow).
        renderHoverFx(el, s, crv, rws, inst, now, s.font, s.atlas, isAct);
      } else if ((isHov || isAct) && el.curShadow > 0.01) {
        const g = 14 * el.curShadow;
        const sh = s.themeCol.shadow;
        _tmpColor[0] = sh[0]; _tmpColor[1] = sh[1]; _tmpColor[2] = sh[2]; _tmpColor[3] = sh[3] * el.curShadow;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, _tmpColor, crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, crv, rws, inst);
      } else if (anim === '' && (isHov || isAct)) {
        const [bt, br, bb, bl] = el.borderW;
        addRect(el.x + bl, el.y + bt, el.x + el.w - br, el.y + el.h - bb, el.curBg, crv, rws, inst);
      }

      // Click effect (clk-*): a short press-triggered animation, independent of hover.
      if (el.clickFx && el.pressT > 0) renderClickFx(el, s, crv, rws, inst, now);

      if (anim === 'progress') {
        const frac = ((now % 3200) / 3200);
        const fw = (el.w - el.pad[3] - el.pad[1]) * frac;
        addRect(el.x + el.pad[3], el.y + el.h / 2 - 5, el.x + el.pad[3] + fw, el.y + el.h / 2 + 5, s.themeCol.prog, crv, rws, inst);
      } else if (anim === 'pulse') {
        const a = 0.45 + 0.55 * Math.sin(now / 280);
        const pl = s.themeCol.pulse;
        _tmpColor[0] = pl[0]; _tmpColor[1] = pl[1]; _tmpColor[2] = pl[2]; _tmpColor[3] = a;
        addRect(el.x + 2, el.y + el.h / 2 - 7, el.x + 16, el.y + el.h / 2 + 7, _tmpColor, crv, rws, inst);
      }
    }

    // Text-select surfaces: editable DOM text boxes and the code editor panel
    // (a world-space panel, not in docRoot, so hit-tested directly here).
    if (cursor === 'default') {
      let he: StyledEl | null = hovered; while (he && !he.editable) he = he.parent;
      if (he) cursor = 'text';
      else if (s.editorMode && s.editor) {
        const ed = s.editor;
        if (s.mwx >= ed.x0 && s.mwx <= ed.x0 + ed.contentWidth() && s.mwy >= ed.y0 && s.mwy <= ed.y0 + ed.contentHeight()) cursor = 'text';
      }
    }
    // File tree cursor: pointer when hovering over items
    if (s.fileTree && s.fileTree.hovered) {
      cursor = 'pointer';
    }
    mark('dynamic');

    // Layer 3: ALL text (static pre-computed + marquee dynamic + editable) — on top of all backgrounds
    for (let p = 0; p < s.textByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.textByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }
    mark('textCopy');
    for (const el of s.marqueeEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      layoutFlow(el, s.font, s.atlas, inst, now);
    }
    const caretW = 2 / cameraScale(s);
    for (const el of s.editableEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage] && el !== s.activeEdit) continue;
      layoutEditable(el, s.font, s.atlas, inst, crv, rws, caretW, now, el === s.activeEdit, s.themeCol.caret, s.themeCol.sel);
    }
    mark('editable');

    // Code editor (world-space panel). Rendered when it intersects the viewport.
    if (s.editor) {
      const ed = s.editor;
      const edR = ed.x0 + ed.contentWidth(), edB = ed.y0 + ed.contentHeight();
      if (boardVis(ed.x0, ed.y0, edR, edB)) {
        ed.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, editorTheme(s), caretW);
      }
    }
    mark('editor');

    // Terminal (world-space panel). Rendered when it intersects the viewport.
    if (s.terminal) {
      const tm = s.terminal;
      const tR = tm.x0 + tm.contentW, tB = tm.y0 + tm.contentH;
      if (boardVis(tm.x0, tm.y0, tR, tB)) {
        tm.render(s.font, s.atlas, inst, crv, rws, now, dt, TERMINAL_THEME, caretW);
      }
    }

    // File tree (world-space panel).
    if (s.fileTree) {
      const ft = s.fileTree;
      const fR = ft.x0 + ft.width, fB = ft.y0 + ft.contentHeight;
      if (boardVis(ft.x0, ft.y0, fR, fB)) {
        ft.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, FILE_TREE_THEME);
      }
    }
    mark('term+tree');

    // windgraph demo board (world-space).
    // In 3D (cinematic flight) the 2D view bounds/zoom are stale, so pass the
    // camera's on-axis scale and unbounded extents (culling is per-board above).
    const boardView = _boardView;
    if (s.cam3d.active) {
      boardView.zoom = cameraScale(s); boardView.left = -1e12; boardView.right = 1e12; boardView.top = -1e12; boardView.bottom = 1e12;
    } else {
      boardView.zoom = s.viewZ; boardView.left = vL; boardView.right = vR; boardView.top = vT; boardView.bottom = vB;
    }
    if (s.windgraph) {
      const g = s.windgraph;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        // Cache by ZOOM + a TILE-QUANTIZED clip. The board's emit re-runs marching-
        // squares / field-sampling / stroking on every call (~10-14ms) and the old
        // signature embedded the exact per-frame clip rect, so it MISSED every pan
        // frame → that cost recurred each frame (the dominant movement stutter).
        // Fix: snap the view∩board clip OUTWARD to a coarse world grid. Within a
        // tile the signature — and the emitted, clipped geometry — is constant, so
        // panning replays the cache instead of rebuilding; a rebuild happens only
        // when the camera crosses a tile boundary (a few times/sec, not per frame).
        // Expanding outward keeps the cached clip a strict SUPERSET of the viewport
        // (nothing pops in mid-tile) while staying viewport-bounded (no full-board
        // instance bloat — the mistake that made a naive "emit everything" regress).
        let wgView: { zoom: number; left: number; right: number; top: number; bottom: number };
        let sig: string;
        if (s.cam3d.active) {
          wgView = { zoom: cameraScale(s), left: -1e12, right: 1e12, top: -1e12, bottom: 1e12 };
          sig = `3d|${wgView.zoom}`;
        } else {
          const TILE = 1200; // world px; larger = fewer rebuilds but more instances/rebuild
          const eL = Math.floor(Math.max(vL, g.x0) / TILE) * TILE;
          const eT = Math.floor(Math.max(vT, g.y0) / TILE) * TILE;
          const eR = Math.ceil(Math.min(vR, gR) / TILE) * TILE;
          const eB = Math.ceil(Math.min(vB, gB) / TILE) * TILE;
          wgView = { zoom: s.viewZ, left: eL, right: eR, top: eT, bottom: eB };
          sig = `2d|${s.viewZ.toPrecision(5)}|${eL},${eT},${eR},${eB}`;
        }
        windgraphCache.run(sig, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws, now, wgView));
      }
    }
    mark('windgraph');

    // windgraph Phase-4 animation board (world-space).
    if (s.morphDemo) {
      const g = s.morphDemo;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
      }
    }
    mark('morph');

    // windgraph Phase-5 interactive board (world-space, draggable).
    if (s.interactive) {
      const g = s.interactive;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      // The DOM-free cinematic HUD is screen-anchored and must draw even when the
      // scene board is culled (e.g. zoomed far out while paused), so never gate it.
      if (boardVis(g.x0, g.y0, gR, gB) || (g as any).cinematicHud) {
        // Update hover BEFORE emit so the hover ring is current; the cursor is
        // applied once at the end of the frame (deferred write).
        const over = !wheelCool && s.pointerInput && (g.dragging || g.updateHover(s.mwx, s.mwy, cameraScale(s)));
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
        if (over) cursor = g.dragging ? 'grabbing' : 'grab';
      }
    }
    mark('interact');

    // windgraph Phase-7 3D graphing board is drawn as a TRUE 3D mesh (below, in
    // the render pass) — not as windfoil instances — so it rises off the ground.

    // windgraph Phase-6 math typesetting board (world-space).
    if (s.mathDemo) {
      const g = s.mathDemo;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
      }
    }
    mark('math');

    // Perf isolation bench (world-space). Output depends only on the mode.
    if (s.bench) {
      const g = s.bench;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        benchCache.run(`m${g.mode}`, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws, now, boardView));
      }
    }

    // Scripted benchmark results board (world-space; see perf/benchmark.ts).
    // Static once computed; only changes when a new run finishes (version).
    if (s.perf && s.perf.showResults) {
      const g = s.perf;
      if (boardVis(g.x0, g.y0, g.x0 + g.width, g.y0 + g.height)) {
        resultsCache.run(`r${g.version}`, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws));
      }
    }
    mark('bench');

    // Analytic context menu: in 3D it peels into world space (like the IDE) —
    // emitted into the world instance buffer with the captured camera pose, so it
    // pans/zooms with the document. In 2D (menuWorldPose null) it stays a screen
    // overlay drawn by s.screenHud below. A stale pose is dropped once the menu
    // closes so a later 2D open starts clean.
    if (s.analyticMenu?.open && s.menuWorldPose) {
      const mp = s.menuWorldPose;
      s.analyticMenu.render(s.font, s.atlas, inst, crv, rws, ANALYTIC_MENU_THEME, poseXform(mp.pose, mp.Wv, mp.Hv));
    } else if (s.menuWorldPose && !s.analyticMenu?.open) {
      s.menuWorldPose = null;
    }

    // Deferred cursor write: mutating style.cursor every frame dirties style and
    // makes each incoming pointer event pay a synchronous style-recalc — a classic
    // mouse-move FPS killer. Only touch the DOM when the cursor actually changes.
    if (s.toolbar?.cursor) cursor = s.toolbar.cursor;
    if (s.panel?.cursor) cursor = s.panel.cursor;
    if (s.analyticMenu?.open) {
      cursor = s.analyticMenu.hovered >= 0 ? 'pointer' : 'default';
    }
    if (cursor !== lastCursor) { lastCursor = cursor; s.rCanvas.style.cursor = cursor; }

    // Backdrop is a static CSS background on the canvas (set on theme change) —
    // not a per-frame full-screen 2D fill, which the compositor had to re-upload
    // every frame (extra GPU/composite load that competed with rendering + cursor
    // compositing while moving the mouse). The WebGPU canvas is transparent where
    // nothing is drawn, so the CSS backdrop shows through.
    if (crv.length > s.crvFA.length) s.crvFA = new Float32Array(crv.length * 2);
    s.crvFA.set(crv);
    if (rws.length > s.rwsUA.length) s.rwsUA = new Uint32Array(rws.length * 2);
    s.rwsUA.set(rws);
    // Upload instance buffer. In 2D mode, subtract camera center from each
    // instance origin in JS (f64) so the GPU sees small coordinates even at
    // extreme zoom — true infinite zoom. 3D mode passes absolute coords because
    // orbitViewProj handles the camera transform internally.
    if (inst.length > s.instFA.length) s.instFA = new Float32Array(inst.length * 2);
    if (s.cam3d.active) {
      s.instFA.set(inst);
    } else {
      const cx = s.viewX, cy = s.viewY;
      for (let i = 0; i < inst.length; i += 16) {
        s.instFA[i] = inst[i] - cx;       // place.x relative to camera (f64→f32)
        s.instFA[i + 1] = inst[i + 1] - cy;
        for (let j = 2; j < 16; j++) s.instFA[i + j] = inst[i + j];
      }
    }
    mark('upload');
    const enc = s.device.createCommandEncoder();
    // Cinematic post-process (vignette + splash) takes precedence: the coverage
    // pass draws into the postfx offscreen target at FULL resolution, then a
    // fullscreen fragment shader grades it onto the swapchain. Otherwise the
    // low-res-render + sharpen-upscale path (when enabled) renders into its own
    // offscreen target at integralScale × the swapchain and CAS-upscales; with
    // neither active the pass draws straight to the swapchain. viewProj is
    // UNCHANGED in every path — clip space is resolution-independent and the
    // resolves are 1:1 NDC fullscreen passes, so content lands identically.
    const usePostfx = !!s.postfx;
    const sharpen = !usePostfx && s.lowResSharpen && !!s.upscaler;
    const iScale = sharpen ? Math.min(Math.max(s.integralScale, 0.25), 1) : 1;
    const renderW = sharpen ? Math.max(1, Math.round(Cw * iScale)) : Cw;
    const renderH = sharpen ? Math.max(1, Math.round(Ch * iScale)) : Ch;
    const depthView = ensureDepthView(s.device, renderW, renderH);
    const swapView = s.gpuCtx.getCurrentTexture().createView();
    const colorView = usePostfx ? s.postfx!.target(Cw, Ch) : sharpen ? s.upscaler!.target(renderW, renderH) : swapView;
    // Clear to the theme backdrop: the canvas is OPAQUE (see main.ts), so the
    // backdrop is painted here instead of showing a CSS background through a
    // transparent canvas (which cost a full-screen compositor blend per frame).
    const bd = s.themeCol.backdrop;
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: bd[0], g: bd[1], b: bd[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    // View-projection: orthographic (2D) or perspective (3D free camera). camScale
    // feeds the AA-skirt pad; camCenter moves camera translation out of the matrix
    // (into the vertex shader) so the matrix terms stay small at extreme zoom.
    const camScale = cameraScale(s);
    // TRUE 3D: draw the surface mesh FIRST (it writes depth + self-occludes); the
    // analytic windfoil pass then renders on top (depth-agnostic), so document +
    // labels stay crisp above the surface. The mesh renders in BOTH modes so the
    // graph is seamless: a flat top-down colour map in 2D, rising off the ground
    // in the 3D free-camera. In 2D it uses a full ortho (camera pan/zoom baked in,
    // z ignored → flat); in 3D it shares the orbit view-projection (height rises).
    if (s.graph3d && s.meshRenderer) {
      const g = s.graph3d;
      const inView3D = s.cam3d.active && rect3DVisible(viewProj, g.cx - g.halfSpan, g.cy - g.halfSpan, g.cx + g.halfSpan, g.cy + g.halfSpan);
      const inView2D = !s.cam3d.active && (g.cx - g.halfSpan <= vR && g.cx + g.halfSpan >= vL && g.cy - g.halfSpan <= vB && g.cy + g.halfSpan >= vT);
      if (inView3D || inView2D) {
        let meshVP: ArrayLike<number> = viewProj;
        if (!s.cam3d.active) {
          const sx = (2 * s.viewZ) / Cw, sy = (2 * s.viewZ) / Ch;
          // column-major: maps doc (x,y) → clip (x-viewX)*sx, -(y-viewY)*sy, z→0.5
          meshVP = [sx, 0, 0, 0, 0, -sy, 0, 0, 0, 0, 0, 0, -sx * s.viewX, sy * s.viewY, 0.5, 1];
        }
        const m = g.buildMesh();
        s.meshRenderer.setViewProj(meshVP);
        s.meshRenderer.drawTris(pass, m.tris);
        s.meshRenderer.drawLines(pass, m.lines);
      }
    }
    s.renderer.setUniforms({ width: renderW, height: renderH, camScale: [camScale, camScale], camCenter: [0, 0], viewProj });
    s.renderer.draw(pass, s.crvFA.subarray(0, crv.length), s.rwsUA.subarray(0, rws.length), s.instFA.subarray(0, inst.length), inst.length / 16);
    // Screen-space cinematic HUD overlay (letterbox + sleek timeline + controls +
    // caption), drawn through a dedicated renderer with a screen-ortho matrix, on
    // top of the 3D scene. This composites correctly in the same pass because the
    // cinematic has no depth-writing mesh (depth stays cleared to 1 → the overlay's
    // less-equal test passes), and the dedicated renderer owns separate storage
    // buffers (no hazard with the scene draw that already referenced its own
    // buffers). The geometry is emitted in FULL backing-store px (Cw/Ch), so the
    // ortho must span Cw/Ch even when the pass targets the low-res sharpen texture
    // (renderW/H): the HUD then scales down into the target and the CAS upscale
    // restores it — apparent size invariant, only quality moves.
    const inter = s.interactive as any;
    if (s.hudRenderer && inter && inter.hudCount) {
      const so = [2 / Cw, 0, 0, 0, 0, -2 / Ch, 0, 0, 0, 0, 0, 0, -1, 1, 0, 1];
      s.hudRenderer.setUniforms({ width: Cw, height: Ch, camScale: [1, 1], camCenter: [0, 0], viewProj: so });
      s.hudRenderer.draw(pass, inter.hudCrvFA.subarray(0, inter.hudCrvLen), inter.hudRwsUA.subarray(0, inter.hudRwsLen), inter.hudInstFA.subarray(0, inter.hudInstLen), inter.hudCount);
    }
    // Screen-space HUD overlay (toolbar + analytic menus + panels + readouts):
    // emitted in backing-store px and drawn through its own renderer with a
    // screen-ortho matrix, so chrome never moves with the world camera. Uses the
    // FULL backing size (Cw/Ch, not the low-res renderW/H) so chrome stays correctly
    // positioned even when low-res render + sharpen upscales the scene target.
    // Seeded with the atlas base band tables so menu/toolbar glyphs resolve.
    s.screenHud?.frame(pass, Cw, Ch, now, s.baseCrv, s.baseRws);
    pass.end();
    // Resolve the offscreen render to the full-res swapchain: cinematic grade
    // (postfx) or contrast-adaptive sharpen (upscale), else already on swapchain.
    if (usePostfx) s.postfx!.resolve(enc, swapView, Cw, Ch);
    else if (sharpen) s.upscaler!.resolve(enc, swapView, renderW, renderH, Cw, Ch, s.sharpenAmount);
    s.device.queue.submit([enc.finish()]);
    mark('encode');
    const frameJs = performance.now() - t0;
    jsMs = jsMs * .9 + frameJs * .1;
    if (s.perf && s.perf.running) s.perf.sample(dt, frameJs, inst.length / 16, prof, evThisFrame, evCoalThisFrame, evMsThisFrame);
  }
  requestAnimationFrame(frame);
  return () => { alive = false; }; // stop handle: cancels the loop for demo teardown
}
