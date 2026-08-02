// ── testinfra demo ───────────────────────────────────────────────────────────
// Boots a world whose only interactive content is the fully analytic
// TestInfraBoard (zero DOM): a recordings list with per-row play/stats/delete
// buttons, hover states, and a stats table for the last replay. F2 records in
// any demo; the Playwright runner (scripts/) is the programmatic counterpart.

import type { Engine } from './engine';
import { createBaseApp, finishApp, snapTo } from './app';
import { TestInfraBoard } from './boards/testInfraBoard';

export function bootTestinfra(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const board = new TestInfraBoard();
  // Fill the viewport at zoom 1 (1 world px = 1 device px).
  board.x0 = 0; board.y0 = 0;
  board.width = s.tCanvas.width; board.height = s.tCanvas.height;
  s.interactive = board;
  snapTo(s, board.width / 2, board.height / 2, 1);

  return finishApp(s, onBack, [
    { id: 'testinfra-back', icon: 'home', title: 'Menu', onClick: () => onBack() },
  ]);
}
