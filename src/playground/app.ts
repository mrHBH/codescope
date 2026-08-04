// ── Demo app scaffolding ─────────────────────────────────────────────────────
// Shared setup for STANDALONE demos: build an AppState against the engine
// (optionally carrying the reference document), dark theme, baked static buffers,
// a sized canvas — plus finishApp() which wires input + frame loop + a minimal
// toolbar and returns a disposer. Kept separate from demos.ts so both the demo
// registry and individual demos (explainer, …) can use it without an import cycle.

import type { Engine } from './engine';
import type { AppState } from '../state';
import { createAppState } from '../state';
import { buildStatic } from '../precompute';
import { createThemeController } from '../css/themeController';
import { setSize } from '../camera/camera';
import { attachInput } from '../camera/input';
import { runFrame } from '../frame';
import { AnalyticToolbar, type ToolbarButton } from '../ui/analyticToolbar';
import { ScreenHud } from '../ui/screenHud';
import { ANALYTIC_MENU_THEME } from '../ui/analyticMenu';
import { ANALYTIC_PANEL_THEME, AnalyticPanel } from '../ui/analyticPanel';
import { FpsChip } from '../ui/fpsChip';
import { uiScale } from '../camera/camera';
import { setMeshAA } from '../windfoil/msaaSwap';

// An AppState (optionally with the shared reference document), dark theme, baked
// static buffers, sized canvas. `useDoc=false` yields an empty document — the
// theme loop over zero styledEls is a no-op.
export function createBaseApp(engine: Engine, useDoc: boolean): AppState {
  const { fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, font, renderer, upscaler, frameCache, atlas, ref, meshRenderer } = engine;
  const els = useDoc ? ref.styledEls : [];
  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, renderer, font, atlas, container: ref.container,
    styledEls: els, pageRoots: useDoc ? ref.pageRoots : [],
    editableEls: els.filter((e) => e.editable),
    dynamicEls: els.filter((e) => e.dynamic),
    marqueeEls: els.filter((e) => e.hasFlow && !e.skipText && e.classes.includes('marquee')),
    pages: useDoc ? ref.pages : [], docH: useDoc ? ref.docH : 0,
    // Empty-doc demos must NOT hit-test the full reference document every frame
    // (frame.ts walks docRoot per pointer frame) — give them an empty root.
    docRoot: useDoc ? ref.docRoot : ({ children: [] } as any), fpsEl,
  });
  const theme = createThemeController(s, ref.themeStyle, buildStatic);
  theme.apply('dark');
  s.cycleTheme = theme.cycle;
  s.upscaler = upscaler;
  s.frameCache = frameCache;
  s.meshRenderer = meshRenderer;
  // The AA toggle (MSAA) swaps these to lazily-created 4× variants and back; the
  // engine's 1× renderers stay as the bases.
  s.rendererBase = renderer;
  s.meshRendererBase = meshRenderer;
  s.shaderCode = engine.shaderCode;
  // Reusable screen-space HUD overlay for the analytic toolbar/menus finishApp wires
  // up (drawn through its own renderer with a screen-ortho matrix — see ui/screenHud.ts).
  s.screenHud = new ScreenHud(device, engine.shaderCode);
  // Analytic fps chip — the zero-DOM readout (the DOM #fps stays hidden).
  s.fpsChip = new FpsChip();
  buildStatic(s);
  s.pageVisible = new Array(s.pageRoots.length).fill(true);
  setSize(s); // sizing must precede any framing (which reads tCanvas dimensions)
  // Publish the live app to the record/replay bridge (dev tool) without an import
  // cycle: the bridge reads (globalThis).__csState for getCam/setCam + replay.
  (globalThis as any).__csState = s;
  return s;
}

// Wire input + frame loop + an analytic toolbar (🏠 back, extras, theme); returns a disposer.
export function finishApp(s: AppState, onBack: () => void, extras: ToolbarButton[] = [], opts: { toolbar?: boolean } = {}): () => void {
  const onResize = () => setSize(s);
  addEventListener('resize', onResize);
  // The readout is analytic now (fps chip in the screen HUD) — hide the DOM #fps.
  const prevFpsDisplay = s.fpsEl ? s.fpsEl.style.display : '';
  if (s.fpsEl) s.fpsEl.style.display = 'none';
  if (opts.toolbar !== false && s.screenHud) {
    // Analytic toolbar (zero DOM) rendered through the screen HUD; frame.ts lays it
    // out + hover-tests it and input.ts routes clicks (same path as the playground).
    const toolbar = new AnalyticToolbar([
      { id: 'back', icon: 'home', title: 'Back to launcher', onClick: onBack },
      ...extras,
      // The analytic chip's text is part of the HUD skip-sig → a HUD rebuild at
      // 8Hz. The DOM #fps writes the same text at 8Hz for free; offer it as the
      // zero-cost readout when profiling drags.
      { id: 'fpsdom', icon: 'stats', title: 'FPS readout: analytic chip ↔ plain DOM overlay (DOM is free; the chip rebuilds the HUD at 8Hz)', active: () => s.fpsDom, onClick: () => {
        s.fpsDom = !s.fpsDom;
        if (s.fpsChip) s.fpsChip.visible = !s.fpsDom;
        if (s.fpsEl) s.fpsEl.style.display = s.fpsDom ? '' : 'none';
      } },
      { id: 'theme', icon: 'moon', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!() },
    ]);
    s.toolbar = toolbar;
    s.screenHud.onBuild = (hud, Cw, Ch, now) => {
      // Re-anchor the open settings panel under its toolbar button each frame so it
      // tracks the button live (matches the playground/IDE pattern).
      if (s.panel?.open) {
        const qb = toolbar.buttons.find((b) => b.btn.id === 'quality');
        const ui = uiScale(s);
        if (qb) s.panel.reposition(qb.x, qb.y + qb.s + 4 * ui, Cw, Ch, ui);
      }
      toolbar.render(hud.inst, hud.crv, hud.rws, now);
      s.panel?.render(s.font, s.atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_PANEL_THEME);
      s.fpsChip?.render(hud.inst, hud.crv, hud.rws, s.font, s.atlas, uiScale(s));
      // Screen-space slider chrome of the active interactive board (windgraph):
      // fixed-size analytic panels pinned to each board's projected corner.
      s.interactive?.renderScreenChrome?.(s, hud, s.font, s.atlas);
      // In 3D the menu is world-projected and drawn into the scene buffer by
      // frame.ts; drawing it here too would stack a second copy. Only render the
      // screen-space overlay when it isn't world-projected (2D, or no menu).
      if (s.analyticMenu?.open && !s.menuWorldPose) s.analyticMenu.render(s.font, s.atlas, hud.inst, hud.crv, hud.rws, ANALYTIC_MENU_THEME);
    };
  }
  const inputDispose = attachInput(s);
  const frameStop = runFrame(s);
  return () => {
    frameStop(); inputDispose();
    s.toolbar = null;
    if (s.screenHud) s.screenHud.onBuild = null;
    if (s.fpsEl) s.fpsEl.style.display = prevFpsDisplay;
    removeEventListener('resize', onResize);
    if ((globalThis as any).__csState === s) (globalThis as any).__csState = null;
  };
}

