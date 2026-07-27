import type { Engine } from '../playground/engine';
import { advanceOf } from '../windfoil/font';
import { createGlyphRenderer } from '../windfoil/gpu';
import { addRect, layoutStr, layoutIcon } from '../layout/metrics';
import { CodeEditor, type EditorTheme } from '../editor/editor';
import { Terminal, type TerminalTheme } from '../editor/terminal';
import { FileTree, type FileTreeTheme, type TreeNode } from '../editor/fileTree';
import { DEPTH_FORMAT } from '../windfoil/mesh3d';
import { ScreenHud } from '../ui/screenHud';
import { FpsChip } from '../ui/fpsChip';
import { AnalyticToolbar, type ToolbarButton } from '../ui/analyticToolbar';
import { AnalyticPanel, ANALYTIC_PANEL_THEME } from '../ui/analyticPanel';
import { enterOrbit, orbitViewProj, orbitScale, setOrbitEnabled, updateOrbit, screenToDocLocal, setOrbitNear, setOrbitPanChord, orbitTruck, orbitZoomToRect, orbitPolar, orbitAzimuth, orbitSetAngles, orbitTargetLocal } from '../camera/orbit';
import { screenLockedPose, poseXform, worldToPose, type ScreenPose } from '../camera/screenWorld';
import { ANALYTIC_MENU_THEME } from '../ui/analyticMenu';
import { MenuGate, MultiClickTracker, RightGesture, routeScroll, resolveCursor } from '../ui/inputRouter';
import { tabMenu, folderMenu, fileMenu, editorMenu, terminalMenu, searchMenu, type IdeMenuActions } from './menus';
import { ideTheme as T } from './theme';
import { REG, FX_NAMES, fxHash, physicsPick, physicsScroll, physicsDead, physics2Pick, physics2Scroll, physics2Dead, type FxMode, type FxCtx } from './fx';
import { SOURCES, SAMPLE_FILES } from './sampleData';

const AB_W = 50;
const SIDEBAR_W = 340;
const TAB_BAR_H = 36;
const STATUS_H = 22;
const TERM_HEADER_H = 28;
const ANIM_MS = 220;

const SB_HEADER_H = 53;
const SB_SEARCH_Y = 61;
const SB_SEARCH_H = 30;
const SB_TOOL_Y = 99;
const SB_TOOL_H = 30;
const SB_TREE_Y = 141;

// Tab bar constants — shared between render / hit-test / click.
const TAB_PAD_L = 12;
const TAB_CLOSE_SZ = 12;
const TAB_CLOSE_GAP = 8;
const TAB_PAD_R = 10;
function tabWidth(name: string, canClose: boolean, textW: (t: string, s: number) => number): number {
  return textW(name, 12) + TAB_PAD_L + (canClose ? TAB_CLOSE_GAP + TAB_CLOSE_SZ : 0) + TAB_PAD_R;
}

const smoothstep = (t: number) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * c * (c * (c * 6 - 15) + 10); };


const editorTh: EditorTheme = {
  bg: T.editorBg,
  gutterBg: [0.118, 0.118, 0.118, 1],
  gutterFg: [0.522, 0.522, 0.522, 1],
  curLineFg: [0.83, 0.83, 0.83, 1],
  curLineBg: [1, 1, 1, 0.04],
  text: [0.831, 0.831, 0.831, 1],
  caret: [0.95, 0.96, 1, 1],
  sel: [0.15, 0.31, 0.47, 0.5],
};

const fileTreeTh: FileTreeTheme = {
  bg: T.containerBg,
  barBg: T.contentBg,
  barFg: T.headerText,
  text: [0.8, 0.8, 0.8, 1],
  dim: [0.533, 0.533, 0.533, 1],
  gold: [0.863, 0.714, 0.478, 1],
  folder: [0.8, 0.8, 0.8, 1],
  line: [0.502, 0.502, 0.502, 0.4],
  accent: [0.0, 0.478, 0.8, 1],
  selected: [0.0, 0.478, 0.8, 0.28],
  hover: [1, 1, 1, 0.06],
};

