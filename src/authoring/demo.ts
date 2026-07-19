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

function bootScene(engine: Engine, onBack: () => void, doc: SceneDoc, opts: { chrome?: boolean } = {}): () => void {
  const s = createBaseApp(engine, false);
  const runtime = new SceneRuntime(doc, { font: engine.font, atlas: engine.atlas });
  runtime.showChrome = !!opts.chrome;
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

  let playBtn: HTMLButtonElement | null = null;

  // ── DOM chrome ───────────────────────────────────────────────────────────
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
    timeline.setVisible(on);
    cap.style.display = on ? '' : 'none';
    cap.style.opacity = on ? '1' : '0';
  };
  updateTimeline();
  setChromeVisible(true);

  // Pause/play on user interaction (pointer/wheel/key outside chrome)
  const cancelTour = (_e: Event) => {
    // Only the toolbar button toggles play/pause
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
      // Keep chrome visible so user can scrub — only hide on full teardown
      if (playBtn) playBtn.textContent = '▶';
    },
    update(now: number) {
      if (!this.running) return;
      runtime.update(now, s);
      updateTimeline();
      if (!runtime.playing) { this.running = false; if (playBtn) playBtn.textContent = '▶'; }
    },
  };

  const dispose = finishApp(s, onBack, [
    { icon: '▶', title: 'Play / Pause', onClick: () => s.demo?.toggle(), ref: (el) => { playBtn = el; } },
    { icon: '↺', title: 'Replay from start', onClick: () => { runtime.replay(s); s.demo?.start(); } },
  ]);

  // Auto-start the demo (after finishApp so refs are wired)
  s.demo.start();

  return () => {
    removeCancel();
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
  // Cinematic tour: DOM chapter HUD only — no designer object-tree chrome
  return bootScene(engine, onBack, EXPLAINER_DOC, { chrome: false });
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
