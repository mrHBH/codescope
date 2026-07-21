// ── Explainer scene (12 chapters) — safe Taffy pages, two-card composition ───
// Each chapter is a chapterPage: chapter timing + camera + safe Taffy layout that
// reflows when the letterbox bars toggle (pause/resume). Content chapters share a
// single composed language — a COPY panel beside a contained VISUAL panel — so the
// tour reads as one designed system rather than stacked text-over-glyph frames.

import { scene, type ChapterBuilder } from '../builder/scene';
import type { SceneDoc, Color, Vec2 } from '../ir/types';

const C: Record<string, Color> = {
  head: [0.94, 0.95, 0.97, 1], body: [0.73, 0.74, 0.77, 1], dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1], cardBg: [0.13, 0.135, 0.15, 1],
  accent: [0.12, 0.60, 0.95, 1], accent2: [0.66, 0.42, 0.92, 1],
  green: [0.30, 0.80, 0.40, 1], rose: [0.93, 0.36, 0.34, 1], gold: [0.97, 0.73, 0.33, 1],
  cyan: [0.36, 0.85, 0.97, 1], blue: [0.40, 0.64, 1.0, 1], ink: [0.85, 0.87, 0.91, 1],
};

interface ChCfg { id: string; pos: Vec2; dur: number; title: string; sub: string; cam: string; dive?: [number, number, number]; }
const CH: ChCfg[] = [
  { id: 'splash',   pos: [0, 0],        dur: 5,  title: 'windfoil',              sub: 'analytic text & vector rendering', cam: 'drop' },
  { id: 'problem',  pos: [1450, -430],  dur: 12, title: 'Text is curves',       sub: 'the problem',                      cam: 'sweep' },
  { id: 'bitmap',   pos: [3100, 230],   dur: 12, title: 'Bitmaps',              sub: 'attempt 01 · store pixels',    cam: 'dive', dive: [0.78, 0.55, 8.5] },
  { id: 'sdf',      pos: [3000, -1120], dur: 13, title: 'Distance fields',      sub: 'attempt 02 · store distance',  cam: 'dive', dive: [0.62, 0.26, 7.5] },
  { id: 'tess',     pos: [4740, -430],  dur: 12, title: 'Tessellation',         sub: 'attempt 03 · store triangles', cam: 'dive', dive: [0.78, 0.60, 8.0] },
  { id: 'answer',   pos: [4560, 900],   dur: 12, title: 'Compute the coverage', sub: 'the windfoil answer',              cam: 'dive', dive: [0.78, 0.55, 8.5] },
  { id: 'inside',   pos: [6340, 250],   dur: 12, title: 'Inside or outside',    sub: 'winding number',                   cam: 'arc' },
  { id: 'pixel',    pos: [6200, -970],  dur: 12, title: 'A pixel is an area',   sub: 'the coverage integral',            cam: 'sweep' },
  { id: 'bands',    pos: [7920, -170],  dur: 13, title: 'Only nearby edges',    sub: 'row bands',                        cam: 'rise' },
  { id: 'same',     pos: [7740, 1100],  dur: 18, title: 'One rule',             sub: 'text · icons · math · UI', cam: 'pull' },
  { id: 'gpu',      pos: [9600, 420],   dur: 10, title: 'One GPU pass',         sub: 'cpu builds · gpu integrates',  cam: 'sweep' },
  { id: 'infinite', pos: [11220, -240], dur: 10, title: 'Infinite zoom',        sub: 'recomputed, never stored',         cam: 'dive', dive: [0.78, 0.55, 11.0] },
];

const NOM_W = 1260; // nominal safe-page width

