// ── Demo registry ────────────────────────────────────────────────────────────
// Each demo is a STANDALONE app: its own AppState + frame loop, sharing only the
// engine (device/atlas/renderer). `boot(engine, onBack)` builds the app, wires a
// minimal toolbar (🏠 back + theme), and returns a disposer that fully tears it
// down so the launcher can swap demos. The frame loop already guards every
// feature with `if (s.X)`, so a demo is just an AppState with only its own fields
// populated — an empty document (pageRoots=[]) simply renders nothing.

import type { Engine } from './engine';
import { goToPage } from '../camera/camera';
import { MathDemo } from './boards/mathDemo';
import { bootPlayground } from './playground';
import { bootExplainer } from './explainer';
import { bootAuthoring, bootExplainerV2, bootPages, bootLearning } from '../authoring/demo';
import { bootIDE } from '../ide/ide';
import { bootWindgraphWorld } from './windgraphWorld';
import { WindgraphExtrudeBoard } from './boards/windgraphExtrude';
import { ReferenceHudBoard } from './boards/referenceHud';
import { IslandGallery } from '../authoring/islands/gallery';
// Island registrations (side-effect import — ensures builtins register)
import '../authoring/islands';
import { createBaseApp, finishApp, snapTo, makeQualityPanel, qualityToolbarButton } from './app';

export interface Demo {
  id: string;
  name: string;
  blurb: string;
  boot(engine: Engine, onBack: () => void): () => void;
}

// Design reference: the yasmineOS document, framed on page 0, plus a live
// world-space analytic HUD board hosted in the #hud-stage slot on the HUD page.
function bootReference(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, true);
  const stage = engine.ref.styledEls.find((e) => e.id === 'hud-stage');
  if (stage) {
    s.interactive = new ReferenceHudBoard(
      { x: stage.x, y: stage.y, w: stage.w, h: stage.h },
      () => s.cycleTheme?.(),
    );
  }
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

function bootIslands(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const gallery = new IslandGallery();
  s.interactive = gallery;
  const z = Math.min((s.tCanvas.width / (gallery.width + 160)) * 0.9, (s.tCanvas.height / (gallery.height + 160)) * 0.9);
  snapTo(s, gallery.x0 + gallery.width / 2, gallery.y0 + gallery.height / 2, z);
  return finishApp(s, onBack);
}

// Continuous 2D↔3D extrude demo (Phase 2 / CP3): the prism + cylinder extrude on a
// slider, glyphs rise, contact shadows ground them — double-tap (or the cube button)
// glides into a tilted orbit. Hosted standalone here AND as the windgraph world's
// 4th board.
function bootExtrude(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const board = new WindgraphExtrudeBoard();
  board.x0 = 0; board.y0 = 0;
  board.app = s;
  s.interactive = board;
  const qualityPanel = makeQualityPanel(s, true);
  s.panel = qualityPanel;
  const z = Math.min((s.tCanvas.width / (board.width + 160)) * 0.9, (s.tCanvas.height / (board.height + 160)) * 0.9);
  snapTo(s, board.x0 + board.width / 2, board.y0 + board.height / 2, z);
  return finishApp(s, onBack, [
    { id: 'cam3d', icon: 'cube', title: 'Toggle continuous 2D↔3D tilt (or double-tap the canvas)', active: () => board.tilted, onClick: () => board.toggleTilt() },
    qualityToolbarButton(s, qualityPanel),
  ]);
}

export const DEMOS: Demo[] = [
  {
    id: 'ide', name: 'IDE',
    blurb: 'An analytic IDE — file explorer, tabbed editor, integrated terminal — every pixel drawn by the coverage integral.',
    boot: bootIDE,
  },
  {
    id: 'learning', name: 'How a machine learns',
    blurb: 'Gradient descent from scratch — analytic math, a true-3D loss landscape you orbit, and bespoke procedural islands on one infinite canvas.',
    boot: bootLearning,
  },
  {
    id: 'windgraph', name: 'windgraph',
    blurb: 'An infinite canvas of living mathematics — draggable constraint geometry and a plot gallery with live sliders, every curve a closed-form integral, sharp at any zoom.',
    boot: bootWindgraphWorld,
  },
  {
    id: 'extrude', name: 'Continuous 2D↔3D',
    blurb: 'The moat: a prism and cylinder extrude on a slider, glyphs rise off the page, contact shadows ground them — double-tap to glide into a tilted orbit. One space, no mode switch.',
    boot: bootExtrude,
  },
  {
    id: 'pages', name: 'Pages / Layout',
    blurb: 'Infinite canvas of Taffy-laid-out cards — resize pages and slots live.',
    boot: bootPages,
  },
  {
    id: 'islands', name: 'Island Gallery',
    blurb: 'Browse registered procedural islands — the building-blocks of the authoring system.',
    boot: bootIslands,
  },
  {
    id: 'explainer-v2', name: 'Explainer (builder recreation)',
    blurb: 'The 12-chapter explainer rebuilt via the builder API.',
    boot: bootExplainerV2,
  },
  {
    id: 'authoring', name: 'Authoring (smoke test)',
    blurb: 'Internal — sample scene rendering via the new authoring runtime.',
    boot: bootAuthoring,
  },
  {
    id: 'playground', name: 'Playground',
    blurb: 'The full showcase — every board, code editor, terminal, 3D graph, math, and the cinematic flight.',
    boot: (e, back) => bootPlayground(e, back),
  },
  {
    id: 'explainer', name: 'How windfoil works',
    blurb: 'A cinematic that explains the analytic renderer — the coverage integral, glyphs, and live math typesetting.',
    boot: bootExplainer,
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
