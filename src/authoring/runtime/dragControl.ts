// ── Drag & hit-testing (split from runtime.ts, sprint-v2 Phase 0.1) ──────────
// Pointer hit-testing and drag handling for pages, items, island handles and
// the cinematic HUD. Behavior-identical extraction: the former SceneRuntime
// methods now take a DragHost (which SceneRuntime satisfies structurally).

import type { ObjectSpec, SceneDoc, Vec2 } from '../ir/types';
import type { FrameState } from './timeline';
import { getIsland } from '../islands/registry';
import type { LayoutMap } from '../layout/solve';
import { tw } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';
import type { ChromeController } from './chrome';
import type { CinematicHud } from './cinematicHud';
import { hudWorldToScreen, type HudPeelState } from './hudWorld';
import { resolveIslandParams, type DragState } from './shared';

export interface DragHost {
  font: FontFace;
  showChrome: boolean;
  cinematic: boolean;
  playing: boolean;
  tourT: number;
  chrome: ChromeController;
  cinematicHud: CinematicHud | null;
  grabbed: DragState;
  hoveredHandle: string | null;
  hudPeel: HudPeelState | null;
  lastView: { zoom: number; left: number; right: number; top: number; bottom: number } | null;
  liveParams: Map<string, any>;
  paramVersion: number;
  livePageSize: Map<string, Vec2>;
  liveItemWH: Map<string, { w: number; h: number }>;
  layoutMap: LayoutMap;
  getDoc(): SceneDoc;
  totalDuration(): number;
  frameState(t: number): FrameState;
  ensureLayout(): void;
  invalidateLayout(): void;
  findPageParent(id: string): string | null;
  isNestedPage(id: string): boolean;
}

export function islandDefaultSize(islandId: string): { w: number; h: number } {
  try { const d = getIsland(islandId); return d.defaultSize ? { w: d.defaultSize[0], h: d.defaultSize[1] } : { w: 480, h: 360 }; }
  catch { return { w: 480, h: 360 }; }
}

/** Recursively compute the minimum content footprint of a page (padding + children's
 *  minimum sizes in the primary axis), so the drag handle can't shrink past it. */
export function pageContentMin(host: DragHost, pageId: string): { w: number; h: number } {
  const doc = host.getDoc();
  const spec = doc.objects[pageId] as any;
  if (!spec || spec.kind !== 'group' || !spec.layout) return { w: 80, h: 60 };
  const layout = spec.layout;
  const dir: 'row' | 'column' = layout.direction ?? 'column';
  const gap = layout.gap ?? 0;
  const padding = layout.padding ?? 0;
  const padT = typeof padding === 'number' ? padding : (padding[0] ?? 0);
  const padB = typeof padding === 'number' ? padding : (padding[2] ?? padding[0] ?? 0);
  const padL = typeof padding === 'number' ? padding : (padding[3] ?? padding[1] ?? padding[0] ?? 0);
  const padR = typeof padding === 'number' ? padding : (padding[1] ?? padding[0] ?? 0);
  const children = (spec.children as string[]) ?? [];
  if (children.length === 0) return { w: padL + padR + 40, h: padT + padB + 40 };

  let main = 0;
  let cross = 0;
  let count = 0;
  for (const cid of children) {
    const cSpec = doc.objects[cid] as any;
    if (!cSpec) continue;
    const item = cSpec.item;
    let cw = 0, ch = 0;

    if (cSpec.kind === 'group' && cSpec.layout) {
      // Nested layout (including sub-page): recurse.
      const sub = pageContentMin(host, cid);
      cw = sub.w; ch = sub.h;
    } else if (cSpec.kind === 'text') {
      const sz = cSpec.size ?? 14;
      cw = Math.min(tw(cSpec.content, host.font, sz), (item?.maxWidth as number | undefined) ?? Infinity);
      ch = sz * 1.25;
    } else if (cSpec.kind === 'rect') {
      cw = (cSpec.size?.[0] ?? 40);
      ch = (cSpec.size?.[1] ?? 40);
    } else if (cSpec.kind === 'island') {
      const islSize = islandDefaultSize(cSpec.island);
      cw = islSize.w; ch = islSize.h;
    } else {
      cw = 60; ch = 40;
    }

    // Item sizing overrides / mins
    if (typeof item?.width === 'number') cw = item.width;
    if (typeof item?.height === 'number') ch = item.height;
    if (typeof item?.minWidth === 'number') cw = Math.max(cw, item.minWidth);
    if (typeof item?.minHeight === 'number') ch = Math.max(ch, item.minHeight);
    if (typeof item?.maxWidth === 'number') cw = Math.min(cw, item.maxWidth);
    if (typeof item?.maxHeight === 'number') ch = Math.min(ch, item.maxHeight);

    if (dir === 'row') { main += cw; cross = Math.max(cross, ch); }
    else               { main += ch; cross = Math.max(cross, cw); }
    count++;
  }
  main += (count - 1) * gap;
  if (dir === 'row') return { w: padL + main + padR, h: padT + cross + padB };
  return { w: padL + cross + padR, h: padT + main + padB };
}