export const EXPLAINER_DOC: SceneDoc = scene({ title: 'How windfoil works' }, (s) => {
  s.param.point('covCenter', { default: [120, 200], label: 'Coverage center' });
  s.param.number('covR', { default: 60, min: 30, max: 120, label: 'Coverage radius' });
  s.param.point('windPoint', { default: [190, 275], label: 'Winding test point' });
  s.param.number('bandY', { default: 210, min: 40, max: 430, label: 'Band probe Y' });
  s.param.number('hudDetach', { default: 0, min: 0, max: 1, label: 'HUD detachment' });

  let cumTime = 0;

  for (const ch of CH) {
    const isSame = ch.id === 'same';
    const chB = s.chapterPage(ch.id, {
      title: ch.title, sub: ch.sub, at: ch.pos, dur: ch.dur, nominalW: NOM_W,
      cover: isSame,
      noChrome: isSame,
      layout: isSame
        ? { direction: 'column', gap: 0, padding: 0, align: 'stretch' }
        : { direction: 'column', gap: 22, padding: [40, 44, 40, 44], align: 'stretch' },
    });
    chB.start = cumTime;
    cumTime += ch.dur;

    // Camera: 'same' authors its own track (the living-UI dive) in buildChapter;
    // every other chapter uses a compiled gesture + a settling hold keyframe.
    if (ch.id !== 'same') {
      if (ch.cam === 'drop') chB.cam.drop();
      else if (ch.cam === 'sweep') chB.cam.sweep();
      else if (ch.cam === 'rise') chB.cam.rise();
      else if (ch.cam === 'arc') chB.cam.arc();
      else if (ch.cam === 'pull') chB.cam.pull();
      else if (ch.cam === 'dive') {
        const dv = ch.dive || [0.78, 0.55, 8.5];
        chB.cam.dive({ into: [dv[0], dv[1]] as Vec2, zoom: dv[2] });
      }
      const travel = Math.min(1.9, ch.dur * 0.42);
      const kfs = (s as any).doc.camera.keyframes;
      const last = kfs[kfs.length - 1];
      kfs.push({ time: chB.start + ch.dur - travel, fit: last.fit, offset: last.offset, zoomMul: last.zoomMul, polar: last.polar, azimuth: last.azimuth, ease: 'smoothstep' });
    }

    buildChapter(chB, ch.id, ch);
  }
});

// ── Two-card chapter composition ────────────────────────────────────────────
// A balanced pair of contained panels: a COPY card (kicker + title + body + an
// optional tail) and a VISUAL card (caption strip + a fill-scaled island, or the
// living-UI slot). `fill:true` scales the island into its slot instead of drawing
// at intrinsic size — so it can never overflow (the old "giant floating glyph").
interface SplitCfg {
  accent: Color; kicker: string; title: string; body: string[]; caption: string;
  island?: string; params?: Record<string, any>; reveal?: 'draw' | 'fade';
  hud?: boolean;               // right card holds the living-UI slot, not an island
  leftTail?: (c: any) => void; // equation / verdict / mini-row appended in copy card
}

