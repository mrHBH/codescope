// ── Learning scene — "How a machine learns" ──────────────────────────────────
// Gradient descent from scratch, built to use the renderer's real capabilities
// rather than re-skin the windfoil explainer:
//   • a TRUE-3D loss landscape (LossSurface3D mesh, drawn by the mesh pipeline
//     through the shared depth buffer) that the camera physically orbits — the
//     `descent` chapter circles it while a ball rides the descent path;
//   • a 2D contour "map" of the same landscape (marching-squares isolines) that
//     sets up the 3D payoff — one function, two views;
//   • bespoke per-chapter camera tracks (banked approaches, tilts, push-ins, an
//     orbit, a pull-back) authored as keyframes — not the six stock gestures;
//   • an infinite chrome-less canvas of Taffy pages with deterministic fitObj
//     dives and a numbered-chapter visual motif.

import { scene, type ChapterBuilder } from '../builder/scene';
import type { SceneDoc, Color, Vec2 } from '../ir/types';

const C: Record<string, Color> = {
  head: [0.95, 0.96, 0.98, 1], body: [0.74, 0.76, 0.80, 1], dim: [0.53, 0.55, 0.61, 1],
  border: [0.26, 0.28, 0.33, 1],
  accent: [0.20, 0.62, 0.98, 1], violet: [0.66, 0.42, 0.92, 1],
  green: [0.32, 0.82, 0.55, 1], rose: [0.95, 0.40, 0.42, 1], gold: [0.98, 0.76, 0.34, 1],
  cyan: [0.36, 0.85, 0.97, 1], ink: [0.87, 0.89, 0.93, 1],
};

interface ChCfg { id: string; pos: Vec2; dur: number; title: string; sub: string; }
export const DESCENT_CENTER: Vec2 = [7900, -200];
const CH: ChCfg[] = [
  { id: 'splash',    pos: [0, 0],        dur: 5,  title: 'gradient descent',            sub: 'how a machine learns' },
  { id: 'fit',       pos: [1500, -400],  dur: 12, title: 'fit a line to data',          sub: '01 · the task' },
  { id: 'landscape', pos: [3100, 300],   dur: 13, title: 'error makes a landscape',     sub: '02 · the loss surface' },
  { id: 'gradient',  pos: [3000, -1100], dur: 12, title: 'slope points the way',        sub: '03 · the gradient' },
  { id: 'step',      pos: [4700, -350],  dur: 12, title: 'walk downhill',               sub: '04 · the update rule' },
  { id: 'rate',      pos: [4600, 950],   dur: 13, title: 'the step size is everything', sub: '05 · learning rate' },
  { id: 'network',   pos: [6300, 200],   dur: 12, title: 'stack the functions',         sub: '06 · a neural network' },
  { id: 'backprop',  pos: [6200, -1000], dur: 13, title: 'blame, backwards',            sub: '07 · the chain rule' },
  { id: 'descent',   pos: DESCENT_CENTER, dur: 16, title: 'the whole journey',          sub: '08 · descent in 3-D' },
  { id: 'scale',     pos: [9500, 400],   dur: 10, title: 'the same rule, a billion times', sub: '09 · why it works' },
];

const NOM_W = 1260;

export const LEARNING_DOC: SceneDoc = scene({ title: 'How a machine learns' }, (s) => {
  let cumTime = 0;
  for (const ch of CH) {
    const chB = s.chapterPage(ch.id, {
      title: ch.title, sub: ch.sub, at: ch.pos, dur: ch.dur, nominalW: NOM_W,
      noChrome: true,
      layout: chapterLayout(ch.id),
    });
    chB.start = cumTime;
    cumTime += ch.dur;
    buildChapter(chB, ch);
    authorCamera(chB, ch);
  }
});

