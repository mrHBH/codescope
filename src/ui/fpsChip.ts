// ── Analytic fps / perf chip (screen-space HUD) ──────────────────────────────
// Zero-DOM replacement for the #fps overlay, drawn through the screen HUD like
// the toolbar. Click cycles three modes — fps only → full readout → full +
// app diagnostics (s.hudDebugExtra) — and a long press copies the content.
// Hit-tested in backing-store px, same convention as the analytic toolbar.

import { addRect, layoutStr, tw } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';

const HOLD_MS = 500;

export class FpsChip {
  /** 0 = fps only · 1 = full readout · 2 = full + diagnostics. */
  mode = 0;

  private short = '-- fps';
  private full = '';
  private extra = '';
  private rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private pressT = -1;
  private longFired = false;
  private statusMsg = '';
  private statusT = 0;

  /** Transient feedback ("copied" / "copy failed") — part of the HUD skip-sig. */
  get status(): string { return this.statusMsg; }

  update(short: string, full: string, extra: string) {
    this.short = short;
    this.full = full;
    this.extra = extra;
  }

  /** Per-frame tick: fires the long-press copy once, clears transient status. */
  tick(now: number) {
    if (this.pressT >= 0 && !this.longFired && now - this.pressT > HOLD_MS) {
      this.longFired = true;
      this.copy();
    }
    if (this.statusMsg && now - this.statusT > 1200) this.statusMsg = '';
  }

  hitTest(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }

  /** Consumes the press when inside (click vs long-press resolved later). */
  pointerDown(x: number, y: number, now: number): boolean {
    if (!this.hitTest(x, y)) return false;
    this.pressT = now;
    this.longFired = false;
    return true;
  }

  pointerUp(now: number) {
    if (this.pressT < 0) return;
    const held = now - this.pressT;
    this.pressT = -1;
    if (!this.longFired && held < HOLD_MS) this.mode = (this.mode + 1) % 3;
    this.longFired = false;
  }

  get pressed(): boolean { return this.pressT >= 0; }

  private copy() {
    const text = this.extra ? `${this.full}\n${this.extra}` : this.full;
    const mark = (msg: string) => { this.statusMsg = msg; this.statusT = performance.now(); };
    try {
      const p = navigator.clipboard?.writeText(text);
      if (p) p.then(() => mark('copied'), () => mark('copy failed'));
      else mark('copy failed');
    } catch {
      mark('copy failed');
    }
  }

  render(inst: number[], crv: number[], rws: number[], font: FontFace, atlas: any, ui: number) {
    const ds = 12 * ui, m = 10 * ui, padX = 10 * ui, padY = 6 * ui, lineH = ds * 1.4;
    const lines: string[] = this.mode === 0 ? [this.short]
      : this.mode === 1 ? [this.full]
      : (this.extra ? [this.full, this.extra] : [this.full]);
    if (this.status) lines[lines.length - 1] += `   ·   ${this.status}`;
    let w = 0;
    for (const l of lines) w = Math.max(w, tw(l, font, ds));
    const rw = w + padX * 2;
    const rh = padY * 2 + lines.length * lineH - (lineH - ds);
    const x0 = m, y0 = m;
    this.rect = { x0, y0, x1: x0 + rw, y1: y0 + rh };
    addRect(x0, y0, x0 + rw, y0 + rh, this.pressed ? [0.11, 0.11, 0.15, 0.94] : [0.055, 0.055, 0.071, 0.9], crv, rws, inst);
    addRect(x0, y0, x0 + rw, y0 + 1, [0.30, 0.33, 0.42, 0.6], crv, rws, inst);
    for (let i = 0; i < lines.length; i++) {
      layoutStr(inst, lines[i], [0.69, 0.706, 0.753, 1], atlas.table, font, { x: x0 + padX, y: y0 + padY + i * lineH, size: ds });
    }
  }
}