function splitChapter(chB: ChapterBuilder, p: string, cfg: SplitCfg) {
  chB.row(p + '-split', { gap: 26, align: 'stretch', item: { flexGrow: 1, minHeight: 320 } }, (r: any) => {
    r.subpage(p + '-copy', {
      layout: { direction: 'column', gap: 16, padding: [30, 34, 30, 34], align: 'stretch', justify: 'center' },
      item: { flexGrow: 1.08, minWidth: 340 },
    }, (c: any) => {
      c.row(p + '-head', { gap: 14, align: 'center', item: { flexShrink: 0 } }, (hr: any) => {
        hr.rect(p + '-bar', { size: [6, 74], fill: cfg.accent, item: { flexShrink: 0 } });
        hr.col(p + '-hc', { gap: 5, item: { flexGrow: 1, minWidth: 60 } }, (hc: any) => {
          hc.text(p + '-kicker', cfg.kicker.toUpperCase(), { size: 13, color: C.dim, item: { flexShrink: 0 } });
          hc.text(p + '-ttl', cfg.title, { size: 40, color: C.head, item: { flexShrink: 0 } });
        });
      });
      c.col(p + '-body', { gap: 7, item: { flexShrink: 0 } }, (bc: any) => {
        cfg.body.forEach((l, i) => { if (l) bc.text(p + '-b' + i, l, { size: 19, color: C.body, item: { flexShrink: 0 } }); });
      });
      if (cfg.leftTail) cfg.leftTail(c);
    });
    r.subpage(p + '-vis', {
      layout: { direction: 'column', gap: 12, padding: [18, 18, 18, 18], align: 'stretch' },
      item: { flexGrow: 1, minWidth: 320 },
    }, (v: any) => {
      v.row(p + '-cap', { gap: 9, align: 'center', item: { flexShrink: 0 } }, (cap: any) => {
        cap.rect(p + '-led', { size: [8, 8], fill: cfg.accent, item: { flexShrink: 0 } });
        cap.text(p + '-capt', cfg.caption, { size: 12, color: C.dim, item: { flexGrow: 1 } });
      });
      if (cfg.hud) {
        v.rect(p + '-slot', { size: [10, 10], fill: [0.06, 0.065, 0.085, 1], stroke: { color: C.border, width: 1 }, item: { flexGrow: 1, minHeight: 120 } });
      } else {
        v.island(p + '-g0', cfg.island!, { params: cfg.params, item: { flexGrow: 1, minHeight: 180, fill: true } });
      }
    });
  });
  chB.clip.fadeIn(p + '-copy', { start: 0, duration: 0.5 });
  chB.clip.fadeIn(p + '-vis', { start: 0.25, duration: 0.5 });
  if (cfg.hud) chB.clip.fadeIn(p + '-slot', { start: 0.5, duration: 0.7 });
  else if (cfg.reveal === 'draw') chB.clip.draw(p + '-g0', { start: 0.4, duration: 1.4 });
  else chB.clip.fadeIn(p + '-g0', { start: 0.5, duration: 0.8 });
}

function chipRow(c: any, p: string, items: [string, Color][], opts: { labelColor?: Color; size?: number } = {}) {
  const lc = opts.labelColor ?? C.body, sz = opts.size ?? 16;
  c.row(p + '-chips', { gap: 16, align: 'center', item: { flexShrink: 0 } }, (rr: any) => {
    items.forEach(([lab, col], i) => {
      rr.row(p + '-chip' + i, { gap: 8, align: 'center', item: { flexShrink: 0 } }, (ch: any) => {
        ch.rect(p + '-chipd' + i, { size: [10, 24], fill: col, item: { flexShrink: 0 } });
        ch.text(p + '-chipl' + i, lab, { size: sz, color: lc, item: { flexShrink: 0 } });
      });
    });
  });
}

