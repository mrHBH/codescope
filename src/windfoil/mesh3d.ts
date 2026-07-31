// ── windfoil · 3D mesh pipeline (Phase 7 true 3D + MSAA) ─────────────────────
// A companion pipeline to the analytic windfoil pass: real 3D triangles (shaded
// surface faces) and 3D lines (axes / grid / wireframe) through the SAME orbit
// view-projection, sharing the scene depth buffer, so 3D graphs rise off the ground
// and self-occlude while the document/labels stay analytic. Vertices are pre-shaded
// on the CPU (pos vec3 + straight-alpha rgba); the fragment premultiplies.
//
// MSAA: the pipelines take a sample count so the shared render pass can
// anti-alias the triangle silhouettes (the "AA" dial). The depth-only shadow
// caster / ground-catcher passes were REMOVED (user: shadows "rather stupid").

export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

const MESH_WGSL = /* wgsl */`
struct U { viewProj : mat4x4<f32>, };
@group(0) @binding(0) var<uniform> u : U;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec4<f32>,
};
@vertex fn vs(@location(0) p : vec3<f32>, @location(1) c : vec4<f32>) -> VsOut {
  var o : VsOut;
  o.pos = u.viewProj * vec4<f32>(p, 1.0);
  o.color = c;
  return o;
}

@fragment fn fsTri(v : VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(v.color.rgb * v.color.a, v.color.a);
}
@fragment fn fsLine(v : VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(v.color.rgb * v.color.a, v.color.a);
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
  // Solid triangles: writes depth.
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

  const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const triBind = device.createBindGroup({ layout: triPipeS.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const lineBind = device.createBindGroup({ layout: linePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });

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
    drawTris(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = triBuf;
      [triBuf, triCap] = grow(triBuf, triCap, verts.byteLength);
      if (triBuf !== prev || verts !== lastTris) { device.queue.writeBuffer(triBuf, 0, verts); lastTris = verts; }
      pass.setPipeline(triPipeS); pass.setBindGroup(0, triBind);
      pass.setVertexBuffer(0, triBuf, 0, verts.byteLength); pass.draw(n);
    },
    drawLines(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = lineBuf;
      [lineBuf, lineCap] = grow(lineBuf, lineCap, verts.byteLength);
      if (lineBuf !== prev || verts !== lastLines) { device.queue.writeBuffer(lineBuf, 0, verts); lastLines = verts; }
      pass.setPipeline(linePipe); pass.setBindGroup(0, lineBind);
      pass.setVertexBuffer(0, lineBuf, 0, verts.byteLength); pass.draw(n);
    },
  };
}

export type MeshRenderer = ReturnType<typeof createMeshRenderer>;
