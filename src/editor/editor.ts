// ── Code editor ──────────────────────────────────────────────────────────────
// A line-based, viewport-culled code editor that renders through windfoil's
// analytic pipeline. It lives in WORLD space (like a page), so the existing
// camera gives infinite-zoom + pan-scroll for free.
//
// Layout is ADVANCE-BASED (proportional): the shipped font (Lato) is not
// monospace, so every glyph is positioned by its real advance width. Caret,
// selection, hit-testing, and vertical movement all measure through the same
// cached per-line x-offset table, so columns stay perfectly aligned with the ink.
// Tabs advance to the next tab stop (measured in space-widths). Line numbers use
// the digit advance (Lato digits are tabular, so they align).

import type { FontFace } from '../windfoil/font';
import { advanceOf } from '../windfoil/font';
import { addRect } from '../layout/metrics';
import { TextDocument, type Pos, type Range, posMin, posMax, clonePos } from './document';
import { Highlighter } from './highlight';

export interface EditorTheme {
  bg: number[]; gutterBg: number[]; gutterFg: number[]; curLineFg: number[];
  text: number[]; caret: number[]; sel: number[]; curLineBg: number[];
}

const TAB = 2;

export class CodeEditor {
  doc: TextDocument;
  hl = new Highlighter();
  cursor: Pos = { line: 0, col: 0 };
  anchor: Pos | null = null;    // selection anchor (null = no selection)
  desiredX = 0;                  // sticky x (world px, rel. to textLeft) for vertical moves
  focused = true;
  font: FontFace | null = null;  // set once by main.ts; drives all metrics

  // World-space geometry
  x0 = 0; y0 = 0;
  fontSize = 20;
  get lineHeight() { return this.fontSize * 1.5; }
  gutterPad = 14;
  textPad = 16;

  // Per-line cumulative x-offset cache (rel. to textLeft), invalidated by version.
  private offsetCache = new Map<number, number[]>();
  private offsetVersion = -1;

  constructor(text: string) { this.doc = new TextDocument(text); }

  private get scale() { return this.font ? this.fontSize / (this.font as any).unitsPerEm : this.fontSize / 2048; }
  private advance(ch: string): number { return this.font ? advanceOf(this.font, ch) * this.scale : this.fontSize * 0.5; }
  private get spaceW(): number { return this.advance(' ') || this.fontSize * 0.3; }
  private get tabW(): number { return this.spaceW * TAB; }
  private get digitW(): number { return this.advance('0') || this.fontSize * 0.55; }

  // ── Geometry ───────────────────────────────────────────────────────────────
  get gutterW(): number {
    const digits = Math.max(2, String(this.doc.lineCount).length);
    return this.gutterPad * 2 + digits * this.digitW;
  }
  get textLeft(): number { return this.x0 + this.gutterW + this.textPad; }
  contentHeight(): number { return this.doc.lineCount * this.lineHeight + this.lineHeight; }
  contentWidth(): number {
    let max = 0;
    for (let i = 0; i < this.doc.lineCount; i++) {
      const off = this.xOffsets(i);
      max = Math.max(max, off[off.length - 1]);
    }
    return this.gutterW + this.textPad * 2 + max;
  }

  // Cumulative x-offset (rel. to textLeft) for each character boundary [0..len].
  private xOffsets(line: number): number[] {
    if (this.offsetVersion !== this.doc.version) { this.offsetCache.clear(); this.offsetVersion = this.doc.version; }
    const cached = this.offsetCache.get(line);
    if (cached) return cached;
    const text = this.doc.lineText(line);
    const off = new Array(text.length + 1);
    let x = 0;
    for (let i = 0; i < text.length; i++) {
      off[i] = x;
      const ch = text[i];
      if (ch === '\t') x = (Math.floor(x / this.tabW) + 1) * this.tabW;
      else x += this.advance(ch);
    }
    off[text.length] = x;
    this.offsetCache.set(line, off);
    return off;
  }

