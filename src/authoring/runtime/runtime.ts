// ── SceneRuntime — implements s.interactive contract ─────────────────────────
// Owns a SceneDoc, evaluates timeline, drives camera, emits into the pipeline.

import type { SceneDoc, ObjectSpec, Vec2, Color, ParamValue, ParamRef, GroupSpec } from '../ir/types';
import { evalScene, docDuration, chapterWindows, type ObjFrame, type FrameState, type ChapterWindow } from './timeline';
import { poseAt, type CameraPose } from './camera';
import { DrawHelpers, type DrawCtx, type EmitBuffers } from '../islands/draw';
import { getIsland, type IslandDef, type IslandEmitCtx, type IslandTime } from '../islands/registry';
import { EmitCache } from '../../windfoil/emitCache';
import { enter3D } from '../../camera/camera';
import { orbitDistForZoom, orbitSetPose, updateOrbit, disableOrbit } from '../../camera/orbit';
import { glyphQuads } from '../../windfoil/font';
import { fillQuads, strokeInto, polygonQuads, type Pt } from '../../windgraph/stroke/stroke';
import { tw, layoutStr } from '../../layout/metrics';
import { MathTex } from '../../windgraph/math/mathtex';
import type { AppState } from '../../state';
import { solveDocLayout, ensureTaffy, type LayoutMap, type Box } from '../layout/solve';
import { makeMeasureFn, wrapText, type MeasureFn } from '../layout/measure';
import { ChromeController } from './chrome';
import { CinematicHud } from './cinematicHud';

type DragState = 
  | { kind: 'island'; islandId: string; instId: string; handleName: string }
  | { kind: 'page'; id: string; startWx: number; startWy: number; startSize: Vec2 }
  | { kind: 'item'; id: string; startWx: number; startWy: number; startW: number; startH: number }
  | { kind: 'hud' }
  | null;

const SEC_W = 1260, SEC_H = 820;
const TOTAL_W = 14500, TOTAL_H = 5200;

export class SceneRuntime {
  x0 = -900; y0 = -2200; width = TOTAL_W; height = TOTAL_H;
  playing = false; tourT = 0;
  private lastNow = -1;
  private font: any; private atlas: any;
  private doc: SceneDoc;
  private caches: Map<string, EmitCache> = new Map();
  private texCache: Map<string, MathTex> = new Map();
  private liveParams: Map<string, any> = new Map();
  private grabbed: DragState = null;
  private hoveredHandle: string | null = null;
  private lastView: { zoom: number; left: number; right: number; top: number; bottom: number } | null = null;
  private childToChapter = new Map<string, string>();  // child object id → chapter group id
  /** Designer chrome (object tree / inspector / clip timeline). Off for cinematic tours. */
  showChrome = false;
  /** Cinematic tour mode: world-space grid + a DOM-free screen-space HUD overlay
   *  (letterbox + sleek timeline + controls + caption) drawn by frame.ts. */
  cinematic = false;
  get dragging() { return this.grabbed !== null; }

  // ── Layout state ───────────────────────────────────────────────────────
  private layoutMap: LayoutMap = new Map();
  private layoutDirty = true;
  private measure: MeasureFn;
  private layoutReady = false;
  private livePageSize = new Map<string, Vec2>();
  private liveItemWH = new Map<string, { w: number; h: number }>();
  chrome: ChromeController;
  /** DOM-free cinematic HUD (letterbox + scrubber + controls + caption). */
  cinematicHud: CinematicHud | null = null;
  // Screen-space overlay buffers (filled each frame when `cinematic`); frame.ts
  // uploads + draws them with a screen-ortho matrix in the same pass.
  hudInst: number[] = []; hudCrv: number[] = []; hudRws: number[] = [];
  hudInstFA = new Float32Array(0); hudCrvFA = new Float32Array(0); hudRwsUA = new Uint32Array(0);
  hudInstLen = 0; hudCrvLen = 0; hudRwsLen = 0; hudCount = 0;
  private _s: AppState | null = null;

  constructor(doc: SceneDoc, ctx: { font: any; atlas: any }) {
    this.doc = doc;
    this.font = ctx.font; this.atlas = ctx.atlas;
    this.measure = makeMeasureFn(ctx.font);
    this.chrome = new ChromeController(this);
    for (const [k, p] of Object.entries(doc.params)) this.liveParams.set(k, p.default);
    for (const [id, spec] of Object.entries(doc.objects)) {
      if (spec.kind === 'group' && spec.chapter) {
        this.caches.set(id, new EmitCache());
        for (const cid of spec.children) this.childToChapter.set(cid, id);
      }
    }
    // Kick off Taffy init; layout will be solved on first emit
    ensureTaffy().then(() => {
      this.layoutReady = true;
      this.invalidateLayout();
    }).catch((e) => {
      console.error('[pages] Taffy WASM FAILED to load:', e);
    });
  }

  private invalidateLayout() { this.layoutDirty = true; }

