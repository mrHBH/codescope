import { DEPTH_FORMAT } from './mesh3d';

const WGSL_URL = new URL('./windfoil.wgsl', import.meta.url);

export async function loadShaderCode(url: string | URL = WGSL_URL): Promise<string> {
  return fetch(url).then((r) => r.text());
}

export async function requestDevice(): Promise<GPUDevice> {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  return device;
}

export interface GlyphRendererOptions {
  code: string;
  format: GPUTextureFormat;
  constants?: Record<string, number>;
}

export function createGlyphRenderer(
  device: GPUDevice,
  opts: GlyphRendererOptions,
) {
  const { code, format, constants } = opts;
  const module = device.createShaderModule({ code });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      constants,
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-strip' },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less-equal' },
  });

  // Uniforms: res(vec2) + style(vec2) + camScale(vec2) + camCenter(vec2) = 32B,
  // then viewProj(mat4) = 64B, then fxActive(f32) = 4B. Total 100B → padded to 112B.
  const uniform = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uniformData = new Float32Array(28);

  const INIT_CURVE = 4 * 1024 * 1024;
  const INIT_ROW = 1024 * 1024;
  const INIT_INST = 16 * 1024 * 1024;
  const INIT_XFORM = 1024 * 1024;
  const INIT_CLIP = 1024 * 1024;
  let curveCap = INIT_CURVE, rowCap = INIT_ROW, instCap = INIT_INST, xformCap = INIT_XFORM, clipCap = INIT_CLIP;
  let curveBuf = device.createBuffer({ size: curveCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let rowBuf = device.createBuffer({ size: rowCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let instBuf = device.createBuffer({ size: instCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let xformBuf = device.createBuffer({ size: xformCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let clipBuf = device.createBuffer({ size: clipCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  const layout = pipeline.getBindGroupLayout(0);
  let bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: instBuf } },
      { binding: 2, resource: { buffer: curveBuf } },
      { binding: 3, resource: { buffer: rowBuf } },
      { binding: 4, resource: { buffer: xformBuf } },
      { binding: 5, resource: { buffer: clipBuf } },
    ],
  });

  function ensureBuf(buf: GPUBuffer, size: number, cap: number): [GPUBuffer, number] {
    if (size <= cap) return [buf, cap];
    const newCap = Math.max(cap * 2, size);
    const newBuf = device.createBuffer({ size: newCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    buf.destroy();
    return [newBuf, newCap];
  }

  return {
    setUniforms({ width, height, camScale = [1, 1] as number[], camCenter = [0, 0] as number[], viewProj, fxActive = 0 }: { width: number; height: number; camScale?: number[]; camCenter?: number[]; viewProj: ArrayLike<number>; fxActive?: number }) {
      uniformData[0] = width; uniformData[1] = height;
      uniformData[2] = 1; uniformData[3] = 1; // style: (gamma=1, sharp=1) = exact coverage
      uniformData[4] = camScale[0]; uniformData[5] = camScale[1];
      uniformData[6] = camCenter[0]; uniformData[7] = camCenter[1];
      uniformData.set(viewProj, 8); // mat4 (16 floats, column-major) at offset 32B
      uniformData[24] = fxActive;
      device.queue.writeBuffer(uniform, 0, uniformData);
    },
    draw(pass: GPURenderPassEncoder, curves: Float32Array, rows: Uint32Array, instances: Float32Array, instanceCount: number, xforms?: Float32Array, clip?: Float32Array) {
      if (!instanceCount) return;
      let newBindGroup = false;
      let c: GPUBuffer, cc: number;
      [c, cc] = ensureBuf(curveBuf, curves.byteLength, curveCap);
      if (c !== curveBuf) { curveBuf = c; curveCap = cc; newBindGroup = true; }
      let r: GPUBuffer, rc: number;
      [r, rc] = ensureBuf(rowBuf, rows.byteLength, rowCap);
      if (r !== rowBuf) { rowBuf = r; rowCap = rc; newBindGroup = true; }
      let i: GPUBuffer, ic: number;
      [i, ic] = ensureBuf(instBuf, instances.byteLength, instCap);
      if (i !== instBuf) { instBuf = i; instCap = ic; newBindGroup = true; }
      if (xforms && xforms.length > 0) {
        let x: GPUBuffer, xc: number;
        [x, xc] = ensureBuf(xformBuf, xforms.byteLength, xformCap);
        if (x !== xformBuf) { xformBuf = x; xformCap = xc; newBindGroup = true; }
        device.queue.writeBuffer(xformBuf, 0, xforms);
      }
      if (clip && clip.length > 0) {
        let cl: GPUBuffer, clc: number;
        [cl, clc] = ensureBuf(clipBuf, clip.byteLength, clipCap);
        if (cl !== clipBuf) { clipBuf = cl; clipCap = clc; newBindGroup = true; }
        device.queue.writeBuffer(clipBuf, 0, clip);
      }
      device.queue.writeBuffer(curveBuf, 0, curves);
      device.queue.writeBuffer(rowBuf, 0, rows);
      device.queue.writeBuffer(instBuf, 0, instances);
      if (newBindGroup) {
        bindGroup = device.createBindGroup({
          layout,
          entries: [
            { binding: 0, resource: { buffer: uniform } },
            { binding: 1, resource: { buffer: instBuf } },
            { binding: 2, resource: { buffer: curveBuf } },
            { binding: 3, resource: { buffer: rowBuf } },
            { binding: 4, resource: { buffer: xformBuf } },
            { binding: 5, resource: { buffer: clipBuf } },
          ],
        });
      }
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, instanceCount);
    },
  };
}