  lineTop(line: number): number { return this.y0 + line * this.lineHeight; }
  colToX(line: number, col: number): number {
    const off = this.xOffsets(line);
    return this.textLeft + off[Math.max(0, Math.min(col, off.length - 1))];
  }

  posToWorld(p: Pos): { x: number; y: number } { return { x: this.colToX(p.line, p.col), y: this.lineTop(p.line) }; }

  worldToPos(wx: number, wy: number): Pos {
    let line = Math.floor((wy - this.y0) / this.lineHeight);
    line = Math.max(0, Math.min(line, this.doc.lineCount - 1));
    const off = this.xOffsets(line);
    const target = wx - this.textLeft;
    // Nearest character boundary to the click x.
    let col = off.length - 1;
    for (let i = 0; i < off.length - 1; i++) {
      if (target < (off[i] + off[i + 1]) / 2) { col = i; break; }
    }
    return { line, col };
  }

  // ── Selection helpers ────────────────────────────────────────────────────
  hasSelection(): boolean { return this.anchor !== null && !(this.anchor.line === this.cursor.line && this.anchor.col === this.cursor.col); }
  selectionRange(): Range | null {
    if (!this.hasSelection()) return null;
    return { start: posMin(this.anchor!, this.cursor), end: posMax(this.anchor!, this.cursor) };
  }
  selectedText(): string { const r = this.selectionRange(); return r ? this.doc.textInRange(r) : ''; }

  private setCursor(p: Pos, extend: boolean) {
    if (extend) { if (this.anchor === null) this.anchor = clonePos(this.cursor); }
    else this.anchor = null;
    this.cursor = this.doc.clampPos(p);
  }

  // ── Editing ────────────────────────────────────────────────────────────────
  private deleteSelectionInternal(): boolean {
    const r = this.selectionRange();
    if (!r) return false;
    const end = this.doc.delete(r, this.cursor);
    this.hl.invalidateFrom(r.start.line);
    this.cursor = end; this.anchor = null;
    return true;
  }

  // Sticky-x helper: world x of the cursor relative to textLeft.
  private cursorX(): number { return this.colToX(this.cursor.line, this.cursor.col) - this.textLeft; }
  // Nearest column on `line` to a target x (rel. to textLeft).
  private xToCol(line: number, x: number): number {
    const off = this.xOffsets(line);
    let col = off.length - 1;
    for (let i = 0; i < off.length - 1; i++) { if (x < (off[i] + off[i + 1]) / 2) { col = i; break; } }
    return col;
  }

  insertText(text: string) {
    if (this.hasSelection()) this.deleteSelectionInternal();
    const end = this.doc.insert(this.cursor, text, this.cursor);
    this.hl.invalidateFrom(this.cursor.line);
    this.cursor = end; this.anchor = null;
    this.desiredX = this.cursorX();
  }

  newline() {
    // Auto-indent: copy leading whitespace of the current line.
    const line = this.doc.lineText(this.cursor.line);
    const indent = (line.match(/^[ \t]*/) || [''])[0].slice(0, this.cursor.col);
    this.insertText('\n' + indent);
  }

  indent() { this.insertText(' '.repeat(TAB)); }

  backspace() {
    if (this.deleteSelectionInternal()) return;
    const { line, col } = this.cursor;
    if (col > 0) {
      this.cursor = this.doc.delete({ start: { line, col: col - 1 }, end: { line, col } }, this.cursor);
    } else if (line > 0) {
      const prevLen = this.doc.lineLen(line - 1);
      this.cursor = this.doc.delete({ start: { line: line - 1, col: prevLen }, end: { line, col: 0 } }, this.cursor);
    }
    this.hl.invalidateFrom(this.cursor.line);
    this.desiredX = this.cursorX();
  }

