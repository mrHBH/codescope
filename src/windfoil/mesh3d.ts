// ── windfoil · 3D mesh pipeline (Phase 7 true 3D + Phase 2 shadows/MSAA) ─────
// A companion pipeline to the analytic windfoil pass: real 3D triangles (shaded
// surface faces) and 3D lines (axes / grid / wireframe) through the SAME orbit
// view-projection, sharing the scene depth buffer, so 3D graphs rise off the ground
// and self-occlude while the document/labels stay analytic. Vertices are pre-shaded
// on the CPU (pos vec3 + straight-alpha rgba); the fragment premultiplies.
//
// Phase 2 adds two things, both optional and toggle-driven:
//   · MSAA — the pipelines take a sample count so the shared render pass can
//     anti-alias the triangle silhouettes (the "traditional AA" dial).
//   · Real shadows — a depth-only caster pass from the light direction into a
//     shadow map; the solid pass darkens fragments the map occludes, and a
//     transparent ground-catcher pass paints the grounded shadow. textureSampleCompare
//     + a depth bias give clean self-shadowing. Off by default (su.params.x = 0).

import { LIGHT_DIR } from '../windgraph/space3d/project3d';

export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
export const SHADOW_FORMAT: GPUTextureFormat = 'depth32float';
const SHADOW_SIZE = 1024;

const MESH_WGSL = /* wgsl */`
struct U { viewProj : mat4x4<f32>, };
struct SU { lightVP : mat4x4<f32>, params : vec4<f32>, }; // params.x = shadow on, .y = bias
@group(0) @binding(0) var<uniform> u : U;
@group(1) @binding(0) var<uniform> su : SU;
@group(1) @binding(1) var shadowMap : texture_depth_2d;
@group(1) @binding(2) var shadowSmp : sampler_comparison;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) lsp : vec4<f32>,
};
@vertex fn vs(@location(0) p : vec3<f32>, @location(1) c : vec4<f32>) -> VsOut {
  var o : VsOut;
  o.pos = u.viewProj * vec4<f32>(p, 1.0);
  o.color = c;
  o.lsp = su.lightVP * vec4<f32>(p, 1.0);
  return o;
}

fn shadowFactor(lsp : vec4<f32>) -> f32 {
  if (su.params.x < 0.5) { return 1.0; } // uniform gate — legal before a sample
  let ndc = lsp.xyz / lsp.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  // textureSampleCompare MUST be reached in uniform control flow, so we cannot
  // branch on the per-fragment ndc to skip it (that was the compile error). Sample
  // unconditionally, then clamp the result to "lit" (1.0) for out-of-frustum
  // fragments via select (a built-in, not a branch). 'less': 1 when reference <
  // stored (lit), 0 when a caster is in front (shadowed); bias the reference down
  // to dodge surface acne.
  let inBounds = ndc.x >= -1.0 && ndc.x <= 1.0 && ndc.y >= -1.0 && ndc.y <= 1.0 && ndc.z >= 0.0 && ndc.z <= 1.0;
  let s = textureSampleCompare(shadowMap, shadowSmp, uv, ndc.z - su.params.y);
  return select(1.0, s, inBounds);
}

@fragment fn fsTri(v : VsOut) -> @location(0) vec4<f32> {
  // Solids keep their baked Lambert shade and do NOT sample the shadow map: self-
  // sampling lit faces produced shadow acne + camera flicker. The grounded shadow
  // (the actual payoff) is drawn by the separate ground-catcher pass (fsCatch),
  // which samples the map on the flat ground plane where there is no self-shadow.
  return vec4<f32>(v.color.rgb * v.color.a, v.color.a);
}
@fragment fn fsLine(v : VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(v.color.rgb * v.color.a, v.color.a);
}
// Ground catcher: a transparent darkening where the shadow map is occluded. Lit
// ground discards (stays transparent); shadowed ground fades in by occlusion.
@fragment fn fsCatch(v : VsOut) -> @location(0) vec4<f32> {
  if (su.params.x < 0.5) { discard; }
  let sh = shadowFactor(v.lsp);
  if (sh > 0.985) { discard; }
  let a = (1.0 - sh) * 0.5;
  return vec4<f32>(0.0, 0.0, 0.0, a); // rgb 0 → premul 0; alpha darkens
}
// Depth-only caster vertex shader (no color needed).
@vertex fn vsCast(@location(0) p : vec3<f32>, @location(1) c : vec4<f32>) -> @builtin(position) vec4<f32> {
  return su.lightVP * vec4<f32>(p, 1.0);
}
`;

