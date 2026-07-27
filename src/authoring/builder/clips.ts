// ── windgraph clip helpers (sprint-v2 Phase 1.3) ─────────────────────────────
// The existing clip kinds apply to wg objects unchanged — target the object id;
// contracts.md §3 maps each kind to a windgraph Animation subclass (draw →
// Create, morph → Transform, param → TrackerAnim, …). ChapterBuilder.clip.*
// provides them chapter-relative. This module adds the one NEW kind:
// moveAlongPath (target rides a path object — point on a curve animation).

import type { SceneBuilder } from './scene';
import type { EasingName } from '../ir/types';

/** Absolute-time moveAlongPath clip (top-level; for chapter-relative use
 *  ChapterBuilder.clip.moveAlongPath). `path` is the id of a curve object. */
export function moveAlongPath(s: SceneBuilder, target: string, path: string, o: { start: number; duration: number; ease?: EasingName }) {
  s.doc.clips.push({ id: s.uid('clip'), target, kind: 'moveAlongPath', start: o.start, duration: o.duration, ease: o.ease, props: { path } });
}