  del() {
    if (this.deleteSelectionInternal()) return;
    const { line, col } = this.cursor;
    if (col < this.doc.lineLen(line)) {
      this.doc.delete({ start: { line, col }, end: { line, col: col + 1 } }, this.cursor);
    } else if (line < this.doc.lineCount - 1) {
      this.doc.delete({ start: { line, col }, end: { line: line + 1, col: 0 } }, this.cursor);
    }
    this.hl.invalidateFrom(line);
  }

  undo() { const p = this.doc.undo(); if (p) { this.cursor = this.doc.clampPos(p); this.anchor = null; this.hl.invalidateFrom(0); } }
  redo() { const p = this.doc.redo(); if (p) { this.cursor = this.doc.clampPos(p); this.anchor = null; this.hl.invalidateFrom(0); } }

  // ── Cursor movement ──────────────────────────────────────────────────────
  moveLeft(extend: boolean) {
    if (this.hasSelection() && !extend) { this.cursor = posMin(this.anchor!, this.cursor); this.anchor = null; }
    else {
      let { line, col } = this.cursor;
      if (col > 0) col--; else if (line > 0) { line--; col = this.doc.lineLen(line); }
      this.setCursor({ line, col }, extend);
    }
    this.desiredX = this.cursorX();
  }
  moveRight(extend: boolean) {
    if (this.hasSelection() && !extend) { this.cursor = posMax(this.anchor!, this.cursor); this.anchor = null; }
    else {
      let { line, col } = this.cursor;
      if (col < this.doc.lineLen(line)) col++; else if (line < this.doc.lineCount - 1) { line++; col = 0; }
      this.setCursor({ line, col }, extend);
    }
    this.desiredX = this.cursorX();
  }
  moveVert(dir: number, extend: boolean) {
    const line = this.cursor.line + dir;
    if (line < 0 || line >= this.doc.lineCount) return;
    const col = this.xToCol(line, this.desiredX);
    this.setCursor({ line, col }, extend);
  }
  moveHome(extend: boolean) {
    const text = this.doc.lineText(this.cursor.line);
    const firstNW = text.length - text.replace(/^[ \t]+/, '').length;
    const col = this.cursor.col === firstNW ? 0 : firstNW;
    this.setCursor({ line: this.cursor.line, col }, extend);
    this.desiredX = this.cursorX();
  }
  moveEnd(extend: boolean) {
    const col = this.doc.lineLen(this.cursor.line);
    this.setCursor({ line: this.cursor.line, col }, extend);
    this.desiredX = this.cursorX();
  }
  moveDocStart(extend: boolean) { this.setCursor({ line: 0, col: 0 }, extend); this.desiredX = 0; }
  moveDocEnd(extend: boolean) { this.setCursor(this.doc.end(), extend); this.desiredX = this.cursorX(); }
  selectAll() { this.anchor = { line: 0, col: 0 }; this.cursor = this.doc.end(); }

  // Multi-click selection (VS Code-style). Double-click selects the syntax
  // token under the point (string, keyword, number, comment run…) via the
  // highlighter, falling back to a word/punctuation run where the line has no
  // token coverage; triple-click selects the whole line (including its
  // newline); callers escalate to selectAll() on the fourth click.
  selectTokenAt(wx: number, wy: number) {
    const p = this.worldToPos(wx, wy);
    const text = this.doc.lineText(p.line);
    const tk = this.hl.tokensFor(this.doc.lines, p.line)
      .find((t) => t.end > t.start && p.col >= t.start && p.col < t.end);
    let a: number, b: number;
    if (tk) { a = tk.start; b = tk.end; }
    else {
      // Character classes: word > whitespace > punctuation. A run of the
      // point's class is selected; a single punct char selects just itself.
      const cls = (c: string) => /[\w$]/.test(c) ? 2 : /\s/.test(c) ? 1 : 0;
      const k = cls(text[p.col] ?? '');
      a = p.col; b = p.col;
      if (k === 2 || k === 1) {
        while (a > 0 && cls(text[a - 1]) === k) a--;
        while (b < text.length && cls(text[b]) === k) b++;
      } else if (p.col < text.length) b = p.col + 1;
    }
    this.anchor = { line: p.line, col: a };
    this.cursor = { line: p.line, col: b };
    this.desiredX = this.cursorX();
  }

