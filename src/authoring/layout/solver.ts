// ── Layout solver — resolves object positions from Taffy layout ─────────────

import type { SceneIR, ObjectSpec, GroupSpec } from '../ir/types';
import type { LayoutResult } from './taffy';
import { taffy as taffyInstance } from './taffy';
import { buildTaffyTree } from './spec-to-taffy';

/**
 * Run the Taffy layout pass on all groups in the scene that have layout specs.
 * Modifies ObjectSpec.at in-place for each child of a laid-out group.
 *
 * Order: bottom-up. Child groups with layout are resolved before their parents.
 */
export function solveLayout(scene: SceneIR): void {
  // Collect groups with layout, sorted by depth (deepest first)
  const groups = findLayoutGroups(scene.objects);

  // Sigh... TaffyLayout's setStyle/setStyle needs `taffy` to be initialized.
  // We use the singleton instance directly via the bridge.
  // For now we use a simple pure-function approach: the solver just
  // computes positions and writes them back. The actual WASM call happens
  // through the buildTaffyTree + taffy.computeLayout path.

  for (const groupId of groups) {
    const group = scene.objects[groupId] as GroupSpec;
    const layout = group.layout;
    if (!layout || layout.kind === 'absolute') continue;

    const children = group.children.filter(cId => scene.objects[cId]);

    // Collect measured sizes from children
    const tree = buildTaffyTree(
      group,
      children,
      scene.objects,
      (style) => taffyInstance.newNode(style),
      (p, c) => taffyInstance.addChild(p, c),
    );

    // Compute
    const results = taffyInstance.computeLayout(tree.rootId);

    // Write positions back
    for (const r of results) {
      const objId = tree.objectIdMap.get(r.id);
      if (!objId || objId === group.id) continue; // skip the container itself

      const obj = scene.objects[objId];
      if (!obj) continue;

      obj.at = [r.x, r.y];
    }

    // Update group's own bounding box from computed layout
    const rootResult = results.find(r => tree.objectIdMap.get(r.id) === group.id);
    if (rootResult) {
      group.at = [rootResult.x, rootResult.y];
    }
  }
}

/**
 * Find all group IDs that have a non-absolute layout, sorted bottom-up
 * (deepest children first, root last).
 */
function findLayoutGroups(objects: Record<string, ObjectSpec>): string[] {
  const groupIds = new Set<string>();
  const parentMap = new Map<string, string>();

  // Build parent map
  for (const [id, obj] of Object.entries(objects)) {
    if (obj.kind === 'group') {
      groupIds.add(id);
      for (const childId of (obj as GroupSpec).children) {
        parentMap.set(childId, id);
      }
    }
  }

  // Filter to only groups with layout
  const layoutGroups = [...groupIds].filter(id => {
    const g = objects[id] as GroupSpec;
    return g.layout && g.layout.kind !== 'absolute';
  });

  // Topological sort: deepest first
  return topologicalSort(layoutGroups, parentMap);
}

function topologicalSort(nodes: string[], parentMap: Map<string, string>): string[] {
  const depth = new Map<string, number>();
  const getDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const parent = parentMap.get(id);
    const d = parent ? getDepth(parent) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const id of nodes) getDepth(id);
  return nodes.sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
}
