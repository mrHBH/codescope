// ── Explainer scene (12 chapters) — builder script ───────────────────────────
// Reproduces the full windfoil explainer via the authoring builder API.

import { scene } from '../builder/scene';
import type { SceneDoc } from '../ir/types';

// ── Constants (from explainer.ts) ──────────────────────────────────────────
const SEC_W = 1260, SEC_H = 820, TRAVEL = 1.9, GLYPH = 'a';
const LX = 76, RX = 700, TW = 580, VXW = 470;

const C = {
  head: [0.94, 0.95, 0.97, 1] as const, body: [0.73, 0.74, 0.77, 1] as const, dim: [0.55, 0.56, 0.60, 1] as const,
  border: [0.25, 0.26, 0.30, 1] as const, panelBg: [0.10, 0.105, 0.12, 1] as const, cardBg: [0.13, 0.135, 0.15, 1] as const,
  accent: [0.12, 0.60, 0.95, 1] as const, accent2: [0.66, 0.42, 0.92, 1] as const,
  green: [0.30, 0.80, 0.40, 1] as const, rose: [0.93, 0.36, 0.34, 1] as const, gold: [0.97, 0.73, 0.33, 1] as const,
  cyan: [0.36, 0.85, 0.97, 1] as const, blue: [0.40, 0.64, 1.0, 1] as const, ink: [0.85, 0.87, 0.91, 1] as const,
};

// Chapter config
interface ChCfg { id: string; pos: [number, number]; dur: number; title: string; sub: string; flip: boolean; cam: string; dive?: [number, number, number]; }
const CH: ChCfg[] = [
  { id: 'splash',   pos: [0, 0],        dur: 5,  title: 'windfoil',              sub: 'analytic text & vector rendering', flip: false, cam: 'drop' },
  { id: 'problem',  pos: [1450, -430],  dur: 12, title: 'Text is curves',       sub: 'the problem',                      flip: false, cam: 'sweep' },
  { id: 'bitmap',   pos: [3100, 230],   dur: 12, title: 'Bitmaps',              sub: 'attempt 01 \u00B7 store pixels',    flip: true,  cam: 'dive', dive: [0.78, 0.55, 8.5] },
  { id: 'sdf',      pos: [3000, -1120], dur: 13, title: 'Distance fields',      sub: 'attempt 02 \u00B7 store distance',  flip: false, cam: 'dive', dive: [0.62, 0.26, 7.5] },
  { id: 'tess',     pos: [4740, -430],  dur: 12, title: 'Tessellation',         sub: 'attempt 03 \u00B7 store triangles', flip: true,  cam: 'dive', dive: [0.78, 0.60, 8.0] },
  { id: 'answer',   pos: [4560, 900],   dur: 12, title: 'Compute the coverage', sub: 'the windfoil answer',              flip: false, cam: 'dive', dive: [0.78, 0.55, 8.5] },
  { id: 'inside',   pos: [6340, 250],   dur: 12, title: 'Inside or outside',    sub: 'winding number',                   flip: true,  cam: 'arc' },
  { id: 'pixel',    pos: [6200, -970],  dur: 12, title: 'A pixel is an area',   sub: 'the coverage integral',            flip: false, cam: 'sweep' },
  { id: 'bands',    pos: [7920, -170],  dur: 13, title: 'Only nearby edges',    sub: 'row bands',                        flip: true,  cam: 'rise' },
  { id: 'same',     pos: [7740, 1100],  dur: 8,  title: 'One rule',             sub: 'text · icons · math · UI',         flip: false, cam: 'pull' },
  { id: 'gpu',      pos: [9600, 420],   dur: 10, title: 'One GPU pass',         sub: 'cpu builds · gpu integrates',      flip: true,  cam: 'sweep' },
  { id: 'infinite', pos: [11220, -240], dur: 10, title: 'Infinite zoom',        sub: 'recomputed, never stored',         flip: false, cam: 'dive', dive: [0.78, 0.55, 11.0] },
];

function txOff(flip: boolean) { return flip ? RX : LX; }
function vxOff(flip: boolean) { return flip ? LX : RX; }

