// ── Parameter system ────────────────────────────────────────────────────────

import type { ParamDef, ParamRef } from '../ir/types';

export interface ParamOpts {
  label?: string;
  default?: number | boolean | [number, number] | [number, number, number, number];  // depends on kind
  min?: number;
  max?: number;
  step?: number;
}

// The `kind` is determined from the default value type:
// number → 'slider', boolean → 'toggle', Vec2 → 'point', Color → 'color'

export function createParams(params: ParamDef[]) {
  return {
    param(id: string, opts: ParamOpts): ParamDef {
      const dv = opts.default;
      let def: ParamDef;

      if (typeof dv === 'boolean') {
        def = { kind: 'toggle', id, label: opts.label ?? id, default: dv };
      } else if (Array.isArray(dv)) {
        if (dv.length === 2) {
          def = { kind: 'point', id, label: opts.label ?? id, default: dv as [number, number] };
        } else {
          def = { kind: 'color', id, label: opts.label ?? id, default: dv as [number, number, number, number] };
        }
      } else {
        def = {
          kind: 'slider',
          id,
          label: opts.label ?? id,
          default: dv ?? 50,
          min: opts.min ?? 0,
          max: opts.max ?? 100,
          step: opts.step,
        };
      }

      params.push(def);
      return def;
    },

    paramRef(id: string): ParamRef {
      return { $param: id };
    },
  };
}