function chapterLayout(id: string) {
  switch (id) {
    case 'splash':
      return { direction: 'row' as const, gap: 60, padding: [48, 72, 48, 72], align: 'stretch' as const };
    case 'step':
      return { direction: 'column' as const, gap: 26, padding: [44, 60, 44, 60], align: 'stretch' as const, justify: 'center' as const };
    case 'descent':
      return { direction: 'column' as const, gap: 0, padding: [26, 40, 26, 40], align: 'stretch' as const };
    case 'scale':
      return { direction: 'column' as const, gap: 30, padding: [56, 80, 56, 80], align: 'stretch' as const, justify: 'center' as const };
    default:
      return { direction: 'row' as const, gap: 48, padding: [42, 58, 42, 58], align: 'stretch' as const };
  }
}

// Numbered-chapter header motif (index · rule · kicker/title) — distinct from a
// plain accent bar.
function numHead(c: any, p: string, idx: string, kicker: string, title: string, accent: Color) {
  return c.row(p + '-head', { gap: 18, align: 'center', item: { flexShrink: 0 } }, (r: any) => {
    r.text(p + '-idx', idx, { size: 40, color: accent, item: { flexShrink: 0 } });
    r.rect(p + '-vr', { size: [2, 56], fill: C.border, item: { flexShrink: 0 } });
    r.col(p + '-hc', { gap: 3, item: { flexGrow: 1, minWidth: 60 } }, (cc: any) => {
      cc.text(p + '-kick', kicker.toUpperCase(), { size: 12, color: C.dim, item: { flexShrink: 0 } });
      cc.text(p + '-ttl', title, { size: 33, color: C.head, item: { flexShrink: 0 } });
    });
  });
}

