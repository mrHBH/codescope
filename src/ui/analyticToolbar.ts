// ── Analytic toolbar — GPU-rendered button bar, zero DOM ─────────────────────
// A floating row of icon buttons rendered through the same analytic pipeline as
// everything else. Button icons are geometric primitives (triangles, rects).
// Hover and toggle state are tracked internally; the caller feeds pointer events.
//
// Screen-space overlay: call setScreen(cssW, cssH) each frame with CSS-pixel
// dimensions, then render into a SEPARATE instance buffer and draw with a
// screen-ortho matrix so buttons stay fixed on screen regardless of camera.
//
// Usage:
//   const tb = new AnalyticToolbar([
//     { id: 'home',  icon: 'home',  title: 'Back',   onClick: () => ... },
//     { id: 'debug', icon: 'stats', title: 'Stats',  onClick: () => ..., active: () => showDebug },
//   ]);
//   tb.setScreen(cssW(), cssH());
//   tb.updateHover(mx, my);
//   const hit = tb.hitTest(mx, my); if (hit) hit.onClick();

import { addRect } from '../layout/metrics';
import { fillQuads, polygonQuads, type Pt } from '../windgraph/stroke/stroke';

export type ToolbarIcon =
  | 'home' | 'stats' | 'close' | 'play' | 'pause' | 'replay'
  | 'folder' | 'code' | 'terminal' | 'cube' | 'settings' | 'moon'
  | 'chart' | 'film'
  | 'pointer' | 'compass' | 'sliders' | 'morph' | 'triangle'
  | 'mountain' | 'ruler' | 'flask' | 'timer' | 'grid';

export interface ToolbarButton {
  id: string;
  icon: ToolbarIcon;
  title: string;
  onClick: () => void;
  active?: () => boolean;   // true = button is in toggled-on state
  altIcon?: ToolbarIcon;    // shown instead of icon when active()
}

interface BtnGeo { btn: ToolbarButton; x: number; y: number; s: number; }

const BTN_BG   = [0.06, 0.07, 0.09, 0.55];
const BTN_HOV  = [0.14, 0.16, 0.21, 0.80];
const BTN_ACT  = [0.095, 0.30, 0.50, 0.65];   // active (toggled-on)
const BTN_BD   = [0.30, 0.33, 0.42, 0.6];
const ACC_COL  = [0.365, 0.839, 1.0, 1];       // cyan accent
const ICON_COL = [0.86, 0.88, 0.93, 1];         // near-white

const DEF_S = 28;
const DEF_GAP = 6;
const DEF_MARGIN = 10;

export class AnalyticToolbar {
  buttons: BtnGeo[] = [];
  hoveredId: string | null = null;
  private btnS = DEF_S;
  private gap = DEF_GAP;

  constructor(items: ToolbarButton[]) {
    for (const b of items) this.buttons.push({ btn: b, x: 0, y: 0, s: this.btnS });
  }

  /** Position buttons at the top-right corner using CSS-pixel dimensions. */
  setScreen(cssW: number, _cssH: number, margin = DEF_MARGIN, gap?: number, btnS?: number) {
    if (btnS) this.btnS = btnS;
    if (gap !== undefined) this.gap = gap;
    let rx = cssW - margin;
    for (const b of this.buttons) {
      b.s = this.btnS;
      rx -= b.s;
      b.x = rx;
      b.y = margin;
      rx -= this.gap;
    }
  }

  /** Position buttons at an arbitrary left-to-right row. */
  setRect(x: number, y: number, btnS: number, gap: number) {
    this.btnS = btnS; this.gap = gap;
    let cx = x;
    for (const b of this.buttons) { b.s = btnS; b.x = cx; b.y = y; cx += btnS + gap; }
  }

  updateHover(sx: number, sy: number) {
    this.hoveredId = null;
    for (const b of this.buttons) {
      if (sx >= b.x && sx <= b.x + b.s && sy >= b.y && sy <= b.y + b.s) { this.hoveredId = b.btn.id; return; }
    }
  }

  hitTest(sx: number, sy: number): ToolbarButton | null {
    for (const b of this.buttons) {
      if (sx >= b.x && sx <= b.x + b.s && sy >= b.y && sy <= b.y + b.s) return b.btn;
    }
    return null;
  }

