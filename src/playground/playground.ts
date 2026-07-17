// ── Entry point ─────────────────────────────────────────────────────────────
// Wires the modules together: loads GPU/font, builds the layout DOM, computes
// static buffers, attaches input, and starts the frame loop. All logic lives in
// the focused modules under css/, layout/, camera/, content/, and frame.ts.

import type { Engine } from './engine';
import { createThemeController } from '../css/themeController';
import { createAppState } from '../state';
import { buildStatic } from '../precompute';
import { setSize, goToPage } from '../camera/camera';
import { toggle3D, enter3D } from '../camera/camera';
import { orbitSetPose, orbitDistForZoom, updateOrbit, disableOrbit } from '../camera/orbit';
import { attachInput } from '../camera/input';
import { runFrame } from '../frame';
import { CodeEditor } from '../editor/editor';
import { SAMPLE_CODE } from '../editor/sample';
import { Terminal } from '../editor/terminal';
import { FileTree } from '../editor/fileTree';
import { createToolbar } from './toolbar';
import { createDemo } from './cinematic';
import { WindgraphDemo } from './boards/windgraphDemo';
import { MorphDemo } from './boards/morphDemo';
import { InteractDemo } from './boards/interactDemo';
import { Surface3DDemo } from './boards/surface3dDemo';
import { MathDemo } from './boards/mathDemo';
import { PerfBench } from './bench';
import { PerfBenchmark } from './benchmark';
import { createScriptRuntime } from './scriptRuntime';

