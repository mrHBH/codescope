// ── Input ────────────────────────────────────────────────────────────────────
// Wires pointer, wheel, and keyboard events to camera (pan/zoom), page
// navigation, and text editing. Everything mutates AppState.

import type { AppState } from '../state';
import type { StyledEl } from '../layout/types';
import { bufCoords, scrToWorld, goToPage, fitDocument } from './camera';
import { hitTest, findEditableAncestor } from '../layout/walk';
import { layoutEditable, placeCaretAtPoint, caretIndexAtPoint } from '../layout/editable';
import { ContextMenu, type MenuItem } from '../ui/contextMenu';
import { handleEditorKey } from '../editor/editorInput';
import { handleTerminalKey } from '../editor/terminalInput';
import { handleClickInteraction, sliderOf, setSliderFromX } from '../ui/interactions';
import { refreshLayout } from '../precompute';

const _editTmp: number[] = [], _editTmpCrv: number[] = [], _editTmpRws: number[] = [];

function deleteSelection(el: StyledEl) {
  const a = Math.min(el.caret, el.selAnchor), b = Math.max(el.caret, el.selAnchor);
  el.editText = el.editText.slice(0, a) + el.editText.slice(b);
  el.caret = a; el.selAnchor = -1;
}

// ── Shared edit actions ──────────────────────────────────────────────────────
// Used by both the keyboard handler and the context menu so behaviour stays in
// one place.
function hasSelection(el: StyledEl) { return el.selAnchor >= 0 && el.selAnchor !== el.caret; }

function selectedText(el: StyledEl) {
  const a = Math.min(el.caret, el.selAnchor), b = Math.max(el.caret, el.selAnchor);
  return el.editText.slice(a, b);
}

function copySelection(el: StyledEl) {
  if (!hasSelection(el) || !navigator.clipboard) return;
  navigator.clipboard.writeText(selectedText(el)).catch(() => {});
}

function cutSelection(el: StyledEl) {
  if (!hasSelection(el)) return;
  copySelection(el);
  deleteSelection(el);
}

function pasteClipboard(el: StyledEl) {
  if (!navigator.clipboard) return;
  navigator.clipboard.readText().then((text) => {
    if (!text) return;
    text = text.replace(/\r\n/g, '\n');
    if (hasSelection(el)) deleteSelection(el);
    el.editText = el.editText.slice(0, el.caret) + text + el.editText.slice(el.caret);
    el.caret += text.length; el.selAnchor = -1;
  }).catch(() => {});
}

function selectAll(el: StyledEl) { el.selAnchor = 0; el.caret = el.editText.length; }

