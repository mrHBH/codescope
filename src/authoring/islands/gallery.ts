// ── Island gallery board ──────────────────────────────────────────────────────
// Renders all registered islands in a browsable grid. Implements s.interactive.
// Maintains persistent param state per cell so drags persist.

import { listIslands } from './registry';
import type { IslandEmitCtx, IslandTime } from './registry';
import { DrawHelpers, type DrawCtx } from './draw';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';

const CELL_W = 520, CELL_H = 660, GAP = 40, PAD = 20;
const COLS = 3;

export class IslandGallery {
  x0 = 0; y0 = 0; width = 3000; height = 3000;
  private cellParams: Record<string, any>[] = [];
  private hovered: { cellIdx: number; handleName: string } | null = null;
  private grabbed: { cellIdx: number; handleName: string } | null = null;
  get dragging() { return this.grabbed !== null; }

  private ensureParams(n: number) {
    const islands = listIslands();
    while (this.cellParams.length < n) {
      const idx = this.cellParams.length;
      const def = islands[idx];
      const p: Record<string, any> = {};
      for (const [k, pDef] of Object.entries(def?.params ?? {})) p[k] = (pDef as any).default;
      this.cellParams.push(p);
    }
    for (let i = 0; i < Math.min(n, islands.length); i++) {
      const def = islands[i];
      const p = this.cellParams[i];
      for (const [k, pDef] of Object.entries(def?.params ?? {})) {
        if (p[k] === undefined) p[k] = (pDef as any).default;
      }
    }
  }

  emit(font: FontFace, atlas: GlyphAtlas, inst: number[], crv: number[], rws: number[], now: number, view: any) {
    const ctx: DrawCtx = { font, atlas, buff: { inst, crv, rws } };
    const draw = new DrawHelpers(ctx);
    const islands = listIslands();
    if (islands.length === 0) {
      draw.text('No islands registered.', 40, 60, 24, [0.73, 0.74, 0.77, 1], 1, 'start');
      return;
    }
    this.ensureParams(islands.length);
    for (let i = 0; i < islands.length; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const bx = PAD + col * (CELL_W + GAP), by = PAD + row * (CELL_H + GAP);
      draw.rect(bx, by, bx + CELL_W, by + CELL_H, [0.13, 0.135, 0.15, 1]);
      draw.rectStroke(bx, by, bx + CELL_W, by + CELL_H, [0.25, 0.26, 0.30, 1], 1.3);
      draw.text(islands[i].title, bx + 14, by + 8, 16, [0.94, 0.95, 0.97, 1]);
      draw.setOrigin(bx + 20, by + 40);
      const hName = this.hovered?.cellIdx === i ? this.hovered.handleName : null;
      const gName = this.grabbed?.cellIdx === i ? this.grabbed.handleName : null;
      const iCtx: IslandEmitCtx = { font, atlas, inst, crv, rws, view, now, draw, hoveredHandle: hName, grabbedHandle: gName };
      const iTime: IslandTime = { local: now / 1000, now: now / 1000, playing: true, alpha: 1, build: 0.5 + 0.5 * Math.sin(now / 2000) };
      islands[i].emit(iCtx, this.cellParams[i], iTime);
      draw.setOrigin(0, 0);
    }
  }

  tryBeginDrag(wx: number, wy: number, sc: number): boolean {
    const r = Math.max(12, 18 / Math.max(sc, 0.05));
    const islands = listIslands();
    this.ensureParams(islands.length);
    for (let i = islands.length - 1; i >= 0; i--) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const bx = PAD + col * (CELL_W + GAP) + 20, by = PAD + row * (CELL_H + GAP) + 40;
      const def = islands[i];
      if (!def.handles) continue;
      for (const hDef of def.handles) {
        const hPos = hDef.at(this.cellParams[i]);
        if (Math.hypot(wx - (bx + hPos[0]), wy - (by + hPos[1])) <= r) {
          this.grabbed = { cellIdx: i, handleName: hDef.param };
          return true;
        }
      }
    }
    return false;
  }

  dragTo(wx: number, wy: number) {
    if (!this.grabbed) return;
    const { cellIdx, handleName } = this.grabbed;
    const islands = listIslands();
    const def = islands[cellIdx];
    if (!def || !def.handles) return;
    const col = cellIdx % COLS, row = Math.floor(cellIdx / COLS);
    const bx = PAD + col * (CELL_W + GAP) + 20, by = PAD + row * (CELL_H + GAP) + 40;
    const relPos: [number, number] = [wx - bx, wy - by];
    const params = this.cellParams[cellIdx];
    for (const hDef of def.handles) {
      if (hDef.param === handleName) { hDef.set(params, relPos); break; }
    }
  }

  endDrag() { this.grabbed = null; }

  updateHover(wx: number, wy: number, sc: number): boolean {
    const r = Math.max(12, 18 / Math.max(sc, 0.05));
    const islands = listIslands();
    this.ensureParams(islands.length);
    for (let i = islands.length - 1; i >= 0; i--) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const bx = PAD + col * (CELL_W + GAP) + 20, by = PAD + row * (CELL_H + GAP) + 40;
      const def = islands[i];
      if (!def.handles) continue;
      for (const hDef of def.handles) {
        const hPos = hDef.at(this.cellParams[i]);
        if (Math.hypot(wx - (bx + hPos[0]), wy - (by + hPos[1])) <= r) {
          this.hovered = { cellIdx: i, handleName: hDef.param };
          return true;
        }
      }
    }
    this.hovered = null;
    return false;
  }

  autoDrive() {}
}
