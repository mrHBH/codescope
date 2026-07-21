// ── Island: fourier-spectrum — frequency spectrum stem plot ───────────────────
// Draws discrete amplitude bars for each harmonic in a Fourier series.
// Animated highlight sweeps through the bars; auto-animates when not interactive.

import { registerIsland, type IslandDef } from '../registry';
import { clamp, loop01, lerp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.20, 0.20, 0.20, 1], accent: [0.00, 0.48, 0.80, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1], green: [0.30, 0.80, 0.40, 1],
  rose: [0.93, 0.36, 0.34, 1], accent2: [0.61, 0.30, 0.87, 1],
  panelBg: [0.08, 0.085, 0.10, 1],
  barColors: [
    [0.00, 0.48, 0.80, 1],
    [0.97, 0.73, 0.33, 1],
    [0.30, 0.80, 0.40, 1],
    [0.93, 0.36, 0.34, 1],
    [0.61, 0.30, 0.87, 1],
    [0.36, 0.85, 0.97, 1],
  ],
};

const PLOT = {
  x0: 50, x1: 450,
  y0: 40, y1: 320,
};

function getAmplitudes(N: number): { freq: number; amp: number; label: string }[] {
  const result: { freq: number; amp: number; label: string }[] = [];
  for (let k = 1; k <= N; k++) {
    const n = 2 * k - 1; // odd harmonics
    const amp = 4 / (Math.PI * n);
    result.push({ freq: n, amp, label: `${n} Hz` });
  }
  return result;
}

const island: IslandDef = {
  id: 'fourier-spectrum',
  title: 'Fourier spectrum',
  kind: 'visual',
  params: {
    numHarmonics: { kind: 'number', label: 'Harmonics', default: 5, min: 1, max: 20, step: 1 },
    highlightIdx: { kind: 'number', label: 'Highlight index', default: -1, min: -1, max: 19, step: 1 },
  },
  defaultSize: [470, 370],
  emit(ctx, params, time) {
    const a = time.alpha;
    const N = Math.round(params.numHarmonics as number);
    let highlight = Math.round(params.highlightIdx as number);

    // Auto-animate highlight if not explicitly set
    if (highlight < 0 && time.playing) {
      highlight = Math.floor(loop01(time.local > 0 ? time.local : time.now, 4) * N);
    }

    const x0 = PLOT.x0, x1 = PLOT.x1, y0 = PLOT.y0, y1 = PLOT.y1;
    const pw = x1 - x0, ph = y1 - y0;
    const amplitudes = getAmplitudes(N);

    // Find max amplitude for scaling
    const maxAmp = Math.max(...amplitudes.map(a => a.amp), 0.01);

    // ── Panel background ──────────────────────────────────────────────────
    ctx.draw.rect(x0, y0, x1, y1, C.panelBg, a);
    ctx.draw.rectStroke(x0, y0, x1, y1, C.border, 1, a);

    // ── Grid lines (horizontal only) ──────────────────────────────────────
    const ySteps = 4;
    for (let j = 0; j <= ySteps; j++) {
      const gy = y1 - (j / ySteps) * ph;
      ctx.draw.line([[x0, gy], [x1, gy]], C.border, 0.8, a * 0.3);
    }

    // ── Y axis label ──────────────────────────────────────────────────────
    ctx.draw.text('A', x0 - 6, y0 + 2, 10, C.dim, a * 0.6, 'end');

    // ── Bars ──────────────────────────────────────────────────────────────
    const barW = Math.min(32, pw / (N + 2) * 0.6);
    const gap = pw / (N + 1);

    for (let i = 0; i < N; i++) {
      const { freq, amp, label } = amplitudes[i];
      const barH = (amp / maxAmp) * ph * 0.85;
      const bx = x0 + (i + 1) * gap - barW / 2;
      const by = y1 - barH;

      const isHighlighted = i === highlight;
      const barColor = C.barColors[i % C.barColors.length];

      // Bar fill
      ctx.draw.rect(bx, by, bx + barW, y1, isHighlighted ? barColor : [barColor[0], barColor[1], barColor[2], 0.5], isHighlighted ? a : a * 0.6);

      // Bar stroke
      ctx.draw.rectStroke(bx, by, bx + barW, y1, isHighlighted ? barColor : C.border, isHighlighted ? 2 : 1, a);

      // Frequency label
      ctx.draw.text(label, bx + barW / 2, y1 + 12, 9, isHighlighted ? C.head : C.dim, a * 0.7, 'middle');

      // Amplitude value on top of bar
      if (amp > 0.05) {
        ctx.draw.text(amp.toFixed(2), bx + barW / 2, by - 6, 9, isHighlighted ? C.head : C.dim, a * 0.6, 'middle');
      }
    }

    // ── Title ─────────────────────────────────────────────────────────────
    ctx.draw.text('Frequency spectrum', x0 + 6, y0 + 14, 12, C.dim, a * 0.7, 'start');
    ctx.draw.text(`N = ${N}`, x1 - 6, y0 + 14, 12, C.accent, a * 0.8, 'end');
  },
};

registerIsland(island);
