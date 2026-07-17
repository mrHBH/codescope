// ── Scene IR serialization ───────────────────────────────────────────────────

import type { SceneIR } from './types';
import { validateSceneIR } from './schema';

export function serialize(ir: SceneIR): string {
  return JSON.stringify(ir, null, 2);
}

export function deserialize(json: string): SceneIR {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Failed to parse SceneIR JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result = validateSceneIR(parsed);
  if (!result.ok) {
    throw new Error(`Invalid SceneIR:\n${result.errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return parsed as SceneIR;
}

export function deserializeUnsafe(json: string): SceneIR | null {
  try {
    return deserialize(json);
  } catch {
    return null;
  }
}
