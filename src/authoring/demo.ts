// ── Authoring demo boot (generic — accepts any SceneDoc) ─────────────────────

import type { Engine } from '../playground/engine';
import type { AppState } from '../state';
import { createBaseApp, finishApp, snapTo } from '../playground/app';
import { enter3D, bufCoords } from '../camera/camera';
import { disableOrbit } from '../camera/orbit';
import { SceneRuntime } from './runtime/runtime';
import { CinematicHud } from './runtime/cinematicHud';
import { SAMPLE_DOC } from './scenes/sampleScene';
import { EXPLAINER_DOC } from './scenes/explainerScene';
import type { SceneDoc } from './ir/types';
import { createTimelineHud } from '../playground/timelineHud';
import { createPostFx } from '../windfoil/postfx';
import { createGlyphRenderer } from '../windfoil/gpu';

interface Opts { chrome?: boolean; cinematic?: boolean; }

function bootScene(engine: Engine, onBack: () => void, doc: SceneDoc, opts: Opts = {}): () => void {
  const s = createBaseApp(engine, false);
  const runtime = new SceneRuntime(doc, { font: engine.font, atlas: engine.atlas });
  runtime.showChrome = !!opts.chrome;
  runtime.cinematic = !!opts.cinematic;
  s.interactive = runtime;

  // Frame the first chapter
  const chs = runtime.chapterWindows();
  const firstCh = doc.objects[chs[0]?.id] as any;
  if (firstCh) {
    const cx = firstCh.at[0] + firstCh.size[0] / 2;
    const cy = firstCh.at[1] + firstCh.size[1] / 2;
    const z = Math.min(s.tCanvas.width / (firstCh.size[0] + 200), s.tCanvas.height / (firstCh.size[1] + 200)) * 1.02;
    snapTo(s, cx, cy, z);
  }

  if (opts.cinematic) return bootCinematic(s, runtime, engine, onBack);
  return bootDomChrome(s, runtime, onBack);
}

// ── DOM-free cinematic: analytic HUD + shader postfx, zero DOM ────────────────
function bootCinematic(s: AppState, runtime: SceneRuntime, engine: Engine, onBack: () => void): () => void {
  // Dedicated renderer for the screen-space HUD overlay (separate buffers so its
  // draw never aliases the scene draw in the same command buffer).
  s.hudRenderer = createGlyphRenderer(engine.device, { code: engine.shaderCode, format: 'rgba8unorm' });

  // Shader vignette + analytic splash (the only grade; no DOM splash overlay).
  const postfx = createPostFx(engine.device, 'rgba8unorm');
  s.postfx = postfx;
  const syncFx = () => {
    const total = Math.max(0.001, runtime.totalDuration());
    const t = Math.max(0, Math.min(runtime.tourT, total));
    postfx.set(t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2));
  };

  // Analytic HUD (letterbox + sleek timeline + play/replay/home + caption), drawn
  // + hit-tested through the pipeline in screen space. Same functionality the DOM
  // toolbar/timeline provided, with zero DOM.
  const hud = new CinematicHud(runtime, s, {
    toggle: () => s.demo?.toggle(),
    replay: () => { runtime.replay(s); s.demo?.start(); },
    back: onBack,
    sync: syncFx,
  });
  runtime.cinematicHud = hud;

  // The shared fps counter is global debug DOM; hide it for a clean 0-DOM frame.
  const hidFps = !!s.fpsEl;
  if (hidFps) s.fpsEl.style.display = 'none';

  // Hand control to the user on any non-control interaction (matches the
  // original: pressing a control acts, anything else stops the tour). The HUD is
  // hit-tested in screen (backing-store) px, which is what bufCoords returns.
  const onPointer = (e: Event) => {
    if ((e as PointerEvent).button !== 0) return;
    const b = bufCoords(s, (e as PointerEvent).clientX, (e as PointerEvent).clientY);
    if (runtime.isHudControlScreen(b.x, b.y)) return;   // let the canvas handler drive it
    s.demo?.stop();
  };
  const onWheel = () => { s.demo?.stop(); };
  const onKey = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Escape') { onBack(); return; }
    if (k === ' ') { (e as KeyboardEvent).preventDefault(); s.demo?.toggle(); return; }
    if (k === 'd' || k === 'D') { hud.toggleDebug(); return; }   // toggle debug detail
    s.demo?.stop();
  };
  const addCancel = () => {
    addEventListener('pointerdown', onPointer, true);
    addEventListener('wheel', onWheel, { capture: true, passive: true });
    addEventListener('keydown', onKey, true);
  };
  const removeCancel = () => {
    removeEventListener('pointerdown', onPointer, true);
    removeEventListener('wheel', onWheel, true);
    removeEventListener('keydown', onKey, true);
  };

  s.demo = {
    running: false,
    toggle() { this.running ? this.stop() : this.start(); },
    start() {
      this.running = true;
      runtime.play(s, runtime.tourT);
      hud.setBars(true);
      syncFx();
    },
    stop() {
      this.running = false;
      runtime.stopTour(s);
      hud.setBars(false);
      syncFx();
    },
    update(now: number) {
      if (!this.running) return;
      runtime.update(now, s);
      syncFx();
      if (!runtime.playing) this.stop();
    },
  };

  // Capture listeners live for the whole demo (so Esc/Space work while paused);
  // they no-op harmlessly when the tour is already stopped.
  addCancel();
  const dispose = finishApp(s, onBack, [], { toolbar: false });
  s.demo.start();

  return () => {
    removeCancel();
    s.demo?.stop();
    s.postfx = null;
    s.hudRenderer = null;
    runtime.cinematicHud = null;
    if (hidFps && s.fpsEl) s.fpsEl.style.display = '';
    disableOrbit();
    s.cam3d.active = false;
    s.cam3d.exiting = false;
    dispose();
  };
}

