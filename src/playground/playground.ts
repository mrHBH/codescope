// ── Entry point ─────────────────────────────────────────────────────────────
// Wires the modules together: loads GPU/font, builds the layout DOM, computes
// static buffers, attaches input, and starts the frame loop. All logic lives in
// the focused modules under css/, layout/, camera/, content/, and frame.ts.

import type { Engine } from './engine';
import { createThemeController } from '../css/themeController';
import { createAppState } from '../state';
import { buildStatic } from '../precompute';
import { setSize, goToPage } from '../camera/camera';
import { toggle3D, enter3D, uiScale } from '../camera/camera';
import { orbitSetPose, orbitDistForZoom, updateOrbit, disableOrbit } from '../camera/orbit';
import { attachInput } from '../camera/input';
import { runFrame } from '../frame';
import { CodeEditor } from '../editor/editor';
import { SAMPLE_CODE } from '../editor/sample';
import { Terminal } from '../editor/terminal';
import { FileTree } from '../editor/fileTree';
import { AnalyticToolbar } from '../ui/analyticToolbar';
import { ScreenHud } from '../ui/screenHud';
import { ANALYTIC_MENU_THEME } from '../ui/analyticMenu';
import { AnalyticPanel, ANALYTIC_PANEL_THEME } from '../ui/analyticPanel';
import { addRect, layoutStr, tw } from '../layout/metrics';
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

  // The fps/debug readout is drawn analytically in the screen HUD (below), so hide
  // the shared DOM #fps overlay for a 0-DOM frame (restored on teardown).
  const prevFpsDisplay = fpsEl.style.display;
  fpsEl.style.display = 'none';

  // Screen-space HUD overlay (analytic toolbar + menus + panels + readout). Drawn
  // through its own renderer with a screen-ortho matrix (see ui/screenHud.ts), so
  // the chrome stays fixed to the screen and never pans/zooms with the document.
  // The analytic context menu (created in attachInput) renders here too — that is
  // what makes it a true overlay instead of living in world space.
  s.screenHud = new ScreenHud(device, engine.shaderCode);

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

  function setEditorMode(on: boolean) {
    s.editorMode = on;
    if (on) { s.terminalMode = false; s.fileTreeMode = false; terminal.focused = false; fileTree.focused = false; editor.focused = true; s.activeEdit = null; frameEditor(); }
    else goToPage(s, 0);
  }
  function setTerminalMode(on: boolean) {
    s.terminalMode = on;
    if (on) { s.editorMode = false; s.fileTreeMode = false; editor.focused = false; fileTree.focused = false; terminal.focused = true; s.activeEdit = null; terminal.open(); frameTerminal(); }
    else goToPage(s, 0);
  }
  function setFileTreeMode(on: boolean) {
    s.fileTreeMode = on;
    if (on) { s.editorMode = false; s.terminalMode = false; editor.focused = false; terminal.focused = false; fileTree.focused = true; s.activeEdit = null; frameFileTree(); }
    else goToPage(s, 0);
  }

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
  // ── Quality panel (analytic, yasmineOS) — bundled behind the 🎛️ button ─────
  // Reusable AnalyticPanel (src/ui/analyticPanel.ts): the same sliders/toggles the
  // IDE settings menus use, drawn through the screen HUD with zero DOM. The
  // integral + sharpen rows disable themselves while low-res sharpen is off.
  const qualityPanel = new AnalyticPanel([
    { kind: 'header', id: 'q', label: 'Quality' },
    { kind: 'slider', id: 'res', label: 'Display resolution', min: 0.25, max: 2, step: 0.05,
      get: () => s.renderScale || 1, set: applyRenderScale, fmt: (v) => v.toFixed(2) + '×' },
    { kind: 'toggle', id: 'sharpenOn', label: 'Low-res render + sharpen',
      get: () => s.lowResSharpen, set: (v) => { s.lowResSharpen = v; } },
    { kind: 'slider', id: 'integral', label: 'Integral resolution', min: 0.25, max: 1, step: 0.05,
      get: () => s.integralScale, set: (v) => { s.integralScale = v; }, fmt: (v) => v.toFixed(2) + '×', enabled: () => s.lowResSharpen },
    { kind: 'slider', id: 'sharpen', label: 'Sharpen', min: 0, max: 1, step: 0.05,
      get: () => s.sharpenAmount, set: (v) => { s.sharpenAmount = v; }, fmt: (v) => v.toFixed(2), enabled: () => s.lowResSharpen },
  ]);
  s.panel = qualityPanel;

  // ── Analytic toolbar (top-right, screen-space) ──────────────────────────────
  // GPU-rendered button bar drawn through s.screenHud (see ui/analyticToolbar.ts)
  // — zero DOM. Toggled state is read live via each button's `active` callback, so
  // the bar highlights the active mode without any per-button DOM ref bookkeeping.
  // frame.ts lays it out + hover-tests it; input.ts routes clicks.
  const toolbar = new AnalyticToolbar([
    ...(onBack ? [{ id: 'back', icon: 'home' as const, title: 'Back to launcher', onClick: onBack }] : []),
    { id: 'fileTree', icon: 'folder', title: 'Toggle file tree', active: () => s.fileTreeMode, onClick: () => setFileTreeMode(!s.fileTreeMode) },
    { id: 'editor', icon: 'code', title: 'Toggle code editor', active: () => s.editorMode, onClick: () => setEditorMode(!s.editorMode) },
    { id: 'terminal', icon: 'terminal', title: 'Toggle terminal', active: () => s.terminalMode, onClick: () => setTerminalMode(!s.terminalMode) },
    { id: 'cam3d', icon: 'cube', title: 'Toggle 3D free camera (drag = orbit, Shift+drag = pan, wheel = dolly)', active: () => s.cam3d.active, onClick: () => toggle3D(s) },
    { id: 'pointer', icon: 'pointer', title: 'Toggle pointer input (hover, clicks, drags) — perf isolation', active: () => s.pointerInput, onClick: () => { s.pointerInput = !s.pointerInput; } },
    { id: 'camera', icon: 'compass', title: 'Toggle camera input (drag pan + wheel zoom) — perf isolation', active: () => s.cameraInput, onClick: () => { s.cameraInput = !s.cameraInput; } },
    { id: 'quality', icon: 'sliders', title: 'Quality settings: display resolution, low-res render + sharpen upscale', onClick: () => {
      const qb = toolbar.buttons.find((b) => b.btn.id === 'quality');
      const ui = uiScale(s);
      qualityPanel.toggle(qb ? qb.x : s.tCanvas.width - 260 * ui, qb ? qb.y + qb.s + 4 * ui : 60 * ui, s.tCanvas.width, s.tCanvas.height, ui);
    } },
    { id: 'cinematic', icon: 'film', title: 'Play cinematic demo flight (any interaction stops it)', active: () => !!s.demo?.running, onClick: () => s.demo?.toggle() },
    { id: 'stroke', icon: 'chart', title: 'windgraph stroke demo (Phase 0)', onClick: () => frameWindgraph() },
    { id: 'anim', icon: 'morph', title: 'windgraph animation demo (Phase 4): morph, draw-on, riding point', onClick: () => frameMorph() },
    { id: 'interact', icon: 'triangle', title: 'windgraph interactive demo (Phase 5): drag the triangle vertices', onClick: () => frameInteractive() },
    { id: 'graph3d', icon: 'mountain', title: 'windgraph 3D graphing demo (Phase 7): drag to orbit the surface', onClick: () => frameGraph3d() },
    { id: 'math', icon: 'ruler', title: 'windgraph math typesetting demo (Phase 6): analytic LaTeX', onClick: () => frameMath() },
    { id: 'bench', icon: 'flask', title: 'perf bench: click to cycle stress modes (watch FPS)', onClick: () => { s.bench!.cycle(); frameBench(); } },
    { id: 'benchmark', icon: 'timer', title: 'run scripted perf benchmark (~20s tour of all items + quality A/B; results board + clipboard table)', onClick: () => s.perf!.toggle() },
    { id: 'theme', icon: 'moon', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!() },
  ]);
  s.toolbar = toolbar;
  // Build the screen overlay each frame: toolbar buttons first, then the open
  // analytic context menu on top. frame.ts lays the toolbar out (setScreen) and
  // hover-tests it before the pass; here we just emit geometry into the HUD buffer
  // (already seeded with the atlas base so menu/toolbar glyphs resolve).
  s.screenHud.onBuild = (hud, Cw, Ch, now) => {
    // While the cinematic flight runs, its analytic HUD (letterbox + timeline +
    // controls + caption) takes over the screen; otherwise show the toolbar/panel.
    if (s.demo?.running && s.demo.renderHud) {
      s.demo.renderHud(hud, Cw, Ch, now);
    } else {
      // Chrome is emitted in backing-store px but sized by uiScale (backing px per
      // CSS px), so the render-resolution dial changes sharpness only — the panel,
      // toolbar and readouts keep their apparent size like the world UI does. The
      // open panel re-anchors to the quality button every frame so it tracks the
      // button live while its own resolution slider resizes the backing store.
      const ui = uiScale(s);
      if (qualityPanel.open) {
        const qb = toolbar.buttons.find((b) => b.btn.id === 'quality');
        if (qb) qualityPanel.reposition(qb.x, qb.y + qb.s + 4 * ui, Cw, Ch, ui);
      }
      toolbar.render(hud.inst, hud.crv, hud.rws, now);
      qualityPanel.render(font, atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_PANEL_THEME);
      // Analytic fps/debug readout (top-left) — replaces the DOM #fps overlay.
      const dbg = s.hudDebugText;
      if (dbg) {
        const ds = 12 * ui, m = 10 * ui, padX = 10 * ui, padY = 6 * ui;
        const rw = tw(dbg, font, ds) + padX * 2;
        const rh = ds * 1.2 + padY * 2;
        addRect(m, m, m + rw, m + rh, [0.055, 0.055, 0.071, 0.9], hud.crv, hud.rws, hud.inst);
        layoutStr(hud.inst, dbg, [0.69, 0.706, 0.753, 1], atlas.table, font, { x: m + padX, y: m + padY, size: ds });
      }
      // Analytic "copy bench results" button (top-center) — replaces a DOM button.
      // Its rect is stored on s.perf.copyRect so input.ts can hit-test it.
      if (s.perf?.copyVisible) {
        const label = s.perf.copyLabel;
        const bs = 13 * ui, padX = 16 * ui, bh = 34 * ui;
        const bw = tw(label, font, bs) + padX * 2;
        const bx0 = (Cw - bw) / 2, by0 = 14 * ui;
        s.perf.copyRect = { x0: bx0, y0: by0, x1: bx0 + bw, y1: by0 + bh };
        addRect(bx0, by0, bx0 + bw, by0 + bh, [0.086, 0.086, 0.18, 0.92], hud.crv, hud.rws, hud.inst);
        addRect(bx0, by0, bx0 + bw, by0 + 1, [0.30, 0.33, 0.42, 0.6], hud.crv, hud.rws, hud.inst);
        addRect(bx0, by0 + bh - 1, bx0 + bw, by0 + bh, [0.30, 0.33, 0.42, 0.6], hud.crv, hud.rws, hud.inst);
        addRect(bx0, by0, bx0 + 1, by0 + bh, [0.30, 0.33, 0.42, 0.6], hud.crv, hud.rws, hud.inst);
        addRect(bx0 + bw - 1, by0, bx0 + bw, by0 + bh, [0.30, 0.33, 0.42, 0.6], hud.crv, hud.rws, hud.inst);
        layoutStr(hud.inst, label, [1, 1, 1, 1], atlas.table, font, { x: bx0 + padX, y: by0 + (bh - bs) / 2, size: bs });
      } else if (s.perf) {
        s.perf.copyRect = null;
      }
    }
    if (s.analyticMenu?.open && !s.menuWorldPose) s.analyticMenu.render(font, atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_MENU_THEME);
  };

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
    removeEventListener('resize', onResize);
    fpsEl.style.display = prevFpsDisplay;
    perfBenchmark.dispose();
  };
}

