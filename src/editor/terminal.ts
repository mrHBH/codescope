// ── Terminal ─────────────────────────────────────────────────────────────────
// A TUI terminal rendered through windfoil's analytic pipeline — same world-space
// panel + advance-based glyph emission as the code editor. It maintains a styled
// scrollback buffer, a live input line with a smooth gliding caret, an animated
// boot sequence, and a command interpreter driving a "widget dock".
//
// The dock's widgets (spinner, progress, bar chart, live scrolling graph, matrix
// rain, clock) draw GPU RECTS at fractional sizes with eased motion — sub-cell,
// anti-aliased animation that a character-grid terminal fundamentally can't do.
// Everything animates off the frame clock, so the panel is alive even when idle.

import type { FontFace } from '../windfoil/font';
import type { GlyphAtlas } from '../windfoil/bands';
import { advanceOf } from '../windfoil/font';
import { addRect } from '../layout/metrics';

export interface TerminalTheme {
  bg: number[]; barBg: number[]; barFg: number[];
  text: number[]; dim: number[]; prompt: number[];
  green: number[]; cyan: number[]; yellow: number[]; red: number[]; magenta: number[];
  caret: number[];
}

// A single scrollback line = runs of (text, color).
interface Span { text: string; color: number[]; }
type Line = Span[];

// A live widget occupies the dock region above the prompt and re-renders every
// frame until done. Widgets draw GPU rects at fractional sizes with eased motion
// — sub-cell smoothness a normal character-grid terminal can't do.
export type TerminalCommandHandler = (raw: string, terminal: Terminal) => boolean;

type Widget =
  | { kind: 'spinner'; label: string; start: number; dur: number }
  | { kind: 'progress'; label: string; start: number; dur: number }
  | { kind: 'bars'; title: string; start: number; data: number[]; labels: string[] }
  | { kind: 'clock'; start: number }
  | { kind: 'graph'; start: number; samples: number[]; lastSample: number; title: string }
  | { kind: 'matrix'; start: number; dur: number; cols: number };

