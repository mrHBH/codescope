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
import { bootAuthoring, bootExplainerV2, bootPages, bootFourierExplainer } from '../authoring/demo';
import { IslandGallery } from '../authoring/islands/gallery';
// Island registrations (side-effect import — ensures builtins register)
import '../authoring/islands';
import { createBaseApp, finishApp, snapTo } from './app';

export interface Demo {
  id: string;
  name: string;
  blurb: string;
  boot(engine: Engine, onBack: () => void): () => void;
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

function bootIslands(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const gallery = new IslandGallery();
  s.interactive = gallery;
  const z = Math.min((s.tCanvas.width / (gallery.width + 160)) * 0.9, (s.tCanvas.height / (gallery.height + 160)) * 0.9);
  snapTo(s, gallery.x0 + gallery.width / 2, gallery.y0 + gallery.height / 2, z);
  return finishApp(s, onBack);
}

export const DEMOS: Demo[] = [
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
    id: 'fourier', name: 'Fourier Series',
    blurb: 'Interactive Fourier explainer — 8 chapters, varied layouts, interactive plots, slider controls, and the living-UI peel.',
    boot: bootFourierExplainer,
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