/** Island world transform (matches emitObjectAt). */
export function islandWorldTransform(host: DragHost, oid: string, box: { x: number; y: number; w: number; h: number }): { origin: Vec2; scale: number } | null {
  const spec = host.getDoc().objects[oid] as any;
  if (!spec || spec.kind !== 'island') return null;
  const def = getIsland(spec.island);
  const defW = def.defaultSize?.[0] ?? 480;
  const defH = def.defaultSize?.[1] ?? 360;
  const fill = spec.item?.fill === true;
  const scale = fill ? Math.min(box.w / defW, box.h / defH) : 1;
  return { origin: [box.x + (box.w - defW * scale) / 2, box.y + (box.h - defH * scale) / 2], scale };
}

/** World box for any object under a page layout (page-local coords → world) */
export function layoutWorldBox(host: DragHost, oid: string): { x: number; y: number; w: number; h: number } | null {
  host.ensureLayout();
  const local = host.layoutMap.get(oid);
  if (!local) return null;
  const pageId = host.findPageParent(oid);
  if (!pageId) return null;
  const pageSpec = host.getDoc().objects[pageId] as any;
  const isSafe = !!pageSpec.page?.safe;
  const pageW = (host.livePageSize.get(pageId) ?? pageSpec.size)?.[0] ?? 1260;
  const pageH = (host.livePageSize.get(pageId) ?? pageSpec.size)?.[1] ?? 820;
  // Layout boxes are already top-page-local — do not add the page's own layout box.
  const ox = isSafe ? pageSpec.at[0] - pageW / 2 : pageSpec.at[0];
  const oy = isSafe ? pageSpec.at[1] - pageH / 2 : pageSpec.at[1];
  return { x: ox + local.x, y: oy + local.y, w: local.w, h: local.h };
}

