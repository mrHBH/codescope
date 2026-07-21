// ── Island: slider — interactive horizontal slider ────────────────────────────
// Renders as analytic geometry: track + active fill + thumb + label + value.
// Drag the thumb to change the param value.

import { registerIsland, type IslandDef } from '../registry';
import { clamp } from '../../builder/helpers';

const C = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  accent: [0.00, 0.48, 0.80, 1], accentDim: [0.00, 0.30, 0.50, 1],
  border: [0.20, 0.20, 0.20, 1], gold: [0.97, 0.73, 0.33, 1],
};

function valToX(val: number, min: number, max: number, x0: number, x1: number): number {
  return x0 + (clamp(val, min, max) - min) / (max - min) * (x1 - x0);
}

function xToVal(x: number, min: number, max: number, x0: number, x1: number): number {
  return clamp(min + (x - x0) / (x1 - x0) * (max - min), min, max);
}

const island: IslandDef = {
  id: 'slider',
  title: 'Slider',
  kind: 'visual',
  params: {
    value: { kind: 'number', label: 'Value', default: 0.5, min: 0, max: 1 },
    min: { kind: 'number', label: 'Min', default: 0, min: -1e6, max: 1e6 },
    max: { kind: 'number', label: 'Max', default: 1, min: -1e6, max: 1e6 },
    step: { kind: 'number', label: 'Step', default: 0.01, min: 0, max: 1e6 },
    label: { kind: 'color', label: 'Label color (abused as string)', default: [0.73, 0.74, 0.77, 1] },
    showValue: { kind: 'boolean', label: 'Show value', default: true },
  },
  defaultSize: [400, 60],
  handles: [
    {
      param: 'value',
      at(params) {
        const val = params.value as number;
        const min = params.min as number;
        const max = params.max as number;
        const x = valToX(val, min, max, 30, 370);
        return [x, 30] as [number, number];
      },
      set(params, to) {
        const min = params.min as number;
        const max = params.max as number;
        const step = params.step as number;
        let val = xToVal(to[0], min, max, 30, 370);
        if (step > 0) val = Math.round(val / step) * step;
        (params as any).value = clamp(val, min, max);
      },
    },
  ],
  emit(ctx, params, time) {
    const a = time.alpha;
    const val = params.value as number;
    const min = params.min as number;
    const max = params.max as number;
    const showVal = params.showValue as boolean;

    // Track background
    ctx.draw.rect(30, 24, 370, 28, [0.12, 0.125, 0.14, 1], a);
    ctx.draw.rectStroke(30, 24, 370, 28, C.border, 1, a);

    // Active fill
    const fillX = valToX(val, min, max, 30, 370);
    if (fillX > 30) {
      ctx.draw.rect(30, 24, fillX, 28, C.accentDim, 0.5 * a);
    }

    // Thumb position
    const thumbX = valToX(val, min, max, 30, 370);
    const hot = ctx.hoveredHandle === 'value' || ctx.grabbedHandle === 'value';

    // Thumb
    ctx.draw.fillCircle(thumbX, 26, hot ? 10 : 8, hot ? C.gold : C.accent, a);
    ctx.draw.strokeCircle(thumbX, 26, hot ? 16 : 12, hot ? C.gold : C.accent, 2, a * 0.7);

    // Value text
    if (showVal) {
      const precision = Math.max(0, Math.ceil(-Math.log10((max - min) / 100)));
      ctx.draw.text(val.toFixed(precision), 200, 52, 13, C.head, a, 'middle');
    }
  },
};

registerIsland(island);
