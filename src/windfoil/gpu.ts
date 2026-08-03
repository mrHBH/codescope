import { DEPTH_FORMAT } from './mesh3d';
import { Retirer } from './retire';

const WGSL_URL = new URL('./windfoil.wgsl', import.meta.url);

// Dev-tool accounting (gated on window.__trace, see scripts/shots.ts): bytes +
// call count passed to queue.writeBuffer, so partial-upload changes can be
// verified against the real GPU path, not inferred.
function traceUpload(bytes: number, label = '?') {
  const g = globalThis as any;
  if (!g.__trace) return;
  const st = g.__uploadStats ?? (g.__uploadStats = { bytes: 0, calls: 0 });
  st.bytes += bytes; st.calls++;
  const by = st.byLabel ?? (st.byLabel = {} as Record<string, number>);
  by[label] = (by[label] ?? 0) + bytes;
}

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
  sampleCount?: number;
  /**
   * Also build the depth-WRITING pipeline variant (D26, analytic 3D). Opaque
   * 3D content (space curves, tilted planes) drawn through it self-occludes via
   * the shared depth buffer inside the single draw call — per-vertex z is
   * already perspective-interpolated by the shader, so crossing curves resolve
   * per-fragment with no painter sorting. Uses STRICT 'less' compare so the
   * same-color overlaps at shared joints are discarded, not double-blended
   * (a hairline-dark seam); coplanar-with-mesh overlays belong to the normal
   * test-only pipeline, not this one.
   */
  depthWrite?: boolean;
  /** Dev-only tag for __uploadStats.byLabel accounting (see traceUpload). */
  label?: string;
}

