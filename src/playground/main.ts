// ── Entry point ─────────────────────────────────────────────────────────────
// Creates the shared engine once, then shows the launcher (the analytic, reference-
// styled menu). Picking a card tears down the launcher and boots that demo as a
// standalone app; the demo's 🏠 button tears itself down and returns to the menu.

import { createEngine } from './engine';
import { bootLauncher } from './launcher';
import { DEMOS } from './demos';
import { installBridge } from '../recorder/bridge';
import { installRecorder } from '../recorder/recorder';
import { runReplayFromQuery } from '../recorder/replay';
import { createStore } from '../recorder/store';

async function main() {
  const engine = await createEngine();
  // Dev record/replay harness: F2 records in any demo; ?replay=<name> on the hash
  // reproduces a recording in this real browser and reports fps (see src/recorder).
  const store = await createStore();
  installBridge();
  installRecorder(engine.rCanvas, store);
  let dispose: (() => void) | null = null;
  const showLauncher = () => {
    dispose = bootLauncher(engine, (demo) => {
      dispose?.();                                   // tear down the launcher
      // Reflect the active demo in the URL — the recorder's route() reads the
      // hash, so a recording made inside a demo booted from the launcher must
      // carry the demo id, not "launcher" (the launcher leaves the hash alone).
      try { history.replaceState(null, '', '#' + demo.id); } catch { location.hash = '#' + demo.id; }
      dispose = demo.boot(engine, showLauncher);     // boot the demo (🏠 → showLauncher)
    });
  };
  // Dev shortcut: #<demoId> boots a demo directly (e.g. /#explainer), 🏠 → launcher.
  // A `?replay=<name>` query (used by the replay harness) is stripped before the
  // id lookup and consumed by runReplayFromQuery once the app has booted (both the
  // demo and the launcher — a recording made on the launcher still replays).
  const route = location.hash.slice(1).split('?')[0];
  const direct = DEMOS.find((d) => d.id === route);
  // A replay boot (`?replay=`) skips the demo's own camera framing — the replay
  // engine restores the recorded start pose as the FIRST camera.
  if (new URLSearchParams(location.hash.split('?')[1] || '').has('replay')) (window as any).__replayPending = true;
  if (direct) {
    dispose = direct.boot(engine, showLauncher);
    runReplayFromQuery(store);
  } else {
    showLauncher();
    runReplayFromQuery(store);
  }
}

main().catch((e) => {
  const el = document.getElementById('error')!;
  el.style.display = 'block';
  el.textContent = e.message || String(e);
  console.error(e);
});
