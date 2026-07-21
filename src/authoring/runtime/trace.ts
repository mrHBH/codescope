// ── Glyph-trace camera paths ────────────────────────────────────────────────
// Resolves a glyph/island's world outline from layout boxes + glyphQuads,
// arc-length-parameterizes it, and expands into camera keyframes that make the
// camera follow the ink.

import type { SceneDoc, CameraKeyframe, Vec2, EasingName } from '../ir/types';
import { glyphQuads } from '../../windfoil/font';
import type { LayoutMap } from '../layout/solve';

/** A sampled point on the outline. */
export interface TraceSample { x: number; y: number; arcLen: number; }

/**
 * Flatten glyph outline into an arc-length-parameterized polyline.
 * `sub` = cubic-to-quad subdivision level (higher = smoother).
 */
export function glyphOutline(
  font: any, char: string,
  sub = 4,
): TraceSample[] {
  if (!font || !font.charToGlyph) return []; // no font available
  const g = glyphQuads(font, char);
  if (!g) return [];

  // glyphQuads returns quads as [x0,y0, x1,y1, x2,y2, x3,y3, ...] (6 values per quad)
  const pts: [number, number][] = [];
  for (let i = 0; i < g.quads.length; i += 6) {
    const x0 = g.quads[i], y0 = g.quads[i + 1];
    const x1 = g.quads[i + 2], y1 = g.quads[i + 3];
    const x2 = g.quads[i + 4], y2 = g.quads[i + 5];
    // Subdivide quadratic Bézier
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
      const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      pts.push([x, y]);
    }
  }
  // Add the endpoint of the last quad to close
  if (g.quads.length >= 6) {
    const last = g.quads.length - 6;
    pts.push([g.quads[last + 4], g.quads[last + 5]]);
  }

  if (pts.length === 0) return [];

  // Compute arc lengths
  const samples: TraceSample[] = [{ x: pts[0][0], y: pts[0][1], arcLen: 0 }];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    samples.push({ x: pts[i][0], y: pts[i][1], arcLen: total });
  }
  return samples;
}

/**
 * Resample an arc-length-parameterized outline into N evenly-spaced points.
 */
export function resampleOutline(
  samples: TraceSample[],
  n: number,
): { x: number; y: number }[] {
  if (samples.length < 2 || n <= 0) return [];
  const total = samples[samples.length - 1].arcLen;
  if (total <= 0) return Array(n).fill({ x: samples[0].x, y: samples[0].y });

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    // Find the segment containing target
    let lo = 0, hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].arcLen < target) lo = mid;
      else hi = mid;
    }
    const s0 = samples[lo], s1 = samples[hi];
    const segLen = s1.arcLen - s0.arcLen;
    const t = segLen > 1e-9 ? (target - s0.arcLen) / segLen : 0;
    const cx = s0.x + (s1.x - s0.x) * t;
    const cy = s0.y + (s1.y - s0.y) * t;
    result.push({ x: cx, y: cy });
  }
  return result;
}

/**
 * Expand a glyph trace into camera keyframes.
 * `font` — the loaded font (for glyphQuads).
 * `char` — the glyph character to trace.
 * `box` — world-space bounding box of the glyph (from layout or spec).
 * `opts.zoom` — deep zoom multiplier along the trace.
 * `opts.d` — total seconds for the trace.
 * `opts.samples` — number of keyframes (default 48).
 * `opts.startTime` — absolute time for the first keyframe.
 * `opts.pullBack` — if true, add a final keyframe back to the full chapter fit.
 * `opts.fitId` — chapter group id for the pull-back keyframe.
 */
export function traceToKeyframes(
  font: any,
  char: string,
  box: { x: number; y: number; w: number; h: number },
  opts: {
    zoom: number;
    d: number;
    samples?: number;
    startTime: number;
    pullBack?: boolean;
    fitId?: string;
  },
): CameraKeyframe[] {
  const { zoom, d, startTime } = opts;
  const n = opts.samples ?? 48;
  const outline = glyphOutline(font, char);

  if (outline.length < 2) {
    // Fallback: single keyframe at box center
    const kfs: CameraKeyframe[] = [{
      time: startTime,
      center: [box.x + box.w / 2, box.y + box.h / 2] as Vec2,
      zoom,
      ease: 'linear' as EasingName,
    }];
    if (opts.pullBack && opts.fitId) {
      kfs.push({
        time: startTime + d + 1.0,
        fit: opts.fitId,
        ease: 'easeInOutCubic' as EasingName,
        drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 },
      });
    }
    return kfs;
  }

  // Map outline from glyph space to world space
  let minX = outline[0].x, minY = outline[0].y;
  let maxX = minX, maxY = minY;
  for (const s of outline) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  const gw = maxX - minX, gh = maxY - minY;
  const sc = gh > 0 ? box.h / gh : 1;
  // Center the glyph in the box
  const ox = box.x + (box.w - gw * sc) / 2 - minX * sc;
  const oy = box.y + (box.h - gh * sc) / 2 - minY * sc;

  const points = resampleOutline(outline, n);
  const dt = d / n;
  const kfs: CameraKeyframe[] = [];

  for (let i = 0; i < points.length; i++) {
    kfs.push({
      time: startTime + i * dt,
      center: [ox + points[i].x * sc, oy + points[i].y * sc] as Vec2,
      zoom,
      ease: 'linear' as EasingName,
    });
  }

  // Optional pull-back to chapter fit
  if (opts.pullBack && opts.fitId) {
    const endTime = startTime + d;
    kfs.push({
      time: endTime + 1.0,
      fit: opts.fitId,
      ease: 'easeInOutCubic' as EasingName,
      drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 },
    });
  }

  return kfs;
}

/**
 * Resolve the world-space box of an object from layout or spec fallback.
 */
export function resolveObjectBox(
  doc: SceneDoc,
  oid: string,
  layoutMap: LayoutMap,
): { x: number; y: number; w: number; h: number } | null {
  const local = layoutMap.get(oid);
  const spec = doc.objects[oid] as any;
  if (!spec) return null;

  if (local) {
    // Find the page that contains this object
    for (const [pid, pspec] of Object.entries(doc.objects)) {
      const p = pspec as any;
      if (p.kind !== 'group' || !p.page) continue;
      // Walk children recursively
      const findInChildren = (gid: string): boolean => {
        const g = doc.objects[gid] as any;
        if (!g || g.kind !== 'group') return false;
        if (g.children?.includes(oid)) return true;
        for (const cid of (g.children ?? [])) {
          if (doc.objects[cid]?.kind === 'group' && findInChildren(cid)) return true;
        }
        return false;
      };
      if (!findInChildren(pid)) continue;
      const isSafe = !!p.page?.safe;
      const pw = p.size?.[0] ?? 1260;
      const ph = p.size?.[1] ?? 820;
      const ox = isSafe ? p.at[0] - pw / 2 : p.at[0];
      const oy = isSafe ? p.at[1] - ph / 2 : p.at[1];
      return { x: ox + local.x, y: oy + local.y, w: local.w, h: local.h };
    }
  }

  // Fallback: use spec position
  if (spec.kind === 'island') {
    const sz = spec.size ?? [480, 360];
    return { x: spec.at[0], y: spec.at[1], w: sz[0], h: sz[1] };
  }
  if (spec.at) {
    const sz = spec.size ?? [100, 100];
    return { x: spec.at[0], y: spec.at[1], w: sz[0], h: sz[1] };
  }
  return null;
}
