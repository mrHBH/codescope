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

// yasmineOS reference palette (src/css/theme.ts `dark`): surfaces #252526/#2d2d30,
// border #333333, text #cccccc, dim #888888, accent #007acc. Shared by the IDE and
// the playground so every analytic menu reads as the same design system.
export const ANALYTIC_MENU_THEME: AnalyticMenuTheme = {
  bg: [0.145, 0.145, 0.149, 0.97],
  border: [0.20, 0.20, 0.20, 1],
  hover: [0.0, 0.478, 0.8, 0.22],
  text: [0.80, 0.80, 0.80, 1],
  dim: [0.533, 0.533, 0.533, 1],
  icon: [0.0, 0.478, 0.8, 1],
  sep: [0.20, 0.20, 0.20, 1],
  disabled: [0.40, 0.40, 0.40, 1],
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
  // Render scale: 1 = CSS-px space (a world-space document), dpr = backing-store
  // px (a screen-space overlay drawn through the HUD renderer). Every layout
  // constant is multiplied by it so the menu is crisp at any device pixel ratio.
  scale = 1;
  private font: FontFace | null = null;
  private tw: ((text: string, size: number) => number) | null = null;

  show(wx: number, wy: number, items: AnalyticMenuItem[], vpW: number, vpH: number, textW: (text: string, size: number) => number, scale = 1) {
    this.items = items;
    this.tw = textW;
    this.scale = scale;
    this.open = true;
    this.hovered = -1;
    this.measure();
    const m = 4 * scale;
    this.x = Math.max(m, Math.min(wx, vpW - this.w - m));
    this.y = Math.max(m, Math.min(wy, vpH - this.h - m));
  }

  hide() {
    this.open = false;
    this.hovered = -1;
  }

  hitTest(wx: number, wy: number): number {
    if (!this.open) return -1;
    if (wx < this.x || wx > this.x + this.w || wy < this.y || wy > this.y + this.h) return -1;
    const k = this.scale;
    let ry = this.y + PAD * k;
    for (let i = 0; i < this.items.length; i++) {
      const rh = (this.items[i].separator ? SEP_H : ROW_H) * k;
      if (wy >= ry && wy < ry + rh) return this.items[i].separator ? -1 : i;
      ry += rh;
    }
    return -1;
  }

  private measure() {
    if (!this.tw) return;
    const k = this.scale;
    let maxW = MIN_W * k;
    for (const it of this.items) {
      if (it.separator) continue;
      let rw = (PAD * 2 + ICON_SZ + ICON_GAP) * k;
      rw += this.tw(it.label || '', FONT_SZ * k);
      if (it.shortcut) rw += SHORT_GAP * k + this.tw(it.shortcut, (FONT_SZ - 1) * k);
      rw += PAD * k;
      if (rw > maxW) maxW = rw;
    }
    this.w = maxW;
    let hh = PAD * k;
    for (const it of this.items) hh += (it.separator ? SEP_H : ROW_H) * k;
    hh += PAD * k;
    this.h = hh;
  }

  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], th: AnalyticMenuTheme, xform?: { ox: number; oy: number; sx: number; sy: number }, masterAlpha = 1) {
    if (!this.open) return;
    if (!this.font) this.font = font;
    const k = this.scale;
    const lx = (x: number) => xform ? xform.ox + x * xform.sx : x;
    const ly = (y: number) => xform ? xform.oy + y * xform.sy : y;
    const ls = (s: number) => xform ? s * xform.sx : s;
    const alpha = (c: number[]) => masterAlpha < 1 ? [c[0], c[1], c[2], (c[3] ?? 1) * masterAlpha] : c;

    const x0 = this.x, y0 = this.y, x1 = this.x + this.w, y1 = this.y + this.h;

    const shadow = (ox: number, oy: number, a: number) =>
      addRect(lx(x0 + ox * k), ly(y0 + oy * k), lx(x1 + ox * k), ly(y1 + oy * k), alpha([0, 0, 0, a]), crv, rws, inst);
    shadow(8, 6, 0.12);
    shadow(5, 4, 0.10);
    shadow(3, 2, 0.08);

    const bd = Math.max(1, k);
    addRect(lx(x0), ly(y0), lx(x1), ly(y1), alpha(th.bg), crv, rws, inst);
    addRect(lx(x0), ly(y0), lx(x1), ly(y0 + bd), alpha(th.border), crv, rws, inst);
    addRect(lx(x0), ly(y1 - bd), lx(x1), ly(y1), alpha(th.border), crv, rws, inst);
    addRect(lx(x0), ly(y0), lx(x0 + bd), ly(y1), alpha(th.border), crv, rws, inst);
    addRect(lx(x1 - bd), ly(y0), lx(x1), ly(y1), alpha(th.border), crv, rws, inst);

    const rowH = ROW_H * k, sepH = SEP_H * k, iconSz = ICON_SZ * k;
    let ry = y0 + PAD * k;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.separator) {
        addRect(lx(x0 + 8 * k), ly(ry + 4 * k), lx(x1 - 8 * k), ly(ry + 5 * k), alpha(th.sep), crv, rws, inst);
        ry += sepH;
        continue;
      }
      const disabled = it.enabled ? !it.enabled() : false;
      if (i === this.hovered && !disabled) {
        addRect(lx(x0 + 3 * k), ly(ry + 2 * k), lx(x1 - 3 * k), ly(ry + rowH - 2 * k), alpha(th.hover), crv, rws, inst);
      }
      const iconX = x0 + (PAD + 4) * k;
      const iconY = ry + (rowH - iconSz) / 2;
      if (it.icon) {
        const gl = atlas.table[it.icon];
        if (gl) layoutIcon(inst, gl, { x: lx(iconX), y: ly(iconY), w: ls(iconSz), h: ls(iconSz) }, alpha(disabled ? th.disabled : th.icon));
      }
      const labelX = iconX + iconSz + ICON_GAP * k;
      const labelY = ry + (rowH - FONT_SZ * k) / 2;
      layoutStr(inst, it.label || '', alpha(disabled ? th.disabled : th.text), atlas.table, font, { x: lx(labelX), y: ly(labelY), size: ls(FONT_SZ * k) });
      if (it.shortcut) {
        const sw = this.tw ? this.tw(it.shortcut, (FONT_SZ - 1) * k) : 0;
        const sx = x1 - PAD * k - sw - 4 * k;
        layoutStr(inst, it.shortcut, alpha(disabled ? th.disabled : th.dim), atlas.table, font, { x: lx(sx), y: ly(labelY + 1 * k), size: ls((FONT_SZ - 1) * k) });
      }
      ry += rowH;
    }
  }
}
