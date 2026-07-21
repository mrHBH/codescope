// ── Island: fourier-plot — interactive Fourier series plot ────────────────────
// Cartesian plot with grid, axes, multiple harmonic traces, and a probe handle.
// Draws a Fourier series approximation of a square wave (configurable harmonics).

import { registerIsland, type IslandDef } from '../registry';
import { clamp, lerp, loop01, ping } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.20, 0.20, 0.20, 1], accent: [0.00, 0.48, 0.80, 1],
  gold: [0.97, 0.73, 0.33, 1], cyan: [0.36, 0.85, 0.97, 1], green: [0.30, 0.80, 0.40, 1],
  rose: [0.93, 0.36, 0.34, 1], accent2: [0.61, 0.30, 0.87, 1],
  panelBg: [0.08, 0.085, 0.10, 1],
  // Harmonic color cycle
  hColors: [
    [0.00, 0.48, 0.80, 1], // accent
    [0.97, 0.73, 0.33, 1], // gold
    [0.30, 0.80, 0.40, 1], // green
    [0.93, 0.36, 0.34, 1], // rose
    [0.61, 0.30, 0.87, 1], // accent2
    [0.36, 0.85, 0.97, 1], // cyan
  ],
};

/** Map params to plot bounds */
const PLOT = {
  x0: 60, x1: 440,  // plot area left/right
  y0: 30, y1: 350,  // plot area top/bottom
};

// ── Fourier math ──────────────────────────────────────────────────────────────

/** Compute square wave Fourier series at t for N harmonics. */
function fourierSquare(t: number, N: number): number {
  let sum = 0;
  for (let k = 1; k <= N; k++) {
    const n = 2 * k - 1; // odd harmonics only
    sum += Math.sin(n * t) / n;
  }
  return (4 / Math.PI) * sum;
}

/** Compute the k-th individual harmonic of square wave. */
function fourierHarmonic(t: number, k: number): { n: number; amp: number } {
  const n = 2 * k - 1;
  return { n, amp: 4 / (Math.PI * n) };
}

/** Map world coords to plot pixel coords. */
function toPlotX(t: number, xRange: [number, number]): number {
  const [xMin, xMax] = xRange;
  return PLOT.x0 + (clamp(t, xMin, xMax) - xMin) / (xMax - xMin) * (PLOT.x1 - PLOT.x0);
}
function toPlotY(y: number, yRange: [number, number]): number {
  const [yMin, yMax] = yRange;
  // Y axis is inverted in screen coords (higher Y = lower on screen)
  return PLOT.y0 + (yMax - clamp(y, yMin, yMax)) / (yMax - yMin) * (PLOT.y1 - PLOT.y0);
}