const terminalTh: TerminalTheme = {
  bg: T.editorBg,
  barBg: T.tabBarBg,
  barFg: T.headerText,
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

export function bootIDE(engine: Engine, onBack: () => void): () => void {
  const { device, font, atlas, renderer, tCanvas, gpuCtx, dpr: dpr0, rCanvas, shaderCode, upscaler } = engine;
  // Effective backing px per CSS px (dpr0 × renderScale). Every CSS↔backing
  // conversion and every chrome size in this file runs through it, so the quality
  // panel's display-resolution dial resizes the swapchain without moving the UI:
  // the 2D ortho (dpr/Cw) and the 3D on-axis orbit scale (∝ Ch) both divide it
  // back out — only sharpness changes, never apparent size.
  let dpr = dpr0;
  let renderScale = 1;
  let lowResSharpen = false;
  let integralScale = 0.6;
  let sharpenAmount = 0.6;
  // Reusable screen-space HUD overlay (toolbar + menus) — same ScreenHud the
  // playground uses. Seeded each frame with the atlas base band tables so menu
  // glyphs resolve, and drawn with a screen-ortho matrix so chrome stays fixed to
  // the screen (this is what makes the FX menu a true overlay, not world-space).
  const screenHud = new ScreenHud(device, shaderCode);
  const fpsEl = engine.fpsEl;
  const prevFpsDisplay = fpsEl.style.display;
  fpsEl.style.display = 'none';
  // Analytic fps chip — same behaviour as the windgraph demos: click cycles
  // fps → full → full+diagnostics, long press copies (and keeps copying at
  // 5Hz while held). The DOM #fps above stays hidden.
  const fpsChip = new FpsChip();

  const tabs = SAMPLE_FILES.map(f => {
    const ed = new CodeEditor(f.code);
    ed.fontSize = 15;
    ed.focused = false;
    return { name: f.name, editor: ed };
  });
  let activeTab = 0;
  tabs[0].editor.focused = true;

  const fileTree = new FileTree();
  fileTree.fontSize = 18;
  fileTree.lineHeightMul = 1.6;
  fileTree.indent = 18;
  fileTree.pad = 4;
  fileTree.iconGap = 12;
  fileTree.showTitleBar = false;
  fileTree.clipPad = 4;
  fileTree.setRoots(SOURCES[1].roots, SOURCES[1].expanded);

  const terminal = new Terminal();
  terminal.fontSize = 14;
  terminal.showTitleBar = false;
  terminal.open();

  const gate = new MenuGate((t, s) => textW(t, s));
  const menu = gate.menu;
  const rg = new RightGesture();
  const mct = new MultiClickTracker();

  let menuWorldPose: { pose: ScreenPose; Wv: number; Hv: number } | null = null;

  let sidebarOpen = true;
  let sidebarT = 1;
  let sidebarDir = 0;

  let termOpen = false;
  let termT = 0;
  let termDir = 0;
  const TERM_H = 220;

  let cam3d = true;
  let showDebug = false;

  let activeSource = 1;
  let searchFocused = false;
  let searchQuery = '';
  let searchCaretPhase = 0;

  let focus: 'editor' | 'terminal' = 'editor';

  // ── Tab animations ───────────────────────────────────────────────────────
  let tabFrom = -1;           // old activeTab during cross-fade (-1 = idle)
  let tabTransT = 0;          // 0→1 progression per-frame
  const TAB_TRANS_MS = 160;

  interface AccentAnim { fromX: number; fromW: number; toX: number; toW: number; start: number; }
  let accentAnim: AccentAnim | null = null;
  const ACCENT_MS = 220;

  // Which tab's close button the pointer is currently over.
  let hoverCloseTab = -1;
  // Tab positions (x + width) filled each frame by the tab renderer, consumed
  // by the accent line animation when activeTab changes.
  const tabPositions: { x: number; w: number }[] = [];

  function switchToTab(i: number) {
    if (i === activeTab) return;
    tabFrom = activeTab;
    tabTransT = 0;
    tabs[activeTab].editor.focused = false;
    activeTab = i;
    tabs[i].editor.focused = true;
  }

  // Shared tab/file helpers — used by both left-click handling and the
  // context-menu actions so behaviour stays in one place.
  function captureMenuWorldPose() {
    if (!cam3d) { menuWorldPose = null; return; }
    const Cw = tCanvas.width, Ch = tCanvas.height;
    const zoom = orbitScale(Ch);
    const tgt = orbitTargetLocal();
    menuWorldPose = { pose: screenLockedPose(Cw, Ch, tgt.x, tgt.y, zoom), Wv: Cw, Hv: Ch };
  }

  function menuScreenToLocal(sx: number, sy: number): [number, number] {
    if (!menuWorldPose) return [sx, sy];
    const p = screenToDocLocal(sx, sy, menuWorldPose.Wv, menuWorldPose.Hv);
    return worldToPose(menuWorldPose.pose, menuWorldPose.Wv, menuWorldPose.Hv, p.x, p.y);
  }

  function showMenuWorld(x: number, y: number, items: Parameters<typeof gate.show>[2], scale: number) {
    gate.show(x, y, items, scale);
    captureMenuWorldPose();
  }

  function closeTabAt(i: number) {
    if (tabs.length <= 1) return;
    tabFrom = -1;                // skip cross-fade on close
    tabs[i].editor.focused = false;
    tabs.splice(i, 1);
    if (activeTab > i) activeTab--;
    else if (activeTab >= tabs.length) activeTab = tabs.length - 1;
    focus = 'editor';
    tabs[activeTab].editor.focused = true;
  }

  function openFileNode(node: TreeNode) {
    const existing = tabs.findIndex(t => t.name === node.name);
    if (existing >= 0) { switchToTab(existing); }
    else {
      const ed = new CodeEditor('// ' + node.path + '\n');
      ed.fontSize = 15;
      tabs.push({ name: node.name, editor: ed });
      tabFrom = -1;  // no cross-fade for newly opened tabs
      activeTab = tabs.length - 1;
    }
    focus = 'editor';
    tabs[activeTab].editor.focused = true;
  }

  // Implementation of every context-menu capability (see menus.ts). Resolves
  // the active tab lazily so actions stay valid as tabs open/close.
  const actions: IdeMenuActions = {
    closeTab: (i) => closeTabAt(i),
    closeOtherTabs: (keep) => {
      tabFrom = -1;
      for (let i = tabs.length - 1; i >= 0; i--) if (i !== keep) tabs.splice(i, 1);
      activeTab = 0;
      focus = 'editor';
      tabs[0].editor.focused = true;
    },
    closeTabsToRight: (i) => {
      tabFrom = -1;
      while (tabs.length > i + 1) tabs.pop();
      if (activeTab > i) activeTab = i;
      tabs[activeTab].editor.focused = true;
    },
    openFile: (node) => openFileNode(node),
    toggleFolder: (path) => fileTree.toggleFolder(path),
    newFileIn: (folder) => {
      const name = prompt('New file name:');
      if (!name?.trim()) return;
      fileTree.addChild(folder.path, { name: name.trim(), path: folder.path + '/' + name.trim(), type: 'file' });
    },
    newFolderIn: (folder) => {
      const name = prompt('New folder name:');
      if (!name?.trim()) return;
      fileTree.addChild(folder.path, { name: name.trim(), path: folder.path + '/' + name.trim(), type: 'folder', children: [] });
    },
    renameNode: (node) => {
      const name = prompt('Rename:', node.name);
      if (name) fileTree.renameNode(node.path, name);
    },
    deleteNode: (node) => fileTree.removeNode(node.path),
    copyPath: (path) => { navigator.clipboard?.writeText(path).catch(() => {}); },
    canUndo: () => tabs[activeTab].editor.doc.canUndo(),
    canRedo: () => tabs[activeTab].editor.doc.canRedo(),
    hasSelection: () => tabs[activeTab].editor.hasSelection(),
    undo: () => tabs[activeTab].editor.undo(),
    redo: () => tabs[activeTab].editor.redo(),
    cut: () => {
      const ed = tabs[activeTab].editor;
      const t = ed.selectedText();
      if (!t) return;
      navigator.clipboard?.writeText(t).catch(() => {});
      ed.insertText('');
    },
    copy: () => {
      const t = tabs[activeTab].editor.selectedText();
      if (t) navigator.clipboard?.writeText(t).catch(() => {});
    },
    paste: () => {
      const ed = tabs[activeTab].editor;
      navigator.clipboard?.readText().then((t) => { if (t) ed.insertText(t.replace(/\r\n/g, '\n')); }).catch(() => {});
    },
    formatDocument: () => tabs[activeTab].editor.formatDocument(),
    toggleComment: () => tabs[activeTab].editor.toggleComment(),
    selectAll: () => tabs[activeTab].editor.selectAll(),
    clearTerminal: () => terminal.clear(),
    closeTerminal: () => {
      termOpen = false; termDir = -1;
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      terminal.focused = false;
    },
    hasQuery: () => searchQuery.length > 0,
    cutQuery: () => {
      if (searchQuery) navigator.clipboard?.writeText(searchQuery).catch(() => {});
      searchQuery = '';
      fileTree.setFilter('');
    },
    copyQuery: () => {
      if (searchQuery) navigator.clipboard?.writeText(searchQuery).catch(() => {});
    },
    pasteQuery: () => {
      navigator.clipboard?.readText().then((t) => {
        if (!t) return;
        searchQuery += t.replace(/\s+/g, ' ').trim();
        fileTree.setFilter(searchQuery);
        searchCaretPhase = 0;
      }).catch(() => {});
    },
    clearQuery: () => { searchQuery = ''; fileTree.setFilter(''); },
  };

  let mx = 0, my = 0;
  let fxMode: FxMode = 'off';
  const isPhys = () => fxMode === 'physics' || fxMode === 'physics2';
  const physPick = (x: number, y: number) => fxMode === 'physics2' ? physics2Pick(x, y) : physicsPick(x, y);
  const physDead = (x: number, y: number) => fxMode === 'physics2' ? physics2Dead(x, y) : physicsDead(x, y);
  const physScroll = (p: 'tree' | 'editor', dy: number) => { if (fxMode === 'physics2') physics2Scroll(p, dy); else physicsScroll(p, dy); };
  let fxXforms = new Float32Array(65536);
  let clipFA = new Float32Array(65536);
  let fx3dActive = false;
  let prevFxMode: FxMode = 'cloth';
  let fwTiltTarget = -1;
  let d3 = { x: 0, y: 0, t: 0, moved: false, active: false };
  let dragSel = false, dragPX = 0, dragPY = 0;
  // "Fitted" = the camera frames the whole IDE (true at boot via enterOrbit
  // and after a double-click fit). While set, window resizes re-fit the camera
  // so the IDE keeps filling the screen; any manual navigation clears it.
  let fitted = true, fitW = cssW(), fitH = cssH();
  let hoverExplorer = false;
  let hoverTerminal = false;
  let hoverSource = -1;
  let hoverAction = -1;
  let hoverSearch = false;
  let hoverTab = -1;
  let prevNow = 0;
  let fpsDt = 16, lastFpsShown = 0, jsMs = 0, worstDt = 0;

  let depthTex: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
  let depthW = 0, depthH = 0;

  const inst: number[] = [];
  const crv: number[] = [];
  const rws: number[] = [];
  let instFA = new Float32Array(65536);
  // Frame-skip state: an idle IDE redraws from persistent GPU buffers (same
  // mechanism as frame.ts) — signature match skips build + convert + upload.
  let lastIdeSig = '';
  let ideDataVersion = 0;
  let lastTotalInst = 0, lastCrvLen = 0, lastRwsLen = 0;
  // Zero-allocation fast path: a numeric pre-hash decides per frame; the string
  // signature is built only when the hash differs. The blink quantum is IN the
  // hash, so a hash collision can never stay stale longer than one quantum.
  let lastQuick = NaN;
  // HUD sig rebuild gate (no per-frame template strings).
  let ideHudSig = '';
  let lastHudTh: string | null = null, lastHudHT = -2, lastHudHCT = -2, lastHudTick = -1, lastHudBlink = -1, lastHudCw = -1, lastHudCh = -1, lastHudGate = false, lastHudPanel = false;
  let lastHudChipMode = -2, lastHudChipStatus = '', lastHudChipPressed = -1;
  // Cached draw subarrays (recreated only on length change or buffer regrowth).
  let subCrv: Float32Array | null = null, subRws: Uint32Array | null = null, subInst: Float32Array | null = null, subXforms: Float32Array | null = null;
  let subCrvBuf: Float32Array | null = null, subRwsBuf: Uint32Array | null = null, subInstBuf: Float32Array | null = null, subXformsBuf: Float32Array | null = null;
  let subCrvLen = -1, subRwsLen = -1, subInstLen = -1, subXformsLen = -1;
  // Caret overlay: its own tiny renderer + buffers so the caret blinks/glides
  // at full rate every frame while the main build stays skipped (a few
  // instances uploaded per frame instead of rebuilding the whole IDE).
  const caretRenderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' });
  const caretInst: number[] = [], caretCrv: number[] = [], caretRws: number[] = [];
  let caretFA = new Float32Array(256), caretCrvFA = new Float32Array(64), caretRwsUA = new Uint32Array(32);
  let subCaretInst: Float32Array | null = null, subCaretCrv: Float32Array | null = null, subCaretRws: Uint32Array | null = null;
  let subCaretInstBuf: Float32Array | null = null;
  let subCaretInstLen = -1, subCaretCrvLen = -1, subCaretRwsLen = -1;
  // Cumulative main builds — frozen while idle proves the skip holds.
  let ideBuilds = 0;
  const vp2d = new Float32Array(16);
  const uCamScale: number[] = [1, 1];
  const uCamCenter: number[] = [0, 0];
  let crvFA = new Float32Array(65536);
  let rwsUA = new Uint32Array(16384);

  function ensureDepth(w: number, h: number): GPUTextureView {
    if (!depthTex || depthW !== w || depthH !== h) {
      depthTex?.destroy();
      depthTex = device.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      depthView = depthTex.createView();
      depthW = w; depthH = h;
    }
    return depthView!;
  }

  function cssW() { return tCanvas.width / dpr; }
  function cssH() { return tCanvas.height / dpr; }

  // Backing store = CSS size × dpr (effective). Called on window resize and by the
  // quality panel's display-resolution dial, which moves dpr itself (renderScale)
  // so the swapchain resizes while every CSS-px conversion stays consistent.
  function setSize() {
    const w = innerWidth, h = innerHeight;
    for (const c of [rCanvas, tCanvas]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
  }
  const applyRenderScale = (v: number) => {
    if (v === renderScale) return;
    renderScale = v;
    dpr = dpr0 * renderScale;
    setSize();
  };

  function stepAnim(t: number, dir: number, dt: number): [number, number] {
    if (dir === 0) return [t, 0];
    let nt = t + dir * dt / ANIM_MS;
    let nd = dir;
    if (nt >= 1) { nt = 1; nd = 0; }
    if (nt <= 0) { nt = 0; nd = 0; }
    return [nt, nd];
  }

  function layout() {
    const w = cssW(), h = cssH();
    const sw = SIDEBAR_W * smoothstep(sidebarT);
    const termH = TERM_H * smoothstep(termT);
    const editorX = AB_W + sw;
    const editorW = w - editorX;
    const termPanelH = termH > 1 ? termH + TERM_HEADER_H : 0;
    const editorH = h - TAB_BAR_H - STATUS_H - termPanelH;

    fileTree.x0 = AB_W;
    fileTree.y0 = SB_TREE_Y;
    fileTree.width = SIDEBAR_W;
    fileTree.height = Math.max(120, h - SB_TREE_Y - STATUS_H);

    const ed = tabs[activeTab].editor;
    ed.x0 = editorX;
    ed.y0 = TAB_BAR_H;

    terminal.x0 = editorX;
    terminal.y0 = h - STATUS_H - termH;
    terminal.cols = Math.max(20, Math.floor((editorW - terminal.pad * 2) / (terminal.fontSize * 0.55)));
    terminal.rows = Math.max(4, Math.floor((termH - terminal.pad * 2 - terminal.lineHeight) / terminal.lineHeight));

    return { w, h, editorX, editorW, editorH, sw, termH };
  }

  function emitText(text: string, x: number, y: number, size: number, color: number[]) {
    layoutStr(inst, text, color, atlas.table, font, { x, y, size });
  }

  function emitIcon(name: string, x: number, y: number, w: number, h: number, color: number[]) {
    const gl = atlas.table[name];
    if (gl) layoutIcon(inst, gl, { x, y, w, h }, color);
  }

  function textW(text: string, size: number): number {
    const s = size / (font as any).unitsPerEm;
    let w = 0;
    for (const ch of text) w += advanceOf(font, ch) * s;
    return w;
  }

  function ring(x0: number, y0: number, x1: number, y1: number, c: number[]) {
    addRect(x0, y0, x1, y0 + 1, c, crv, rws, inst);
    addRect(x0, y1 - 1, x1, y1, c, crv, rws, inst);
    addRect(x0, y0, x0 + 1, y1, c, crv, rws, inst);
    addRect(x1 - 1, y0, x1, y1, c, crv, rws, inst);
  }

  function sourceTabGeom() {
    const x0 = AB_W + 10;
    const inner = SIDEBAR_W - 20;
    const tx0 = x0 + 1, ty0 = SB_TOOL_Y + 1, tw = inner - 2, th = SB_TOOL_H - 2;
    const tabs_: { x: number; w: number }[] = [];
    let cx = tx0 + 2;
    for (const s of SOURCES) {
      const w = textW(s.label, 11) + 16;
      tabs_.push({ x: cx, w });
      cx += w + 2;
    }
    const actW = 20, gap = 2;
    const actions: { x: number; icon: string; title: string }[] = [];
    let ax = tx0 + tw - 6 - actW;
    const push = (icon: string, title: string) => { actions.unshift({ x: ax, icon, title }); ax -= actW + gap; };
    push('icon:refresh', 'Refresh');
    push('icon:chevronUp', 'Collapse All');
    push('icon:chevron', 'Expand All');
    return { tx0, ty0, tw, th, tabs_, actions, actW };
  }

  function makeFrameCtx(now: number, t: number, dt: number, w: number, h: number, mx: number, my: number, cam3d: boolean, inst: number[], instFA: Float32Array, fxXforms: Float32Array, instCount: number): FxCtx {
    return {
      now, t, dt, w, h, mx, my, cam3d,
      inst, instFA, fxXforms, instCount,
      i: 0, wx: 0, wy: 0, glyph: false, hash: 0, xi: 0,
      ox: 0, oy: 0, fx3dActive, extraCount: 0,
      ensureInstFA(floats: number) { if (instFA.length < floats) instFA = new Float32Array(floats * 2); },
      allocXforms(total: number) { const need = total * 8; if (fxXforms.length < need) fxXforms = new Float32Array(need * 2); },
      tilt: (polar: number) => { if (cam3d && orbitPolar() < 0.35) fwTiltTarget = polar; },
    };
  }

  function render(now: number) {
    const t0 = performance.now();
    const dt = prevNow ? Math.min(now - prevNow, 50) : 16;
    prevNow = now;
    fpsDt = fpsDt * 0.9 + dt * 0.1;
    if (dt > worstDt) worstDt = dt;
    searchCaretPhase += dt;

    [sidebarT, sidebarDir] = stepAnim(sidebarT, sidebarDir, dt);
    [termT, termDir] = stepAnim(termT, termDir, dt);
    if (cam3d) updateOrbit(dt);
    if (fwTiltTarget >= 0 && cam3d) {
      const polar = orbitPolar();
      if (Math.abs(polar - fwTiltTarget) > 0.01) {
        const k = 1 - Math.exp(-dt / 400);
        orbitSetAngles(orbitAzimuth(), polar + (fwTiltTarget - polar) * k);
      } else {
        fwTiltTarget = -1;
      }
    }

    // Advance tab cross-fade and accent animations.
    if (tabFrom >= 0) {
      tabTransT = Math.min(1, tabTransT + dt / TAB_TRANS_MS);
      if (tabTransT >= 1) tabFrom = -1;   // done
    }
    // Accent line — start it here on the frame where the switch was triggered.
    if (tabFrom >= 0 && !accentAnim && tabPositions.length > 0) {
      const oldPos = tabPositions[tabFrom];
      const newPos = tabPositions[activeTab];
      if (oldPos && newPos && (oldPos.x !== newPos.x || oldPos.w !== newPos.w)) {
        accentAnim = { fromX: oldPos.x, fromW: oldPos.w, toX: newPos.x, toW: newPos.w, start: now };
      }
    }
    if (accentAnim) {
      const t2 = Math.min(1, (now - accentAnim.start) / ACCENT_MS);
      if (t2 >= 1) accentAnim = null;
    }

    const { w, h, editorX, editorH, sw, termH } = layout();
    tabPositions.length = 0;  // rebuilt each frame

    // The IDE layout adapts to the canvas every frame; while fitted, keep the
    // camera framing in sync too (immediate re-fit, no animation).
    if (fitted && (w !== fitW || h !== fitH)) {
      fitW = w; fitH = h;
      orbitZoomToRect(0, 0, w, h, tCanvas.width, tCanvas.height, 1, false);
    }

    // ── Frame skip ──────────────────────────────────────────────────────────
    // With fx off, in 2D, and nothing transiently animating, the frame output
    // changes only on state changes or the 80ms blink quantum (editor caret is
    // a 530ms step blink; terminal blink/glide render at 12.5fps — both look
    // native). A sig match skips the whole build + conversion + upload and the
    // pass redraws the persistent buffers.
    const Cw = tCanvas.width, Ch = tCanvas.height;
    // 250ms quantum: only a hash-collision safety net now — carets live in the
    // per-frame overlay and nothing else time-dependent runs while skippable.
    const blinkQ = Math.floor(now / 250);
    const ed0 = tabs[activeTab].editor;
    const anc0 = ed0.anchor;
    const termTarget = termH > 1 ? 1 : 0;
    // (tabTransT only advances while tabFrom >= 0 — at rest it sits at 0, so
    // the transient condition MUST gate on tabFrom or it's true forever and
    // the skip never engages. Terminal state only matters when its panel is
    // actually rendered — a hidden terminal can keep animating internally
    // (boot residue, live dock widget) without changing the build output.)
    const termEasing = Math.abs(termT - termTarget) > 0.01;
    const sidebarMoving = Math.abs(sidebarT - Math.round(sidebarT)) > 0.01;
    const transientAnim = !!accentAnim || (tabFrom >= 0 && tabTransT < 1)
      || (terminal.animating && termH > 1) || searchFocused
      || termEasing || sidebarMoving;
    // 3D: the orbit pose belongs in the signature — while it damps, the pose
    // changes every frame (builds run); settled, it's stable and the instances
    // are camera-independent (viewProj carries the camera), so 3D skips too.
    const orbit = cam3d ? orbitTargetLocal() : null;
    const orbitKey = cam3d ? orbitAzimuth() * 2246822519 + orbitPolar() * 32452843
      + orbitScale(Ch) * 49979687 + (orbit!.x * 31 + orbit!.y * 37) * 65537 : 0;
    // Which flag blocks the skip — shown in the chip diagnostics so a
    // never-skipping IDE self-reports the culprit.
    const skipGate = fxMode !== 'off' ? 'fx'
      : accentAnim ? 'accent' : (tabFrom >= 0 && tabTransT < 1) ? 'tab'
      : (terminal.animating && termH > 1) ? 'term' : searchFocused ? 'search'
      : termEasing ? 'termEase' : sidebarMoving ? 'sidebar' : 'ok';
    const canSkipBuild = fxMode === 'off' && !transientAnim;
    // Stage 1 — zero-allocation numeric hash (prime-weighted). blinkQ is IN it,
    // so even a collision forces the full check within one quantum; fields that
    // can change without appearing here (terminal output, search typing) gate
    // canSkipBuild off via transientAnim while in flight.
    const quick = canSkipBuild ? (blinkQ * 1000000007
      + w * 104729 + h * 1299709 + Math.round(dpr * 100) * 7919
      + mx * 15485863 + my * 32452843
      + (focus === 'editor' ? 11 : focus === 'terminal' ? 23 : 0)
      + activeTab * 49979687 + tabFrom * 65537
      + Math.round(termH) * 86028121 + Math.round(termT * 20) * 13
      + Math.round(sidebarT * 20) * 17 + (fitted ? 29 : 0)
      + hoverTab * 31 + hoverCloseTab * 37 + (hoverExplorer ? 41 : 0) + (hoverTerminal ? 43 : 0)
      + hoverSource * 47 + hoverAction * 53 + (hoverSearch ? 59 : 0)
      + Math.round(fileTree.scrollOffset * 2) * 61
      + ed0.cursor.line * 67 + ed0.cursor.col * 71
      + (anc0 ? anc0.line * 73 + anc0.col * 79 + 83 : 0)
      + ed0.doc.version * 89 + (ed0.focused ? 97 : 0) + Math.round(ed0.y0 * 2) * 101
      + (gate.open ? 103 : 0) + (qualityPanel.open ? 107 : 0)
      + (lowResSharpen ? 109 : 0) + Math.round(integralScale * 20) * 113 + Math.round(renderScale * 20) * 127
      + orbitKey
    ) : -1;
    let skipBuild = false;
    if (canSkipBuild && quick === lastQuick) {
      // (canSkipBuild guard is load-bearing: quick === -1 on non-skippable
      // frames would otherwise match lastQuick === -1 and freeze animations.)
      skipBuild = true;
    } else {
      // Stage 2 — full string signature, built only when the hash detects change.
      const ideSig = canSkipBuild ? [
        w, h, dpr, focus, activeTab, tabFrom, Math.round(termH), Math.round(termT * 20),
        Math.round(sidebarT * 20), fitted ? 1 : 0,
        `${mx},${my}`,
        `${hoverTab},${hoverCloseTab},${hoverExplorer},${hoverTerminal},${hoverSource},${hoverAction},${hoverSearch}`,
        `${fileTree.hovered ?? ''},${Math.round(fileTree.scrollOffset * 2)}`,
        `${ed0.cursor.line},${ed0.cursor.col},${anc0 ? anc0.line + '.' + anc0.col : '-'},${ed0.doc.version},${ed0.focused},${Math.round(ed0.y0 * 2)}`,
        terminal.sigState, gate.open, qualityPanel.open, searchQuery,
        `${lowResSharpen},${integralScale},${renderScale}`, blinkQ,
        orbit ? `${orbitAzimuth()},${orbitPolar()},${orbitScale(Ch)},${orbit.x},${orbit.y}` : '',
      ].join('|') : '';
      skipBuild = canSkipBuild && ideSig === lastIdeSig;
      lastIdeSig = ideSig;
      lastQuick = quick;
    }

    if (!skipBuild) {   // ← build + convert guard (closes before the draw pass)
    inst.length = 0; crv.length = 0; rws.length = 0;

    addRect(0, 0, w, h, T.editorBg, crv, rws, inst);
    if (isPhys()) {
      addRect(w / 2 - 50000, h / 2 - 50000, w / 2 + 50000, h / 2 + 50000, T.editorBg, crv, rws, inst);
    }

    // ── Activity bar ──
    addRect(0, 0, AB_W, h, T.activityBarBg, crv, rws, inst);
    const tile = 34, ty = 8;
    const tileX = (AB_W - tile) / 2;
    const active = sidebarT > 0.5;
    // Explorer icon tile
    if (active) {
      addRect(tileX - 3, ty - 3, tileX + tile + 3, ty + tile + 3, T.activeTileGlow, crv, rws, inst);
      addRect(tileX, ty, tileX + tile, ty + tile, T.activeTile, crv, rws, inst);
    } else if (hoverExplorer) {
      addRect(tileX, ty, tileX + tile, ty + tile, T.activityBarHover, crv, rws, inst);
    }
    emitIcon('icon:folder', tileX + 7, ty + 7, tile - 14, tile - 14, active ? T.activityBarActive : T.activityBarFg);
    // Separator between the top icon group and the bottom icon group
    const sepY = ty + tile + 10;
    addRect(0, sepY, AB_W, sepY + 1, T.separator, crv, rws, inst);
    // Terminal icon (bottom)
    const bty = h - STATUS_H - 12 - tile;
    const termActive = termT > 0.5;
    if (termActive) {
      addRect(tileX - 3, bty - 3, tileX + tile + 3, bty + tile + 3, T.activeTileGlow, crv, rws, inst);
      addRect(tileX, bty, tileX + tile, bty + tile, T.activeTile, crv, rws, inst);
    } else if (hoverTerminal) {
      addRect(tileX, bty, tileX + tile, bty + tile, T.activityBarHover, crv, rws, inst);
    }
    emitIcon('icon:code', tileX + 7, bty + 7, tile - 14, tile - 14, termActive ? T.activityBarActive : T.activityBarFg);
    addRect(AB_W - 1, 0, AB_W, h, T.border, crv, rws, inst);

    // ── Sidebar ──
    if (sw > 1) {
      addRect(AB_W, 0, AB_W + sw, h - STATUS_H, T.containerBg, crv, rws, inst);
      addRect(AB_W + sw - 1, 0, AB_W + sw, h - STATUS_H, T.border, crv, rws, inst);

      const op = smoothstep((sidebarT - 0.25) / 0.55);
      if (op > 0.01) {
        const contentStart = inst.length;
        const headSize = 16;
        emitText('FILE EXPLORER', AB_W + 12, ty + tile / 2 - headSize / 2, headSize, T.headerText);
        addRect(AB_W, SB_HEADER_H - 1, AB_W + sw, SB_HEADER_H, T.separator, crv, rws, inst);

        // Search box
        const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
        if (sx1 - sx0 > 40) {
          addRect(sx0, SB_SEARCH_Y, sx1, SB_SEARCH_Y + SB_SEARCH_H, searchFocused ? T.accent : T.searchBorder, crv, rws, inst);
          addRect(sx0 + 1, SB_SEARCH_Y + 1, sx1 - 1, SB_SEARCH_Y + SB_SEARCH_H - 1, T.searchBg, crv, rws, inst);
          emitIcon('icon:search', sx0 + 8, SB_SEARCH_Y + 9, 12, 12, T.magnifier);
          const tx = sx0 + 28, tBase = SB_SEARCH_Y + (SB_SEARCH_H - 12) / 2;
          if (searchQuery.length === 0 && !searchFocused) {
            emitText('Search files...', tx, tBase, 12, T.placeholder);
          } else {
            emitText(searchQuery, tx, tBase, 12, T.text);
            if (searchFocused && (searchCaretPhase % 1060) < 530) {
              const cx = tx + textW(searchQuery, 12);
              addRect(cx, SB_SEARCH_Y + 7, cx + 1, SB_SEARCH_Y + SB_SEARCH_H - 7, T.text, crv, rws, inst);
            }
          }
        }

        // Source toolbar
        const g = sourceTabGeom();
        const tbx1 = AB_W + sw - 10;
        if (tbx1 - g.tx0 > 40) {
          addRect(g.tx0, SB_TOOL_Y, tbx1, SB_TOOL_Y + SB_TOOL_H, T.searchBorder, crv, rws, inst);
          addRect(g.tx0 + 1, SB_TOOL_Y + 1, tbx1 - 1, SB_TOOL_Y + SB_TOOL_H - 1, T.searchBg, crv, rws, inst);
          for (let i = 0; i < SOURCES.length; i++) {
            const tb = g.tabs_[i];
            if (tb.x + tb.w > tbx1 - 80) break;
            const isActive = i === activeSource;
            if (isActive) {
              ring(tb.x, g.ty0, tb.x + tb.w, g.ty0 + g.th, T.accent);
              emitText(SOURCES[i].label, tb.x + 8, g.ty0 + (g.th - 11) / 2, 11, T.sidebarTabActiveFg);
            } else {
              const hov = i === hoverSource;
              if (hov) addRect(tb.x, g.ty0, tb.x + tb.w, g.ty0 + g.th, [1, 1, 1, 0.05], crv, rws, inst);
              emitText(SOURCES[i].label, tb.x + 8, g.ty0 + (g.th - 11) / 2, 11, T.sidebarTabFg);
            }
          }
          for (let i = 0; i < g.actions.length; i++) {
            const a = g.actions[i];
            if (a.x < g.tx0 + 4) continue;
            const hov = i === hoverAction;
            if (hov) addRect(a.x, g.ty0 + 3, a.x + g.actW, g.ty0 + g.th - 3, [1, 1, 1, 0.06], crv, rws, inst);
            emitIcon(a.icon, a.x + 4, g.ty0 + (g.th - 12) / 2, 12, 12, hov ? T.text : T.dim);
          }
        }

        addRect(AB_W, SB_TREE_Y - 4, AB_W + sw, SB_TREE_Y - 3, T.separator, crv, rws, inst);

        // Tree
        fileTree.hovered = null;
        if (sidebarT > 0.9 && mx >= AB_W && mx < AB_W + sw && my > SB_TREE_Y && my < h - STATUS_H && !searchFocused) {
          const row = fileTree.rowAtY(my);
          if (row) fileTree.hovered = row.node.path;
        }
        fileTree.render(font, atlas, inst, crv, rws, fileTree.y0, fileTree.y0 + fileTree.height, now, fileTreeTh);
        if (op < 1) {
          for (let i = contentStart; i < inst.length; i += 16) inst[i + 11] *= op;
        }
      }
    }

    // ── Editor tab bar ──
    addRect(editorX, 0, w, TAB_BAR_H, T.tabBarBg, crv, rws, inst);
    let tx = editorX + 4;
    for (let i = 0; i < tabs.length; i++) {
      const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
      tabPositions.push({ x: tx, w: tw2 });
      const isActive = i === activeTab;
      const hovered = i === hoverTab;
      if (isActive) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, T.tabActiveBg, crv, rws, inst);
      } else if (hovered) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, [1, 1, 1, 0.04], crv, rws, inst);
      }
      emitText(tabs[i].name, tx + TAB_PAD_L, (TAB_BAR_H - 12) / 2, 12, isActive ? T.tabActiveFg : T.tabFg);
      if (tabs.length > 1) {
        const cix = tx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ;
        const ciy = (TAB_BAR_H - TAB_CLOSE_SZ) / 2;
        const closeHov = i === hoverCloseTab;
        const closeCol = closeHov ? T.text : (isActive ? T.tabActiveFg : T.tabFg);
        if (closeHov) {
          // Subtle highlight behind hovered close icon
          addRect(cix - 2, ciy - 2, cix + TAB_CLOSE_SZ + 2, ciy + TAB_CLOSE_SZ + 2, [1, 1, 1, 0.08], crv, rws, inst);
        }
        emitIcon('icon:cross', cix, ciy, TAB_CLOSE_SZ, TAB_CLOSE_SZ, closeCol);
      }
      tx += tw2;
    }

    // Animated accent line — slides between old and new tab position on switch,
    // shrinking/growing with tab width. Pure GPU rect; CSS can't animate border
    // position independently from layout.
    {
      let ax: number, aw: number;
      if (accentAnim) {
        const t2 = Math.min(1, (now - accentAnim.start) / ACCENT_MS);
        const e = t2 < 1 ? 1 - Math.pow(1 - t2, 3) : 1;   // ease-out cubic
        ax = accentAnim.fromX + (accentAnim.toX - accentAnim.fromX) * e;
        aw = accentAnim.fromW + (accentAnim.toW - accentAnim.fromW) * e;
      } else {
        const pos = tabPositions[activeTab];
        ax = pos ? pos.x : 0;
        aw = pos ? pos.w : 0;
      }
      if (aw > 0) addRect(ax, TAB_BAR_H - 2, ax + aw, TAB_BAR_H, T.accent, crv, rws, inst);
    }

    // ── Editor ──
    const ed = tabs[activeTab].editor;
    ed.focused = focus === 'editor' && !searchFocused;
    const crossFade = tabFrom >= 0 && tabTransT < 1;
    if (crossFade) {
      const oldStart = inst.length;
      tabs[tabFrom].editor.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
      for (let k = oldStart; k < inst.length; k += 16) inst[k + 11] *= 1 - tabTransT;
      const newStart = inst.length;
      tabs[activeTab].editor.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
      for (let k = newStart; k < inst.length; k += 16) inst[k + 11] *= tabTransT;
    } else {
      ed.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
    }

    // ── Terminal panel ──
    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      addRect(editorX, ty2, w, ty2 + TERM_HEADER_H, T.tabBarBg, crv, rws, inst);
      if (termT > 0.85) {
        emitText('TERMINAL', editorX + 12, ty2 + (TERM_HEADER_H - 11) / 2, 11, T.headerText);
        const closeX = w - 28, closeY = ty2 + TERM_HEADER_H / 2;
        addRect(closeX - 4, closeY - 0.5, closeX + 4, closeY + 0.5, T.headerText, crv, rws, inst);
        addRect(closeX - 0.5, closeY - 4, closeX + 0.5, closeY + 4, T.headerText, crv, rws, inst);
      }
      addRect(editorX, ty2 + TERM_HEADER_H - 1, w, ty2 + TERM_HEADER_H, T.border, crv, rws, inst);
      if (termT > 0.85) {
        terminal.focused = focus === 'terminal';
        terminal.render(font, atlas, inst, crv, rws, now, dt, terminalTh, 2);
      }
    }

    // ── Status bar ──
    addRect(0, h - STATUS_H, w, h, T.statusbarBg, crv, rws, inst);
    emitText('main', 10, h - STATUS_H + (STATUS_H - 11) / 2, 11, T.statusbarFg);
    if (fxMode !== 'off') {
      const fxLabel = 'fx: ' + fxMode;
      emitText(fxLabel, 70, h - STATUS_H + (STATUS_H - 11) / 2, 11, [0.365, 0.839, 1.0, 0.9]);
    }
    const right = 'UTF-8  ·  TypeScript  ·  Ln ' + (ed.cursor.line + 1) + ', Col ' + (ed.cursor.col + 1);
    emitText(right, w - textW(right, 11) - 14, h - STATUS_H + (STATUS_H - 11) / 2, 11, [1, 1, 1, 0.85]);

    // ── App frame ─
    addRect(0, 0, w, 1, T.separator, crv, rws, inst);
    addRect(0, h - 1, w, h, T.separator, crv, rws, inst);
    addRect(0, 1, 1, h - 1, T.separator, crv, rws, inst);
    addRect(w - 1, 1, w, h - 1, T.separator, crv, rws, inst);

    if (menuWorldPose && gate.open) {
      menu.render(font, atlas, inst, crv, rws, ANALYTIC_MENU_THEME, poseXform(menuWorldPose.pose, menuWorldPose.Wv, menuWorldPose.Hv));
    } else if (!gate.open) {
      menuWorldPose = null;
    }

    // The toolbar + analytic menus render as a screen-space overlay through
    // screenHud (built + drawn in the pass below). The menu viewport is backing-
    // store px so gate.show() — called from event handlers — clamps correctly.
    gate.setViewport(Cw, Ch);
    }   // ← end build + convert guard

    // ── Draw
    let vp: Float32Array;
    let cs: number;
    if (cam3d) {
      vp = orbitViewProj(Cw, Ch);
      cs = orbitScale(Ch);
    } else {
      const sxm = (2 * dpr) / Cw, sym = (2 * dpr) / Ch;
      vp2d[0] = sxm; vp2d[5] = -sym; vp2d[10] = 0; vp2d[15] = 1;
      vp = vp2d;
      cs = dpr;
    }
    if (!skipBuild) {
      if (inst.length > instFA.length) instFA = new Float32Array(inst.length * 2);
      if (cam3d) {
        instFA.set(inst);
      } else {
        const cx = w / 2, cy = h / 2;
        for (let i = 0; i < inst.length; i += 16) {
          instFA[i] = inst[i] - cx;
          instFA[i + 1] = inst[i + 1] - cy;
          for (let j = 2; j < 16; j++) instFA[i + j] = inst[i + j];
        }
      }
    }
    const fxT = now / 1000;
    const fx = REG[fxMode] ?? null;
    const prevFx = REG[prevFxMode] ?? null;
    if (fxMode !== prevFxMode) {
      if (prevFx?.onExit) prevFx.onExit(makeFrameCtx(now, fxT, dt, w, h, mx, my, cam3d, inst, instFA, fxXforms, inst.length / 16));
      if (fx?.onEnter) fx.onEnter(makeFrameCtx(now, fxT, dt, w, h, mx, my, cam3d, inst, instFA, fxXforms, inst.length / 16));
      prevFxMode = fxMode;
    }

    fx3dActive = false;
    if (fx?.uses3d) {
      const need = (inst.length / 16) * 8;
      if (fxXforms.length < need) fxXforms = new Float32Array(need * 2);
      fxXforms.fill(0, 0, need);
    }
    if (fx?.preFrame) fx.preFrame(makeFrameCtx(now, fxT, dt, w, h, mx, my, cam3d, inst, instFA, fxXforms, inst.length / 16));

    if (fx) {
      const n = inst.length;
      for (let i = 0; i < n; i += 16) {
        const pCtx: FxCtx = {
          now, t: fxT, dt, w, h, mx, my, cam3d,
          inst, instFA, fxXforms, instCount: n / 16,
          i, wx: inst[i], wy: inst[i + 1],
          glyph: inst[i + 3] < 1.5, hash: fxHash(i), xi: (i / 16) * 8,
          ox: 0, oy: 0, fx3dActive, extraCount: 0,
          ensureInstFA(floats: number) { if (instFA.length < floats) instFA = new Float32Array(floats * 2); },
          allocXforms(total: number) { const need = total * 8; if (fxXforms.length < need) fxXforms = new Float32Array(need * 2); },
          tilt: (polar: number) => { if (cam3d && orbitPolar() < 0.35) fwTiltTarget = polar; },
        };
        fx.apply(pCtx);
        instFA[i] += pCtx.ox;
        instFA[i + 1] += pCtx.oy;
        if (pCtx.fx3dActive) fx3dActive = true;
      }
    }
    if (fx?.postFrame) {
      const pCtx: FxCtx = {
        now, t: fxT, dt, w, h, mx, my, cam3d,
        inst, instFA, fxXforms, instCount: inst.length / 16,
        i: 0, wx: 0, wy: 0, glyph: false, hash: 0, xi: 0,
        ox: 0, oy: 0, fx3dActive, extraCount: 0,
        ensureInstFA(floats: number) { if (instFA.length < floats) instFA = new Float32Array(floats * 2); },
        allocXforms(total: number) { const need = total * 8; if (fxXforms.length < need) fxXforms = new Float32Array(need * 2); },
        tilt: (polar: number) => { if (cam3d && orbitPolar() < 0.35) fwTiltTarget = polar; },
      };
      fx.postFrame(pCtx);
      if (pCtx.fx3dActive) fx3dActive = true;
    }
    if (!skipBuild) {
      if (crv.length > crvFA.length) crvFA = new Float32Array(crv.length * 2);
      crvFA.set(crv);
      if (rws.length > rwsUA.length) rwsUA = new Uint32Array(rws.length * 2);
      rwsUA.set(rws);
    }

    let totalInst = skipBuild ? lastTotalInst : inst.length;
    const baseCount = totalInst / 16;
    const extra = fx?.extras?.();
    if (extra && extra.count > 0) {
      const extraBytes = extra.count * 16;
      if (instFA.length < inst.length + extraBytes) instFA = new Float32Array((inst.length + extraBytes) * 2);
      instFA.set(extra.instFA.subarray(0, extraBytes), inst.length);
      const xOff = (totalInst / 16) * 8;
      const xNeed = xOff + extra.count * 8;
      if (fxXforms.length < xNeed) fxXforms = new Float32Array(xNeed * 2);
      fxXforms.set(extra.xforms.subarray(0, extra.count * 8), xOff);
      totalInst += extraBytes;
      fx3dActive = true;
    }
    if (!skipBuild) {
      ideDataVersion++;
      ideBuilds++;
      lastTotalInst = totalInst;
      lastCrvLen = crv.length;
      lastRwsLen = rws.length;
    }

    // Low-res render + sharpen (quality panel): the coverage integral runs into an
    // offscreen target at integralScale × the swapchain and a CAS upscale resolves
    // it onto the display (same path as frame.ts). The screen HUD below keeps its
    // full Cw/Ch ortho, so chrome scales down into the target and the upscale
    // restores it — apparent size invariant, only quality moves.
    const iScale = lowResSharpen ? Math.min(Math.max(integralScale, 0.25), 1) : 1;
    const renderW = lowResSharpen ? Math.max(1, Math.round(Cw * iScale)) : Cw;
    const renderH = lowResSharpen ? Math.max(1, Math.round(Ch * iScale)) : Ch;
    const dv = ensureDepth(renderW, renderH);
    const enc = device.createCommandEncoder();
    const swapView = gpuCtx.getCurrentTexture().createView();
    const colorView = lowResSharpen ? upscaler.target(renderW, renderH) : swapView;
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: T.editorBg[0], g: T.editorBg[1], b: T.editorBg[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: dv, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    uCamScale[0] = cs; uCamScale[1] = cs;
    const instCount = totalInst / 16;
    let clipArg: Float32Array | undefined;
    if (fx3dActive) {
      const cNeed = instCount * 24;
      if (clipFA.length < cNeed) clipFA = new Float32Array(cNeed * 2);
      clipFA.fill(0, 0, cNeed);
      if (extra && extra.count > 0 && extra.clip) {
        clipFA.set(extra.clip.subarray(0, extra.count * 24), baseCount * 24);
      }
      clipArg = clipFA.subarray(0, cNeed);
    }
    renderer.setUniforms({ width: renderW, height: renderH, camScale: uCamScale, camCenter: uCamCenter, viewProj: vp, fxActive: fx3dActive ? 1 : 0 });
    if (lastCrvLen !== subCrvLen || subCrvBuf !== crvFA) { subCrv = crvFA.subarray(0, lastCrvLen); subCrvLen = lastCrvLen; subCrvBuf = crvFA; }
    if (lastRwsLen !== subRwsLen || subRwsBuf !== rwsUA) { subRws = rwsUA.subarray(0, lastRwsLen); subRwsLen = lastRwsLen; subRwsBuf = rwsUA; }
    if (totalInst !== subInstLen || subInstBuf !== instFA) { subInst = instFA.subarray(0, totalInst); subInstLen = totalInst; subInstBuf = instFA; }
    let xformsArg: Float32Array | undefined;
    if (fx3dActive) {
      const xLen = instCount * 8;
      if (xLen !== subXformsLen || subXformsBuf !== fxXforms) { subXforms = fxXforms.subarray(0, xLen); subXformsLen = xLen; subXformsBuf = fxXforms; }
      xformsArg = subXforms!;
    } else {
      subXformsLen = -1;
    }
    renderer.draw(pass, subCrv!, subRws!, subInst!, instCount, xformsArg, clipArg, ideDataVersion);

    // ── Caret overlay — per-frame blink/glide from a tiny buffer, so idle
    // frames upload ~4 instances instead of rebuilding the whole IDE.
    caretInst.length = 0; caretCrv.length = 0; caretRws.length = 0;
    ed0.emitCaret(caretInst, caretCrv, caretRws, ed0.y0, ed0.y0 + editorH, 2, now, editorTh);
    if (termH > 1 && termT > 0.85) terminal.emitCaret(caretInst, caretCrv, caretRws, dt, terminalTh, 2);
    if (caretInst.length > 0) {
      if (caretInst.length > caretFA.length) caretFA = new Float32Array(caretInst.length * 2);
      if (cam3d) {
        caretFA.set(caretInst);
      } else {
        const cx = w / 2, cy = h / 2;
        for (let i = 0; i < caretInst.length; i += 16) {
          caretFA[i] = caretInst[i] - cx;
          caretFA[i + 1] = caretInst[i + 1] - cy;
          for (let j = 2; j < 16; j++) caretFA[i + j] = caretInst[i + j];
        }
      }
      if (caretCrv.length > caretCrvFA.length) caretCrvFA = new Float32Array(caretCrv.length * 2);
      caretCrvFA.set(caretCrv);
      if (caretRws.length > caretRwsUA.length) caretRwsUA = new Uint32Array(caretRws.length * 2);
      caretRwsUA.set(caretRws);
      // Cached subarrays — the caret count is near-constant, so these allocate
      // only when it changes (no per-frame subarray garbage).
      const cCount = caretInst.length / 16;
      if (caretInst.length !== subCaretInstLen || subCaretInstBuf !== caretFA) { subCaretInst = caretFA.subarray(0, caretInst.length); subCaretInstLen = caretInst.length; subCaretInstBuf = caretFA; }
      if (caretCrv.length !== subCaretCrvLen) { subCaretCrv = caretCrvFA.subarray(0, caretCrv.length); subCaretCrvLen = caretCrv.length; }
      if (caretRws.length !== subCaretRwsLen) { subCaretRws = caretRwsUA.subarray(0, caretRws.length); subCaretRwsLen = caretRws.length; }
      caretRenderer.setUniforms({ width: renderW, height: renderH, camScale: uCamScale, camCenter: uCamCenter, viewProj: vp });
      caretRenderer.draw(pass, subCaretCrv!, subCaretRws!, subCaretInst!, cCount);
    }

    // Toolbar + analytic menus — screen-space overlay (backing-store px + screen-
    // ortho matrix), seeded with the atlas base so menu glyphs resolve. HUD
    // frame-skip: sig rebuilt only when its inputs actually change (no
    // per-frame template strings — those were the idle-frame GC pressure).
    const hudTh = toolbar.hoveredId;
    const hudTick = (gate.open || qualityPanel.open) ? Math.floor(now / 50) : 0;
    const chipMode = fpsChip ? fpsChip.mode : -1;
    const chipStatus = fpsChip?.status ?? '';
    const chipPressed = fpsChip?.pressed ? 1 : 0;
    if (hudTh !== lastHudTh || hoverTab !== lastHudHT || hoverCloseTab !== lastHudHCT || hudTick !== lastHudTick
      || blinkQ !== lastHudBlink || Cw !== lastHudCw || Ch !== lastHudCh || gate.open !== lastHudGate || qualityPanel.open !== lastHudPanel
      || chipMode !== lastHudChipMode || chipStatus !== lastHudChipStatus || chipPressed !== lastHudChipPressed) {
      ideHudSig = `${Cw}x${Ch}|${hudTh ?? ''}|${hoverTab},${hoverCloseTab}|${gate.open ? 'M' + hudTick : ''}|${qualityPanel.open ? 'P' + hudTick : ''}|${blinkQ}|c${chipMode},${chipPressed},${chipStatus}`;
      lastHudTh = hudTh; lastHudHT = hoverTab; lastHudHCT = hoverCloseTab; lastHudTick = hudTick;
      lastHudBlink = blinkQ; lastHudCw = Cw; lastHudCh = Ch; lastHudGate = gate.open; lastHudPanel = qualityPanel.open;
      lastHudChipMode = chipMode; lastHudChipStatus = chipStatus; lastHudChipPressed = chipPressed;
    }
    screenHud.frame(pass, Cw, Ch, now, atlas.curves, atlas.rows, ideHudSig);

    pass.end();
    if (lowResSharpen) upscaler.resolve(enc, swapView, renderW, renderH, Cw, Ch, sharpenAmount);
    device.queue.submit([enc.finish()]);

    jsMs = performance.now() - t0;
    fpsChip?.tick(now);
    if (now - lastFpsShown > 120) {
      lastFpsShown = now;
      const fpsStr = `${Math.round(1000 / fpsDt)} fps`;
      const fullStr = `${fpsStr}  ·  js ${jsMs.toFixed(1)}ms  ·  worst ${worstDt.toFixed(0)}ms  ·  b ${ideBuilds}`;
      fpsEl.textContent = fullStr;
      fpsChip?.update(fpsStr, fullStr, `ide ${jsMs.toFixed(2)}ms · inst ${Math.round(lastTotalInst / 16)} · builds ${ideBuilds} · gate ${skipGate}`);
      worstDt = 0;
    }
  }

  function toWorld(e: MouseEvent): [number, number] {
    const r = tCanvas.getBoundingClientRect();
    return [(e.clientX - r.left), (e.clientY - r.top)];
  }

  function hitSidebarChrome(): 'search' | { kind: 'source'; i: number } | { kind: 'action'; i: number } | null {
    if (sidebarT <= 0.9) return null;
    const sw = SIDEBAR_W * smoothstep(sidebarT);
    if (mx < AB_W || mx >= AB_W + sw) return null;
    const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
    if (my >= SB_SEARCH_Y && my < SB_SEARCH_Y + SB_SEARCH_H && mx >= sx0 && mx <= sx1) return 'search';
    if (my >= SB_TOOL_Y && my < SB_TOOL_Y + SB_TOOL_H) {
      const g = sourceTabGeom();
      for (let i = 0; i < g.actions.length; i++) {
        const a = g.actions[i];
        if (mx >= a.x - 2 && mx <= a.x + g.actW + 2) return { kind: 'action', i };
      }
      for (let i = 0; i < SOURCES.length; i++) {
        const tb = g.tabs_[i];
        if (mx >= tb.x && mx <= tb.x + tb.w) return { kind: 'source', i };
      }
    }
    return null;
  }

  function onPointerMove(e: PointerEvent) {
    rg.move(e.clientX, e.clientY);
    [mx, my] = toWorld(e);
    const scrMx = mx, scrMy = my;   // raw CSS pixels for toolbar hit-test
    if (cam3d) {
      if (d3.active && (Math.abs(e.clientX - d3.x) > 5 || Math.abs(e.clientY - d3.y) > 5)) d3.moved = true;
      const p = screenToDocLocal(mx * dpr, my * dpr, tCanvas.width, tCanvas.height);
      mx = p.x; my = p.y;
      if (d3.active && d3.moved) {
        if (dragSel) tabs[activeTab].editor.placeCursor(mx, my, true);
        else { orbitTruck((e.clientX - dragPX) * dpr, (e.clientY - dragPY) * dpr, tCanvas.height); fitted = false; }
      }
      dragPX = e.clientX; dragPY = e.clientY;
    }
    // Physics FX: the pointer layer follows the debris — hovering a flying shard
    // hovers the element it was torn from (remap for the hover block only).
    // Destroyed elements only work through their shards: a pointer over a shard's
    // now-empty home footprint hovers nothing.
    const rawMx = mx, rawMy = my;
    if (isPhys()) {
      const ph = physPick(mx, my);
      if (ph) { mx = ph.x; my = ph.y; }
      else if (physDead(mx, my)) { mx = -1e5; my = -1e5; }
    }
    hoverExplorer = false; hoverTerminal = false; hoverSource = -1; hoverAction = -1; hoverSearch = false; hoverTab = -1;

    const tile = 34, ty = 8, tileX = (AB_W - tile) / 2;
    if (mx < AB_W) {
      if (my >= ty && my <= ty + tile) hoverExplorer = true;
      const bty = cssH() - STATUS_H - 12 - tile;
      if (my >= bty && my <= bty + tile) hoverTerminal = true;
    }

    const chrome = hitSidebarChrome();
    if (chrome === 'search') hoverSearch = true;
    else if (chrome && chrome.kind === 'source') hoverSource = chrome.i;
    else if (chrome && chrome.kind === 'action') hoverAction = chrome.i;

    const { editorX, editorH } = layout();
    hoverCloseTab = -1;
    if (my < TAB_BAR_H && mx >= editorX) {
      let txx = editorX + 4;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (mx >= txx && mx <= txx + tw2) {
          hoverTab = i;
          // Check if pointer is over the close icon sub-area
          if (tabs.length > 1) {
            const cix = txx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ;
            const ciy = (TAB_BAR_H - TAB_CLOSE_SZ) / 2;
            if (mx >= cix && mx <= cix + TAB_CLOSE_SZ && my >= ciy && my <= ciy + TAB_CLOSE_SZ) {
              hoverCloseTab = i;
            }
          }
          break;
        }
        txx += tw2;
      }
    }

    mx = rawMx; my = rawMy;
    toolbar.updateHover(scrMx * dpr, scrMy * dpr);
    if (menuWorldPose) {
      const [lx, ly] = menuScreenToLocal(scrMx * dpr, scrMy * dpr);
      gate.updateHover(lx, ly);
    } else {
      gate.updateHover(scrMx * dpr, scrMy * dpr);
    }
    // Quality panel: a grabbed slider tracks the pointer; otherwise hover-test.
    if (qualityPanel.isDragging) qualityPanel.drag(scrMx * dpr, scrMy * dpr);
    else if (qualityPanel.open) qualityPanel.updateHover(scrMx * dpr, scrMy * dpr);
    const overChrome = hoverExplorer || hoverTerminal || hoverSearch || hoverSource >= 0 || hoverAction >= 0 || hoverTab >= 0;
    const overEditorBody = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    rCanvas.style.cursor = resolveCursor({
      menuCursor: gate.resolveCursor() ?? qualityPanel.cursor ?? toolbar.cursor,
      overText: hoverSearch || overEditorBody,
      overChrome,
    });
  }

  function blurSearch() { searchFocused = false; focus = 'editor'; tabs[activeTab].editor.focused = true; }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2) { rg.press(e.clientX, e.clientY); setOrbitPanChord(true); fitted = false; return; }
    if (e.button === 1) { fitted = false; return; }
    if (e.button !== 0) return;
    gate.pressBegan();

    // Toolbar + analytic menu are screen-space overlays: hit-test in backing-store
    // px (raw screen CSS px × dpr), before any world-space picking — so a click on
    // an open menu never falls through to the scene behind it.
    {
      const [sx, sy] = toWorld(e);
      const sbx = sx * dpr, sby = sy * dpr;
      const tbHit = toolbar.hitTest(sbx, sby);
      if (tbHit) { tbHit.onClick(); return; }
      // Fps chip: press starts click-vs-long-press detection (consumed).
      if (fpsChip && fpsChip.pointerDown(sbx, sby, performance.now())) return;
      if (gate.open) {
        const [hx, hy] = menuWorldPose ? menuScreenToLocal(sbx, sby) : [sbx, sby];
        if (gate.overMenu(hx, hy)) return;
      }
      // Quality panel (screen-space): consume clicks on it (toggles + slider
      // drags), dismiss on a click outside — standard popup behaviour.
      if (qualityPanel.open) {
        rCanvas.setPointerCapture(e.pointerId);
        if (qualityPanel.pointerDown(sbx, sby)) return;
        qualityPanel.hide();
        return;
      }
    }

    let [wx, wy] = toWorld(e);
    if (cam3d) { const p = screenToDocLocal(wx * dpr, wy * dpr, tCanvas.width, tCanvas.height); wx = p.x; wy = p.y; }
    // Pressing a flying shard operates the element it was torn from — no blast
    // (the blast would kick the shard out from under the pointer before the
    // pointer-up pick could resolve it).
    let viaShard = false;
    if (isPhys()) {
      const ph = physPick(wx, wy);
      if (ph) { wx = ph.x; wy = ph.y; viaShard = true; }
    }
    const fxFn = REG[fxMode];
    if (fxFn?.onClick && !viaShard) {
      const clickNow = performance.now();
      const clickCtx: FxCtx = {
        now: clickNow, t: clickNow / 1000, dt: 16, w: cssW(), h: cssH(), mx, my, cam3d,
        inst, instFA, fxXforms, instCount: inst.length / 16,
        i: 0, wx: 0, wy: 0, glyph: false, hash: 0, xi: 0,
        ox: 0, oy: 0, fx3dActive, extraCount: 0,
        ensureInstFA() {}, allocXforms() {},
        tilt: (polar: number) => { if (cam3d && orbitPolar() < 0.35) fwTiltTarget = polar; },
      };
      fxFn.onClick(clickCtx, wx, wy);
      if (clickCtx.fx3dActive) fx3dActive = true;
    }
    [mx, my] = toWorld(e);
    if (cam3d) {
      d3 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, active: true };
      dragPX = e.clientX; dragPY = e.clientY;
      // A press inside the editor body anchors a drag-selection (the caret is
      // placed now so the drag extends from here); elsewhere a drag pans.
      const p = screenToDocLocal(mx * dpr, my * dpr, tCanvas.width, tCanvas.height);
      const { editorX, editorH } = layout();
      const deadPress = viaShard || (isPhys() && !physPick(p.x, p.y) && physDead(p.x, p.y));
      if (!searchFocused && !deadPress && p.x >= editorX && p.y >= TAB_BAR_H && p.y < TAB_BAR_H + editorH) {
        dragSel = true;
        focus = 'editor';
        const ed = tabs[activeTab].editor;
        ed.focused = true;
        ed.placeCursor(p.x, p.y, e.shiftKey);
        if (!e.shiftKey) ed.anchor = { line: ed.cursor.line, col: ed.cursor.col };
      }
      return;
    }
    const ph0 = isPhys() ? physPick(mx, my) : null;
    if (ph0) handlePick(ph0.x, ph0.y, e.shiftKey, true);
    else handlePick(mx, my, e.shiftKey);
  }

  function handlePick(px: number, py: number, shift: boolean, viaShard = false) {
    if (!viaShard && isPhys() && physDead(px, py)) return;
    mx = px; my = py;
    const { w, h, editorX, editorH, sw, termH } = layout();
    const tile = 34, ty = 8;

    // Multi-click tracking (400ms / ~6px). On the editor body clicks escalate
    // caret → token → line → all; on any other NON-TEXT surface the second
    // click fits the whole IDE to the screen — the IDE is the "UI component"
    // here, mirroring yasmineOS's double-click → HybridUIComponent.zoom.
    const inEditor = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    const overSearch = sw > 1 && sidebarT > 0.9 && mx >= AB_W + 10 && mx <= AB_W + sw - 10 && my >= SB_SEARCH_Y && my <= SB_SEARCH_Y + SB_SEARCH_H;
    const clickCount = mct.track(mx, my);
    if (!inEditor && !overSearch && clickCount === 2) {
      mct.reset();
      orbitZoomToRect(0, 0, cssW(), cssH(), tCanvas.width, tCanvas.height);
      fitted = true; fitW = cssW(); fitH = cssH();
    }

    if (mx < AB_W) {
      if (my >= ty && my <= ty + tile) {
        sidebarOpen = !sidebarOpen;
        sidebarDir = sidebarOpen ? 1 : -1;
        if (!sidebarOpen && searchFocused) blurSearch();
      }
      const bty = h - STATUS_H - 12 - tile;
      if (my >= bty && my <= bty + tile) {
        termOpen = !termOpen;
        termDir = termOpen ? 1 : -1;
        if (termOpen) { focus = 'terminal'; terminal.focused = true; tabs[activeTab].editor.focused = false; }
        else { focus = 'editor'; tabs[activeTab].editor.focused = true; terminal.focused = false; }
      }
      return;
    }

    const chrome = hitSidebarChrome();
    if (chrome === 'search') {
      searchFocused = true;
      tabs[activeTab].editor.focused = false;
      searchCaretPhase = 0;
      return;
    }
    if (chrome && chrome.kind === 'source') {
      const i = chrome.i;
      if (i !== activeSource) {
        activeSource = i;
        fileTree.setRoots(SOURCES[i].roots, SOURCES[i].expanded);
        searchQuery = '';
      }
      if (searchFocused) blurSearch();
      return;
    }
    if (chrome && chrome.kind === 'action') {
      const i = chrome.i;
      if (i === 0) fileTree.expandAll();
      else if (i === 1) fileTree.collapseAll();
      else fileTree.refresh();
      if (searchFocused) blurSearch();
      return;
    }

    if (sw > 1 && mx >= AB_W && mx < AB_W + sw && my >= SB_TREE_Y && my < h - STATUS_H && sidebarT > 0.9) {
      if (searchFocused) blurSearch();
      const row = fileTree.rowAtY(my);
      if (row) {
        if (fileTree.isOnChevron(mx, row) || row.node.type === 'folder') {
          fileTree.toggleFolder(row.node.path);
        } else {
          fileTree.select(row.node.path);
          if (row.node.type === 'file') openFileNode(row.node);
        }
      }
      return;
    }

    if (searchFocused) { blurSearch(); return; }

    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      if (my >= ty2 && my < ty2 + TERM_HEADER_H) {
        const closeX = w - 28;
        if (Math.abs(mx - closeX) < 10) {
          termOpen = false; termDir = -1;
          focus = 'editor'; tabs[activeTab].editor.focused = true; terminal.focused = false;
        }
        return;
      }
      if (my >= ty2 + TERM_HEADER_H && my < h - STATUS_H) {
        focus = 'terminal'; terminal.focused = true; tabs[activeTab].editor.focused = false;
        return;
      }
    }

    if (my < TAB_BAR_H && mx >= editorX) {
      let txx = editorX + 4;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (mx >= txx && mx <= txx + tw2) {
          const closeCx = txx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ / 2;
          if (Math.abs(mx - closeCx) < TAB_CLOSE_SZ && tabs.length > 1) {
            closeTabAt(i);
          } else {
            switchToTab(i);
            focus = 'editor';
          }
          return;
        }
        txx += tw2;
      }
      return;
    }

    if (mx >= editorX && my >= TAB_BAR_H && my < h - STATUS_H) {
      focus = 'editor';
      const ed = tabs[activeTab].editor;
      ed.focused = true;
      if (shift) ed.placeCursor(mx, my, true);
      else if (clickCount === 2) ed.selectTokenAt(mx, my);
      else if (clickCount === 3) ed.selectLineAt(my);
      else if (clickCount >= 4) { ed.selectAll(); mct.reset(); }
      else ed.placeCursor(mx, my, false);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.button === 2) { rg.release(); setOrbitPanChord(false); return; }
    if (e.button !== 0) return;
    fpsChip?.pointerUp(performance.now());
    dragSel = false;
    qualityPanel.endDrag();
    if (cam3d && d3.active) {
      const wasDrag = d3.moved || performance.now() - d3.t > 400;
      d3.active = false;
      const [sx, sy] = toWorld(e);
      const sbx = sx * dpr, sby = sy * dpr;
      const [hx, hy] = menuWorldPose ? menuScreenToLocal(sbx, sby) : [sbx, sby];
      if (gate.pressEnded(hx, hy, wasDrag)) return;
      if (wasDrag) return;
      const p = screenToDocLocal(sx * dpr, sy * dpr, tCanvas.width, tCanvas.height);
      const ph = isPhys() ? physPick(p.x, p.y) : null;
      if (ph) handlePick(ph.x, ph.y, e.shiftKey, true);
      else handlePick(p.x, p.y, e.shiftKey);
    } else {
      const [sx, sy] = toWorld(e);
      const sbx = sx * dpr, sby = sy * dpr;
      const [hx, hy] = menuWorldPose ? menuScreenToLocal(sbx, sby) : [sbx, sby];
      gate.pressEnded(hx, hy, false);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    fitted = false;
    rg.wheel();

    const { editorX, editorH, sw } = layout();

    const overTree = sw > 1 && sidebarT > 0.9 && mx >= AB_W && mx < AB_W + sw && my >= SB_TREE_Y && my < cssH() - STATUS_H;
    const overEditor = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    const panel = overTree ? 'tree' : overEditor ? 'editor' : null;
    const decision = routeScroll(rg.down, panel);

    if (decision.kind === 'scroll') {
      e.stopImmediatePropagation();
      if (decision.panel === 'tree') {
        const applied = fileTree.scrollBy(e.deltaY * 0.5);
        if (isPhys()) physScroll('tree', -applied);
      } else {
        const ed = tabs[activeTab].editor;
        const before = ed.y0;
        ed.y0 -= e.deltaY * 0.5;
        const maxScroll = Math.max(0, ed.contentHeight() - editorH);
        ed.y0 = Math.min(TAB_BAR_H, Math.max(TAB_BAR_H - maxScroll, ed.y0));
        if (isPhys()) physScroll('editor', ed.y0 - before);
      }
      return;
    }
    if (!cam3d) return;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (searchFocused) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') { e.preventDefault(); blurSearch(); }
      else if (e.key === 'Enter') { e.preventDefault(); blurSearch(); }
      else if (ctrl && e.key === 'v') { e.preventDefault(); actions.pasteQuery(); }
      else if (ctrl && e.key === 'c') { e.preventDefault(); actions.copyQuery(); }
      else if (ctrl && e.key === 'x') { e.preventDefault(); actions.cutQuery(); }
      else if (e.key === 'Backspace') { e.preventDefault(); searchQuery = searchQuery.slice(0, -1); fileTree.setFilter(searchQuery); }
      else if (e.key.length === 1 && !ctrl) { e.preventDefault(); searchQuery += e.key; fileTree.setFilter(searchQuery); searchCaretPhase = 0; }
      return;
    }
    if (focus === 'terminal') {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        termOpen = false; termDir = -1;
        focus = 'editor';
        tabs[activeTab].editor.focused = true;
        terminal.focused = false;
        return;
      }
      if (terminal.handleKey(e)) return;
    }
    const ed = tabs[activeTab].editor;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z') { e.preventDefault(); ed.undo(); return; }
    if (ctrl && e.key === 'y') { e.preventDefault(); ed.redo(); return; }
    if (ctrl && e.key === 'a') { e.preventDefault(); ed.selectAll(); return; }
    if (ctrl && e.key === 'c') { e.preventDefault(); actions.copy(); return; }
    if (ctrl && e.key === 'x') { e.preventDefault(); actions.cut(); return; }
    if (ctrl && e.key === 'v') { e.preventDefault(); actions.paste(); return; }
    if (ctrl && e.key === 'p') { e.preventDefault(); sidebarOpen = true; sidebarDir = 1; searchFocused = true; tabs[activeTab].editor.focused = false; searchCaretPhase = 0; return; }
    if (ctrl && e.key === '`') { e.preventDefault(); termOpen = !termOpen; termDir = termOpen ? 1 : -1; if (termOpen) { focus = 'terminal'; terminal.focused = true; ed.focused = false; } else { focus = 'editor'; ed.focused = true; terminal.focused = false; } return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); ed.moveLeft(e.shiftKey); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ed.moveRight(e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ed.moveVert(-1, e.shiftKey); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); ed.moveVert(1, e.shiftKey); }
    else if (e.key === 'Home') { e.preventDefault(); ed.moveHome(e.shiftKey); }
    else if (e.key === 'End') { e.preventDefault(); ed.moveEnd(e.shiftKey); }
    else if (e.key === 'Backspace') { e.preventDefault(); ed.backspace(); }
    else if (e.key === 'Delete') { e.preventDefault(); ed.del(); }
    else if (e.key === 'Enter') { e.preventDefault(); ed.newline(); }
    else if (e.key === 'Tab') { e.preventDefault(); ed.indent(); }
    else if (e.key.length === 1 && !ctrl) { e.preventDefault(); ed.insertText(e.key); }
  }

  enterOrbit(cssW() / 2, cssH() / 2, dpr, tCanvas.height);
  setOrbitEnabled(true);
  setOrbitNear(1e-3);

  // ── Context menu routing ───────────────────────────────────────────────────
  // Right-click (or the keyboard menu key) opens the menu for the surface under
  // the pointer. Hit-test order mirrors handlePick: tab bar → sidebar tree →
  // terminal → editor. In 3D the screen point is projected onto the document
  // plane first, exactly like the left-click path. A right-DRAG (orbit/pan) is
  // suppressed via rightMoved so releasing an orbit never pops a menu.
  // New surfaces: add a builder in menus.ts, then a branch here.
  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (rg.suppressMenu) return;
    // Menus are screen overlays: anchor at the click in backing-store px (scale dpr).
    // World coords (wx/wy) still decide WHICH menu opens; scx/scy decide WHERE.
    gate.setViewport(tCanvas.width, tCanvas.height);
    const [scx, scy] = toWorld(e);
    let [wx, wy] = [scx, scy];
    if (cam3d) {
      const p = screenToDocLocal(wx * dpr, wy * dpr, tCanvas.width, tCanvas.height);
      wx = p.x; wy = p.y;
    }
    if (isPhys()) {
      const ph = physPick(wx, wy);
      if (ph) { wx = ph.x; wy = ph.y; }
      else if (physDead(wx, wy)) return;
    }
    const { h, editorX, sw, termH } = layout();

    // Editor tab strip (right-click also activates the targeted tab).
    if (wy < TAB_BAR_H && wx >= editorX) {
      let txx = editorX + 4, idx = -1;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (wx >= txx && wx <= txx + tw2) { idx = i; break; }
        txx += tw2;
      }
      if (idx >= 0) {
        switchToTab(idx);
        focus = 'editor';
        showMenuWorld(scx * dpr, scy * dpr, tabMenu(actions, idx, tabs.length), dpr);
      }
      return;
    }

    // Sidebar search box.
    if (sw > 1 && sidebarT > 0.9) {
      const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
      if (wx >= sx0 && wx <= sx1 && wy >= SB_SEARCH_Y && wy <= SB_SEARCH_Y + SB_SEARCH_H) {
        searchFocused = true;
        tabs[activeTab].editor.focused = false;
        searchCaretPhase = 0;
        showMenuWorld(scx * dpr, scy * dpr, searchMenu(actions), dpr);
        return;
      }
    }

    // File tree rows — folders and files get distinct menus.
    if (sw > 1 && sidebarT > 0.9 && wx >= AB_W && wx < AB_W + sw && wy >= SB_TREE_Y && wy < h - STATUS_H) {
      const row = fileTree.rowAtY(wy);
      if (row) {
        fileTree.select(row.node.path);
        showMenuWorld(scx * dpr, scy * dpr, row.node.type === 'folder'
          ? folderMenu(actions, row.node, fileTree.isExpanded(row.node.path))
          : fileMenu(actions, row.node), dpr);
      }
      return;
    }

    // Terminal panel (header + body).
    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      if (wx >= editorX && wy >= ty2 && wy < h - STATUS_H) {
        focus = 'terminal';
        terminal.focused = true;
        tabs[activeTab].editor.focused = false;
        showMenuWorld(scx * dpr, scy * dpr, terminalMenu(actions), dpr);
        return;
      }
    }

    // Code editor body.
    if (wx >= editorX && wy >= TAB_BAR_H && wy < h - STATUS_H) {
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      showMenuWorld(scx * dpr, scy * dpr, editorMenu(actions), dpr);
    }
  }

  let alive = true;
  function frame(now: number) {
    if (!alive) return;
    requestAnimationFrame(frame);
    render(now);
  }
  requestAnimationFrame(frame);

  // Own the backing-store size from here on (the launcher sized it before us):
  // window resizes and the quality panel's display-resolution dial both go through
  // setSize(). While fitted, the per-frame re-fit in render() keeps the framing.
  setSize();
  const onResize = () => setSize();
  addEventListener('resize', onResize);

  rCanvas.addEventListener('pointermove', onPointerMove);
  rCanvas.addEventListener('pointerdown', onPointerDown);
  rCanvas.addEventListener('pointerup', onPointerUp);
  rCanvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  rCanvas.addEventListener('contextmenu', onContextMenu);
  addEventListener('keydown', onKeyDown);

  // ── Quality panel (analytic, yasmineOS) — bundled behind the 🎛️ button ─────
  // The same reusable AnalyticPanel + sliders the playground uses. Display
  // resolution drives applyRenderScale (swapchain resize via the effective dpr);
  // the integral + sharpen rows drive the low-res render + CAS-upscale path above.
  const qualityPanel = new AnalyticPanel([
    { kind: 'header', id: 'q', label: 'Quality' },
    { kind: 'slider', id: 'res', label: 'Display resolution', min: 0.25, max: 2, step: 0.05,
      get: () => renderScale, set: applyRenderScale, fmt: (v) => v.toFixed(2) + '×' },
    { kind: 'toggle', id: 'sharpenOn', label: 'Low-res render + sharpen',
      get: () => lowResSharpen, set: (v) => { lowResSharpen = v; } },
    { kind: 'slider', id: 'integral', label: 'Integral resolution', min: 0.25, max: 1, step: 0.05,
      get: () => integralScale, set: (v) => { integralScale = v; }, fmt: (v) => v.toFixed(2) + '×', enabled: () => lowResSharpen },
    { kind: 'slider', id: 'sharpen', label: 'Sharpen', min: 0, max: 1, step: 0.05,
      get: () => sharpenAmount, set: (v) => { sharpenAmount = v; }, fmt: (v) => v.toFixed(2), enabled: () => lowResSharpen },
  ]);

  const toolbar = new AnalyticToolbar([
    { id: 'back', icon: 'home', title: 'Back to launcher', onClick: onBack },
    { id: 'debug', icon: 'stats', title: 'Toggle debug stats', active: () => fpsChip.visible, onClick: () => {
      fpsChip.visible = !fpsChip.visible;
      showDebug = fpsChip.visible;
    }},
    { id: 'fx', icon: 'film', title: 'Shader FX', altIcon: 'play',
      active: () => fxMode !== 'off',
      onClick: () => {
        const items: import('../ui/analyticMenu').AnalyticMenuItem[] = FX_NAMES.map((name) => ({
          id: name,
          label: name === 'off' ? 'None' : name[0].toUpperCase() + name.slice(1),
          icon: name === fxMode ? 'icon:check' : undefined,
          action: () => { fxMode = name; },
        }));
        // Screen overlay anchored just below the FX button (backing-store px).
        const fb = toolbar.buttons.find((b) => b.btn.id === 'fx');
        gate.setViewport(tCanvas.width, tCanvas.height);
        menuWorldPose = null;
        gate.show(fb ? fb.x : mx * dpr, fb ? fb.y + fb.s + 4 * dpr : my * dpr, items, dpr);
      }},
    { id: 'quality', icon: 'sliders', title: 'Quality settings: display resolution, low-res render + sharpen upscale', onClick: () => {
      const qb = toolbar.buttons.find((b) => b.btn.id === 'quality');
      qualityPanel.toggle(qb ? qb.x : tCanvas.width - 260 * dpr, qb ? qb.y + qb.s + 4 * dpr : 60 * dpr, tCanvas.width, tCanvas.height, dpr);
    }},
  ]);

  // Build the screen-space overlay each frame: toolbar buttons first, then the
  // open analytic menu on top. Both emit into the ScreenHud's buffers (seeded with
  // the atlas base in frame()) and draw through one screen-ortho pass. The open
  // quality panel re-anchors to its button each frame so it tracks live while its
  // own resolution slider resizes the backing store (size stays apparent-fixed).
  screenHud.onBuild = (hud, Cw, Ch, now) => {
    toolbar.setScreen(Cw, Ch, 8 * dpr, 5 * dpr, 26 * dpr);
    if (qualityPanel.open) {
      const qb = toolbar.buttons.find((b) => b.btn.id === 'quality');
      if (qb) qualityPanel.reposition(qb.x, qb.y + qb.s + 4 * dpr, Cw, Ch, dpr);
    }
    toolbar.render(hud.inst, hud.crv, hud.rws, now);
    fpsChip?.render(hud.inst, hud.crv, hud.rws, font, atlas, dpr);
    qualityPanel.render(font, atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_PANEL_THEME);
    if (gate.open && !menuWorldPose) gate.menu.render(font, atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_MENU_THEME);
  };

  return () => {
    alive = false;
    setOrbitEnabled(false);
    setOrbitNear(1);
    rCanvas.removeEventListener('pointermove', onPointerMove);
    rCanvas.removeEventListener('pointerdown', onPointerDown);
    rCanvas.removeEventListener('pointerup', onPointerUp);
    rCanvas.removeEventListener('wheel', onWheel, { capture: true });
    rCanvas.removeEventListener('contextmenu', onContextMenu);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('resize', onResize);
    fpsEl.style.display = prevFpsDisplay;
    depthTex?.destroy();
  };
}
