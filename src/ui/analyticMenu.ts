// ── Analytic context menu ────────────────────────────────────────────────────
// A fully GPU-rendered context menu that draws through windfoil's analytic
// pipeline — zero DOM. Rects for the panel/hover/separator, atlas glyphs for
// icons and text. Drop-in replacement for the old DOM ContextMenu.
//
// Usage:
//   const menu = new AnalyticContextMenu();
//   // on right-click:
//   menu.show(worldX, worldY, items, viewportW, viewportH, textWidthFn);
//   // each frame:
//   if (menu.open) menu.render(font, atlas, inst, crv, rws, theme);
//   // on pointer move:
//   menu.hovered = menu.hitTest(worldX, worldY);
//   // on pointer down:
//   const idx = menu.hitTest(worldX, worldY);
//   if (idx >= 0) { menu.items[idx].action?.(); menu.hide(); }
//   else menu.hide();

import type { FontFace } from '../windfoil/font';
import { advanceOf } from '../windfoil/font';
import { addRect, layoutStr, layoutIcon } from '../layout/metrics';

export interface AnalyticMenuItem {
  id: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  separator?: boolean;
  enabled?: () => boolean;
  action?: () => void;
}

export interface AnalyticMenuTheme {
  bg: number[];
  border: number[];
  hover: number[];
  text: number[];
  dim: number[];
  icon: number[];
  sep: number[];
  disabled: number[];
}

export const ANALYTIC_MENU_THEME: AnalyticMenuTheme = {
  bg: [0.12, 0.12, 0.14, 0.97],
  border: [0.25, 0.25, 0.28, 1],
  hover: [1, 1, 1, 0.08],
  text: [0.88, 0.90, 0.95, 1],
  dim: [0.55, 0.58, 0.65, 1],
  icon: [0.56, 0.66, 1, 1],
  sep: [0.25, 0.25, 0.28, 1],
  disabled: [0.35, 0.35, 0.40, 1],
};

const ROW_H = 28;
const PAD = 6;
const ICON_SZ = 14;
const ICON_GAP = 8;
const FONT_SZ = 12;
const SHORT_GAP = 20;
const MIN_W = 180;
const SEP_H = 9;
const RADIUS = 6;

export class AnalyticContextMenu {
  open = false;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  items: AnalyticMenuItem[] = [];
  hovered = -1;
  private font: FontFace | null = null;
  private tw: ((text: string, size: number) => number) | null = null;

  show(wx: number, wy: number, items: AnalyticMenuItem[], vpW: number, vpH: number, textW: (text: string, size: number) => number) {
    this.items = items;
    this.tw = textW;
    this.open = true;
    this.hovered = -1;
    this.measure();
    this.x = Math.max(4, Math.min(wx, vpW - this.w - 4));
    this.y = Math.max(4, Math.min(wy, vpH - this.h - 4));
  }

  hide() {
    this.open = false;
    this.hovered = -1;
  }

  hitTest(wx: number, wy: number): number {
    if (!this.open) return -1;
    if (wx < this.x || wx > this.x + this.w || wy < this.y || wy > this.y + this.h) return -1;
    let ry = this.y + PAD;
    for (let i = 0; i < this.items.length; i++) {
      const rh = this.items[i].separator ? SEP_H : ROW_H;
      if (wy >= ry && wy < ry + rh) return this.items[i].separator ? -1 : i;
      ry += rh;
    }
    return -1;
  }

  private measure() {
    if (!this.tw) return;
    let maxW = MIN_W;
    for (const it of this.items) {
      if (it.separator) continue;
      let rw = PAD * 2 + ICON_SZ + ICON_GAP;
      rw += this.tw(it.label || '', FONT_SZ);
      if (it.shortcut) rw += SHORT_GAP + this.tw(it.shortcut, FONT_SZ - 1);
      rw += PAD;
      if (rw > maxW) maxW = rw;
    }
    this.w = maxW;
    let hh = PAD;
    for (const it of this.items) hh += it.separator ? SEP_H : ROW_H;
    hh += PAD;
    this.h = hh;
  }

  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], th: AnalyticMenuTheme) {
    if (!this.open) return;
    if (!this.font) this.font = font;
    const x0 = this.x, y0 = this.y, x1 = this.x + this.w, y1 = this.y + this.h;

    // Layered soft shadow — concentric dark rects at decreasing alpha. Impossible
    // in CSS without stacking-context hacks; here it's just addRect with alpha.
    const shadow = (ox: number, oy: number, a: number) =>
      addRect(x0 + ox, y0 + oy, x1 + ox, y1 + oy, [0, 0, 0, a], crv, rws, inst);
    shadow(8, 6, 0.12);
    shadow(5, 4, 0.10);
    shadow(3, 2, 0.08);

    addRect(x0, y0, x1, y1, th.bg, crv, rws, inst);
    addRect(x0, y0, x1, y0 + 1, th.border, crv, rws, inst);
    addRect(x0, y1 - 1, x1, y1, th.border, crv, rws, inst);
    addRect(x0, y0, x0 + 1, y1, th.border, crv, rws, inst);
    addRect(x1 - 1, y0, x1, y1, th.border, crv, rws, inst);

    let ry = y0 + PAD;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.separator) {
        addRect(x0 + 8, ry + 4, x1 - 8, ry + 5, th.sep, crv, rws, inst);
        ry += SEP_H;
        continue;
      }
      const disabled = it.enabled ? !it.enabled() : false;
      if (i === this.hovered && !disabled) {
        addRect(x0 + 3, ry + 2, x1 - 3, ry + ROW_H - 2, th.hover, crv, rws, inst);
      }
      const iconX = x0 + PAD + 4;
      const iconY = ry + (ROW_H - ICON_SZ) / 2;
      if (it.icon) {
        const gl = atlas.table[it.icon];
        if (gl) layoutIcon(inst, gl, { x: iconX, y: iconY, w: ICON_SZ, h: ICON_SZ }, disabled ? th.disabled : th.icon);
      }
      const labelX = iconX + ICON_SZ + ICON_GAP;
      const labelY = ry + (ROW_H - FONT_SZ) / 2;
      layoutStr(inst, it.label || '', disabled ? th.disabled : th.text, atlas.table, font, { x: labelX, y: labelY, size: FONT_SZ });
      if (it.shortcut) {
        const sw = this.tw ? this.tw(it.shortcut, FONT_SZ - 1) : 0;
        const sx = x1 - PAD - sw - 4;
        layoutStr(inst, it.shortcut, disabled ? th.disabled : th.dim, atlas.table, font, { x: sx, y: labelY + 1, size: FONT_SZ - 1 });
      }
      ry += ROW_H;
    }
  }
}