const island: IslandDef = {
  id: 'fourier-plot',
  title: 'Fourier series plot',
  kind: 'visual',
  params: {
    numHarmonics: { kind: 'number', label: 'Harmonics', default: 3, min: 1, max: 20, step: 1 },
    showIndividual: { kind: 'boolean', label: 'Show individual harmonics', default: true },
    showSum: { kind: 'boolean', label: 'Show sum', default: true },
    probeX: { kind: 'point', label: 'Probe X', default: [250, 350] },
    waveType: { kind: 'number', label: 'Wave type (0=square,1=saw,2=tri)', default: 0, min: 0, max: 2, step: 1 },
  },
  defaultSize: [470, 420],
  handles: [
    {
      param: 'probeX',
      at(params) {
        return params.probeX as [number, number];
      },
      set(params, to) {
        (params as any).probeX = [
          clamp(to[0], PLOT.x0 + 2, PLOT.x1 - 2),
          clamp(to[1], PLOT.y0 + 2, PLOT.y1 - 2),
        ];
      },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const N = Math.round(params.numHarmonics as number);
    const showIndiv = params.showIndividual as boolean;
    const showSum = params.showSum as boolean;
    const probePos = params.probeX as number[];
    const probeX = probePos[0], probeY = probePos[1];
    const waveType = Math.round(params.waveType as number);

    const xRange: [number, number] = [0, 2 * Math.PI];
    const yRange: [number, number] = [-1.6, 1.6];

    const x0 = PLOT.x0, x1 = PLOT.x1, y0 = PLOT.y0, y1 = PLOT.y1;
    const pw = x1 - x0, ph = y1 - y0;

    // ── Panel background ──────────────────────────────────────────────────
    ctx.draw.rect(x0, y0, x1, y1, C.panelBg, a);
    ctx.draw.rectStroke(x0, y0, x1, y1, C.border, 1, a);

    // ── Grid lines ────────────────────────────────────────────────────────
    const xSteps = 6, ySteps = 8;
    for (let i = 0; i <= xSteps; i++) {
      const gx = x0 + (i / xSteps) * pw;
      ctx.draw.line([[gx, y0], [gx, y1]], C.border, 0.8, a * 0.35);
      // X axis labels
      const val = xRange[0] + (i / xSteps) * (xRange[1] - xRange[0]);
      const label = val === 0 ? '0' : val === Math.PI ? 'π' : val === 2 * Math.PI ? '2π' : '';
      if (label) ctx.draw.text(label, gx, y1 + 14, 10, C.dim, a * 0.7, 'middle');
    }
    for (let j = 0; j <= ySteps; j++) {
      const gy = y0 + (j / ySteps) * ph;
      ctx.draw.line([[x0, gy], [x1, gy]], C.border, 0.8, a * 0.35);
      const val = yRange[1] - (j / ySteps) * (yRange[1] - yRange[0]);
      if (val === -1 || val === 0 || val === 1) {
        ctx.draw.text(val.toFixed(0), x0 - 8, gy - 5, 10, C.dim, a * 0.7, 'end');
      }
    }

    // ── Axes ──────────────────────────────────────────────────────────────
    const yAxisX = toPlotX(0, xRange);
    const xAxisY = toPlotY(0, yRange);
    ctx.draw.line([[x0, xAxisY], [x1, xAxisY]], C.dim, 1.2, a * 0.6);
    ctx.draw.line([[yAxisX, y0], [yAxisX, y1]], C.dim, 1.2, a * 0.6);

    // ── Compute traces ────────────────────────────────────────────────────
    const S = 120; // samples
    const sampleT: number[] = [];
    for (let k = 0; k <= S; k++) sampleT.push(xRange[0] + (k / S) * (xRange[1] - xRange[0]));

    // Individual harmonics
    if (showIndiv) {
      for (let h = 1; h <= N; h++) {
        const { n, amp } = fourierHarmonic(sampleT[0], h);
        const pts: [number, number][] = [];
        for (const t of sampleT) {
          const val = amp * Math.sin(n * t);
          pts.push([toPlotX(t, xRange), toPlotY(val, yRange)]);
        }
        ctx.draw.line(pts, C.hColors[(h - 1) % C.hColors.length], 1.8, a * 0.45);
      }
    }

    // Sum trace
    if (showSum) {
      const pts: [number, number][] = [];
      for (const t of sampleT) {
        const val = fourierSquare(t, N);
        pts.push([toPlotX(t, xRange), toPlotY(val, yRange)]);
      }
      ctx.draw.line(pts, C.accent, 2.8, a * 0.95);
    }

    // ── Probe ─────────────────────────────────────────────────────────────
    // Find the curve value at the probe position
    const probeT = xRange[0] + ((probeX - x0) / pw) * (xRange[1] - xRange[0]);
    const probeVal = fourierSquare(probeT, N);
    const probeCurveY = toPlotY(probeVal, yRange);

    // Vertical probe line
    ctx.draw.line([[probeX, y0 + 2], [probeX, probeCurveY]], C.gold, 1.5, a * 0.6);
    // Horizontal from probe to y-axis
    ctx.draw.line([[yAxisX, probeCurveY], [probeX, probeCurveY]], C.gold, 1.2, a * 0.4, [4, 4]);

    // Probe dot on curve
    ctx.draw.fillCircle(probeX, probeCurveY, 5, C.gold, a);
    ctx.draw.strokeCircle(probeX, probeCurveY, 9, C.gold, 2, a * 0.7);

    // Value readout
    const readX = Math.min(probeX + 14, x1 - 70);
    const readY = Math.max(probeCurveY - 16, y0 + 2);
    // Background pill for readout
    const readW = 66, readH = 20;
    ctx.draw.rect(readX - 2, readY - 2, readX + readW + 2, readY + readH + 2, [0.10, 0.105, 0.12, 1], a * 0.9);
    ctx.draw.rectStroke(readX - 2, readY - 2, readX + readW + 2, readY + readH + 2, C.gold, 1, a * 0.5);
    ctx.draw.text(`f=${probeVal.toFixed(3)}`, readX + 2, readY + 14, 11, C.gold, a, 'start');

    // Probe handle (draggable)
    const hot = ctx.hoveredHandle === 'probeX' || ctx.grabbedHandle === 'probeX';
    ctx.draw.handle(probeX, probeCurveY, hot, a);

    // ── Legend ────────────────────────────────────────────────────────────
    const legX = x0 + 8, legY = y0 + 8;
    if (showSum) {
      ctx.draw.rect(legX, legY, legX + 10, legY + 10, C.accent, a * 0.9);
      ctx.draw.text('sum', legX + 14, legY + 8, 9, C.dim, a * 0.7, 'start');
    }
    if (showIndiv && N > 1) {
      for (let h = 1; h <= Math.min(N, 4); h++) {
        const ly = legY + (h) * 14;
        ctx.draw.rect(legX, ly, legX + 10, ly + 10, C.hColors[(h - 1) % C.hColors.length], a * 0.6);
        const { n } = fourierHarmonic(0, h);
        ctx.draw.text(`n=${n}`, legX + 14, ly + 8, 9, C.dim, a * 0.6, 'start');
      }
    }
  },
};

registerIsland(island);