// ── Builder script ─────────────────────────────────────────────────────────
export const EXPLAINER_DOC: SceneDoc = scene({ title: 'How windfoil works' }, (s) => {
  // Params are island-local (handles resolve relative to island origin)
  s.param.point('covCenter', { default: [120, 200], label: 'Coverage center' });
  s.param.number('covR', { default: 60, min: 30, max: 120, label: 'Coverage radius' });
  s.param.point('windPoint', { default: [190, 275], label: 'Winding test point' });
  s.param.number('bandY', { default: 210, min: 40, max: 430, label: 'Band probe Y' });

  // A cumulative time counter for sequential chapter starts
  let cumTime = 0;

  for (let i = 0; i < CH.length; i++) {
    const ch = CH[i];
    const cxw = ch.pos[0], cyw = ch.pos[1];
    // CHAPTER-RELATIVE column offsets: abs() will add cxw/cyw
    const tx = txOff(ch.flip), vx = vxOff(ch.flip);
    const dt = ch.dur;

    // Create the chapter group
    const chB = s.chapter(ch.id, { title: ch.title, sub: ch.sub, at: [cxw, cyw], dur: dt, size: [SEC_W, SEC_H] });
    chB.start = cumTime;
    cumTime += dt;

    // Camera gestures — dive targets the glyph visual box (matches original explainer)
    const glyphBox = { at: [cxw + vx, cyw + 150] as [number, number], size: [VXW, 540] as [number, number] };
    if (ch.cam === 'drop') chB.cam.drop();
    else if (ch.cam === 'sweep') chB.cam.sweep();
    else if (ch.cam === 'rise') chB.cam.rise();
    else if (ch.cam === 'arc') chB.cam.arc();
    else if (ch.cam === 'pull') chB.cam.pull();
    else if (ch.cam === 'dive') {
      const dv = ch.dive || [0.78, 0.55, 8.5];
      chB.cam.dive({ into: [dv[0], dv[1]] as [number, number], zoom: dv[2], box: glyphBox });
    }

    // Add hold keyframe at chapter end so camera doesn't drift between chapters
    const travel = Math.min(1.9, dt * 0.42);
    // Copy the last keyframe's position (fit, offset, zoomMul) to hold it
    const kfs = (s as any).doc.camera.keyframes;
    const last = kfs[kfs.length - 1];
    kfs.push({ time: chB.start + dt - travel, fit: last.fit, offset: last.offset, zoomMul: last.zoomMul, polar: last.polar, azimuth: last.azimuth, ease: 'smoothstep' });

    // ── Chapter-specific content ─────────────────────────────────────────
    switch (ch.id) {
      case 'splash': {
        chB.text('splash-title', 'windfoil', { at: [SEC_W / 2 - 160, SEC_H / 2 - 80], size: 160, color: [...C.head] });
        chB.text('splash-sub', 'ANALYTIC TEXT & VECTOR RENDERING', { at: [SEC_W / 2 - 460, SEC_H / 2 + 84], size: 22, color: [...C.dim] });
        break;
      }
      case 'problem': {
        addHead(chB, 'problem', tx, 80, 'The problem', 'Text is curves.', [...C.accent]);
        addBody(chB, 'problem', tx, 200, [
          'A glyph is a smooth outline \u2014 Bezier curves, not pixels.',
          'But a screen is a grid of pixels. So for every pixel,',
          'the renderer must answer one deceptively simple question:',
        ]);
        chB.text('problem-q', 'how much of this pixel is covered by ink?', { at: [tx, 340], size: 28, color: [...C.cyan] });
        // Full-res glyph visual
        chB.island('problem-g0', 'glyph-analytic', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('problem-g0', { start: 0, duration: 1.5 });
        break;
      }
      case 'bitmap': {
        addHead(chB, 'bitmap', tx, 80, 'Attempt 01', 'Bitmaps.', [...C.rose]);
        addBody(chB, 'bitmap', tx, 200, [
          'Bake the glyph into a fixed grid of pixels once, then paste it.',
          'Fast and dead simple \u2014 but the answer is frozen at one size.',
          'Zoom in and the pixels themselves become the picture.',
        ]);
        addVerdict(chB, 'bitmap', tx, 340, 'coverage = guessed', [...C.rose]);
        chB.island('bitmap-g0', 'bitmap-dissolve', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('bitmap-g0', { start: 0, duration: 1.5 });
        break;
      }
      case 'sdf': {
        addHead(chB, 'sdf', tx, 80, 'Attempt 02', 'Distance fields.', [...C.gold]);
        addBody(chB, 'sdf', tx, 200, [
          'Store distance to the nearest edge, not the color \u2014 the bands.',
          'It scales better than a bitmap, but the field is still sampled.',
          'Corners round off, and thin strokes pinch away.',
        ]);
        addVerdict(chB, 'sdf', tx, 340, 'coverage = approximated', [...C.gold]);
        chB.island('sdf-g0', 'sdf-field', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('sdf-g0', { start: 0, duration: 1.5 });
        break;
      }
      case 'tess': {
        addHead(chB, 'tess', tx, 80, 'Attempt 03', 'Tessellation.', [...C.accent2]);
        addBody(chB, 'tess', tx, 200, [
          'Flatten curves into triangles the GPU can rasterize directly.',
          'White is the true curve; gold is the faceted approximation.',
        ]);
        addVerdict(chB, 'tess', tx, 340, 'coverage = still sampled', [...C.accent2]);
        chB.island('tess-g0', 'tessellation-fan', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('tess-g0', { start: 0, duration: 1.5 });
        break;
      }
      case 'answer': {
        addHead(chB, 'answer', tx, 80, 'The windfoil answer', 'Compute the coverage.', [...C.green]);
        addBody(chB, 'answer', tx, 200, [
          "Don\u2019t store the answer. Don\u2019t approximate it.",
          'For each pixel, integrate exactly how much area the curve covers.',
          'Recomputed at every zoom \u2014 sharp at any scale.',
        ]);
        chB.math('answer-eq0', 'F = \\frac{1}{A}\\iint_B w(x,y)\\,dA', { at: [tx, 360], size: 38, color: [...C.ink] });
        chB.clip.fadeIn('answer-eq0', { start: 0, duration: 1.2 });
        chB.island('answer-g0', 'glyph-analytic', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('answer-g0', { start: 0, duration: 1.5 });
        break;
      }
      case 'inside': {
        addHead(chB, 'inside', tx, 80, 'Winding number', 'Inside or outside?', [...C.accent]);
        addBody(chB, 'inside', tx, 200, [
          'Shoot a ray from a point and count boundary crossings.',
          'Odd means inside; even means outside. Drag the point.',
        ]);
        chB.island('inside-g0', 'winding-ray', {
          at: [vx, 125], size: [VXW, 585],
          params: { testPoint: { $param: 'windPoint' } },
        });
        chB.clip.fadeIn('inside-g0', { start: 0, duration: 1.2 });
        break;
      }
      case 'pixel': {
        addHead(chB, 'pixel', tx, 80, 'The coverage integral', 'A pixel is an area.', [...C.accent]);
        addBody(chB, 'pixel', tx, 200, [
          'Sweep across the pixel footprint. Each scanline contributes',
          'a covered length; their sum is exact coverage F. Drag the circle.',
        ]);
        chB.island('pixel-g0', 'coverage-sweep', {
          at: [vx, 125], size: [VXW, 585],
          params: { center: { $param: 'covCenter' }, radius: { $param: 'covR' } },
        });
        chB.clip.fadeIn('pixel-g0', { start: 0, duration: 1.2 });
        break;
      }
      case 'bands': {
        addHead(chB, 'bands', tx, 80, 'Row bands', 'Only nearby edges.', [...C.accent]);
        addBody(chB, 'bands', tx, 200, [
          'A glyph has hundreds of curve pieces. Bands sort by row,',
          'so each pixel tests only nearby edges. Drag the probe line.',
        ]);
        chB.island('bands-g0', 'band-probe', {
          at: [vx, 125], size: [VXW, 585],
          params: { bandY: { $param: 'bandY' } },
        });
        chB.clip.fadeIn('bands-g0', { start: 0, duration: 1.2 });
        break;
      }
      case 'same': {
        addHead(chB, 'same', tx, 80, 'One rule', 'Everything is contours.', [...C.accent]);
        addBody(chB, 'same', tx, 200, [
          'Once every shape is a filled outline, a single coverage rule',
          'renders text, icons, math and UI \u2014 no special cases.',
        ]);
        // Four cards in a 2x2 grid
        for (let k = 0; k < 4; k++) {
          const gx = vx + (k % 2) * 215, gy = 200 + Math.floor(k / 2) * 245;
          chB.rect(`same-card-${k}`, { at: [gx, gy], size: [190, 215], fill: [...C.cardBg], stroke: { color: [...C.border], width: 1.3 } });
          const labels = ['text', 'icon', 'math', 'ui'];
          chB.text(`same-label-${k}`, labels[k], { at: [gx + 95, gy + 190], size: 14, color: [...C.body] });
        }
        chB.clip.fadeIn('same-card-0', { start: 0, duration: 0.5 });
        chB.clip.fadeIn('same-card-1', { start: 0.5, duration: 0.5 });
        chB.clip.fadeIn('same-card-2', { start: 1.0, duration: 0.5 });
        chB.clip.fadeIn('same-card-3', { start: 1.5, duration: 0.5 });
        break;
      }
      case 'gpu': {
        addHead(chB, 'gpu', tx, 80, 'The pipeline', 'One GPU pass.', [...C.accent]);
        addBody(chB, 'gpu', tx, 200, [
          'Here is one actual glyph moving through windfoil:',
          'outline curves become row-indexed pieces; an instance',
          'points at those rows; the shader asks only nearby edges.',
        ]);
        chB.island('gpu-g0', 'tessellation-fan', { at: [vx, 140], size: [280, 330] });
        chB.clip.draw('gpu-g0', { start: 0, duration: 1 });
        const pipeLabels = ['outline curves', 'monotone pieces', 'row bands', 'instance: bbox + rowBase', 'shader: gather + integrate'];
        for (let k = 0; k < 5; k++) {
          const yy = 140 + k * 72;
          chB.rect(`gpu-pipe-${k}`, { at: [vx + 320, yy], size: [250, 52], fill: [...C.cardBg], stroke: { color: [...C.border], width: 1.3 } });
          chB.text(`gpu-pl-${k}`, pipeLabels[k], { at: [vx + 336, yy + 17], size: 17, color: [...C.body] });
          chB.clip.fadeIn(`gpu-pipe-${k}`, { start: k * 0.3, duration: 0.4 });
        }
        break;
      }
      case 'infinite': {
        addHead(chB, 'infinite', tx, 80, 'The payoff', 'Infinite zoom.', [...C.green]);
        addBody(chB, 'infinite', tx, 200, [
          'Dive far past UI scale \u2014 the edge stays perfectly smooth,',
          'because it is recomputed on the spot, never stored.',
          'Everything you just watched is drawn exactly this way.',
        ]);
        chB.island('infinite-g0', 'glyph-analytic', { at: [vx, 125], size: [VXW, 585] });
        chB.clip.draw('infinite-g0', { start: 0, duration: 1.5 });
        break;
      }
    }
  }
});

// ── Helper functions ──────────────────────────────────────────────────────────
function cx0(i: number) { return CH[i].pos[0]; }
function cy0(i: number) { return CH[i].pos[1]; }

function addHead(chB: any, prefix: string, tx: number, y: number, kicker: string, ttl: string, accent: number[]) {
  // Solid accent bar only — matches original explainer (no soft glow blob)
  chB.rect(prefix + '-bar', { at: [tx - 28, y + 2], size: [6, 78], fill: [...accent] });
  chB.text(prefix + '-kicker', kicker.toUpperCase(), { at: [tx, y], size: 14, color: [...C.dim] });
  chB.text(prefix + '-ttl', ttl, { at: [tx, y + 30], size: 40, color: [...C.head] });
}

function addBody(chB: any, prefix: string, tx: number, y: number, lines: string[]) {
  lines.forEach((l, k) => {
    if (l) chB.text(prefix + '-l' + k, l, { at: [tx, y + k * 32], size: 20, color: [...C.body] });
  });
}

function addVerdict(chB: any, prefix: string, tx: number, y: number, label: string, col: number[]) {
  chB.rect(prefix + '-chip', { at: [tx, y], size: [14, 28], fill: [...col] });
  chB.text(prefix + '-label', label, { at: [tx + 26, y + 2], size: 23, color: [...col] });
}