// ── DOM chrome path (designer / authoring demo) ───────────────────────────────
function bootDomChrome(s: AppState, runtime: SceneRuntime, onBack: () => void): () => void {
  let playBtn: HTMLButtonElement | null = null;

  const chrome = document.createElement('div');
  chrome.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;overflow:hidden;font-family:"Inter","Segoe UI",system-ui,sans-serif';

  const cap = document.createElement('div');
  cap.style.cssText = 'display:none;position:absolute;left:7%;bottom:13.4vh;max-width:min(980px,84vw);opacity:0;will-change:opacity,transform;transition:opacity .35s ease,transform .35s ease;transform:translateY(8px)';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'color:#eef0f4;font-size:clamp(23px,2.5vw,40px);font-weight:650;letter-spacing:-.01em;line-height:1.0;text-shadow:0 2px 30px rgba(0,0,0,.65)';
  const subEl = document.createElement('div');
  subEl.style.cssText = 'color:#8a8d95;font-size:clamp(10px,.95vw,13px);font-weight:650;letter-spacing:.24em;text-transform:uppercase;margin-top:8px;text-shadow:0 2px 20px rgba(0,0,0,.65)';
  cap.append(titleEl, subEl);
  chrome.appendChild(cap);

  const timeline = createTimelineHud({ left: '7%', right: '7%', bottom: '2.4vh', activeScale: 2.0, interactive: true });
  chrome.appendChild(timeline.el);
  document.body.appendChild(chrome);

  const chapters = runtime.chapterWindows();
  timeline.setItems(chapters.map((c) => ({ title: c.title, subtitle: c.sub, duration: c.duration })));

  const updateTimeline = () => {
    const total = Math.max(0.001, runtime.totalDuration());
    const t = Math.max(0, Math.min(runtime.tourT, total));
    timeline.setProgress01(t / total);
    let acc = 0;
    let activeIdx = chapters.length - 1;
    for (let i = 0; i < chapters.length; i++) { acc += chapters[i].duration; if (t < acc) { activeIdx = i; break; } }
    timeline.setActive(activeIdx);
    timeline.setTimeLabel(`${t.toFixed(1)}s / ${total.toFixed(1)}s`);
    if (chapters[activeIdx]) { titleEl.textContent = chapters[activeIdx].title; subEl.textContent = chapters[activeIdx].sub; }
  };
  timeline.onScrub((ratio) => {
    const keepPlaying = !!s.demo?.running;
    runtime.seek(s, ratio * runtime.totalDuration(), !keepPlaying);
    if (keepPlaying) runtime.playing = true;
    updateTimeline();
  });

  const setChromeVisible = (on: boolean) => {
    timeline.setVisible(on);
    cap.style.display = on ? '' : 'none';
    cap.style.opacity = on ? '1' : '0';
  };
  updateTimeline();
  setChromeVisible(true);

  s.demo = {
    running: false,
    toggle() { this.running ? this.stop() : this.start(); },
    start() { this.running = true; runtime.play(s, runtime.tourT); setChromeVisible(true); updateTimeline(); if (playBtn) playBtn.textContent = '⏸'; },
    stop() { this.running = false; runtime.stopTour(s); if (playBtn) playBtn.textContent = '▶'; },
    update(now: number) { if (!this.running) return; runtime.update(now, s); updateTimeline(); if (!runtime.playing) { this.running = false; if (playBtn) playBtn.textContent = '▶'; } },
  };

  const dispose = finishApp(s, onBack, [
    { icon: '▶', title: 'Play / Pause', onClick: () => s.demo?.toggle(), ref: (el) => { playBtn = el; } },
    { icon: '↺', title: 'Replay from start', onClick: () => { runtime.replay(s); s.demo?.start(); } },
  ]);
  s.demo.start();

  return () => {
    s.demo?.stop();
    disableOrbit();
    s.cam3d.active = false;
    s.cam3d.exiting = false;
    chrome.remove();
    dispose();
  };
}

