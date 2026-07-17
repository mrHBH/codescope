// ── LayoutSpec → Taffy node tree conversion ──────────────────────────────────

import type { LayoutSpec, ObjectSpec, GroupSpec, TextStyle, RectSpec, CircleSpec } from '../ir/types';
import type { StyleProps } from './taffy';

export interface TaffyNodeTree {
  rootId: number;
  childIds: number[];       // Taffy node IDs (excluding root) in order
  objectIdMap: Map<number, string>; // Taffy node ID → ObjectSpec ID
}

/**
 * Build a Taffy tree for a group and its immediate children.
 * Does NOT recurse into child groups — that's the solver's job.
 * Returns Taffy node IDs that the solver can use with computeLayout.
 *
 * @param group    The group with a layout spec
 * @param children The child ObjectSpecs (IDs) to lay out
 * @param objects  All objects in the scene (to look up child specs)
 * @param taffy    The TaffyLayout instance
 */
export function buildTaffyTree(
  group: GroupSpec,
  children: string[],
  objects: Record<string, ObjectSpec>,
  newNode: (style?: StyleProps) => number,
  addChild: (parent: number, child: number) => void,
): TaffyNodeTree {
  const layout = group.layout;
  if (!layout) throw new Error(`Group '${group.id}' has no layout spec`);

  const rootId = newNode(groupToStyle(group, layout));
  const childIds: number[] = [];
  const objectIdMap = new Map<number, string>();
  objectIdMap.set(rootId, group.id);

  for (const childId of children) {
    const child = objects[childId];
    if (!child) continue;

    const childStyle = objectToStyle(child);
    const childTaffyId = newNode(childStyle);
    addChild(rootId, childTaffyId);
    childIds.push(childTaffyId);
    objectIdMap.set(childTaffyId, childId);
  }

  return { rootId, childIds, objectIdMap };
}

// ── Style conversion ─────────────────────────────────────────────────────────

function groupToStyle(group: GroupSpec, layout: LayoutSpec): StyleProps {
  const base: StyleProps = {};

  switch (layout.kind) {
    case 'flex':
      base.display = 'flex';
      base.flexDirection = layout.direction === 'row' ? 'row' : 'column';
      if (layout.wrap) base.flexWrap = layout.wrap === 'wrap' ? 'wrap' : layout.wrap === 'wrap-reverse' ? 'wrap-reverse' : 'no-wrap';
      if (layout.gap !== undefined) base.gap = layout.gap;
      if (layout.padding !== undefined) base.padding = layout.padding;
      if (layout.align) base.alignItems = toTaffyAlign(layout.align);
      if (layout.justify) base.justifyContent = toTaffyJustify(layout.justify);
      break;

    case 'grid': {
      base.display = 'grid';
      if (layout.gap !== undefined) base.gap = layout.gap;
      if (layout.padding !== undefined) base.padding = layout.padding;
      if (layout.align) base.alignItems = toTaffyAlign(layout.align);
      if (layout.justify) base.justifyContent = toTaffyJustify(layout.justify);
      // Grid templates are complex types in Taffy 0.7 — defer to Phase 3+
      // when the solver can handle full grid definitions
      break;
    }

    case 'stack':
      base.display = 'flex';
      base.flexDirection = layout.direction === 'horizontal' ? 'row' : 'column';
      if (layout.gap !== undefined) base.gap = layout.gap;
      if (layout.padding !== undefined) base.padding = layout.padding;
      if (layout.align) base.alignItems = toTaffyAlign(layout.align);
      break;

    case 'absolute':
      // No layout — child positions are explicit via `at`
      break;
  }

  return base;
}

function objectToStyle(obj: ObjectSpec): StyleProps {
  const s: StyleProps = {};

  switch (obj.kind) {
    case 'text':
      s.width = obj.style.size * obj.content.length * 0.6; // rough estimate
      if (obj.style.lineHeight) s.height = obj.style.size * obj.style.lineHeight;
      else s.height = obj.style.size * 1.2;
      break;

    case 'rect':
      s.width = obj.size[0];
      s.height = obj.size[1];
      break;

    case 'circle':
      s.width = obj.radius * 2;
      s.height = obj.radius * 2;
      break;

    case 'ellipse':
      s.width = obj.rx * 2;
      s.height = obj.ry * 2;
      break;

    case 'glyph':
      s.width = (obj.scale ?? 1) * 50;   // rough estimate
      s.height = (obj.scale ?? 1) * 50;
      break;

    case 'group':
      // Groups with layout have their own layout; groups without layout
      // need manual sizes. Default to auto (content-based).
      break;

    default:
      // arc, line, arrow, polygon, plot — sizes determined by their geometry
      break;
  }

  // Apply explicit size overrides from ObjectBase if present
  // (opacity, visible, zIndex are rendering concerns, not layout)

  return s;
}

function toTaffyAlign(align: string): NonNullable<StyleProps['alignItems']> {
  switch (align) {
    case 'start': return 'flex-start';
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'stretch': return 'stretch';
    case 'baseline': return 'baseline';
    default: return 'flex-start';
  }
}

function toTaffyJustify(justify: string): NonNullable<StyleProps['justifyContent']> {
  switch (justify) {
    case 'start': return 'flex-start';
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'space-between': return 'space-between';
    case 'space-around': return 'space-around';
    case 'space-evenly': return 'space-evenly';
    default: return 'flex-start';
  }
}
