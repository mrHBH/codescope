// ── Still-frame cache ────────────────────────────────────────────────────────
// When nothing in the scene changes the rendered frame is pixel-identical to
// the previous one — but the frame loop must KEEP presenting: Chromium
// throttles a page's BeginFrame rate (to ~60Hz) once the canvas stops
// generating damage, and the ramp-back makes the next gesture start in slow
// motion. So a still frame presents the CACHED last render via one fullscreen
// blit instead of re-running the coverage integral + mesh passes — a fraction
// of the GPU cost, comfortably inside the vsync budget at any refresh rate,
// which is what keeps a still 3D scene at a STABLE fps instead of straddling
// the boundary and fluctuating between half-rate and full-rate. Same
// fullscreen-triangle pattern as upscale.ts.

import { Retirer } from './retire';
const retirer = new Retirer();

const BLIT_WGSL = /* wgsl */`
struct VsOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let xy = p[vi];
  var o : VsOut;
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  // Flip y: NDC → uv (the upscale.ts convention).
  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return o;
}

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, in.uv);
}
`;

export interface FrameCache {
  /** Render target the full scene draws into (created/resized on demand). */
  target(w: number, h: number): GPUTextureView;
  /** 1:1 blit of the cached frame into dstView (one fullscreen triangle). */
  blit(enc: GPUCommandEncoder, dstView: GPUTextureView): void;
  /** Size of the cached texture (0 until first target()). */
  readonly w: number;
  readonly h: number;
}

export function createFrameCache(device: GPUDevice, format: GPUTextureFormat): FrameCache {
  const module = device.createShaderModule({ code: BLIT_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  // Nearest: the blit is 1:1 and uv lands on texel centres — exact copy, no
  // filtering softening the analytic edges.
  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
  const layout = pipeline.getBindGroupLayout(0);

  let tex: GPUTexture | null = null;
  let texView: GPUTextureView | null = null;
  let bind: GPUBindGroup | null = null;
  let tw = 0, th = 0;

  function target(w: number, h: number): GPUTextureView {
    if (!tex || tw !== w || th !== h) {
      // Retire, don't destroy (resize while the previous submit is in flight
      // throws "Destroyed texture used in a submit").
      const old = tex;
      if (old) retirer.retire(device, old, () => old.destroy());
      tex = device.createTexture({
        size: [w, h], format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      texView = tex.createView();
      tw = w; th = h;
      bind = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: texView },
        ],
      });
    }
    return texView!;
  }

  function blit(enc: GPUCommandEncoder, dstView: GPUTextureView) {
    if (!bind) return;
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: dstView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  return {
    target, blit,
    get w() { return tw; },
    get h() { return th; },
  };
}
