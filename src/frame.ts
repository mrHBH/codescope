// ── Frame loop ──────────────────────────────────────────────────────────────
// Builds the instance buffer each frame: static backgrounds, dynamic
// (hover/animated) backgrounds, then all text including editable elements, and
// submits a single GPU draw call.

import type { AppState } from './state';
import type { StyledEl } from './layout/types';
import { addRect } from './layout/metrics';
import { layoutFlow } from './layout/flow';
import { layoutEditable } from './layout/editable';
import { hitTest } from './layout/walk';
import { stepCamera } from './camera/camera';
import { cameraViewProj, cameraScale, scrToDoc } from './camera/camera';
import type { EditorTheme } from './editor/editor';
import type { TerminalTheme } from './editor/terminal';
import type { FileTreeTheme } from './editor/fileTree';
import { DEPTH_FORMAT } from './windfoil/mesh3d';
import { EmitCache } from './windfoil/emitCache';

// Shared depth texture for the 3D mesh pass, recreated when the canvas resizes.
let _depthTex: GPUTexture | null = null;
let _depthView: GPUTextureView | null = null;
let _depthW = 0, _depthH = 0;
function ensureDepthView(device: GPUDevice, w: number, h: number): GPUTextureView {
  if (!_depthTex || _depthW !== w || _depthH !== h) {
    _depthTex?.destroy();
    _depthTex = device.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    _depthView = _depthTex.createView();
    _depthW = w; _depthH = h;
  }
  return _depthView!;
}

// Conservative clip-space frustum test for a doc-plane rect (z = 0). Returns
// false only when the whole rect is provably outside a single frustum plane — so
// in the 3D free camera we skip emitting boards/pages that aren't on screen
// (otherwise EVERY board + page emits every frame, tanking FPS in 3D).
function rect3DVisible(vp: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number): boolean {
  const cs: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  let left = 0, right = 0, top = 0, bot = 0, behind = 0;
  for (const [x, y] of cs) {
    const cx = vp[0] * x + vp[4] * y + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[15];
    if (cx < -cw) left++;
    if (cx > cw) right++;
    if (cy < -cw) top++;
    if (cy > cw) bot++;
    if (cw <= 1e-6) behind++;
  }
  return !(left === 4 || right === 4 || top === 4 || bot === 4 || behind === 4);
}

function terminalTheme(): TerminalTheme {
  // A fixed dark VS Code-ish palette (the terminal reads as a dark surface in
  // every app theme — like a real embedded shell).
  return {
    bg: [0.086, 0.086, 0.098, 1],      // #16161a
    barBg: [0.13, 0.13, 0.15, 1],
    barFg: [0.7, 0.72, 0.78, 1],
    text: [0.83, 0.85, 0.90, 1],
    dim: [0.45, 0.48, 0.55, 1],
    prompt: [0.83, 0.85, 0.90, 1],
    green: [0.42, 0.80, 0.44, 1],
    cyan: [0.35, 0.82, 0.94, 1],
    yellow: [0.95, 0.76, 0.35, 1],
    red: [0.88, 0.40, 0.38, 1],
    magenta: [0.72, 0.48, 0.96, 1],
    caret: [0.62, 0.82, 0.55, 1],
  };
}

function fileTreeTheme(): FileTreeTheme {
  return {
    bg: [0.086, 0.086, 0.098, 1],       // #16161a
    barBg: [0.13, 0.13, 0.15, 1],
    barFg: [0.7, 0.72, 0.78, 1],
    text: [0.83, 0.85, 0.90, 1],
    dim: [0.56, 0.58, 0.64, 1],
    gold: [0.86, 0.71, 0.48, 1],         // #dcb67a — yasmineoss folder gold
    folder: [0.83, 0.85, 0.90, 1],       // folder name color
    line: [0.48, 0.40, 0.27, 1],         // warm rails (reference style)
    accent: [0.86, 0.71, 0.48, 1],       // chevron/branch highlight in folder-gold
    selected: [0.10, 0.34, 0.52, 0.42],  // subdued cyan selection strip
    hover: [1, 1, 1, 0.05],              // hover highlight
  };
}

