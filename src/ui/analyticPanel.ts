// ── Analytic settings panel ──────────────────────────────────────────────────
// A reusable, fully GPU-rendered settings panel (headers, sliders, toggles) in the
// yasmineOS design language — zero DOM. The playground's Quality/performance panel
// and the IDE's settings menus are built from the same component so the controls
// never drift between surfaces. Like AnalyticContextMenu, it is coordinate-agnostic:
// pass a `scale` (1 = CSS-px world space, dpr = backing-store-px screen overlay) and
// render it into whichever buffers + matrix the caller chooses.

import type { FontFace } from '../windfoil/font';
import { addRect, layoutStr, tw } from '../layout/metrics';

export interface PanelHeader { kind: 'header'; id: string; label: string; }
export interface PanelSlider {
  kind: 'slider'; id: string; label: string;
  min: number; max: number; step: number;
  get: () => number; set: (v: number) => void;
  fmt?: (v: number) => string;
  enabled?: () => boolean;
}
export interface PanelToggle {
  kind: 'toggle'; id: string; label: string;
  get: () => boolean; set: (v: boolean) => void;
  enabled?: () => boolean;
}
export type PanelItem = PanelHeader | PanelSlider | PanelToggle;

// yasmineOS reference palette (src/css/theme.ts `dark`).
export interface AnalyticPanelTheme {
  bg: number[]; border: number[]; text: number[]; dim: number[];
  accent: number[]; track: number[]; disabled: number[]; hover: number[];
}
export const ANALYTIC_PANEL_THEME: AnalyticPanelTheme = {
  bg: [0.145, 0.145, 0.149, 0.97],   // #252526
  border: [0.20, 0.20, 0.20, 1],     // #333333
  text: [0.80, 0.80, 0.80, 1],       // #cccccc
  dim: [0.533, 0.533, 0.533, 1],     // #888888
  accent: [0.0, 0.478, 0.8, 1],      // #007acc
  track: [0.20, 0.20, 0.20, 1],      // #333333
  disabled: [0.40, 0.40, 0.40, 1],
  hover: [1, 1, 1, 0.05],
};

const WIDTH = 236;
const PAD = 12;
const HEADER_H = 26;
const ROW_H = 34;
const TRACK_H = 6;
const THUMB = 14;
const BOX = 16;
const FONT = 12;

export class AnalyticPanel {
  open = false;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  scale = 1;
  items: PanelItem[] = [];
  hovered = -1;
  private dragging: PanelSlider | null = null;
  private font: FontFace | null = null;

  constructor(items: PanelItem[]) { this.items = items; }

  show(anchorX: number, anchorY: number, vpW: number, vpH: number, scale = 1) {
    this.open = true;
    this.hovered = -1;
    this.reposition(anchorX, anchorY, vpW, vpH, scale);
  }
  /** Re-anchor + rescale an already-open panel without resetting interaction
   *  state — lets the caller track a moving anchor (e.g. the toolbar button
   *  re-laying out when the render-resolution dial resizes the backing store)
   *  while a slider drag is in flight. */
  reposition(anchorX: number, anchorY: number, vpW: number, vpH: number, scale = 1) {
    this.scale = scale;
    this.measure();
    const m = 4 * scale;
    this.x = Math.max(m, Math.min(anchorX, vpW - this.w - m));
    this.y = Math.max(m, Math.min(anchorY, vpH - this.h - m));
  }
  hide() { this.open = false; this.hovered = -1; this.dragging = null; }
  toggle(anchorX: number, anchorY: number, vpW: number, vpH: number, scale = 1) {
    if (this.open) this.hide(); else this.show(anchorX, anchorY, vpW, vpH, scale);
  }

  private measure() {
    const k = this.scale;
    this.w = WIDTH * k;
    let hh = PAD * k;
    for (const it of this.items) hh += (it.kind === 'header' ? HEADER_H : ROW_H) * k;
    hh += PAD * k;
    this.h = hh;
  }

  private trackRect(it: PanelSlider, ry: number, k: number) {
    const tx0 = this.x + PAD * k;
    const tx1 = this.x + this.w - PAD * k;
    const cy = ry + (ROW_H * k) - (TRACK_H * k) / 2 - 4 * k;
    return { tx0, tx1, cy };
  }

  hitTest(sx: number, sy: number): number {
    if (!this.open) return -1;
    if (sx < this.x || sx > this.x + this.w || sy < this.y || sy > this.y + this.h) return -1;
    const k = this.scale;
    let ry = this.y + PAD * k;
    for (let i = 0; i < this.items.length; i++) {
      const rh = (this.items[i].kind === 'header' ? HEADER_H : ROW_H) * k;
      if (sy >= ry && sy < ry + rh) return i;
      ry += rh;
    }
    return -1;
  }

  updateHover(sx: number, sy: number) { if (this.open) this.hovered = this.hitTest(sx, sy); }

  get cursor(): string | null { return this.open && (this.hovered >= 0 || this.isDragging) ? 'pointer' : null; }

