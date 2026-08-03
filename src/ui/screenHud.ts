// ── Screen-space HUD overlay ─────────────────────────────────────────────────
// A reusable, fully analytic screen overlay drawn through its OWN glyph renderer
// with a screen-ortho matrix (backing-store px → clip), so HUD chrome stays fixed
// to the screen regardless of the world camera. This is the shared plumbing the
// IDE toolbar/menu and the playground toolbar/menu/panels all render through —
// one implementation of "emit in screen pixels, draw on top" (the CinematicHud
// pattern from explainer v2, extracted so it is not reimplemented per surface).
//
// Geometry is emitted in backing-store pixels. Glyph-bearing primitives (menu
// text/icons) reference the atlas base band tables, so reset() seeds crv/rws with
// them each frame before the build callback appends overlay geometry.

import { createGlyphRenderer, type DirtyRanges, type GlyphRenderer } from '../windfoil/gpu';

export class ScreenHud {
  /** Not readonly — the AA toggle (MSAA) recreates it at sampleCount 4 so it can
   *  draw into the multisampled main pass. */
  renderer: GlyphRenderer;
  inst: number[] = [];
  crv: number[] = [];
  rws: number[] = [];
  /** Set by the owner: emit overlay geometry (toolbar, menus, panels, readouts)
   *  into this HUD's buffers each frame, in backing-store px. */
  onBuild: ((hud: ScreenHud, Cw: number, Ch: number, now: number) => void) | null = null;
  private instFA = new Float32Array(4096);
  private crvFA = new Float32Array(4096);
  private rwsUA = new Uint32Array(1024);
  private vp = new Float32Array(16);
  // Frame-skip: when frame() gets a stable signature, the build + typed-array
  // sync + GPU uploads are skipped entirely — the pass redraws the persistent
  // buffers. Chrome is static except on hover / 8Hz readout ticks.
  private lastSig: string | undefined = undefined;
  private syncPending = false;
  private dataVersion = 0;
  // Partial uploads: reset() seeds crv/rws with the atlas base band tables, and
  // that PREFIX is immutable while its length is unchanged — so it is uploaded
  // once (full) and rebuilds upload only the overlay tail + instances. A rebuild
  // with a different prefix length (atlas growth) or a freshly created renderer
  // (empty GPU buffers) falls back to a full upload.
  private upBaseC = -1;
  private upBaseR = -1;
  private fullNext = true;
  private buildBaseC = 0;
  private buildBaseR = 0;
  private readonly camScale = [1, 1];
  private readonly camCenter = [0, 0];

  constructor(device: GPUDevice, shaderCode: string) {
    this.renderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm', label: 'screenHud' });
  }

  /** Recreate the internal renderer at a given sample count (the AA toggle). */
  setSampleCount(device: GPUDevice, shaderCode: string, n: number) {
    this.renderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm', sampleCount: n, label: 'screenHud' });
    this.lastSig = undefined; // force a rebuild on the next frame
    this.fullNext = true;     // fresh renderer = empty GPU buffers → full upload
  }

  /** Clear the overlay and seed crv/rws with the atlas base band tables so glyph
    *  instances (text/icons) emitted this frame resolve their band indices. */
  reset(baseCrv?: ArrayLike<number>, baseRws?: ArrayLike<number>) {
    this.inst.length = 0;
    this.crv.length = 0;
    this.rws.length = 0;
    if (baseCrv) for (let i = 0; i < baseCrv.length; i++) this.crv.push(baseCrv[i]);
    if (baseRws) for (let i = 0; i < baseRws.length; i++) this.rws.push(baseRws[i]);
    this.buildBaseC = baseCrv?.length ?? 0;
    this.buildBaseR = baseRws?.length ?? 0;
  }

  /** reset → build → draw, in one call for the frame loop. With a `sig`,
   *  unchanged chrome skips the build + uploads and redraws persisted buffers. */
  frame(pass: GPURenderPassEncoder, Cw: number, Ch: number, now: number, baseCrv?: ArrayLike<number>, baseRws?: ArrayLike<number>, sig?: string) {
    if (!this.onBuild) return;
    if (sig === undefined || sig !== this.lastSig || this.inst.length === 0) {
      this.reset(baseCrv, baseRws);
      this.onBuild(this, Cw, Ch, now);
      this.syncPending = true;
      this.dataVersion++;
      this.lastSig = sig;
    }
    this.draw(pass, Cw, Ch);
  }

  draw(pass: GPURenderPassEncoder, Cw: number, Ch: number) {
    if (this.inst.length === 0) return;
    // The atlas prefix seeded by reset() is immutable while its length is
    // unchanged — keep it resident on the GPU and re-upload only the overlay
    // tail + instances on rebuilds (a full re-upload of the ~1MB prefix every
    // 8Hz readout tick was the residual upload cost during handle drags).
    const prefixSame = !this.fullNext && this.buildBaseC === this.upBaseC && this.buildBaseR === this.upBaseR;
    if (this.syncPending) {
      if (this.inst.length > this.instFA.length) this.instFA = new Float32Array(this.inst.length * 2);
      this.instFA.set(this.inst);
      if (this.crv.length > this.crvFA.length) this.crvFA = new Float32Array(this.crv.length * 2);
      if (this.rws.length > this.rwsUA.length) this.rwsUA = new Uint32Array(this.rws.length * 2);
      if (prefixSame) {
        // The typed-array prefix is already synced (immutable) — tail only. A
        // grown typed array is fine: only the tail is sourced for the upload.
        for (let i = this.buildBaseC; i < this.crv.length; i++) this.crvFA[i] = this.crv[i];
        for (let i = this.buildBaseR; i < this.rws.length; i++) this.rwsUA[i] = this.rws[i];
      } else {
        this.crvFA.set(this.crv);
        this.rwsUA.set(this.rws);
      }
      this.syncPending = false;
    }
    const dirty: DirtyRanges | null = prefixSame
      ? { crv: [[this.buildBaseC, this.crv.length]], rws: [[this.buildBaseR, this.rws.length]], inst: [[0, this.inst.length]], xf: [] }
      : null;
    const vp = this.vp;
    vp.fill(0);
    vp[0] = 2 / Cw; vp[5] = -2 / Ch; vp[12] = -1; vp[13] = 1; vp[15] = 1;
    this.renderer.setUniforms({ width: Cw, height: Ch, camScale: this.camScale, camCenter: this.camCenter, viewProj: vp });
    this.renderer.draw(pass, this.crvFA.subarray(0, this.crv.length), this.rwsUA.subarray(0, this.rws.length), this.instFA.subarray(0, this.inst.length), this.inst.length / 16, undefined, undefined, this.dataVersion, { dirty });
    if (!prefixSame) { this.upBaseC = this.buildBaseC; this.upBaseR = this.buildBaseR; this.fullNext = false; }
  }
}
