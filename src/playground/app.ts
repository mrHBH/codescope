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
import { createToolbar, type ToolbarButton } from './toolbar';

// An AppState (optionally with the shared reference document), dark theme, baked
// static buffers, sized canvas. `useDoc=false` yields an empty document — the
// theme loop over zero styledEls is a no-op.
export function createBaseApp(engine: Engine, useDoc: boolean): AppState {
  const { fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, font, renderer, upscaler, atlas, ref } = engine;
  const els = useDoc ? ref.styledEls : [];
  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, renderer, font, atlas, container: ref.container,
    styledEls: els, pageRoots: useDoc ? ref.pageRoots : [],
    editableEls: els.filter((e) => e.editable),
    dynamicEls: els.filter((e) => e.dynamic),
    marqueeEls: els.filter((e) => e.hasFlow && !e.skipText && e.classes.includes('marquee')),
    pages: useDoc ? ref.pages : [], docH: useDoc ? ref.docH : 0, docRoot: ref.docRoot, fpsEl,
  });
  const theme = createThemeController(s, ref.themeStyle, buildStatic);
  theme.apply('dark');
  s.cycleTheme = theme.cycle;
  s.upscaler = upscaler;
  buildStatic(s);
  s.pageVisible = new Array(s.pageRoots.length).fill(true);
  setSize(s); // sizing must precede any framing (which reads tCanvas dimensions)
  return s;
}

// Wire input + frame loop + a minimal toolbar (🏠 back, extras, theme); returns a disposer.
export function finishApp(s: AppState, onBack: () => void, extras: ToolbarButton[] = [], opts: { toolbar?: boolean } = {}): () => void {
  const onResize = () => setSize(s);
  addEventListener('resize', onResize);
  // `toolbar:false` skips the DOM toolbar entirely (the DOM-free cinematic draws
  // its own analytic controls instead).
  const toolbarDestroy = opts.toolbar === false
    ? () => {}
    : createToolbar([
        { icon: '🏠', title: 'Back to launcher', onClick: onBack },
        ...extras,
        { icon: '🌙', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!(), ref: (el) => { s.themeBtn = el; } },
      ]);
  const inputDispose = attachInput(s);
  const frameStop = runFrame(s);
  return () => { frameStop(); inputDispose(); toolbarDestroy(); removeEventListener('resize', onResize); };
}

export function snapTo(s: AppState, x: number, y: number, z: number) {
  s.camX = s.viewX = s.tgtX = x;
  s.camY = s.viewY = s.tgtY = y;
  s.camZ = s.viewZ = s.tgtZ = z;
}