export function attachInput(s: AppState) {
  const { rCanvas } = s;
  const menu = new ContextMenu();

  // Slider drag state: the DOM slider being dragged + the last integer percent
  // we rebuilt at (so a drag rebuilds at most ~once per visible step).
  let sliding: HTMLElement | null = null;
  let slidingPct = -1;
  const sliderPct = (el: HTMLElement) => {
    const min = parseFloat(el.getAttribute('data-min') || '0');
    const max = parseFloat(el.getAttribute('data-max') || '100');
    const v = parseFloat(el.getAttribute('data-value') || '0');
    return max > min ? Math.round(((v - min) / (max - min)) * 100) : 0;
  };

  // Build the menu items for the current context (editing vs. canvas).
  function buildMenuItems(): MenuItem[] {
    const el = s.activeEdit;
    if (el) {
      return [
        { id: 'cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', enabled: () => hasSelection(el), action: () => cutSelection(el) },
        { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', enabled: () => hasSelection(el), action: () => copySelection(el) },
        { id: 'paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V', enabled: () => !!navigator.clipboard, action: () => pasteClipboard(el) },
        { id: 'sep1', separator: true },
        { id: 'selectAll', label: 'Select All', icon: 'selectAll', shortcut: 'Ctrl+A', action: () => selectAll(el) },
      ];
    }
    return [
      { id: 'fit', label: 'Fit to Screen', icon: 'fit', action: () => fitDocument(s) },
      { id: 'reset', label: 'Reset View', icon: 'reset', action: () => goToPage(s, 0) },
      { id: 'sep1', separator: true },
      { id: 'theme', label: 'Cycle Theme', icon: 'theme', action: () => s.cycleTheme?.() },
    ];
  }

  rCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // only the primary (left) button drives editing/nav
    rCanvas.setPointerCapture(e.pointerId);
    const b = bufCoords(s, e.clientX, e.clientY);
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    s.dragging = true; s.velX = s.velY = 0; s.lastMoveT = performance.now();
    const w = scrToWorld(s, b.x, b.y);

    // Editor mode: click inside the panel places the caret + starts a selection.
    if (s.editorMode && s.editor) {      const ed = s.editor;
      const inPanel = w.x >= ed.x0 && w.x <= ed.x0 + ed.contentWidth() && w.y >= ed.y0 && w.y <= ed.y0 + ed.contentHeight();
      if (inPanel) {
        ed.focused = true;
        ed.placeCursor(w.x, w.y, e.shiftKey);
        if (!e.shiftKey) ed.anchor = { line: ed.cursor.line, col: ed.cursor.col };
        s.editorSelecting = true;
        return;
      }
      // click outside the panel → pan the canvas (fall through)
    }

    // File tree mode: click inside the panel toggles folders / selects files.
    if (s.fileTreeMode && s.fileTree) {
      const ft = s.fileTree;
      const inPanel = w.x >= ft.x0 && w.x <= ft.x0 + ft.width && w.y >= ft.y0 && w.y <= ft.y0 + ft.contentHeight;
      if (inPanel) {
        ft.focused = true;
        const row = ft.rowAtY(w.y);
        if (row) {
          if (row.node.type === 'folder' && ft.isOnChevron(w.x, row)) {
            ft.toggleFolder(row.node.path);
          } else {
            ft.select(row.node.path);
          }
        }
        s.pressed = null;
        return;
      }
    }

    const hit = hitTest(s.docRoot, w.x, w.y);

    // Interactive controls take priority over pan/nav/edit.
    // Slider: begin a drag and set the value from the click x.
    const sl = sliderOf(hit);
    if (sl) {
      sliding = sl;
      setSliderFromX(sl, w.x);
      slidingPct = sliderPct(sl);
      refreshLayout(s);
      s.pressed = null;
      return;
    }
    // Toggles, dropdowns, tab selectors — mutate the DOM + rebuild.
    if (hit && handleClickInteraction(s, hit)) { s.pressed = null; return; }

    // Editing: click inside an editable element places the caret and enters edit mode
    const ed = findEditableAncestor(hit);
    if (ed) {
      s.activeEdit = ed;
      _editTmp.length = 0; _editTmpCrv.length = 0; _editTmpRws.length = 0;
      layoutEditable(ed, s.font, s.atlas, _editTmp, _editTmpCrv, _editTmpRws, 2 / s.camZ, performance.now(), false, s.themeCol.caret, s.themeCol.sel);
      placeCaretAtPoint(ed, w.x, w.y);
      ed.selAnchor = ed.caret; // begin a drag-selection anchored at the click
      s.selecting = true;
      s.pressed = null;
      return;
    }
    s.activeEdit = null;
    s.selecting = false;
    s.pressed = (hit && hit.hoverable) ? hit : null;
    let nav: StyledEl | null = hit;
    while (nav && nav.pageIdx < 0) nav = nav.parent;
    if (nav) goToPage(s, nav.pageIdx);
  });

  rCanvas.addEventListener('pointermove', (e) => {
    const b = bufCoords(s, e.clientX, e.clientY);
    s.mx = b.x; s.my = b.y;
    if (!s.pointers.has(e.pointerId)) return;
    const prev = s.pointers.get(e.pointerId)!;
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    // Slider drag: track the pointer x, rebuild only when the step changes.
    if (sliding) {
      const w = scrToWorld(s, b.x, b.y);
      setSliderFromX(sliding, w.x);
      const pct = sliderPct(sliding);
      if (pct !== slidingPct) { slidingPct = pct; refreshLayout(s); }
      return;
    }
    if (s.editorMode && s.editorSelecting && s.editor) {
      const w = scrToWorld(s, b.x, b.y);
      s.editor.placeCursor(w.x, w.y, true);
      return;
    }
    if (s.activeEdit) {
      // Drag-selection: move the caret end while keeping the anchor fixed.
      if (s.selecting) {
        const w = scrToWorld(s, b.x, b.y);
        const idx = caretIndexAtPoint(s.activeEdit, w.x, w.y);
        if (idx >= 0) s.activeEdit.caret = idx;
      }
      return; // don't pan the camera while editing text
    }
    if (s.pointers.size === 1) {
      s.camX -= (b.x - prev.x) / s.camZ; s.camY -= (b.y - prev.y) / s.camZ;
      s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
      const t = performance.now(), ddt = t - s.lastMoveT;
      if (ddt > 0) { s.velX = s.velX ? s.velX * .7 + ((b.x - prev.x) / ddt) * .3 : (b.x - prev.x) / ddt; s.velY = s.velY ? s.velY * .7 + ((b.y - prev.y) / ddt) * .3 : (b.y - prev.y) / ddt; s.lastMoveT = t; }
    }
  });

  const rel = () => {
    if (s.selecting && s.activeEdit && s.activeEdit.selAnchor === s.activeEdit.caret) s.activeEdit.selAnchor = -1;
    s.selecting = false;
    s.editorSelecting = false;
    sliding = null; slidingPct = -1;
    s.pointers.clear(); s.dragging = false; s.pressed = null; if (performance.now() - s.lastMoveT > 80) s.velX = s.velY = 0;
  };
  rCanvas.addEventListener('pointerup', rel);
  rCanvas.addEventListener('pointercancel', rel);

  s.lastWheelT = 0;
  s.rightDown = false;
  // Right-click gesture: a *short* press with no wheel motion opens the context
  // menu on release; a *long* press or any wheel event during the press is the
  // zoom gesture, which suppresses the menu.
  let rightDownT = 0, rightWheeled = false, rightMoved = false;
  let rightStart = { x: 0, y: 0 };
  const LONG_PRESS_MS = 350, MOVE_TOL = 6;
  rCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 2) return;
    s.rightDown = true;
    rightDownT = performance.now();
    rightWheeled = false; rightMoved = false;
    rightStart = { x: e.clientX, y: e.clientY };
    menu.hide();
  });
  rCanvas.addEventListener('pointermove', (e) => {
    if (!s.rightDown) return;
    if (Math.abs(e.clientX - rightStart.x) > MOVE_TOL || Math.abs(e.clientY - rightStart.y) > MOVE_TOL) rightMoved = true;
  });
  rCanvas.addEventListener('pointerup', (e) => {
    if (e.button !== 2) return;
    s.rightDown = false;
    const shortPress = performance.now() - rightDownT < LONG_PRESS_MS;
    if (shortPress && !rightWheeled && !rightMoved) {
      menu.show(e.clientX, e.clientY, buildMenuItems());
    }
  });
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
      if (s.rightDown) rightWheeled = true;
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
    // Code editor / terminal take precedence when active.
    if (s.terminalMode && s.terminal) { handleTerminalKey(s, e); return; }
    if (s.editorMode && s.editor) { handleEditorKey(s, e); return; }
    if (!s.activeEdit) return;
    const el = s.activeEdit, t = el.editText;
    const hasSel = el.selAnchor >= 0 && el.selAnchor !== el.caret;
    const meta = e.ctrlKey || e.metaKey;
    const lineOf = (idx: number) => el.caretLines ? el.caretLines[idx] : 0;
    if (meta && e.key.toLowerCase() === 'a') { selectAll(el); e.preventDefault(); return; }
    if (meta && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) {
      if (e.key.toLowerCase() === 'x') cutSelection(el); else copySelection(el);
      e.preventDefault(); return;
    }
    if (meta && e.key.toLowerCase() === 'v') { pasteClipboard(el); e.preventDefault(); return; }
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
