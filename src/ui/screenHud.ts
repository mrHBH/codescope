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

import { createGlyphRenderer, type GlyphRenderer } from '../windfoil/gpu';

export class ScreenHud {
  readonly renderer: GlyphRenderer;
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
  private readonly camScale = [1, 1];
  private readonly camCenter = [0, 0];

  constructor(device: GPUDevice, shaderCode: string) {
    this.renderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' });
  }

  /** Clear the overlay and seed crv/rws with the atlas base band tables so glyph
   *  instances (text/icons) emitted this frame resolve their band indices. */
  reset(baseCrv?: ArrayLike<number>, baseRws?: ArrayLike<number>) {
    this.inst.length = 0;
    this.crv.length = 0;
    this.rws.length = 0;
    if (baseCrv) for (let i = 0; i < baseCrv.length; i++) this.crv.push(baseCrv[i]);
    if (baseRws) for (let i = 0; i < baseRws.length; i++) this.rws.push(baseRws[i]);
  }

  /** reset → build → draw, in one call for the frame loop. */
  frame(pass: GPURenderPassEncoder, Cw: number, Ch: number, now: number, baseCrv?: ArrayLike<number>, baseRws?: ArrayLike<number>) {
    if (!this.onBuild) return;
    this.reset(baseCrv, baseRws);
    this.onBuild(this, Cw, Ch, now);
    this.draw(pass, Cw, Ch);
  }

  draw(pass: GPURenderPassEncoder, Cw: number, Ch: number) {
    if (this.inst.length === 0) return;
    if (this.inst.length > this.instFA.length) this.instFA = new Float32Array(this.inst.length * 2);
    this.instFA.set(this.inst);
    if (this.crv.length > this.crvFA.length) this.crvFA = new Float32Array(this.crv.length * 2);
    this.crvFA.set(this.crv);
    if (this.rws.length > this.rwsUA.length) this.rwsUA = new Uint32Array(this.rws.length * 2);
    this.rwsUA.set(this.rws);
    const vp = this.vp;
    vp.fill(0);
    vp[0] = 2 / Cw; vp[5] = -2 / Ch; vp[12] = -1; vp[13] = 1; vp[15] = 1;
    this.renderer.setUniforms({ width: Cw, height: Ch, camScale: this.camScale, camCenter: this.camCenter, viewProj: vp });
    this.renderer.draw(pass, this.crvFA.subarray(0, this.crv.length), this.rwsUA.subarray(0, this.rws.length), this.instFA.subarray(0, this.inst.length), this.inst.length / 16);
  }
}
