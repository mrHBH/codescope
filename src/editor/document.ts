// ── Editor document model ────────────────────────────────────────────────────
// A line-based text buffer for the code editor. This is deliberately separate
// from the DOM-derived StyledEl system: the editor owns its own model, cursor,
// selection, and undo history. Positions are {line, col} (col = UTF-16 offset
// within the line). Edits are expressed as range replacements so undo/redo and
// incremental re-highlighting can hang off a single primitive.

export interface Pos { line: number; col: number; }
export interface Range { start: Pos; end: Pos; }

export function posLt(a: Pos, b: Pos): boolean { return a.line < b.line || (a.line === b.line && a.col < b.col); }
export function posMin(a: Pos, b: Pos): Pos { return posLt(a, b) ? a : b; }
export function posMax(a: Pos, b: Pos): Pos { return posLt(a, b) ? b : a; }
export function clonePos(p: Pos): Pos { return { line: p.line, col: p.col }; }

interface EditRecord {
  // Inverse-able record: replacing `range` (in the pre-edit doc) with `text`
  // produced `removed`. Undo replaces the resulting range with `removed`.
  range: Range;         // range that was replaced (pre-edit coordinates)
  inserted: string;     // text inserted
  removed: string;      // text that used to be there
  before: Pos;          // caret before the edit
  after: Pos;           // caret after the edit
}

export class TextDocument {
  lines: string[];
  private undoStack: EditRecord[] = [];
  private redoStack: EditRecord[] = [];
  // Monotonic version; bumped on every mutation so consumers can cache.
  version = 0;

  constructor(text = '') {
    this.lines = text.split('\n');
    if (this.lines.length === 0) this.lines = [''];
  }

  get lineCount(): number { return this.lines.length; }
  lineText(i: number): string { return this.lines[i] ?? ''; }
  lineLen(i: number): number { return (this.lines[i] ?? '').length; }

  toString(): string { return this.lines.join('\n'); }

  clampPos(p: Pos): Pos {
    let line = Math.max(0, Math.min(p.line, this.lines.length - 1));
    let col = Math.max(0, Math.min(p.col, this.lines[line].length));
    return { line, col };
  }

  // Full end-of-document position.
  end(): Pos { const l = this.lines.length - 1; return { line: l, col: this.lines[l].length }; }

  textInRange(r: Range): string {
    const a = posMin(r.start, r.end), b = posMax(r.start, r.end);
    if (a.line === b.line) return this.lines[a.line].slice(a.col, b.col);
    const parts: string[] = [this.lines[a.line].slice(a.col)];
    for (let i = a.line + 1; i < b.line; i++) parts.push(this.lines[i]);
    parts.push(this.lines[b.line].slice(0, b.col));
    return parts.join('\n');
  }

  // Core primitive: replace `range` with `text`, returning the end position of
  // the inserted text. Records undo unless `fromHistory` is set.
  replace(range: Range, text: string, caretBefore: Pos, fromHistory = false): Pos {
    const a = posMin(range.start, range.end), b = posMax(range.start, range.end);
    const removed = this.textInRange({ start: a, end: b });
    const tail = this.lines[b.line].slice(b.col);
    const head = this.lines[a.line].slice(0, a.col);
    const ins = text.split('\n');

    let endPos: Pos;
    if (ins.length === 1) {
      this.lines.splice(a.line, b.line - a.line + 1, head + ins[0] + tail);
      endPos = { line: a.line, col: head.length + ins[0].length };
    } else {
      const newLines: string[] = [];
      newLines.push(head + ins[0]);
      for (let i = 1; i < ins.length - 1; i++) newLines.push(ins[i]);
      newLines.push(ins[ins.length - 1] + tail);
      this.lines.splice(a.line, b.line - a.line + 1, ...newLines);
      endPos = { line: a.line + ins.length - 1, col: ins[ins.length - 1].length };
    }
    this.version++;

    if (!fromHistory) {
      this.undoStack.push({ range: { start: clonePos(a), end: clonePos(b) }, inserted: text, removed, before: clonePos(caretBefore), after: clonePos(endPos) });
      this.redoStack.length = 0;
      if (this.undoStack.length > 500) this.undoStack.shift();
    }
    return endPos;
  }

  insert(at: Pos, text: string, caretBefore: Pos): Pos {
    return this.replace({ start: at, end: at }, text, caretBefore);
  }

  delete(range: Range, caretBefore: Pos): Pos {
    return this.replace(range, '', caretBefore);
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  // Undo: returns the caret position to restore, or null if nothing to undo.
  undo(): Pos | null {
    const rec = this.undoStack.pop();
    if (!rec) return null;
    // The inserted text currently occupies [rec.range.start, insertedEnd].
    const insEnd = advancePos(rec.range.start, rec.inserted);
    this.replace({ start: rec.range.start, end: insEnd }, rec.removed, rec.after, true);
    this.redoStack.push(rec);
    return clonePos(rec.before);
  }

  redo(): Pos | null {
    const rec = this.redoStack.pop();
    if (!rec) return null;
    this.replace(rec.range, rec.inserted, rec.before, true);
    this.undoStack.push(rec);
    return clonePos(rec.after);
  }
}

// Position reached by inserting `text` starting at `start`.
function advancePos(start: Pos, text: string): Pos {
  const parts = text.split('\n');
  if (parts.length === 1) return { line: start.line, col: start.col + parts[0].length };
  return { line: start.line + parts.length - 1, col: parts[parts.length - 1].length };
}
