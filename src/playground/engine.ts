// ── Shared engine ────────────────────────────────────────────────────────────
// The demo-independent, expensive-to-create GPU + font + atlas resources, built
// ONCE and shared by every demo app (see app.ts / demos.ts). Standalone demos
// each get their own AppState + frame loop but reuse this engine, so switching
// demos is cheap (no re-uploading the atlas or re-requesting the GPU device).
//
// The reference document (the yasmineOS design-language pages) is built here too,
// because the glyph atlas is derived from its characters — and both the
// `playground` and `reference` demos reuse the built document. Demos that don't
// want it (math, the launcher menu) simply build/point at their own content; the
// atlas already covers full ASCII + icons + math glyphs, so any such content is
// renderable without rebuilding the atlas.

import { loadFont, type FontFace } from '../windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from '../windfoil/gpu';
import { createUpscaler, type Upscaler } from '../windfoil/upscale';
import { createFrameCache, type FrameCache } from '../windfoil/frameCache';
import { buildGlyphAtlas } from '../windfoil/bands';
import { createMeshRenderer, type MeshRenderer } from '../windfoil/mesh3d';
import { svgPathToQuads } from '../windfoil/svg';
import { initOrbit } from '../camera/orbit';
import { palettes, buildCSS } from '../css/theme';
import { buildStyledEls } from '../layout/walk';
import type { StyledEl, PageRect } from '../layout/types';
import { editorAtlasChars } from '../editor/editor';
import { loadMathFonts, mathExtraFonts } from '../windgraph/math/fonts';
import { HTML_SRC } from './content/pages';
import { ICONS, ILLUSTRATIONS } from './content/art';
import { FILE_TYPE_ICONS } from '../editor/fileIcons';

export interface RefDoc {
  container: HTMLElement;
  themeStyle: HTMLStyleElement;
  styledEls: StyledEl[];
  pageRoots: StyledEl[];
  docH: number;
  pages: PageRect[];
  docRoot: StyledEl;
}

export interface Engine {
  fpsEl: HTMLElement;
  dpr: number;
  PAGE_W: number;
  rCanvas: HTMLCanvasElement;
  tCanvas: HTMLCanvasElement;
  rCtx: CanvasRenderingContext2D;
  gpuCtx: GPUCanvasContext;
  device: GPUDevice;
  font: FontFace;
  shaderCode: string;
  renderer: any;
  atlas: any;
  upscaler: Upscaler;
  frameCache: FrameCache;
  meshRenderer: MeshRenderer;
  /** The reference design document (shared by the playground + reference demos). */
  ref: RefDoc;
}

const PAGE_W = 1040;

// A synthetic BODY-level root wrapping the page elements, used by the frame loop
// for hit-testing + culling. Shared by the reference document and the launcher.
export function makeDocRoot(container: HTMLElement, children: StyledEl[], docH: number, w = PAGE_W): StyledEl {
  return {
    tag: 'BODY', classes: [], id: '', x: 0, y: 0, w, h: docH, pad: [0, 0, 0, 0], text: '',
    children, parent: null, el: container,
    fs: 16, lh: 16, radius: 0, color: [0, 0, 0, 1], bg: [0, 0, 0, 0], textAlign: 'left', upper: false,
    curBg: [0, 0, 0, 0], curShadow: 0, borderW: [0, 0, 0, 0], borderC: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    inline: false, skipText: true, hasFlow: false, isPre: false, inlineText: false,
    editable: false, editText: '', caret: 0, selAnchor: -1, originText: '', caretXs: null, caretLines: null, lineTops: null,
    pageIdx: -1, hoverable: false, shadowable: false, anim: '', dynamic: false, ownerPage: -1, icon: '', hoverFx: '', clickFx: '', pressT: 0,
  };
}