// Boot the full showcase (every board + editor/terminal/file-tree + toolbar +
// cinematic) against the shared engine. Returns a disposer that stops the frame
// loop and removes all listeners + DOM chrome, so the launcher can tear it down
// and return to the menu.
export function bootPlayground(engine: Engine, onBack?: () => void): () => void {
  const { fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, font, renderer, atlas, upscaler, meshRenderer } = engine;
  const { container, themeStyle, styledEls, pageRoots, docH, pages, docRoot } = engine.ref;

  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device,
    renderer,
    font, atlas, container,
    styledEls, pageRoots, editableEls: styledEls.filter(e => e.editable),
    dynamicEls: styledEls.filter(e => e.dynamic),
    marqueeEls: styledEls.filter(e => e.hasFlow && !e.skipText && e.classes.includes('marquee')),
    pages, docH, docRoot, fpsEl,
  });

  const theme = createThemeController(s, themeStyle, buildStatic);
  theme.apply('dark');
  s.cycleTheme = theme.cycle;
  s.upscaler = upscaler;

  buildStatic(s);
  s.pageVisible = new Array(s.pageRoots.length).fill(true);

  // ── Code editor ─────────────────────────────────────────────────────────
  // Lives in world space to the right of the document, so panning/zooming reach
  // it too. Toggling editor mode just re-frames the camera onto it.
  const editor = new CodeEditor(SAMPLE_CODE);
  editor.font = font;
  editor.x0 = PAGE_W + 160;
  editor.y0 = 0;
  s.editor = editor;

  function frameEditor() {
    const w = editor.contentWidth();
    s.tgtZ = Math.min((s.tCanvas.width / w) * 0.92, 1.4);
    s.tgtX = editor.x0 + w / 2;
    s.tgtY = editor.y0 + s.tCanvas.height / (2 * s.tgtZ) - 20;
    s.velX = s.velY = 0;
  }

  // ── File tree ─────────────────────────────────────────────────────────────
  // World-space panel to the left of the document.
  const fileTree = new FileTree();
  fileTree.font = font;
  fileTree.x0 = -fileTree.width - 40;
  fileTree.y0 = 0;
  s.fileTree = fileTree;

  function frameFileTree() {
    const w = fileTree.width + 60;
    const z = Math.min((s.tCanvas.width / w) * 0.92, 1.4);
    fileTree.setViewportHeight(s.tCanvas.height / Math.max(z, 1e-6));
    const h = fileTree.contentHeight;
    s.tgtZ = z;
    s.tgtX = fileTree.x0 + w / 2;
    s.tgtY = fileTree.y0 + h / 2;
    s.velX = s.velY = 0;
  }

  // ── windgraph Phase-0 stroke board ────────────────────────────────────────
  // World-space board below the document; exercises the stroke→fill engine.
  const windgraph = new WindgraphDemo();
  windgraph.x0 = 0;
  windgraph.y0 = s.docH + 400;
  s.windgraph = windgraph;

  // Navigate to a 2D board. If we're in the 3D free camera (e.g. after viewing the
  // 3D graph), drop back to 2D and snap so the target board is framed immediately.
  function frame2DBoard(x: number, y: number, z: number) {
    if (s.cam3d.active) {
      disableOrbit();
      s.cam3d.active = false; s.cam3d.exiting = false;
      s.camX = s.viewX = x; s.camY = s.viewY = y; s.camZ = s.viewZ = z;
    }
    s.tgtX = x; s.tgtY = y; s.tgtZ = z; s.velX = s.velY = 0;
  }

  function frameWindgraph() {
    const g = windgraph;
    const z = Math.min((s.tCanvas.width / (g.width + 200)) * 0.9, (s.tCanvas.height / (g.height + 200)) * 0.9);
    frame2DBoard(g.x0 + g.width / 2, g.y0 + g.height / 2, z);
  }

  // ── windgraph Phase-4 animation demo ──────────────────────────────────────
  // World-space board above the document; runs the eased morph/draw-on scene.
  const morphDemo = new MorphDemo();
  morphDemo.x0 = 0;
  morphDemo.y0 = -morphDemo.height - 200;
  s.morphDemo = morphDemo;

  function frameMorph() {
    const g = morphDemo;
    const z = Math.min((s.tCanvas.width / (g.width + 160)) * 0.9, (s.tCanvas.height / (g.height + 160)) * 0.9);
    frame2DBoard(g.x0 + g.width / 2, g.y0 + g.height / 2, z);
  }

  // ── windgraph Phase-5 interactivity demo ──────────────────────────────────
  // World-space draggable board to the right of the animation board.
  const interactive = new InteractDemo();
  interactive.x0 = morphDemo.width + 400;
  interactive.y0 = -interactive.height - 200;
  s.interactive = interactive;

  function frameInteractive() {
    const g = interactive;
    const z = Math.min((s.tCanvas.width / (g.width + 160)) * 0.9, (s.tCanvas.height / (g.height + 160)) * 0.9);
    frame2DBoard(g.x0 + g.width / 2, g.y0 + g.height / 2, z);
  }

  // ── windgraph Phase-7 3D graphing demo (TRUE 3D mesh) ─────────────────────
  // A real 3D surface that rises off the ground plane; viewed with the free
  // camera. Framed by entering 3D and posing the orbit over its footprint.
  const graph3d = new Surface3DDemo();
  graph3d.cx = PAGE_W + 1000;
  graph3d.cy = 500;
  s.graph3d = graph3d;
  s.meshRenderer = meshRenderer;

  function frameGraph3d() {
    // Always show the surface as a TRUE 3D object (no jarring flat 2D colour map):
    // centre the 2D view on it, lift into the orbit camera, then pose at a tilted
    // 3/4 angle so it rises off the ground. Same free-camera as 🧊 / the cinematic.
    const g = graph3d;
    const Ch = s.tCanvas.height, Cw = s.tCanvas.width;
    const span = g.halfSpan * 2 + 1000;
    const zoom = Math.min(Cw / span, Ch / span) * 0.95;
    s.camX = s.viewX = s.tgtX = g.cx;
    s.camY = s.viewY = s.tgtY = g.cy;
    s.camZ = s.viewZ = s.tgtZ = zoom;
    enter3D(s);
    orbitSetPose(g.cx, g.cy, orbitDistForZoom(zoom, Ch), 0.6, 0.88);
    updateOrbit(16);
    s.velX = s.velY = 0;
  }

  // ── windgraph Phase-6 math typesetting demo ───────────────────────────────
  // World-space board to the right of the 3D board.
  const mathDemo = new MathDemo();
  mathDemo.x0 = interactive.x0 + interactive.width + 400;
  mathDemo.y0 = -mathDemo.height - 200;
  s.mathDemo = mathDemo;

  function frameMath() {
    const g = mathDemo;
    const z = Math.min((s.tCanvas.width / (g.width + 160)) * 0.9, (s.tCanvas.height / (g.height + 160)) * 0.9);
    frame2DBoard(g.x0 + g.width / 2, g.y0 + g.height / 2, z);
  }

  // ── Perf isolation bench ──────────────────────────────────────────────────
  const bench = new PerfBench();
  bench.x0 = mathDemo.x0 + mathDemo.width + 500;
  bench.y0 = -bench.height - 200;
  s.bench = bench;
  function frameBench() {
    const g = bench;
    const z = Math.min((s.tCanvas.width / (g.width + 160)) * 0.9, (s.tCanvas.height / (g.height + 160)) * 0.9);
    frame2DBoard(g.x0 + g.width / 2, g.y0 + g.height / 2, z);
  }

  // ── Scripted perf benchmark (⏱️) ─────────────────────────────────────────
  // Results board lives left of the file tree, clear of everything else.
  const perfBenchmark = new PerfBenchmark(s);
  perfBenchmark.x0 = fileTree.x0 - perfBenchmark.width - 400;
  perfBenchmark.y0 = 0;
  s.perf = perfBenchmark;

  // ── Terminal ──────────────────────────────────────────────────────────────
  // Same renderer, its own world-space panel to the right of the editor.
  const terminal = new Terminal();
  terminal.font = font;
  terminal.x0 = editor.x0 + 1400;
  terminal.y0 = 0;
  s.terminal = terminal;
  const scriptRuntime = createScriptRuntime(s, (message) => terminal.writeLine(message));
  terminal.setCommandHandler((raw, term) => scriptRuntime.handleTerminal(raw, term));

  function frameTerminal() {
    const w = terminal.contentW;
    s.tgtZ = Math.min((s.tCanvas.width / w) * 0.92, 1.5);
    s.tgtX = terminal.x0 + w / 2;
    s.tgtY = terminal.y0 + s.tCanvas.height / (2 * s.tgtZ) - 20;
    s.velX = s.velY = 0;
  }

  let edBtn: HTMLButtonElement | null = null;
  let tmBtn: HTMLButtonElement | null = null;
  let ftBtn: HTMLButtonElement | null = null;
  function setEditorMode(on: boolean) {
    s.editorMode = on;
    if (on) { s.terminalMode = false; s.fileTreeMode = false; terminal.focused = false; fileTree.focused = false; editor.focused = true; s.activeEdit = null; frameEditor(); }
    else goToPage(s, 0);
    if (edBtn) edBtn.textContent = on ? '📄' : '⌨️';
    if (tmBtn) tmBtn.textContent = '❯_';
    if (ftBtn) ftBtn.textContent = '📁';
  }
  function setTerminalMode(on: boolean) {
    s.terminalMode = on;
    if (on) { s.editorMode = false; s.fileTreeMode = false; editor.focused = false; fileTree.focused = false; terminal.focused = true; s.activeEdit = null; terminal.open(); frameTerminal(); }
    else goToPage(s, 0);
    if (tmBtn) tmBtn.textContent = on ? '📄' : '❯_';
    if (edBtn) edBtn.textContent = '⌨️';
    if (ftBtn) ftBtn.textContent = '📁';
  }
  function setFileTreeMode(on: boolean) {
    s.fileTreeMode = on;
    if (on) { s.editorMode = false; s.terminalMode = false; editor.focused = false; terminal.focused = false; fileTree.focused = true; s.activeEdit = null; frameFileTree(); }
    else goToPage(s, 0);
    if (ftBtn) ftBtn.textContent = on ? '📄' : '📁';
    if (edBtn) edBtn.textContent = '⌨️';
    if (tmBtn) tmBtn.textContent = '❯_';
  }

  // Fixed toolbar (top-right): editor toggle + terminal toggle + theme cycle.
  let ptrBtn: HTMLButtonElement | null = null;
  let camBtn: HTMLButtonElement | null = null;
  const stylePtrBtn = () => { if (ptrBtn) ptrBtn.style.opacity = s.pointerInput ? '1' : '0.4'; };
  const styleCamBtn = () => { if (camBtn) camBtn.style.opacity = s.cameraInput ? '1' : '0.4'; };
  // ── Quality panel (bundled behind the 🎛️ toolbar button) ───────────────────
  // Groups every quality/performance dial. renderScale changes the SWAPCHAIN
  // (display) resolution — apparent zoom is preserved by scaling camZ so only
  // sharpness/compositor cost move. The low-res+sharpen toggle instead renders the
  // analytic coverage into a smaller offscreen texture and CAS-upscales it, cutting
  // fragment fill-rate while keeping a full-res crisp display (windfoil/upscale.ts).
  const applyRenderScale = (v: number) => {
    const old = s.renderScale || 1;
    if (v === old) return;
    const f = v / old;
    s.renderScale = v; s.camZ *= f; s.viewZ *= f; s.tgtZ *= f;
    setSize(s);
  };
  const qPanel = document.createElement('div');
  qPanel.style.cssText = 'position:fixed;top:64px;right:14px;z-index:15;display:none;width:236px;padding:12px 14px;'
    + 'border-radius:12px;background:rgba(18,18,32,0.95);color:#cdd2e0;font:12px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5);';
  const mkRow = (label: string) => {
    const row = document.createElement('div'); row.style.cssText = 'margin:10px 0;';
    const lab = document.createElement('div'); lab.textContent = label;
    lab.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;color:#aeb4c6;';
    row.appendChild(lab); return { row, lab };
  };
  const mkSlider = (min: number, max: number, step: number, val: number) => {
    const el = document.createElement('input'); el.type = 'range';
    el.min = String(min); el.max = String(max); el.step = String(step); el.value = String(val);
    el.style.cssText = 'width:100%;accent-color:#6b7bd6;cursor:pointer;'; return el;
  };
  qPanel.innerHTML = '<div style="font-weight:600;margin-bottom:2px;color:#e6e9f2;">Quality</div>';
  // Display resolution (swapchain).
  const rRes = mkRow(''); const sRes = mkSlider(0.25, 2, 0.05, 1); rRes.row.appendChild(sRes); qPanel.appendChild(rRes.row);
  const updResLbl = () => { rRes.lab.innerHTML = `<span>Display resolution</span><b>${(s.renderScale || 1).toFixed(2)}×</b>`; };
  sRes.oninput = () => { applyRenderScale(parseFloat(sRes.value)); updResLbl(); };
  updResLbl();
  // Low-res render + sharpen toggle.
  const rTog = mkRow('Low-res render + sharpen');
  const cTog = document.createElement('input'); cTog.type = 'checkbox'; cTog.checked = s.lowResSharpen; cTog.style.cursor = 'pointer';
  rTog.lab.appendChild(cTog); qPanel.appendChild(rTog.row);
  // Integral (offscreen) resolution.
  const rInt = mkRow(''); const sInt = mkSlider(0.25, 1, 0.05, s.integralScale); rInt.row.appendChild(sInt); qPanel.appendChild(rInt.row);
  const updIntLbl = () => { rInt.lab.innerHTML = `<span>Integral resolution</span><b>${s.integralScale.toFixed(2)}×</b>`; };
  sInt.oninput = () => { s.integralScale = parseFloat(sInt.value); updIntLbl(); };
  updIntLbl();
  // Sharpen strength.
  const rShp = mkRow(''); const sShp = mkSlider(0, 1, 0.05, s.sharpenAmount); rShp.row.appendChild(sShp); qPanel.appendChild(rShp.row);
  const updShpLbl = () => { rShp.lab.innerHTML = `<span>Sharpen</span><b>${s.sharpenAmount.toFixed(2)}</b>`; };
  sShp.oninput = () => { s.sharpenAmount = parseFloat(sShp.value); updShpLbl(); };
  updShpLbl();
  const syncSharpEnable = () => { const on = s.lowResSharpen; sInt.disabled = sShp.disabled = !on; rInt.row.style.opacity = rShp.row.style.opacity = on ? '1' : '0.4'; };
  cTog.onchange = () => { s.lowResSharpen = cTog.checked; syncSharpEnable(); };
  syncSharpEnable();
  document.body.appendChild(qPanel);
  const toggleQualityPanel = () => { qPanel.style.display = qPanel.style.display === 'none' ? 'block' : 'none'; };
  const toolbarDestroy = createToolbar([
    ...(onBack ? [{ icon: '🏠', title: 'Back to launcher', onClick: onBack }] : []),
    { icon: '📁', title: 'Toggle file tree', onClick: () => setFileTreeMode(!s.fileTreeMode), ref: (el) => { ftBtn = el; } },
    { icon: '⌨️', title: 'Toggle code editor', onClick: () => setEditorMode(!s.editorMode), ref: (el) => { edBtn = el; } },
    { icon: '❯_', title: 'Toggle terminal', onClick: () => setTerminalMode(!s.terminalMode), ref: (el) => { tmBtn = el; } },
    { icon: '🧊', title: 'Toggle 3D free camera (drag = orbit, Shift+drag = pan, wheel = dolly)', onClick: () => toggle3D(s) },
    { icon: '🖱️', title: 'Toggle pointer input (hover, clicks, drags) — perf isolation', onClick: () => { s.pointerInput = !s.pointerInput; stylePtrBtn(); }, ref: (el) => { ptrBtn = el; stylePtrBtn(); } },
    { icon: '🧭', title: 'Toggle camera input (drag pan + wheel zoom) — perf isolation', onClick: () => { s.cameraInput = !s.cameraInput; styleCamBtn(); }, ref: (el) => { camBtn = el; styleCamBtn(); } },
    { icon: '🎛️', title: 'Quality settings: display resolution, low-res render + sharpen upscale', onClick: toggleQualityPanel },
    { icon: '🎬', title: 'Play cinematic demo flight (any interaction stops it)', onClick: () => s.demo?.toggle() },
    { icon: '📈', title: 'windgraph stroke demo (Phase 0)', onClick: () => frameWindgraph() },
    { icon: '🎞️', title: 'windgraph animation demo (Phase 4): morph, draw-on, riding point', onClick: () => frameMorph() },
    { icon: '🔷', title: 'windgraph interactive demo (Phase 5): drag the triangle vertices', onClick: () => frameInteractive() },
    { icon: '🗻', title: 'windgraph 3D graphing demo (Phase 7): drag to orbit the surface', onClick: () => frameGraph3d() },
    { icon: '📐', title: 'windgraph math typesetting demo (Phase 6): analytic LaTeX', onClick: () => frameMath() },
    { icon: '🧪', title: 'perf bench: click to cycle stress modes (watch FPS)', onClick: () => { s.bench!.cycle(); frameBench(); } },
    { icon: '⏱️', title: 'run scripted perf benchmark (~20s tour of all items + quality A/B; results board + clipboard table)', onClick: () => s.perf!.toggle() },
    { icon: '🌙', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!(), ref: (el) => { s.themeBtn = el; } },
  ]);

  const onResize = () => setSize(s);
  addEventListener('resize', onResize);
  setSize(s); goToPage(s, 0);
  s.camX = s.tgtX; s.camY = s.tgtY; s.camZ = s.tgtZ;
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;

  const inputDispose = attachInput(s);
  s.demo = createDemo(s);
  const frameStop = runFrame(s);

  return () => {
    frameStop();
    inputDispose();
    toolbarDestroy();
    removeEventListener('resize', onResize);
    qPanel.remove();
    perfBenchmark.dispose();
  };
}

