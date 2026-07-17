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

export const DEMOS: Demo[] = [
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
