// ── Per-object emit (split from runtime.ts, sprint-v2 Phase 0.1) ─────────────
// Draws one ObjectSpec at its frame state. Behavior-identical extraction: the
// former SceneRuntime methods now take an ObjectEmitHost (which SceneRuntime
// satisfies structurally) instead of `this`.

import type { ObjectSpec } from '../ir/types';
import type { ObjFrame, FrameState } from './timeline';
import type { DrawHelpers, EmitBuffers } from '../islands/draw';
import { getIsland, type IslandEmitCtx, type IslandTime } from '../islands/registry';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { tw } from '../../layout/metrics';
import type { MathTex } from '../../windgraph/math/mathtex';
import type { Pt } from '../../windgraph/stroke/stroke';
import { emitGlow, emitGlyph, resolveIslandParams, trimPolyline } from './shared';

export interface ObjectEmitHost {
  font: FontFace;
  atlas: GlyphAtlas;
  playing: boolean;
  hoveredHandle: string | null;
  texFor(oid: string, latex: string): MathTex;
  grabbedHandleName(): string | null;
}

export function emitObjectAt(host: ObjectEmitHost, oid: string, spec: ObjectSpec, frame: ObjFrame, draw: DrawHelpers, fs: FrameState, buff: EmitBuffers, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number, op: number, worldX: number, worldY: number, boxW: number, boxH: number) {
  const alignMap = { left: 'start' as const, center: 'middle' as const, right: 'end' as const };
  switch (spec.kind) {
    case 'text': {
      const s = spec;
      const content = frame.chars > 0 ? s.content.slice(0, frame.chars) : s.content;
      if (!content) break;
      const fontSize = s.size * frame.scaleX;
      const textW = tw(content, host.font, fontSize);
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
      emitGlyph(host.font, spec.char, worldX + frame.dx, worldY + frame.dy, spec.size * frame.scaleX, spec.color, op, buff);
      break;
    }
    case 'rect': {
      const s = spec;
      const useW = (boxW > 0 ? boxW : s.size[0]) * frame.scaleX;
      const useH = (boxH > 0 ? boxH : s.size[1]) * frame.scaleY;
      emitGlow(spec, draw, worldX + frame.dx, worldY + frame.dy, useW, useH, frame, op);
      if (s.fill) draw.rect(worldX + frame.dx, worldY + frame.dy, worldX + frame.dx + useW, worldY + frame.dy + useH, s.fill, op * (s.fill?.[3] ?? 1));
      if (s.stroke) draw.rectStroke(worldX + frame.dx, worldY + frame.dy, worldX + frame.dx + useW, worldY + frame.dy + useH, s.stroke.color, s.stroke.width, op);
      break;
    }
    case 'circle': {
      const cx = spec.center[0] + frame.dx + worldX, cy = spec.center[1] + frame.dy + worldY;
      emitGlow(spec, draw, cx, cy, 0, 0, frame, op);
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
      if (frame.reveal < 1) pts = trimPolyline(pts, frame.reveal);
      draw.line(pts, spec.color, spec.width * frame.scaleX, op, spec.dash);
      break;
    }
    case 'math': {
      const s = spec;
      const tex = host.texFor(oid, s.latex);
      const size = s.size * frame.scaleX;
      // MathTex emits on the BASELINE; the Taffy box is sized (h+d)×size, so
      // the baseline sits h×size below the box top — the formula fills its
      // layout slot exactly instead of drifting up into the previous sibling.
      const asc = tex.measure(host.atlas).h * size;
      tex.emit(host.atlas, buff.inst, buff.crv, buff.rws, {
        x: worldX + frame.dx, y: worldY + frame.dy + asc,
        size, color: s.color, opacity: op, reveal: frame.reveal,
      });
      break;
    }
    case 'island': {
      const s = spec;
      const def = getIsland(s.island);
      const resolvedParams = resolveIslandParams(def, s.params ?? {}, fs);
      const defW = def.defaultSize?.[0] ?? 480;
      const defH = def.defaultSize?.[1] ?? 360;
      const fill = (s as any).item?.fill === true;
      // fill=true → scale content to fill the slot (reactive).
      // fill=false → keep intrinsic default size, centered in the slot (fixed).
      const scale = fill ? Math.min(boxW / defW, boxH / defH) : 1;
      const ox = worldX + (boxW - defW * scale) / 2;
      const oy = worldY + (boxH - defH * scale) / 2;
      draw.setTransform(ox, oy, scale, scale);
      const grabbedHandle = host.grabbedHandleName();
      const iCtx: IslandEmitCtx = { font: host.font, atlas: host.atlas, inst: buff.inst, crv: buff.crv, rws: buff.rws, view, now, draw, hoveredHandle: host.hoveredHandle, grabbedHandle };
      const iTime: IslandTime = { local: 0, now: now / 1000, playing: host.playing, alpha: op, build: frame.reveal };
      def.emit(iCtx, resolvedParams, iTime);
      draw.setOrigin(0, 0);
      break;
    }
  }
}

export function emitObject(host: ObjectEmitHost, oid: string, spec: ObjectSpec, frame: ObjFrame, draw: DrawHelpers, fs: FrameState, buff: EmitBuffers, view: { zoom: number; left: number; right: number; top: number; bottom: number }, now: number, op: number) {
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
      emitGlyph(host.font, s.char, s.at[0] + frame.dx, s.at[1] + frame.dy, s.size * frame.scaleX, s.color, op, buff);
      break;
    }
    case 'rect': {
      const s = spec;
      emitGlow(spec, draw, s.at[0] + frame.dx, s.at[1] + frame.dy, s.size[0] * frame.scaleX, s.size[1] * frame.scaleY, frame, op);
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
      if (frame.reveal < 1) pts = trimPolyline(pts, frame.reveal);
      draw.line(pts, s.color, s.width * frame.scaleX, op, s.dash);
      break;
    }
    case 'math': {
      const s = spec;
      const tex = host.texFor(oid, s.latex);
      tex.emit(host.atlas, buff.inst, buff.crv, buff.rws, {
        x: s.at[0] + frame.dx, y: s.at[1] + frame.dy,
        size: s.size * frame.scaleX, color: s.color, opacity: op, reveal: frame.reveal,
      });
      break;
    }
    case 'island': {
      const s = spec;
      const def = getIsland(s.island);
      const resolvedParams = resolveIslandParams(def, s.params ?? {}, fs);
      const cullRadius = def.defaultSize?.[0] ?? 200;
      if (view.left > -1e11 && (s.at[0] + cullRadius < view.left || s.at[0] - cullRadius > view.right || s.at[1] + cullRadius < view.top || s.at[1] - cullRadius > view.bottom)) break;
      const origX = s.at[0] + frame.dx, origY = s.at[1] + frame.dy;
      const defW = def.defaultSize?.[0] ?? 480, defH = def.defaultSize?.[1] ?? 360;
      const specW = (s as any).size?.[0] ?? defW, specH = (s as any).size?.[1] ?? defH;
      const scale = Math.min(specW / defW, specH / defH);
      draw.setTransform(origX, origY, scale, scale);
      const grabbedHandle = host.grabbedHandleName();
      const iCtx: IslandEmitCtx = { font: host.font, atlas: host.atlas, inst: buff.inst, crv: buff.crv, rws: buff.rws, view, now, draw, hoveredHandle: host.hoveredHandle, grabbedHandle };
      const iTime: IslandTime = { local: 0, now: now / 1000, playing: host.playing, alpha: op, build: frame.reveal };
      def.emit(iCtx, resolvedParams, iTime);
      draw.setOrigin(0, 0);
      break;
    }
  }
}
