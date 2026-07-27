// ── Reference HUD board ──────────────────────────────────────────────────────
// A world-space, fully interactive showcase of the analytic HUD components
// (AnalyticToolbar + AnalyticPanel) for the design-reference document. Unlike the
// screen-space overlays elsewhere, this board lives in WORLD coordinates — it
// pans/zooms with the document like any other page element — and reuses the exact
// same zero-DOM components, fed world-space pointer coords.
//
// The toolbar buttons toggle real state (play/grid), open the settings panel, and
// cycle the global theme; the panel's sliders/toggles drive the board's own chrome
// (glow, labels, accent hue) so every interaction produces visible feedback.

import type { FontFace } from '../../windfoil/font';
import type { BoardView } from '../../state';
import { addRect, layoutStr, tw } from '../../layout/metrics';
import { AnalyticToolbar, type ToolbarButton } from '../../ui/analyticToolbar';
import { AnalyticPanel, ANALYTIC_PANEL_THEME, type AnalyticPanelTheme, type PanelItem } from '../../ui/analyticPanel';

const SURFACE = [0.145, 0.145, 0.149, 0.97];
const BORDER = [0.20, 0.20, 0.20, 1];
const TEXT = [0.80, 0.80, 0.80, 1];
const DIM = [0.533, 0.533, 0.533, 1];
const DOT = [1, 1, 1, 0.06];

// HSL → RGB (h,s,l in 0..1) → [r,g,b,1] in 0..1.
function hsl(h: number, s: number, l: number): number[] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4), 1];
}

export class ReferenceHudBoard {
  x0: number; y0: number; width: number; height: number;
  private toolbar: AnalyticToolbar;
  private panel: AnalyticPanel;
  private onTheme: () => void;

  // Live, interactive state (the panel reads/writes these via get/set callbacks).
  private playing = true;
  private gridOn = true;
  private glowOn = true;
  private labelsOn = true;
  private glowStrength = 0.6;
  private hue = 200;

  private pad = 22;
  private btnS = 36;
  private tbX = 0;
  private tbY = 0;

  constructor(rect: { x: number; y: number; w: number; h: number }, onTheme: () => void) {
    this.x0 = rect.x; this.y0 = rect.y; this.width = rect.w; this.height = rect.h;
    this.onTheme = onTheme;

    const items: ToolbarButton[] = [
      { id: 'play', icon: 'pause', altIcon: 'play', title: 'Play', active: () => this.playing, onClick: () => { this.playing = !this.playing; } },
      { id: 'grid', icon: 'grid', title: 'Grid', active: () => this.gridOn, onClick: () => { this.gridOn = !this.gridOn; } },
      { id: 'settings', icon: 'settings', title: 'Settings', active: () => this.panel.open, onClick: () => this.togglePanel() },
      { id: 'replay', icon: 'replay', title: 'Reset', onClick: () => this.reset() },
      { id: 'theme', icon: 'moon', title: 'Theme', onClick: () => this.onTheme() },
    ];
    this.toolbar = new AnalyticToolbar(items);

    const panelItems: PanelItem[] = [
      { kind: 'header', id: 'h', label: 'HUD Settings' },
      { kind: 'toggle', id: 'glow', label: 'Show Glow', get: () => this.glowOn, set: (v) => { this.glowOn = v; } },
      { kind: 'toggle', id: 'labels', label: 'Show Labels', get: () => this.labelsOn, set: (v) => { this.labelsOn = v; } },
      { kind: 'slider', id: 'glowStr', label: 'Glow Strength', min: 0, max: 1, step: 0.01, get: () => this.glowStrength, set: (v) => { this.glowStrength = v; }, fmt: (v) => v.toFixed(2) },
      { kind: 'slider', id: 'hue', label: 'Accent Hue', min: 0, max: 360, step: 1, get: () => this.hue, set: (v) => { this.hue = v; }, fmt: (v) => Math.round(v) + 'deg' },
    ];
    this.panel = new AnalyticPanel(panelItems);

    this.layout();
  }

  private layout() {
    this.tbX = this.x0 + this.pad;
    this.tbY = this.y0 + this.pad + 78;
    this.toolbar.setRect(this.tbX, this.tbY, this.btnS, 14);
  }

  private panelAnchor(): [number, number] {
    return [this.tbX, this.tbY + this.btnS + 18];
  }

  private togglePanel() {
    if (this.panel.open) this.panel.hide();
    else this.panel.show(this.panelAnchor()[0], this.panelAnchor()[1], 1e9, 1e9, 1);
  }

  private reset() {
    this.glowOn = true; this.labelsOn = true; this.glowStrength = 0.6; this.hue = 200;
  }

  private accent(): number[] { return hsl(this.hue / 360, 0.72, 0.55); }

  // ── Board contract ────────────────────────────────────────────────────────
  get dragging(): boolean { return this.panel.isDragging; }
  autoDrive(): void { /* static unless interacted with */ }

