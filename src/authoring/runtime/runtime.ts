// ── SceneRuntime — implements s.interactive contract ─────────────────────────
// Owns a SceneDoc, evaluates timeline, drives camera, emits into the pipeline.
// Per-object emit lives in emitObject.ts, drag/hit-testing in dragControl.ts,
// state-free helpers in shared.ts (sprint-v2 Phase 0.1 split).

import type { SceneDoc, ObjectSpec, Vec2, GroupSpec } from '../ir/types';
import { evalScene, docDuration, chapterWindows, type FrameState, type ChapterWindow } from './timeline';
import { poseAt } from './camera';
import { DrawHelpers, type DrawCtx } from '../islands/draw';
import { EmitCache } from '../../windfoil/emitCache';
import { enter3D } from '../../camera/camera';
import { orbitDistForZoom, orbitSetPose, updateOrbit, disableOrbit, orbitTargetLocal } from '../../camera/orbit';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { tw } from '../../layout/metrics';
import { MathTex } from '../../windgraph/math/mathtex';
import type { AppState } from '../../state';
import { solveDocLayout, ensureTaffy, type LayoutMap } from '../layout/solve';
import { makeMeasureFn, wrapText, type MeasureFn } from '../layout/measure';
import { ChromeController } from './chrome';
import { CinematicHud } from './cinematicHud';
import { effHeight, safePageWH, safePageZoom } from './safeArea';
import {
  emitHudWorld, screenLockedHudPose, lerpSlot,
  type HudPeelState, type HudWorldSlot,
} from './hudWorld';
import { type DragState, type PlanPage, TOTAL_W, TOTAL_H, sigVal } from './shared';
import { emitObject, emitObjectAt } from './emitObject';
import {
  tryBeginDrag as dragTryBegin, dragTo as dragMoveTo, endDrag as dragEnd,
  updateHover as dragUpdateHover, isHudControlScreen as dragIsHudControl,
  layoutWorldBox,
} from './dragControl';

export class SceneRuntime {
  x0 = -900; y0 = -2200; width = TOTAL_W; height = TOTAL_H;
  playing = false; tourT = 0;
  private lastNow = -1;
  private fitSettling = false;
  font: FontFace; atlas: GlyphAtlas;
  private doc: SceneDoc;
  private caches: Map<string, EmitCache> = new Map();
  private texCache: Map<string, MathTex> = new Map();
  liveParams: Map<string, any> = new Map();
  grabbed: DragState = null;
  hoveredHandle: string | null = null;
  lastView: { zoom: number; left: number; right: number; top: number; bottom: number } | null = null;
  private childToChapter = new Map<string, string>();  // child object id → chapter group id
  /** Designer chrome (object tree / inspector / clip timeline). Off for cinematic tours. */
  showChrome = false;
  /** Cinematic tour mode: world-space grid + a DOM-free screen-space HUD overlay
   *  (letterbox + sleek timeline + controls + caption) drawn by frame.ts. */
  cinematic = false;
  get dragging() { return this.grabbed !== null; }

  // ── Layout state ───────────────────────────────────────────────────────
  layoutMap: LayoutMap = new Map();
  private layoutDirty = true;
  private measure: MeasureFn;
  private layoutReady = false;
  livePageSize = new Map<string, Vec2>();
  liveItemWH = new Map<string, { w: number; h: number }>();
  /** Cached parent pointers + top-page lookup (rebuilt on reload). */
  private parentMap: Map<string, string> | null = null;
  private topPageCache = new Map<string, string | null>();
  private _chapterWindows: ChapterWindow[] | null = null;
  /** Quantized barT that last drove a layout solve (avoid per-frame reflow). */
  private lastBarQ = -1;
  /** Active Living-UI peel pose for hit-testing. */
  hudPeel: HudPeelState | null = null;
  /** Page emit plan (lazy-built per doc). */
  private pagePlan: PlanPage[] | null = null;
  /** Static grid replay cache. */
  private gridCache = new EmitCache();
  /** Bumped on every layout invalidation — part of the page cache signature. */
  private layoutRev = 0;
  /** FrameState memo (evalScene results by t, dropped on any param write). */
  private fsMemo = new Map<number, FrameState>();
  paramVersion = 0;
  chrome: ChromeController;
  /** DOM-free cinematic HUD (letterbox + scrubber + controls + caption). */
  cinematicHud: CinematicHud | null = null;
  // Screen-space overlay buffers (filled each frame when `cinematic`); frame.ts
  // uploads + draws them with a screen-ortho matrix in the same pass.
  hudInst: number[] = []; hudCrv: number[] = []; hudRws: number[] = [];
  hudInstFA = new Float32Array(0); hudCrvFA = new Float32Array(0); hudRwsUA = new Uint32Array(0);
  hudInstLen = 0; hudCrvLen = 0; hudRwsLen = 0; hudCount = 0;
  private _s: AppState | null = null;