  selectLineAt(wy: number) {
    let line = Math.floor((wy - this.y0) / this.lineHeight);
    line = Math.max(0, Math.min(line, this.doc.lineCount - 1));
    this.anchor = { line, col: 0 };
    this.cursor = line + 1 < this.doc.lineCount
      ? { line: line + 1, col: 0 }
      : { line, col: this.doc.lineLen(line) };
    this.desiredX = 0;
  }

  placeCursor(wx: number, wy: number, extend: boolean) {
    this.setCursor(this.worldToPos(wx, wy), extend);
    this.desiredX = this.cursorX();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  // Pushes instances for: panel bg, current-line highlight, selection, gutter,
  // line numbers, syntax-colored glyphs, and the caret. Only lines within
  // [worldTop, worldBottom] are laid out.
  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[],
         worldTop: number, worldBottom: number, now: number, th: EditorTheme, caretW: number) {
    if (!this.font) this.font = font;
    const lh = this.lineHeight, s = this.fontSize / (font as any).unitsPerEm;
    const totalH = this.contentHeight(), totalW = Math.max(this.contentWidth(), 600);

    // Panel + gutter backgrounds (whole editor).
    addRect(this.x0, this.y0, this.x0 + totalW, this.y0 + totalH, th.bg, crv, rws, inst);
    addRect(this.x0, this.y0, this.x0 + this.gutterW, this.y0 + totalH, th.gutterBg, crv, rws, inst);

    const first = Math.max(0, Math.floor((worldTop - this.y0) / lh) - 1);
    const last = Math.min(this.doc.lineCount - 1, Math.ceil((worldBottom - this.y0) / lh) + 1);

    const sel = this.selectionRange();
    const textRight = this.x0 + totalW;

    for (let i = first; i <= last; i++) {
      const top = this.lineTop(i);
      const text = this.doc.lineText(i);
      const off = this.xOffsets(i);

      // Current-line highlight
      if (this.focused && i === this.cursor.line && !this.hasSelection()) {
        addRect(this.textLeft - this.textPad, top, textRight, top + lh, th.curLineBg, crv, rws, inst);
      }

      // Selection band(s) for this line
      if (sel && i >= sel.start.line && i <= sel.end.line) {
        const startCol = i === sel.start.line ? sel.start.col : 0;
        const endCol = i === sel.end.line ? sel.end.col : text.length;
        const xs = this.colToX(i, startCol);
        let xe = this.colToX(i, endCol);
        if (i < sel.end.line) xe += this.spaceW * 0.5; // show trailing newline selected
        addRect(xs, top, Math.max(xe, xs + 1), top + lh, th.sel, crv, rws, inst);
      }

      // Line number (right-aligned in gutter), dim unless current line
      const num = String(i + 1);
      const numColor = i === this.cursor.line ? th.curLineFg : th.gutterFg;
      const numX = this.x0 + this.gutterW - this.gutterPad - num.length * this.digitW;
      const baseline = top + this.fontSize * 0.9;
      this.emitDigits(inst, num, numColor, atlas, numX, baseline, s);

      // Syntax-colored glyphs, positioned by real advance (off[] is per-char x).
      const tokens = this.hl.tokensFor(this.doc.lines, i);
      const emitSlice = (from: number, to: number, color: number[]) => {
        for (let c = from; c < to; c++) {
          const ch = text[c];
          if (ch === ' ' || ch === '\t') continue;
          const gl = atlas.table[ch];
          if (gl) inst.push(this.textLeft + off[c], baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.bandH, gl.invH);
        }
      };
      let cursorCol = 0;
      for (const tk of tokens) {
        if (tk.start > cursorCol) emitSlice(cursorCol, tk.start, th.text);
        emitSlice(tk.start, tk.end, tk.color);
        cursorCol = tk.end;
      }
      if (cursorCol < text.length) emitSlice(cursorCol, text.length, th.text);

      // Caret — full line height, thickness scales with font size (min the
      // passed-in screen-space width so it stays visible when zoomed out).
      if (this.focused && i === this.cursor.line && (now % 1060) < 530) {
        const cx = this.colToX(i, this.cursor.col);
        const cw = Math.max(caretW, this.fontSize * 0.12);
        addRect(cx, top, cx + cw, top + lh, th.caret, crv, rws, inst);
      }
    }
  }

