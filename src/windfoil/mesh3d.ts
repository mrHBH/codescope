// ── windfoil · 3D mesh pipeline (Phase 7, true 3D) ───────────────────────────
// A small companion pipeline to the analytic windfoil pass: it draws real 3D
// triangles (shaded surface faces) and 3D lines (axes / grid / wireframe) through
// the SAME orbit view-projection, with a shared depth buffer, so 3D graphs rise
// off the ground plane and self-occlude correctly while the document/labels stay
// analytic. Vertices are pre-shaded on the CPU (position vec3 + straight-alpha
// RGBA); the fragment stage just premultiplies for the shared over-blend.

export const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

const MESH_WGSL = /* wgsl */`
struct U { viewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> u : U;
struct VsOut { @builtin(position) pos : vec4<f32>, @location(0) color : vec4<f32> };
@vertex fn vs(@location(0) p : vec3<f32>, @location(1) c : vec4<f32>) -> VsOut {
  var o : VsOut;
  o.pos = u.viewProj * vec4<f32>(p, 1.0);
  o.color = c;
  return o;
}
@fragment fn fs(@location(0) c : vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(c.rgb * c.a, c.a); // premultiplied for the over-blend
}`;

export function createMeshRenderer(device: GPUDevice, format: GPUTextureFormat) {
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
  const mk = (topology: GPUPrimitiveTopology, depthCompare: GPUCompareFunction, depthWriteEnabled: boolean) =>
    device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs', buffers },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend }] },
      primitive: { topology, cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled, depthCompare },
    });
  // 'less-equal' works for BOTH the 3D view (front tris occlude back) AND the flat
  // 2D top-down view (all tris at equal depth → painter order; a height field has
  // no top-down overlap, so this is correct).
  const triPipe = mk('triangle-list', 'less-equal', true);
  const linePipe = mk('line-list', 'less-equal', true);

  const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const triBind = device.createBindGroup({ layout: triPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
  const lineBind = device.createBindGroup({ layout: linePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });

  let triBuf = device.createBuffer({ size: 1 << 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let triCap = 1 << 16;
  let lineBuf = device.createBuffer({ size: 1 << 16, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  let lineCap = 1 << 16;
  // The graph mesh is static (built once, cached), but drawn every frame while in
  // 3D. Track the last-uploaded array so we only re-upload when it actually
  // changes (or the backing buffer is reallocated) — avoids a ~1MB writeBuffer
  // per frame that was tanking FPS in 3D mode.
  let lastTris: Float32Array | null = null;
  let lastLines: Float32Array | null = null;
  const grow = (buf: GPUBuffer, cap: number, need: number): [GPUBuffer, number] => {
    if (need <= cap) return [buf, cap];
    const nc = Math.max(cap * 2, need);
    buf.destroy();
    return [device.createBuffer({ size: nc, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), nc];
  };

  return {
    setViewProj(vp: ArrayLike<number>) { device.queue.writeBuffer(uniform, 0, new Float32Array(vp as number[])); },
    drawTris(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = triBuf;
      [triBuf, triCap] = grow(triBuf, triCap, verts.byteLength);
      if (triBuf !== prev || verts !== lastTris) { device.queue.writeBuffer(triBuf, 0, verts); lastTris = verts; }
      pass.setPipeline(triPipe); pass.setBindGroup(0, triBind); pass.setVertexBuffer(0, triBuf, 0, verts.byteLength); pass.draw(n);
    },
    drawLines(pass: GPURenderPassEncoder, verts: Float32Array) {
      const n = verts.length / 7; if (!n) return;
      const prev = lineBuf;
      [lineBuf, lineCap] = grow(lineBuf, lineCap, verts.byteLength);
      if (lineBuf !== prev || verts !== lastLines) { device.queue.writeBuffer(lineBuf, 0, verts); lastLines = verts; }
      pass.setPipeline(linePipe); pass.setBindGroup(0, lineBind); pass.setVertexBuffer(0, lineBuf, 0, verts.byteLength); pass.draw(n);
    },
  };
}

export type MeshRenderer = ReturnType<typeof createMeshRenderer>;