export function createMeshRenderer(device: GPUDevice, format: GPUTextureFormat, opts: { sampleCount?: number } = {}) {
  const sampleCount = opts.sampleCount ?? 1;
  const module = device.createShaderModule({ code: MESH_WGSL });
  const buffers: GPUVertexBufferLayout[] = [{
    arrayStride: 28, // vec3 pos (12) + vec4 color (16)
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x4' },
    ],
  }];
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  // Solid triangles: shadow-sampling fragment, writes depth.
  const triPipeS = device.createRenderPipeline({
    layout: 'auto', vertex: { module, entryPoint: 'vs', buffers },
    fragment: { module, entryPoint: 'fsTri', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: sampleCount },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less-equal' },
  });
  const linePipe = device.createRenderPipeline({
    layout: 'auto', vertex: { module, entryPoint: 'vs', buffers },
    fragment: { module, entryPoint: 'fsLine', targets: [{ format, blend }] },
    primitive: { topology: 'line-list', cullMode: 'none' }, multisample: { count: sampleCount },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less-equal' },
  });
  // Ground catcher: no depth write (must not block the analytic chrome drawn after),
  // 'less' so it hides behind the solids that already wrote depth.
  const catchPipe = device.createRenderPipeline({
    layout: 'auto', vertex: { module, entryPoint: 'vs', buffers },
    fragment: { module, entryPoint: 'fsCatch', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, multisample: { count: sampleCount },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less' },
  });
  // Depth-only caster for the shadow map (front-face bias avoids acne).
  const castPipe = device.createRenderPipeline({
    layout: 'auto', vertex: { module, entryPoint: 'vsCast', buffers },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: SHADOW_FORMAT, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 },
  });

  const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shadowUniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shadowData = new Float32Array(20);
  let shadowTex = device.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: SHADOW_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  let shadowView = shadowTex.createView();
  const shadowSmp = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

  const triBind = device.createBindGroup({ layout: triPipeS.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const lineBind = device.createBindGroup({ layout: linePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const catchBind = device.createBindGroup({ layout: catchPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const castBind = device.createBindGroup({ layout: castPipe.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: shadowUniform } }] });
  // mkShadowBind builds the full group-1 (uniform + shadow map + comparison sampler)
  // for pipelines whose fragment stage SAMPLES the map. Only the ground catcher does
  // that now; the solid (fsTri) and line (fsLine) fragments no longer sample it (the
  // solids' self-sampling caused shadow acne + flicker), so their group-1 layout is
  // uniform-only and must use the single-entry bind group below — binding the
  // texture/sampler there fails validation (binding 1 absent from the auto layout).
  const mkShadowBind = (pl: GPURenderPipeline) => device.createBindGroup({
    layout: pl.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: { buffer: shadowUniform } },
      { binding: 1, resource: shadowView },
      { binding: 2, resource: shadowSmp },
    ],
  });
  const uniformOnlyBind = (pl: GPURenderPipeline) => device.createBindGroup({ layout: pl.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: shadowUniform } }] });
  let triShadowBind = uniformOnlyBind(triPipeS);
  let lineShadowBind = uniformOnlyBind(linePipe);
  let catchShadowBind = mkShadowBind(catchPipe);

  let triBuf = device.createBuffer({ size: 1 << 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let triCap = 1 << 16;
  let lineBuf = device.createBuffer({ size: 1 << 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let lineCap = 1 << 16;
  let lastTris: Float32Array | null = null;
  let lastLines: Float32Array | null = null;
  const grow = (buf: GPUBuffer, cap: number, need: number): [GPUBuffer, number] => {
    if (need <= cap) return [buf, cap];
    const nc = Math.max(cap * 2, need);
    buf.destroy();
    return [device.createBuffer({ size: nc, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), nc];
  };

  const _vpScratch = new Float32Array(16);
  return {
    sampleCount,
    setViewProj(vp: ArrayLike<number>) { _vpScratch.set(vp as ArrayLike<number>); device.queue.writeBuffer(uniform, 0, _vpScratch); },
    // Configure + run the shadow caster pass into the shadow map. `lightVP` is a
    // column-major mat4 from the light; `on` enables sampling in the solid/catch
    // passes this frame. `cast` draws the caster geometry (solids + ground quad).
    beginShadow(encoder: GPUCommandEncoder, lightVP: ArrayLike<number>, on: boolean, bias: number) {
      shadowData.set(lightVP as ArrayLike<number>, 0);
      shadowData[16] = on ? 1 : 0; shadowData[17] = bias; shadowData[18] = 0; shadowData[19] = 0;
      device.queue.writeBuffer(shadowUniform, 0, shadowData);
      if (!on) return null;
      const pass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setPipeline(castPipe);
      pass.setBindGroup(1, castBind);
      return pass;
    },
    castVerts(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = triBuf;
      [triBuf, triCap] = grow(triBuf, triCap, verts.byteLength);
      if (triBuf !== prev || verts !== lastTris) { device.queue.writeBuffer(triBuf, 0, verts); lastTris = verts; }
      pass.setVertexBuffer(0, triBuf, 0, verts.byteLength); pass.draw(n);
    },
    drawTris(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = triBuf;
      [triBuf, triCap] = grow(triBuf, triCap, verts.byteLength);
      if (triBuf !== prev || verts !== lastTris) { device.queue.writeBuffer(triBuf, 0, verts); lastTris = verts; }
      pass.setPipeline(triPipeS); pass.setBindGroup(0, triBind); pass.setBindGroup(1, triShadowBind);
      pass.setVertexBuffer(0, triBuf, 0, verts.byteLength); pass.draw(n);
    },
    drawLines(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = lineBuf;
      [lineBuf, lineCap] = grow(lineBuf, lineCap, verts.byteLength);
      if (lineBuf !== prev || verts !== lastLines) { device.queue.writeBuffer(lineBuf, 0, verts); lastLines = verts; }
      pass.setPipeline(linePipe); pass.setBindGroup(0, lineBind); pass.setBindGroup(1, lineShadowBind);
      pass.setVertexBuffer(0, lineBuf, 0, verts.byteLength); pass.draw(n);
    },
    // Transparent grounded shadow (drawn after the solids, before the analytic pass).
    drawCatcher(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = triBuf;
      [triBuf, triCap] = grow(triBuf, triCap, verts.byteLength);
      if (triBuf !== prev || verts !== lastTris) { device.queue.writeBuffer(triBuf, 0, verts); lastTris = verts; }
      pass.setPipeline(catchPipe); pass.setBindGroup(0, catchBind); pass.setBindGroup(1, catchShadowBind);
      pass.setVertexBuffer(0, triBuf, 0, verts.byteLength); pass.draw(n);
    },
  };
}

export type MeshRenderer = ReturnType<typeof createMeshRenderer>;

// Light-space view-projection (column-major mat4) for the shadow caster pass: an
// ortho frustum looking along −light from a box that contains the doc-space content
// bounds. Self-consistent (used at cast and sample time), so the up-vector choice is
// arbitrary as long as it isn't parallel to the view direction.
export function lightViewProj(b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, light: [number, number, number] = LIGHT_DIR): Float32Array {
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, cz = (b.minZ + b.maxZ) / 2;
  const rx = (b.maxX - b.minX) / 2, ry = (b.maxY - b.minY) / 2, rz = (b.maxZ - b.minZ) / 2;
  const radius = Math.hypot(rx, ry, rz) * 1.25 + 1;
  // eye = center + light*dist (look toward center along −light).
  const dist = radius * 3;
  const ex = cx + light[0] * dist, ey = cy + light[1] * dist, ez = cz + light[2] * dist;
  // lookAt(ex,ey,ez -> cx,cy,cz), up = doc +y (light is mostly +z, not parallel).
  let fx = cx - ex, fy = cy - ey, fz = cz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let ux = 0, uy = 1, uz = 0;
  // right = normalize(f × up)
  let rrx = fy * uz - fz * uy, rry = fz * ux - fx * uz, rrz = fx * uy - fy * ux;
  const rl = Math.hypot(rrx, rry, rrz) || 1; rrx /= rl; rry /= rl; rrz /= rl;
  // true up = right × f
  ux = rry * fz - rrz * fy; uy = rrz * fx - rrx * fz; uz = rrx * fy - rry * fx;
  // ortho bounds (symmetric, depth 0..1 over [near,far]).
  const half = radius;
  const near = dist - radius, far = dist + radius;
  // column-major: rows are the basis dotted with (p - eye); depth maps [near,far]→[0,1].
  const m = new Float32Array(16);
  const tx = -(rrx * ex + rry * ey + rrz * ez);
  const ty = -(ux * ex + uy * ey + uz * ez);
  const tz = -(-fx * ex + -fy * ey + -fz * ez);
  m[0] = rrx; m[4] = rry; m[8] = rrz; m[12] = tx;
  m[1] = ux; m[5] = uy; m[9] = uz; m[13] = ty;
  m[2] = -fx; m[6] = -fy; m[10] = -fz; m[14] = tz;
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  // Apply ortho scale/depth on top: x' = x/half; y' = y/half; z' = (z-near)/(far-near).
  const sx = 1 / half, sy = 1 / half, sz = 1 / (far - near), oz = -near / (far - near);
  const o = new Float32Array(16);
  o[0] = sx * m[0]; o[4] = sx * m[4]; o[8] = sx * m[8]; o[12] = sx * m[12];
  o[1] = sy * m[1]; o[5] = sy * m[5]; o[9] = sy * m[9]; o[13] = sy * m[13];
  o[2] = sz * m[2]; o[6] = sz * m[6]; o[10] = sz * m[10]; o[14] = sz * m[14] + oz;
  o[3] = 0; o[7] = 0; o[11] = 0; o[15] = 1;
  return o;
}
