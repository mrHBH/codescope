// ── GPU resource retirement ─────────────────────────────────────────────────
// WebGPU does NOT let you destroy a resource (texture/buffer) that a submitted
// command buffer still references: `queue.submit` then throws
// "Destroyed texture used in a submit" and the whole frame renders black. The
// renderer recreates the depth/MSAA targets when the canvas resizes or the MSAA
// sample count changes (the AA auto-on in 3D), and the instance/curve buffers
// grow during heavy emits — the OLD resource must be retired, not destroyed
// synchronously, or the still-executing previous frame trips this validation.
//
// `onSubmittedWorkDone()` resolves once the queue has drained, so each retire()
// destroys the resource only then — safe to reuse on the next frame.

export class Retirer {
  private pending: { r: GPUTexture | GPUBuffer; d: () => void }[] = [];

  /** Keep `r` alive until the queue drains, then destroy it via `destroy`.
   *  Never destroys synchronously (the "Destroyed texture used in a submit"
   *  guard). */
  retire(device: GPUDevice, r: GPUTexture | GPUBuffer | null, destroy: () => void) {
    if (!r) return;
    const entry = { r, d: destroy };
    this.pending.push(entry);
    device.queue.onSubmittedWorkDone().then(() => {
      const i = this.pending.indexOf(entry);
      if (i >= 0) {
        this.pending.splice(i, 1);
        entry.d();
      }
    });
  }

  /** Immediate cleanup on teardown (the app is closing — nothing is in flight). */
  dispose() {
    for (const e of this.pending) e.d();
    this.pending = [];
  }
}
