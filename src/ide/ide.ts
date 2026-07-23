import type { Engine } from '../playground/engine';
import { advanceOf } from '../windfoil/font';
import { addRect, layoutStr, layoutIcon } from '../layout/metrics';
import { CodeEditor, type EditorTheme } from '../editor/editor';
import { Terminal, type TerminalTheme } from '../editor/terminal';
import { FileTree, type FileTreeTheme, type TreeNode } from '../editor/fileTree';
import { DEPTH_FORMAT } from '../windfoil/mesh3d';
import { createToolbar } from '../playground/toolbar';
import { enterOrbit, orbitViewProj, orbitScale, setOrbitEnabled, updateOrbit, screenToDocLocal, setOrbitWheelDolly, setOrbitNear, orbitDollyByWheel } from '../camera/orbit';
import { ContextMenu } from '../ui/contextMenu';
import { tabMenu, folderMenu, fileMenu, editorMenu, terminalMenu, type IdeMenuActions } from './menus';
import { ideTheme as T } from './theme';

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

const smoothstep = (t: number) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * c * (c * (c * 6 - 15) + 10); };

// ── Editor menu helpers ──────────────────────────────────────────────────────
// Pure implementations behind the editor context menu's "Format Document" and
// "Toggle Line Comment" actions. Module-level (no IDE closures) so they stay
// trivially testable and reusable.

// Net {} () [] depth change of a line, ignoring brackets inside strings, line
// comments, and (tracked across lines via `inBlock`) block comments.
function bracketDelta(line: string, inBlock: boolean): { delta: number; inBlock: boolean } {
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
function formatDocument(ed: CodeEditor) {
  const src = ed.doc.toString();
  const out: string[] = [];
  let depth = 0, inBlock = false;
  for (const raw of src.split('\n')) {
    const body = raw.trim();
    if (body) {
      const closer = body[0] === '}' || body[0] === ')' || body[0] === ']' ? 1 : 0;
      out.push('  '.repeat(Math.max(0, depth - closer)) + body);
    } else out.push('');
    const r = bracketDelta(body, inBlock);
    depth = Math.max(0, depth + r.delta);
    inBlock = r.inBlock;
  }
  const text = out.join('\n');
  if (text === src) return;
  ed.doc.replace({ start: { line: 0, col: 0 }, end: ed.doc.end() }, text, ed.cursor);
  ed.cursor = ed.doc.clampPos(ed.cursor);
  ed.anchor = null;
  ed.hl.invalidateFrom(0);
}

// Toggle `// ` on the cursor line, or every line a selection spans.
function toggleComment(ed: CodeEditor) {
  const r = ed.selectionRange();
  const l0 = r ? r.start.line : ed.cursor.line;
  const l1 = r ? r.end.line : ed.cursor.line;
  const lines: string[] = [];
  for (let i = l0; i <= l1; i++) lines.push(ed.doc.lineText(i));
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
  ed.doc.replace({ start: { line: l0, col: 0 }, end: { line: l1, col: ed.doc.lineLen(l1) } }, out.join('\n'), ed.cursor);
  ed.hl.invalidateFrom(l0);
}

const LOCAL_TREE: TreeNode[] = [
  { name: 'src', path: 'src', type: 'folder', children: [
    { name: 'camera', path: 'src/camera', type: 'folder', children: [
      { name: 'camera.ts', path: 'src/camera/camera.ts', type: 'file' },
      { name: 'input.ts', path: 'src/camera/input.ts', type: 'file' },
    ]},
    { name: 'css', path: 'src/css', type: 'folder', children: [
      { name: 'engine.ts', path: 'src/css/engine.ts', type: 'file' },
      { name: 'theme.ts', path: 'src/css/theme.ts', type: 'file' },
    ]},
    { name: 'editor', path: 'src/editor', type: 'folder', children: [
      { name: 'document.ts', path: 'src/editor/document.ts', type: 'file' },
      { name: 'editor.ts', path: 'src/editor/editor.ts', type: 'file' },
      { name: 'fileTree.ts', path: 'src/editor/fileTree.ts', type: 'file' },
      { name: 'highlight.ts', path: 'src/editor/highlight.ts', type: 'file' },
      { name: 'terminal.ts', path: 'src/editor/terminal.ts', type: 'file' },
    ]},
    { name: 'windfoil', path: 'src/windfoil', type: 'folder', children: [
      { name: 'bands.ts', path: 'src/windfoil/bands.ts', type: 'file' },
      { name: 'gpu.ts', path: 'src/windfoil/gpu.ts', type: 'file' },
      { name: 'windfoil.wgsl', path: 'src/windfoil/windfoil.wgsl', type: 'file' },
    ]},
    { name: 'frame.ts', path: 'src/frame.ts', type: 'file' },
    { name: 'state.ts', path: 'src/state.ts', type: 'file' },
  ]},
  { name: 'index.html', path: 'index.html', type: 'file' },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'VISION.md', path: 'VISION.md', type: 'file' },
  { name: 'vite.config.ts', path: 'vite.config.ts', type: 'file' },
];
const LOCAL_EXP = ['src', 'src/camera', 'src/css', 'src/editor', 'src/windfoil'];