export function createGlyphRenderer(
  device: GPUDevice,
  opts: GlyphRendererOptions,
) {
  const { code, format, constants, sampleCount = 1, depthWrite = false, label = 'renderer' } = opts;
  const module = device.createShaderModule({ code });

  const makePipe = (write: boolean) => device.createRenderPipeline({
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
    multisample: { count: sampleCount },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: write, depthCompare: write ? 'less' : 'less-equal' },
  });

  const pipeline = makePipe(false);
  // Built only when requested. NOTE: a second `layout: 'auto'` pipeline must get
  // its OWN bind group — WebGPU validation treats the two auto layouts as
  // distinct objects ("layout not created by the pipeline"), so one bind group
  // cannot serve both, even though the shader/entries are identical.
  const pipelineDepth = depthWrite ? makePipe(true) : pipeline;

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

  const bindEntries = () => [
    { binding: 0, resource: { buffer: uniform } },
    { binding: 1, resource: { buffer: instBuf } },
    { binding: 2, resource: { buffer: curveBuf } },
    { binding: 3, resource: { buffer: rowBuf } },
    { binding: 4, resource: { buffer: xformBuf } },
    { binding: 5, resource: { buffer: clipBuf } },
  ];
  const layout = pipeline.getBindGroupLayout(0);
  const layoutDepth = pipelineDepth.getBindGroupLayout(0);
  let bindGroup = device.createBindGroup({ layout, entries: bindEntries() });
  let bindGroupDepth = device.createBindGroup({ layout: layoutDepth, entries: bindEntries() });

  const retirer = new Retirer();
  function ensureBuf(buf: GPUBuffer, size: number, cap: number): [GPUBuffer, number] {
    if (size <= cap) return [buf, cap];
    const newCap = Math.max(cap * 2, size);
    const newBuf = device.createBuffer({ size: newCap, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    // Retire, don't destroy: the previous frame's submit may still reference it.
    retirer.retire(device, buf, () => buf.destroy());
    return [newBuf, newCap];
  }

  let lastCurves: Float32Array | null = null;
  let lastRows: Uint32Array | null = null;
  // Caller-managed content version: when supplied, geometry uploads happen only
  // on version change — a still scene redraws from the persistent GPU buffers
  // with zero writeBuffer calls (frame-level dirty tracking, sprint-v2).
  let lastDataVersion = -1;

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
    draw(pass: GPURenderPassEncoder, curves: Float32Array, rows: Uint32Array, instances: Float32Array, instanceCount: number, xforms?: Float32Array, clip?: Float32Array, dataVersion?: number, opts?: { depthWrite?: boolean; firstInstance?: number; dirty?: DirtyRanges | null }) {
      if (!instanceCount) return;
      let newBindGroup = false;
      let c: GPUBuffer, cc: number;
      [c, cc] = ensureBuf(curveBuf, curves.byteLength, curveCap);
      if (c !== curveBuf) { curveBuf = c; curveCap = cc; newBindGroup = true; lastCurves = null; }
      let r: GPUBuffer, rc: number;
      [r, rc] = ensureBuf(rowBuf, rows.byteLength, rowCap);
      if (r !== rowBuf) { rowBuf = r; rowCap = rc; newBindGroup = true; lastRows = null; }
      let i: GPUBuffer, ic: number;
      [i, ic] = ensureBuf(instBuf, instances.byteLength, instCap);
      if (i !== instBuf) { instBuf = i; instCap = ic; newBindGroup = true; }
      // A buffer was just reallocated → its GPU content is empty → any ranged
      // (partial) write would leave the rest stale. Force a full upload (I5).
      const grew = newBindGroup;
      let xfGrew = false;
      if (xforms && xforms.length > 0) {
        let x: GPUBuffer, xc: number;
        [x, xc] = ensureBuf(xformBuf, xforms.byteLength, xformCap);
        if (x !== xformBuf) { xformBuf = x; xformCap = xc; newBindGroup = true; xfGrew = true; }
      }
      // xf upload. When the caller supplies dirty ranges, an EMPTY dirty.xf means
      // "xf unchanged" → upload NOTHING (previously this case fell through to a
      // FULL xf upload on every draw call — in 3D there are two draws per frame,
      // so a handle drag re-uploaded the whole xf buffer twice per frame). The
      // upload is gated on dataVersion below so the 3D double-draw pays it once.
      const xfUpload = () => {
        if (!xforms || xforms.length === 0) return;
        if (opts?.dirty && !xfGrew) {
          for (const [a, b] of opts.dirty.xf) { traceUpload((b - a) * 4, label + ':xf'); device.queue.writeBuffer(xformBuf, a * 4, xforms.subarray(a, b)); }
        } else {
          traceUpload(xforms.byteLength, label + ':xf-FULL');
          device.queue.writeBuffer(xformBuf, 0, xforms);
        }
      };
      if (clip && clip.length > 0) {
        let cl: GPUBuffer, clc: number;
        [cl, clc] = ensureBuf(clipBuf, clip.byteLength, clipCap);
        if (cl !== clipBuf) { clipBuf = cl; clipCap = clc; newBindGroup = true; }
        traceUpload(clip.byteLength, label + ':clip');
        device.queue.writeBuffer(clipBuf, 0, clip);
      }
      if (dataVersion !== undefined) {
        if (dataVersion !== lastDataVersion) {
          xfUpload();
          const d = !grew && opts?.dirty ? opts.dirty : null;
          if (d && (d.crv.length || d.rws.length || d.inst.length)) {
            for (const [a, b] of d.crv) { traceUpload((b - a) * 4, label + ':crv'); device.queue.writeBuffer(curveBuf, a * 4, curves.subarray(a, b)); }
            for (const [a, b] of d.rws) { traceUpload((b - a) * 4, label + ':rws'); device.queue.writeBuffer(rowBuf, a * 4, rows.subarray(a, b)); }
            for (const [a, b] of d.inst) { traceUpload((b - a) * 4, label + ':inst'); device.queue.writeBuffer(instBuf, a * 4, instances.subarray(a, b)); }
          } else {
            traceUpload(curves.byteLength + rows.byteLength + instances.byteLength, label + ':FULL');
            device.queue.writeBuffer(curveBuf, 0, curves);
            device.queue.writeBuffer(rowBuf, 0, rows);
            device.queue.writeBuffer(instBuf, 0, instances);
          }
          lastDataVersion = dataVersion;
          lastCurves = curves; lastRows = rows;
        }
      } else {
        xfUpload();
        if (curves !== lastCurves) { traceUpload(curves.byteLength, label + ':crv-ref'); device.queue.writeBuffer(curveBuf, 0, curves); lastCurves = curves; }
        if (rows !== lastRows) { traceUpload(rows.byteLength, label + ':rws-ref'); device.queue.writeBuffer(rowBuf, 0, rows); lastRows = rows; }
        traceUpload(instances.byteLength, label + ':inst-always');
        device.queue.writeBuffer(instBuf, 0, instances);
      }
      if (newBindGroup) {
        bindGroup = device.createBindGroup({ layout, entries: bindEntries() });
        bindGroupDepth = device.createBindGroup({ layout: layoutDepth, entries: bindEntries() });
      }
      pass.setPipeline(opts?.depthWrite ? pipelineDepth : pipeline);
      pass.setBindGroup(0, opts?.depthWrite ? bindGroupDepth : bindGroup);
      pass.draw(4, instanceCount, 0, opts?.firstInstance ?? 0);
    },
  };
}

export type GlyphRenderer = ReturnType<typeof createGlyphRenderer>;

/** Float-index ranges ([start, end)) that changed since the last upload, per
 *  buffer. Passed to draw() so only those byte ranges are written to the GPU —
 *  a drag uploads one board's ~16KB instead of the full ~1.76MB curve buffer.
 *  null/absent = upload everything (the caller's correctness fallback). */
export interface DirtyRanges {
  crv: [number, number][];
  rws: [number, number][];
  inst: [number, number][];
  xf: [number, number][];
}
