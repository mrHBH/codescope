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

function storage(device: GPUDevice, floats: Float32Array | Uint32Array) {
  const buf = device.createBuffer({
    size: floats.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, floats);
  return buf;
}

export interface GlyphRendererOptions {
  code: string;
  format: GPUTextureFormat;
  curves: Float32Array;
  rows: Uint32Array;
  instances: Float32Array;
  instanceCount: number;
}

export function createGlyphRenderer(
  device: GPUDevice,
  opts: GlyphRendererOptions,
) {
  const { code, format, curves, rows, instances, instanceCount } = opts;
  const module = device.createShaderModule({ code });

  const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const curveBuf = storage(device, curves);
  const rowBuf = storage(device, rows);
  const instBuf = storage(device, instances);

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

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: instBuf } },
      { binding: 2, resource: { buffer: curveBuf } },
      { binding: 3, resource: { buffer: rowBuf } },
    ],
  });

  return {
    setUniforms({ width, height, cam = [1, 1, 0, 0] as number[] }) {
      device.queue.writeBuffer(uniform, 0, new Float32Array([
        width, height, 1, 1, cam[0], cam[1], cam[2], cam[3],
      ]));
    },
    setInstances(data: Float32Array) {
      device.queue.writeBuffer(instBuf, 0, data);
    },
    draw(pass: GPURenderPassEncoder) {
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

  const renderer = createGlyphRenderer(device, { code, format: 'rgba8unorm', curves, rows, instances, instanceCount });
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
  renderer.draw(pass);
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