  /** Begin an interaction; returns true if the panel consumed the press. */
  pointerDown(sx: number, sy: number): boolean {
    if (!this.open) return false;
    const idx = this.hitTest(sx, sy);
    if (idx < 0) return false;
    const it = this.items[idx];
    if (it.kind === 'header') return true;
    if (it.enabled && !it.enabled()) return true;
    if (it.kind === 'toggle') { it.set(!it.get()); return true; }
    if (it.kind === 'slider') { this.dragging = it; this.setSlider(it, sx); return true; }
    return true;
  }
  drag(sx: number, _sy: number) { if (this.dragging) this.setSlider(this.dragging, sx); }
  endDrag() { this.dragging = null; }
  get isDragging() { return this.dragging !== null; }

  private setSlider(it: PanelSlider, sx: number) {
    const k = this.scale;
    const { tx0, tx1 } = this.trackRect(it, 0, k); // x-only; ry irrelevant for x mapping
    const frac = Math.max(0, Math.min(1, (sx - tx0) / Math.max(1, tx1 - tx0)));
    const raw = it.min + frac * (it.max - it.min);
    const stepped = it.step > 0 ? Math.round(raw / it.step) * it.step : raw;
    it.set(Math.max(it.min, Math.min(it.max, stepped)));
  }

  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], th: AnalyticPanelTheme) {
    if (!this.open) return;
    if (!this.font) this.font = font;
    const k = this.scale;
    const x0 = this.x, y0 = this.y, x1 = this.x + this.w, y1 = this.y + this.h;

    const shadow = (ox: number, oy: number, a: number) =>
      addRect(x0 + ox * k, y0 + oy * k, x1 + ox * k, y1 + oy * k, [0, 0, 0, a], crv, rws, inst);
    shadow(8, 6, 0.12); shadow(5, 4, 0.10); shadow(3, 2, 0.08);

    const bd = Math.max(1, k);
    addRect(x0, y0, x1, y1, th.bg, crv, rws, inst);
    addRect(x0, y0, x1, y0 + bd, th.border, crv, rws, inst);
    addRect(x0, y1 - bd, x1, y1, th.border, crv, rws, inst);
    addRect(x0, y0, x0 + bd, y1, th.border, crv, rws, inst);
    addRect(x1 - bd, y0, x1, y1, th.border, crv, rws, inst);

    let ry = y0 + PAD * k;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.kind === 'header') {
        layoutStr(inst, it.label.toUpperCase(), th.accent, atlas.table, font, { x: x0 + PAD * k, y: ry + (HEADER_H * k - FONT * k) / 2, size: 11 * k });
        ry += HEADER_H * k;
        continue;
      }
      const disabled = it.enabled ? !it.enabled() : false;
      const fg = disabled ? th.disabled : th.text;
      if (i === this.hovered && !disabled) addRect(x0 + 3 * k, ry + 2 * k, x1 - 3 * k, ry + ROW_H * k - 2 * k, th.hover, crv, rws, inst);
      const labY = ry + 6 * k;

      if (it.kind === 'toggle') {
        const bx = x0 + PAD * k, by = labY - 1 * k;
        addRect(bx, by, bx + BOX * k, by + BOX * k, disabled ? th.disabled : (it.get() ? th.accent : th.track), crv, rws, inst);
        if (!it.get()) addRect(bx + bd, by + bd, bx + BOX * k - bd, by + BOX * k - bd, th.bg, crv, rws, inst);
        layoutStr(inst, it.label, fg, atlas.table, font, { x: bx + (BOX + 10) * k, y: labY, size: FONT * k });
        ry += ROW_H * k;
        continue;
      }

      // slider
      const val = it.get();
      const valStr = it.fmt ? it.fmt(val) : val.toFixed(2);
      const vw = tw(valStr, font, FONT * k);
      layoutStr(inst, it.label, fg, atlas.table, font, { x: x0 + PAD * k, y: labY, size: FONT * k });
      layoutStr(inst, valStr, disabled ? th.disabled : th.accent, atlas.table, font, { x: x1 - PAD * k - vw, y: labY, size: FONT * k });
      const { tx0, tx1, cy } = this.trackRect(it, ry, k);
      const frac = it.max > it.min ? (val - it.min) / (it.max - it.min) : 0;
      const fx = tx0 + frac * (tx1 - tx0);
      addRect(tx0, cy - TRACK_H * k / 2, tx1, cy + TRACK_H * k / 2, disabled ? th.disabled : th.track, crv, rws, inst);
      addRect(tx0, cy - TRACK_H * k / 2, fx, cy + TRACK_H * k / 2, disabled ? th.disabled : th.accent, crv, rws, inst);
      const th2 = THUMB * k / 2;
      addRect(fx - th2, cy - th2, fx + th2, cy + th2, disabled ? th.disabled : th.accent, crv, rws, inst);
      ry += ROW_H * k;
    }
  }
}