  /** Returns screen-space instance data for a separate screen-ortho draw call.
   *  Caller should convert instFA → Float32Array, etc. like the main buffer. */
  render(inst: number[], crv: number[], rws: number[], _now: number) {
    for (const b of this.buttons) {
      const hot = b.btn.id === this.hoveredId;
      const active = !hot && b.btn.active?.();
      const bg = hot ? BTN_HOV : active ? BTN_ACT : BTN_BG;
      const bd = (hot || active) ? ACC_COL : BTN_BD;
      const bx = b.x, by = b.y, s = b.s;

      addRect(bx, by, bx + s, by + s, bg, crv, rws, inst);
      addRect(bx, by, bx + s, by + 1, bd, crv, rws, inst);
      addRect(bx, by + s - 1, bx + s, by + s, bd, crv, rws, inst);
      addRect(bx, by, bx + 1, by + s, bd, crv, rws, inst);
      addRect(bx + s - 1, by, bx + s, by + s, bd, crv, rws, inst);

      const icon = (active && b.btn.altIcon) ? b.btn.altIcon : b.btn.icon;
      this.drawIcon(inst, crv, rws, icon, bx, by, s);
    }
  }

  fitContent(): { w: number; h: number } {
    return {
      w: this.buttons.length * this.btnS + Math.max(0, this.buttons.length - 1) * this.gap,
      h: this.btnS,
    };
  }

  get cursor(): string | null { return this.hoveredId ? 'pointer' : null; }

