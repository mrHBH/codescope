// ── Analytic fps / perf chip (screen-space HUD) ──────────────────────────────
// Zero-DOM replacement for the #fps overlay, drawn through the screen HUD like
// the toolbar. Click cycles three modes — fps only → full readout → full +
// app diagnostics. Two sampling modes, both appending the readout to a log
// 5×/second and copying the growing log so one paste yields every sample:
//   · long press  — records while held, finalizes on release
//   · ctrl+click  — starts/stops recording hands-free (a normal click ends it
//     and copies) — so you can drag/interact while the log captures
// Hit-tested in backing-store px, same convention as the analytic toolbar.

import { addRect, layoutStr, tw } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';

const HOLD_MS = 500;

export class FpsChip {
  /** 0 = fps only · 1 = full readout · 2 = full + diagnostics. */
  mode = 0;
  /** Debug toggle target — hidden chips render nothing and ignore clicks. */
  visible = true;

  private short = '-- fps';
  private full = '';
  private extra = '';
  private rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private pressT = -1;
  private ctrlPress = false;
  private longFired = false;
  private lastCopyT = 0;
  private statusMsg = '';
  private statusT = 0;
  /** Sampling in flight (long press held, or ctrl+click recording). */
  private recording = false;
  // The readout is appended 5×/second and the GROWING log re-copied — one
  // paste yields every sample of the recording.
  private copyLog: string[] = [];

  /** Transient feedback ("copied" / "copy failed") — part of the HUD skip-sig. */
  get status(): string { return this.statusMsg; }

  update(short: string, full: string, extra: string) {
    this.short = short;
    this.full = full;
    this.extra = extra;
  }

  /** Per-frame tick: fire the long press, then while recording append the
   *  readout to the log and re-copy it at 5Hz. (Chromium grants
   *  clipboard-write without re-activation, so the stream sustains; elsewhere
   *  the log may stop growing after the first copy — the status shows the
   *  count either way.) */
  tick(now: number) {
    if (this.pressT >= 0 && !this.ctrlPress && !this.longFired && now - this.pressT > HOLD_MS) {
      this.longFired = true;
      this.recording = true;
      this.copyLog = [this.copyText()];
      this.writeLog();
      this.lastCopyT = now;
    }
    if (this.recording && now - this.lastCopyT >= 200) {
      this.copyLog.push(this.copyText());
      if (this.copyLog.length > 600) this.copyLog.shift(); // cap ~2 min
      this.writeLog();
      this.lastCopyT = now;
    }
    if (this.statusMsg && !this.recording && now - this.statusT > 1200) this.statusMsg = '';
  }

  hitTest(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }

  /** Consumes the press when inside. Ctrl toggles hands-free recording on
   *  down; plain presses resolve on up (click = cycle mode or end recording,
   *  long press = record while held). */
  pointerDown(x: number, y: number, now: number, ctrl = false): boolean {
    if (!this.visible || !this.hitTest(x, y)) return false;
    this.pressT = now;
    this.longFired = false;
    this.ctrlPress = ctrl;
    if (ctrl) {
      if (this.recording) this.stopRecording();
      else {
        this.recording = true;
        this.copyLog = [];
        this.lastCopyT = 0; // first sample on the next tick
        this.statusMsg = 'rec ×0';
        this.statusT = performance.now();
      }
    }
    return true;
  }

  pointerUp(now: number) {
    if (this.pressT < 0) return;
    const held = now - this.pressT;
    const wasCtrl = this.ctrlPress;
    const wasLong = this.longFired;
    this.pressT = -1;
    this.ctrlPress = false;
    this.longFired = false;
    if (wasCtrl) return;                          // toggled on down
    if (wasLong || this.recording) { this.stopRecording(); return; }
    if (held < HOLD_MS) this.mode = (this.mode + 1) % 3;
  }

  private stopRecording() {
    this.recording = false;
    if (this.copyLog.length > 0) this.writeLog();
    this.statusMsg = `recorded ×${this.copyLog.length}`;
    this.statusT = performance.now();
  }

  get pressed(): boolean { return this.pressT >= 0; }

  private copyText(): string {
    return this.extra ? `${this.full}\n${this.extra}` : this.full;
  }

  private writeLog() {
    const text = this.copyLog.join('\n');
    const n = this.copyLog.length;
    const rec = this.recording;
    const mark = (msg: string) => { this.statusMsg = msg; this.statusT = performance.now(); };
    try {
      const p = navigator.clipboard?.writeText(text);
      if (p) p.then(() => mark(rec ? `rec ×${n}` : `copied ×${n}`), () => mark(`copy failed ×${n}`));
      else mark('copy failed');
    } catch {
      mark('copy failed');
    }
  }

  render(inst: number[], crv: number[], rws: number[], font: FontFace, atlas: any, ui: number) {
    if (!this.visible) return;
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
