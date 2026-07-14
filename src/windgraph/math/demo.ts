// ── windgraph · Phase-6 math typesetting demo ────────────────────────────────
// Analytic LaTeX math through windfoil: infinitely sharp, zoomable, animatable.
// Shows a gallery of identities (fractions, exponents, radicals, sums,
// integrals, Greek) plus a headline equation that writes on and cross-fades —
// all razor-sharp at any zoom (visibly better than SVG/MathJax when zoomed).

import { layoutStr } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';
import type { PlaneView } from '../coords/numberPlane';
import { MathTex } from './mathtex';

const INK = [0.92, 0.94, 0.99, 1];
const DIM = [0.60, 0.64, 0.74, 1];
const BLUE = [0.52, 0.72, 1.0, 1];
const GOLD = [0.95, 0.80, 0.46, 1];

const GALLERY: [string, number[]][] = [
  ['a^2 + b^2 = c^2', INK],
  ['e^{i\\pi} + 1 = 0', GOLD],
  ['\\int_0^1 x^2 \\, dx = \\frac{1}{3}', INK],
  ['\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}', BLUE],
  ['\\frac{d}{dx}\\sqrt{x} = \\frac{1}{2\\sqrt{x}}', INK],
  ['\\nabla \\times E = -\\frac{\\partial B}{\\partial t}', BLUE],
];

const HEADLINES = [
  'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  'E = \\sqrt{(mc^2)^2 + (pc)^2}',
];

export class MathDemo {
  x0 = 0;
  y0 = 0;
  width = 1180;
  height = 1120;

  private gallery = GALLERY.map(([tex]) => new MathTex(tex));
  private headlines = HEADLINES.map((tex) => new MathTex(tex));
  private t0 = -1;

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, _view: PlaneView) {
    // Title.
    layoutStr(inst, 'Analytic LaTeX math - sharp at any zoom', INK, atlas.table, font, { x: this.x0 + 50, y: this.y0 + 6, size: 34 });
    layoutStr(inst, 'parsed + box-laid-out + emitted as windfoil instances (no SVG, no raster)', DIM, atlas.table, font, { x: this.x0 + 50, y: this.y0 + 48, size: 16 });

    // ── Headline: write-on then cross-fade between two equations, looping ──
    if (this.t0 < 0) this.t0 = now;
    const t = (now - this.t0) / 1000;
    const CYCLE = 6.0;
    const phase = t % CYCLE;
    const idx = Math.floor(t / CYCLE) % this.headlines.length;
    const nextIdx = (idx + 1) % this.headlines.length;
    const writeDur = 1.8, holdEnd = 4.6, fadeEnd = 5.4;
    const hx = this.x0 + this.width / 2, hy = this.y0 + 210, hsize = 62;
    if (phase < holdEnd) {
      const reveal = Math.min(1, phase / writeDur);
      const opacity = phase > fadeEnd ? Math.max(0, 1 - (phase - fadeEnd) / (CYCLE - fadeEnd)) : 1;
      this.headlines[idx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', reveal, opacity });
    } else {
      // cross-fade: old fades out, next fades in
      const f = (phase - holdEnd) / (CYCLE - holdEnd);
      this.headlines[idx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', reveal: 1, opacity: 1 - f });
      this.headlines[nextIdx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', reveal: 1, opacity: f });
    }

    // ── Static gallery ────────────────────────────────────────────────────
    // Space each row by its MEASURED extent (h above + d below the baseline) so
    // tall equations (∑/∫ with limits) never overlap their neighbours.
    let gy = this.y0 + 340;
    const gsize = 46;
    const gap = 34;
    for (let i = 0; i < this.gallery.length; i++) {
      const m = this.gallery[i].measure({ table: atlas.table });
      gy += m.h * gsize;
      this.gallery[i].emit(atlas, inst, crv, rws, { x: this.x0 + 90, y: gy, size: gsize, color: GALLERY[i][1], anchor: 'start' });
      gy += m.d * gsize + gap;
    }

    // A tiny zoom hint: the same identity at small size stays crisp.
    layoutStr(inst, 'zoom in - the strokes never pixelate', DIM, atlas.table, font, { x: this.x0 + 90, y: gy + 6, size: 15 });
  }
}
