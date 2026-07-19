// ── Island registry ──────────────────────────────────────────────────────────

import type { Vec2, Color, ParamValue, ParamRef } from '../ir/types';
import type { DrawHelpers } from './draw';

export interface IslandEmitCtx {
  font: any; atlas: any;
  inst: number[]; crv: number[]; rws: number[];
  view: { zoom: number; left: number; right: number; top: number; bottom: number };
  now: number;
  draw: DrawHelpers;
  hoveredHandle: string | null;   // id of the handle the pointer is over (or null)
  grabbedHandle: string | null;   // id of the handle being dragged (or null)
}

export interface IslandTime {
  local: number;
  now: number;
  playing: boolean;
  alpha: number;
  build: number;
}

export type IslandKind = 'visual';

export interface IslandHandleDef {
  param: string;
  at(params: Record<string, ParamValue>): Vec2;
  set(params: Record<string, ParamValue>, to: Vec2): void;
}

export interface IslandDef {
  id: string;
  title: string;
  kind: IslandKind;
  params: Record<string, any>;
  defaultSize: Vec2;
  handles?: IslandHandleDef[];
  emit(ctx: IslandEmitCtx, params: Record<string, ParamValue>, time: IslandTime): void;
}

const registry = new Map<string, IslandDef>();

export function registerIsland(def: IslandDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate island id: ${def.id}`);
  registry.set(def.id, def);
}

export function getIsland(id: string): IslandDef {
  const d = registry.get(id);
  if (!d) throw new Error(`Unknown island: ${id}. Register it with registerIsland first.`);
  return d;
}

export function listIslands(): IslandDef[] {
  return [...registry.values()];
}