function buildChapter(chB: ChapterBuilder, ch: ChCfg) {
  const id = ch.id;
  switch (id) {
    case 'splash': {
      chB.col('splash-left', { gap: 28, align: 'stretch', justify: 'center', item: { flexGrow: 1.05, minWidth: 400 } }, (c: any) => {
        c.text('splash-kicker', 'HOW A MACHINE LEARNS', { size: 13, color: C.cyan, item: { flexShrink: 0 } });
        c.text('splash-title', 'gradient', { size: 96, color: C.head, item: { flexShrink: 0 } });
        c.text('splash-title2', 'descent', { size: 96, color: C.accent, item: { flexShrink: 0 } });
        c.rect('splash-rule', { size: [170, 3], fill: C.accent, item: { flexShrink: 0, alignSelf: 'start', glow: { layers: 3, spread: 14 } } });
        c.text('splash-sub', 'make a guess · measure the error · step downhill', { size: 18, color: C.body, item: { flexShrink: 0 } });
      });
      chB.lIsland('splash-hero', 'gd-curve', { params: { showTangent: false }, item: { flexGrow: 1, minHeight: 480, fill: true } });
      chB.clip.fadeIn('splash-left', { start: 0, duration: 0.7 });
      chB.clip.fadeIn('splash-hero', { start: 0.2, duration: 1.0 });
      break;
    }

    case 'fit': {
      chB.lIsland('fit-hero', 'line-fit', { item: { flexGrow: 1.15, minHeight: 400, fill: true } });
      chB.col('fit-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 340 } }, (c: any) => {
        numHead(c, 'fit', '01', 'the task', 'fit a line to data', C.accent);
        c.body('fit', [
          'Measurements are the dots; a line is the model.',
          'Every slope w and intercept b makes some error.',
          'Learning means finding the pair with the least.',
        ]);
        c.math('fit-eq', 'L(w,b) = \\frac{1}{n}\\sum_i (f(x_i) - y_i)^2', { size: 25, color: C.ink, item: { flexShrink: 0 } });
      });
      chB.clip.fadeIn('fit-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('fit-hero', { start: 0.2, duration: 0.9 });
      break;
    }

    case 'landscape': {
      chB.col('land-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 340 } }, (c: any) => {
        numHead(c, 'land', '02', 'the loss surface', 'error makes a landscape', C.gold);
        c.body('land', [
          'Plot the error for every (w, b) and you get a surface —',
          'a map of how wrong the model is, everywhere at once.',
          'Low ground is a good fit. The goal is the valley floor.',
        ]);
        c.text('land-note', 'the same surface you will soon see in 3-D', { size: 15, color: C.gold, item: { flexShrink: 0 } });
      });
      chB.lIsland('landscape-hero', 'loss-contour', { params: { showPath: true }, item: { flexGrow: 1.1, minHeight: 400, fill: true } });
      chB.clip.fadeIn('land-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('landscape-hero', { start: 0.3, duration: 1.0 });
      break;
    }

    case 'gradient': {
      chB.col('grad-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 340 } }, (c: any) => {
        numHead(c, 'grad', '03', 'the gradient', 'slope points the way', C.cyan);
        c.body('grad', [
          'At any point the gradient ∇L is the direction of',
          'steepest ascent. Negate it and you face downhill —',
          'the direction that reduces the error fastest.',
        ]);
        c.math('grad-eq', '\\nabla L = [\\tfrac{\\partial L}{\\partial w},\\ \\tfrac{\\partial L}{\\partial b}]', { size: 25, color: C.ink, item: { flexShrink: 0 } });
      });
      chB.lIsland('gradient-hero', 'gd-curve', { params: { showTangent: true, showSteps: false }, item: { flexGrow: 1.15, minHeight: 400, fill: true } });
      chB.clip.fadeIn('grad-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('gradient-hero', { start: 0.2, duration: 0.9 });
      break;
    }

    case 'step': {
      chB.col('step-eqrow', { gap: 14, align: 'stretch', item: { flexShrink: 0 } }, (c: any) => {
        c.row('step-krow', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => {
          r.text('step-kicker', '04 · THE UPDATE RULE', { size: 13, color: C.dim, item: { flexShrink: 0 } });
        });
        c.row('step-mrow', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => {
          r.math('step-eq', '\\theta_{t+1} = \\theta_t - \\eta \\, \\nabla L', { size: 48, color: C.head, item: { flexShrink: 0 } });
        });
      });
      chB.lIsland('step-hero', 'gd-curve', { params: { showTangent: false, showSteps: true }, item: { flexGrow: 1, minHeight: 300, fill: true } });
      chB.clip.fadeIn('step-eqrow', { start: 0, duration: 0.6 });
      chB.clip.fadeIn('step-hero', { start: 0.3, duration: 0.9 });
      break;
    }

    case 'rate': {
      chB.lIsland('rate-hero', 'gd-curve', { params: { compare: true }, item: { flexGrow: 1.3, minHeight: 420, fill: true } });
      chB.col('rate-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 330 } }, (c: any) => {
        numHead(c, 'rate', '05', 'learning rate', 'the step size is everything', C.rose);
        c.body('rate', [
          'Too big — it overshoots and can blow up.',
          'Too small — it crawls forever.',
          'Just right — it glides straight to the minimum.',
        ]);
        c.text('rate-hint', 'drag η on the slider', { size: 15, color: C.cyan, item: { flexShrink: 0 } });
      });
      chB.clip.fadeIn('rate-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('rate-hero', { start: 0.2, duration: 0.9 });
      break;
    }

    case 'network': {
      chB.col('net-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 340 } }, (c: any) => {
        numHead(c, 'net', '06', 'a neural network', 'stack the functions', C.accent);
        c.body('net', [
          'Chain simple functions into layers and you get a',
          'network — one big, flexible function with thousands',
          'of knobs. Forward, it turns inputs into a prediction.',
        ]);
        c.math('net-eq', 'f(x) = W_2\\, a_1 + b_2', { size: 25, color: C.ink, item: { flexShrink: 0 } });
      });
      chB.lIsland('network-hero', 'network', { params: { backprop: false }, item: { flexGrow: 1.15, minHeight: 400, fill: true } });
      chB.clip.fadeIn('net-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('network-hero', { start: 0.2, duration: 0.9 });
      break;
    }

    case 'backprop': {
      chB.lIsland('backprop-hero', 'network', { params: { backprop: true }, item: { flexGrow: 1.15, minHeight: 400, fill: true } });
      chB.col('bp-copy', { gap: 18, justify: 'center', item: { flexGrow: 1, minWidth: 340 } }, (c: any) => {
        numHead(c, 'bp', '07', 'the chain rule', 'blame, backwards', C.rose);
        c.body('bp', [
          'Backpropagation walks the error backwards through',
          'the layers, handing each weight its share of the',
          'blame — the gradient of the loss with respect to it.',
        ]);
        c.math('bp-eq', '\\frac{\\partial L}{\\partial w} = \\delta \\, a', { size: 27, color: C.ink, item: { flexShrink: 0 } });
      });
      chB.clip.fadeIn('bp-copy', { start: 0, duration: 0.5 });
      chB.clip.fadeIn('backprop-hero', { start: 0.2, duration: 0.9 });
      break;
    }

    case 'descent': {
      // Empty page — the TRUE-3D loss mesh (LossSurface3D, drawn by the mesh
      // pipeline at DESCENT_CENTER) is the entire visual and the camera orbits
      // it; the cinematic HUD supplies the caption, so nothing flat competes.
      break;
    }

    case 'scale': {
      chB.row('scale-krow', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => {
        r.text('scale-kicker', '09 · WHY IT WORKS', { size: 14, color: C.green, item: { flexShrink: 0 } });
      });
      chB.row('scale-mrow', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => {
        r.math('scale-rule', '\\theta_{t+1} = \\theta_t - \\eta \\, \\nabla L', { size: 44, color: C.head, item: { flexShrink: 0 } });
      });
      chB.col('scale-copy', { gap: 12, align: 'stretch', item: { flexShrink: 0 } }, (c: any) => {
        c.row('scale-l1r', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => r.text('scale-l1', 'A modern network has around a billion parameters.', { size: 20, color: C.body, item: { flexShrink: 0 } }));
        c.row('scale-l2r', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => r.text('scale-l2', 'Gradient descent walks that billion-dimensional surface —', { size: 20, color: C.body, item: { flexShrink: 0 } }));
        c.row('scale-l3r', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => r.text('scale-l3', 'one small step at a time. That is the whole trick.', { size: 20, color: C.body, item: { flexShrink: 0 } }));
      });
      chB.row('scale-nrow', { justify: 'center', item: { flexShrink: 0 } }, (r: any) => {
        r.text('scale-n', '~1,000,000,000 weights', { size: 20, color: C.gold, item: { flexShrink: 0 } });
      });
      chB.clip.fadeIn('scale-rule', { start: 0, duration: 0.7 });
      chB.clip.fadeIn('scale-copy', { start: 0.4, duration: 0.7 });
      break;
    }
  }
}

