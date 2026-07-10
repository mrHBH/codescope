// ── Input ────────────────────────────────────────────────────────────────────
// Wires pointer, wheel, and keyboard events to camera (pan/zoom), page
// navigation, and text editing. Everything mutates AppState.

import type { AppState } from '../state';
import type { StyledEl } from '../layout/types';
import { bufCoords, scrToWorld, goToPage } from './camera';
import { hitTest, findEditableAncestor } from '../layout/walk';
import { layoutEditable, placeCaretAtPoint } from '../layout/editable';

const _editTmp: number[] = [], _editTmpCrv: number[] = [], _editTmpRws: number[] = [];

function deleteSelection(el: StyledEl) {
  const a = Math.min(el.caret, el.selAnchor), b = Math.max(el.caret, el.selAnchor);
  el.editText = el.editText.slice(0, a) + el.editText.slice(b);
  el.caret = a; el.selAnchor = -1;
}

export function attachInput(s: AppState) {
  const { rCanvas } = s;

  rCanvas.addEventListener('pointerdown', (e) => {
    rCanvas.setPointerCapture(e.pointerId);
    const b = bufCoords(s, e.clientX, e.clientY);
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    s.dragging = true; s.velX = s.velY = 0; s.lastMoveT = performance.now();
    const w = scrToWorld(s, b.x, b.y);
    const hit = hitTest(s.docRoot, w.x, w.y);

    // Editing: click inside an editable element places the caret and enters edit mode
    const ed = findEditableAncestor(hit);
    if (ed) {
      s.activeEdit = ed;
      _editTmp.length = 0; _editTmpCrv.length = 0; _editTmpRws.length = 0;
      layoutEditable(ed, s.font, s.atlas, _editTmp, _editTmpCrv, _editTmpRws, 2 / s.camZ, performance.now(), false, s.themeCol.caret, s.themeCol.sel);
      placeCaretAtPoint(ed, w.x, w.y);
      s.pressed = null;
      return;
    }
    s.activeEdit = null;
    s.pressed = (hit && (hit.classes.includes('btn') || hit.classes.includes('card') || hit.classes.includes('feature'))) ? hit : null;
    let nav: StyledEl | null = hit;
    while (nav && !nav.el.getAttribute('data-page')) nav = nav.parent;
    if (nav) goToPage(s, parseInt(nav.el.getAttribute('data-page') || '0', 10));
  });

  rCanvas.addEventListener('pointermove', (e) => {
    const b = bufCoords(s, e.clientX, e.clientY);
    s.mx = b.x; s.my = b.y;
    if (!s.pointers.has(e.pointerId)) return;
    const prev = s.pointers.get(e.pointerId)!;
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    if (s.activeEdit) return; // don't pan the camera while editing text
    if (s.pointers.size === 1) {
      s.camX -= (b.x - prev.x) / s.camZ; s.camY -= (b.y - prev.y) / s.camZ;
      s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
      const t = performance.now(), ddt = t - s.lastMoveT;
      if (ddt > 0) { s.velX = s.velX ? s.velX * .7 + ((b.x - prev.x) / ddt) * .3 : (b.x - prev.x) / ddt; s.velY = s.velY ? s.velY * .7 + ((b.y - prev.y) / ddt) * .3 : (b.y - prev.y) / ddt; s.lastMoveT = t; }
    }
  });

  const rel = () => { s.pointers.clear(); s.dragging = false; s.pressed = null; if (performance.now() - s.lastMoveT > 80) s.velX = s.velY = 0; };
  rCanvas.addEventListener('pointerup', rel);
  rCanvas.addEventListener('pointercancel', rel);

  s.lastWheelT = 0;
  s.rightDown = false;
  rCanvas.addEventListener('pointerdown', (e) => { if (e.button === 2) s.rightDown = true; });
  rCanvas.addEventListener('pointerup', (e) => { if (e.button === 2) s.rightDown = false; });
  rCanvas.addEventListener('pointercancel', () => { s.rightDown = false; });
  rCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Wheel: normal = smooth scroll, right-click held OR trackpad pinch (ctrlKey)
  // = zoom to cursor. Trackpad pinch-zoom is delivered as a wheel event with
  // ctrlKey set, so we treat that as the zoom gesture.
  rCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    s.lastWheelT = performance.now();
    const b = bufCoords(s, e.clientX, e.clientY);
    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    if (s.rightDown || e.ctrlKey) {
      const wx = (b.x - Cw / 2) / s.camZ + s.camX, wy = (b.y - Ch / 2) / s.camZ + s.camY;
      s.camZ *= Math.exp(-e.deltaY * .0022);
      if (s.camZ < s.minZoom) { s.camZ = s.minZoom; s.camX = s.PAGE_W / 2; s.camY = s.docH / 2; s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ; }
      else { s.camX = wx - (b.x - Cw / 2) / s.camZ; s.camY = wy - (b.y - Ch / 2) / s.camZ; s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ; }
      s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;
    } else {
      s.velY -= e.deltaY / s.camZ * 0.05;
      s.velX = 0;
      s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
    }
  }, { passive: false });

  // ── Text editing ────────────────────────────────────────────────────────
  addEventListener('keydown', (e) => {
    if (!s.activeEdit) return;
    const el = s.activeEdit, t = el.editText;
    const hasSel = el.selAnchor >= 0 && el.selAnchor !== el.caret;
    const meta = e.ctrlKey || e.metaKey;
    const lineOf = (idx: number) => el.caretLines ? el.caretLines[idx] : 0;
    if (meta && e.key.toLowerCase() === 'a') { el.selAnchor = 0; el.caret = t.length; e.preventDefault(); return; }
    if (e.key === 'Escape') { el.editText = el.originText; el.caret = el.editText.length; el.selAnchor = -1; s.activeEdit = null; e.preventDefault(); return; }
    if (e.key === 'Tab') {
      const i = s.editableEls.indexOf(el);
      const next = s.editableEls[(i + 1) % s.editableEls.length];
      s.activeEdit = next; next.caret = next.editText.length; next.selAnchor = -1;
      e.preventDefault(); return;
    }
    if (e.key === 'ArrowLeft') {
      if (hasSel && !e.shiftKey) { el.caret = Math.min(el.caret, el.selAnchor); el.selAnchor = -1; }
      else { if (e.shiftKey && el.selAnchor < 0) el.selAnchor = el.caret; el.caret = Math.max(0, el.caret - 1); }
      e.preventDefault(); return;
    }
    if (e.key === 'ArrowRight') {
      if (hasSel && !e.shiftKey) { el.caret = Math.max(el.caret, el.selAnchor); el.selAnchor = -1; }
      else { if (e.shiftKey && el.selAnchor < 0) el.selAnchor = el.caret; el.caret = Math.min(t.length, el.caret + 1); }
      e.preventDefault(); return;
    }
    if (e.key === 'Home') { el.caret = 0; if (!e.shiftKey) el.selAnchor = -1; e.preventDefault(); return; }
    if (e.key === 'End') { el.caret = t.length; if (!e.shiftKey) el.selAnchor = -1; e.preventDefault(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      const ln = lineOf(el.caret), tln = ln + dir;
      if (tln < 0 || tln >= (el.lineTops ? el.lineTops.length : 0)) { e.preventDefault(); return; }
      const tx = el.caretXs ? el.caretXs[el.caret] : 0;
      let best = el.caret, bestD = Infinity;
      for (let i = 0; i <= t.length; i++) { if (lineOf(i) !== tln) continue; const x = el.caretXs ? el.caretXs[i] : 0; const d = Math.abs(x - tx); if (d < bestD) { bestD = d; best = i; } }
      el.caret = best; if (!e.shiftKey) el.selAnchor = -1;
      e.preventDefault(); return;
    }
    if (e.key === 'Backspace') {
      if (hasSel) deleteSelection(el);
      else if (el.caret > 0) { el.editText = t.slice(0, el.caret - 1) + t.slice(el.caret); el.caret--; }
      e.preventDefault(); return;
    }
    if (e.key === 'Delete') {
      if (hasSel) deleteSelection(el);
      else if (el.caret < t.length) { el.editText = t.slice(0, el.caret) + t.slice(el.caret + 1); }
      e.preventDefault(); return;
    }
    if (e.key.length === 1 && !meta && !e.altKey) {
      if (hasSel) deleteSelection(el);
      el.editText = el.editText.slice(0, el.caret) + e.key + el.editText.slice(el.caret);
      el.caret++; el.selAnchor = -1;
      e.preventDefault(); return;
    }
  });
}
