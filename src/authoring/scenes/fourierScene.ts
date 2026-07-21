// ── Fourier Series Explainer (v3) — 8 chapters, varied layouts ───────────────
// Explains how any periodic function can be decomposed into sine waves.
// Each chapter uses a different layout archetype. Infinite canvas (noChrome: true).
// All content rendered through the analytic pipeline.

import { scene, type ChapterBuilder } from '../builder/scene';
import type { SceneDoc, Color, Vec2 } from '../ir/types';

const C: Record<string, Color> = {
  head:     [0.94, 0.95, 0.97, 1],
  text:     [0.80, 0.80, 0.80, 1],
  textDim:  [0.53, 0.53, 0.53, 1],
  border:   [0.20, 0.20, 0.20, 1],
  bgAlt:    [0.176, 0.176, 0.188, 1],
  accent:   [0.00, 0.48, 0.80, 1],
  accent2:  [0.61, 0.30, 0.87, 1],
  success:  [0.25, 0.73, 0.31, 1],
  gold:     [0.97, 0.73, 0.33, 1],
  cyan:     [0.36, 0.85, 0.97, 1],
  green:    [0.30, 0.80, 0.40, 1],
  rose:     [0.93, 0.36, 0.34, 1],
  ink:      [0.85, 0.87, 0.91, 1],
};

interface ChCfg {
  id: string; pos: Vec2; dur: number;
  title: string; sub: string;
  cam: string;
  dive?: [number, number, number];
}

const CH: ChCfg[] = [
  { id: 'splash',   pos: [0, 0],        dur: 5,  title: 'Fourier Series',    sub: 'ANY PERIODIC FUNCTION IS A SUM OF SINES',   cam: 'drop' },
  { id: 'sound',    pos: [1450, -430],  dur: 10, title: 'Sound is vibration', sub: 'PERIODIC MOTION IN THE AIR',                cam: 'sweep' },
  { id: 'sine',     pos: [3100, 230],   dur: 12, title: 'The building block', sub: 'SINE WAVES',                                 cam: 'dive', dive: [0.72, 0.50, 5.0] },
  { id: 'freq',     pos: [3000, -1120], dur: 12, title: 'Frequency domain',   sub: 'WHAT FREQUENCIES ARE PRESENT?',              cam: 'rise' },
  { id: 'harmonics',pos: [4740, -430],  dur: 14, title: 'Adding harmonics',   sub: 'BUILDING THE WAVE',                          cam: 'sweep' },
  { id: 'sum',      pos: [4560, 900],   dur: 12, title: 'Convergence',        sub: 'MORE TERMS → BETTER FIT',                   cam: 'arc' },
  { id: 'dive',     pos: [6340, 250],   dur: 10, title: 'Infinite precision', sub: 'RECOMPUTED · NEVER STORED',                 cam: 'trace' },
  { id: 'controls', pos: [6200, -970],  dur: 14, title: 'Playground',         sub: 'FULL CONTROL',                              cam: 'pull' },
];

const NOM_W = 1260;

export const FOURIER_DOC: SceneDoc = scene({ title: 'Fourier Series' }, (s) => {
  // ── Interactive params ────────────────────────────────────────────────
  s.param.number('numHarmonics', { default: 3, min: 1, max: 20, step: 1, label: 'Harmonics' });
  s.param.point('probeX', { default: [250, 200], label: 'Probe X' });
  s.param.number('waveType', { default: 0, min: 0, max: 2, step: 1, label: 'Wave type' });
  s.param.number('sliderFreq', { default: 1, min: 0.5, max: 5, step: 0.1, label: 'Frequency' });
  s.param.boolean('showIndividual', { default: true, label: 'Show individual harmonics' });
  s.param.boolean('showSum', { default: true, label: 'Show sum' });
  s.param.number('hudDetach', { default: 0, min: 0, max: 1, label: 'HUD detachment' });

  let cumTime = 0;

  for (const ch of CH) {
    const isControls = ch.id === 'controls';
    const chB = s.chapterPage(ch.id, {
      title: ch.title, sub: ch.sub, at: ch.pos, dur: ch.dur, nominalW: NOM_W,
      cover: isControls,
      noChrome: true,  // ← infinite canvas: no card edges
      layout: { direction: 'column', gap: 0, padding: 0, align: 'stretch' },
    });
    chB.start = cumTime;
    cumTime += ch.dur;

    // Camera gestures
    if (ch.cam === 'drop') chB.cam.drop();
    else if (ch.cam === 'sweep') chB.cam.sweep();
    else if (ch.cam === 'rise') chB.cam.rise();
    else if (ch.cam === 'arc') chB.cam.arc();
    else if (ch.cam === 'pull') chB.cam.pull();
    else if (ch.cam === 'dive') {
      const dv = ch.dive || [0.5, 0.5, 5.0];
      chB.cam.dive({ into: [dv[0], dv[1]] as Vec2, zoom: dv[2] });
    }

    buildChapter(chB, ch.id, ch);

    // Hold keyframe at end of chapter for settling
    const travel = Math.min(1.9, ch.dur * 0.42);
    const kfs = (s as any).doc.camera.keyframes;
    const last = kfs[kfs.length - 1];
    kfs.push({
      time: chB.start + ch.dur - travel,
      fit: last.fit, offset: last.offset, zoomMul: last.zoomMul,
      polar: last.polar, azimuth: last.azimuth,
      ease: 'smoothstep',
    });
  }
});

