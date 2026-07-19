// ── SceneDoc serialize / deserialize ─────────────────────────────────────────

import type { SceneDoc } from './types';
import { validateSceneDoc } from './validate';

export function serialize(doc: SceneDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(json: string, knownIslandIds?: Set<string>): SceneDoc {
  const parsed = JSON.parse(json);
  const errors = validateSceneDoc(parsed, knownIslandIds);
  if (errors.length > 0) {
    throw new Error('Invalid SceneDoc:\n' + errors.map((e) => '  - ' + e).join('\n'));
  }
  return parsed as SceneDoc;
}
