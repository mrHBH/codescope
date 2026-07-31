// ── MSAA renderer swap (shared by the AA panel toggle + the 3D-entry hook) ──
// The "anti-aliasing" dial is MESH-ONLY MSAA (4×): the mesh renders into a 4×
// color+depth pair in its OWN pass (resolving color to the target + depth to a
// 1× texture), then the analytic + HUD content draws at 1× in a second pass,
// depth-testing against the resolved mesh depth. The analytic coverage integral
// is exact at any sample count and its fill is the dominant GPU cost — running
// it at 4× quadrupled the ROP and made 3D "terrible even when nothing moves".
// So only the MESH renderer is swapped; the analytic + HUD renderers stay 1×.

import type { AppState } from '../state';
import { createMeshRenderer } from './mesh3d';

/** Swap the mesh renderer between the 1× base and the lazily-created 4× MSAA
 *  variant. Guarded: no-op when the target state already applies. */
export function setMeshAA(s: AppState, on: boolean) {
  if (on === s.meshAA) return;
  if (!s.meshRendererBase) return; // not a createBaseApp app (IDE etc.)
  s.meshAA = on;
  s.meshRenderer = on
    ? s.meshRendererMsaa ?? (s.meshRendererMsaa = createMeshRenderer(s.device, 'rgba8unorm', { sampleCount: 4 }))
    : s.meshRendererBase;
}