const DIST_TREE: TreeNode[] = [
  { name: 'dist', path: 'dist', type: 'folder', children: [
    { name: 'assets', path: 'dist/assets', type: 'folder', children: [
      { name: 'index.4f2c.js', path: 'dist/assets/index.4f2c.js', type: 'file' },
      { name: 'style.9a11.css', path: 'dist/assets/style.9a11.css', type: 'file' },
    ]},
    { name: 'index.html', path: 'dist/index.html', type: 'file' },
    { name: 'windfoil.wasm', path: 'dist/windfoil.wasm', type: 'file' },
    { name: 'manifest.json', path: 'dist/manifest.json', type: 'file' },
  ]},
];
const DIST_EXP = ['dist', 'dist/assets'];

const SERVER_TREE: TreeNode[] = [
  { name: 'projects', path: 'projects', type: 'folder', children: [
    { name: 'windfoil', path: 'projects/windfoil', type: 'folder', children: [
      { name: 'src', path: 'projects/windfoil/src', type: 'folder', children: [
        { name: 'frame.ts', path: 'projects/windfoil/src/frame.ts', type: 'file' },
        { name: 'state.ts', path: 'projects/windfoil/src/state.ts', type: 'file' },
      ]},
      { name: 'package.json', path: 'projects/windfoil/package.json', type: 'file' },
      { name: 'README.md', path: 'projects/windfoil/README.md', type: 'file' },
    ]},
  ]},
];
const SERVER_EXP = ['projects', 'projects/windfoil', 'projects/windfoil/src'];

const NATIVE_TREE: TreeNode[] = [
  { name: 'Documents', path: 'Documents', type: 'folder', children: [
    { name: 'notes.md', path: 'Documents/notes.md', type: 'file' },
    { name: 'todo.txt', path: 'Documents/todo.txt', type: 'file' },
  ]},
  { name: 'Downloads', path: 'Downloads', type: 'folder', children: [
    { name: 'spec.pdf', path: 'Downloads/spec.pdf', type: 'file' },
    { name: 'photo.jpg', path: 'Downloads/photo.jpg', type: 'file' },
  ]},
];
const NATIVE_EXP = ['Documents', 'Downloads'];

const SOURCES: { label: string; roots: TreeNode[]; expanded: string[] }[] = [
  { label: 'DIST', roots: DIST_TREE, expanded: DIST_EXP },
  { label: 'LOCAL', roots: LOCAL_TREE, expanded: LOCAL_EXP },
  { label: 'SERVER', roots: SERVER_TREE, expanded: SERVER_EXP },
  { label: 'NATIVE', roots: NATIVE_TREE, expanded: NATIVE_EXP },
];