  /**
   * Two-pass layout:
   *  1) Solve with intrinsic measures (text as single-line).
   *  2) Re-measure text that got a narrower assigned width (wrap height).
   *  3) Re-solve so siblings reflow below taller wrapped text.
   */
  private ensureLayout(): void {
    if (!this.layoutDirty || !this.layoutReady) return;

    // Apply live page sizes into the doc for the solver
    const restorePages: { id: string; size: Vec2 }[] = [];
    for (const [id, size] of this.livePageSize) {
      const spec = this.doc.objects[id] as any;
      if (spec?.size) {
        restorePages.push({ id, size: spec.size.slice() as Vec2 });
        spec.size = size.slice();
      }
    }

    // For items with live resize (blue handle), set fixed width/height and
    // remove flexGrow so the layout solver uses the explicit size.
    const restoreItems: { id: string; item: any }[] = [];
    for (const [id, wh] of this.liveItemWH) {
      const spec = this.doc.objects[id] as any;
      if (spec) {
        restoreItems.push({ id, item: spec.item });
        spec.item = { width: wh.w, height: wh.h, flexGrow: 0, flexShrink: 0 };
      }
    }

    // Live measure for wrapped text (pass 2)
    const wrapH = new Map<string, number>();

    const makeLiveMeasure = (): MeasureFn => (id, spec) => {
      if (spec.kind === 'text' && wrapH.has(id)) {
        const base = this.measure(id, spec);
        return { w: base.w, h: wrapH.get(id)! };
      }
      return this.measure(id, spec);
    };

    // Pass 1
    this.layoutMap = solveDocLayout(this.doc, makeLiveMeasure());

    // Detect text that needs wrapping based on assigned width
    let needsSecondPass = false;
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind !== 'text') continue;
      const box = this.layoutMap.get(oid);
      if (!box || box.w <= 0) continue;
      const fullW = tw(spec.content, this.font, spec.size);
      if (box.w + 0.5 < fullW) {
        const lines = wrapText(spec.content, this.font, spec.size, box.w);
        const h = Math.max(spec.size * 1.25, lines.length * spec.size * 1.25);
        wrapH.set(oid, h);
        if (Math.abs(h - box.h) > 0.5) needsSecondPass = true;
      }
    }

    // Pass 2 — reflow with wrapped heights
    if (needsSecondPass) {
      this.layoutMap = solveDocLayout(this.doc, makeLiveMeasure());
    }

    // Restore page sizes on the doc (live sizes stay in livePageSize)
    for (const { id, size } of restorePages) {
      const spec = this.doc.objects[id] as any;
      if (spec) spec.size = size;
    }
    // Restore item props (live item sizes stay in liveItemWH; next re-solve re-applies)
    for (const { id, item } of restoreItems) {
      const spec = this.doc.objects[id] as any;
      if (spec) spec.item = item;
    }
    this.layoutDirty = false;
  }

  setParam(name: string, value: any) { this.liveParams.set(name, value); }
  getDoc(): SceneDoc { return this.doc; }
  chapterWindows(): ChapterWindow[] { return chapterWindows(this.doc); }
  totalDuration(): number { return docDuration(this.doc); }

  // ── Per-frame emit ──────────────────────────────────────────────────────
  emit(font: any, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }) {
    this.lastView = view;
    const ctx: DrawCtx = { font, atlas, buff: { inst, crv, rws } };
    const draw = new DrawHelpers(ctx);
    const t = this.tourT;
    const fs = evalScene(this.doc, t, this.liveParams);
    const objMap = this.doc.objects as Record<string, ObjectSpec>;

    // Ensure layout is solved
    this.ensureLayout();

    if (this.cinematic) this.drawGrid(draw);

// Draw page backgrounds (page groups — top-level AND nested)
    const margin = 160 / Math.max(view.zoom, 0.05);
    const laidOutIds = new Set(this.layoutMap.keys());
    const drawnPageBoxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
    for (const [id, spec] of Object.entries(objMap)) {
      if (spec.kind !== 'group' || !(spec as any).page) continue;
      let wBox: { x: number; y: number; w: number; h: number };
      if (this.isNestedPage(id)) {
        // Nested page: position/size come from the parent's layout tree.
        const topPage = this.findPageParent(id)!;
        const tp = objMap[topPage] as any;
        const local = this.layoutMap.get(id);
        if (!local) continue;
        wBox = { x: tp.at[0] + local.x, y: tp.at[1] + local.y, w: local.w, h: local.h };
      } else {
        // Top-level page: at + livePageSize (or declared size).
        const live = this.livePageSize.get(id);
        const pw = live?.[0] ?? (spec as any).size?.[0] ?? 1260;
        const ph = live?.[1] ?? (spec as any).size?.[1] ?? 820;
        wBox = { x: (spec as any).at[0], y: (spec as any).at[1], w: pw, h: ph };
      }
      if (wBox.x - margin > (view.right ?? 1e12) || wBox.x + wBox.w + margin < (view.left ?? -1e12) ||
          wBox.y - margin > (view.bottom ?? 1e12) || wBox.y + wBox.h + margin < (view.top ?? -1e11)) continue;
      // Nested page cards get a subtle inset so stacking reads visually.
      const isNested = this.isNestedPage(id);
      const fill = isNested ? [0.145, 0.15, 0.175, 1] : [0.10, 0.105, 0.12, 1];
      const stroke = isNested ? [0.32, 0.33, 0.38, 1] : [0.25, 0.26, 0.30, 1];
      draw.rect(wBox.x, wBox.y, wBox.x + wBox.w, wBox.y + wBox.h, fill);
      draw.rectStroke(wBox.x, wBox.y, wBox.x + wBox.w, wBox.y + wBox.h, stroke, isNested ? 1.0 : 1.3);
      drawnPageBoxes.push({ id, ...wBox });
    }
    // Draw resize handles for pages and items
    const hRadius = Math.max(6, 10 / Math.max(view.zoom, 0.05));
    const isGrabbed = (id: string) => this.grabbed?.kind === 'page' && this.grabbed.id === id;
    const isHovered = (id: string) => false; // simple hover state for pages/items
    for (const pb of drawnPageBoxes) {
      const spec = objMap[pb.id] as any;
      if (!spec.page?.resizable) continue;
      const sx = pb.x + pb.w, sy = pb.y + pb.h;
      draw.fillCircle(sx, sy, hRadius, isGrabbed(pb.id) ? [0.97, 0.73, 0.33, 1] : [0.30, 0.80, 0.40, 1]);
      draw.strokeCircle(sx, sy, hRadius * 1.5, isGrabbed(pb.id) ? [0.97, 0.73, 0.33, 1] : [0.30, 0.80, 0.40, 1], 2);
    }
    // Item resize handles (drawn after island emits in the layout section; add here too)
    for (const [oid, oSpec] of Object.entries(objMap)) {
      if (oSpec.kind === 'group') continue;
      const itemBox = this.layoutMap.get(oid);
      if (!itemBox) continue;
      const item = (oSpec as any).item;
      if (!item?.resizable) continue;
      const pageParent = this.findPageParent(oid);
      if (!pageParent) continue;
      const pp = objMap[pageParent] as any;
      const sx = pp.at[0] + itemBox.x + itemBox.w;
      const sy = pp.at[1] + itemBox.y + itemBox.h;
      draw.fillCircle(sx, sy, hRadius, [0.12, 0.60, 0.95, 1]);
      draw.strokeCircle(sx, sy, hRadius * 1.5, [0.12, 0.60, 0.95, 1], 2);
    }

    // Build visible chapter set (for explainer-style scenes — skip for page-based)
    const visibleChapters = new Set<string>();
    for (const [id, spec] of Object.entries(objMap)) {
      if (spec.kind === 'group' && spec.chapter && spec.size) {
        const g = spec;
        const sz = g.size!;
        const chAt = g.at;
        if (chAt[0] - margin <= (view.right ?? 1e12) && chAt[0] + sz[0] + margin >= (view.left ?? -1e12) &&
            chAt[1] - margin <= (view.bottom ?? 1e12) && chAt[1] + sz[1] + margin >= (view.top ?? -1e12)) {
          visibleChapters.add(id);
        }
      }
    }
    if (fs.currentChapterId) visibleChapters.add(fs.currentChapterId);

    for (const [oid, spec] of Object.entries(objMap)) {
      if (spec.kind === 'group') continue;
      // Use layout position if available
      const layoutBox = laidOutIds.has(oid) ? this.layoutMap.get(oid) : null;
      if (layoutBox) {
        // Find the page this object belongs to — skip chapter culling
        const parentPage = this.findPageParent(oid);
        if (!parentPage) continue;
        const pageSpec = objMap[parentPage] as any;
        const worldX = pageSpec.at[0] + layoutBox.x;
        const worldY = pageSpec.at[1] + layoutBox.y;
        const frame = fs.objects.get(oid);
        if (!frame || !frame.visible) continue;
        const chAlpha = parentPage ? 1 : 1;
        const effOp = frame.opacityMult * chAlpha;
        if (effOp <= 0.001) continue;
        this.emitObjectAt(oid, spec, frame, draw, fs, ctx.buff, view, now, effOp, worldX, worldY, layoutBox.w, layoutBox.h);
        continue;
      }

      // Legacy chapter path — neighbors keep drawing (like original explainer cache)
      const chId = this.childToChapter.get(oid);
      if (chId && !visibleChapters.has(chId)) continue;
      const chAlpha = chId ? (fs.chapters.get(chId)?.alpha ?? 0) : 1;
      if (chAlpha <= 0.02) continue;
      const frame = fs.objects.get(oid);
      if (!frame) continue;
      if (!frame.visible) continue;
      // Current chapter full opacity; neighbors fade with chapter alpha
      const isCurrent = !chId || chId === fs.currentChapterId;
      const effOp = frame.opacityMult * (isCurrent ? chAlpha : Math.min(chAlpha, 0.55));
      if (effOp <= 0.001) continue;

      this.emitObject(oid, spec, frame, draw, fs, ctx.buff, view, now, effOp);
    }
    if (this.showChrome) this.chrome.emit(draw, view, now);
    draw.setOrigin(0, 0);

    // Cinematic screen-space HUD overlay: built into its own buffers (screen px),
    // then frame.ts draws them with a screen-ortho matrix in this same pass.
    if (this.cinematic && this.cinematicHud && this._s) {
      const chapters = this.chapterWindows();
      const activeIdx = fs.currentChapterId ? chapters.findIndex((c) => c.id === fs.currentChapterId) : -1;
      // Seed the overlay's curve/row buffers with the atlas base tables so the
      // glyph band indices emitted by layoutStr resolve (rects then append after
      // them with correct offsets). Without this, overlay text renders blank.
      const bs = this._s as any;
      this.hudInst.length = 0;
      const bcl = bs.baseCrvLen ?? 0;
      this.hudCrv.length = bcl;
      for (let i = 0; i < bcl; i++) this.hudCrv[i] = bs.baseCrv[i];
      const brl = bs.baseRwsLen ?? 0;
      this.hudRws.length = brl;
      for (let i = 0; i < brl; i++) this.hudRws[i] = bs.baseRws[i];
      this.cinematicHud.build(this.font, this.atlas, now, this._s.tCanvas.width, this._s.tCanvas.height,
        { t, total: this.totalDuration(), playing: this.playing, chapters, activeIdx },
        { inst: this.hudInst, crv: this.hudCrv, rws: this.hudRws });
      this.hudCount = this.hudInst.length / 16;
      if (this.hudInst.length > this.hudInstFA.length) this.hudInstFA = new Float32Array(this.hudInst.length * 2);
      this.hudInstFA.set(this.hudInst); this.hudInstLen = this.hudInst.length;
      if (this.hudCrv.length > this.hudCrvFA.length) this.hudCrvFA = new Float32Array(this.hudCrv.length * 2);
      this.hudCrvFA.set(this.hudCrv); this.hudCrvLen = this.hudCrv.length;
      if (this.hudRws.length > this.hudRwsUA.length) this.hudRwsUA = new Uint32Array(this.hudRws.length * 2);
      this.hudRwsUA.set(this.hudRws); this.hudRwsLen = this.hudRws.length;
    } else {
      this.hudCount = 0;
    }
  }

  private drawGrid(draw: DrawHelpers) {
    // World-space background grid over the board bounds (matches the original
    // explainer). Bounded by x0/y0/width/height so it stays cheap in 3D too.
    const step = 260;
    const border = [0.25, 0.26, 0.30, 1];
    const left = Math.floor(this.x0 / step) * step, right = this.x0 + this.width;
    const top = Math.floor(this.y0 / step) * step, bottom = this.y0 + this.height;
    for (let x = left; x <= right; x += step) {
      const M = x % (step * 4) === 0, w = M ? 1.4 : 0.8;
      draw.rect(x - w / 2, top, x + w / 2, bottom, border, M ? 0.22 : 0.10);
    }
    for (let y = top; y <= bottom; y += step) {
      const M = y % (step * 4) === 0, w = M ? 1.4 : 0.8;
      draw.rect(left, y - w / 2, right, y + w / 2, border, M ? 0.22 : 0.10);
    }
  }

  private buildParentMap(): Map<string, string> {
    const pm = new Map<string, string>();
    for (const [pid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group') {
        for (const cid of (spec as GroupSpec).children) {
          pm.set(cid, pid);
        }
      }
    }
    return pm;
  }

  /** Returns the topmost page ancestor (or null if `id` is not under a page).
   *  For a child of a nested page, returns the outermost page (not the
   *  immediate one) so world coordinates are top-page-local. */
  private findPageParent(id: string): string | null {
    const pm = this.buildParentMap();
    let cur = id;
    const visited = new Set<string>();
    let lastPage: string | null = null;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const parent = pm.get(cur);
      if (!parent) break;
      const parentSpec = this.doc.objects[parent] as any;
      if (parentSpec?.page) lastPage = parent;
      cur = parent;
    }
    return lastPage;
  }

  /** True if `id` is itself a page nested inside another page. */
  private isNestedPage(id: string): boolean {
    const spec = this.doc.objects[id] as any;
    if (!spec?.page) return false;
    return this.findPageParent(id) !== null;
  }

  /** Recursively compute the minimum content footprint of a page (padding + children's
   *  minimum sizes in the primary axis), so the drag handle can't shrink past it. */
  private pageContentMin(pageId: string): { w: number; h: number } {
    const spec = this.doc.objects[pageId] as any;
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
      const cSpec = this.doc.objects[cid] as any;
      if (!cSpec) continue;
      const item = cSpec.item;
      let cw = 0, ch = 0;

      if (cSpec.kind === 'group' && cSpec.layout) {
        // Nested layout (including sub-page): recurse.
        const sub = this.pageContentMin(cid);
        cw = sub.w; ch = sub.h;
      } else if (cSpec.kind === 'text') {
        const sz = cSpec.size ?? 14;
        cw = Math.min(tw(cSpec.content, this.font, sz), (item?.maxWidth as number | undefined) ?? Infinity);
        ch = sz * 1.25;
      } else if (cSpec.kind === 'rect') {
        cw = (cSpec.size?.[0] ?? 40);
        ch = (cSpec.size?.[1] ?? 40);
      } else if (cSpec.kind === 'island') {
        const islSize = this.islandDefaultSize(cSpec.island);
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

  private islandDefaultSize(islandId: string): { w: number; h: number } {
    try { const d = getIsland(islandId); return d.defaultSize ? { w: d.defaultSize[0], h: d.defaultSize[1] } : { w: 480, h: 360 }; }
    catch { return { w: 480, h: 360 }; }
  }

  private emitGlow(spec: any, draw: DrawHelpers, x: number, y: number, w: number, h: number, _frame: any, op: number) {
    const gl = spec.item?.glow;
    if (!gl) return;
    const layers = typeof gl === 'object' ? (gl as any).layers ?? 3 : 3;
    const spread = typeof gl === 'object' ? (gl as any).spread ?? 18 : 18;
    const ga = typeof gl === 'object' ? (gl as any).alpha ?? 1 : 1;
    const color = spec.fill ?? spec.color ?? [1, 1, 1, 1];
    const effAlpha = op * ga;
    if (spec.kind === 'rect') {
      draw.glowRect(x, y, x + w, y + h, color, layers, spread, effAlpha);
    } else if (spec.kind === 'circle') {
      const r = spec.radius * (_frame.scaleX ?? 1);
      draw.glowCircle(x, y, r, color, layers, spread, effAlpha);
    }
  }

  private emitObjectAt(oid: string, spec: ObjectSpec, frame: ObjFrame, draw: DrawHelpers, fs: FrameState, buff: EmitBuffers, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number, op: number, worldX: number, worldY: number, boxW: number, boxH: number) {
    const alignMap = { left: 'start' as const, center: 'middle' as const, right: 'end' as const };
    switch (spec.kind) {
      case 'text': {
        const s = spec;
        const content = frame.chars > 0 ? s.content.slice(0, frame.chars) : s.content;
        if (!content) break;
        const fontSize = s.size * frame.scaleX;
        const textW = tw(content, this.font, fontSize);
        // Glow
        const gl = (spec as any).item?.glow;
        if (gl) {
          const layers = typeof gl === 'object' ? (gl as any).layers ?? 2 : 2;
          const spread = typeof gl === 'object' ? (gl as any).spread ?? 4 : 4;
          const ga = typeof gl === 'object' ? (gl as any).alpha ?? 1 : 1;
          draw.glowText(content, worldX + frame.dx, worldY + frame.dy, fontSize, s.color, layers, spread, op * ga);
        }
        // Use word-wrap if box is narrower than text
        if (boxW > 0 && boxW < textW) {
          draw.textBlock(content, worldX + frame.dx, worldY + frame.dy, fontSize, s.color, op, boxW);
        } else {
          draw.text(content, worldX + frame.dx, worldY + frame.dy, fontSize, s.color, op, s.align ? alignMap[s.align] : 'start');
        }
        break;
      }
      case 'glyph': {
        this.emitGlyph(spec.char, worldX + frame.dx, worldY + frame.dy, spec.size * frame.scaleX, spec.color, op, buff);
        break;
      }
      case 'rect': {
        const s = spec;
        const useW = (boxW > 0 ? boxW : s.size[0]) * frame.scaleX;
        const useH = (boxH > 0 ? boxH : s.size[1]) * frame.scaleY;
        this.emitGlow(spec, draw, worldX + frame.dx, worldY + frame.dy, useW, useH, frame, op);
        if (s.fill) draw.rect(worldX + frame.dx, worldY + frame.dy, worldX + frame.dx + useW, worldY + frame.dy + useH, s.fill, op * (s.fill?.[3] ?? 1));
        if (s.stroke) draw.rectStroke(worldX + frame.dx, worldY + frame.dy, worldX + frame.dx + useW, worldY + frame.dy + useH, s.stroke.color, s.stroke.width, op);
        break;
      }
      case 'circle': {
        const cx = spec.center[0] + frame.dx + worldX, cy = spec.center[1] + frame.dy + worldY;
        this.emitGlow(spec, draw, cx, cy, 0, 0, frame, op);
        if (spec.fill) draw.fillCircle(cx, cy, spec.radius * frame.scaleX, spec.fill, op);
        if (spec.stroke) draw.strokeCircle(cx, cy, spec.radius * frame.scaleX, spec.stroke.color, spec.stroke.width, op);
        break;
      }
      case 'polygon': {
        const pts = spec.points.map((p) => [p[0] + frame.dx + worldX, p[1] + frame.dy + worldY] as Pt);
        if (spec.fill) draw.fillPoly(pts, spec.fill, op * frame.reveal);
        if (spec.stroke) draw.line(pts, spec.stroke.color, spec.stroke.width, op);
        break;
      }
      case 'line': {
        let pts: Pt[] = spec.points.map((p) => [p[0] + frame.dx + worldX, p[1] + frame.dy + worldY] as Pt);
        if (frame.reveal < 1) pts = this.trimPolyline(pts, frame.reveal);
        draw.line(pts, spec.color, spec.width * frame.scaleX, op, spec.dash);
        break;
      }
      case 'math': {
        const s = spec;
        let tex = this.texCache.get(oid);
        if (!tex) { tex = new MathTex(s.latex); this.texCache.set(oid, tex); }
        tex.emit(this.atlas, buff.inst, buff.crv, buff.rws, {
          x: worldX + frame.dx, y: worldY + frame.dy,
          size: s.size * frame.scaleX, color: s.color, opacity: op, reveal: frame.reveal,
        });
        break;
      }
      case 'island': {
        const s = spec;
        const def = getIsland(s.island);
        const resolvedParams = this.resolveIslandParams(def, s.params ?? {}, fs);
        const defW = def.defaultSize?.[0] ?? 480;
        const defH = def.defaultSize?.[1] ?? 360;
        const fill = (s as any).item?.fill === true;
        // fill=true → scale content to fill the slot (reactive).
        // fill=false → keep intrinsic default size, centered in the slot (fixed).
        const scale = fill ? Math.min(boxW / defW, boxH / defH) : 1;
        const ox = worldX + (boxW - defW * scale) / 2;
        const oy = worldY + (boxH - defH * scale) / 2;
        draw.setTransform(ox, oy, scale, scale);
        const grabbedHandle = this.grabbed?.kind === 'island' ? this.grabbed.handleName : null;
        const iCtx: IslandEmitCtx = { font: this.font, atlas: this.atlas, inst: buff.inst, crv: buff.crv, rws: buff.rws, view, now, draw, hoveredHandle: this.hoveredHandle, grabbedHandle };
        const iTime: IslandTime = { local: 0, now: now / 1000, playing: this.playing, alpha: op, build: frame.reveal };
        def.emit(iCtx, resolvedParams, iTime);
        draw.setOrigin(0, 0);
        break;
      }
    }
  }

  private emitObject(oid: string, spec: ObjectSpec, frame: ObjFrame, draw: DrawHelpers, fs: FrameState, buff: EmitBuffers, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number, op: number) {
    const alignMap = { left: 'start' as const, center: 'middle' as const, right: 'end' as const };
    switch (spec.kind) {
      case 'text': {
        const s = spec;
        const content = frame.chars > 0 ? s.content.slice(0, frame.chars) : s.content;
        if (!content) break;
        draw.text(content, s.at[0] + frame.dx, s.at[1] + frame.dy, s.size * frame.scaleX, s.color, op, s.align ? alignMap[s.align] : 'start');
        break;
      }
      case 'glyph': {
        const s = spec;
        this.emitGlyph(s.char, s.at[0] + frame.dx, s.at[1] + frame.dy, s.size * frame.scaleX, s.color, op, buff);
        break;
      }
      case 'rect': {
        const s = spec;
        this.emitGlow(spec, draw, s.at[0] + frame.dx, s.at[1] + frame.dy, s.size[0] * frame.scaleX, s.size[1] * frame.scaleY, frame, op);
        if (s.fill) draw.rect(s.at[0] + frame.dx, s.at[1] + frame.dy, s.at[0] + frame.dx + s.size[0] * frame.scaleX, s.at[1] + frame.dy + s.size[1] * frame.scaleY, s.fill, op * (s.fill?.[3] ?? 1));
        if (s.stroke) draw.rectStroke(s.at[0] + frame.dx, s.at[1] + frame.dy, s.at[0] + frame.dx + s.size[0] * frame.scaleX, s.at[1] + frame.dy + s.size[1] * frame.scaleY, s.stroke.color, s.stroke.width, op);
        break;
      }
      case 'circle': {
        const s = spec;
        const cx = s.center[0] + frame.dx, cy = s.center[1] + frame.dy;
        if (s.fill) draw.fillCircle(cx, cy, s.radius * frame.scaleX, s.fill, op);
        if (s.stroke) draw.strokeCircle(cx, cy, s.radius * frame.scaleX, s.stroke.color, s.stroke.width, op);
        break;
      }
      case 'polygon': {
        const s = spec;
        const pts = s.points.map((p) => [p[0] + frame.dx, p[1] + frame.dy] as Pt);
        if (s.fill) draw.fillPoly(pts, s.fill, op * frame.reveal);
        if (s.stroke) draw.line(pts, s.stroke.color, s.stroke.width, op);
        break;
      }
      case 'line': {
        const s = spec;
        let pts: Pt[] = s.points.map((p) => [p[0] + frame.dx, p[1] + frame.dy] as Pt);
        if (frame.reveal < 1) pts = this.trimPolyline(pts, frame.reveal);
        draw.line(pts, s.color, s.width * frame.scaleX, op, s.dash);
        break;
      }
      case 'math': {
        const s = spec;
        const key = oid;
        let tex = this.texCache.get(key);
        if (!tex) { tex = new MathTex(s.latex); this.texCache.set(key, tex); }
        tex.emit(this.atlas, buff.inst, buff.crv, buff.rws, {
          x: s.at[0] + frame.dx, y: s.at[1] + frame.dy,
          size: s.size * frame.scaleX, color: s.color, opacity: op, reveal: frame.reveal,
        });
        break;
      }
      case 'island': {
        const s = spec;
        const def = getIsland(s.island);
        const resolvedParams = this.resolveIslandParams(def, s.params ?? {}, fs);
        const cullRadius = def.defaultSize?.[0] ?? 200;
        if (view.left > -1e11 && (s.at[0] + cullRadius < view.left || s.at[0] - cullRadius > view.right || s.at[1] + cullRadius < view.top || s.at[1] - cullRadius > view.bottom)) break;
        const origX = s.at[0] + frame.dx, origY = s.at[1] + frame.dy;
        const defW = def.defaultSize?.[0] ?? 480, defH = def.defaultSize?.[1] ?? 360;
        const specW = (s as any).size?.[0] ?? defW, specH = (s as any).size?.[1] ?? defH;
        const scale = Math.min(specW / defW, specH / defH);
        draw.setTransform(origX, origY, scale, scale);
        const grabbedHandle = this.grabbed?.kind === 'island' ? this.grabbed.handleName : null;
        const iCtx: IslandEmitCtx = { font: this.font, atlas: this.atlas, inst: buff.inst, crv: buff.crv, rws: buff.rws, view, now, draw, hoveredHandle: this.hoveredHandle, grabbedHandle };
        const iTime: IslandTime = { local: 0, now: now / 1000, playing: this.playing, alpha: op, build: frame.reveal };
        def.emit(iCtx, resolvedParams, iTime);
        draw.setOrigin(0, 0);
        break;
      }
    }
  }

  private emitGlyph(char: string, x: number, y: number, size: number, color: number[], alpha: number, buff: EmitBuffers) {
    const g = glyphQuads(this.font, char);
    if (!g) return;
    const [minx, miny, maxx, maxy] = g.bbox;
    const w = maxx - minx, h = maxy - miny;
    const sc = h > 0 ? size / h : 1;
    const q = g.quads.map((v, i) => (i % 2 === 0 ? x + (v - minx) * sc : y + (v - miny) * sc));
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
    fillQuads(q, c, buff.inst, buff.crv, buff.rws);
  }

  private resolveIslandParams(def: IslandDef, overrideParams: Record<string, any>, fs: FrameState): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, pDef] of Object.entries(def.params)) {
      const ov = overrideParams?.[k];
      if (ov && typeof ov === 'object' && '$param' in ov) {
        const refName = (ov as any).$param;
        result[k] = fs.params.get(refName) ?? (ov as any).default;
      } else if (ov !== undefined) {
        result[k] = ov;
      } else {
        result[k] = (pDef as any).default;
      }
    }
    return result;
  }

  // ── Camera driving (mirrors ExplainerBoard.update) ──────────────────────
  update(now: number, s: AppState) {
    this._s = s;
    if (!this.playing) return;
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    this.tourT += dt;
    const total = this.totalDuration();
    if (this.tourT >= total) { this.tourT = total; this.playing = false; return; }
    this.applyPose(s);
  }

  private resolveFit(canvasW: number, canvasH: number) {
    return (fitId: string) => {
      const obj = this.doc.objects[fitId];
      if (!obj || obj.kind !== 'group') return null;
      const g = obj as any;
      if (!g.size) return null;
      const zoom = Math.min(canvasW / (g.size[0] - 80), canvasH / (g.size[1] - 20)) * 1.02;
      return { center: [g.at[0] + g.size[0] / 2, g.at[1] + g.size[1] / 2] as [number, number], zoom };
    };
  }

  private applyPose(s: AppState) {
    const canvasW = s.tCanvas?.width ?? 800;
    const canvasH = s.tCanvas?.height ?? 600;
    const pose = poseAt(this.doc.camera, this.tourT, this.resolveFit(canvasW, canvasH), canvasW, canvasH);
    if (!s.cam3d.active) enter3D(s);
    orbitSetPose(pose.x, pose.y, orbitDistForZoom(pose.zoom, canvasH), pose.azimuth, pose.polar);
    updateOrbit(16);
    s.velX = s.velY = 0;
  }

  // ── Playback controls ───────────────────────────────────────────────────
  seek(s: AppState, seconds: number, pause = true) {
    this._s = s;
    if (pause) { this.playing = false; }
    this.tourT = Math.max(0, Math.min(seconds, this.totalDuration()));
    this.lastNow = -1;
    if (!s.cam3d.active) enter3D(s);
    this.applyPose(s);
  }

  play(s: AppState, from = 0) {
    this._s = s;
    this.playing = true; this.tourT = Math.max(0, Math.min(from, this.totalDuration()));
    this.lastNow = -1;
    if (!s.cam3d.active) enter3D(s);
    this.applyPose(s);
  }

  stopTour(_s: AppState) { this.playing = false; }
  replay(s: AppState) { this.play(s, 0); }
  resume(s: AppState) { this.play(s, this.tourT); }

  // ── Drag handling (pages, items, island handles) ──────────────────────────
  /** Island world transform (matches emitObjectAt). */
  private islandWorldTransform(oid: string, box: { x: number; y: number; w: number; h: number }): { origin: Vec2; scale: number } | null {
    const spec = this.doc.objects[oid] as any;
    if (!spec || spec.kind !== 'island') return null;
    const def = getIsland(spec.island);
    const defW = def.defaultSize?.[0] ?? 480;
    const defH = def.defaultSize?.[1] ?? 360;
    const fill = spec.item?.fill === true;
    const scale = fill ? Math.min(box.w / defW, box.h / defH) : 1;
    return { origin: [box.x + (box.w - defW * scale) / 2, box.y + (box.h - defH * scale) / 2], scale };
  }

  /** World box for any object under a page layout (page-local coords → world) */
  private layoutWorldBox(oid: string): { x: number; y: number; w: number; h: number } | null {
    this.ensureLayout();
    const local = this.layoutMap.get(oid);
    if (!local) return null;
    const pageId = this.findPageParent(oid);
    if (!pageId) return null;
    const pageSpec = this.doc.objects[pageId] as any;
    const pageW = (this.livePageSize.get(pageId) ?? pageSpec.size)?.[0] ?? 1260;
    const pageH = (this.livePageSize.get(pageId) ?? pageSpec.size)?.[1] ?? 820;
    const pageLocal = this.layoutMap.get(pageId);
    return {
      x: pageSpec.at[0] + (pageLocal?.x ?? 0) + local.x,
      y: pageSpec.at[1] + (pageLocal?.y ?? 0) + local.y,
      w: local.w, h: local.h,
    };
  }

  private buildWorldBoxes(): Map<string, { x: number; y: number; w: number; h: number }> {
    this.ensureLayout();
    const boxMap = new Map<string, { x: number; y: number; w: number; h: number }>();
    // Walk all objects that have a layout position
    const pageIds = new Set<string>();
    for (const [id, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group' && (spec as any).page) pageIds.add(id);
    }
    for (const [oid] of Object.entries(this.doc.objects)) {
      const wb = this.layoutWorldBox(oid);
      if (wb) boxMap.set(oid, wb);
    }
    // For pages themselves, also add from livePageSize
    for (const pid of pageIds) {
      if (!boxMap.has(pid)) {
        const pageSpec = this.doc.objects[pid] as any;
        const w = (this.livePageSize.get(pid) ?? pageSpec.size)?.[0] ?? 1260;
        const h = (this.livePageSize.get(pid) ?? pageSpec.size)?.[1] ?? 820;
        boxMap.set(pid, { x: pageSpec.at[0], y: pageSpec.at[1], w, h });
      }
    }
    return boxMap;
  }

  tryBeginDrag(wx: number, wy: number, scale: number): boolean {
    // Chrome panel clicks first — consume without starting a drag.
    if (this.showChrome && this.lastView && this.chrome.handleClick(wx, wy, this.lastView)) {
      return true;
    }
    // DOM-free cinematic HUD (controls + scrubber) sits above everything; it is
    // hit-tested in screen space (the world point is projected through viewProj).
    if (this.cinematicHud) {
      const [sx, sy] = this.cinematicHud.worldToScreen(wx, wy);
      if (this.cinematicHud.pointerDownScreen(sx, sy)) { this.grabbed = { kind: 'hud' }; return true; }
    }
    const r = Math.max(12, 18 / Math.max(scale, 0.05));
    const boxMap = this.buildWorldBoxes();

    // 1) Item resize handles — most specific, try first
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group') continue;
      const box = boxMap.get(oid);
      if (!box) continue;
      const item = (spec as any).item;
      if (!item?.resizable) continue;
      const sx = box.x + box.w, sy = box.y + box.h;
      if (Math.hypot(wx - sx, wy - sy) <= r) {
        this.grabbed = { kind: 'item', id: oid, startWx: wx, startWy: wy, startW: box.w, startH: box.h };
        return true;
      }
    }

    // 2) Page resize handles (SE corner) — top-level & nested
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind !== 'group' || !(spec as any).page?.resizable) continue;
      const box = boxMap.get(oid);
      if (!box) continue;
      const sx = box.x + box.w, sy = box.y + box.h;
      if (Math.hypot(wx - sx, wy - sy) <= r) {
        // Start size = current rendered size (works for both top-level & nested).
        this.grabbed = { kind: 'page', id: oid, startWx: wx, startWy: wy, startSize: [box.w, box.h] };
        return true;
      }
    }

    // 3) Island handles (use layout position if available, else spec.at)
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);
    for (const [oid, spec] of Object.entries(objMap)) {
      if (spec.kind !== 'island') continue;
      const s = spec;
      const def = getIsland(s.island);
      if (!def.handles) continue;
      const params = this.resolveIslandParams(def, s.params ?? {}, fs);
      // Compute island world origin from layout if available
      const layoutBox = boxMap.get(oid);
      const tf = layoutBox ? this.islandWorldTransform(oid, layoutBox) : null;
      const origin: Vec2 = tf ? tf.origin : (s.at as Vec2);
      const iscale = tf ? tf.scale : 1;
      for (const hDef of def.handles) {
        const lp = hDef.at(params);
        const hPos: Vec2 = [origin[0] + lp[0] * iscale, origin[1] + lp[1] * iscale];
        if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
          this.grabbed = { kind: 'island', islandId: s.island, instId: oid, handleName: hDef.param };
          return true;
        }
      }
    }
    return false;
  }

  dragTo(wx: number, wy: number) {
    if (!this.grabbed) return;
    const g = this.grabbed;

    if (g.kind === 'hud') {
      if (this.cinematicHud) { const [sx] = this.cinematicHud.worldToScreen(wx, wy); this.cinematicHud.dragToScreen(sx); }
      return;
    }

    if (g.kind === 'page') {
      const spec = this.doc.objects[g.id] as any;
      if (!spec) return;
      const declaredMin = spec.page?.minSize ?? [200, 150];
      const contentMin = this.pageContentMin(g.id);
      const minSize: Vec2 = [Math.max(declaredMin[0], contentMin.w), Math.max(declaredMin[1], contentMin.h)];
      const maxSize = spec.page?.maxSize ?? [3000, 2000];
      const newW = Math.max(minSize[0], Math.min(maxSize[0], g.startSize[0] + (wx - g.startWx)));
      const newH = Math.max(minSize[1], Math.min(maxSize[1], g.startSize[1] + (wy - g.startWy)));
      if (this.isNestedPage(g.id)) {
        // Nested page: pin via the parent's flex slot (item), so siblings reflow.
        this.liveItemWH.set(g.id, { w: newW, h: newH });
      } else {
        // Top-level page: drive size directly.
        spec.size = [newW, newH];
        this.livePageSize.set(g.id, [newW, newH]);
      }
      this.invalidateLayout();
      this.ensureLayout();
      return;
    }

    if (g.kind === 'item') {
      const spec = this.doc.objects[g.id] as any;
      if (!spec) return;
      const newW = Math.max(60, Math.min(2000, g.startW + (wx - g.startWx)));
      const newH = Math.max(40, Math.min(2000, g.startH + (wy - g.startWy)));
      this.liveItemWH.set(g.id, { w: newW, h: newH });
      this.invalidateLayout();
      this.ensureLayout();
      return;
    }

    if (g.kind === 'island') {
      const { instId, handleName } = g;
      const spec = this.doc.objects[instId] as any;
      if (!spec) return;
      const def = getIsland(spec.island);
      if (!def.handles) return;
      const t = this.playing ? this.tourT : this.totalDuration();
      const fs = evalScene(this.doc, t, this.liveParams);
      const params = this.resolveIslandParams(def, spec.params ?? {}, fs);
      // Compute handle origin from layout if available
      const boxMap = this.buildWorldBoxes();
      const layoutBox = boxMap.get(instId);
      const tf = layoutBox ? this.islandWorldTransform(instId, layoutBox) : null;
      const origin: Vec2 = tf ? tf.origin : (spec.at as Vec2);
      const iscale = tf ? tf.scale : 1;
      for (const hDef of def.handles) {
        if (hDef.param === handleName) {
          const relPos: Vec2 = [(wx - origin[0]) / iscale, (wy - origin[1]) / iscale];
          hDef.set(params, relPos);
          const ov = spec.params?.[handleName];
          if (ov && typeof ov === 'object' && (ov as any).$param) {
            this.liveParams.set((ov as any).$param, params[handleName]);
          } else {
            if (!spec.params) spec.params = {};
            spec.params[handleName] = params[handleName].slice ? [...params[handleName]] : params[handleName];
          }
          break;
        }
      }
    }
  }
  endDrag() { this.grabbed = null; this.cinematicHud?.endDrag(); }

  /** True if the screen-space point lands on a cinematic HUD control (used by the
   *  demo to avoid stopping the tour when the user presses a control). */
  isHudControlScreen(sx: number, sy: number): boolean {
    return !!(this.cinematicHud && this.cinematicHud.hitScreen(sx, sy));
  }

  updateHover(wx: number, wy: number, scale: number): boolean {
    if (this.cinematicHud) { const [sx, sy] = this.cinematicHud.worldToScreen(wx, wy); if (this.cinematicHud.hoverScreen(sx, sy)) return true; }
    const r = Math.max(12, 18 / Math.max(scale, 0.05));
    const boxMap = this.buildWorldBoxes();
    // Check item resize handles first (most specific)
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group') continue;
      const box = boxMap.get(oid);
      if (!box) continue;
      if (!(spec as any).item?.resizable) continue;
      if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
    }
    // Check page resize handles
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind !== 'group' || !(spec as any).page?.resizable) continue;
      const box = boxMap.get(oid);
      if (!box) continue;
      if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
    }
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group') continue;
      const box = boxMap.get(oid);
      if (!box) continue;
      if (!(spec as any).item?.resizable) continue;
      if (Math.hypot(wx - (box.x + box.w), wy - (box.y + box.h)) <= r) return true;
    }
    // Check island handles (uses layout box if available)
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);
    for (const [oid, spec] of Object.entries(objMap)) {
      if (spec.kind !== 'island') continue;
      const s = spec;
      const def = getIsland(s.island);
      if (!def.handles) continue;
      const params = this.resolveIslandParams(def, s.params ?? {}, fs);
      const layoutBox = boxMap.get(oid);
      const tf = layoutBox ? this.islandWorldTransform(oid, layoutBox) : null;
      const origin: Vec2 = tf ? tf.origin : (s.at as Vec2);
      const iscale = tf ? tf.scale : 1;
      for (const hDef of def.handles) {
        const lp = hDef.at(params);
        const hPos: Vec2 = [origin[0] + lp[0] * iscale, origin[1] + lp[1] * iscale];
        if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
          return true;
        }
      }
    }
    this.hoveredHandle = null;
    return false;
  }
  autoDrive() {}

  // ── Polyline trim (from windgraph mobject.ts) ──────────────────────────
  private trimPolyline(pts: Pt[], frac: number): Pt[] {
    if (frac >= 1 || pts.length < 2) return pts;
    if (frac <= 0) return [];
    let total = 0;
    const seg: number[] = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    if (total < 1e-12) return pts;
    const target = total * frac;
    const out: Pt[] = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = seg[i - 1];
      if (acc + d >= target) {
        const t = d < 1e-9 ? 0 : (target - acc) / d;
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
        break;
      }
      out.push(pts[i]); acc += d;
    }
    return out;
  }
}
