// ── windgraph · drag controller (Phase 5) ────────────────────────────────────
// Pointer picking + dragging for free/glider points. Hit-tests in world space
// with a pixel-sized radius (so grab feel is constant at any zoom), and calls
// back into the constraint graph on every move for a live recompute + redraw.

import type { GPoint } from './constraints';

export class DragController {
  private items: GPoint[] = [];
  private active: GPoint | null = null;
  hover: GPoint | null = null;
  pickRadiusPx = 15;

  constructor(private onChange: () => void) {}

  register(...pts: GPoint[]): void { this.items.push(...pts); }

  private nearest(wx: number, wy: number, scale: number): GPoint | null {
    const r = this.pickRadiusPx / Math.max(scale, 1e-9);
    let best: GPoint | null = null, bestD = r;
    for (const p of this.items) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d <= bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Update the hovered handle; returns true if the pointer is over a grabbable point. */
  updateHover(wx: number, wy: number, scale: number): boolean {
    if (this.active) return true;
    this.hover = this.nearest(wx, wy, scale);
    return !!this.hover;
  }

  begin(wx: number, wy: number, scale: number): boolean {
    this.active = this.nearest(wx, wy, scale);
    if (this.active) { this.hover = this.active; return true; }
    return false;
  }

  drag(wx: number, wy: number): void {
    if (!this.active) return;
    this.active.moveTo(wx, wy);
    this.onChange();
  }

  end(): void { this.active = null; }

  get dragging(): boolean { return !!this.active; }
}
