// ── Input ────────────────────────────────────────────────────────────────────
// Wires pointer, wheel, and keyboard events to camera (pan/zoom), page
// navigation, and text editing. Everything mutates AppState.

import type { AppState } from '../state';
import type { StyledEl } from '../layout/types';
import { bufCoords, scrToWorld, scrToDoc, goToPage, fitDocument, cameraScale, uiScale } from './camera';
import { setOrbitEnabled, setOrbitPanChord, orbitTruck, orbitZoomToRect } from './orbit';
import { hitTest, findEditableAncestor } from '../layout/walk';
import { layoutEditable, placeCaretAtPoint, caretIndexAtPoint } from '../layout/editable';
import { type AnalyticMenuItem } from '../ui/analyticMenu';
import { MenuGate, RightGesture, routeScroll } from '../ui/inputRouter';
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

export function attachInput(s: AppState): () => void {
  const { rCanvas } = s;
  // AbortController so a standalone demo can detach ALL of its listeners at once
  // on teardown: every addEventListener below goes through `on`, which threads the
  // signal. attachInput returns a disposer that aborts them.
  const ac = new AbortController();
  const { signal } = ac;
  const on = (t: EventTarget, type: string, h: (e: any) => void, opts?: AddEventListenerOptions) => t.addEventListener(type, h, { ...opts, signal });
  const gate = new MenuGate((t, sz) => {
    const sc = sz / s.font.unitsPerEm;
    let tw = 0;
    for (const ch of t) tw += (s.atlas.table[ch]?.advance ?? 0) * sc;
    return tw;
  });
  const menu = gate.menu;
  s.analyticMenu = menu;
  const rg = new RightGesture();

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
  function buildMenuItems(): AnalyticMenuItem[] {
    const el = s.activeEdit;
    if (el) {
      return [
        { id: 'cut', label: 'Cut', icon: 'icon:cut', shortcut: 'Ctrl+X', enabled: () => hasSelection(el), action: () => cutSelection(el) },
        { id: 'copy', label: 'Copy', icon: 'icon:copy', shortcut: 'Ctrl+C', enabled: () => hasSelection(el), action: () => copySelection(el) },
        { id: 'paste', label: 'Paste', icon: 'icon:paste', shortcut: 'Ctrl+V', enabled: () => !!navigator.clipboard, action: () => pasteClipboard(el) },
        { id: 'sep1', separator: true },
        { id: 'selectAll', label: 'Select All', icon: 'icon:selectAll', shortcut: 'Ctrl+A', action: () => selectAll(el) },
      ];
    }
    return [
      { id: 'fit', label: 'Fit to Screen', icon: 'icon:fit', action: () => fitDocument(s) },
      { id: 'reset', label: 'Reset View', icon: 'icon:reset', action: () => goToPage(s, 0) },
      { id: 'sep1', separator: true },
      { id: 'theme', label: 'Cycle Theme', icon: 'icon:theme', action: () => s.cycleTheme?.() },
    ];
  }

  on(rCanvas, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    if (menu.open) {
      // The menu is a screen-space overlay: hit-test in backing-store px.
      const b = bufCoords(s, e.clientX, e.clientY);
      if (gate.consumeClick(b.x, b.y)) return;
    }
    // Analytic toolbar is screen-space chrome: hit-test in backing-store px and
    // fire the button regardless of the pointer/camera input kill-switches.
    if (s.toolbar) {
      const b = bufCoords(s, e.clientX, e.clientY);
      const tb = s.toolbar.hitTest(b.x, b.y);
      if (tb) { tb.onClick(); return; }
    }
    // Analytic settings panel (screen-space): consume clicks on it (toggles +
    // slider drags), and dismiss on a click outside — standard popup behaviour.
    if (s.panel?.open) {
      const b = bufCoords(s, e.clientX, e.clientY);
      rCanvas.setPointerCapture(e.pointerId);
      if (s.panel.pointerDown(b.x, b.y)) return;
      s.panel.hide();
      return;
    }
    // Analytic benchmark "copy results" button (screen-space, top-center).
    if (s.perf?.copyVisible && s.perf.copyRect) {
      const r = s.perf.copyRect;
      const b = bufCoords(s, e.clientX, e.clientY);
      if (b.x >= r.x0 && b.x <= r.x1 && b.y >= r.y0 && b.y <= r.y1) { s.perf.copy(); return; }
    }
    // 3D free camera: the camera-controls library owns pointer input on the
    // canvas, except draggable world-space board handles, which are ray-cast to
    // the grounded document plane and temporarily disable orbit controls.
    if (s.cam3d.active) {
      // Track every left press so a drag pans the free camera (the library's
      // left button is NONE — the app owns it). A press on a windgraph handle
      // grabs the handle instead and suppresses camera motion.
      const b = bufCoords(s, e.clientX, e.clientY);
      rCanvas.setPointerCapture(e.pointerId);
      s.pointers.set(e.pointerId, { x: b.x, y: b.y });
      s.dragging = true; s.velX = s.velY = 0; s.lastMoveT = performance.now();
      if (s.pointerInput && s.interactive) {
        const w = scrToDoc(s, b.x, b.y);
        if (s.interactive.tryBeginDrag(w.x, w.y, cameraScale(s))) {
          setOrbitEnabled(false);
          e.preventDefault();
        }
      }
      return;
    }
    if (!s.pointerInput && !s.cameraInput) return; // both inputs disabled
    rCanvas.setPointerCapture(e.pointerId);
    const b = bufCoords(s, e.clientX, e.clientY);
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    s.dragging = true; s.velX = s.velY = 0; s.lastMoveT = performance.now();

    const w = scrToWorld(s, b.x, b.y);

    // Element interaction (boards, editing, nav) — only when pointer input is on.
    // When it's off, we still captured the pointer above so camera pan works.
    if (s.pointerInput) {
      // windgraph interactive board: grab a draggable point (takes priority over
      // panning). Suppresses camera motion for the duration of the drag.
      if (s.interactive && s.interactive.tryBeginDrag(w.x, w.y, cameraScale(s))) {
        s.velX = s.velY = 0; s.pressed = null;
        return;
      }

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

      // File tree: click inside its panel toggles folders / selects files.
      // Interactive whenever the pointer is over the panel (it renders as a
      // persistent side panel), not only while fileTreeMode is engaged.
      if (s.fileTree) {
        const ft = s.fileTree;
        const inPanel = w.x >= ft.x0 && w.x <= ft.x0 + ft.width && w.y >= ft.y0 && w.y <= ft.y0 + ft.contentHeight;
        if (inPanel) {
          ft.focused = true;
          const row = ft.rowAtY(w.y);
          if (row) {
            // Folders toggle on any click; files select, but clicking the file's
            // guide line collapses its parent folder (matching hybridcoder).
            if (row.node.type === 'folder') {
              ft.toggleFolder(row.node.path);
            } else {
              const viaLine = ft.connectorTarget(w.x, row);
              if (viaLine) ft.toggleFolder(viaLine);
              else ft.select(row.node.path);
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
    }
  });

  // Single consolidated pointermove handler. The canvas previously had THREE
  // separate pointermove listeners (camera pan, right-click gesture, 3D pick).
  // The browser must invoke every registered listener for every dispatched move,
  // so merging them into one means one callback per event instead of three —
  // less main-thread work per move, which is exactly what starves rAF (and tanks
  // FPS) when the mouse flies across the screen, even with input toggled off.
  function onPointerMove(e: PointerEvent) {
    rg.move(e.clientX, e.clientY);
    if (menu.open) {
      const b = bufCoords(s, e.clientX, e.clientY);
      gate.updateHover(b.x, b.y);
    }
    // Analytic settings panel: drive an active slider drag (screen-space), else
    // update hover so rows highlight. A drag returns early so the camera doesn't pan.
    if (s.panel?.open) {
      const b = bufCoords(s, e.clientX, e.clientY);
      if (s.panel.isDragging) { s.panel.drag(b.x, b.y); return; }
      s.panel.updateHover(b.x, b.y);
    }
    // 3D left-click-vs-truck gesture tracking (folded in from the old 3D-pick
    // move listener). Cheap guard; does nothing unless a 3D press is active.
    if (d3.active && (Math.abs(e.clientX - d3.x) > 5 || Math.abs(e.clientY - d3.y) > 5)) d3.moved = true;
    const tracking = s.pointers.has(e.pointerId);
    if (s.cam3d.active) {
      if (s.pointerInput) { const b0 = bufCoords(s, e.clientX, e.clientY); s.mx = b0.x; s.my = b0.y; }
      if (tracking && s.interactive && s.interactive.dragging) {
        const b = bufCoords(s, e.clientX, e.clientY);
        s.pointers.set(e.pointerId, { x: b.x, y: b.y });
        const w = scrToDoc(s, b.x, b.y);
        s.interactive.dragTo(w.x, w.y);
        return;
      }
      // Left-drag pans the free camera; a release without a drag still picks
      // (see the 3D-pick pointerup below).
      if (tracking && s.cameraInput && s.pointers.size === 1) {
        const b = bufCoords(s, e.clientX, e.clientY);
        const prev = s.pointers.get(e.pointerId)!;
        s.pointers.set(e.pointerId, { x: b.x, y: b.y });
        orbitTruck(b.x - prev.x, b.y - prev.y, s.tCanvas.height);
      }
      return;
    }
    // With pointer input off, the ONLY work left is camera pan while dragging —
    // an untracked move does nothing (no mx/my, no hover downstream in frame()).
    if (!s.pointerInput && !tracking && !midDown) return;
    const b = bufCoords(s, e.clientX, e.clientY);
    if (s.pointerInput) { s.mx = b.x; s.my = b.y; }
    // Middle-drag: scroll the document, or zoom toward the cursor while right
    // is held. Independent of left-button tracking (the two can chord).
    if (midDown && !s.cam3d.active && s.cameraInput) {
      const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
      const dx = b.x - midX, dy = b.y - midY;
      midX = b.x; midY = b.y;
      if (s.rightDown) {
        const wx = (b.x - Cw / 2) / s.camZ + s.camX, wy = (b.y - Ch / 2) / s.camZ + s.camY;
        s.camZ *= Math.exp(-dy * 0.005);
        if (s.camZ < s.minZoom) { s.camZ = s.minZoom; s.camX = s.PAGE_W / 2; s.camY = s.docH / 2; }
        else { s.camX = wx - (b.x - Cw / 2) / s.camZ; s.camY = wy - (b.y - Ch / 2) / s.camZ; }
        s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
        s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;
      } else {
        s.camX -= dx / s.camZ; s.camY -= dy / s.camZ;
        s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
      }
      return;
    }
    if (!tracking) return;
    const prev = s.pointers.get(e.pointerId)!;
    s.pointers.set(e.pointerId, { x: b.x, y: b.y });
    if (s.pointerInput) {
      // windgraph interactive drag: move the grabbed point + live recompute.
      if (s.interactive && s.interactive.dragging) {
        const w = scrToWorld(s, b.x, b.y);
        s.interactive.dragTo(w.x, w.y);
        return;
      }
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
    }
    // Left-drag pans the camera — UNLESS the press started on a text surface,
    // in which case the selection branches above consumed the drag (that's the
    // "text cursor shown → drag selects; otherwise → drag pans" rule).
    if (s.pointers.size === 1 && s.cameraInput) {
      s.camX -= (b.x - prev.x) / s.camZ; s.camY -= (b.y - prev.y) / s.camZ;
      s.tgtX = s.camX; s.tgtY = s.camY; s.tgtZ = s.camZ;
      const t = performance.now(), ddt = t - s.lastMoveT;
      if (ddt > 0) { s.velX = s.velX ? s.velX * .7 + ((b.x - prev.x) / ddt) * .3 : (b.x - prev.x) / ddt; s.velY = s.velY ? s.velY * .7 + ((b.y - prev.y) / ddt) * .3 : (b.y - prev.y) / ddt; s.lastMoveT = t; }
    }
  }
  // Register the single consolidated handler. Every dispatched move is counted
  // for the HUD (cheap); the allocating coalesced-event probe + per-event timing
  // only run while the scripted benchmark is active, so the normal path stays as
  // light as possible (one increment + one function call per event).
  on(rCanvas, 'pointermove', (e) => {
    s.evCount++;
    if (s.perf && s.perf.running) {
      const t0 = performance.now();
      s.evCoalesced += (e as any).getCoalescedEvents ? Math.max(1, e.getCoalescedEvents().length) : 1;
      onPointerMove(e);
      s.evHandlerMs += performance.now() - t0;
    } else {
      onPointerMove(e);
    }
  }, { passive: true });

  const rel = () => {
    if (s.selecting && s.activeEdit && s.activeEdit.selAnchor === s.activeEdit.caret) s.activeEdit.selAnchor = -1;
    s.selecting = false;
    s.editorSelecting = false;
    if (s.interactive && !(s.interactive as any).guiMode) s.interactive.endDrag();
    if (s.cam3d.active) setOrbitEnabled(true);
    s.panel?.endDrag();
    sliding = null; slidingPct = -1;
    midDown = false;
    s.pointers.clear(); s.dragging = false; s.pressed = null; if (performance.now() - s.lastMoveT > 80) s.velX = s.velY = 0;
  };
  on(rCanvas, 'pointerup', rel);
  on(rCanvas, 'pointercancel', rel);

  s.lastWheelT = 0;
  s.rightDown = false;
  on(rCanvas, 'pointerdown', (e) => {
    if (e.button !== 2) return;
    if (s.cam3d.active) { setOrbitPanChord(true); return; }
    rg.press(e.clientX, e.clientY);
    s.rightDown = rg.down;
    gate.dismiss();
  });
  on(rCanvas, 'pointerup', (e) => {
    if (e.button !== 2) return;
    if (s.cam3d.active) { setOrbitPanChord(false); return; }
    const wasShort = rg.release();
    s.rightDown = rg.down;
    if (wasShort && s.pointerInput) {
      // Screen-space overlay: anchor at the cursor in backing-store px, scaled by
      // uiScale (backing px per CSS px) so the menu's px constants land at true
      // CSS size on the overlay regardless of the render-resolution dial.
      const b = bufCoords(s, e.clientX, e.clientY);
      gate.setViewport(s.tCanvas.width, s.tCanvas.height);
      gate.show(b.x, b.y, buildMenuItems(), uiScale(s));
    }
  });
  on(rCanvas, 'pointercancel', (e) => { if (e.button === 2) { rg.release(); s.rightDown = rg.down; setOrbitPanChord(false); } });
  on(rCanvas, 'contextmenu', (e) => e.preventDefault());

  // ── Double-click to fit ────────────────────────────────────────────────────
  // Double-clicking a non-text element smoothly fits it to the screen — the
  // recreation of yasmineOS's HybridUIComponent.zoom, which we used to call on
  // double-click there (a board/card/page here is the component equivalent).
  // Text surfaces own double-click (word/token selection) and are skipped.
  on(rCanvas, 'dblclick', (e) => {
    if (!s.pointerInput) return;
    const b = bufCoords(s, e.clientX, e.clientY);
    const w = s.cam3d.active ? scrToDoc(s, b.x, b.y) : scrToWorld(s, b.x, b.y);
    if (s.editorMode && s.editor) {
      const ed = s.editor;
      if (w.x >= ed.x0 && w.x <= ed.x0 + ed.contentWidth() && w.y >= ed.y0 && w.y <= ed.y0 + ed.contentHeight()) return;
    }
    const hit = hitTest(s.docRoot, w.x, w.y);
    if (hit && findEditableAncestor(hit)) return;
    let bx: number, by: number, bw: number, bh: number;
    if (hit) { bx = hit.x; by = hit.y; bw = hit.w; bh = hit.h; }
    else {
      const pg = s.pageRoots.find((p) => w.x >= p.x && w.x <= p.x + p.w && w.y >= p.y && w.y <= p.y + p.h);
      if (!pg) return;
      bx = pg.x; by = pg.y; bw = pg.w; bh = pg.h;
    }
    orbitZoomToRect(bx, by, bx + bw, by + bh, s.tCanvas.width, s.tCanvas.height);
  });

  // Middle-button drag scrolls (pans) the document in 2D; with right held it
  // zooms toward the cursor instead (right = shift-modifier for the mouse).
  // In 3D camera-controls owns the middle button (truck, dolly while chorded).
  let midDown = false, midX = 0, midY = 0;
  on(rCanvas, 'pointerdown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault(); // cancel the compatibility mousedown → no autoscroll
    if (s.cam3d.active || !s.cameraInput) return;
    midDown = true;
    const b = bufCoords(s, e.clientX, e.clientY);
    midX = b.x; midY = b.y;
    s.velX = s.velY = 0;
  });
  const midUp = (e: PointerEvent) => { if (e.button === 1) midDown = false; };
  on(rCanvas, 'pointerup', midUp);
  on(rCanvas, 'pointercancel', midUp);

  // Wheel: normal = smooth scroll, right-click held OR trackpad pinch (ctrlKey)
  // = zoom to cursor. Trackpad pinch-zoom is delivered as a wheel event with
  // ctrlKey set, so we treat that as the zoom gesture.
  on(rCanvas, 'wheel', (e) => {
    e.preventDefault();
    if (!s.cameraInput) return;
    s.lastWheelT = performance.now();
    rg.wheel();

    const b = bufCoords(s, e.clientX, e.clientY);
    const w = s.cam3d.active ? scrToDoc(s, b.x, b.y) : scrToWorld(s, b.x, b.y);

    let panel: string | null = null;
    if (!rg.down) {
      if (s.fileTree) {
        const ft = s.fileTree;
        if (w.x >= ft.x0 && w.x <= ft.x0 + ft.width && w.y >= ft.y0 && w.y <= ft.y0 + ft.contentHeight) panel = 'fileTree';
      }
      if (!panel && s.editorMode && s.editor) {
        const ed = s.editor;
        if (w.x >= ed.x0 && w.x <= ed.x0 + ed.contentWidth() && w.y >= ed.y0 && w.y <= ed.y0 + ed.contentHeight()) panel = 'editor';
      }
    }
    const decision = routeScroll(rg.down, panel);
    if (decision.kind === 'scroll') {
      if (decision.panel === 'fileTree') s.fileTree!.scrollBy((e.deltaY / s.camZ) * 0.9);
      else if (decision.panel === 'editor' && s.editor) {
        s.editor.y0 -= e.deltaY * 0.5;
        const maxScroll = Math.max(0, s.editor.contentHeight() - (s.tCanvas.height / s.dpr - s.editor.y0));
        s.editor.y0 = Math.max(s.editor.y0, -maxScroll);
      }
      e.stopImmediatePropagation();
      return;
    }

    if (s.cam3d.active) return;
    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    if (rg.down || e.ctrlKey) {
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
  }, { passive: false, capture: true });

  // ── 3D picking ────────────────────────────────────────────────────────────
  // While the camera-controls library owns left-drag (truck), a left *click*
  // (press+release with no drag) is a pick: ray-cast onto the grounded document
  // and run the same hit logic as 2D — file tree, controls, and edit focus.
  let d3 = { x: 0, y: 0, t: 0, moved: false, active: false };
  function handle3DPick(w: { x: number; y: number }, shift: boolean) {
    if (s.editor) {
      const ed = s.editor;
      if (w.x >= ed.x0 && w.x <= ed.x0 + ed.contentWidth() && w.y >= ed.y0 && w.y <= ed.y0 + ed.contentHeight()) {
        ed.focused = true; ed.placeCursor(w.x, w.y, shift); ed.anchor = { line: ed.cursor.line, col: ed.cursor.col }; return;
      }
    }
    if (s.fileTree) {
      const ft = s.fileTree;
      if (w.x >= ft.x0 && w.x <= ft.x0 + ft.width && w.y >= ft.y0 && w.y <= ft.y0 + ft.contentHeight) {
        ft.focused = true;
        const row = ft.rowAtY(w.y);
        if (row) {
          if (row.node.type === 'folder') ft.toggleFolder(row.node.path);
          else { const viaLine = ft.connectorTarget(w.x, row); if (viaLine) ft.toggleFolder(viaLine); else ft.select(row.node.path); }
        }
        return;
      }
    }
    const hit = hitTest(s.docRoot, w.x, w.y);
    const sl = sliderOf(hit);
    if (sl) { setSliderFromX(sl, w.x); refreshLayout(s); return; }
    if (hit && handleClickInteraction(s, hit)) return;
    const ed = findEditableAncestor(hit);
    if (ed) {
      s.activeEdit = ed;
      _editTmp.length = 0; _editTmpCrv.length = 0; _editTmpRws.length = 0;
      layoutEditable(ed, s.font, s.atlas, _editTmp, _editTmpCrv, _editTmpRws, 2 / cameraScale(s), performance.now(), false, s.themeCol.caret, s.themeCol.sel);
      placeCaretAtPoint(ed, w.x, w.y);
      ed.selAnchor = ed.caret;
      return;
    }
    s.activeEdit = null;
  }
  on(rCanvas, 'pointerdown', (e) => {
    if (e.button !== 0 || !s.cam3d.active) return;
    if (!s.pointerInput) return; // pointer input disabled (toolbar toggle)
    d3 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, active: true };
  });
  on(rCanvas, 'pointerup', (e) => {
    if (e.button !== 0 || !d3.active) return;
    d3.active = false;
    if (d3.moved || performance.now() - d3.t > 400) return; // was a truck drag, not a click
    const b = bufCoords(s, e.clientX, e.clientY);
    handle3DPick(scrToDoc(s, b.x, b.y), e.shiftKey);
  });

  // ── Text editing ────────────────────────────────────────────────────────
  on(window, 'keydown', (e) => {
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
  return () => ac.abort();
}