function buildChapter(chB: ChapterBuilder, id: string, ch: ChCfg) {
  switch (id) {
    // ── Chapter 1: Splash — HeroCentered ───────────────────────────────
    case 'splash':
      chB.heroCentered('splash', {
        island: 'fourier-plot',
        islandParams: { numHarmonics: 3, showIndividual: false, showSum: true },
        title: 'Fourier Series',
        subtitle: 'ANY PERIODIC FUNCTION IS A SUM OF SINES',
        overlayStyle: 'center',
        accent: C.accent,
      });
      // Auto-sweep harmonics for visual interest
      chB.clip.param('numHarmonics', { start: 0, duration: 4, to: 7, ease: 'smoothstep' });
      chB.clip.param('numHarmonics', { start: 4, duration: 1, to: 3, ease: 'smoothstep' });
      break;

    // ── Chapter 2: Sound — FullBleedVisual ─────────────────────────────
    case 'sound':
      chB.fullBleedVisual('sound', {
        island: 'fourier-plot',
        islandParams: { numHarmonics: 1, showIndividual: false, showSum: true },
        kicker: 'SOUND IS VIBRATION',
        title: 'Periodic motion.',
        body: [
          'A plucked string, a voice, a speaker cone —',
          'periodic vibrations in the air. Any repeating',
          'waveform can be built from simple pieces.',
        ],
        overlayPosition: 'left',
      });
      break;

    // ── Chapter 3: Sine — SplitNarrative ───────────────────────────────
    case 'sine': {
      chB.splitNarrative('sine', {
        kicker: 'THE BUILDING BLOCK',
        title: 'Sine waves.',
        body: [
          'Every periodic function can be decomposed into',
          'sine waves of different frequencies and amplitudes.',
          'A single sine wave is the simplest vibration.',
        ],
        island: 'fourier-plot',
        islandParams: { numHarmonics: 1, showIndividual: false, showSum: true },
        caption: 'DRAG THE PROBE',
        ratio: 1.5,
        accent: C.accent,
        tail: (c: any) => c.math('sine-eq',
          'f(t) = A \\cdot \\sin(2\\pi f \\cdot t + \\phi)',
          { size: 24, color: C.ink, item: { flexShrink: 0 } },
        ),
      });
      chB.clip.fadeIn('sine-eq', { start: 0.6, duration: 1.0 });
      break;
    }

    // ── Chapter 4: Frequency — Dashboard ───────────────────────────────
    case 'freq':
      chB.dashboard('freq', {
        island: 'fourier-spectrum',
        islandParams: { numHarmonics: { $param: 'numHarmonics' } },
        kicker: 'FREQUENCY DOMAIN',
        title: 'What frequencies are present?',
        stats: [
          { label: 'Fundamental', value: 'f = 1 Hz', accent: C.accent, color: C.accent },
          { label: '3rd harmonic', value: 'A = 0.42', accent: C.gold, color: C.gold },
          { label: '5th harmonic', value: 'A = 0.25', accent: C.green, color: C.green },
          { label: '7th harmonic', value: 'A = 0.18', accent: C.accent2, color: C.accent2 },
        ],
        insight: 'A square wave contains only odd harmonics. Their amplitudes decay as 1/n — the 3rd harmonic is 1/3 the fundamental, the 5th is 1/5, and so on.',
        accent: C.accent,
      });
      // Sweep through harmonics
      chB.clip.param('numHarmonics', { start: 1, duration: 6, to: 9, ease: 'smoothstep' });
      break;

    // ── Chapter 5: Harmonics — PipelineFlow ────────────────────────────
    case 'harmonics':
      chB.pipelineFlow('harm', {
        steps: [
          { title: 'Fundamental', icon: '~', label: 'f = 1 Hz' },
          { title: '3rd', icon: '~', label: 'f = 3 Hz' },
          { title: '5th', icon: '~', label: 'f = 5 Hz' },
          { title: '7th', icon: '~', label: 'f = 7 Hz' },
          { title: 'Sum', icon: '∑', label: 'Reconstructed' },
        ],
        previewIsland: 'fourier-plot',
        previewParams: {
          numHarmonics: { $param: 'numHarmonics' },
          showIndividual: true,
          showSum: true,
        },
      });
      // Animate harmonics growing
      chB.clip.param('numHarmonics', { start: 2, duration: 8, to: 6, ease: 'smoothstep' });
      chB.clip.param('showIndividual', { start: 3, duration: 0.5, to: true });
      break;

    // ── Chapter 6: Convergence — Comparison ────────────────────────────
    case 'sum': {
      chB.comparison('sum', {
        left: {
          label: '1 term',
          island: 'fourier-plot',
          params: { numHarmonics: 1, showIndividual: false, showSum: true, probeX: [250, 350] },
          caption: 'Just a sine wave — rough approximation',
        },
        right: {
          label: 'Many terms',
          island: 'fourier-plot',
          params: { numHarmonics: { $param: 'numHarmonics' }, showIndividual: false, showSum: true, probeX: [250, 350] },
          caption: 'More harmonics → better fit',
        },
        arrow: true,
        verdict: { left: 'approximation', right: 'convergence', color: C.green },
      });
      chB.clip.param('numHarmonics', { start: 1, duration: 7, to: 12, ease: 'smoothstep' });
      break;
    }

    // ── Chapter 7: Dive — HeroCentered (deep zoom trace) ──────────────
    case 'dive':
      chB.heroCentered('dive', {
        island: 'fourier-plot',
        islandParams: { numHarmonics: 10, showIndividual: false, showSum: true },
        title: 'Infinite precision.',
        subtitle: 'RECOMPUTED · NEVER STORED',
        overlayStyle: 'bottom',
        accent: C.green,
      });
      chB.clip.param('numHarmonics', { start: 0, duration: 5, to: 5, ease: 'smoothstep' });
      chB.clip.param('numHarmonics', { start: 5, duration: 5, to: 15, ease: 'smoothstep' });
      // Override camera for trace
      chB.cam.traceOutline({ target: 'dive-hero', zoom: 8, duration: 4, samples: 32, pullBack: false });
      break;

    // ── Chapter 8: Controls — Dashboard + Living UI Peel ──────────────
    case 'controls': {
      // Create the living-UI slot for HUD peel
      chB.lRect('ctrl-slot', {
        size: [10, 10], fill: [0, 0, 0, 0],
        item: { flexGrow: 1 },
      });

      // HUD peel: detach at start, reattach at end
      chB.clip.param('hudDetach', { start: 0, duration: 0.01, to: 1 });
      chB.clip.param('hudDetach', { start: 12.0, duration: 0.01, to: 0 });

      // Camera: dive into the slot to show the peel
      chB.cam.moveTo(0.0, { fitObj: 'ctrl-slot', zoomMul: 1.0, polar: 0.0, ease: 'smoothstep' });
      chB.cam.moveTo(4.0, { fitObj: 'ctrl-slot', fitPoint: [0.5, 0.5], zoomMul: 3.0, polar: 0.12, azimuth: 0.04, ease: 'smoothstep' });
      chB.cam.moveTo(8.0, { fitObj: 'ctrl-slot', fitPoint: [0.5, 0.5], zoomMul: 1.8, polar: 0.08, ease: 'smoothstep' });
      chB.cam.moveTo(10.0, { fitObj: 'ctrl-slot', zoomMul: 1.0, polar: 0.0, ease: 'easeInOutCubic' });
      chB.cam.moveTo(12.2, { fit: 'controls', ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
      break;
    }
  }
}

export { FOURIER_DOC as default };
