// ── Taffy layout solver — SceneDoc → page-local boxes ────────────────────────
import { taffy, type StyleProps } from '../../taffy/taffy';
import type { SceneDoc, ObjectSpec, GroupSpec, LayoutSpec } from '../ir/types';
import type { MeasureFn } from './measure';

export type Box = { x: number; y: number; w: number; h: number };
export type LayoutMap = Map<string, Box>;

let _ready = false;

export async function ensureTaffy(): Promise<void> {
  if (_ready) return;
  if (!taffy.ready) await taffy.init();
  _ready = true;
}

function layoutSpecToProps(ls: LayoutSpec): StyleProps {
  const sp: StyleProps = { display: 'flex' };
  sp.flexDirection = ls.direction === 'row' ? 'row' : 'column';
  if (ls.gap !== undefined) sp.gap = ls.gap;
  if (ls.padding !== undefined) sp.padding = ls.padding;
  const align = ls.align as string | undefined;
  if (align !== undefined) {
    sp.alignItems = align === 'stretch' ? 'stretch'
      : align === 'start' ? 'flex-start'
      : align === 'end' ? 'flex-end' : 'center';
  } else {
    sp.alignItems = 'stretch';
  }
  const justify = ls.justify as string | undefined;
  if (justify !== undefined) {
    sp.justifyContent = justify === 'space-between' ? 'space-between'
      : justify === 'space-around' ? 'space-around'
      : justify === 'start' ? 'flex-start'
      : justify === 'end' ? 'flex-end' : 'center';
  }
  return sp;
}

/**
 * Map leaf measure + item flex props → Taffy style.
 * - flexGrow > 0 → flexible main size (bars, islands, filler rects)
 * - text without fixed width in a column → stretch width (wraps via 2-pass measure)
 * - otherwise → fixed measured box
 */
function leafItem(
  item: any,
  measured: { w: number; h: number },
  parentDir: 'row' | 'column',
  kind: string,
): StyleProps {
  const grow = item?.flexGrow ?? 0;
  const shrink = item?.flexShrink;
  const hasFixedW = typeof item?.width === 'number';
  const hasFixedH = typeof item?.height === 'number';
  const w = hasFixedW ? (item.width as number) : measured.w;
  const h = hasFixedH ? (item.height as number) : measured.h;
  const sp: StyleProps = {};

  if (grow > 0) {
    sp.flexGrow = grow;
    sp.flexShrink = shrink ?? 1;
    if (parentDir === 'row') {
      // Grow on main (x); leave height unset so align-items:stretch can fill
      sp.flexBasis = hasFixedW ? w : measured.w;
      if (item?.minWidth !== undefined) sp.minWidth = item.minWidth;
      else sp.minWidth = Math.min(measured.w, 40);
      if (hasFixedH) sp.height = h;
      else if (item?.minHeight !== undefined) sp.minHeight = item.minHeight;
    } else {
      // Grow on main (y); leave width unset so stretch can fill column
      sp.flexBasis = hasFixedH ? h : measured.h;
      if (item?.minHeight !== undefined) sp.minHeight = item.minHeight;
      else sp.minHeight = Math.min(measured.h, 40);
      if (hasFixedW) sp.width = w;
      else if (item?.minWidth !== undefined) sp.minWidth = item.minWidth;
    }
  } else if (kind === 'text' && !hasFixedW && parentDir === 'column') {
    // Stretch to column width; height from measure (updated in 2-pass wrap)
    sp.height = h;
    sp.minWidth = item?.minWidth ?? 40;
    sp.flexShrink = shrink ?? 1;
    // no explicit width → align-items:stretch assigns full content width
  } else {
    sp.width = w;
    sp.height = h;
    if (shrink !== undefined) sp.flexShrink = shrink;
  }

  if (item?.minWidth !== undefined && sp.minWidth === undefined) sp.minWidth = item.minWidth;
  if (item?.minHeight !== undefined && sp.minHeight === undefined) sp.minHeight = item.minHeight;
  if (item?.maxWidth !== undefined) sp.maxWidth = item.maxWidth;
  if (item?.maxHeight !== undefined) sp.maxHeight = item.maxHeight;
  if (item?.alignSelf !== undefined) {
    sp.alignSelf = item.alignSelf === 'stretch' ? 'stretch'
      : item.alignSelf === 'start' ? 'flex-start'
      : item.alignSelf === 'end' ? 'flex-end' : 'center';
  }
  return sp;
}

function parentDirection(spec: ObjectSpec | undefined): 'row' | 'column' {
  if (spec && spec.kind === 'group' && spec.layout) {
    return spec.layout.direction === 'row' ? 'row' : 'column';
  }
  return 'column';
}