export function buildWorldBoxes(host: DragHost): Map<string, { x: number; y: number; w: number; h: number }> {
  host.ensureLayout();
  const doc = host.getDoc();
  const boxMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  // Walk all objects that have a layout position
  const pageIds = new Set<string>();
  for (const [id, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group' && (spec as any).page) pageIds.add(id);
  }
  for (const [oid] of Object.entries(doc.objects)) {
    const wb = layoutWorldBox(host, oid);
    if (wb) boxMap.set(oid, wb);
  }
  // For pages themselves, also add from livePageSize
  for (const pid of pageIds) {
    if (!boxMap.has(pid)) {
      const pageSpec = doc.objects[pid] as any;
      const isSafe = !!pageSpec.page?.safe;
      const w = (host.livePageSize.get(pid) ?? pageSpec.size)?.[0] ?? 1260;
      const h = (host.livePageSize.get(pid) ?? pageSpec.size)?.[1] ?? 820;
      const ox = isSafe ? pageSpec.at[0] - w / 2 : pageSpec.at[0];
      const oy = isSafe ? pageSpec.at[1] - h / 2 : pageSpec.at[1];
      boxMap.set(pid, { x: ox, y: oy, w, h });
    }
  }
  return boxMap;
}

/** Current evaluated `hudDetach` (0 = screen overlay, 1 = world card). */
export function currentHudDetach(host: DragHost): number {
  if (!host.cinematic) return 0;
  // Always use tourT — paused mid-chapter must keep the in-card hit path.
  return host.frameState(host.tourT).params.get('hudDetach') ?? 0;
}

/** Map a world point into HUD-local virtual px for hit-testing: through the
 *  world-card transform while detached (so the in-card timeline stays live and
 *  scrubbable, even mid-dive), else through the screen projection. */
export function hudPoint(host: DragHost, wx: number, wy: number): [number, number] | null {
  if (!host.cinematicHud) return null;
  if (currentHudDetach(host) > 0.5 && host.hudPeel) {
    return hudWorldToScreen(wx, wy, host.hudPeel);
  }
  return host.cinematicHud.worldToScreen(wx, wy);
}

export function tryBeginDrag(host: DragHost, wx: number, wy: number, scale: number): boolean {
  // Chrome panel clicks first — consume without starting a drag.
  if (host.showChrome && host.lastView && host.chrome.handleClick(wx, wy, host.lastView)) {
    return true;
  }
  // Cinematic HUD (controls + scrubber): screen-space while attached, world-space
  // (inverse card transform) while detached — so it stays interactive in the card.
  if (host.cinematicHud) {
    const pt = hudPoint(host, wx, wy);
    if (pt && host.cinematicHud.pointerDownScreen(pt[0], pt[1])) { host.grabbed = { kind: 'hud' }; return true; }
  }
  const r = Math.max(12, 18 / Math.max(scale, 0.05));
  const doc = host.getDoc();
  const boxMap = buildWorldBoxes(host);

  // 1) Item resize handles — most specific, try first
  for (const [oid, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group') continue;
    const box = boxMap.get(oid);
    if (!box) continue;
    const item = (spec as any).item;
    if (!item?.resizable) continue;
    const sx = box.x + box.w, sy = box.y + box.h;
    if (Math.hypot(wx - sx, wy - sy) <= r) {
      host.grabbed = { kind: 'item', id: oid, startWx: wx, startWy: wy, startW: box.w, startH: box.h };
      return true;
    }
  }

  // 2) Page resize handles (SE corner) — top-level & nested
  for (const [oid, spec] of Object.entries(doc.objects)) {
    if (spec.kind !== 'group' || !(spec as any).page?.resizable) continue;
    const box = boxMap.get(oid);
    if (!box) continue;
    const sx = box.x + box.w, sy = box.y + box.h;
    if (Math.hypot(wx - sx, wy - sy) <= r) {
      // Start size = current rendered size (works for both top-level & nested).
      host.grabbed = { kind: 'page', id: oid, startWx: wx, startWy: wy, startSize: [box.w, box.h] };
      return true;
    }
  }

  // 3) Island handles (use layout position if available, else spec.at)
  const objMap = doc.objects as Record<string, ObjectSpec>;
  const t = host.playing ? host.tourT : host.totalDuration();
  const fs = host.frameState(t);
  for (const [oid, spec] of Object.entries(objMap)) {
    if (spec.kind !== 'island') continue;
    const s = spec;
    const def = getIsland(s.island);
    if (!def.handles) continue;
    const params = resolveIslandParams(def, s.params ?? {}, fs);
    // Compute island world origin from layout if available
    const layoutBox = boxMap.get(oid);
    const tf = layoutBox ? islandWorldTransform(host, oid, layoutBox) : null;
    const origin: Vec2 = tf ? tf.origin : (s.at as Vec2);
    const iscale = tf ? tf.scale : 1;
    for (const hDef of def.handles) {
      const lp = hDef.at(params);
      const hPos: Vec2 = [origin[0] + lp[0] * iscale, origin[1] + lp[1] * iscale];
      if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
        host.grabbed = { kind: 'island', islandId: s.island, instId: oid, handleName: hDef.param };
        return true;
      }
    }
  }
  return false;
}

export function dragTo(host: DragHost, wx: number, wy: number) {
  if (!host.grabbed) return;
  const g = host.grabbed;

  if (g.kind === 'hud') {
    if (host.cinematicHud) { const pt = hudPoint(host, wx, wy); if (pt) host.cinematicHud.dragToScreen(pt[0]); }
    return;
  }

  if (g.kind === 'page') {
    const spec = host.getDoc().objects[g.id] as any;
    if (!spec) return;
    const declaredMin = spec.page?.minSize ?? [200, 150];
    const contentMin = pageContentMin(host, g.id);
    const minSize: Vec2 = [Math.max(declaredMin[0], contentMin.w), Math.max(declaredMin[1], contentMin.h)];
    const maxSize = spec.page?.maxSize ?? [3000, 2000];
    const newW = Math.max(minSize[0], Math.min(maxSize[0], g.startSize[0] + (wx - g.startWx)));
    const newH = Math.max(minSize[1], Math.min(maxSize[1], g.startSize[1] + (wy - g.startWy)));
    if (host.isNestedPage(g.id)) {
      // Nested page: pin via the parent's flex slot (item), so siblings reflow.
      host.liveItemWH.set(g.id, { w: newW, h: newH });
    } else {
      // Top-level page: drive size directly.
      spec.size = [newW, newH];
      host.livePageSize.set(g.id, [newW, newH]);
    }
    host.invalidateLayout();
    host.ensureLayout();
    return;
  }

  if (g.kind === 'item') {
    const spec = host.getDoc().objects[g.id] as any;
    if (!spec) return;
    const newW = Math.max(60, Math.min(2000, g.startW + (wx - g.startWx)));
    const newH = Math.max(40, Math.min(2000, g.startH + (wy - g.startWy)));
    host.liveItemWH.set(g.id, { w: newW, h: newH });
    host.invalidateLayout();
    host.ensureLayout();
    return;
  }

  if (g.kind === 'island') {
    const { instId, handleName } = g;
    const doc = host.getDoc();
    const spec = doc.objects[instId] as any;
    if (!spec) return;
    const def = getIsland(spec.island);
    if (!def.handles) return;
    const t = host.playing ? host.tourT : host.totalDuration();
    const fs = host.frameState(t);
    const params = resolveIslandParams(def, spec.params ?? {}, fs);
    // Compute handle origin from layout if available
    const boxMap = buildWorldBoxes(host);
    const layoutBox = boxMap.get(instId);
    const tf = layoutBox ? islandWorldTransform(host, instId, layoutBox) : null;
    const origin: Vec2 = tf ? tf.origin : (spec.at as Vec2);
    const iscale = tf ? tf.scale : 1;
    for (const hDef of def.handles) {
      if (hDef.param === handleName) {
        const relPos: Vec2 = [(wx - origin[0]) / iscale, (wy - origin[1]) / iscale];
        hDef.set(params, relPos);
        const ov = spec.params?.[handleName];
        if (ov && typeof ov === 'object' && (ov as any).$param) {
          host.liveParams.set((ov as any).$param, params[handleName]);
        } else {
          if (!spec.params) spec.params = {};
          spec.params[handleName] = params[handleName].slice ? [...params[handleName]] : params[handleName];
        }
        host.paramVersion++;   // island geometry depends on the written value
        break;
      }
    }
  }
}

export function endDrag(host: DragHost) { host.grabbed = null; host.cinematicHud?.endDrag(); }

/** True if the screen-space point lands on a cinematic HUD control (used by the
 *  demo to avoid stopping the tour when the user presses a control). */
export function isHudControlScreen(host: DragHost, sx: number, sy: number): boolean {
  return !!(host.cinematicHud && host.cinematicHud.hitScreen(sx, sy));
}

export function updateHover(host: DragHost, wx: number, wy: number, scale: number): boolean {
  host.hoveredHandle = null;
  if (host.cinematicHud) { const pt = hudPoint(host, wx, wy); if (pt && host.cinematicHud.hoverScreen(pt[0], pt[1])) return true; }
  const r = Math.max(12, 18 / Math.max(scale, 0.05));
  const doc = host.getDoc();
  const boxMap = buildWorldBoxes(host);
  // Check item resize handles first (most specific)
  for (const [oid, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group') continue;
    const box = boxMap.get(oid);
    if (!box) continue;
    if (!(spec as any).item?.resizable) continue;
    if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
  }
  // Check page resize handles
  for (const [oid, spec] of Object.entries(doc.objects)) {
    if (spec.kind !== 'group' || !(spec as any).page?.resizable) continue;
    const box = boxMap.get(oid);
    if (!box) continue;
    if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
  }
  for (const [oid, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group') continue;
    const box = boxMap.get(oid);
    if (!box) continue;
    if (!(spec as any).item?.resizable) continue;
    if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
  }
  // Check island handles (uses layout box if available)
  const objMap = doc.objects as Record<string, ObjectSpec>;
  const t = host.playing ? host.tourT : host.totalDuration();
  const fs = host.frameState(t);
  for (const [oid, spec] of Object.entries(objMap)) {
    if (spec.kind !== 'island') continue;
    const s = spec;
    const def = getIsland(s.island);
    if (!def.handles) continue;
    const params = resolveIslandParams(def, s.params ?? {}, fs);
    const layoutBox = boxMap.get(oid);
    const tf = layoutBox ? islandWorldTransform(host, oid, layoutBox) : null;
    const origin: Vec2 = tf ? tf.origin : (s.at as Vec2);
    const iscale = tf ? tf.scale : 1;
    for (const hDef of def.handles) {
      const lp = hDef.at(params);
      const hPos: Vec2 = [origin[0] + lp[0] * iscale, origin[1] + lp[1] * iscale];
      if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
        host.hoveredHandle = hDef.param;
        return true;
      }
    }
  }
  return false;
}
