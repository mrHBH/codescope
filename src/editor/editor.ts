// ── Code editor ──────────────────────────────────────────────────────────────
// A line-based, viewport-culled code editor that renders through windfoil's
// analytic pipeline. It lives in WORLD space (like a page), so the existing
// camera gives infinite-zoom + pan-scroll for free. Layout uses a MONOSPACE cell
// model: every column is a fixed width, so caret math is exact and tabs align —
// the standard code-editor contract. Only lines intersecting the viewport are
// laid out each frame; syntax tokens come from the incremental Highlighter.

import type { FontFace } from '../windfoil/font';
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
  desiredCol = 0;                // sticky column for vertical movement
  focused = true;

  // World-space geometry
  x0 = 0; y0 = 0;
  fontSize = 20;
  get lineHeight() { return this.fontSize * 1.5; }
  get cellW() { return this.fontSize * 0.62; }        // monospace cell width
  gutterPad = 12;
  textPad = 16;

  constructor(text: string) { this.doc = new TextDocument(text); }

  // ── Geometry ───────────────────────────────────────────────────────────────
  get gutterW(): number {
    const digits = Math.max(2, String(this.doc.lineCount).length);
    return this.gutterPad * 2 + digits * this.cellW;
  }
  get textLeft(): number { return this.x0 + this.gutterW + this.textPad; }
  contentHeight(): number { return this.doc.lineCount * this.lineHeight + this.lineHeight; }
  contentWidth(): number {
    let max = 0;
    for (const l of this.doc.lines) max = Math.max(max, this.displayCols(l));
    return this.gutterW + this.textPad * 2 + max * this.cellW;
  }

  // Visual column count of a line (tabs expand to TAB stops).
  private displayCols(line: string): number {
    let c = 0;
    for (const ch of line) c += ch === '\t' ? TAB - (c % TAB) : 1;
    return c;
  }
  // Map a character column → display column (tab expansion).
  private dispCol(line: string, col: number): number {
    let c = 0;
    for (let i = 0; i < col && i < line.length; i++) c += line[i] === '\t' ? TAB - (c % TAB) : 1;
    return c;
  }

  lineTop(line: number): number { return this.y0 + line * this.lineHeight; }
  colToX(line: number, col: number): number { return this.textLeft + this.dispCol(this.doc.lineText(line), col) * this.cellW; }

  posToWorld(p: Pos): { x: number; y: number } { return { x: this.colToX(p.line, p.col), y: this.lineTop(p.line) }; }

  worldToPos(wx: number, wy: number): Pos {
    let line = Math.floor((wy - this.y0) / this.lineHeight);
    line = Math.max(0, Math.min(line, this.doc.lineCount - 1));
    const text = this.doc.lineText(line);
    const targetDisp = Math.round((wx - this.textLeft) / this.cellW);
    // Convert display column back to a character column, honoring tabs.
    let c = 0, col = 0;
    for (col = 0; col < text.length; col++) {
      const w = text[col] === '\t' ? TAB - (c % TAB) : 1;
      if (c + w / 2 > targetDisp) break;
      c += w;
    }
    return { line, col: Math.max(0, Math.min(col, text.length)) };
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

  insertText(text: string) {
    if (this.hasSelection()) this.deleteSelectionInternal();
    const end = this.doc.insert(this.cursor, text, this.cursor);
    this.hl.invalidateFrom(this.cursor.line);
    this.cursor = end; this.anchor = null;
    this.desiredCol = this.dispCol(this.doc.lineText(end.line), end.col);
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
    this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), this.cursor.col);
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
    this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), this.cursor.col);
  }
  moveRight(extend: boolean) {
    if (this.hasSelection() && !extend) { this.cursor = posMax(this.anchor!, this.cursor); this.anchor = null; }
    else {
      let { line, col } = this.cursor;
      if (col < this.doc.lineLen(line)) col++; else if (line < this.doc.lineCount - 1) { line++; col = 0; }
      this.setCursor({ line, col }, extend);
    }
    this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), this.cursor.col);
  }
  moveVert(dir: number, extend: boolean) {
    const line = this.cursor.line + dir;
    if (line < 0 || line >= this.doc.lineCount) return;
    const col = this.dispToCol(line, this.desiredCol);
    this.setCursor({ line, col }, extend);
  }
  private dispToCol(line: number, disp: number): number {
    const text = this.doc.lineText(line);
    let c = 0, i = 0;
    for (; i < text.length; i++) { const w = text[i] === '\t' ? TAB - (c % TAB) : 1; if (c + w > disp) break; c += w; }
    return i;
  }
  moveHome(extend: boolean) {
    const text = this.doc.lineText(this.cursor.line);
    const firstNW = text.length - text.replace(/^[ \t]+/, '').length;
    const col = this.cursor.col === firstNW ? 0 : firstNW;
    this.setCursor({ line: this.cursor.line, col }, extend);
    this.desiredCol = this.dispCol(text, col);
  }
  moveEnd(extend: boolean) {
    const col = this.doc.lineLen(this.cursor.line);
    this.setCursor({ line: this.cursor.line, col }, extend);
    this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), col);
  }
  moveDocStart(extend: boolean) { this.setCursor({ line: 0, col: 0 }, extend); this.desiredCol = 0; }
  moveDocEnd(extend: boolean) { this.setCursor(this.doc.end(), extend); this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), this.cursor.col); }
  selectAll() { this.anchor = { line: 0, col: 0 }; this.cursor = this.doc.end(); }

  placeCursor(wx: number, wy: number, extend: boolean) {
    this.setCursor(this.worldToPos(wx, wy), extend);
    this.desiredCol = this.dispCol(this.doc.lineText(this.cursor.line), this.cursor.col);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  // Pushes instances for: panel bg, current-line highlight, selection, gutter,
  // line numbers, syntax-colored glyphs, and the caret. Only lines within
  // [worldTop, worldBottom] are laid out.
  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[],
         worldTop: number, worldBottom: number, now: number, th: EditorTheme, caretW: number) {
    const lh = this.lineHeight, s = this.fontSize / font.unitsPerEm;
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
        if (i < sel.end.line) xe += this.cellW * 0.5; // show trailing newline selected
        addRect(xs, top, Math.max(xe, xs + 1), top + lh, th.sel, crv, rws, inst);
      }

      // Line number (right-aligned in gutter), dim unless current line
      const num = String(i + 1);
      const numColor = i === this.cursor.line ? th.curLineFg : th.gutterFg;
      const numX = this.x0 + this.gutterW - this.gutterPad - num.length * this.cellW;
      const baseline = top + this.fontSize * 0.9;
      this.emitMono(inst, num, numColor, atlas, font, numX, baseline, s);

      // Syntax-colored glyphs
      const tokens = this.hl.tokensFor(this.doc.lines, i);
      let disp = 0;
      const emitSlice = (from: number, to: number, color: number[]) => {
        for (let c = from; c < to; c++) {
          const ch = text[c];
          if (ch === '\t') { disp += TAB - (disp % TAB); continue; }
          if (ch !== ' ') {
            const gl = atlas.table[ch];
            if (gl) inst.push(this.textLeft + disp * this.cellW, baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.y0, gl.invH);
          }
          disp++;
        }
      };
      let cursorCol = 0;
      for (const tk of tokens) {
        if (tk.start > cursorCol) emitSlice(cursorCol, tk.start, th.text);
        emitSlice(tk.start, tk.end, tk.color);
        cursorCol = tk.end;
      }
      if (cursorCol < text.length) emitSlice(cursorCol, text.length, th.text);

      // Caret
      if (this.focused && i === this.cursor.line && (now % 1060) < 530) {
        const cx = this.colToX(i, this.cursor.col);
        addRect(cx, top + lh * 0.12, cx + caretW, top + lh * 0.9, th.caret, crv, rws, inst);
      }
    }
  }

  // Left-aligned monospace glyph run (for gutter line numbers).
  private emitMono(inst: number[], text: string, color: number[], atlas: any, font: FontFace, x: number, baseline: number, s: number) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const gl = atlas.table[ch];
      if (gl && ch !== ' ') inst.push(x + i * this.cellW, baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.y0, gl.invH);
    }
  }
}

// Char used to size the monospace cell — informs atlas coverage only.
export function editorAtlasChars(): string {
  let s = '';
  for (let c = 32; c < 127; c++) s += String.fromCharCode(c);
  return s;
}
