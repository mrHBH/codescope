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

// An AppState (optionally with the shared reference document), dark theme, baked
// static buffers, sized canvas. `useDoc=false` yields an empty document — the
// theme loop over zero styledEls is a no-op.
export function createBaseApp(engine: Engine, useDoc: boolean): AppState {
  const { fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, font, renderer, upscaler, atlas, ref, meshRenderer } = engine;
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
  s.meshRenderer = meshRenderer;
  // Reusable screen-space HUD overlay for the analytic toolbar/menus finishApp wires
  // up (drawn through its own renderer with a screen-ortho matrix — see ui/screenHud.ts).
  s.screenHud = new ScreenHud(device, engine.shaderCode);
  // Analytic fps chip — the zero-DOM readout (the DOM #fps stays hidden).
  s.fpsChip = new FpsChip();
  buildStatic(s);
  s.pageVisible = new Array(s.pageRoots.length).fill(true);
  setSize(s); // sizing must precede any framing (which reads tCanvas dimensions)
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
  // The "anti-aliasing" toggle is 2× SUPERSAMPLING (the robust, proven AA path — a
  // multisample resolve black-screened because WebGPU clears the resolve target, not
  // the MSAA view). It stashes the current resolution on enable and restores it on
  // disable; the resolution slider is disabled while AA is on so the two can't fight.
  let aaBase = s.renderScale || 1;
  const setAA = (v: boolean) => {
    s.meshAA = v;
    if (v) { aaBase = s.renderScale || 1; applyRenderScale(Math.max(2, aaBase)); }
    else { applyRenderScale(aaBase); }
  };
  const items: import('../ui/analyticPanel').PanelItem[] = [
    { kind: 'header', id: 'q', label: 'Quality' },
    { kind: 'slider', id: 'res', label: 'Display resolution', min: 0.25, max: 2, step: 0.05,
      get: () => s.renderScale || 1, set: applyRenderScale, fmt: (v) => v.toFixed(2) + '×', enabled: () => !s.meshAA },
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
      { kind: 'toggle', id: 'aa', label: 'Anti-aliasing (2× supersample)',
        get: () => s.meshAA, set: setAA },
      { kind: 'toggle', id: 'shadows', label: 'Real cast shadows',
        get: () => s.realShadows, set: (v) => { s.realShadows = v; } },
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
