// ── windgraph · plotting barrel (Phase 3) ────────────────────────────────────
// Re-exports all sub-modules so consumers can `import { plotFunction, scatter,
// plotImplicit, ... } from './plot/plot'`.

export type { PlotStyle } from './functions';
export { plotFunction, plotParametric, plotPolar, areaUnder, areaBetween } from './functions';
export { plotImplicit, type ImplicitStyle } from './implicit';
export { plotVectorField, plotSlopeField, type FieldStyle } from './field';
export { scatter, lineSeries, stepSeries, bars, errorBars, riemannRectangles, type ErrorBar } from './data';
