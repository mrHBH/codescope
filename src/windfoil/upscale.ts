// ── Low-res render + contrast-adaptive sharpen upscale ───────────────────────
// The analytic coverage integral (the fragment shader) is the fill-rate cost that
// scales with pixel count. This lets us run it into a smaller OFFSCREEN texture,
// then upscale to the full-resolution swapchain with a contrast-adaptive sharpen
// (CAS, à la FSR 1.0) so the display still looks crisp. Because the source is
// exact, band-limited coverage (no aliasing noise), the sharpen has clean edges
// to reconstruct — it recovers most of the perceived sharpness at a fraction of
// the shading cost. One fullscreen triangle, ~5 taps; no ringing (CAS clamps the
// sharpening lobe by local contrast so it never overshoots to black/white).

const UPSCALE_WGSL = /* wgsl */`
struct VsOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VsOut {
  // Fullscreen triangle (covers the viewport with 3 verts).
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let xy = p[vi];
  var o : VsOut;
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return o;
}

struct U { srcSize : vec2<f32>, dstSize : vec2<f32>, sharp : f32 };
@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : U;

fn tap(uv : vec2<f32>) -> vec3<f32> { return textureSampleLevel(tex, samp, uv, 0.0).rgb; }

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let uv = in.uv;
  // One source texel in uv space — the plus-pattern neighbourhood is sampled at
  // this offset so the sharpen acts at the low-res grid frequency (exactly the
  // frequency the bilinear upscale softened).
  let px = 1.0 / u.srcSize;
  let e = tap(uv);
  let b = tap(uv + vec2<f32>(0.0, -px.y));
  let d = tap(uv + vec2<f32>(-px.x, 0.0));
  let f = tap(uv + vec2<f32>(px.x, 0.0));
  let h = tap(uv + vec2<f32>(0.0, px.y));
  // CAS: per-channel local min/max → an amount that fades sharpening near black
  // or white (avoids clipping/ringing), then a symmetric negative-lobe kernel.
  let mn = min(min(min(b, d), min(f, h)), e);
  let mx = max(max(max(b, d), max(f, h)), e);
  let amp = sqrt(clamp(min(mn, vec3<f32>(1.0) - mx) / max(mx, vec3<f32>(1e-4)), vec3<f32>(0.0), vec3<f32>(1.0)));
  let w = amp * (-0.125 * clamp(u.sharp, 0.0, 1.0));   // sharpening lobe weight (≤0)
  let outc = ((b + d + f + h) * w + e) / (1.0 + 4.0 * w);
  return vec4<f32>(clamp(outc, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

export interface Upscaler {
  // Get (creating/resizing on demand) the offscreen render target the main pass
  // draws into at low resolution.
  target(w: number, h: number): GPUTextureView;
  // Fullscreen sharpen-upscale from the offscreen target to `dstView`.
  resolve(enc: GPUCommandEncoder, dstView: GPUTextureView, srcW: number, srcH: number, dstW: number, dstH: number, sharp: number): void;
}

export function createUpscaler(device: GPUDevice, format: GPUTextureFormat): Upscaler {
  const module = device.createShaderModule({ code: UPSCALE_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const uni = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uniData = new Float32Array(8);
  const layout = pipeline.getBindGroupLayout(0);

  let tex: GPUTexture | null = null;
  let texView: GPUTextureView | null = null;
  let bind: GPUBindGroup | null = null;
  let tw = 0, th = 0;

  function target(w: number, h: number): GPUTextureView {
    if (!tex || tw !== w || th !== h) {
      tex?.destroy();
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

  function resolve(enc: GPUCommandEncoder, dstView: GPUTextureView, srcW: number, srcH: number, dstW: number, dstH: number, sharp: number) {
    if (!bind) return;
    uniData[0] = srcW; uniData[1] = srcH; uniData[2] = dstW; uniData[3] = dstH; uniData[4] = sharp;
    device.queue.writeBuffer(uni, 0, uniData);
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: dstView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  return { target, resolve };
}