export function solveDocLayout(doc: SceneDoc, measure: MeasureFn): LayoutMap {
  const map: LayoutMap = new Map();

  // Build parent map once (used to detect nested pages).
  const parentMap = new Map<string, string>();
  for (const [id, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group') {
      for (const cid of (spec as GroupSpec).children) parentMap.set(cid, id);
    }
  }
  const isPage = (id: string): boolean => {
    const s = doc.objects[id] as any;
    return s?.kind === 'group' && !!s.page;
  };
  // A page is "nested" if any ancestor is also a page → solved within parent's tree.
  const isNestedPage = (id: string): boolean => {
    let cur = parentMap.get(id);
    while (cur) {
      if (isPage(cur)) return true;
      cur = parentMap.get(cur);
    }
    return false;
  };

  for (const [id, spec] of Object.entries(doc.objects)) {
    if (spec.kind !== 'group' || !spec.page || !spec.layout || !spec.size) continue;
    if (isNestedPage(id)) continue; // nested pages are part of ancestor solve tree
    solvePage(id, spec, doc, measure, map);
  }
  return map;
}

function solvePage(
  pageId: string,
  pageSpec: GroupSpec,
  doc: SceneDoc,
  measure: MeasureFn,
  map: LayoutMap,
): void {
  const pageSize = pageSpec.size!;
  const pageW = pageSize[0];
  const pageH = pageSize[1];

  taffy.clear();
  const taffyToObj = new Map<number, string>();
  const parentMap = new Map<number, number>();
  const objToParent = new Map<string, string | null>();

  function buildSpec(nodeSpec: ObjectSpec, parentTId: number | null, parentObjId: string | null): number {
    const isLayout = nodeSpec.kind === 'group' && !!(nodeSpec as GroupSpec).layout;
    objToParent.set(nodeSpec.id, parentObjId);

    let style: StyleProps;
    if (isLayout) {
      style = layoutSpecToProps((nodeSpec as GroupSpec).layout!);
      // Nested layout groups: apply item sizing if present
      const item = (nodeSpec as any).item;
      if (item && parentTId !== null) {
        if (typeof item.width === 'number') style.width = item.width;
        if (typeof item.height === 'number') style.height = item.height;
        if (item.flexGrow !== undefined) {
          style.flexGrow = item.flexGrow;
          // Flexible main-axis basis so grow works; cross-axis left for stretch
          const pDir = parentDirection(parentObjId ? doc.objects[parentObjId] : undefined);
          if (pDir === 'column' && typeof item.height !== 'number') {
            style.flexBasis = item.minHeight ?? 0;
          }
          if (pDir === 'row' && typeof item.width !== 'number') {
            style.flexBasis = item.minWidth ?? 0;
          }
        }
        if (item.flexShrink !== undefined) style.flexShrink = item.flexShrink;
        if (item.minWidth !== undefined) style.minWidth = item.minWidth;
        if (item.minHeight !== undefined) style.minHeight = item.minHeight;
        if (item.maxWidth !== undefined) style.maxWidth = item.maxWidth;
        if (item.maxHeight !== undefined) style.maxHeight = item.maxHeight;
      }
    } else {
      const parentSpec = parentObjId ? doc.objects[parentObjId] : undefined;
      const dir = parentDirection(parentSpec);
      const sz = measure(nodeSpec.id, nodeSpec);
      style = leafItem((nodeSpec as any).item, sz, dir, nodeSpec.kind);
    }

    if (parentTId === null) {
      style.width = pageW;
      style.height = pageH;
    }

    const nodeId = taffy.newNode(style);
    taffyToObj.set(nodeId, nodeSpec.id);

    if (parentTId !== null) {
      taffy.addChild(parentTId, nodeId);
      parentMap.set(nodeId, parentTId);
    }

    if (isLayout) {
      const grp = nodeSpec as GroupSpec;
      for (const childId of grp.children) {
        const childSpec = doc.objects[childId];
        if (childSpec) buildSpec(childSpec, nodeId, nodeSpec.id);
      }
    }

    return nodeId;
  }

  const rootTId = buildSpec(pageSpec, null, null);
  const results = taffy.computeLayout(rootTId, pageW, pageH);
  const resultById = new Map<number, typeof results[0]>();
  for (const r of results) resultById.set(r.id, r);

  // Taffy (x,y) is relative to parent border box. Sum chain → page-local.
  const pageLocalCache = new Map<number, { x: number; y: number }>();

  function pageLocalPos(tid: number): { x: number; y: number } {
    const cached = pageLocalCache.get(tid);
    if (cached) return cached;
    const r = resultById.get(tid);
    if (!r) return { x: 0, y: 0 };
    const pTId = parentMap.get(tid);
    if (pTId === undefined) {
      const pos = { x: r.x, y: r.y };
      pageLocalCache.set(tid, pos);
      return pos;
    }
    const p = pageLocalPos(pTId);
    const pos = { x: p.x + r.x, y: p.y + r.y };
    pageLocalCache.set(tid, pos);
    return pos;
  }

  for (const r of results) {
    const objId = taffyToObj.get(r.id);
    if (!objId) continue;
    const pos = pageLocalPos(r.id);
    map.set(objId, { x: pos.x, y: pos.y, w: r.width, h: r.height });
  }
}