// ── Per-chapter content ─────────────────────────────────────────────────────
function buildChapter(chB: ChapterBuilder, id: string, ch: ChCfg) {
  switch (id) {
    case 'splash': {
      chB.lRect('spacer-top', { size: [100, 1], fill: [0, 0, 0, 0], item: { flexGrow: 1, minHeight: 40 } });
      chB.col('splash-centre', { gap: 16, align: 'center', item: { flexShrink: 0 } }, (c: any) => {
        c.text('splash-title', 'windfoil', { size: 160, color: C.head });
        c.text('splash-sub', 'ANALYTIC TEXT & VECTOR RENDERING', { size: 22, color: C.dim });
      });
      chB.lRect('spacer-bot', { size: [100, 1], fill: [0, 0, 0, 0], item: { flexGrow: 1, minHeight: 40 } });
      break;
    }
    case 'problem':
      splitChapter(chB, 'prob', {
        accent: C.accent, kicker: 'The problem', title: 'Text is curves.',
        body: ['A glyph is a smooth outline — Bézier curves, not pixels.', 'But a screen is a grid of squares. So for every pixel, the', 'renderer must answer one deceptively simple question:'],
        caption: 'LIVE · DRAG THE CURVE', island: 'glyph-analytic', reveal: 'draw',
        leftTail: (c: any) => c.text('prob-q', 'how much of this pixel is covered by ink?', { size: 22, color: C.cyan, item: { flexShrink: 0 } }),
      });
      break;
    case 'bitmap':
      splitChapter(chB, 'bm', {
        accent: C.rose, kicker: 'Attempt 01', title: 'Bitmaps.',
        body: ['Bake the glyph into a fixed grid of pixels once, then paste.', 'Fast and dead simple — but the answer is frozen at one size.', 'Zoom in and the pixels themselves become the picture.'],
        caption: 'FROZEN · ONE SIZE', island: 'bitmap-dissolve', reveal: 'draw',
        leftTail: (c: any) => chipRow(c, 'bm', [['coverage = guessed', C.rose]]),
      });
      break;
    case 'sdf':
      splitChapter(chB, 'sdf', {
        accent: C.gold, kicker: 'Attempt 02', title: 'Distance fields.',
        body: ['Store distance to the nearest edge, not the colour — the bands.', 'It scales better than a bitmap, but the field is still sampled.', 'Corners round off, and thin strokes pinch away.'],
        caption: 'SAMPLED · ROUNDED', island: 'sdf-field', reveal: 'draw',
        leftTail: (c: any) => chipRow(c, 'sdf', [['coverage = approximated', C.gold]]),
      });
      break;
    case 'tess':
      splitChapter(chB, 'tess', {
        accent: C.accent2, kicker: 'Attempt 03', title: 'Tessellation.',
        body: ['Flatten curves into triangles the GPU can rasterize directly.', 'White is the true curve; violet is the faceted approximation.'],
        caption: 'FACETED · SAMPLED', island: 'tessellation-fan', reveal: 'draw',
        leftTail: (c: any) => chipRow(c, 'tess', [['coverage = still sampled', C.accent2]]),
      });
      break;
    case 'answer':
      splitChapter(chB, 'ans', {
        accent: C.green, kicker: 'The windfoil answer', title: 'Compute the coverage.',
        body: ["Don't store the answer. Don't approximate it.", 'For each pixel, integrate exactly how much area the', 'curve covers — recomputed at every zoom.'],
        caption: 'EXACT · ANY ZOOM', island: 'glyph-analytic', reveal: 'draw',
        leftTail: (c: any) => c.math('ans-eq0', 'F = \\frac{1}{A}\\iint_B w(x,y)\\,dA', { size: 30, color: C.ink, item: { flexShrink: 0 } }),
      });
      chB.clip.fadeIn('ans-eq0', { start: 0.8, duration: 1.0 });
      break;
    case 'inside':
      splitChapter(chB, 'in', {
        accent: C.accent, kicker: 'Winding number', title: 'Inside or outside?',
        body: ['Shoot a ray from a point and count boundary crossings.', 'Odd means inside; even means outside. Drag the point.'],
        caption: 'DRAG THE TEST POINT', island: 'winding-ray',
        params: { testPoint: { $param: 'windPoint' } },
        leftTail: (c: any) => c.math('in-eq0', 'w(p)=\\frac{1}{2\\pi}\\oint_{\\partial S} d\\theta', { size: 26, color: C.ink, item: { flexShrink: 0 } }),
      });
      chB.clip.fadeIn('in-eq0', { start: 0.8, duration: 1.0 });
      break;
    case 'pixel':
      splitChapter(chB, 'px', {
        accent: C.accent, kicker: 'The coverage integral', title: 'A pixel is an area.',
        body: ['Sweep across the pixel footprint. Each scanline contributes', 'a covered length; their sum is exact coverage F. Drag the circle.'],
        caption: 'DRAG THE COVERAGE DISC', island: 'coverage-sweep',
        params: { center: { $param: 'covCenter' }, radius: { $param: 'covR' } },
      });
      break;
    case 'bands':
      splitChapter(chB, 'bd', {
        accent: C.accent, kicker: 'Row bands', title: 'Only nearby edges.',
        body: ['A glyph has hundreds of curve pieces. Bands sort by row,', 'so each pixel tests only nearby edges. Drag the probe line.'],
        caption: 'DRAG THE PROBE LINE', island: 'band-probe',
        params: { bandY: { $param: 'bandY' } },
        leftTail: (c: any) => c.math('bd-eq0', 'rows[y_0 \\,..\\, y_1]', { size: 26, color: C.ink, item: { flexShrink: 0 } }),
      });
      chB.clip.fadeIn('bd-eq0', { start: 0.8, duration: 1.0 });
      break;
    case 'same': {
      // Living UI: instant peel at t=0.  Phase 1 (0 → 6 s) — smoothstep
      // from the full-bleed centre down-left to the beginning of the
      // timeline.  Phase 2 (6 → 15 s) — smoothstep across the strip to the
      // scrubber at 14× / 52° polar.  Pull-back is 1.5 s, then instant
      // reattach + drift.  The fitPoint y stays slightly above the bar edge
      // so the true cinematic bar is never seen below the viewport.
      chB.lRect('sm-slot', {
        size: [10, 10],
        fill: [0, 0, 0, 0],
        item: { flexGrow: 1 },
      });

      chB.clip.param('hudDetach', { start: 0, duration: 0.01, to: 1 });
      chB.clip.param('hudDetach', { start: 17.0, duration: 0.01, to: 0 });

      chB.cam.moveTo(0.0, { fitObj: 'sm-slot', zoomMul: 1.0, polar: 0.0, ease: 'smoothstep' });
      chB.cam.moveTo(6.0, { fitObj: 'sm-slot', fitPoint: [0.12, 0.89], zoomMul: 4.0, polar: 0.14, azimuth: 0.04, ease: 'smoothstep' });
      chB.cam.moveTo(15.0, { fitObj: 'sm-slot', fitPoint: [0.72, 0.91], zoomMul: 14.0, polar: 0.52, azimuth: 0.24, ease: 'smoothstep' });
      chB.cam.moveTo(15.5, { fitObj: 'sm-slot', fitPoint: [0.72, 0.91], zoomMul: 14.0, polar: 0.52, azimuth: 0.24, ease: 'smoothstep' });
      chB.cam.moveTo(17.0, { fitObj: 'sm-slot', zoomMul: 1.0, polar: 0.0, azimuth: 0.0, ease: 'easeInOutCubic' });
      chB.cam.moveTo(17.2, { fit: 'same', ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
      break;
    }
    case 'gpu':
      splitChapter(chB, 'gpu', {
        accent: C.accent, kicker: 'The pipeline', title: 'One GPU pass.',
        body: ['Here is one actual glyph moving through windfoil:', 'outline curves become row-indexed pieces; an instance', 'points at those rows; the shader asks only nearby edges.'],
        caption: 'CPU BUILDS · GPU INTEGRATES', island: 'gpu-pipeline',
        leftTail: (c: any) => c.math('gpu-eq0', 'color = \\sum_i c_i', { size: 26, color: C.ink, item: { flexShrink: 0 } }),
      });
      chB.clip.fadeIn('gpu-eq0', { start: 1.0, duration: 1.0 });
      break;
    case 'infinite':
      splitChapter(chB, 'inf', {
        accent: C.green, kicker: 'The payoff', title: 'Infinite zoom.',
        body: ['Dive far past UI scale — the edge stays perfectly smooth,', 'because it is recomputed on the spot, never stored.', 'Everything you just watched is drawn exactly this way.'],
        caption: 'RECOMPUTED · NEVER STORED', island: 'glyph-analytic', reveal: 'draw',
      });
      break;
  }
}

export { EXPLAINER_DOC as default };
