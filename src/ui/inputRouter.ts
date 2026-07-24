// ── Input router utilities ───────────────────────────────────────────────────
// Centralized, composable input-handling primitives shared by the IDE demo
// (ide.ts) and the playground (camera/input.ts). Each class is stateless
// except for its own tracking state — callers wire them to their event
// handlers. The goal: one implementation of multi-click, menu lifecycle,
// scroll-vs-zoom routing, and cursor resolution so behaviour never drifts
// between surfaces.

import { AnalyticContextMenu, ANALYTIC_MENU_THEME, type AnalyticMenuItem } from './analyticMenu';

// ── Multi-click tracker ─────────────────────────────────────────────────────
// Consecutive left-clicks within a time/distance window escalate a counter.
// Callers read `count` after each `track()` to decide caret → token → line →
// all (or double-click-to-fit on non-text surfaces).
export class MultiClickTracker {
  count = 0;
  private lastT = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly ms: number;
  private readonly px: number;

  constructor(ms = 400, px = 6) { this.ms = ms; this.px = px; }

  track(wx: number, wy: number): number {
    const now = performance.now();
    this.count = (now - this.lastT < this.ms && Math.abs(wx - this.lastX) < this.px && Math.abs(wy - this.lastY) < this.px)
      ? this.count + 1 : 1;
    this.lastT = now; this.lastX = wx; this.lastY = wy;
    return this.count;
  }

  reset() { this.count = 0; }
}

// ── Menu gate ───────────────────────────────────────────────────────────────
// Wraps an AnalyticContextMenu with the shared lifecycle:
//  - `consumeClick` — if the menu is open, hit-test the click, fire the
//    action, hide, and return true (caller should return early).
//  - `updateHover` — update the hovered row from the pointer position.
//  - `dismiss` — hide on right-press or Escape.
//  - `show` — convenience that forwards to the menu's show().
//  - `resolveCursor` — returns the cursor string when the menu is open.
export class MenuGate {
  readonly menu: AnalyticContextMenu;
  private readonly textW: (text: string, size: number) => number;
  private vpW = 0;
  private vpH = 0;

  constructor(textW: (text: string, size: number) => number) {
    this.menu = new AnalyticContextMenu();
    this.textW = textW;
  }

  get open() { return this.menu.open; }

  setViewport(w: number, h: number) { this.vpW = w; this.vpH = h; }

  show(wx: number, wy: number, items: AnalyticMenuItem[]) {
    this.menu.show(wx, wy, items, this.vpW, this.vpH, this.textW);
  }

  dismiss() { this.menu.hide(); }

  consumeClick(wx: number, wy: number): boolean {
    if (!this.menu.open) return false;
    const idx = this.menu.hitTest(wx, wy);
    if (idx >= 0) {
      const it = this.menu.items[idx];
      if (it.action && (!it.enabled || it.enabled())) it.action();
    }
    this.menu.hide();
    return true;
  }

  updateHover(wx: number, wy: number) {
    if (this.menu.open) this.menu.hovered = this.menu.hitTest(wx, wy);
  }

  resolveCursor(): string | null {
    if (!this.menu.open) return null;
    return this.menu.hovered >= 0 ? 'pointer' : 'default';
  }
}

// ── Scroll router ───────────────────────────────────────────────────────────
// Decides whether a wheel event should scroll a panel or zoom the camera.
// Rule: right held → always zoom; over a scrollable → scroll; else → zoom.
// Returns 'scroll' with the panel key, or 'zoom'.
export type ScrollTarget = { kind: 'scroll'; panel: string } | { kind: 'zoom' };

export function routeScroll(rightDown: boolean, overPanel: string | null): ScrollTarget {
  if (rightDown) return { kind: 'zoom' };
  if (overPanel) return { kind: 'scroll', panel: overPanel };
  return { kind: 'zoom' };
}

// ── Cursor resolver ─────────────────────────────────────────────────────────
// Given the current hover state, returns the CSS cursor string. Priority:
// menu > text surface > chrome (pointer) > default.
export function resolveCursor(opts: {
  menuCursor: string | null;
  overText: boolean;
  overChrome: boolean;
}): string {
  if (opts.menuCursor !== null) return opts.menuCursor;
  if (opts.overText) return 'text';
  if (opts.overChrome) return 'pointer';
  return 'default';
}

// ── Right-gesture tracker ───────────────────────────────────────────────────
// Tracks whether a right-press was a drag or a wheel-zoom, so the context
// menu can suppress itself on release.
export class RightGesture {
  down = false;
  moved = false;
  wheeled = false;
  private sx = 0;
  private sy = 0;

  press(x: number, y: number) {
    this.down = true; this.moved = false; this.wheeled = false;
    this.sx = x; this.sy = y;
  }

  move(x: number, y: number, tol = 6) {
    if (this.down && (Math.abs(x - this.sx) > tol || Math.abs(y - this.sy) > tol)) this.moved = true;
  }

  wheel() { if (this.down) this.wheeled = true; }

  release(): boolean {
    const wasShort = !this.moved && !this.wheeled;
    this.down = false;
    return wasShort;
  }

  get suppressMenu() { return this.moved || this.wheeled; }
}
