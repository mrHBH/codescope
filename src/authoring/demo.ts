// ── Authoring demo boot (generic — accepts any SceneDoc) ─────────────────────

import type { Engine } from '../playground/engine';
import type { AppState } from '../state';
import { createBaseApp, finishApp, snapTo } from '../playground/app';
import { enter3D, exit3D, setSize } from '../camera/camera';
import { disableOrbit } from '../camera/orbit';
import { SceneRuntime } from './runtime/runtime';
import { SAMPLE_DOC } from './scenes/sampleScene';
import { EXPLAINER_DOC } from './scenes/explainerScene';
import type { SceneDoc } from './ir/types';
import { chapterWindows } from './runtime/timeline';
import { createTimelineHud } from '../playground/timelineHud';
import { createPostFx } from '../windfoil/postfx';

function bootScene(engine: Engine, onBack: () => void, doc: SceneDoc, opts: { chrome?: boolean; cinematic?: boolean } = {}): () => void {
  const s = createBaseApp(engine, false);
  const runtime = new SceneRuntime(doc, { font: engine.font, atlas: engine.atlas });
  runtime.showChrome = !!opts.chrome;
  runtime.cinematicCaption = !!opts.cinematic;
  s.interactive = runtime;

  // Cinematic post-process: a real GPU vignette + analytic splash radial (no DOM).
  // The frame loop routes the coverage pass through it while it is attached.
  const postfx = opts.cinematic ? createPostFx(engine.device, 'rgba8unorm') : null;
  if (postfx) s.postfx = postfx;

  // Frame the first chapter
  const chs = runtime.chapterWindows();
  const firstCh = doc.objects[chs[0]?.id] as any;
  if (firstCh) {
    const cx = firstCh.at[0] + firstCh.size[0] / 2;
    const cy = firstCh.at[1] + firstCh.size[1] / 2;
    const z = Math.min(s.tCanvas.width / (firstCh.size[0] + 200), s.tCanvas.height / (firstCh.size[1] + 200)) * 1.02;
    snapTo(s, cx, cy, z);
  }

  let playBtn: HTMLButtonElement | null = null;

  // ── DOM chrome ───────────────────────────────────────────────────────────
  const chrome = document.createElement('div');
  chrome.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;overflow:hidden;font-family:"Inter","Segoe UI",system-ui,sans-serif';

  // Cinematic letterbox bars (the splash radial + vignette are a shader
  // post-process — see postfx above — so there is no DOM splash overlay).
  let barTop: HTMLDivElement | null = null;
  let barBot: HTMLDivElement | null = null;
  if (opts.cinematic) {
    barTop = document.createElement('div');
    barBot = document.createElement('div');
    const barCSS = 'position:absolute;left:0;right:0;height:11vh;background:#0b0c10;transition:transform .8s cubic-bezier(.7,0,.2,1)';
    barTop.style.cssText = barCSS + ';top:0;transform:translateY(-100%)';
    barBot.style.cssText = barCSS + ';bottom:0;transform:translateY(100%)';
    chrome.append(barTop, barBot);
  }

  const cap = document.createElement('div');
  cap.style.cssText = 'display:none;position:absolute;left:7%;bottom:13.4vh;max-width:min(980px,84vw);opacity:0;will-change:opacity,transform;transition:opacity .35s ease,transform .35s ease;transform:translateY(8px)';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'color:#eef0f4;font-size:clamp(23px,2.5vw,40px);font-weight:650;letter-spacing:-.01em;line-height:1.0;text-shadow:0 2px 30px rgba(0,0,0,.65)';
  const subEl = document.createElement('div');
  subEl.style.cssText = 'color:#8a8d95;font-size:clamp(10px,.95vw,13px);font-weight:650;letter-spacing:.24em;text-transform:uppercase;margin-top:8px;text-shadow:0 2px 20px rgba(0,0,0,.65)';
  cap.append(titleEl, subEl);
  chrome.appendChild(cap);

  const timeline = createTimelineHud({ left: '7%', right: '7%', bottom: '2.4vh', activeScale: 2.0, interactive: true });
  if (opts.cinematic) timeline.el.dataset.explainerTimeline = '1';
  chrome.appendChild(timeline.el);
  document.body.appendChild(chrome);

  const chapters = runtime.chapterWindows();
  timeline.setItems(chapters.map((c) => ({ title: c.title, subtitle: c.sub, duration: c.duration })));

  const updateTimeline = () => {
    const total = Math.max(0.001, runtime.totalDuration());
    const t = Math.max(0, Math.min(runtime.tourT, total));
    // Drive the shader splash/vignette from the playhead: full during the title,
    // easing out as it clears. Called on play, scrub, and every frame.
    if (postfx) postfx.set(t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2));
    timeline.setProgress01(t / total);
    let acc = 0;
    let activeIdx = chapters.length - 1;
    for (let i = 0; i < chapters.length; i++) {
      acc += chapters[i].duration;
      if (t < acc) { activeIdx = i; break; }
    }
    timeline.setActive(activeIdx);
    timeline.setTimeLabel(`${t.toFixed(1)}s / ${total.toFixed(1)}s`);
    if (chapters[activeIdx]) {
      titleEl.textContent = chapters[activeIdx].title;
      subEl.textContent = chapters[activeIdx].sub;
    }
  };

  timeline.onScrub((ratio) => {
    const keepPlaying = !!s.demo?.running;
    runtime.seek(s, ratio * runtime.totalDuration(), !keepPlaying);
    if (keepPlaying) runtime.playing = true;
    updateTimeline();
  });

  const setChromeVisible = (on: boolean) => {
    if (barTop) barTop.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
    if (barBot) barBot.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
    timeline.setVisible(on);
    // The DOM lower-third caption is for non-cinematic demos; cinematic tours use
    // the in-world GPU caption (runtime.drawCaption) instead.
    if (!opts.cinematic) {
      cap.style.display = on ? '' : 'none';
      cap.style.opacity = on ? '1' : '0';
    }
  };
  updateTimeline();
  setChromeVisible(true);

  const cancelTour = (e: Event) => {
    if (!s.demo?.running) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.closest('button') || t.closest('[data-explainer-timeline]'))) return;
    s.demo.stop();
  };
  const addCancel = () => {
    addEventListener('pointerdown', cancelTour, true);
    addEventListener('wheel', cancelTour, { capture: true, passive: true });
    addEventListener('keydown', cancelTour, true);
  };
  const removeCancel = () => {
    removeEventListener('pointerdown', cancelTour, true);
    removeEventListener('wheel', cancelTour, true);
    removeEventListener('keydown', cancelTour, true);
  };
  addCancel();

  // ── Demo object (wires frame loop) ──────────────────────────────────────
  s.demo = {
    running: false,
    toggle() { this.running ? this.stop() : this.start(); },
    start() {
      this.running = true;
      runtime.play(s, runtime.tourT);
      setChromeVisible(true);
      updateTimeline();
      addCancel();
      if (playBtn) playBtn.textContent = '⏸';
    },
    stop() {
      this.running = false;
      runtime.stopTour(s);
      if (opts.cinematic) { setChromeVisible(false); removeCancel(); }
      if (playBtn) playBtn.textContent = '▶';
    },
    update(now: number) {
      if (!this.running) return;
      runtime.update(now, s);
      updateTimeline();
      if (!runtime.playing) this.stop();
    },
  };

  const dispose = finishApp(s, onBack, [
    { icon: '⏸', title: 'Pause / resume', onClick: () => s.demo?.toggle(), ref: (el) => { playBtn = el; } },
    { icon: '↺', title: 'Replay from the start', onClick: () => {
      runtime.replay(s);
      s.demo?.start();
    } },
  ]);

  // Auto-start the demo (after finishApp so refs are wired)
  s.demo.start();

  return () => {
    removeCancel();
    s.demo?.stop();
    s.postfx = null;
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
