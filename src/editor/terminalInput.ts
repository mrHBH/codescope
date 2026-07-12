// ── Terminal input ───────────────────────────────────────────────────────────
// Bridges keyboard events to the Terminal command surface. Mirrors editorInput.

import type { AppState } from '../state';

export function handleTerminalKey(s: AppState, e: KeyboardEvent) {
  const term = s.terminal!;
  const meta = e.ctrlKey || e.metaKey;
  const k = e.key;

  if (meta && k.toLowerCase() === 'c') { term.interrupt(); e.preventDefault(); return; }
  if (meta && k.toLowerCase() === 'v') {
    if (navigator.clipboard) navigator.clipboard.readText().then((t) => { for (const ch of t.replace(/\s+/g, ' ')) term.insert(ch); }).catch(() => {});
    e.preventDefault(); return;
  }

  switch (k) {
    case 'Enter': term.enter(); break;
    case 'Backspace': term.backspace(); break;
    case 'Delete': term.del(); break;
    case 'ArrowLeft': term.left(); break;
    case 'ArrowRight': term.right(); break;
    case 'ArrowUp': term.historyPrev(); break;
    case 'ArrowDown': term.historyNext(); break;
    case 'Home': term.home(); break;
    case 'End': term.end(); break;
    case 'Tab': break; // reserved (no completion yet)
    case 'Escape': return;
    default:
      if (k.length === 1 && !meta && !e.altKey) term.insert(k);
      else return;
  }
  e.preventDefault();
}
