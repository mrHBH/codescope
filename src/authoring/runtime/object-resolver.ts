// ── Object resolver — ObjectSpec → Mobject mapping ──────────────────────────

import type { ObjectSpec, GroupSpec, TextSpec, GlyphSpec, RectSpec, CircleSpec, EllipseSpec, PolygonSpec, ArcSpec, LineSpec, ArrowSpec } from '../ir/types';
import type { RenderCtx } from '../../windgraph/mobject/mobject';
import { Group } from '../../windgraph/mobject/mobject';
import {
  Dot, Segment, Polyline, Polygon, Vector, Circle, Arc, Ellipse, Label,
} from '../../windgraph/mobject/primitives';

export interface ResolvedObject {
  mobject: any; // Mobject instance
  id: string;
  kind: string;
}

/**
 * Resolve all objects in a scene to Mobject instances.
 * Returns a map of object ID → { mobject, id, kind }.
 * Groups are resolved first, then children are added.
 */
export function resolveObjects(objects: Record<string, ObjectSpec>): Map<string, ResolvedObject> {
  const resolved = new Map<string, ResolvedObject>();

  // First pass: resolve leaf objects
  for (const [id, spec] of Object.entries(objects)) {
    if (spec.kind === 'group') continue;
    resolved.set(id, { mobject: resolveLeaf(spec), id, kind: spec.kind });
  }

  // Second pass: resolve groups (children are already resolved)
  for (const [id, spec] of Object.entries(objects)) {
    if (spec.kind !== 'group') continue;
    const group = resolveGroup(spec as GroupSpec, resolved);
    resolved.set(id, { mobject: group, id, kind: 'group' });
  }

  return resolved;
}

function resolveLeaf(spec: ObjectSpec): any {
  switch (spec.kind) {
    case 'text': {
      const s = spec as TextSpec;
      const label = new Label(
        s.content,
        s.at?.[0] ?? 0, s.at?.[1] ?? 0,
        s.style.size,
        s.style.color,
        s.style.align === 'center' ? 'middle' : s.style.align === 'right' ? 'end' : 'start',
      );
      applyCommon(label, spec);
      return label;
    }

    case 'circle': {
      const s = spec as CircleSpec;
      const c = new Circle(
        s.at?.[0] ?? 0, s.at?.[1] ?? 0,
        s.radius,
        s.stroke ? { color: s.stroke.color, width: s.stroke.width } : { color: [1, 1, 1, 1], width: 0 },
        s.fill ? { color: s.fill } : undefined,
      );
      applyCommon(c, spec);
      if (!s.stroke) (c as any).props = { color: [1, 1, 1, 1], width: 0 };
      return c;
    }

    case 'ellipse': {
      const s = spec as EllipseSpec;
      const e = new Ellipse(
        s.at?.[0] ?? 0, s.at?.[1] ?? 0,
        s.rx, s.ry,
        s.stroke ? { color: s.stroke.color, width: s.stroke.width } : { color: [1, 1, 1, 1], width: 0 },
        s.fill ? { color: s.fill } : undefined,
      );
      applyCommon(e, spec);
      if (!s.stroke) (e as any).props = { color: [1, 1, 1, 1], width: 0 };
      return e;
    }

    case 'rect': {
      const s = spec as RectSpec;
      const x = s.at?.[0] ?? 0, y = s.at?.[1] ?? 0;
      const w = s.size[0], h = s.size[1];
      const pts: [number, number][] = [
        [x, y], [x + w, y], [x + w, y + h], [x, y + h],
      ];
      const p = new Polygon(
        pts,
        s.stroke ? { color: s.stroke.color, width: s.stroke.width, join: s.stroke.join, cap: s.stroke.cap } : { color: [1, 1, 1, 1], width: 0 },
        s.fill ? { color: s.fill } : undefined,
      );
      applyCommon(p, spec);
      return p;
    }

    case 'polygon': {
      const s = spec as PolygonSpec;
      const p = new Polygon(
        s.points,
        s.stroke ? { color: s.stroke.color, width: s.stroke.width, join: s.stroke.join } : { color: [1, 1, 1, 1], width: 0 },
        s.fill ? { color: s.fill } : undefined,
      );
      applyCommon(p, spec);
      return p;
    }

    case 'arc': {
      const s = spec as ArcSpec;
      const a = new Arc(
        s.at?.[0] ?? 0, s.at?.[1] ?? 0,
        s.radius, s.startAngle, s.endAngle,
        { color: s.stroke.color, width: s.stroke.width, cap: s.stroke.cap },
      );
      applyCommon(a, spec);
      return a;
    }

    case 'line': {
      const s = spec as LineSpec;
      const l = new Polyline(s.points, {
        color: s.stroke.color, width: s.stroke.width,
        cap: s.stroke.cap, join: s.stroke.join,
      });
      applyCommon(l, spec);
      return l;
    }

    case 'arrow': {
      const s = spec as ArrowSpec;
      const v = new Vector(s.from, s.to, {
        color: s.stroke.color, width: s.stroke.width,
      });
      applyCommon(v, spec);
      return v;
    }

    case 'glyph': {
      const s = spec as GlyphSpec;
      const label = new Label(
        s.char,
        s.at?.[0] ?? 0, s.at?.[1] ?? 0,
        40 * (s.scale ?? 1),
        s.style.color ?? [1, 1, 1, 1],
      );
      applyCommon(label, spec);
      return label;
    }

    default:
      const g = new Group();
      applyCommon(g, spec);
      return g;
  }
}

function resolveGroup(spec: GroupSpec, resolved: Map<string, ResolvedObject>): any {
  const group = new Group();
  applyCommon(group, spec);

  for (const childId of spec.children) {
    const child = resolved.get(childId);
    if (child) {
      group.add(child.mobject);
    }
  }

  return group;
}

function applyCommon(m: any, spec: ObjectSpec): void {
  if (spec.at) {
    m.position = [spec.at[0], spec.at[1]];
  }
  if (spec.opacity !== undefined) m.opacity = spec.opacity;
  if (spec.visible !== undefined) m.visible = spec.visible;
  if (spec.reveal !== undefined) m.reveal = spec.reveal;
  if (spec.rotation !== undefined) m.rotation = spec.rotation;
  if (spec.scaleX !== undefined) m.scaleX = spec.scaleX;
  if (spec.scaleY !== undefined) m.scaleY = spec.scaleY;
}

/**
 * Apply a computed FrameState to resolved Mobject instances.
 */
export function applyFrameState(
  resolved: Map<string, ResolvedObject>,
  frameState: Map<string, import('./timeline-engine').ObjectState>,
): void {
  for (const [id, state] of frameState) {
    const obj = resolved.get(id);
    if (!obj) continue;

    const m = obj.mobject;
    if (state.opacity !== undefined) m.opacity = state.opacity;
    if (state.visible !== undefined) m.visible = state.visible;
    if (state.reveal !== undefined) m.reveal = state.reveal;
    if (state.position) {
      m.position = [state.position[0], state.position[1]];
    }
    if (state.scale[0] !== null) m.scaleX = state.scale[0];
    if (state.scale[1] !== null) m.scaleY = state.scale[1];
    if (state.rotation !== null) m.rotation = state.rotation;
  }
}
