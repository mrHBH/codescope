// ── Launcher ─────────────────────────────────────────────────────────────────
// The entry menu, rendered THROUGH the analytic pipeline (not the DOM): a hidden
// measured HTML document of reference-styled cards is walked into StyledEls and
// drawn by windfoil, exactly like the demos it launches. Panning/zooming and
// hover work for free; a click on a card (id="demo-<id>") boots that demo.

import type { Engine } from './engine';
import { makeDocRoot } from './engine';
import { createAppState } from '../state';
import { buildStatic } from '../precompute';
import { buildStyledEls } from '../layout/walk';
import { hitTest } from '../layout/walk';
import { parseCSS, parseColor } from '../css/engine';
import { setSize, bufCoords, scrToWorld } from '../camera/camera';
import { runFrame } from '../frame';
import { DEMOS, type Demo } from './demos';

// Dark, reference-styled menu CSS. border-radius is read but not rendered (all
// boxes are sharp), so cards read as crisp panels. `.card` makes them hoverable
// (frame loop applies the :hover background), giving live feedback on pointer-over.
const LAUNCHER_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.launcher-page { width: 1040px; padding: 72px 64px; background: #1b1b1c; font-family: 'Lato', sans-serif; }
.lz-title { font-size: 46px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
.lz-sub { font-size: 18px; color: #888888; margin-top: 10px; margin-bottom: 44px; }
.lz-grid { display: flex; flex-direction: column; gap: 20px; }
.lz-card { padding: 26px 28px; background: #2d2d30; border: 1px solid #3a3a3d; border-radius: 12px; cursor: pointer; }
.lz-card:hover { background: #37373b; border-color: #007acc; }
.lz-card-title { font-size: 25px; font-weight: 700; color: #ffffff; }
.lz-card-blurb { font-size: 15px; color: #a6a6ad; margin-top: 9px; line-height: 1.55; }
.lz-card-cta { font-size: 14px; font-weight: 600; color: #35a0ff; margin-top: 16px; }
`;

function menuHTML(demos: Demo[]): string {
  const cards = demos.map((d) => (
    `<div class="card lz-card" id="demo-${d.id}">`
    + `<div class="lz-card-title">${d.name}</div>`
    + `<div class="lz-card-blurb">${d.blurb}</div>`
    + `<div class="lz-card-cta">Launch \u2192</div>`
    + `</div>`
  )).join('');
  return `<div class="page launcher-page">`
    + `<div class="lz-title">windfoil</div>`
    + `<div class="lz-sub">analytic vector rendering \u00b7 choose a demo</div>`
    + `<div class="lz-grid">${cards}</div>`
    + `</div>`;
}

export function bootLauncher(engine: Engine, onPick: (demo: Demo) => void): () => void {
  const { fpsEl, dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, font, renderer, upscaler, atlas } = engine;

  // Build the hidden, measured menu document.
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;contain:layout style;width:' + PAGE_W + 'px';
  document.body.appendChild(container);
  container.innerHTML = `<style>${LAUNCHER_CSS}</style>${menuHTML(DEMOS)}`;

  const { styledEls, pageRoots } = buildStyledEls(container);
  const docH = Math.max(...styledEls.map((e) => e.y + e.h), 0) + 60;
  const pages = pageRoots.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  const docRoot = makeDocRoot(container, pageRoots, docH);

  const s = createAppState({
    dpr, PAGE_W, rCanvas, tCanvas, rCtx, gpuCtx, device, renderer, font, atlas, container,
    styledEls, pageRoots, editableEls: [],
    dynamicEls: styledEls.filter((e) => e.dynamic),
    marqueeEls: [], pages, docH, docRoot, fpsEl,
  });
  s.isDark = true;
  s.cssRules = parseCSS(LAUNCHER_CSS);
  s.themeCol = {
    backdrop: parseColor('#141416'), pageBg: parseColor('#1b1b1c'),
    prog: [0, 0, 0, 0], pulse: [0, 0, 0, 0], shadow: parseColor('rgba(0,0,0,0.45)'),
    caret: [0, 0, 0, 0], sel: parseColor('#264f78'),
  };
  rCanvas.style.background = '#141416';
  s.upscaler = upscaler;
  buildStatic(s);
  s.pageVisible = new Array(pageRoots.length).fill(true);
  setSize(s);

  // Frame the whole menu, comfortably.
  const fit = Math.min(tCanvas.width / (PAGE_W + 220), tCanvas.height / (docH + 160)) * 0.95;
  s.camX = s.viewX = s.tgtX = PAGE_W / 2;
  s.camY = s.viewY = s.tgtY = docH / 2;
  s.camZ = s.viewZ = s.tgtZ = fit;
  s.velX = s.velY = 0;

  // ── Minimal input: pan + wheel-zoom + click-to-pick ──────────────────────
  const ac = new AbortController();
  const { signal } = ac;
  let prev: { x: number; y: number } | null = null;
  let downClient = { x: 0, y: 0 };
  let moved = false;

  rCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    rCanvas.setPointerCapture(e.pointerId);
    prev = bufCoords(s, e.clientX, e.clientY);
    downClient = { x: e.clientX, y: e.clientY };
    moved = false;
  }, { signal });

  rCanvas.addEventListener('pointermove', (e) => {
    const b = bufCoords(s, e.clientX, e.clientY);
    s.mx = b.x; s.my = b.y; // drives hover
    if (!prev) return;
    if (Math.abs(e.clientX - downClient.x) > 4 || Math.abs(e.clientY - downClient.y) > 4) moved = true;
    s.camX -= (b.x - prev.x) / s.camZ; s.camY -= (b.y - prev.y) / s.camZ;
    s.tgtX = s.viewX = s.camX; s.tgtY = s.viewY = s.camY;
    prev = b;
  }, { passive: true, signal });

  const pick = (clientX: number, clientY: number) => {
    const b = bufCoords(s, clientX, clientY);
    const w = scrToWorld(s, b.x, b.y);
    let hit = hitTest(s.docRoot, w.x, w.y);
    while (hit && !(hit.id && hit.id.startsWith('demo-'))) hit = hit.parent;
    if (!hit) return;
    const demo = DEMOS.find((d) => d.id === hit!.id.slice(5));
    if (demo) onPick(demo);
  };

  const endPointer = (e: PointerEvent) => {
    if (prev && !moved) pick(e.clientX, e.clientY);
    prev = null;
  };
  rCanvas.addEventListener('pointerup', endPointer, { signal });
  rCanvas.addEventListener('pointercancel', () => { prev = null; }, { signal });

  rCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const b = bufCoords(s, e.clientX, e.clientY);
    const Cw = tCanvas.width, Ch = tCanvas.height;
    const wx = (b.x - Cw / 2) / s.camZ + s.camX, wy = (b.y - Ch / 2) / s.camZ + s.camY;
    s.camZ *= Math.exp(-e.deltaY * 0.0016);
    s.camZ = Math.max(0.05, Math.min(s.camZ, 40));
    s.camX = wx - (b.x - Cw / 2) / s.camZ; s.camY = wy - (b.y - Ch / 2) / s.camZ;
    s.tgtX = s.viewX = s.camX; s.tgtY = s.viewY = s.camY; s.tgtZ = s.viewZ = s.camZ;
  }, { passive: false, signal });

  const onResize = () => setSize(s);
  addEventListener('resize', onResize, { signal });

  const frameStop = runFrame(s);
  return () => {
    frameStop();
    ac.abort();
    container.remove();
  };
}
