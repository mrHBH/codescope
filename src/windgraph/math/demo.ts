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
const GREEN = [0.50, 0.86, 0.60, 1];
const PURPLE = [0.78, 0.60, 0.98, 1];

// Two-column gallery of identities (latex, colour). Display style: sums/products
// and \lim put limits above/below; integrals to the side; \int\limits forces
// above/below.
const GALLERY: [string, number[]][] = [
  ['\\int_a^b x^2 \\, dx = \\frac{b^3 - a^3}{3}', INK],
  ['\\int\\limits_0^{\\infty} e^{-x} \\, dx = 1', GOLD],
  ['\\iint_S f(x,y) \\, dA', BLUE],
  ['\\oint_C F \\cdot dr = 0', PURPLE],
  ['\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}', BLUE],
  ['\\prod_{i=1}^{n} i = n!', PURPLE],
  ['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', INK],
  ['\\lim_{x \\to \\infty} \\frac{1}{x} = 0', GREEN],
  ['\\frac{\\partial^2 u}{\\partial x^2} + \\frac{\\partial^2 u}{\\partial y^2} = 0', GREEN],
  ['\\frac{d}{dx}\\sqrt{x} = \\frac{1}{2\\sqrt{x}}', INK],
  ['\\cos^2\\theta + \\sin^2\\theta = 1', GOLD],
  ['e^{i\\theta} = \\cos\\theta + i\\sin\\theta', INK],
];

const HEADLINES = [
  'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
  '\\int_a^b f(x) \\, dx = F(b) - F(a)',
  'e^{i\\pi} + 1 = 0',
];

const SYMBOLS = [
  '\\alpha \\quad \\beta \\quad \\gamma \\quad \\pi \\quad \\theta \\quad \\lambda \\quad \\mu \\quad \\sigma \\quad \\phi \\quad \\omega \\quad \\Gamma \\quad \\Delta \\quad \\Omega',
  '\\pm \\quad \\times \\quad \\div \\quad \\leq \\quad \\geq \\quad \\neq \\quad \\approx \\quad \\to \\quad \\in \\quad \\infty \\quad \\partial \\quad \\nabla',
];

export class MathDemo {
  x0 = 0;
  y0 = 0;
  width = 1320;
  height = 1180;

  private gallery = GALLERY.map(([tex]) => new MathTex(tex));
  private headlines = HEADLINES.map((tex) => new MathTex(tex));
  private symbols = SYMBOLS.map((tex) => new MathTex(tex));
  private t0 = -1;

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, _view: PlaneView) {
    layoutStr(inst, 'Analytic LaTeX math - sharp at any zoom', INK, atlas.table, font, { x: this.x0 + 50, y: this.y0 + 6, size: 34 });
    layoutStr(inst, 'in-house parser + TeX box layout, emitted as windfoil instances (no SVG, no raster)', DIM, atlas.table, font, { x: this.x0 + 50, y: this.y0 + 48, size: 16 });

    // ── Headline: write-on then cross-fade between equations, looping ──
    if (this.t0 < 0) this.t0 = now;
    const t = (now - this.t0) / 1000;
    const CYCLE = 6.0;
    const phase = t % CYCLE;
    const idx = Math.floor(t / CYCLE) % this.headlines.length;
    const nextIdx = (idx + 1) % this.headlines.length;
    const writeDur = 1.8, holdEnd = 4.6;
    const hx = this.x0 + this.width / 2, hy = this.y0 + 210, hsize = 60;
    if (phase < holdEnd) {
      const reveal = Math.min(1, phase / writeDur);
      this.headlines[idx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', reveal });
    } else {
      const f = (phase - holdEnd) / (CYCLE - holdEnd);
      this.headlines[idx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', opacity: 1 - f });
      this.headlines[nextIdx].emit(atlas, inst, crv, rws, { x: hx, y: hy, size: hsize, color: GOLD, anchor: 'middle', opacity: f });
    }

    // ── Two-column gallery ────────────────────────────────────────────────
    const gsize = 40;
    const rowH = 104;
    const colX = [this.x0 + 80, this.x0 + this.width / 2 + 40];
    const top = this.y0 + 340;
    const half = Math.ceil(this.gallery.length / 2);
    for (let i = 0; i < this.gallery.length; i++) {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      this.gallery[i].emit(atlas, inst, crv, rws, { x: colX[col], y: top + row * rowH, size: gsize, color: GALLERY[i][1], anchor: 'start' });
    }

    // ── Symbol showcase ───────────────────────────────────────────────────
    const sy = top + half * rowH + 40;
    layoutStr(inst, 'SYMBOLS', DIM, atlas.table, font, { x: this.x0 + 80, y: sy - 30, size: 13 });
    this.symbols[0].emit(atlas, inst, crv, rws, { x: this.x0 + 80, y: sy + 16, size: 30, color: INK, anchor: 'start' });
    this.symbols[1].emit(atlas, inst, crv, rws, { x: this.x0 + 80, y: sy + 72, size: 30, color: INK, anchor: 'start' });
  }
}
