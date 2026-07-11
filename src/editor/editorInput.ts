// ── Code-editor input ────────────────────────────────────────────────────────
// Bridges keyboard events to the CodeEditor command surface, and keeps the caret
// on screen by nudging the camera. Split out of camera/input.ts so that file
// stays focused on document/camera interaction.

import type { AppState } from '../state';

// Map a keydown to editor commands. Returns true if handled (caller should stop).
export function handleEditorKey(s: AppState, e: KeyboardEvent) {
  const ed = s.editor!;
  const meta = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const k = e.key;

  if (meta && k.toLowerCase() === 'a') { ed.selectAll(); e.preventDefault(); return; }
  if (meta && k.toLowerCase() === 'c') { const t = ed.selectedText(); if (t && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}); e.preventDefault(); return; }
  if (meta && k.toLowerCase() === 'x') { const t = ed.selectedText(); if (t && navigator.clipboard) { navigator.clipboard.writeText(t).catch(() => {}); ed.insertText(''); } e.preventDefault(); return; }
  if (meta && k.toLowerCase() === 'v') { if (navigator.clipboard) navigator.clipboard.readText().then((t) => { if (t) { ed.insertText(t.replace(/\r\n/g, '\n')); ensureCaretVisible(s); } }).catch(() => {}); e.preventDefault(); return; }
  if (meta && k.toLowerCase() === 'z' && !shift) { ed.undo(); e.preventDefault(); ensureCaretVisible(s); return; }
  if (meta && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && shift))) { ed.redo(); e.preventDefault(); ensureCaretVisible(s); return; }

  switch (k) {
    case 'ArrowLeft': meta ? ed.moveHome(shift) : ed.moveLeft(shift); break;
    case 'ArrowRight': meta ? ed.moveEnd(shift) : ed.moveRight(shift); break;
    case 'ArrowUp': ed.moveVert(-1, shift); break;
    case 'ArrowDown': ed.moveVert(1, shift); break;
    case 'Home': meta ? ed.moveDocStart(shift) : ed.moveHome(shift); break;
    case 'End': meta ? ed.moveDocEnd(shift) : ed.moveEnd(shift); break;
    case 'Backspace': ed.backspace(); break;
    case 'Delete': ed.del(); break;
    case 'Enter': ed.newline(); break;
    case 'Tab': ed.indent(); break;
    case 'Escape': return; // let default focus handling be
    default:
      if (k.length === 1 && !meta && !e.altKey) ed.insertText(k);
      else return; // unhandled — don't preventDefault
  }
  e.preventDefault();
  ensureCaretVisible(s);
}

// Nudge the camera so the caret stays within a comfortable margin of the view.
export function ensureCaretVisible(s: AppState) {
  const ed = s.editor!;
  const p = ed.posToWorld(ed.cursor);
  const halfW = s.tCanvas.width / (2 * s.camZ), halfH = s.tCanvas.height / (2 * s.camZ);
  const mX = 60 / s.camZ, mY = ed.lineHeight * 1.5;
  const left = s.camX - halfW + mX, right = s.camX + halfW - mX;
  const top = s.camY - halfH + mY, bot = s.camY + halfH - mY;
  if (p.x < left) s.camX -= (left - p.x);
  else if (p.x > right) s.camX += (p.x - right);
  if (p.y < top) s.camY -= (top - p.y);
  else if (p.y + ed.lineHeight > bot) s.camY += (p.y + ed.lineHeight - bot);
  s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;
}
