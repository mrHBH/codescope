// ── Demo registry ────────────────────────────────────────────────────────────
// Each demo is a STANDALONE app: its own AppState + frame loop, sharing only the
// engine (device/atlas/renderer). `boot(engine, onBack)` builds the app, wires a
// minimal toolbar (🏠 back + theme), and returns a disposer that fully tears it
// down so the launcher can swap demos. The frame loop already guards every
// feature with `if (s.X)`, so a demo is just an AppState with only its own fields
// populated — an empty document (pageRoots=[]) simply renders nothing.

import type { Engine } from './engine';
import type { AppState } from '../state';
import { createAppState } from '../state';
import { buildStatic } from '../precompute';
import { createThemeController } from '../css/themeController';
import { setSize, goToPage } from '../camera/camera';
import { attachInput } from '../camera/input';
import { runFrame } from '../frame';
import { createToolbar, type ToolbarButton } from './toolbar';
import { MathDemo } from './boards/mathDemo';
import { bootPlayground } from './playground';

export interface Demo {
  id: string;
  name: string;
  blurb: string;
  boot(engine: Engine, onBack: () => void): () => void;
}

// Shared minimal setup: an AppState (optionally carrying the shared reference
// document), dark theme, baked static buffers, sized canvas. `useDoc=false`
// yields an empty document — the theme loop over zero styledEls is a no-op.
function createBaseApp(engine: Engine, useDoc: boolean): AppState {
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
  setSize(s); // needs sizing before any framing (which reads tCanvas dimensions)
  return s;
}

// Wire input + frame loop + a minimal toolbar (🏠 back, then extras, then theme).
function finishApp(s: AppState, onBack: () => void, extras: ToolbarButton[] = []): () => void {
  const onResize = () => setSize(s);
  addEventListener('resize', onResize);
  const toolbarDestroy = createToolbar([
    { icon: '🏠', title: 'Back to launcher', onClick: onBack },
    ...extras,
    { icon: '🌙', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!(), ref: (el) => { s.themeBtn = el; } },
  ]);
  const inputDispose = attachInput(s);
  const frameStop = runFrame(s);
  return () => { frameStop(); inputDispose(); toolbarDestroy(); removeEventListener('resize', onResize); };
}

function snapTo(s: AppState, x: number, y: number, z: number) {
  s.camX = s.viewX = s.tgtX = x;
  s.camY = s.viewY = s.tgtY = y;
  s.camZ = s.viewZ = s.tgtZ = z;
}

// Design reference: just the yasmineOS document, framed on page 0.
function bootReference(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, true);
  goToPage(s, 0);
  snapTo(s, s.tgtX, s.tgtY, s.tgtZ);
  return finishApp(s, onBack);
}

// Math typesetting: only the analytic LaTeX board, framed to fill the view.
function bootMath(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const board = new MathDemo();
  board.x0 = 0; board.y0 = 0;
  s.mathDemo = board;
  const z = Math.min((s.tCanvas.width / (board.width + 160)) * 0.9, (s.tCanvas.height / (board.height + 160)) * 0.9);
  snapTo(s, board.x0 + board.width / 2, board.y0 + board.height / 2, z);
  return finishApp(s, onBack);
}

export const DEMOS: Demo[] = [
  {
    id: 'playground', name: 'Playground',
    blurb: 'The full showcase — every board, code editor, terminal, 3D graph, math, and the cinematic flight.',
    boot: (e, back) => bootPlayground(e, back),
  },
  {
    id: 'reference', name: 'Design reference',
    blurb: 'The yasmineOS design-language document, drawn entirely by the analytic renderer — razor-sharp at any zoom.',
    boot: bootReference,
  },
  {
    id: 'math', name: 'Math typesetting',
    blurb: 'KaTeX-quality analytic LaTeX: fractions, radicals, big operators, matrices — all resolution-independent.',
    boot: bootMath,
  },
];