const SAMPLE_FILES: { name: string; code: string }[] = [
  {
    name: 'main.ts',
    code: `import { createEngine } from './engine';\nimport { bootIDE } from './ide/ide';\n\nconst engine = await createEngine();\n\nfunction launch() {\n  const dispose = bootIDE(engine, () => {\n    dispose();\n    launch();\n  });\n}\n\nlaunch();\n`,
  },
  {
    name: 'windfoil.wgsl',
    code: `// Box-filter coverage as a per-pixel winding integral.\n// One draw call, zero aliasing at any zoom.\n\noverride MINIFICATION_GUARD : bool = true;\noverride EXACT_MODE : bool = false;\n\n@fragment\nfn fs(in : VsOut) -> @location(0) vec4f {\n  let I = instances[in.inst];\n  let rc = in.rc;\n  let s = max(fwidth(rc), vec2f(1e-9));\n  return fold_shade(\n    integrate_face(I.band, I.bbox.y, rc, s)\n      / (s.x * s.y),\n    I.place.w, I.color);\n}\n`,
  },
  {
    name: 'bands.ts',
    code: `const TARGET_PER_BAND = 10;\nconst MAX_BANDS = 64;\nexport const BAND_SORT_MIN = 4;\n\nfunction chooseBands(n: number, t: number): number {\n  if (n <= t) return 1;\n  return Math.min(Math.ceil(n / t), MAX_BANDS);\n}\n\nexport function bandPieces(\n  pieces: number[], y0: number, y1: number,\n  curveOut: number[], rowOut: number[],\n): BandHeader {\n  const R = chooseBands(pieces.length / 6, TARGET_PER_BAND);\n  const invH = R > 1 && y1 > y0 ? R / (y1 - y0) : 0;\n  // ... file pieces into row bands\n  return { rowBase: 0, bandCount: R, bandH: 0, y0, invH };\n}\n`,
  },
];

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
  const { device, font, atlas, renderer, tCanvas, gpuCtx, dpr, rCanvas } = engine;
  const fpsEl = engine.fpsEl;
  const prevFpsDisplay = fpsEl.style.display;
  fpsEl.style.display = 'none';

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
  fileTree.setRoots(SOURCES[1].roots, SOURCES[1].expanded);

  const terminal = new Terminal();
  terminal.fontSize = 14;
  terminal.showTitleBar = false;
  terminal.open();

  const menu = new ContextMenu();

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

  // Shared tab/file helpers — used by both left-click handling and the
  // context-menu actions so behaviour stays in one place.
  function closeTabAt(i: number) {
    if (tabs.length <= 1) return;
    tabs[i].editor.focused = false;
    tabs.splice(i, 1);
    if (activeTab > i) activeTab--;
    else if (activeTab >= tabs.length) activeTab = tabs.length - 1;
    focus = 'editor';
    tabs[activeTab].editor.focused = true;
  }

  function openFileNode(node: TreeNode) {
    const existing = tabs.findIndex(t => t.name === node.name);
    if (existing >= 0) activeTab = existing;
    else {
      const ed = new CodeEditor('// ' + node.path + '\n');
      ed.fontSize = 15;
      tabs.push({ name: node.name, editor: ed });
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
      for (let i = tabs.length - 1; i >= 0; i--) if (i !== keep) tabs.splice(i, 1);
      activeTab = 0;
      focus = 'editor';
      tabs[0].editor.focused = true;
    },
    closeTabsToRight: (i) => {
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
    formatDocument: () => formatDocument(tabs[activeTab].editor),
    toggleComment: () => toggleComment(tabs[activeTab].editor),
    selectAll: () => tabs[activeTab].editor.selectAll(),
    clearTerminal: () => terminal.clear(),
    closeTerminal: () => {
      termOpen = false; termDir = -1;
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      terminal.focused = false;
    },
  };

  let mx = 0, my = 0;
  let rightDown = false;
  let rightMoved = false, rightSX = 0, rightSY = 0;
  let d3 = { x: 0, y: 0, t: 0, moved: false, active: false };
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

    const { w, h, editorX, editorH, sw, termH } = layout();
    inst.length = 0; crv.length = 0; rws.length = 0;

    addRect(0, 0, w, h, T.editorBg, crv, rws, inst);

    // ── Activity bar ──
    addRect(0, 0, AB_W, h, T.activityBarBg, crv, rws, inst);
    const tile = 34, ty = 8;
    const tileX = (AB_W - tile) / 2;
    const active = sidebarT > 0.5;
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
      const tw2 = textW(tabs[i].name, 12) + 28;
      const isActive = i === activeTab;
      const hovered = i === hoverTab;
      if (isActive) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, T.tabActiveBg, crv, rws, inst);
        addRect(tx, TAB_BAR_H - 2, tx + tw2, TAB_BAR_H, T.accent, crv, rws, inst);
      } else if (hovered) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, [1, 1, 1, 0.04], crv, rws, inst);
      }
      emitText(tabs[i].name, tx + 12, (TAB_BAR_H - 12) / 2, 12, isActive ? T.tabActiveFg : T.tabFg);
      if (tabs.length > 1) {
        const cx = tx + tw2 - 14, cy = TAB_BAR_H / 2, cs = 4;
        addRect(cx - cs, cy - 0.5, cx + cs, cy + 0.5, isActive ? T.tabActiveFg : T.tabFg, crv, rws, inst);
        addRect(cx - 0.5, cy - cs, cx + 0.5, cy + cs, isActive ? T.tabActiveFg : T.tabFg, crv, rws, inst);
      }
      tx += tw2;
    }

    // ── Editor ──
    const ed = tabs[activeTab].editor;
    ed.focused = focus === 'editor' && !searchFocused;
    ed.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);

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
    const right = 'UTF-8  ·  TypeScript  ·  Ln ' + (ed.cursor.line + 1) + ', Col ' + (ed.cursor.col + 1);
    emitText(right, w - textW(right, 11) - 14, h - STATUS_H + (STATUS_H - 11) / 2, 11, [1, 1, 1, 0.85]);

    // ── App frame ─
    addRect(0, 0, w, 1, T.separator, crv, rws, inst);
    addRect(0, h - 1, w, h, T.separator, crv, rws, inst);
    addRect(0, 1, 1, h - 1, T.separator, crv, rws, inst);
    addRect(w - 1, 1, w, h - 1, T.separator, crv, rws, inst);

    // ── Draw ─
    const Cw = tCanvas.width, Ch = tCanvas.height;
    if (inst.length > instFA.length) instFA = new Float32Array(inst.length * 2);
    let vp: Float32Array;
    let cs: number;
    if (cam3d) {
      vp = orbitViewProj(Cw, Ch);
      cs = orbitScale(Ch);
      instFA.set(inst);
    } else {
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < inst.length; i += 16) {
        instFA[i] = inst[i] - cx;
        instFA[i + 1] = inst[i + 1] - cy;
        for (let j = 2; j < 16; j++) instFA[i + j] = inst[i + j];
      }
      const sxm = (2 * dpr) / Cw, sym = (2 * dpr) / Ch;
      vp = new Float32Array([sxm, 0, 0, 0, 0, -sym, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
      cs = dpr;
    }
    if (crv.length > crvFA.length) crvFA = new Float32Array(crv.length * 2);
    crvFA.set(crv);
    if (rws.length > rwsUA.length) rwsUA = new Uint32Array(rws.length * 2);
    rwsUA.set(rws);

    const dv = ensureDepth(Cw, Ch);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: gpuCtx.getCurrentTexture().createView(), clearValue: { r: T.editorBg[0], g: T.editorBg[1], b: T.editorBg[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: dv, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    renderer.setUniforms({ width: Cw, height: Ch, camScale: [cs, cs], camCenter: [0, 0], viewProj: vp });
    renderer.draw(pass, crvFA.subarray(0, crv.length), rwsUA.subarray(0, rws.length), instFA.subarray(0, inst.length), inst.length / 16);
    pass.end();
    device.queue.submit([enc.finish()]);

    jsMs = performance.now() - t0;
    if (now - lastFpsShown > 120) {
      lastFpsShown = now;
      fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps  ·  js ${jsMs.toFixed(1)}ms  ·  worst ${worstDt.toFixed(0)}ms`;
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
    if (rightDown && (Math.abs(e.clientX - rightSX) > 6 || Math.abs(e.clientY - rightSY) > 6)) rightMoved = true;
    [mx, my] = toWorld(e);
    if (cam3d) {
      if (d3.active && (Math.abs(e.clientX - d3.x) > 5 || Math.abs(e.clientY - d3.y) > 5)) d3.moved = true;
      const p = screenToDocLocal(mx * dpr, my * dpr, tCanvas.width, tCanvas.height);
      mx = p.x; my = p.y;
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

    const { editorX } = layout();
    if (my < TAB_BAR_H && mx >= editorX) {
      let txx = editorX + 4;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = textW(tabs[i].name, 12) + 28;
        if (mx >= txx && mx <= txx + tw2) { hoverTab = i; break; }
        txx += tw2;
      }
    }

    const overChrome = hoverExplorer || hoverTerminal || hoverSearch || hoverSource >= 0 || hoverAction >= 0 || hoverTab >= 0;
    rCanvas.style.cursor = overChrome ? 'pointer' : cam3d ? 'grab' : '';
  }

  function blurSearch() { searchFocused = false; focus = 'editor'; tabs[activeTab].editor.focused = true; }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2) { rightDown = true; rightMoved = false; rightSX = e.clientX; rightSY = e.clientY; menu.hide(); return; }
    if (e.button !== 0) return;
    [mx, my] = toWorld(e);
    if (cam3d) {
      d3 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, active: true };
      return;
    }
    handlePick(mx, my, e.shiftKey);
  }

  function handlePick(px: number, py: number, shift: boolean) {
    mx = px; my = py;
    const { w, h, editorX, sw, termH } = layout();
    const tile = 34, ty = 8;

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
        const tw2 = textW(tabs[i].name, 12) + 28;
        if (mx >= txx && mx <= txx + tw2) {
          const closeX = txx + tw2 - 14;
          if (Math.abs(mx - closeX) < 8 && Math.abs(my - TAB_BAR_H / 2) < 8 && tabs.length > 1) {
            closeTabAt(i);
          } else {
            tabs[activeTab].editor.focused = false;
            activeTab = i;
            tabs[activeTab].editor.focused = true;
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
      tabs[activeTab].editor.focused = true;
      tabs[activeTab].editor.placeCursor(mx, my, shift);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.button === 2) { rightDown = false; return; }
    if (e.button !== 0) return;
    if (cam3d && d3.active) {
      d3.active = false;
      if (d3.moved || performance.now() - d3.t > 400) return;
      const [sx, sy] = toWorld(e);
      const p = screenToDocLocal(sx * dpr, sy * dpr, tCanvas.width, tCanvas.height);
      handlePick(p.x, p.y, e.shiftKey);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (cam3d) {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      orbitDollyByWheel(dy);
      return;
    }
    const { editorX, editorH, sw } = layout();
    if (sw > 1 && mx >= AB_W && mx < AB_W + sw && my >= SB_TREE_Y) {
      fileTree.scrollBy(e.deltaY * 0.5);
      return;
    }
    const ed = tabs[activeTab].editor;
    ed.y0 -= e.deltaY * 0.5;
    const maxScroll = Math.max(0, ed.contentHeight() - editorH);
    ed.y0 = Math.min(TAB_BAR_H, Math.max(TAB_BAR_H - maxScroll, ed.y0));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (searchFocused) {
      if (e.key === 'Escape') { e.preventDefault(); blurSearch(); }
      else if (e.key === 'Enter') { e.preventDefault(); blurSearch(); }
      else if (e.key === 'Backspace') { e.preventDefault(); searchQuery = searchQuery.slice(0, -1); fileTree.setFilter(searchQuery); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchQuery += e.key; fileTree.setFilter(searchQuery); searchCaretPhase = 0; }
      return;
    }
    if (focus === 'terminal') {
      const t = terminal;
      if (e.key === 'Enter') { e.preventDefault(); t.runCommand(t.input); t.input = ''; (t as any).cursorCol = 0; }
      else if (e.key === 'Backspace') { e.preventDefault(); if (t.input.length > 0) { const cc = (t as any).cursorCol as number; t.input = t.input.slice(0, Math.max(0, cc - 1)) + t.input.slice(cc); (t as any).cursorCol = Math.max(0, cc - 1); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (t as any).histIdx = Math.max(0, ((t as any).histIdx ?? 0) - 1); const h = (t as any).history as string[]; if (h.length) { t.input = h[(t as any).histIdx] ?? ''; (t as any).cursorCol = t.input.length; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); const h = (t as any).history as string[]; (t as any).histIdx = Math.min(h.length, ((t as any).histIdx ?? 0) + 1); t.input = (t as any).histIdx < h.length ? h[(t as any).histIdx] : ''; (t as any).cursorCol = t.input.length; }
      else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); t.input = ''; (t as any).cursorCol = 0; t.writeLine('^C', [0.88, 0.40, 0.38, 1]); }
      else if (e.key === '`' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); termOpen = false; termDir = -1; focus = 'editor'; tabs[activeTab].editor.focused = true; t.focused = false; }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); const cc = (t as any).cursorCol as number; t.input = t.input.slice(0, cc) + e.key + t.input.slice(cc); (t as any).cursorCol = cc + 1; }
      return;
    }
    const ed = tabs[activeTab].editor;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z') { e.preventDefault(); ed.undo(); return; }
    if (ctrl && e.key === 'y') { e.preventDefault(); ed.redo(); return; }
    if (ctrl && e.key === 'a') { e.preventDefault(); ed.selectAll(); return; }
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
  setOrbitWheelDolly(false);
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
    if (rightMoved) return;
    let [wx, wy] = toWorld(e);
    if (cam3d) {
      const p = screenToDocLocal(wx * dpr, wy * dpr, tCanvas.width, tCanvas.height);
      wx = p.x; wy = p.y;
    }
    const { h, editorX, sw, termH } = layout();

    // Editor tab strip (right-click also activates the targeted tab).
    if (wy < TAB_BAR_H && wx >= editorX) {
      let txx = editorX + 4, idx = -1;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = textW(tabs[i].name, 12) + 28;
        if (wx >= txx && wx <= txx + tw2) { idx = i; break; }
        txx += tw2;
      }
      if (idx >= 0) {
        tabs[activeTab].editor.focused = false;
        activeTab = idx;
        tabs[activeTab].editor.focused = true;
        focus = 'editor';
        menu.show(e.clientX, e.clientY, tabMenu(actions, idx, tabs.length));
      }
      return;
    }

    // File tree rows — folders and files get distinct menus.
    if (sw > 1 && sidebarT > 0.9 && wx >= AB_W && wx < AB_W + sw && wy >= SB_TREE_Y && wy < h - STATUS_H) {
      const row = fileTree.rowAtY(wy);
      if (row) {
        fileTree.select(row.node.path);
        menu.show(e.clientX, e.clientY, row.node.type === 'folder'
          ? folderMenu(actions, row.node, fileTree.isExpanded(row.node.path))
          : fileMenu(actions, row.node));
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
        menu.show(e.clientX, e.clientY, terminalMenu(actions));
        return;
      }
    }

    // Code editor body.
    if (wx >= editorX && wy >= TAB_BAR_H && wy < h - STATUS_H) {
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      menu.show(e.clientX, e.clientY, editorMenu(actions));
    }
  }

  let alive = true;
  function frame(now: number) {
    if (!alive) return;
    requestAnimationFrame(frame);
    render(now);
  }
  requestAnimationFrame(frame);

  rCanvas.addEventListener('pointermove', onPointerMove);
  rCanvas.addEventListener('pointerdown', onPointerDown);
  rCanvas.addEventListener('pointerup', onPointerUp);
  rCanvas.addEventListener('wheel', onWheel, { passive: false });
  rCanvas.addEventListener('contextmenu', onContextMenu);
  addEventListener('keydown', onKeyDown);

  const toolbarDestroy = createToolbar([
    { icon: '🏠', title: 'Back to launcher', onClick: onBack },
    { icon: '📊', title: 'Toggle debug stats', onClick: () => {
      showDebug = !showDebug;
      fpsEl.style.display = showDebug ? '' : 'none';
    }},
  ]);

  return () => {
    alive = false;
    setOrbitEnabled(false);
    setOrbitWheelDolly(true);
    setOrbitNear(1);
    rCanvas.removeEventListener('pointermove', onPointerMove);
    rCanvas.removeEventListener('pointerdown', onPointerDown);
    rCanvas.removeEventListener('pointerup', onPointerUp);
    rCanvas.removeEventListener('wheel', onWheel);
    rCanvas.removeEventListener('contextmenu', onContextMenu);
    removeEventListener('keydown', onKeyDown);
    toolbarDestroy();
    fpsEl.style.display = prevFpsDisplay;
    depthTex?.destroy();
  };
}