  constructor(doc: SceneDoc, ctx: { font: FontFace; atlas: GlyphAtlas }) {
    this.doc = doc;
    this.font = ctx.font; this.atlas = ctx.atlas;
    this.measure = makeMeasureFn(ctx.font, undefined, ctx.atlas);
    this.chrome = new ChromeController(this);
    for (const [k, p] of Object.entries(doc.params)) this.liveParams.set(k, p.default);
    for (const [id, spec] of Object.entries(doc.objects)) {
      if (spec.kind === 'group' && spec.chapter) {
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

  invalidateLayout() { this.layoutDirty = true; this.layoutRev++; }

  /** evalScene memoized per t — emit/hover/drag used to run the full evaluation
   *  several times per frame (and with different t's while paused). */
  frameState(t: number): FrameState {
    let fs = this.fsMemo.get(t);
    if (!fs) {
      fs = evalScene(this.doc, t, this.liveParams);
      if (this.fsMemo.size > 6) this.fsMemo.clear();
      this.fsMemo.set(t, fs);
    }
    return fs;
  }

  /** Doc structure or spec props changed outside the timeline (REPL/designer):
   *  drop cached plans, parent lookups and emit slices so they rebuild. */
  invalidateCaches() {
    for (const c of this.caches.values()) c.invalidate();
    this.gridCache.invalidate();
    this.pagePlan = null;
    this.parentMap = null;
    this.topPageCache.clear();
    this.fsMemo.clear();
    this.paramVersion++;
    this.invalidateLayout();
  }

  /** Ordered top pages + their emit content — the page is the cache/cull unit. */
  private buildPagePlan() {
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    this.getParentMap();
    const plan: PlanPage[] = [];
    const byId = new Map<string, PlanPage>();
    for (const [id, spec] of Object.entries(objMap)) {
      if (spec.kind === 'group' && (spec as any).page && !this.isNestedPage(id)) {
        const p: PlanPage = { id, nested: [], children: [], staticAfter: 0 };
        plan.push(p); byId.set(id, p);
        if (!this.caches.has(id)) this.caches.set(id, new EmitCache());
      }
    }
    for (const [oid, spec] of Object.entries(objMap)) {
      if (byId.has(oid)) continue;
      const tp = this.findPageParent(oid);
      if (!tp || !byId.has(tp)) continue;
      const page = byId.get(tp)!;
      if (spec.kind === 'group') { if ((spec as any).page) page.nested.push(oid); }
      else page.children.push(oid);
    }
    // staticAfter: latest clip end touching the page's objects (beyond it the
    // frame state is constant → the per-object section of the sig is skipped).
    for (const page of plan) {
      const ids = new Set([page.id, ...page.nested, ...page.children]);
      let sa = 0;
      for (const c of this.doc.clips) {
        if (!ids.has(c.target)) continue;
        const end = c.start + c.duration;
        if (end > sa) sa = end;
      }
      page.staticAfter = sa;
    }
    this.pagePlan = plan;
  }

  /** Emit-cache signature for a static page: layout revision, interaction state,
   *  per-object frame values (only while clips still run) and island params. */
  private pageSig(page: PlanPage, fs: FrameState, t: number): string {
    let sig = `L${this.layoutRev}|H${this.hoveredHandle ?? ''}|G${this.grabbed ? this.grabbed.kind + (this.grabbed.kind === 'island' ? ':' + this.grabbed.handleName : '') : ''}`;
    if (t < page.staticAfter) {
      for (const oid of page.children) {
        const f = fs.objects.get(oid);
        if (!f) continue;
        sig += `;${f.opacityMult.toFixed(2)},${f.reveal.toFixed(2)},${f.chars},${f.dx.toFixed(1)},${f.dy.toFixed(1)},${f.scaleX.toFixed(2)},${f.scaleY.toFixed(2)},${f.visible ? 1 : 0}`;
      }
    }
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    for (const oid of page.children) {
      const s = objMap[oid] as any;
      if (s.kind !== 'island' || !s.params) continue;
      sig += ';' + oid;
      for (const [k, v] of Object.entries(s.params)) {
        const val = v && typeof v === 'object' && (v as any).$param ? fs.params.get((v as any).$param) : v;
        sig += `|${k}=${sigVal(val)}`;
      }
    }
    return sig;
  }

  /**
   * Two-pass layout:
   *  1) Solve with intrinsic measures (text as single-line).
   *  2) Re-measure text that got a narrower assigned width (wrap height).
   *  3) Re-solve so siblings reflow below taller wrapped text.
   */
  ensureLayout(): void {
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

  setParam(name: string, value: any) { this.liveParams.set(name, value); this.paramVersion++; }
  getDoc(): SceneDoc { return this.doc; }
  /** MathTex cache accessor for the extracted object-emit module. */
  texFor(oid: string, latex: string): MathTex {
    let tex = this.texCache.get(oid);
    if (!tex) { tex = new MathTex(latex); this.texCache.set(oid, tex); }
    return tex;
  }
  grabbedHandleName(): string | null { return this.grabbed?.kind === 'island' ? this.grabbed.handleName : null; }
  chapterWindows(): ChapterWindow[] {
    if (!this._chapterWindows) this._chapterWindows = chapterWindows(this.doc);
    return this._chapterWindows;
  }
  totalDuration(): number { return docDuration(this.doc); }
  reload(newDoc: SceneDoc) {
    this.doc = newDoc;
    this.tourT = 0;
    this.playing = false;
    this.lastNow = -1;
    this.liveParams.clear();
    for (const [k, p] of Object.entries(newDoc.params)) this.liveParams.set(k, p.default);
    this.caches.clear();
    this.texCache.clear();
    this.childToChapter.clear();
    this.parentMap = null;
    this.topPageCache.clear();
    this._chapterWindows = null;
    this.lastBarQ = -1;
    this.hudPeel = null;
    this.pagePlan = null;
    this.gridCache.invalidate();
    this.fsMemo.clear();
    this.paramVersion++;
    for (const [id, spec] of Object.entries(newDoc.objects)) {
      if (spec.kind === 'group' && spec.chapter) {
        for (const cid of spec.children) this.childToChapter.set(cid, id);
      }
    }
    this.layoutDirty = true;
  }

  // ── Per-frame emit ──────────────────────────────────────────────────────
  /**
   * Board view under cinematic 3D is a sentinel (left=-1e12). Rebuild a finite
   * on-axis frustum from the orbit target + cameraScale so culling and the
   * Living-UI screen-lock pose actually work.
   */
  private resolveView(view: { zoom: number; left: number; right: number; top: number; bottom: number }) {
    if (view.left > -1e11) return view;
    const Cw = this._s?.tCanvas?.width ?? 1600;
    const Ch = this._s?.tCanvas?.height ?? 900;
    const z = Math.max(view.zoom, 1e-6);
    let cx = 0, cy = 0;
    try { const t = orbitTargetLocal(); cx = t.x; cy = t.y; } catch { /* orbit not ready */ }
    const hw = (Cw / z) / 2, hh = (Ch / z) / 2;
    // Generous margin under polar tilt (frustum is a trapezoid on the ground).
    const m = Math.max(hw, hh) * 0.35;
    return {
      zoom: z,
      left: cx - hw - m,
      right: cx + hw + m,
      top: cy - hh - m,
      bottom: cy + hh + m,
      cx, cy,
    };
  }

  emit(font: FontFace, atlas: GlyphAtlas, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }) {
    const rv = this.resolveView(view);
    this.lastView = rv;
    const ctx: DrawCtx = { font, atlas, buff: { inst, crv, rws } };
    const draw = new DrawHelpers(ctx);
    const t = this.tourT;
    const fs = this.frameState(t);
    const objMap = this.doc.objects as Record<string, ObjectSpec>;

    // Safe-page size driver: quantize barT so damping doesn't re-solve every frame.
    if (this.cinematic && this._s) {
      const barT = this.cinematicHud?.barValue ?? 0;
      const barQ = Math.round(barT * 40) / 40;
      if (barQ !== this.lastBarQ) {
        this.lastBarQ = barQ;
        const Cw = this._s.tCanvas?.width ?? 1600;
        const Ch = this._s.tCanvas?.height ?? 900;
        for (const [id, spec] of Object.entries(objMap)) {
          const g = spec as any;
          if (g.kind === 'group' && g.chapter && g.page?.safe) {
            const nw = g.page.nominalW ?? g.size?.[0] ?? 1260;
            const [wp, hp] = safePageWH(nw, Cw, Ch, barQ, !!g.page?.cover);
            const prev = this.livePageSize.get(id);
            if (!prev || Math.abs(prev[0] - wp) > 0.5 || Math.abs(prev[1] - hp) > 0.5) {
              this.livePageSize.set(id, [wp, hp]);
              this.invalidateLayout();
            }
          }
        }
      }
    }

    this.ensureLayout();

    // Sparse grid only when zoomed out — dense grid at dive zooms tanks fill rate.
    // Static over the board bounds → replayed through its own cache.
    if (this.cinematic && rv.zoom < 1.4) {
      this.gridCache.run(`grid|${this.x0},${this.y0},${this.width},${this.height}`, inst, crv, rws, () => this.drawGrid(draw));
    }

    const margin = 200 / Math.max(rv.zoom, 0.05);
    const vL = rv.left, vR = rv.right, vT = rv.top, vB = rv.bottom;
    const inView = (x: number, y: number, w: number, h: number) =>
      !(x - margin > vR || x + w + margin < vL || y - margin > vB || y + h + margin < vT);

    if (!this.pagePlan) this.buildPagePlan();
    const plan = this.pagePlan!;

    // World box of a top page (safe pages are center-anchored).
    const pageBox = (id: string): { x: number; y: number; w: number; h: number } => {
      const spec = objMap[id] as any;
      const live = this.livePageSize.get(id);
      const pw = live?.[0] ?? spec.size?.[0] ?? 1260;
      const ph = live?.[1] ?? spec.size?.[1] ?? 820;
      const isSafe = !!spec.page?.safe;
      return {
        x: isSafe ? spec.at[0] - pw / 2 : spec.at[0],
        y: isSafe ? spec.at[1] - ph / 2 : spec.at[1],
        w: pw, h: ph,
      };
    };

    // Top-level pages visible in the frustum (content cull key).
    const visibleTopPages = new Set<string>();
    if (fs.currentChapterId) visibleTopPages.add(fs.currentChapterId);
    for (const page of plan) {
      const b = pageBox(page.id);
      if (inView(b.x, b.y, b.w, b.h)) visibleTopPages.add(page.id);
    }

    // Emit page by page: the CURRENT chapter rebuilds (it animates); every other
    // visible page replays its captured instance slice when its signature holds —
    // the original explainer's per-chapter strategy that kept the tour smooth.
    const drawnPageBoxes: { id: string; x: number; y: number; w: number; h: number }[] = [];
    for (const page of plan) {
      if (!visibleTopPages.has(page.id)) continue;
      const wBox = pageBox(page.id);
      if (!inView(wBox.x, wBox.y, wBox.w, wBox.h)) continue;
      drawnPageBoxes.push({ id: page.id, ...wBox });
      if (page.id === fs.currentChapterId) {
        this.emitPage(page, wBox, fs, draw, ctx, view, now);
      } else {
        this.caches.get(page.id)!.run(this.pageSig(page, fs, t), inst, crv, rws,
          () => this.emitPage(page, wBox, fs, draw, ctx, view, now));
      }
    }

    // Resize handles only in designer chrome mode
    if (this.showChrome) {
      const hRadius = Math.max(6, 10 / Math.max(view.zoom, 0.05));
      const isGrabbed = (id: string) => this.grabbed?.kind === 'page' && this.grabbed.id === id;
      for (const pb of drawnPageBoxes) {
        const spec = objMap[pb.id] as any;
        if (!spec.page?.resizable) continue;
        const sx = pb.x + pb.w, sy = pb.y + pb.h;
        draw.fillCircle(sx, sy, hRadius, isGrabbed(pb.id) ? [0.97, 0.73, 0.33, 1] : [0.30, 0.80, 0.40, 1]);
        draw.strokeCircle(sx, sy, hRadius * 1.5, isGrabbed(pb.id) ? [0.97, 0.73, 0.33, 1] : [0.30, 0.80, 0.40, 1], 2);
      }
      for (const [oid, oSpec] of Object.entries(objMap)) {
        if (oSpec.kind === 'group') continue;
        const itemBox = this.layoutMap.get(oid);
        if (!itemBox) continue;
        if (!(oSpec as any).item?.resizable) continue;
        const pageParent = this.findPageParent(oid);
        if (!pageParent || !visibleTopPages.has(pageParent)) continue;
        const pp = objMap[pageParent] as any;
        const pSafe = !!pp.page?.safe;
        const ppw = (this.livePageSize.get(pageParent) ?? pp.size)?.[0] ?? 1260;
        const pph = (this.livePageSize.get(pageParent) ?? pp.size)?.[1] ?? 820;
        const pox = pSafe ? pp.at[0] - ppw / 2 : pp.at[0];
        const poy = pSafe ? pp.at[1] - pph / 2 : pp.at[1];
        const sx = pox + itemBox.x + itemBox.w;
        const sy = poy + itemBox.y + itemBox.h;
        draw.fillCircle(sx, sy, hRadius, [0.12, 0.60, 0.95, 1]);
        draw.strokeCircle(sx, sy, hRadius * 1.5, [0.12, 0.60, 0.95, 1], 2);
      }
    }

    const visibleChapters = new Set<string>(visibleTopPages);
    for (const [id, spec] of Object.entries(objMap)) {
      if (spec.kind === 'group' && spec.chapter && spec.size && !spec.page) {
        const g = spec;
        const sz = g.size!;
        const chAt = g.at;
        if (inView(chAt[0], chAt[1], sz[0], sz[1])) visibleChapters.add(id);
      }
    }

    // Legacy (non-page) objects — page objects were emitted per page above.
    for (const [oid, spec] of Object.entries(objMap)) {
      if (spec.kind === 'group') continue;
      if (this.findPageParent(oid)) continue;

      const chId = this.childToChapter.get(oid);
      if (chId && !visibleChapters.has(chId)) continue;
      const chAlpha = chId ? (fs.chapters.get(chId)?.alpha ?? 0) : 1;
      if (chAlpha <= 0.02) continue;
      const frame = fs.objects.get(oid);
      if (!frame || !frame.visible) continue;
      const isCurrent = !chId || chId === fs.currentChapterId;
      const effOp = frame.opacityMult * (isCurrent ? chAlpha : Math.min(chAlpha, 0.55));
      if (effOp <= 0.001) continue;
      emitObject(this, oid, spec, frame, draw, fs, ctx.buff, view, now, effOp);
    }
    if (this.showChrome) this.chrome.emit(draw, view, now);
    draw.setOrigin(0, 0);

    // ── Living UI peel ──────────────────────────────────────────────────────
    // Screen HUD stays solid until detach is well underway. World HUD is posed
    // from a REAL viewport (orbit target + scale), not the 3D sentinel bounds.
    // Complementary alphas (screen + world = 1) — no disappear gap.
    const hudDetach = this.cinematic ? (fs.params.get('hudDetach') ?? 0) : 0;
    if (this.cinematicHud) this.cinematicHud.worldDetached = hudDetach > 0.5;
    this.hudPeel = null;

    const chapters = this.chapterWindows();
    const activeIdx = fs.currentChapterId ? chapters.findIndex((c) => c.id === fs.currentChapterId) : -1;
    const hudInfo = { t, total: this.totalDuration(), playing: this.playing, chapters, activeIdx };

    const Cw = this._s?.tCanvas?.width ?? 0;
    const Ch = this._s?.tCanvas?.height ?? 0;
    if (hudDetach > 0.001 && this.cinematicHud && this._s && Cw > 0 && Ch > 0) {
      const slotBox = layoutWorldBox(this, 'sm-slot');
      if (slotBox) {
        const cx = (rv as any).cx ?? (rv.left + rv.right) / 2;
        const cy = (rv as any).cy ?? (rv.top + rv.bottom) / 2;
        const screenPose = screenLockedHudPose(Cw, Ch, cx, cy, rv.zoom);
        const slotPose: HudWorldSlot = { x: slotBox.x, y: slotBox.y, w: slotBox.w, h: slotBox.h };
        const pose = lerpSlot(screenPose, slotPose, hudDetach);
        this.hudPeel = { pose, Wv: Cw, Hv: Ch };
        emitHudWorld(this.cinematicHud, this, this.hudPeel, this.font, this.atlas, ctx.buff, now, hudInfo, hudDetach);
      }
    }

    // Screen overlay: letterbox always full; timeline/buttons = (1 - detach).
    if (this.cinematic && this.cinematicHud && this._s) {
      const bs = this._s as any;
      this.hudInst.length = 0;
      const bcl = bs.baseCrvLen ?? 0;
      this.hudCrv.length = bcl;
      for (let i = 0; i < bcl; i++) this.hudCrv[i] = bs.baseCrv[i];
      const brl = bs.baseRwsLen ?? 0;
      this.hudRws.length = brl;
      for (let i = 0; i < brl; i++) this.hudRws[i] = bs.baseRws[i];
      const froze = hudDetach > 0.001 && !!this.hudPeel;
      this.cinematicHud.build(this.font, this.atlas, now, Cw, Ch,
        hudInfo, { inst: this.hudInst, crv: this.hudCrv, rws: this.hudRws },
        { masterAlpha: 1 - hudDetach, freezeBar: froze });
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

  /** One top page's full content: card chrome (top + nested) then its objects in
   *  doc order. The page is the cache/cull unit — no per-object cull inside, so a
   *  captured replay is always the complete page (mirrors the original per-chapter
   *  emit, which emitted a chapter fully whenever visible). */
  private emitPage(page: PlanPage, wBox: { x: number; y: number; w: number; h: number }, fs: FrameState, draw: DrawHelpers, ctx: DrawCtx, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number) {
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    const spec = objMap[page.id] as any;
    if (!spec.page?.noChrome) {
      draw.rect(wBox.x, wBox.y, wBox.x + wBox.w, wBox.y + wBox.h, [0.10, 0.105, 0.12, 1]);
      draw.rectStroke(wBox.x, wBox.y, wBox.x + wBox.w, wBox.y + wBox.h, [0.25, 0.26, 0.30, 1], 1.3);
    }
    for (const nid of page.nested) {
      const local = this.layoutMap.get(nid);
      if (!local) continue;
      const ns = objMap[nid] as any;
      const nx = wBox.x + local.x, ny = wBox.y + local.y;
      if (!ns.page?.noChrome) {
        draw.rect(nx, ny, nx + local.w, ny + local.h, [0.145, 0.15, 0.175, 1]);
        draw.rectStroke(nx, ny, nx + local.w, ny + local.h, [0.32, 0.33, 0.38, 1], 1.0);
      }
    }
    for (const oid of page.children) {
      const spec = objMap[oid];
      const layoutBox = this.layoutMap.get(oid);
      if (!layoutBox) continue;
      const frame = fs.objects.get(oid);
      if (!frame || !frame.visible) continue;
      const effOp = frame.opacityMult;
      if (effOp <= 0.001) continue;
      emitObjectAt(this, oid, spec, frame, draw, fs, ctx.buff, view, now, effOp, wBox.x + layoutBox.x, wBox.y + layoutBox.y, layoutBox.w, layoutBox.h);
    }
  }

  private getParentMap(): Map<string, string> {
    if (this.parentMap) return this.parentMap;
    const pm = new Map<string, string>();
    for (const [pid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind === 'group') {
        for (const cid of (spec as GroupSpec).children) pm.set(cid, pid);
      }
    }
    this.parentMap = pm;
    return pm;
  }

  /** Returns the topmost page ancestor (or null if `id` is not under a page).
   *  For a child of a nested page, returns the outermost page (not the
   *  immediate one) so world coordinates are top-page-local. */
  findPageParent(id: string): string | null {
    if (this.topPageCache.has(id)) return this.topPageCache.get(id)!;
    const pm = this.getParentMap();
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
    this.topPageCache.set(id, lastPage);
    return lastPage;
  }

  /** True if `id` is itself a page nested inside another page. */
  isNestedPage(id: string): boolean {
    const spec = this.doc.objects[id] as any;
    if (!spec?.page) return false;
    return this.findPageParent(id) !== null;
  }

  // ── Camera driving (mirrors ExplainerBoard.update) ──────────────────────
  update(now: number, s: AppState) {
    this._s = s;
    // Fit settling: after stopTour, keep adjusting camera while barT damps down
    if (!this.playing && this.fitSettling && this.cinematic) {
      const barT = this.cinematicHud?.barValue ?? 0;
      if (barT < 0.01) { this.fitSettling = false; return; }
      this.applyPose(s);
      return;
    }
    if (!this.playing) return;
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    this.tourT += dt;
    const total = this.totalDuration();
    if (this.tourT >= total) { this.tourT = total; this.playing = false; return; }
    this.applyPose(s);
  }

  private resolveFit(canvasW: number, canvasH: number) {
    const barT = this.cinematic ? (this.cinematicHud?.barValue ?? 0) : 0;
    const H = barT > 0.001 ? effHeight(canvasH, barT) : canvasH;
    return (fitId: string) => {
      const obj = this.doc.objects[fitId];
      if (!obj || obj.kind !== 'group') return null;
      const g = obj as any;
      if (!g.size) return null;
      // Safe pages: zoom uses safePageZoom, center = at (which is the page center)
      if (g.page?.safe) {
        const nw = g.page.nominalW ?? g.size[0] ?? 1260;
        const z = safePageZoom(nw, canvasW);
        return { center: [g.at[0], g.at[1]] as [number, number], zoom: z };
      }
      const zoom = Math.min(canvasW / (g.size[0] - 80), H / (g.size[1] - 20)) * 1.02;
      return { center: [g.at[0] + g.size[0] / 2, g.at[1] + g.size[1] / 2] as [number, number], zoom };
    };
  }

  private applyPose(s: AppState) {
    // Skip camera driving while Taffy WASM hasn't settled into place.  Trying to
    // frame layout-resolved targets before they exist causes ugly snapping/panning.
    if (!this.layoutReady) return;
    const canvasW = s.tCanvas?.width ?? 800;
    const canvasH = s.tCanvas?.height ?? 600;
    const pose = poseAt(this.doc.camera, this.tourT, this.resolveFit(canvasW, canvasH), canvasW, canvasH, this.makeResolveFitObj(canvasW, canvasH));
    if (!s.cam3d.active) enter3D(s);
    orbitSetPose(pose.x, pose.y, orbitDistForZoom(pose.zoom, canvasH), pose.azimuth, pose.polar);
    updateOrbit(16);
    s.velX = s.velY = 0;
  }

  /** Layout-resolved fit: frame an object's laid-out world box within the safe
   *  area (between letterbox bars). Drives `fitObj` dive keyframes so a deep zoom
   *  tracks its card through reflow/resize and stays centered. */
  private makeResolveFitObj(canvasW: number, canvasH: number) {
    return (oid: string): { center: Vec2; zoom: number; box?: { x: number; y: number; w: number; h: number } } | null => {
      const box = layoutWorldBox(this, oid);
      if (!box || box.w <= 0 || box.h <= 0) return null;
      // Contain fit with zero margin — the slot is canvas-aspect (cover page),
      // so this fills the screen exactly at zoomMul=1.
      const m = 0;
      const zoom = Math.min(canvasW / (box.w + m), canvasH / (box.h + m));
      return { center: [box.x + box.w / 2, box.y + box.h / 2] as Vec2, zoom, box };
    };
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
    this.fitSettling = false;
    if (!s.cam3d.active) enter3D(s);
    this.applyPose(s);
  }

  stopTour(_s: AppState) { this.playing = false; if (this.cinematic) this.fitSettling = true; }
  replay(s: AppState) { this.play(s, 0); }
  resume(s: AppState) { this.play(s, this.tourT); }

  // ── Drag handling — delegated to dragControl.ts (Phase 0.1 split) ─────────
  tryBeginDrag(wx: number, wy: number, scale: number): boolean { return dragTryBegin(this, wx, wy, scale); }
  dragTo(wx: number, wy: number) { dragMoveTo(this, wx, wy); }
  endDrag() { dragEnd(this); }
  isHudControlScreen(sx: number, sy: number): boolean { return dragIsHudControl(this, sx, sy); }
  updateHover(wx: number, wy: number, scale: number): boolean { return dragUpdateHover(this, wx, wy, scale); }
  autoDrive() {}
}
