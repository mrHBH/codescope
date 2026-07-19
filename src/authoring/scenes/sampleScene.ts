// ── Sample scene for authoring demo ──────────────────────────────────────────

import { scene } from '../builder/scene';

export const SAMPLE_DOC = scene({ title: 'Sample Scene' }, (s) => {
  const r = s.param.number('radius', { default: 50, min: 30, max: 150, label: 'Circle radius' });
  const ch = s.chapter('ch0', { title: 'Hello', sub: 'A sample chapter', at: [0, 0], dur: 8 });
  ch.text('t0', 'Hello, world!', { at: [100, 60], size: 32, color: [0.95, 0.96, 0.98, 1] });
  // radius must be a plain number for the circle spec, not a ref (since the spec doesn't accept ParamRef types)
  ch.circle('c0', { center: [600, 400], radius: 50, fill: [0.2, 0.5, 1, 0.6] });
  ch.rect('r0', { at: [300, 500], size: [200, 80], fill: [1, 0.3, 0.3, 1] });
  ch.cam.drop();
  ch.clip.fadeIn('t0', { start: 0.5, duration: 1 });
  ch.clip.fadeIn('r0', { start: 1, duration: 0.8 });
  ch.clip.draw('r0', { start: 1.5, duration: 1.5 });
  ch.clip.param('radius', { start: 2, duration: 3, to: 130, ease: 'easeOutElastic' });
  s.cam.keyframe(0, { fit: 'ch0', ease: 'easeInOutCubic' });
});
