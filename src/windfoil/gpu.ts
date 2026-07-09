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
}

export function createGlyphRenderer(
  device: GPUDevice,
  opts: GlyphRendererOptions,
) {
  const { code, format } = opts;
  const module = device.createShaderModule({ code });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uniformData = new Float32Array(8);

  const INIT_CURVE = 4 * 1024 * 1024;
  const INIT_ROW = 1024 * 1024;
  const INIT_INST = 16 * 1024 * 1024;
  let curveCap = INIT_CURVE, rowCap = INIT_ROW, instCap = INIT_INST;
  let curveBuf = device.createBuffer({ size: curveCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let rowBuf = device.createBuffer({ size: rowCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  let instBuf = device.createBuffer({ size: instCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  const layout = pipeline.getBindGroupLayout(0);
  let bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: instBuf } },
      { binding: 2, resource: { buffer: curveBuf } },
      { binding: 3, resource: { buffer: rowBuf } },
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
    setUniforms({ width, height, cam = [1, 1, 0, 0] as number[] }) {
      uniformData[0] = width; uniformData[1] = height;
      uniformData[2] = 1; uniformData[3] = 1; // style: (gamma=1, sharp=1) = exact coverage
      uniformData[4] = cam[0]; uniformData[5] = cam[1]; uniformData[6] = cam[2]; uniformData[7] = cam[3];
      device.queue.writeBuffer(uniform, 0, uniformData);
    },
    draw(pass: GPURenderPassEncoder, curves: Float32Array, rows: Uint32Array, instances: Float32Array, instanceCount: number) {
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
          ],
        });
      }
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, instanceCount);
    },
  };
}

export async function renderToRGBA(opts: {
  width: number; height: number;
  background: number[];
  curves: Float32Array; rows: Uint32Array;
  instances: Float32Array; instanceCount: number;
}) {
  const { width, height, background, curves, rows, instances, instanceCount } = opts;
  const device = await requestDevice();
  const code = await loadShaderCode();

  const target = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const renderer = createGlyphRenderer(device, { code, format: 'rgba8unorm' });
  renderer.setUniforms({ width, height });

  const [br, bg, bb, ba = 1] = background;
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: target.createView(),
      clearValue: { r: br * ba, g: bg * ba, b: bb * ba, a: ba },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  renderer.draw(pass, curves, rows, instances, instanceCount);
  pass.end();

  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const readback = device.createBuffer({
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [width, height]);
  device.queue.submit([encoder.finish()]);

  await readback.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(readback.getMappedRange());
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    rgba.set(padded.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
  }
  readback.unmap();
  device.destroy();
  return rgba;
}