function editorTheme(s: AppState): EditorTheme {
  const c = s.themeCol;
  const dark = s.isDark;
  return {
    bg: dark ? [0.06, 0.07, 0.10, 1] : [0.96, 0.97, 0.99, 1],
    gutterBg: dark ? [0.04, 0.05, 0.08, 1] : [0.92, 0.94, 0.97, 1],
    gutterFg: dark ? [0.42, 0.45, 0.58, 1] : [0.38, 0.42, 0.50, 1],
    curLineFg: dark ? [0.85, 0.88, 0.96, 1] : [0.18, 0.22, 0.30, 1],
    curLineBg: dark ? [1, 1, 1, 0.04] : [0.03, 0.16, 0.36, 0.08],
    text: dark ? [0.804, 0.839, 0.957, 1] : [0.14, 0.18, 0.26, 1],
    caret: dark ? [0.95, 0.96, 1, 1] : [0.10, 0.14, 0.22, 1],
    sel: [c.sel[0], c.sel[1], c.sel[2], 0.4],
  };
}

export function runFrame(s: AppState) {
  let prevTs = 0, fpsDt = 16, lastFpsShown = 0, lastCursor = '';
  // Emit caches for STATIC world-space boards (see windfoil/emitCache.ts):
  // their geometry only changes with zoom/clip (windgraph LOD), mode (bench) or
  // a new benchmark run (results) — not per frame. Animated boards (morph,
  // interactive, math) are excluded and keep re-emitting.
  const windgraphCache = new EmitCache();
  const benchCache = new EmitCache();
  const resultsCache = new EmitCache();
  // Perf instrumentation (temporary): JS time spent inside frame(), worst frame
  // gap over the HUD window, and pointer-event rate — lets us tell a main-thread
  // (JS/style) stall apart from a compositor/GPU stall while moving the mouse.
  // Pointer-move counting now happens in the single consolidated handler
  // (input.ts, writing s.evCount) rather than a separate window listener here —
  // one fewer listener dispatched per event.
  let jsMs = 0, worstDt = 0, evAccum = 0, evPerS = 0, lastEvT = performance.now();

  function frame(now: number) {
    requestAnimationFrame(frame);
    const t0 = performance.now();
    const dt = prevTs ? now - prevTs : 16; prevTs = now;
    fpsDt = fpsDt * .9 + dt * .1;
    if (dt > worstDt) worstDt = dt;
    // Snapshot + reset this frame's pointer-move counters (written by the single
    // consolidated handler in input.ts). Per-frame reset is exactly right: every
    // move dispatched since the last frame is attributed to this frame, so the
    // benchmark can correlate a frame gap with the input burst that caused it.
    const evThisFrame = s.evCount, evCoalThisFrame = s.evCoalesced, evMsThisFrame = s.evHandlerMs;
    s.evCount = 0; s.evCoalesced = 0; s.evHandlerMs = 0;
    evAccum += evThisFrame;
    // Throttle the FPS-overlay DOM write to ~8Hz. A textContent write every frame
    // dirties layout, and a pointer event that lands between frames then forces a
    // synchronous layout flush — extra main-thread cost exactly while moving.
    if (now - lastFpsShown > 120) {
      lastFpsShown = now;
      const z = s.viewZ;
      const zoomStr = z < 1 ? z.toFixed(2) : z < 100 ? z.toFixed(1) : z < 1e4 ? `${(z / 1e3).toFixed(1)}K` : z < 1e7 ? `${(z / 1e6).toFixed(1)}M` : `${(z / 1e9).toFixed(1)}G`;
      const evDt = (t0 - lastEvT) / 1000; lastEvT = t0;
      evPerS = evDt > 0 ? Math.round(evAccum / evDt) : 0; evAccum = 0;
      const perfTag = s.perf && s.perf.running ? `  ·  ${s.perf.status()}` : '';
      s.fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps  ·  ${zoomStr}×  ·  js ${jsMs.toFixed(1)}ms  ·  worst ${worstDt.toFixed(0)}ms  ·  ev ${evPerS}/s${perfTag}`;
      worstDt = 0;
    }

    if (s.demo && s.demo.running) s.demo.update(now);
    else if (s.perf && s.perf.running) s.perf.update(now);
    else stepCamera(s, dt, now);

    // Per-segment JS profiling — only while the benchmark runs (performance.now()
    // per segment is not free). Marks accumulate ms since the previous mark.
    const prof: Record<string, number> | null = s.perf && s.perf.running ? Object.create(null) : null;
    let profT = prof ? performance.now() : 0;
    const mark = (name: string) => {
      if (!prof) return;
      const t = performance.now();
      prof[name] = (prof[name] || 0) + (t - profT);
      profT = t;
    };

    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    s.mwx = (s.mx - Cw / 2) / s.viewZ + s.viewX;
    s.mwy = (s.my - Ch / 2) / s.viewZ + s.viewY;
    // In 3D the world-mouse comes from ray-casting the pointer onto the ground.
    if (s.cam3d.active) { const d = scrToDoc(s, s.mx, s.my); s.mwx = d.x; s.mwy = d.y; }

    // This frame's view-projection (used for 3D frustum culling below + the draw).
    const viewProj = cameraViewProj(s, Cw, Ch);

    // Viewport bounds in world space (+margin) → which pages are on screen. Off-screen
    // pages contribute no instances, so we skip their (large) static text/bg buffers.
    const marginX = 200 / s.viewZ, marginY = 200 / s.viewZ;
    const vL = (0 - Cw / 2) / s.viewZ + s.viewX - marginX;
    const vR = (Cw - Cw / 2) / s.viewZ + s.viewX + marginX;
    const vT = (0 - Ch / 2) / s.viewZ + s.viewY - marginY;
    const vB = (Ch - Ch / 2) / s.viewZ + s.viewY + marginY;
    const visible = s.pageVisible;
    for (let p = 0; p < s.pageRoots.length; p++) {
      const pg = s.pageRoots[p];
      visible[p] = s.cam3d.active
        ? rect3DVisible(viewProj, pg.x, pg.y, pg.x + pg.w, pg.y + pg.h)
        : (pg.x <= vR && pg.x + pg.w >= vL && pg.y <= vB && pg.y + pg.h >= vT);
    }

    // Visibility test for a world-space board/panel rect (3D frustum cull in the
    // free camera, 2D viewport-overlap otherwise) so off-screen boards never emit.
    const boardVis = (x0: number, y0: number, x1: number, y1: number): boolean =>
      s.cam3d.active ? rect3DVisible(viewProj, x0, y0, x1, y1) : (x0 <= vR && x1 >= vL && y0 <= vB && y1 >= vT);

    // Skip expensive hit-test + resolveStyle during wheel zoom (200ms cooldown),
    // or entirely when pointer input is toggled off.
    const wheelCool = (performance.now() - s.lastWheelT) < 200;
    mark('setup');
    const hovered = (wheelCool || !s.pointerInput) ? null : hitTest(s.docRoot, s.mwx, s.mwy);
    const hoveredSet = new Set<StyledEl>();
    if (hovered) { let cur: StyledEl | null = hovered; while (cur) { hoveredSet.add(cur); cur = cur.parent; } }

    // File tree hover detection (world-space panel, not in DOM)
    if (s.fileTree && !wheelCool && s.pointerInput) {
      const ft = s.fileTree;
      if (s.mwx >= ft.x0 && s.mwx <= ft.x0 + ft.width && s.mwy >= ft.y0 && s.mwy <= ft.y0 + ft.contentHeight) {
        const row = ft.rowAtY(s.mwy);
        ft.hovered = row ? row.node.path : null;
      } else {
        ft.hovered = null;
      }
    }
    mark('hover');

    // Build working arrays: base atlas + pre-computed static backgrounds
    const crv: number[] = s.baseCrv as number[];
    crv.length = s.baseCrvLen;
    for (let i = 0; i < s.preCrvLen; i++) crv.push(s.preCrv[i]);
    const rws: number[] = s.baseRws as number[];
    rws.length = s.baseRwsLen;
    for (let i = 0; i < s.preRwsLen; i++) rws.push(s.preRws[i]);
    s.instJS.length = 0;
    const inst: number[] = s.instJS;
    // Layer 1: static backgrounds (visible pages only)
    for (let p = 0; p < s.bgByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.bgByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }
    mark('staticCopy');

    const k = 1 - Math.pow(0.0015, dt / 1000);
    let cursor = 'grab';
    // Layer 2: dynamic backgrounds (hover, bounce, heartbeat, progress, pulse) — BEFORE text.
    // Only elements flagged `dynamic` in walkDOM reach this loop; static text/boxes
    // are already baked into the precomputed buffers.
    for (const el of s.dynamicEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      const isHov = hoveredSet.has(el), isAct = el === s.pressed;
      if (isHov || isAct) {
        // Hover/active background is precomputed in buildStatic (no per-frame CSS
        // selector matching — that was the mouse-move FPS killer).
        const hovBg = isHov ? el.hoverBg : el.activeBg;
        if (hovBg) for (let i = 0; i < 4; i++) el.curBg[i] += (hovBg[i] - el.curBg[i]) * k;
        if (isHov && el.hoverable) cursor = 'pointer';
      } else {
        for (let i = 0; i < 4; i++) el.curBg[i] += (el.bg[i] - el.curBg[i]) * k;
      }

      const tgtShadow = el.shadowable && isHov ? 1 : 0;
      el.curShadow += (tgtShadow - el.curShadow) * k;

      const anim = el.anim;
      if (anim === 'bounce') {
        const dy = Math.sin(now / 520) * 8;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'heartbeat') {
        const sc = 1 + Math.sin(now / 380) * 0.065;
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'glow') {
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600));
        const g = 18 * pulse;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [el.curBg[0], el.curBg[1], el.curBg[2], 0.35 * pulse], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'float') {
        const dy = Math.sin(now / 900) * 12;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'spin') {
        const sc = 0.85 + 0.15 * Math.sin(now / 450);
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'shimmer') {
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
        const shimX = el.x + ((now * 0.12) % (el.w + 60)) - 30;
        addRect(shimX, el.y, shimX + 30, el.y + el.h, [1, 1, 1, 0.12], crv, rws, inst);
      }
      if ((isHov || isAct) && el.curShadow > 0.01) {
        const g = 14 * el.curShadow;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [s.themeCol.shadow[0], s.themeCol.shadow[1], s.themeCol.shadow[2], s.themeCol.shadow[3] * el.curShadow], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, crv, rws, inst);
      } else if (anim === '' && (isHov || isAct)) {
        // Hover/active fill for non-animated controls (buttons, tabs, toggles,
        // dropdown, cards). Inset by the border so the baked border ring stays
        // visible; the baked static bg beneath is fully covered by curBg.
        const [bt, br, bb, bl] = el.borderW;
        addRect(el.x + bl, el.y + bt, el.x + el.w - br, el.y + el.h - bb, el.curBg, crv, rws, inst);
      }

      if (anim === 'progress') {
        const frac = ((now % 3200) / 3200);
        const fw = (el.w - el.pad[3] - el.pad[1]) * frac;
        addRect(el.x + el.pad[3], el.y + el.h / 2 - 5, el.x + el.pad[3] + fw, el.y + el.h / 2 + 5, s.themeCol.prog, crv, rws, inst);
      } else if (anim === 'pulse') {
        const a = 0.45 + 0.55 * Math.sin(now / 280);
        addRect(el.x + 2, el.y + el.h / 2 - 7, el.x + 16, el.y + el.h / 2 + 7, [s.themeCol.pulse[0], s.themeCol.pulse[1], s.themeCol.pulse[2], a], crv, rws, inst);
      }
    }

    if (!cursor || cursor === 'grab') {
      let he: StyledEl | null = hovered; while (he && !he.editable) he = he.parent;
      if (he) cursor = 'text';
    }
    // File tree cursor: pointer when hovering over items
    if (s.fileTree && s.fileTree.hovered) {
      cursor = 'pointer';
    }
    mark('dynamic');

    // Layer 3: ALL text (static pre-computed + marquee dynamic + editable) — on top of all backgrounds
    for (let p = 0; p < s.textByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.textByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }
    mark('textCopy');
    for (const el of s.marqueeEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      layoutFlow(el, s.font, s.atlas, inst, now);
    }
    const caretW = 2 / cameraScale(s);
    for (const el of s.editableEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage] && el !== s.activeEdit) continue;
      layoutEditable(el, s.font, s.atlas, inst, crv, rws, caretW, now, el === s.activeEdit, s.themeCol.caret, s.themeCol.sel);
    }
    mark('editable');

    // Code editor (world-space panel). Rendered when it intersects the viewport.
    if (s.editor) {
      const ed = s.editor;
      const edR = ed.x0 + ed.contentWidth(), edB = ed.y0 + ed.contentHeight();
      if (boardVis(ed.x0, ed.y0, edR, edB)) {
        ed.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, editorTheme(s), caretW);
      }
    }
    mark('editor');

    // Terminal (world-space panel). Rendered when it intersects the viewport.
    if (s.terminal) {
      const tm = s.terminal;
      const tR = tm.x0 + tm.contentW, tB = tm.y0 + tm.contentH;
      if (boardVis(tm.x0, tm.y0, tR, tB)) {
        tm.render(s.font, s.atlas, inst, crv, rws, now, dt, terminalTheme(), caretW);
      }
    }

    // File tree (world-space panel).
    if (s.fileTree) {
      const ft = s.fileTree;
      const fR = ft.x0 + ft.width, fB = ft.y0 + ft.contentHeight;
      if (boardVis(ft.x0, ft.y0, fR, fB)) {
        ft.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, fileTreeTheme());
      }
    }
    mark('term+tree');

    // windgraph demo board (world-space).
    // In 3D (cinematic flight) the 2D view bounds/zoom are stale, so pass the
    // camera's on-axis scale and unbounded extents (culling is per-board above).
    const boardView = s.cam3d.active
      ? { zoom: cameraScale(s), left: -1e12, right: 1e12, top: -1e12, bottom: 1e12 }
      : { zoom: s.viewZ, left: vL, right: vR, top: vT, bottom: vB };
    if (s.windgraph) {
      const g = s.windgraph;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        // Cache by ZOOM + a TILE-QUANTIZED clip. The board's emit re-runs marching-
        // squares / field-sampling / stroking on every call (~10-14ms) and the old
        // signature embedded the exact per-frame clip rect, so it MISSED every pan
        // frame → that cost recurred each frame (the dominant movement stutter).
        // Fix: snap the view∩board clip OUTWARD to a coarse world grid. Within a
        // tile the signature — and the emitted, clipped geometry — is constant, so
        // panning replays the cache instead of rebuilding; a rebuild happens only
        // when the camera crosses a tile boundary (a few times/sec, not per frame).
        // Expanding outward keeps the cached clip a strict SUPERSET of the viewport
        // (nothing pops in mid-tile) while staying viewport-bounded (no full-board
        // instance bloat — the mistake that made a naive "emit everything" regress).
        let wgView: { zoom: number; left: number; right: number; top: number; bottom: number };
        let sig: string;
        if (s.cam3d.active) {
          wgView = { zoom: cameraScale(s), left: -1e12, right: 1e12, top: -1e12, bottom: 1e12 };
          sig = `3d|${wgView.zoom}`;
        } else {
          const TILE = 1200; // world px; larger = fewer rebuilds but more instances/rebuild
          const eL = Math.floor(Math.max(vL, g.x0) / TILE) * TILE;
          const eT = Math.floor(Math.max(vT, g.y0) / TILE) * TILE;
          const eR = Math.ceil(Math.min(vR, gR) / TILE) * TILE;
          const eB = Math.ceil(Math.min(vB, gB) / TILE) * TILE;
          wgView = { zoom: s.viewZ, left: eL, right: eR, top: eT, bottom: eB };
          sig = `2d|${s.viewZ.toPrecision(5)}|${eL},${eT},${eR},${eB}`;
        }
        windgraphCache.run(sig, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws, now, wgView));
      }
    }
    mark('windgraph');

    // windgraph Phase-4 animation board (world-space).
    if (s.morphDemo) {
      const g = s.morphDemo;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
      }
    }
    mark('morph');

    // windgraph Phase-5 interactive board (world-space, draggable).
    if (s.interactive) {
      const g = s.interactive;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        // Update hover BEFORE emit so the hover ring is current; the cursor is
        // applied once at the end of the frame (deferred write).
        const over = !wheelCool && s.pointerInput && (g.dragging || g.updateHover(s.mwx, s.mwy, cameraScale(s)));
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
        if (over) cursor = g.dragging ? 'grabbing' : 'grab';
      }
    }
    mark('interact');

    // windgraph Phase-7 3D graphing board is drawn as a TRUE 3D mesh (below, in
    // the render pass) — not as windfoil instances — so it rises off the ground.

    // windgraph Phase-6 math typesetting board (world-space).
    if (s.mathDemo) {
      const g = s.mathDemo;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        g.emit(s.font, s.atlas, inst, crv, rws, now, boardView);
      }
    }
    mark('math');

    // Perf isolation bench (world-space). Output depends only on the mode.
    if (s.bench) {
      const g = s.bench;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (boardVis(g.x0, g.y0, gR, gB)) {
        benchCache.run(`m${g.mode}`, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws, now, boardView));
      }
    }

    // Scripted benchmark results board (world-space; see perf/benchmark.ts).
    // Static once computed; only changes when a new run finishes (version).
    if (s.perf && s.perf.showResults) {
      const g = s.perf;
      if (boardVis(g.x0, g.y0, g.x0 + g.width, g.y0 + g.height)) {
        resultsCache.run(`r${g.version}`, inst, crv, rws, () => g.emit(s.font, s.atlas, inst, crv, rws));
      }
    }
    mark('bench');

    // Deferred cursor write: mutating style.cursor every frame dirties style and
    // makes each incoming pointer event pay a synchronous style-recalc — a classic
    // mouse-move FPS killer. Only touch the DOM when the cursor actually changes.
    if (cursor !== lastCursor) { lastCursor = cursor; s.rCanvas.style.cursor = cursor; }

    // Backdrop is a static CSS background on the canvas (set on theme change) —
    // not a per-frame full-screen 2D fill, which the compositor had to re-upload
    // every frame (extra GPU/composite load that competed with rendering + cursor
    // compositing while moving the mouse). The WebGPU canvas is transparent where
    // nothing is drawn, so the CSS backdrop shows through.
    if (crv.length > s.crvFA.length) s.crvFA = new Float32Array(crv.length * 2);
    s.crvFA.set(crv);
    if (rws.length > s.rwsUA.length) s.rwsUA = new Uint32Array(rws.length * 2);
    s.rwsUA.set(rws);
    // Upload instance buffer. In 2D mode, subtract camera center from each
    // instance origin in JS (f64) so the GPU sees small coordinates even at
    // extreme zoom — true infinite zoom. 3D mode passes absolute coords because
    // orbitViewProj handles the camera transform internally.
    if (inst.length > s.instFA.length) s.instFA = new Float32Array(inst.length * 2);
    if (s.cam3d.active) {
      s.instFA.set(inst);
    } else {
      const cx = s.viewX, cy = s.viewY;
      for (let i = 0; i < inst.length; i += 16) {
        s.instFA[i] = inst[i] - cx;       // place.x relative to camera (f64→f32)
        s.instFA[i + 1] = inst[i + 1] - cy;
        for (let j = 2; j < 16; j++) s.instFA[i + j] = inst[i + j];
      }
    }
    mark('upload');
    const enc = s.device.createCommandEncoder();
    // Low-res-render + sharpen-upscale: when enabled, the analytic coverage pass
    // draws into an offscreen texture at integralScale × the swapchain, then a
    // contrast-adaptive sharpen upscales it to the full-res swapchain. viewProj is
    // UNCHANGED — clip space is resolution-independent and the resolve is a 1:1
    // NDC fullscreen pass, so content lands identically; only the per-pixel
    // coverage footprint (dpdx/dpdy) grows, giving correct cheaper low-res shading.
    const sharpen = s.lowResSharpen && !!s.upscaler;
    const iScale = sharpen ? Math.min(Math.max(s.integralScale, 0.25), 1) : 1;
    const renderW = sharpen ? Math.max(1, Math.round(Cw * iScale)) : Cw;
    const renderH = sharpen ? Math.max(1, Math.round(Ch * iScale)) : Ch;
    const depthView = ensureDepthView(s.device, renderW, renderH);
    const swapView = s.gpuCtx.getCurrentTexture().createView();
    const colorView = sharpen ? s.upscaler!.target(renderW, renderH) : swapView;
    // Clear to the theme backdrop: the canvas is OPAQUE (see main.ts), so the
    // backdrop is painted here instead of showing a CSS background through a
    // transparent canvas (which cost a full-screen compositor blend per frame).
    const bd = s.themeCol.backdrop;
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: bd[0], g: bd[1], b: bd[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    // View-projection: orthographic (2D) or perspective (3D free camera). camScale
    // feeds the AA-skirt pad; camCenter moves camera translation out of the matrix
    // (into the vertex shader) so the matrix terms stay small at extreme zoom.
    const camScale = cameraScale(s);
    // TRUE 3D: draw the surface mesh FIRST (it writes depth + self-occludes); the
    // analytic windfoil pass then renders on top (depth-agnostic), so document +
    // labels stay crisp above the surface. The mesh renders in BOTH modes so the
    // graph is seamless: a flat top-down colour map in 2D, rising off the ground
    // in the 3D free-camera. In 2D it uses a full ortho (camera pan/zoom baked in,
    // z ignored → flat); in 3D it shares the orbit view-projection (height rises).
    if (s.graph3d && s.meshRenderer) {
      const g = s.graph3d;
      const inView3D = s.cam3d.active && rect3DVisible(viewProj, g.cx - g.halfSpan, g.cy - g.halfSpan, g.cx + g.halfSpan, g.cy + g.halfSpan);
      const inView2D = !s.cam3d.active && (g.cx - g.halfSpan <= vR && g.cx + g.halfSpan >= vL && g.cy - g.halfSpan <= vB && g.cy + g.halfSpan >= vT);
      if (inView3D || inView2D) {
        let meshVP: ArrayLike<number> = viewProj;
        if (!s.cam3d.active) {
          const sx = (2 * s.viewZ) / Cw, sy = (2 * s.viewZ) / Ch;
          // column-major: maps doc (x,y) → clip (x-viewX)*sx, -(y-viewY)*sy, z→0.5
          meshVP = [sx, 0, 0, 0, 0, -sy, 0, 0, 0, 0, 0, 0, -sx * s.viewX, sy * s.viewY, 0.5, 1];
        }
        const m = g.buildMesh();
        s.meshRenderer.setViewProj(meshVP);
        s.meshRenderer.drawTris(pass, m.tris);
        s.meshRenderer.drawLines(pass, m.lines);
      }
    }
    s.renderer.setUniforms({ width: renderW, height: renderH, camScale: [camScale, camScale], camCenter: [0, 0], viewProj });
    s.renderer.draw(pass, s.crvFA.subarray(0, crv.length), s.rwsUA.subarray(0, rws.length), s.instFA.subarray(0, inst.length), inst.length / 16);
    pass.end();
    // Sharpen-upscale the low-res render to the full-res swapchain.
    if (sharpen) s.upscaler!.resolve(enc, swapView, renderW, renderH, Cw, Ch, s.sharpenAmount);
    s.device.queue.submit([enc.finish()]);
    mark('encode');
    const frameJs = performance.now() - t0;
    jsMs = jsMs * .9 + frameJs * .1;
    if (s.perf && s.perf.running) s.perf.sample(dt, frameJs, inst.length / 16, prof, evThisFrame, evCoalThisFrame, evMsThisFrame);
  }
  requestAnimationFrame(frame);
}
