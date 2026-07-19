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
import { tw } from '../../layout/metrics';
import { MathTex } from '../../windgraph/math/mathtex';
import type { AppState } from '../../state';

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
  private grabbed: { islandId: string; instId: string; handleName: string } | null = null;
  private hoveredHandle: string | null = null;
  get dragging() { return this.grabbed !== null; }

  constructor(doc: SceneDoc, ctx: { font: any; atlas: any }) {
    this.doc = doc;
    this.font = ctx.font; this.atlas = ctx.atlas;
    // Init live params from doc defaults
    for (const [k, p] of Object.entries(doc.params)) this.liveParams.set(k, p.default);
    // Build cache per chapter
    for (const [id, spec] of Object.entries(doc.objects)) {
      if (spec.kind === 'group' && spec.chapter) this.caches.set(id, new EmitCache());
    }
  }

  setParam(name: string, value: any) { this.liveParams.set(name, value); }
  getDoc(): SceneDoc { return this.doc; }
  chapterWindows(): ChapterWindow[] { return chapterWindows(this.doc); }
  totalDuration(): number { return docDuration(this.doc); }

  // ── Per-frame emit ──────────────────────────────────────────────────────
  emit(font: any, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: { zoom: number; left: number; right: number; top: number; bottom: number }) {
    const ctx: DrawCtx = { font, atlas, buff: { inst, crv, rws } };
    const draw = new DrawHelpers(ctx);
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);

    // Build objMap for lookups
    const objMap = this.doc.objects as Record<string, ObjectSpec>;

    // Iterate objects in insertion order — emit each
    for (const [oid, spec] of Object.entries(objMap)) {
      // Skip groups — their children are emitted individually
      if (spec.kind === 'group') continue;
      const frame = fs.objects.get(oid);
      if (!frame) continue;
      if (!frame.visible) continue;
      if (frame.opacityMult <= 0.001) continue;

      this.emitObject(oid, spec, frame, draw, fs, ctx.buff, view, now);
    }
  }

  private emitObject(oid: string, spec: ObjectSpec, frame: ObjFrame, draw: DrawHelpers, fs: FrameState, buff: EmitBuffers, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number) {
    const op = frame.opacityMult;
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
        const iCtx: IslandEmitCtx = { font: this.font, atlas: this.atlas, inst: buff.inst, crv: buff.crv, rws: buff.rws, view, now, draw, hoveredHandle: this.hoveredHandle, grabbedHandle: this.grabbed?.handleName ?? null };
        const iTime: IslandTime = { local: 0, now: now / 1000, playing: this.playing, alpha: op, build: frame.reveal };
        def.emit(iCtx, resolvedParams, iTime);
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
    if (!this.playing) return;
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    this.tourT += dt;
    const total = this.totalDuration();
    if (this.tourT >= total) { this.tourT = total; this.playing = false; return; }
    this.applyPose(s);
  }

  private applyPose(s: AppState) {
    const resolveFit = (fitId: string) => {
      const obj = this.doc.objects[fitId];
      if (!obj || obj.kind !== 'group') return null;
      const g = obj as GroupSpec;
      if (!g.size) return null;
      return { center: [g.at[0] + g.size[0] / 2, g.at[1] + g.size[1] / 2] } as { center: Vec2; zoom: number };
    };
    const canvasW = s.tCanvas?.width ?? 800;
    const canvasH = s.tCanvas?.height ?? 600;
    const pose = poseAt(this.doc.camera, this.tourT, resolveFit, canvasW, canvasH);
    if (!s.cam3d.active) enter3D(s);
    orbitSetPose(pose.x, pose.y, orbitDistForZoom(pose.zoom, canvasH), pose.azimuth, pose.polar);
    updateOrbit(16);
    s.velX = s.velY = 0;
  }

  // ── Playback controls ───────────────────────────────────────────────────
  seek(s: AppState, seconds: number, pause = true) {
    if (pause) { this.playing = false; }
    this.tourT = Math.max(0, Math.min(seconds, this.totalDuration()));
    this.lastNow = -1;
    if (!s.cam3d.active) enter3D(s);
    this.applyPose(s);
  }

  play(s: AppState, from = 0) {
    this.playing = true; this.tourT = Math.max(0, Math.min(from, this.totalDuration()));
    this.lastNow = -1;
    if (!s.cam3d.active) enter3D(s);
    this.applyPose(s);
  }

  stopTour(_s: AppState) { this.playing = false; }
  replay(s: AppState) { this.play(s, 0); }

  // ── Drag handling ───────────────────────────────────────────────────────
  tryBeginDrag(wx: number, wy: number, scale: number): boolean {
    const objMap = this.doc.objects as Record<string, ObjectSpec>;
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);
    const r = Math.max(12, 18 / Math.max(scale, 0.05));

    for (const [oid, spec] of Object.entries(objMap)) {
      if (spec.kind !== 'island') continue;
      const s = spec;
      const def = getIsland(s.island);
      if (!def.handles) continue;
      const params = this.resolveIslandParams(def, s.params ?? {}, fs);
      for (const hDef of def.handles) {
        const hPos = hAt(hDef.at(params), s.at);
        if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
          this.grabbed = { islandId: s.island, instId: oid, handleName: hDef.param };
          return true;
        }
      }
    }
    return false;
  }
  private islandAt(id: string): Vec2 {
    const spec = this.doc.objects[id] as any;
    return spec ? [spec.at[0], spec.at[1]] : [0, 0];
  }

  dragTo(wx: number, wy: number) {
    if (!this.grabbed) return;
    const { instId, handleName } = this.grabbed;
    const spec = this.doc.objects[instId] as any;
    if (!spec) return;
    const def = getIsland(spec.island);
    if (!def.handles) return;
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);
    const params = this.resolveIslandParams(def, spec.params ?? {}, fs);
    for (const hDef of def.handles) {
      if (hDef.param === handleName) {
        const relPos: Vec2 = [wx - spec.at[0], wy - spec.at[1]];
        hDef.set(params, relPos);
        // Write back to liveParams if $param ref, else instance override
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
  endDrag() { this.grabbed = null; }

  updateHover(wx: number, wy: number, scale: number): boolean {
    const t = this.playing ? this.tourT : this.totalDuration();
    const fs = evalScene(this.doc, t, this.liveParams);
    const r = Math.max(12, 18 / Math.max(scale, 0.05));
    for (const [oid, spec] of Object.entries(this.doc.objects)) {
      if (spec.kind !== 'island') continue;
      const s = spec;
      const def = getIsland(s.island);
      if (!def.handles) continue;
      const params = this.resolveIslandParams(def, s.params ?? {}, fs);
      for (const hDef of def.handles) {
        const hPos = hAt(hDef.at(params), s.at);
        if (Math.hypot(wx - hPos[0], wy - hPos[1]) <= r) {
          this.hoveredHandle = hDef.param;
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

function hAt(local: Vec2, origin: Vec2): Vec2 {
  return [local[0] + origin[0], local[1] + origin[1]];
}
