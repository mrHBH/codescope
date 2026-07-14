// ── Entry point ─────────────────────────────────────────────────────────────
// Wires the modules together: loads GPU/font, builds the layout DOM, computes
// static buffers, attaches input, and starts the frame loop. All logic lives in
// the focused modules under css/, layout/, camera/, content/, and frame.ts.

import { loadFont } from './windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from './windfoil/gpu';
import { buildGlyphAtlas } from './windfoil/bands';
import { palettes, buildCSS } from './css/theme';
import { createThemeController } from './css/themeController';
import { buildStyledEls } from './layout/walk';
import type { StyledEl } from './layout/types';
import { createAppState } from './state';
import { buildStatic } from './precompute';
import { setSize, goToPage } from './camera/camera';
import { toggle3D } from './camera/camera';
import { initOrbit } from './camera/orbit';
import { attachInput } from './camera/input';
import { runFrame } from './frame';
import { HTML_SRC } from './content/pages';
import { ICONS, ILLUSTRATIONS } from './content/art';
import { svgPathToQuads } from './windfoil/svg';
import { CodeEditor, editorAtlasChars } from './editor/editor';
import { SAMPLE_CODE } from './editor/sample';
import { Terminal } from './editor/terminal';
import { FileTree } from './editor/fileTree';
import { createToolbar } from './ui/toolbar';
import { createDemo } from './ui/demo';

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
    curBg: [0, 0, 0, 0], curShadow: 0, borderW: [0, 0, 0, 0], borderC: [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
    inline: false, skipText: true, hasFlow: false, isPre: false, inlineText: false,
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
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device,
    renderer: createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' }),
    font, atlas, container,
    styledEls, pageRoots, editableEls: styledEls.filter(e => e.editable),
    dynamicEls: styledEls.filter(e => e.dynamic),
    marqueeEls: styledEls.filter(e => e.hasFlow && !e.skipText && e.classes.includes('marquee')),
    pages, docH, docRoot, fpsEl,
  });

  const theme = createThemeController(s, themeStyle, buildStatic);
  theme.apply('dark');
  s.cycleTheme = theme.cycle;

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

  // ── File tree ─────────────────────────────────────────────────────────────
  // World-space panel to the left of the document.
  const fileTree = new FileTree();
  fileTree.font = font;
  fileTree.x0 = -fileTree.width - 40;
  fileTree.y0 = 0;
  s.fileTree = fileTree;

  function frameFileTree() {
    const w = fileTree.width + 60;
    const z = Math.min((s.tCanvas.width / w) * 0.92, 1.4);
    fileTree.setViewportHeight(s.tCanvas.height / Math.max(z, 1e-6));
    const h = fileTree.contentHeight;
    s.tgtZ = z;
    s.tgtX = fileTree.x0 + w / 2;
    s.tgtY = fileTree.y0 + h / 2;
    s.velX = s.velY = 0;
  }

  // ── Terminal ──────────────────────────────────────────────────────────────
  // Same renderer, its own world-space panel to the right of the editor.
  const terminal = new Terminal();
  terminal.font = font;
  terminal.x0 = editor.x0 + 1400;
  terminal.y0 = 0;
  s.terminal = terminal;

  function frameTerminal() {
    const w = terminal.contentW;
    s.tgtZ = Math.min((s.tCanvas.width / w) * 0.92, 1.5);
    s.tgtX = terminal.x0 + w / 2;
    s.tgtY = terminal.y0 + s.tCanvas.height / (2 * s.tgtZ) - 20;
    s.velX = s.velY = 0;
  }

  let edBtn: HTMLButtonElement | null = null;
  let tmBtn: HTMLButtonElement | null = null;
  let ftBtn: HTMLButtonElement | null = null;
  function setEditorMode(on: boolean) {
    s.editorMode = on;
    if (on) { s.terminalMode = false; s.fileTreeMode = false; terminal.focused = false; fileTree.focused = false; editor.focused = true; s.activeEdit = null; frameEditor(); }
    else goToPage(s, 0);
    if (edBtn) edBtn.textContent = on ? '📄' : '⌨️';
    if (tmBtn) tmBtn.textContent = '❯_';
    if (ftBtn) ftBtn.textContent = '📁';
  }
  function setTerminalMode(on: boolean) {
    s.terminalMode = on;
    if (on) { s.editorMode = false; s.fileTreeMode = false; editor.focused = false; fileTree.focused = false; terminal.focused = true; s.activeEdit = null; terminal.open(); frameTerminal(); }
    else goToPage(s, 0);
    if (tmBtn) tmBtn.textContent = on ? '📄' : '❯_';
    if (edBtn) edBtn.textContent = '⌨️';
    if (ftBtn) ftBtn.textContent = '📁';
  }
  function setFileTreeMode(on: boolean) {
    s.fileTreeMode = on;
    if (on) { s.editorMode = false; s.terminalMode = false; editor.focused = false; terminal.focused = false; fileTree.focused = true; s.activeEdit = null; frameFileTree(); }
    else goToPage(s, 0);
    if (ftBtn) ftBtn.textContent = on ? '📄' : '📁';
    if (edBtn) edBtn.textContent = '⌨️';
    if (tmBtn) tmBtn.textContent = '❯_';
  }

  // Fixed toolbar (top-right): editor toggle + terminal toggle + theme cycle.
  createToolbar([
    { icon: '📁', title: 'Toggle file tree', onClick: () => setFileTreeMode(!s.fileTreeMode), ref: (el) => { ftBtn = el; } },
    { icon: '⌨️', title: 'Toggle code editor', onClick: () => setEditorMode(!s.editorMode), ref: (el) => { edBtn = el; } },
    { icon: '❯_', title: 'Toggle terminal', onClick: () => setTerminalMode(!s.terminalMode), ref: (el) => { tmBtn = el; } },
    { icon: '🧊', title: 'Toggle 3D free camera (drag = orbit, Shift+drag = pan, wheel = dolly)', onClick: () => toggle3D(s) },
    { icon: '�', title: 'Play cinematic demo flight (any interaction stops it)', onClick: () => s.demo?.toggle() },
    { icon: '�🌙', title: 'Cycle theme: light → dark → high contrast', onClick: () => s.cycleTheme!(), ref: (el) => { s.themeBtn = el; } },
  ]);

  addEventListener('resize', () => setSize(s));
  setSize(s); goToPage(s, 0);
  s.camX = s.tgtX; s.camY = s.tgtY; s.camZ = s.tgtZ;
  s.viewX = s.camX; s.viewY = s.camY; s.viewZ = s.camZ;

  initOrbit(rCanvas);
  attachInput(s);
  s.demo = createDemo(s);
  runFrame(s);
}

main().catch(e => { const el = document.getElementById('error')!; el.style.display = 'block'; el.textContent = e.message || String(e); console.error(e); });
