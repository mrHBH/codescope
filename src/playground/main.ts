// ── Entry point ─────────────────────────────────────────────────────────────
// Creates the shared engine once, then shows the launcher (the analytic, reference-
// styled menu). Picking a card tears down the launcher and boots that demo as a
// standalone app; the demo's 🏠 button tears itself down and returns to the menu.

import { createEngine } from './engine';
import { bootLauncher } from './launcher';
import { DEMOS } from './demos';

async function main() {
  const engine = await createEngine();
  let dispose: (() => void) | null = null;
  const showLauncher = () => {
    dispose = bootLauncher(engine, (demo) => {
      dispose?.();                                   // tear down the launcher
      dispose = demo.boot(engine, showLauncher);     // boot the demo (🏠 → showLauncher)
    });
  };
  // Dev shortcut: #<demoId> boots a demo directly (e.g. /#explainer), 🏠 → launcher.
  const direct = DEMOS.find((d) => d.id === location.hash.slice(1));
  if (direct) dispose = direct.boot(engine, showLauncher);
  else showLauncher();
}

main().catch((e) => {
  const el = document.getElementById('error')!;
  el.style.display = 'block';
  el.textContent = e.message || String(e);
  console.error(e);
});