export function snapTo(s: AppState, x: number, y: number, z: number) {
  s.camX = s.viewX = s.tgtX = x;
  s.camY = s.viewY = s.tgtY = y;
  s.camZ = s.viewZ = s.tgtZ = z;
}

// ── Universal quality panel (Phase 2) ────────────────────────────────────────
// The same yasmineOS AnalyticPanel the IDE/playground use, bundling the display
// resolution + low-res-sharpen dials with the 3D-extrusion quality toggles (smooth
// walls, anti-aliasing, real shadows). All dials read/write AppState directly, so
// the panel is demo-agnostic; pass include3D for the windgraph demos.
export function makeQualityPanel(s: AppState, include3D = false): AnalyticPanel {
  const applyRenderScale = (v: number) => {
    const old = s.renderScale || 1;
    if (v === old) return;
    const f = v / old;
    s.renderScale = v; s.camZ *= f; s.viewZ *= f; s.tgtZ *= f;
    setSize(s);
  };
  // The "anti-aliasing" toggle is REAL MSAA (sampleCount 4) via setMeshAA —
  // independent of the render-resolution dial (both can be on at once), and the
  // pass defaults ON whenever the 3D camera is entered (frame.ts hooks the
  // cam3d transition; 2D is analytic-only and never pays the MSAA cost).
  const setAA = (v: boolean) => setMeshAA(s, v);
  const items: import('../ui/analyticPanel').PanelItem[] = [
    { kind: 'header', id: 'q', label: 'Quality' },
    { kind: 'slider', id: 'res', label: 'Display resolution', min: 0.25, max: 2, step: 0.05,
      get: () => s.renderScale || 1, set: applyRenderScale, fmt: (v) => v.toFixed(2) + '×' },
    { kind: 'toggle', id: 'sharpenOn', label: 'Low-res render + sharpen',
      get: () => s.lowResSharpen, set: (v) => { s.lowResSharpen = v; } },
    { kind: 'slider', id: 'integral', label: 'Integral resolution', min: 0.25, max: 1, step: 0.05,
      get: () => s.integralScale, set: (v) => { s.integralScale = v; }, fmt: (v) => v.toFixed(2) + '×', enabled: () => s.lowResSharpen },
    { kind: 'slider', id: 'sharpen', label: 'Sharpen', min: 0, max: 1, step: 0.05,
      get: () => s.sharpenAmount, set: (v) => { s.sharpenAmount = v; }, fmt: (v) => v.toFixed(2), enabled: () => s.lowResSharpen },
  ];
  if (include3D) {
    items.push(
      { kind: 'header', id: 'q3', label: '3D extrusion' },
      { kind: 'toggle', id: 'smooth', label: 'Smooth shaded walls',
        get: () => s.meshSmooth, set: (v) => { s.meshSmooth = v; } },
      { kind: 'toggle', id: 'aa', label: 'Anti-aliasing (MSAA 4×)',
        get: () => s.meshAA, set: setAA, enabled: () => !!s.cam3d.active },
    );
  }
  return new AnalyticPanel(items);
}

// Toolbar button that toggles a quality panel, anchored under itself (reads
// s.toolbar at click time so it works though the toolbar is built after extras).
export function qualityToolbarButton(s: AppState, panel: AnalyticPanel): ToolbarButton {
  return {
    id: 'quality', icon: 'sliders',
    title: 'Quality settings: resolution, sharpen, and 3D extrusion (smooth / AA / shadows)',
    onClick: () => {
      const qb = s.toolbar?.buttons.find((b) => b.btn.id === 'quality');
      const ui = uiScale(s);
      panel.toggle(qb ? qb.x : s.tCanvas.width - 260 * ui, qb ? qb.y + qb.s + 4 * ui : 60 * ui, s.tCanvas.width, s.tCanvas.height, ui);
    },
  };
}
