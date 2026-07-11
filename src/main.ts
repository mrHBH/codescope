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
import { ICONS, ILLUSTRATIONS } from './content/art';
import { svgPathToQuads } from './windfoil/svg';
import { CodeEditor, editorAtlasChars } from './editor/editor';
import { SAMPLE_CODE } from './editor/sample';

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
    pageIdx: -1, hoverable: false, shadowable: false, anim: '', dynamic: false, ownerPage: -1, icon: '',
  };

  const allChars = new Set<string>();
  for (const el of styledEls) for (const ch of (el.editText || el.text)) allChars.add(ch);
  for (const ch of editorAtlasChars()) allChars.add(ch); // full ASCII for the code editor
  // Bake filled icon/illustration vector art into the same atlas as glyphs, keyed
  // as "icon:name" / "art:name" so layout can reference them like a character.
  const shapes: Record<string, { quads: number[]; bbox: number[] }> = {};
  for (const name in ICONS) shapes['icon:' + name] = svgPathToQuads(ICONS[name]);
  for (const name in ILLUSTRATIONS) shapes['art:' + name] = svgPathToQuads(ILLUSTRATIONS[name]);
  const atlas = buildGlyphAtlas(font, [...allChars].join(' '), shapes);

  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, shaderCode,
    renderer: createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' }),
    font, atlas, container, themeStyle,
    styledEls, pageRoots, editableEls: styledEls.filter(e => e.editable),
    dynamicEls: styledEls.filter(e => e.dynamic),
    marqueeEls: styledEls.filter(e => e.hasFlow && !e.skipText && e.classes.includes('marquee')),
    pages, docH, docRoot, fpsEl,
  });

  const THEME_CYCLE = ['light', 'dark', 'highContrast'] as const;
  const THEME_ICON: Record<string, string> = { light: '🌙', dark: '🔆', highContrast: '☀️' };
  function applyTheme(mode: string) {
    s.themeMode = mode;
    s.isDark = mode !== 'light';
    const p = palettes[mode] || palettes.light;
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
    if (s.themeBtn) s.themeBtn.textContent = THEME_ICON[mode] || '🌙';
    // Feed the context menu's CSS variables so it tracks the active theme.
    const rs = document.documentElement.style;
    rs.setProperty('--ctx-bg', mode === 'light' ? 'rgba(250,249,245,0.98)' : 'rgba(28,32,48,0.98)');
    rs.setProperty('--ctx-fg', p.fg);
    rs.setProperty('--ctx-border', p.border);
    rs.setProperty('--ctx-accent', p.accent);
    rs.setProperty('--ctx-hover', mode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.09)');
    // Static bg/text colors are baked into the precomputed buffers; rebuild them
    // when the theme changes at runtime (skipped on the very first call, before
    // buildStatic has ever run).
    if (s.bgByPage.length) buildStatic(s);
  }
  applyTheme('light');
  s.cycleTheme = () => { const i = THEME_CYCLE.indexOf(s.themeMode as any); applyTheme(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]); };

  buildStatic(s);
  s.pageVisible = new Array(s.pageRoots.length).fill(true);

  // ── Code editor ─────────────────────────────────────────────────────────
  // Lives in world space to the right of the document, so panning/zooming reach
  // it too. Toggling editor mode just re-frames the camera onto it.
  const editor = new CodeEditor(SAMPLE_CODE);
  editor.font = font;
  editor.x0 = PAGE_W + 160;
  editor.y0 = 0;
  s.editor = editor;

  function frameEditor() {
    const w = editor.contentWidth();
    s.tgtZ = Math.min((s.tCanvas.width / w) * 0.92, 1.4);
    s.tgtX = editor.x0 + w / 2;
    s.tgtY = editor.y0 + s.tCanvas.height / (2 * s.tgtZ) - 20;
    s.velX = s.velY = 0;
  }
  function setEditorMode(on: boolean) {
    s.editorMode = on;
    if (on) { editor.focused = true; s.activeEdit = null; frameEditor(); }
    else goToPage(s, 0);
    if (edBtn) edBtn.textContent = on ? '📄' : '⌨️';
  }

  // Dark-mode toggle (fixed DOM control, never affected by zoom)
  const tb = document.createElement('button');
  tb.textContent = '🌙'; tb.title = 'Cycle theme: light → dark → high contrast';
  tb.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10;width:42px;height:42px;border-radius:10px;border:none;cursor:pointer;font-size:18px;background:rgba(22,22,46,0.85);color:#fff;';
  tb.onclick = () => s.cycleTheme!();
  document.body.appendChild(tb); s.themeBtn = tb;

  // Editor-mode toggle
  const edBtn = document.createElement('button');
  edBtn.textContent = '⌨️'; edBtn.title = 'Toggle code editor';
  edBtn.style.cssText = 'position:fixed;top:14px;right:64px;z-index:10;width:42px;height:42px;border-radius:10px;border:none;cursor:pointer;font-size:18px;background:rgba(22,22,46,0.85);color:#fff;';
  edBtn.onclick = () => setEditorMode(!s.editorMode);
  document.body.appendChild(edBtn);

  addEventListener('resize', () => setSize(s));
  setSize(s); goToPage(s, 0);
  s.camX = s.tgtX; s.camY = s.tgtY; s.camZ = s.tgtZ;
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;

  attachInput(s);
  runFrame(s);
}

main().catch(e => { const el = document.getElementById('error')!; el.style.display = 'block'; el.textContent = e.message || String(e); console.error(e); });
