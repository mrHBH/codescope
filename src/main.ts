// ── Entry point ─────────────────────────────────────────────────────────────
// Wires the modules together: loads GPU/font, builds the layout DOM, computes
// static buffers, attaches input, and starts the frame loop. All logic lives in
// the focused modules under css/, layout/, camera/, content/, and frame.ts.

import { loadFont } from './windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from './windfoil/gpu';
import { buildGlyphAtlas } from './windfoil/bands';
import { parseCSS, parseColor } from './css/engine';
import { palettes, buildCSS } from './css/theme';
import { buildStyledEls } from './layout/walk';
import type { StyledEl } from './layout/types';
import { createAppState } from './state';
import { buildStatic } from './precompute';
import { setSize, goToPage } from './camera/camera';
import { attachInput } from './camera/input';
import { runFrame } from './frame';
import { HTML_SRC } from './content/pages';

async function main() {
  const fpsEl = document.getElementById('fps')!;
  fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:100;font:13px/1 monospace;color:#ccc;background:rgba(14,14,18,0.8);padding:4px 8px;border-radius:5px;pointer-events:none;';
  const dpr = Math.min(devicePixelRatio, 2);
  const PAGE_W = 1040;

  const rCanvas = document.createElement('canvas');
  rCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;cursor:grab';
  document.body.appendChild(rCanvas);
  const rCtx = rCanvas.getContext('2d')!;

  const tCanvas = document.createElement('canvas');
  tCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';
  document.body.appendChild(tCanvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);
  const gpuCtx = tCanvas.getContext('webgpu')!;
  gpuCtx.configure({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' });

  // Build layout DOM (kept in the document, hidden, so themes can be swapped live)
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:' + PAGE_W + 'px';
  document.body.appendChild(container);
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style><style id="themeStyle"></style>${HTML_SRC}`;
  const themeStyle = container.querySelector('#themeStyle') as HTMLStyleElement;
  // Apply the stylesheet BEFORE measuring boxes — buildStyledEls reads computed
  // styles, so the CSS must be live when the layout tree is built.
  themeStyle.textContent = buildCSS(palettes.light);
  await document.fonts.ready;

  const { styledEls, pageRoots } = buildStyledEls(container);
  const docH = Math.max(...styledEls.map(e => e.y + e.h)) + 60;
  const pages = pageRoots.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  const docRoot: StyledEl = {
    tag: 'BODY', classes: [], id: '', x: 0, y: 0, w: PAGE_W, h: docH, pad: [0, 0, 0, 0], text: '',
    children: pageRoots, parent: null, el: container,
    fs: 16, lh: 16, radius: 0, color: [0, 0, 0, 1], bg: [0, 0, 0, 0], textAlign: 'left', upper: false,
    curBg: [0, 0, 0, 0], curShadow: 0, inline: false, skipText: true, hasFlow: false, isPre: false,
    editable: false, editText: '', caret: 0, selAnchor: -1, originText: '', caretXs: null, caretLines: null, lineTops: null,
  };

  const allChars = new Set<string>();
  for (const el of styledEls) for (const ch of (el.editText || el.text)) allChars.add(ch);
  const atlas = buildGlyphAtlas(font, [...allChars].join(' '));

  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, shaderCode,
    renderer: createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' }),
    font, atlas, container, themeStyle,
    styledEls, pageRoots, editableEls: styledEls.filter(e => e.editable),
    pages, docH, docRoot, fpsEl,
  });

  function applyTheme(dark: boolean) {
    s.isDark = dark;
    const p = palettes[dark ? 'dark' : 'light'];
    themeStyle.textContent = buildCSS(p);
    s.cssRules = parseCSS(themeStyle.textContent);
    s.themeCol = {
      backdrop: parseColor(p.backdrop), pageBg: parseColor(p.pageBg), prog: parseColor(p.progFill),
      pulse: parseColor(p.pulse), shadow: parseColor(p.shadow), caret: parseColor(p.caret), sel: parseColor(p.sel),
    };
    for (const el of s.styledEls) {
      const cs = getComputedStyle(el.el);
      el.color = parseColor(cs.color);
      el.bg = parseColor(cs.backgroundColor);
      el.curBg = parseColor(cs.backgroundColor);
      el.upper = cs.textTransform === 'uppercase';
      el.textAlign = cs.textAlign || 'left';
    }
    if (s.themeBtn) s.themeBtn.textContent = dark ? '☀️' : '🌙';
  }
  applyTheme(false);

  buildStatic(s);

  // Dark-mode toggle (fixed DOM control, never affected by zoom)
  const tb = document.createElement('button');
  tb.textContent = '🌙'; tb.title = 'Toggle dark mode';
  tb.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10;width:42px;height:42px;border-radius:10px;border:none;cursor:pointer;font-size:18px;background:rgba(22,22,46,0.85);color:#fff;';
  tb.onclick = () => applyTheme(!s.isDark);
  document.body.appendChild(tb); s.themeBtn = tb;

  addEventListener('resize', () => setSize(s));
  setSize(s); goToPage(s, 0);
  s.camX = s.tgtX; s.camY = s.tgtY; s.camZ = s.tgtZ;
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;

  attachInput(s);
  runFrame(s);
}

main().catch(e => { const el = document.getElementById('error')!; el.style.display = 'block'; el.textContent = e.message || String(e); console.error(e); });