// ── Bespoke cinematic camera per chapter ────────────────────────────────────
// Banked approaches (azimuth offsets), tilts (polar), push-ins (fitObj zoom),
// one full orbit (descent), a pull-back (scale) — authored as keyframes.
function authorCamera(chB: ChapterBuilder, ch: ChCfg) {
  const d = ch.dur, hold = d - 1.9;
  const m = chB.cam.moveTo;
  switch (ch.id) {
    case 'splash':
      m(0, { fit: 'splash', zoomMul: 1.7, polar: 0.28, azimuth: -0.32, ease: 'easeInOutCubic' });
      m(2.6, { fit: 'splash', zoomMul: 1.0, polar: 0.06, azimuth: 0, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.9, yPeriod: 17.4 } });
      break;
    case 'fit':
      m(0, { fit: 'fit', offset: [-420, 0], azimuth: -0.26, polar: 0.2, ease: 'easeInOutCubic' });
      m(3.0, { fit: 'fit', azimuth: 0, polar: 0.06, ease: 'smoothstep' });
      m(6.5, { fitObj: 'fit-hero', zoomMul: 2.2, ease: 'smoothstep' });
      m(hold, { fitObj: 'fit-hero', zoomMul: 2.2, ease: 'smoothstep' });
      break;
    case 'landscape':
      m(0, { fit: 'landscape', offset: [0, -320], polar: 0.3, azimuth: 0.22, ease: 'easeInOutCubic' });
      m(3.5, { fit: 'landscape', polar: 0.1, azimuth: 0, ease: 'smoothstep' });
      m(7.5, { fitObj: 'landscape-hero', zoomMul: 1.8, polar: 0.18, ease: 'smoothstep' });
      m(hold, { fitObj: 'landscape-hero', zoomMul: 1.8, polar: 0.18, ease: 'smoothstep' });
      break;
    case 'gradient':
      m(0, { fit: 'gradient', azimuth: 0.22, polar: 0.16, ease: 'easeInOutCubic' });
      m(3.0, { fit: 'gradient', azimuth: -0.16, polar: 0.08, ease: 'smoothstep' });
      m(6.5, { fitObj: 'gradient-hero', zoomMul: 2.0, ease: 'smoothstep' });
      m(hold, { fitObj: 'gradient-hero', zoomMul: 2.0, azimuth: -0.1, ease: 'smoothstep', drift: { azAmp: 0.05, azPeriod: 10 } });
      break;
    case 'step':
      m(0, { fit: 'step', zoomMul: 1.3, polar: 0.1, ease: 'easeInOutCubic' });
      m(2.6, { fit: 'step', zoomMul: 1.0, polar: 0.06, ease: 'smoothstep' });
      m(4.5, { fitObj: 'step-eq', zoomMul: 2.4, ease: 'smoothstep' });
      m(8.0, { fitObj: 'step-hero', zoomMul: 2.0, ease: 'smoothstep' });
      m(hold, { fitObj: 'step-hero', zoomMul: 2.0, ease: 'smoothstep' });
      break;
    case 'rate':
      m(0, { fit: 'rate', offset: [400, 0], azimuth: 0.22, polar: 0.14, ease: 'easeInOutCubic' });
      m(3.0, { fit: 'rate', azimuth: 0, polar: 0.06, ease: 'smoothstep' });
      m(7.0, { fitObj: 'rate-hero', zoomMul: 1.7, ease: 'smoothstep' });
      m(hold, { fitObj: 'rate-hero', zoomMul: 1.7, ease: 'smoothstep' });
      break;
    case 'network':
      m(0, { fit: 'network', zoomMul: 1.45, polar: 0.26, azimuth: -0.3, ease: 'easeInOutCubic' });
      m(3.4, { fit: 'network', zoomMul: 1.0, polar: 0.06, azimuth: 0, ease: 'smoothstep' });
      m(6.5, { fitObj: 'network-hero', zoomMul: 2.0, ease: 'smoothstep' });
      m(hold, { fitObj: 'network-hero', zoomMul: 2.0, ease: 'smoothstep' });
      break;
    case 'backprop':
      m(0, { fit: 'backprop', azimuth: -0.22, polar: 0.16, ease: 'easeInOutCubic' });
      m(3.0, { fit: 'backprop', azimuth: 0.16, polar: 0.08, ease: 'smoothstep' });
      m(7.0, { fitObj: 'backprop-hero', zoomMul: 1.9, ease: 'smoothstep' });
      m(hold, { fitObj: 'backprop-hero', zoomMul: 1.9, azimuth: 0.1, ease: 'smoothstep', drift: { azAmp: 0.05, azPeriod: 11 } });
      break;
    case 'descent':
      // Arrive, tilt the world into 3-D, then orbit the loss surface as the ball
      // descends — closing in, swinging round, easing off.
      m(0, { fit: 'descent', zoomMul: 1.0, polar: 0.3, azimuth: 0.2, ease: 'easeInOutCubic' });
      m(3.0, { fit: 'descent', zoomMul: 1.05, polar: 0.85, azimuth: 0.4, ease: 'smoothstep' });
      m(7.0, { fit: 'descent', zoomMul: 1.2, polar: 0.7, azimuth: 1.3, ease: 'smoothstep' });
      m(11.0, { fit: 'descent', zoomMul: 1.35, polar: 0.55, azimuth: 2.0, ease: 'smoothstep' });
      m(14.0, { fit: 'descent', zoomMul: 1.1, polar: 0.8, azimuth: 0.5, ease: 'smoothstep' });
      break;
    case 'scale':
      m(0, { fit: 'scale', zoomMul: 1.0, polar: 0.06, ease: 'easeInOutCubic' });
      m(4.0, { fit: 'scale', zoomMul: 1.35, polar: 0.16, azimuth: 0.12, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.9, yPeriod: 17.4 } });
      break;
  }
}

export { LEARNING_DOC as default };