  // ── Icon primitives ──────────────────────────────────────────────────────
  private drawIcon(inst: number[], crv: number[], rws: number[], icon: ToolbarIcon,
                   bx: number, by: number, s: number) {
    const fx = (f: number) => bx + f * s;
    const fy = (f: number) => by + f * s;
    const tri = (pts: [number, number][]) =>
      fillQuads(polygonQuads(pts.map(([px, py]) => [fx(px), fy(py)] as Pt), true), ICON_COL, inst, crv, rws);
    const bar = (x0: number, y0: number, x1: number, y1: number) =>
      addRect(fx(x0), fy(y0), fx(x1), fy(y1), ICON_COL, crv, rws, inst);

    switch (icon) {
      case 'home':
        tri([[0.50, 0.22], [0.22, 0.50], [0.78, 0.50]]);
        bar(0.30, 0.48, 0.70, 0.74);
        bar(0.44, 0.56, 0.56, 0.74);
        break;
      case 'stats':
        bar(0.22, 0.62, 0.34, 0.74);
        bar(0.42, 0.38, 0.54, 0.74);
        bar(0.62, 0.48, 0.74, 0.74);
        break;
      case 'close':
        bar(0.40, 0.28, 0.60, 0.72);
        bar(0.28, 0.40, 0.72, 0.60);
        break;
      case 'play':
        tri([[0.34, 0.28], [0.34, 0.72], [0.72, 0.50]]);
        break;
      case 'pause':
        bar(0.30, 0.28, 0.42, 0.72);
        bar(0.58, 0.28, 0.70, 0.72);
        break;
      case 'replay': {
        const cx = fx(0.50), cy = fy(0.48), r = s * 0.22;
        for (let a = -0.85; a < 0.85; a += 0.16) {
          addRect(cx + Math.cos(a) * r - 0.8, cy + Math.sin(a) * r - 0.8,
                  cx + Math.cos(a) * r + 0.8, cy + Math.sin(a) * r + 0.8, ICON_COL, crv, rws, inst);
        }
        tri([[0.64, 0.64], [0.78, 0.48], [0.66, 0.40]]);
        break;
      }
      case 'folder':
        bar(0.20, 0.28, 0.80, 0.30);
        bar(0.20, 0.28, 0.30, 0.40);
        bar(0.20, 0.38, 0.80, 0.72);
        bar(0.20, 0.38, 0.22, 0.72);
        bar(0.78, 0.38, 0.80, 0.72);
        break;
      case 'code':
        bar(0.28, 0.32, 0.36, 0.34);
        bar(0.28, 0.32, 0.30, 0.68);
        bar(0.28, 0.66, 0.36, 0.68);
        bar(0.64, 0.32, 0.72, 0.34);
        bar(0.70, 0.32, 0.72, 0.68);
        bar(0.64, 0.66, 0.72, 0.68);
        break;
      case 'terminal':
        bar(0.24, 0.32, 0.76, 0.34);
        bar(0.24, 0.32, 0.26, 0.68);
        bar(0.24, 0.66, 0.76, 0.68);
        bar(0.74, 0.66, 0.76, 0.68);
        bar(0.30, 0.44, 0.50, 0.46);
        bar(0.30, 0.54, 0.44, 0.56);
        break;
      case 'cube':
        bar(0.24, 0.60, 0.60, 0.62);
        bar(0.60, 0.60, 0.76, 0.44);
        bar(0.24, 0.28, 0.60, 0.30);
        bar(0.60, 0.28, 0.76, 0.44);
        bar(0.24, 0.28, 0.26, 0.60);
        break;
      case 'settings': {
        const cx = fx(0.50), cy = fy(0.50), r = s * 0.22;
        for (let a = 0; a < Math.PI * 2; a += 0.18) {
          addRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1,
                  cx + Math.cos(a) * r + 1, cy + Math.sin(a) * r + 1, ICON_COL, crv, rws, inst);
        }
        addRect(cx - 2, cy - 2, cx + 2, cy + 2, ICON_COL, crv, rws, inst);
        break;
      }
      case 'moon':
        bar(0.56, 0.24, 0.74, 0.28);
        bar(0.46, 0.30, 0.76, 0.34);
        bar(0.38, 0.38, 0.78, 0.42);
        bar(0.34, 0.48, 0.72, 0.52);
        bar(0.34, 0.58, 0.66, 0.62);
        bar(0.40, 0.66, 0.58, 0.70);
        break;
      case 'chart':
        bar(0.22, 0.62, 0.34, 0.74);
        bar(0.42, 0.38, 0.54, 0.74);
        bar(0.62, 0.48, 0.74, 0.74);
        bar(0.22, 0.72, 0.74, 0.74);
        bar(0.22, 0.72, 0.24, 0.28);
        break;
      case 'film':
        bar(0.20, 0.36, 0.80, 0.64);
        bar(0.20, 0.36, 0.22, 0.64);
        bar(0.78, 0.36, 0.80, 0.64);
        bar(0.20, 0.36, 0.80, 0.38);
        bar(0.20, 0.62, 0.80, 0.64);
        break;
      case 'pointer':
        tri([[0.32, 0.22], [0.32, 0.68], [0.45, 0.55]]);
        bar(0.44, 0.54, 0.52, 0.74);
        break;
      case 'compass': {
        const cx = fx(0.50), cy = fy(0.52), r = s * 0.26;
        for (let a = 0; a < Math.PI * 2; a += 0.22) {
          addRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1,
                  cx + Math.cos(a) * r + 1, cy + Math.sin(a) * r + 1, ICON_COL, crv, rws, inst);
        }
        tri([[0.50, 0.34], [0.42, 0.56], [0.58, 0.56]]);
        break;
      }
      case 'sliders':
        bar(0.24, 0.32, 0.76, 0.34); bar(0.56, 0.27, 0.60, 0.39);
        bar(0.24, 0.49, 0.76, 0.51); bar(0.36, 0.44, 0.40, 0.56);
        bar(0.24, 0.66, 0.76, 0.68); bar(0.62, 0.61, 0.66, 0.73);
        break;
      case 'grid':
        for (let gy = 0; gy < 3; gy++) {
          for (let gx = 0; gx < 3; gx++) {
            bar(0.28 + gx * 0.17, 0.28 + gy * 0.17, 0.38 + gx * 0.17, 0.38 + gy * 0.17);
          }
        }
        break;
      case 'morph': {
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          const px = fx(0.26 + 0.48 * t), py = fy(0.50 - 0.22 * Math.sin(t * Math.PI));
          const d = s * (0.03 + 0.03 * t);
          addRect(px - d, py - d, px + d, py + d, ICON_COL, crv, rws, inst);
        }
        break;
      }
      case 'triangle':
        tri([[0.50, 0.26], [0.26, 0.70], [0.74, 0.70]]);
        bar(0.48, 0.24, 0.52, 0.28);
        bar(0.24, 0.68, 0.28, 0.72);
        bar(0.72, 0.68, 0.76, 0.72);
        break;
      case 'mountain':
        tri([[0.18, 0.72], [0.40, 0.32], [0.58, 0.72]]);
        tri([[0.46, 0.72], [0.66, 0.42], [0.84, 0.72]]);
        break;
      case 'ruler':
        bar(0.22, 0.42, 0.78, 0.58);
        bar(0.32, 0.42, 0.335, 0.50);
        bar(0.44, 0.42, 0.455, 0.50);
        bar(0.56, 0.42, 0.575, 0.50);
        bar(0.68, 0.42, 0.695, 0.50);
        break;
      case 'flask':
        bar(0.44, 0.22, 0.56, 0.40);
        tri([[0.30, 0.76], [0.50, 0.40], [0.70, 0.76]]);
        bar(0.40, 0.64, 0.60, 0.74);
        break;
      case 'timer': {
        const cx = fx(0.50), cy = fy(0.54), r = s * 0.22;
        for (let a = 0; a < Math.PI * 2; a += 0.20) {
          addRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1,
                  cx + Math.cos(a) * r + 1, cy + Math.sin(a) * r + 1, ICON_COL, crv, rws, inst);
        }
        bar(0.44, 0.20, 0.56, 0.26);
        bar(0.49, 0.36, 0.51, 0.54);
        bar(0.50, 0.53, 0.60, 0.55);
        break;
      }
    }
  }
}
