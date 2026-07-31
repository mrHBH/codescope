// ── Cinematic post-process (vignette + analytic splash) ──────────────────────
// A true screen-space effect: the analytic coverage pass renders into an
// offscreen texture, then ONE fullscreen triangle samples it and applies a
// radial vignette + the opening-splash darkening gradient in the fragment
// shader. This is a real GPU post-process (like upscale.ts's CAS blit), not a
// DOM overlay or a pile of world-space rects — so it darkens the whole
// composited frame, empty backdrop included, exactly like a film grade.
//
// Driven by a single `splash` value (0..1) the demo feeds from its playhead:
// at 1 the frame carries the full splash radial (which reads as a vignette —
// edges fall off harder than the centre); it eases to 0 as the title clears.

import { Retirer } from './retire';
const retirer = new Retirer();

const POSTFX_WGSL = /* wgsl */ `
struct VsOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let xy = p[vi];
  var o : VsOut;
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return o;
}

struct U { aspect : f32, splash : f32, _p0 : f32, _p1 : f32 };
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : U;

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let col = textureSampleLevel(tex, samp, in.uv, 0.0).rgb;
  let c = in.uv - vec2<f32>(0.5, 0.5);
  // Aspect-correct radius: 0 at centre, ~0.5 at the vertical edges, larger at
  // the horizontal corners — so the falloff is a circle, not a stretched oval.
  let ca = vec2<f32>(c.x * u.aspect, c.y);
  let dist = length(ca);

  // Vignette: a smooth edge darkening whose strength tracks the splash value, so
  // the frame is graded during the title and clean afterwards.
  let vig = 1.0 - u.splash * 0.62 * smoothstep(0.22, 0.92, dist);
  var outc = col * vig;

  // Splash radial: mirrors the original's radial-gradient title card — a lifted
  // blue-grey core falling to near-black at the rim — composited over the scene.
  if (u.splash > 0.001) {
    let rt = smoothstep(0.0, 0.78, dist);
    let core = vec3<f32>(0.070, 0.094, 0.149);
    let rim  = vec3<f32>(0.027, 0.031, 0.047);
    let overlay = mix(core, rim, rt);
    let a = u.splash * (0.30 + 0.54 * rt);
    outc = mix(outc, overlay, a);
  }
  return vec4<f32>(outc, 1.0);
}
`;

export interface PostFx {
  target(w: number, h: number): GPUTextureView;
  resolve(enc: GPUCommandEncoder, dstView: GPUTextureView, w: number, h: number): void;
  set(splash: number): void;
}

export function createPostFx(device: GPUDevice, format: GPUTextureFormat): PostFx {
  const module = device.createShaderModule({ code: POSTFX_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const uni = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uniData = new Float32Array(4);
  const layout = pipeline.getBindGroupLayout(0);

  let tex: GPUTexture | null = null;
  let texView: GPUTextureView | null = null;
  let bind: GPUBindGroup | null = null;
  let tw = 0, th = 0;
  let splash = 0;

  function target(w: number, h: number): GPUTextureView {
    if (!tex || tw !== w || th !== h) {
      // Retire, don't destroy (a resize while the previous submit is in flight
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
          { binding: 2, resource: { buffer: uni } },
        ],
      });
    }
    return texView!;
  }

  function resolve(enc: GPUCommandEncoder, dstView: GPUTextureView, w: number, h: number) {
    if (!bind) return;
    uniData[0] = w / Math.max(1, h);
    uniData[1] = splash;
    device.queue.writeBuffer(uni, 0, uniData);
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: dstView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  function set(s: number) { splash = s; }

  return { target, resolve, set };
}
