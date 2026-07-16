// ── Perf isolation bench ─────────────────────────────────────────────────────
// A stress scene to LOCATE frame-cost sources. The 🧪 toolbar button frames the
// board and cycles modes; read the FPS overlay for each. Isolates:
//   0 baseline (nothing)      — pure frame overhead
//   1 many solid rects grid   — rect INSTANCE COUNT + fast-path fill (low overdraw)
//   2 many glyphs grid        — glyph instance count + gather (minified when zoomed out)
//   3 few HUGE overlapping rects — rect OVERDRAW (fast path)
//   4 few HUGE overlapping glyphs — glyph OVERDRAW (winding gather) — the expensive one
// Zoom to fit (the button does) then zoom OUT / IN to see how cost scales.

import { addRect, layoutStr } from '../layout/metrics';
import type { FontFace } from '../windfoil/font';
import type { PlaneView } from '../windgraph/coords/numberPlane';

const INK = [0.90, 0.92, 0.98, 1];
const DIM = [0.60, 0.64, 0.74, 1];
const COLORS = [[0.36, 0.62, 0.98, 1], [0.92, 0.74, 0.42, 1], [0.40, 0.82, 0.52, 1], [0.78, 0.60, 0.98, 1]];

const MODES = [
  'baseline (empty)',
  'grid: 8000 solid rects (instance count + rect fast-path)',
  'grid: 8000 glyphs (instance count + gather)',
  'overdraw: 120 huge overlapping rects (rect fast-path)',
  'overdraw: 120 huge overlapping glyphs (winding gather)',
];

export class PerfBench {
  x0 = 0;
  y0 = 0;
  width = 2400;
  height = 2400;
  mode = 0;
  cycle() { this.mode = (this.mode + 1) % MODES.length; }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], _now: number, _view: PlaneView) {
    const table = atlas.table;
    layoutStr(inst, `PERF BENCH  [mode ${this.mode}]  ${MODES[this.mode]}`, INK, table, font, { x: this.x0 + 40, y: this.y0 - 20, size: 30 });
    layoutStr(inst, 'click the flask to cycle modes; watch the FPS counter; zoom out/in to see how it scales', DIM, table, font, { x: this.x0 + 40, y: this.y0 + 16, size: 15 });

    const gx = this.x0 + 40, gy = this.y0 + 60, gw = this.width - 80, gh = this.height - 100;

    if (this.mode === 1) {
      // 8000 small solid rects (100 × 80 grid).
      const cols = 100, rows = 80, cw = gw / cols, ch = gh / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = gx + i * cw, y = gy + j * ch;
        addRect(x + 1, y + 1, x + cw - 1, y + ch - 1, COLORS[(i + j) & 3], crv, rws, inst);
      }
    } else if (this.mode === 2) {
      // 8000 glyphs (100 × 80 grid of 'A').
      const cols = 100, rows = 80, cw = gw / cols, ch = gh / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        layoutStr(inst, 'A', COLORS[(i + j) & 3], table, font, { x: gx + i * cw, y: gy + j * ch + ch * 0.7, size: ch * 0.9 });
      }
    } else if (this.mode === 3) {
      // 120 huge overlapping translucent rects (overdraw, fast path).
      for (let n = 0; n < 120; n++) {
        const c = COLORS[n & 3];
        addRect(gx, gy, gx + gw, gy + gh, [c[0], c[1], c[2], 0.03], crv, rws, inst);
      }
    } else if (this.mode === 4) {
      // 120 huge overlapping glyphs (overdraw, winding gather) — the stress case.
      for (let n = 0; n < 120; n++) {
        const c = COLORS[n & 3];
        layoutStr(inst, 'W', [c[0], c[1], c[2], 0.03], table, font, { x: gx, y: gy + gh * 0.85, size: gh });
      }
    }
  }
}