// Build the hidden, measured reference document from the yasmineOS pages. Returns
// the styled element tree + the synthetic doc root used by the frame loop.
function buildRefDoc(): RefDoc {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style;width:' + PAGE_W + 'px';
  document.body.appendChild(container);
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style><style id="themeStyle"></style>${HTML_SRC}`;
  const themeStyle = container.querySelector('#themeStyle') as HTMLStyleElement;
  // Apply the stylesheet BEFORE measuring boxes — buildStyledEls reads computed
  // styles, so the CSS must be live when the layout tree is built.
  themeStyle.textContent = buildCSS(palettes.light);

  const { styledEls, pageRoots } = buildStyledEls(container);
  const docH = Math.max(...styledEls.map(e => e.y + e.h)) + 60;
  const pages = pageRoots.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  const docRoot = makeDocRoot(container, pageRoots, docH);
  return { container, themeStyle, styledEls, pageRoots, docH, pages, docRoot };
}

export async function createEngine(): Promise<Engine> {
  const fpsEl = document.getElementById('fps')!;
  // No backdrop-filter here: blurring over a canvas that repaints every frame
  // forces the compositor to re-blur that region continuously — measurable,
  // constant overhead that competes with rendering while the mouse moves.
  fpsEl.style.cssText = 'position:fixed;top:10px;left:10px;z-index:100;font:12px/1 monospace;color:#b0b4c0;background:rgba(14,14,18,0.9);padding:5px 10px;border-radius:8px;pointer-events:none;';
  const dpr = Math.min(devicePixelRatio, 2);

  const rCanvas = document.createElement('canvas');
  rCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;cursor:grab;touch-action:none';
  document.body.appendChild(rCanvas);
  const rCtx = rCanvas.getContext('2d')!;

  const tCanvas = document.createElement('canvas');
  tCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';
  document.body.appendChild(tCanvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);
  const gpuCtx = tCanvas.getContext('webgpu')!;
  // OPAQUE canvas: with 'premultiplied' the compositor must alpha-blend the
  // full-screen canvas over the page every frame — moving the mouse adds
  // compositor damage and drops frames even when zero JS runs per event. Opaque
  // lets the compositor treat it as a solid layer; the backdrop is painted by the
  // render pass clear color instead (see frame.ts).
  gpuCtx.configure({ device, format: 'rgba8unorm', alphaMode: 'opaque' });

  await document.fonts.ready;
  const ref = buildRefDoc();

  // One atlas for every demo: reference-doc glyphs + full ASCII (code editor) +
  // filled icon/illustration vector art (keyed "icon:name"/"art:name") + KaTeX
  // math glyphs (mi:/mn:/sz: prefixes). Any demo whose content stays within this
  // set renders without rebuilding the atlas.
  const allChars = new Set<string>();
  for (const el of ref.styledEls) for (const ch of (el.editText || el.text)) allChars.add(ch);
  for (const ch of editorAtlasChars()) allChars.add(ch);
  // Caption/typography punctuation used by demos (e.g. the explainer lower-third).
  for (const ch of '·—–×÷') allChars.add(ch);
  const shapes: Record<string, { quads: number[]; bbox: number[] }> = {};
  for (const name in ICONS) shapes['icon:' + name] = svgPathToQuads(ICONS[name]);
  for (const name in FILE_TYPE_ICONS) shapes['icon:' + name] = svgPathToQuads(FILE_TYPE_ICONS[name]);
  for (const name in ILLUSTRATIONS) shapes['art:' + name] = svgPathToQuads(ILLUSTRATIONS[name]);
  const mathFonts = await loadMathFonts();
  const atlas = buildGlyphAtlas(font, [...allChars].join(' '), shapes, mathExtraFonts(mathFonts));

  // depthWrite variant: the analytic-3D opaque pass (D26) self-occludes space
  // curves through the shared depth buffer; the IDE's renderer (its own call)
  // has no 3D content so it skips the second pipeline.
  const renderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm', depthWrite: true, label: 'scene' });
  const upscaler = createUpscaler(device, 'rgba8unorm');
  const frameCache = createFrameCache(device, 'rgba8unorm');
  const meshRenderer = createMeshRenderer(device, 'rgba8unorm');
  // The 3D free-camera (camera-controls) is bound once to the interaction canvas
  // and shared by every demo; it stays disabled until a demo enters 3D.
  initOrbit(rCanvas);

  return {
    fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device,
    font, shaderCode, renderer, atlas, upscaler, frameCache, meshRenderer, ref,
  };
}