// Easing.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class Terminal {
  commandHandler: TerminalCommandHandler | null = null;
  font: FontFace | null = null;
  focused = true;
  showTitleBar = true;

  // World-space geometry
  x0 = 0; y0 = 0;
  fontSize = 18;
  cols = 72;               // visible width in monospace cells
  rows = 30;               // visible height in text rows
  pad = 16;
  get lineHeight() { return this.fontSize * 1.5; }

  // Buffer + input
  private lines: Line[] = [];
  input = '';
  private history: string[] = [];
  private histIdx = -1;
  private cursorCol = 0;

  // Animated typewriter queue: lines revealed char-by-char before the prompt returns.
  private typeQueue: { line: Line; revealed: number; cps: number }[] = [];
  private booting = false;
  private booted = false;
  private widget: Widget | null = null;
  private now = 0;
  // Smooth caret glide: current x eases toward the target x each frame.
  private caretX = -1;
  private caretBlinkPhase = 0;

  private _promptLine: Line | null = null;
  private _body: Line[] = [];
  private _promptInput: Line = [];
  private _caretCol: number[] = [0, 0, 0, 0];
  private _hairlineCol: number[] = [0, 0, 0, 0];

  constructor() { /* boot is deferred until first open() */ }

  // Kick off the boot sequence the first time the terminal is shown.
  open() { if (!this.booted) { this.booted = true; this.booting = true; this.boot(); } }

  // ── Metrics ────────────────────────────────────────────────────────────────
  // PROPORTIONAL, advance-based layout (Lato is not monospace, so a fixed grid
  // looks uneven). Each glyph is placed at its real advance. TUI widgets stay
  // aligned because they use runs of identical characters (same width each).
  private get scale() { return this.font ? this.fontSize / (this.font as any).unitsPerEm : this.fontSize / 2048; }
  private advance(ch: string): number { return this.font ? advanceOf(this.font, ch) * this.scale : this.fontSize * 0.5; }
  // Nominal cell width (space advance) — used only for content sizing + cursor.
  get cellW() { return this.advance(' ') || this.fontSize * 0.28; }
  private lineWidth(line: Line): number {
    let w = 0;
    for (const s of line) for (const ch of s.text) w += this.advance(ch);
    return w;
  }
  get contentW() { return this.pad * 2 + this.cols * this.fontSize * 0.55; }
  get contentH() { return this.pad * 2 + this.rows * this.lineHeight; }

  // ── Public buffer API ──────────────────────────────────────────────────────
  setCommandHandler(handler: TerminalCommandHandler | null) { this.commandHandler = handler; }
  writeLine(text: string, color: number[] = T.text) { this.plain(text, color); }
  // Wipe scrollback + any live widget (the `clear` command and context menu).
  clear() { this.lines = []; this.widget = null; }
  writePairs(parts: { text: string; color?: number[] }[]) { this.push(parts.map((p) => ({ text: p.text, color: p.color ?? T.text }))); }
  runCommand(raw: string) { this.run(raw); }
  private push(line: Line) { this.lines.push(line); if (this.lines.length > 500) this.lines.shift(); }
  private plain(text: string, color: number[]) { this.push([{ text, color }]); }

  private prompt(): Line {
    if (!this._promptLine) {
      this._promptLine = [{ text: 'guest@windfoil', color: T.green }, { text: ':', color: T.dim },
              { text: '~', color: T.cyan }, { text: '$ ', color: T.dim }];
    }
    return this._promptLine;
  }

  // Enqueue a line to be typed out gradually (boot / command output flavor).
  private type(line: Line, cps = 220) { this.typeQueue.push({ line, revealed: 0, cps }); }

  // ── Boot sequence ──────────────────────────────────────────────────────────
  private boot() {
    this.type([{ text: 'windfoil-term', color: T.magenta }, { text: ' v0.1 — analytic GPU terminal', color: T.dim }], 260);
    this.type([{ text: 'booting kernel modules', color: T.text }], 200);
    this.type([{ text: '  [', color: T.dim }, { text: 'ok', color: T.green }, { text: '] glyph atlas', color: T.text }], 400);
    this.type([{ text: '  [', color: T.dim }, { text: 'ok', color: T.green }, { text: '] winding integrator', color: T.text }], 400);
    this.type([{ text: '  [', color: T.dim }, { text: 'ok', color: T.green }, { text: '] one-draw-call compositor', color: T.text }], 400);
    this.type([{ text: 'type ', color: T.dim }, { text: 'help', color: T.yellow }, { text: ' — try ', color: T.dim }, { text: 'graph', color: T.cyan }, { text: ' for a live GPU plot.', color: T.dim }], 260);
    this.type([], 999);
  }

  // ── Command interpreter ─────────────────────────────────────────────────────
  private run(raw: string) {
    const cmd = raw.trim();
    // Echo the entered command after the prompt.
    this.push([...this.prompt(), { text: cmd, color: T.text }]);
    if (!cmd) return;
    this.history.push(cmd); this.histIdx = this.history.length;
    const [name, ...args] = cmd.split(/\s+/);
    if (this.commandHandler?.(cmd, this)) return;
    switch (name.toLowerCase()) {
      case 'help':
        this.plain('commands:', T.dim);
        this.two('help', 'this message');
        this.two('ls / pwd / whoami / date', 'basic shell builtins');
        this.two('echo <text>', 'print text');
        this.two('neofetch', 'system banner');
        this.two('spinner', 'animated spinner demo');
        this.two('progress', 'animated progress bar');
        this.two('chart', 'animated bar chart (TUI)');
        this.two('graph', 'live scrolling signal graph');
        this.two('matrix', 'digital rain burst');
        this.two('clock', 'live clock widget');
        this.two('colors', 'palette swatches');
        this.two('clear', 'clear the screen');
        break;
      case 'ls':
        this.push([{ text: 'README.md  ', color: T.cyan }, { text: 'src/  ', color: T.green }, { text: 'assets/  ', color: T.green }, { text: 'window.wgsl', color: T.cyan }]);
        break;
      case 'pwd':
        this.plain('/home/guest', T.text);
        break;
      case 'whoami':
        this.plain('guest', T.text);
        break;
      case 'date':
        this.plain(new Date().toString(), T.text);
        break;
      case 'echo':
        this.plain(args.join(' '), T.text);
        break;
      case 'neofetch':
        this.neofetch();
        break;
      case 'colors':
        this.colors();
        break;
      case 'spinner':
        this.widget = { kind: 'spinner', label: args.join(' ') || 'working', start: this.now, dur: 3200 };
        break;
      case 'progress':
        this.widget = { kind: 'progress', label: args.join(' ') || 'downloading', start: this.now, dur: 3600 };
        break;
      case 'chart':
        this.widget = { kind: 'bars', title: 'weekly throughput', start: this.now,
          data: [42, 68, 55, 90, 74, 33, 61], labels: ['Mo','Tu','We','Th','Fr','Sa','Su'] };
        break;
      case 'graph':
        this.widget = { kind: 'graph', start: this.now, samples: [], lastSample: 0, title: args.join(' ') || 'live signal (cpu%)' };
        break;
      case 'matrix':
        this.widget = { kind: 'matrix', start: this.now, dur: 4200, cols: Math.min(this.cols, 60) };
        break;
      case 'clock':
        this.widget = { kind: 'clock', start: this.now };
        break;
      case 'clear':
        this.clear();
        break;
      default:
        this.push([{ text: name, color: T.red }, { text: ': command not found', color: T.dim }]);
    }
  }

  private two(a: string, b: string) {
    this.push([{ text: '  ' + a.padEnd(14), color: T.yellow }, { text: b, color: T.dim }]);
  }

  private neofetch() {
    const logo = ['   /\\   ', '  /  \\  ', ' / /\\ \\ ', ' \\ \\/ / ', '  \\  /  ', '   \\/   '];
    const info: Line[] = [
      [{ text: 'os', color: T.cyan }, { text: '     windfoil-os', color: T.text }],
      [{ text: 'render', color: T.cyan }, { text: ' analytic WebGPU', color: T.text }],
      [{ text: 'shell', color: T.cyan }, { text: '  wsh 0.1', color: T.text }],
      [{ text: 'aa', color: T.cyan }, { text: '     zero, at any zoom', color: T.text }],
      [{ text: 'draws', color: T.cyan }, { text: '  1 per frame', color: T.text }],
      [{ text: 'uptime', color: T.cyan }, { text: ' ' + Math.floor(this.now / 1000) + 's', color: T.text }],
    ];
    for (let i = 0; i < logo.length; i++) {
      const l: Line = [{ text: logo[i] + '  ', color: T.magenta }];
      if (info[i]) l.push(...info[i]);
      this.push(l);
    }
  }

  private colors() {
    const sw = (c: number[], n: string): Span[] => [{ text: ' ### ', color: c }, { text: n.padEnd(9), color: T.dim }];
    this.push([...sw(T.green, 'green'), ...sw(T.cyan, 'cyan'), ...sw(T.yellow, 'yellow')]);
    this.push([...sw(T.red, 'red'), ...sw(T.magenta, 'magenta'), ...sw(T.text, 'text')]);
  }

  // ── Input handling (called by terminalInput) ───────────────────────────────
  get busy() { return this.booting || this.typeQueue.length > 0; }

  insert(ch: string) { if (this.busy) return; this.input = this.input.slice(0, this.cursorCol) + ch + this.input.slice(this.cursorCol); this.cursorCol++; }
  backspace() { if (this.busy || this.cursorCol === 0) return; this.input = this.input.slice(0, this.cursorCol - 1) + this.input.slice(this.cursorCol); this.cursorCol--; }
  del() { if (this.busy || this.cursorCol >= this.input.length) return; this.input = this.input.slice(0, this.cursorCol) + this.input.slice(this.cursorCol + 1); }
  left() { if (this.cursorCol > 0) this.cursorCol--; }
  right() { if (this.cursorCol < this.input.length) this.cursorCol++; }
  home() { this.cursorCol = 0; }
  end() { this.cursorCol = this.input.length; }

  // Word boundaries: scan over run of spaces then run of word chars.
  private wordLeft(from: number): number {
    let i = from;
    while (i > 0 && this.input[i - 1] === ' ') i--;
    while (i > 0 && this.input[i - 1] !== ' ') i--;
    return i;
  }
  private wordRight(from: number): number {
    let i = from; const n = this.input.length;
    while (i < n && this.input[i] === ' ') i++;
    while (i < n && this.input[i] !== ' ') i++;
    return i;
  }
  moveWordLeft() { this.cursorCol = this.wordLeft(this.cursorCol); }
  moveWordRight() { this.cursorCol = this.wordRight(this.cursorCol); }
  deleteWordLeft() {
    if (this.busy || this.cursorCol === 0) return;
    const a = this.wordLeft(this.cursorCol);
    this.input = this.input.slice(0, a) + this.input.slice(this.cursorCol);
    this.cursorCol = a;
  }
  deleteWordRight() {
    if (this.busy || this.cursorCol >= this.input.length) return;
    const b = this.wordRight(this.cursorCol);
    this.input = this.input.slice(0, this.cursorCol) + this.input.slice(b);
  }
  enter() {
    if (this.busy) return;
    this.widget = null;
    this.run(this.input);
    this.input = ''; this.cursorCol = 0;
  }
  historyPrev() {
    if (this.busy || !this.history.length) return;
    this.histIdx = Math.max(0, this.histIdx - 1);
    this.input = this.history[this.histIdx] || ''; this.cursorCol = this.input.length;
  }
  historyNext() {
    if (this.busy || !this.history.length) return;
    this.histIdx = Math.min(this.history.length, this.histIdx + 1);
    this.input = this.history[this.histIdx] || ''; this.cursorCol = this.input.length;
  }
  interrupt() { this.widget = null; if (!this.busy) { this.input = ''; this.cursorCol = 0; } }

  // Fully encapsulated keyboard handler. Returns true if the key was consumed.
  // Callers check for Ctrl+` (close terminal) before calling this if they want
  // IDE-level terminal toggle behaviour.
  handleKey(e: KeyboardEvent): boolean {
    const meta = e.ctrlKey || e.metaKey;
    const k = e.key;

    if (meta && k.toLowerCase() === 'c') { this.interrupt(); e.preventDefault(); return true; }
    if (meta && k.toLowerCase() === 'v') {
      if (navigator.clipboard) navigator.clipboard.readText().then((t) => { for (const ch of t.replace(/\s+/g, ' ')) this.insert(ch); }).catch(() => {});
      e.preventDefault(); return true;
    }

    const word = e.ctrlKey || e.altKey;
    if (word) {
      switch (k) {
        case 'Backspace': this.deleteWordLeft(); e.preventDefault(); return true;
        case 'Delete': this.deleteWordRight(); e.preventDefault(); return true;
        case 'ArrowLeft': this.moveWordLeft(); e.preventDefault(); return true;
        case 'ArrowRight': this.moveWordRight(); e.preventDefault(); return true;
      }
    }

    switch (k) {
      case 'Enter': this.enter(); break;
      case 'Backspace': this.backspace(); break;
      case 'Delete': this.del(); break;
      case 'ArrowLeft': this.left(); break;
      case 'ArrowRight': this.right(); break;
      case 'ArrowUp': this.historyPrev(); break;
      case 'ArrowDown': this.historyNext(); break;
      case 'Home': this.home(); break;
      case 'End': this.end(); break;
      case 'Tab': return false;
      case 'Escape': return false;
      default:
        if (k.length === 1 && !meta && !e.altKey) this.insert(k);
        else return false;
    }
    e.preventDefault();
    return true;
  }

  // ── Per-frame update (typewriter + boot completion) ────────────────────────
  private update(now: number, dt: number) {
    this.now = now;
    if (this.typeQueue.length) {
      const head = this.typeQueue[0];
      const total = head.line.reduce((n, s) => n + s.text.length, 0);
      head.revealed += (head.cps * dt) / 1000;
      if (head.revealed >= total || total === 0) {
        this.push(head.line);
        this.typeQueue.shift();
        if (this.typeQueue.length === 0) this.booting = false;
      }
    }
  }

  // Slice a line to `n` revealed characters (for the typewriter head).
  private slice(line: Line, n: number): Line {
    const out: Line = [];
    let left = n;
    for (const s of line) {
      if (left <= 0) break;
      if (s.text.length <= left) { out.push(s); left -= s.text.length; }
      else { out.push({ text: s.text.slice(0, left), color: s.color }); left = 0; }
    }
    return out;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  render(font: FontFace, atlas: GlyphAtlas, inst: number[], crv: number[], rws: number[], now: number, dt: number, th: TerminalTheme, caretW: number) {
    if (!this.font) this.font = font;
    TASSIGN(th);
    this.update(now, dt);

    const lh = this.lineHeight, s = this.scale;
    const W = this.contentW, H = this.contentH;

    // Panel + title bar
    addRect(this.x0, this.y0, this.x0 + W, this.y0 + H, th.bg, crv, rws, inst);
    const barH = this.showTitleBar ? lh + 8 : 0;
    if (this.showTitleBar) {
      addRect(this.x0, this.y0, this.x0 + W, this.y0 + barH, th.barBg, crv, rws, inst);
      // Three "traffic light" dots (drawn as small squares — zero rounded corners).
      const dot = this.fontSize * 0.34, dy = this.y0 + barH / 2 - dot / 2;
      addRect(this.x0 + 14, dy, this.x0 + 14 + dot, dy + dot, th.red, crv, rws, inst);
      addRect(this.x0 + 14 + dot * 2, dy, this.x0 + 14 + dot * 3, dy + dot, th.yellow, crv, rws, inst);
      addRect(this.x0 + 14 + dot * 4, dy, this.x0 + 14 + dot * 5, dy + dot, th.green, crv, rws, inst);
      const title = 'wsh — windfoil shell';
      let titleW = 0;
      for (const ch of title) titleW += this.advance(ch);
      this.emit(inst, atlas, s, title, th.dim, this.x0 + W / 2 - titleW / 2, this.y0 + barH / 2 + this.fontSize * 0.35);
      // Title-bar bottom hairline.
      const hl = this._hairlineCol;
      hl[0] = th.caret[0]; hl[1] = th.caret[1]; hl[2] = th.caret[2]; hl[3] = 0.18;
      addRect(this.x0, this.y0 + barH - 1, this.x0 + W, this.y0 + barH, hl, crv, rws, inst);
    }

    // Reserve a dock for the active widget (drawn with GPU rects). It sits just
    // above the prompt line, like live tool output above your shell prompt.
    const dockRows = this.widget && !this.busy ? this.dockRows(this.widget) : 0;
    const dockH = dockRows * lh;

    // Scrollback + optional typewriter head. The prompt is tracked separately so
    // the dock can slot between scrollback and the prompt.
    const body = this._body;
    body.length = 0;
    for (const l of this.lines) body.push(l);
    let showPrompt = false;
    if (this.typeQueue.length) {
      const head = this.typeQueue[0];
      body.push(this.slice(head.line, Math.floor(head.revealed)));
    } else if (!this.booting) {
      showPrompt = true;
    }

    const startY = this.y0 + barH + this.pad * 0.5;
    const panelBottom = this.y0 + H - this.pad;
    // Rows available for scrollback = total − dock − prompt(1 if shown).
    const totalRows = Math.max(1, Math.floor((panelBottom - startY) / lh));
    const promptRows = showPrompt ? 1 : 0;
    const visRows = Math.max(1, totalRows - dockRows - promptRows);
    const shownStart = Math.max(0, body.length - visRows);
    const left = this.x0 + this.pad;

    let row = 0;
    for (let si = shownStart; si < body.length; si++) {
      const line = body[si];
      const baseline = startY + row * lh + this.fontSize * 0.95;
      let cx = left;
      for (const span of line) for (const ch of span.text) cx += this.emitAt(inst, atlas, s, ch, span.color, cx, baseline);
      row++;
    }

    // Widget dock (GPU-rect graphics, eased, sub-cell smooth) — between scrollback
    // and the prompt.
    if (dockRows > 0) {
      const dockTop = startY + row * lh;
      this.renderWidget(inst, atlas, crv, rws, s, now, dt, th, left, dockTop, W - this.pad * 2, dockH);
      row += dockRows;
    }

    // Prompt line last.
    const promptRow = row;
    if (showPrompt) {
      const pl = this._promptInput;
      const pr = this.prompt();
      pl.length = 0;
      for (const sp of pr) pl.push(sp);
      pl.push({ text: this.input, color: th.text });
      const baseline = startY + row * lh + this.fontSize * 0.95;
      let cx = left;
      for (const span of pl) for (const ch of span.text) cx += this.emitAt(inst, atlas, s, ch, span.color, cx, baseline);
      row++;
    }

    // Smooth thin caret on the prompt line (glides to target, soft blink).
    // Vertically centered on the glyph band (baseline sits at fontSize*0.95 below
    // the row top; the visual glyph box spans roughly [-0.72fs, +0.12fs] around it).
    if (showPrompt && this.focused) {
      const rowTop = startY + promptRow * lh;
      const baseline = rowTop + this.fontSize * 0.95;
      let targetX = left + this.lineWidth(this.prompt());
      for (let i = 0; i < this.cursorCol && i < this.input.length; i++) targetX += this.advance(this.input[i]);
      // Ease the caret toward its target; snap on first placement.
      if (this.caretX < 0) this.caretX = targetX;
      else this.caretX += (targetX - this.caretX) * (1 - Math.pow(0.001, dt / 1000));
      // Soft sinusoidal blink; reset to fully-on right after a move so it's visible.
      const moved = Math.abs(targetX - this.caretX) > 0.5;
      this.caretBlinkPhase = moved ? 0 : this.caretBlinkPhase + dt;
      const alpha = moved ? 1 : 0.55 + 0.45 * Math.cos(this.caretBlinkPhase / 530 * Math.PI);
      const cwid = Math.max(caretW, this.fontSize * 0.11);
      const top = baseline - this.fontSize * 0.82, bot = baseline + this.fontSize * 0.16;
      // Center the bar on the boundary so it doesn't crowd the next glyph.
      const cx = this.caretX - cwid / 2;
      const cc = this._caretCol;
      cc[0] = th.caret[0]; cc[1] = th.caret[1]; cc[2] = th.caret[2]; cc[3] = alpha;
      addRect(cx, top, cx + cwid, bot, cc, crv, rws, inst);
    }

    // Widget dock (GPU-rect graphics, eased, sub-cell smooth) — directly below
    // the last text row.
    if (dockRows > 0) {
      const dockTop = startY + (body.length - shownStart) * lh;
      this.renderWidget(inst, atlas, crv, rws, s, now, dt, th,
        left, dockTop, W - this.pad * 2, dockH);
    }
  }

  // Emit one glyph at world x, returning its advance so callers can walk.
  private emitAt(inst: number[], atlas: GlyphAtlas, s: number, ch: string, color: number[], x: number, baseline: number): number {
    const adv = this.advance(ch);
    if (ch !== ' ') {
      const gl = atlas.table[ch];
      if (gl) inst.push(x, baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.bandH, gl.invH);
    }
    return adv;
  }

  // Proportional text run; advances by each glyph's real width.
  private emit(inst: number[], atlas: GlyphAtlas, s: number, text: string, color: number[], x: number, baseline: number) {
    let cx = x;
    for (const ch of text) cx += this.emitAt(inst, atlas, s, ch, color, cx, baseline);
  }

  // A thick line segment approximated by short vertical bars (addRect is axis-
  // aligned only). Thin enough to read as a continuous anti-aliased line.
  private segment(inst: number[], crv: number[], rws: number[], x0: number, y0: number, x1: number, y1: number, thick: number, c: number[]) {
    const dx = x1 - x0;
    const steps = Math.max(1, Math.ceil(Math.abs(dx)));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const px = x0 + dx * f;
      const py = y0 + (y1 - y0) * f;
      addRect(px - thick / 2, py - thick / 2, px + thick / 2, py + thick / 2, c, crv, rws, inst);
    }
  }

  // Rows of dock height each widget needs.
  private dockRows(w: Widget): number {
    switch (w.kind) {
      case 'spinner': return 1;
      case 'progress': return 2;
      case 'clock': return 1;
      case 'bars': return w.data.length + 1;
      case 'graph': return 6;
      case 'matrix': return 6;
    }
  }

  // ── Widget dock renderer (GPU rects, eased, sub-cell smooth) ────────────────
  private renderWidget(inst: number[], atlas: GlyphAtlas, crv: number[], rws: number[], s: number,
                       now: number, dt: number, th: TerminalTheme,
                       x: number, y: number, w: number, h: number) {
    const wg = this.widget!;
    const t = now - wg.start;
    const lh = this.lineHeight;
    const base = (row: number) => y + row * lh + this.fontSize * 0.95;
    const bar = (bx: number, by: number, bw: number, bh: number, c: number[]) => addRect(bx, by, bx + bw, by + bh, c, crv, rws, inst);

    switch (wg.kind) {
      case 'spinner': {
        if (t >= wg.dur) { this.emit(inst, atlas, s, '[ok] ' + wg.label + ' complete', th.green, x, base(0)); this.widget = null; return; }
        // Smooth rotating arc: a dot orbiting a small ring.
        const cx = x + this.fontSize * 0.5, cy = y + lh * 0.5, R = this.fontSize * 0.42;
        const ang = (now / 320) * Math.PI * 2;
        for (let k = 0; k < 8; k++) {
          const a = ang - k * 0.5;
          const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
          const d = this.fontSize * (0.16 - k * 0.015);
          const al = 1 - k / 8;
          if (d > 0) bar(px - d / 2, py - d / 2, d, d, [th.cyan[0], th.cyan[1], th.cyan[2], al]);
        }
        this.emit(inst, atlas, s, wg.label + '...', th.text, x + this.fontSize * 1.4, base(0));
        return;
      }
      case 'progress': {
        const p = easeOutCubic(t / wg.dur);
        const trackW = Math.min(w * 0.7, this.fontSize * 22);
        const by = y + lh * 0.28, bh = this.fontSize * 0.5;
        bar(x, by, trackW, bh, th.barBg);                                   // track
        bar(x, by, trackW * p, bh, th.green);                              // smooth fill
        // Moving sheen on the leading edge.
        const sheen = 0.6 + 0.4 * Math.sin(now / 180);
        if (p < 1) bar(x + trackW * p - this.fontSize * 0.12, by, this.fontSize * 0.12, bh, [1, 1, 1, 0.5 * sheen]);
        this.emit(inst, atlas, s, (p * 100).toFixed(0) + '%', th.yellow, x + trackW + this.fontSize * 0.6, base(0));
        this.emit(inst, atlas, s, wg.label, th.dim, x, base(1) - lh * 0.05);
        if (t >= wg.dur + 400) this.widget = null;
        return;
      }
      case 'bars': {
        this.emit(inst, atlas, s, wg.title, th.magenta, x, base(0));
        const labelW = this.fontSize * 2.2;
        const trackW = Math.min(w - labelW - this.fontSize * 3, this.fontSize * 20);
        for (let i = 0; i < wg.data.length; i++) {
          const grow = easeOutCubic((t - i * 90) / 700);
          const v = wg.data[i] * grow;
          const by = base(i + 1) - this.fontSize * 0.8, bh = this.fontSize * 0.7;
          this.emit(inst, atlas, s, wg.labels[i], th.dim, x, base(i + 1));
          const bw = (v / 100) * trackW;
          bar(x + labelW, by, trackW, bh, th.barBg);
          bar(x + labelW, by, bw, bh, i % 2 ? th.cyan : th.green);
          this.emit(inst, atlas, s, String(Math.round(v)), th.dim, x + labelW + trackW + this.fontSize * 0.4, base(i + 1));
        }
        return;
      }
      case 'graph': {
        // Live scrolling line/area graph — impossible on a character grid.
        if (now - wg.lastSample > 50) {
          wg.lastSample = now;
          const sig = 50 + 30 * Math.sin(now / 700) + 12 * Math.sin(now / 190) + (Math.random() - 0.5) * 10;
          wg.samples.push(Math.max(2, Math.min(98, sig)));
          const maxN = 160; if (wg.samples.length > maxN) wg.samples.shift();
        }
        this.emit(inst, atlas, s, wg.title, th.magenta, x, base(0));
        // Row grid: title=0, plot=rows 1..4, hint=row 5 (dockRows=6).
        const gx = x, gy = y + lh, gw = Math.min(w - this.fontSize * 3, this.fontSize * 26), gh = 4 * lh - this.fontSize * 0.4;
        bar(gx, gy, gw, gh, th.barBg);
        // Gridlines at 25/50/75% with faint labels.
        for (const q of [0.25, 0.5, 0.75]) {
          const yy = gy + gh * (1 - q);
          bar(gx, yy, gw, 1, [th.dim[0], th.dim[1], th.dim[2], 0.25]);
        }
        const n = wg.samples.length;
        if (n > 1) {
          const stepX = gw / (n - 1);
          const yOf = (v: number) => gy + gh - (v / 100) * gh;
          // Area fill (fractional-height columns) + a bright connected top line.
          for (let i = 0; i < n; i++) {
            const colX = gx + i * stepX;
            const colH = gy + gh - yOf(wg.samples[i]);
            const alpha = 0.10 + 0.30 * (i / n);
            bar(colX, gy + gh - colH, Math.max(stepX, 1.1), colH, [th.cyan[0], th.cyan[1], th.cyan[2], alpha]);
          }
          // Connected line: thin quads between consecutive sample points.
          for (let i = 1; i < n; i++) {
            const x0 = gx + (i - 1) * stepX, y0 = yOf(wg.samples[i - 1]);
            const x1 = gx + i * stepX, y1 = yOf(wg.samples[i]);
            this.segment(inst, crv, rws, x0, y0, x1, y1, this.fontSize * 0.12, th.cyan);
          }
          // Bright leading tip + readout.
          const tipY = yOf(wg.samples[n - 1]);
          const d = this.fontSize * 0.28;
          bar(gx + gw - d / 2, tipY - d / 2, d, d, th.green);
          const cur = Math.round(wg.samples[n - 1]);
          this.emit(inst, atlas, s, cur + '%', th.green, gx + gw + this.fontSize * 0.4, tipY + this.fontSize * 0.35);
        }
        this.emit(inst, atlas, s, 'ctrl-c to stop', th.dim, gx, base(5));
        return;
      }
      case 'matrix': {
        if (t >= wg.dur) { this.widget = null; return; }
        const cell = this.fontSize * 0.72;
        const cols = Math.min(wg.cols, Math.floor(w / cell));
        const rows = 5;
        const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
        for (let c = 0; c < cols; c++) {
          const head = ((now / 90 + Math.sin(c * 3.1) * 4 + c * 1.3) % (rows + 3));
          for (let r = 0; r < rows; r++) {
            const dist = head - r;
            if (dist < 0 || dist > rows) continue;
            const al = Math.max(0, 1 - dist / rows);
            const gi = Math.floor(Math.abs(Math.sin(c * 7.7 + r * 3.3 + Math.floor(now / 110))) * glyphs.length) % glyphs.length;
            const col = dist < 0.6 ? th.text : th.green;
            this.emitAt(inst, atlas, s, glyphs[gi], [col[0], col[1], col[2], al], x + c * cell, base(r));
          }
        }
        return;
      }
      case 'clock': {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        const blink = (now % 1000) < 500 ? ':' : ' ';
        this.emit(inst, atlas, s, hh + blink + mm + blink + ss, th.cyan, x, base(0));
        this.emit(inst, atlas, s, 'ctrl-c to stop', th.dim, x + this.fontSize * 6, base(0));
        return;
      }
    }
    void dt;
  }
}

// Module-level theme cache so widget helpers can reference colors without
// threading `th` through every call. Assigned at the top of render().
let T: TerminalTheme = {
  bg: [0, 0, 0, 1], barBg: [0, 0, 0, 1], barFg: [1, 1, 1, 1],
  text: [1, 1, 1, 1], dim: [.5, .5, .5, 1], prompt: [1, 1, 1, 1],
  green: [.25, .73, .31, 1], cyan: [.33, .85, 1, 1], yellow: [.94, .68, .3, 1],
  red: [.85, .33, .31, 1], magenta: [.62, .31, .87, 1], caret: [1, 1, 1, 1],
};
function TASSIGN(th: TerminalTheme) { T = th; }