  // Net {} () [] depth change of a line, ignoring brackets inside strings, line
  // comments, and (tracked across lines via `inBlock`) block comments.
  private static bracketDelta(line: string, inBlock: boolean): { delta: number; inBlock: boolean } {
    let delta = 0;
    let inStr: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
      if (c === '/' && n === '/') break;
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{' || c === '(' || c === '[') delta++;
      else if (c === '}' || c === ')' || c === ']') delta--;
    }
    return { delta, inBlock };
  }

  // Re-indent the whole document: two spaces per open-bracket depth, lines that
  // open with a closer dedent one level first. Applied as ONE undoable replace.
  formatDocument() {
    const src = this.doc.toString();
    const out: string[] = [];
    let depth = 0, inBlock = false;
    for (const raw of src.split('\n')) {
      const body = raw.trim();
      if (body) {
        const closer = body[0] === '}' || body[0] === ')' || body[0] === ']' ? 1 : 0;
        out.push('  '.repeat(Math.max(0, depth - closer)) + body);
      } else out.push('');
      const r = CodeEditor.bracketDelta(body, inBlock);
      depth = Math.max(0, depth + r.delta);
      inBlock = r.inBlock;
    }
    const text = out.join('\n');
    if (text === src) return;
    this.doc.replace({ start: { line: 0, col: 0 }, end: this.doc.end() }, text, this.cursor);
    this.cursor = this.doc.clampPos(this.cursor);
    this.anchor = null;
    this.hl.invalidateFrom(0);
  }

  // Toggle `// ` on the cursor line, or every line a selection spans.
  toggleComment() {
    const r = this.selectionRange();
    const l0 = r ? r.start.line : this.cursor.line;
    const l1 = r ? r.end.line : this.cursor.line;
    const lines: string[] = [];
    for (let i = l0; i <= l1; i++) lines.push(this.doc.lineText(i));
    const allCommented = lines.every((t) => t.trim() === '' || t.trim().startsWith('//'));
    const out = lines.map((t) => {
      if (t.trim() === '') return t;
      if (allCommented) {
        const i = t.indexOf('//');
        return t.slice(0, i) + t.slice(i + 2).replace(/^ /, '');
      }
      const indent = (t.match(/^[ \t]*/) || [''])[0];
      return indent + '// ' + t.slice(indent.length);
    });
    this.doc.replace({ start: { line: l0, col: 0 }, end: { line: l1, col: this.doc.lineLen(l1) } }, out.join('\n'), this.cursor);
    this.hl.invalidateFrom(l0);
  }

  // Tabular digit run (line numbers): fixed digit-width cells so numbers align.
  private emitDigits(inst: number[], text: string, color: number[], atlas: any, x: number, baseline: number, s: number) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const gl = atlas.table[ch];
      if (gl && ch !== ' ') inst.push(x + i * this.digitW, baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.bandH, gl.invH);
    }
  }
}

// Char used to size the monospace cell — informs atlas coverage only.
export function editorAtlasChars(): string {
  let s = '';
  for (let c = 32; c < 127; c++) s += String.fromCharCode(c);
  return s;
}