export function bootAuthoring(engine: Engine, onBack: () => void): () => void {
  return bootScene(engine, onBack, SAMPLE_DOC, { chrome: true });
}

export function bootExplainerV2(engine: Engine, onBack: () => void): () => void {
  return bootScene(engine, onBack, EXPLAINER_DOC, { chrome: false, cinematic: true });
}

import { PAGE_DEMO_DOC } from './scenes/pagesScene';

export function bootPages(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const runtime = new SceneRuntime(PAGE_DEMO_DOC, { font: engine.font, atlas: engine.atlas });
  runtime.showChrome = true; // designer panels for the pages layout demo
  s.interactive = runtime;

  // Compute world bounds of all pages
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [id, spec] of Object.entries(PAGE_DEMO_DOC.objects)) {
    if (spec.kind === 'group' && (spec as any).page) {
      const g = spec as any;
      const sz = g.size ?? [800, 600];
      if (g.at[0] < minX) minX = g.at[0];
      if (g.at[1] < minY) minY = g.at[1];
      if (g.at[0] + sz[0] > maxX) maxX = g.at[0] + sz[0];
      if (g.at[1] + sz[1] > maxY) maxY = g.at[1] + sz[1];
    }
  }
  runtime.x0 = minX - 200; runtime.y0 = minY - 200; runtime.width = maxX - minX + 400; runtime.height = maxY - minY + 400;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pw = maxX - minX + 200, ph = maxY - minY + 200;
  const z = Math.min(s.tCanvas.width / pw, s.tCanvas.height / ph) * 1.02;
  snapTo(s, cx, cy, z);
  enter3D(s);

  // DOM hint
  const hint = document.createElement('div');
  hint.textContent = 'drag SE handles to resize · orbit/pan/zoom freely';
  hint.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;color:#6a6d75;font-size:clamp(9px,1vw,13px);font-family:"Inter","Segoe UI",system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 10px rgba(0,0,0,.7)';
  document.body.appendChild(hint);

  const dispose = finishApp(s, onBack);
  return () => {
    hint.remove();
    disableOrbit();
    s.cam3d.active = false;
    dispose();
  };
}
