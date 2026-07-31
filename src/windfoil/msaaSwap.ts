// ── MSAA renderer swap (shared by the AA panel toggle + the 3D-entry hook) ──
// The "anti-aliasing" dial is REAL MSAA (4× multisample + resolve), not
// supersampling: it smooths the MESH pipeline's hard triangle edges. WebGPU
// requires every pipeline in a pass to match the attachment sample count, so the
// whole pass runs at 4× while MSAA is on — but the analytic coverage integral is
// exact at ANY sample count, so the analytic output is pixel-identical; only the
// mesh visually benefits. The render-resolution dial (renderScale) is entirely
// independent of this, so both can be on at once.

import type { AppState } from '../state';
import { createGlyphRenderer } from './gpu';
import { createMeshRenderer } from './mesh3d';

/** Swap the analytic + mesh renderers between the 1× bases and the lazily-created
 *  MSAA 4× variants, and match the screen-HUD renderer's sample count. Guarded:
 *  no-op when the target state already applies. */
export function setMeshAA(s: AppState, on: boolean) {
  if (on === s.meshAA) return;
  if (!s.rendererBase || !s.meshRendererBase) return; // not a createBaseApp app (IDE etc.)
  s.meshAA = on;
  if (on) {
    s.renderer = s.rendererMsaa ?? (s.rendererMsaa = createGlyphRenderer(s.device, { code: s.shaderCode, format: 'rgba8unorm', sampleCount: 4, depthWrite: true }));
    s.meshRenderer = s.meshRendererMsaa ?? (s.meshRendererMsaa = createMeshRenderer(s.device, 'rgba8unorm', { sampleCount: 4 }));
    s.screenHud?.setSampleCount(s.device, s.shaderCode, 4);
  } else {
    s.renderer = s.rendererBase;
    s.meshRenderer = s.meshRendererBase;
    s.screenHud?.setSampleCount(s.device, s.shaderCode, 1);
  }
}