  updateHover(wx: number, wy: number, _scale: number): boolean {
    if (wx < this.x0 - 60 || wx > this.x0 + this.width + 60 || wy < this.y0 - 60 || wy > this.y0 + this.height + 60) {
      this.toolbar.hoveredId = null;
      return false;
    }
    this.toolbar.updateHover(wx, wy);
    if (this.panel.open) this.panel.updateHover(wx, wy);
    return this.toolbar.hoveredId !== null || (this.panel.open && this.panel.hovered >= 0);
  }

  tryBeginDrag(wx: number, wy: number, _scale: number): boolean {
    // The open panel absorbs clicks on itself (toggles + slider drags).
    if (this.panel.open && this.panel.pointerDown(wx, wy)) return true;
    // Toolbar buttons fire on press.
    const tb = this.toolbar.hitTest(wx, wy);
    if (tb) { tb.onClick(); return true; }
    // A click elsewhere closes the popup but is not consumed (the document pans).
    if (this.panel.open) this.panel.hide();
    return false;
  }

  dragTo(wx: number, _wy: number): void { if (this.panel.isDragging) this.panel.drag(wx, _wy); }
  endDrag(): void { this.panel.endDrag(); }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, _view: BoardView): void {
    const x0 = this.x0, y0 = this.y0, x1 = this.x0 + this.width, y1 = this.y0 + this.height;
    const ac = this.accent();

    // Card surface + border.
    addRect(x0, y0, x1, y1, SURFACE, crv, rws, inst);
    addRect(x0, y0, x1, y0 + 1, BORDER, crv, rws, inst);
    addRect(x0, y1 - 1, x1, y1, BORDER, crv, rws, inst);
    addRect(x0, y0, x0 + 1, y1, BORDER, crv, rws, inst);
    addRect(x1 - 1, y0, x1, y1, BORDER, crv, rws, inst);
    // Accent stripe along the top.
    addRect(x0, y0, x1, y0 + 3, ac, crv, rws, inst);

    // Optional dot-grid interior (the grid toggle does something visible).
    if (this.gridOn) {
      const gx0 = x0 + this.pad, gy0 = this.tbY - 6, gx1 = x1 - this.pad, gy1 = y1 - 44;
      for (let gy = gy0; gy <= gy1; gy += 34) {
        for (let gx = gx0; gx <= gx1; gx += 34) {
          addRect(gx - 1, gy - 1, gx + 1, gy + 1, DOT, crv, rws, inst);
        }
      }
    }

    // Title + subtitle.
    layoutStr(inst, 'ANALYTIC HUD', ac, atlas.table, font, { x: x0 + this.pad, y: y0 + this.pad, size: 20 });
    layoutStr(inst, 'Live toolbar + settings panel \u2014 zero DOM, world space. Click the icons; open Settings.', DIM, atlas.table, font, { x: x0 + this.pad, y: y0 + this.pad + 30, size: 12 });

    // Glow behind the toolbar (strength + hue driven by the panel).
    if (this.glowOn && this.glowStrength > 0.01) {
      const g = 10 + 26 * this.glowStrength;
      const a = 0.30 * this.glowStrength;
      const gc: number[] = [ac[0], ac[1], ac[2], a];
      const tw0 = this.toolbar.buttons.length * this.btnS + (this.toolbar.buttons.length - 1) * 14;
      addRect(this.tbX - g, this.tbY - g, this.tbX + tw0 + g, this.tbY + this.btnS + g, gc, crv, rws, inst);
    }

    // The toolbar itself.
    this.toolbar.render(inst, crv, rws, _now);

    // Optional labels under each button.
    if (this.labelsOn) {
      for (const b of this.toolbar.buttons) {
        const lab = b.btn.title;
        const w = tw(lab, font, 10);
        layoutStr(inst, lab, DIM, atlas.table, font, { x: b.x + (b.s - w) / 2, y: b.y + b.s + 6, size: 10 });
      }
    }

    // Status readout line.
    const sy = y1 - 30;
    const dot = (cx: number, on: boolean) => addRect(cx, sy + 3, cx + 8, sy + 11, on ? ac : DIM, crv, rws, inst);
    let sx = x0 + this.pad;
    dot(sx, this.playing); sx += 16;
    layoutStr(inst, this.playing ? 'PLAYING' : 'PAUSED', TEXT, atlas.table, font, { x: sx, y: sy, size: 12 }); sx += tw('PLAYING', font, 12) + 28;
    dot(sx, this.gridOn); sx += 16;
    layoutStr(inst, 'GRID', TEXT, atlas.table, font, { x: sx, y: sy, size: 12 }); sx += tw('GRID', font, 12) + 28;
    dot(sx, this.glowOn); sx += 16;
    layoutStr(inst, 'GLOW ' + this.glowStrength.toFixed(2), TEXT, atlas.table, font, { x: sx, y: sy, size: 12 }); sx += tw('GLOW 0.00', font, 12) + 28;
    layoutStr(inst, 'HUE ' + Math.round(this.hue) + 'deg', ac, atlas.table, font, { x: sx, y: sy, size: 12 });

    // The settings panel draws last (a popup over the board).
    if (this.panel.open) {
      const th: AnalyticPanelTheme = { ...ANALYTIC_PANEL_THEME, accent: ac };
      this.panel.render(font, atlas, inst, crv, rws, th);
    }
  }
}
