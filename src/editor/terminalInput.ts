// ── Terminal input ───────────────────────────────────────────────────────────
// Thin bridge: delegates to Terminal.handleKey() which encapsulates all input.

import type { AppState } from '../state';

export function handleTerminalKey(s: AppState, e: KeyboardEvent) {
  s.terminal!.handleKey(e);
}
