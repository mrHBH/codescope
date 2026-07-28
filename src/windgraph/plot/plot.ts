// ── windgraph · plotting barrel (Phase 3) ────────────────────────────────────
// Re-exports all sub-modules so consumers can `import { plotFunction, scatter,
// plotImplicit, ... } from './plot/plot'`.

export type { PlotStyle } from './functions';
export { plotFunction, plotParametric, plotPolar, areaUnder, areaBetween } from './functions';
export { plotImplicit, type ImplicitStyle } from './implicit';
export { plotVectorField, plotSlopeField, type FieldStyle } from './field';
export { scatter, lineSeries, stepSeries, bars, errorBars, riemannRectangles, type ErrorBar } from './data';
export { catmullRom, naturalCubic, bspline, spline, deCasteljau, bezier, type SplineKind } from './spline';
export { sequenceSamples, cobweb } from './sequence';
export { derivative, secondDerivative, sampleFn, tangentLine, normalLine, accumulation, quadrature, quadratureColumns, type QuadMode, type QuadColumn } from './calculus';
export { rk4Ode, rk4System, streamline, streamlines, bifurcation } from './ode';
export { fourierCoeffs, fourierSum, fourierCurve, epicycles, type FourierCoeff, type Epicycle } from './fourier';
export { histogram, quantile, boxStats, kde, beeswarm, hexbin, mean, stddev, regression, linearReg, polyReg, expReg, powerReg, logisticReg, residuals, rSquared, type BinMethod, type HistBin, type BoxStats, type HexCell, type RegKind, type RegResult } from './stats';
export { contourLevels, plotContourLines, plotFilledContours, contourLabelAnchors, type ContourStyle } from './contour';
export { plotInequality, type Cmp } from './inequality';
export { candlestick, waterfall, funnel, radar, windrose, ternaryToXY, ternaryFrame, parallelCoords, scatterMatrix, type Ohlc, type CandleGeom, type WaterfallStep, type ScatterMatrixFacet } from './charts';
