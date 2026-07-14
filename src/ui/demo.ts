// ── Demo flight ──────────────────────────────────────────────────────────────
// A scripted cinematic tour, entirely in 3D: the document lies flat on the ground
// and the perspective camera flies over it — sweeping across the pages, diving
// deep into a single glyph to show off the infinitely-zoomable analytic render,
// then visiting the code editor, the animated terminal (which types a series of
// commands on cue), and the file tree — with eased moves, letterbox bars, an
// opening title splash, and animated typographic title-cards.

import type { AppState } from '../state';
import { enter3D } from '../camera/camera';
import {
  updateOrbit, disableOrbit,
  orbitSetPose, orbitGetPose, orbitDistForZoom, orbitZoomForDist,
} from '../camera/orbit';

interface Pose { tx: number; tz: number; zoom: number; az: number; polar: number }
interface Shot {
  pose: Pose;
  travel: number;   // seconds easing from the previous pose to this one
  hold: number;     // seconds resting on this pose
  title: string;
  sub: string;
  ease?: (t: number) => number; // per-shot easing (fast cut vs. slow glide)
  onEnter?: () => void;
  tick?: (t: number) => void; // per-frame hook (seconds into the shot)
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);           // quick launch, soft land (fast cuts)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export interface DemoController {
  running: boolean;
  toggle(): void;
  start(): void;
  stop(): void;
  update(now: number): void;
}

export function createDemo(s: AppState): DemoController {
  // ── Overlay: letterbox bars + title-card typography ───────────────────────
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;overflow:hidden;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif';
  const barTop = document.createElement('div');
  const barBot = document.createElement('div');
  const barCSS = 'position:absolute;left:0;right:0;height:11vh;background:#07080c;transition:transform .8s cubic-bezier(.7,0,.2,1)';
  barTop.style.cssText = barCSS + ';top:0;transform:translateY(-100%)';
  barBot.style.cssText = barCSS + ';bottom:0;transform:translateY(100%)';
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;left:7%;bottom:15%;max-width:80%;will-change:opacity,transform';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'color:#f4f6fb;font-size:clamp(28px,4.4vw,60px);font-weight:600;letter-spacing:-.02em;line-height:1.05;text-shadow:0 2px 30px rgba(0,0,0,.6)';
  const subEl = document.createElement('div');
  subEl.style.cssText = 'color:#8ea2c8;font-size:clamp(11px,1.15vw,15px);font-weight:600;letter-spacing:.32em;text-transform:uppercase;margin-top:14px;text-shadow:0 2px 20px rgba(0,0,0,.6)';
  cap.append(titleEl, subEl);
  // Opening splash: a full-screen centred title card shown before the flight.
  const splash = document.createElement('div');
  splash.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;opacity:0;transition:opacity 1s ease;background:radial-gradient(60% 60% at 50% 45%,rgba(20,26,40,.55),rgba(7,8,12,.92))';
  const splashTitle = document.createElement('div');
  splashTitle.textContent = 'windfoil';
  splashTitle.style.cssText = 'color:#f6f8fe;font-size:clamp(46px,9vw,128px);font-weight:700;letter-spacing:-.03em;text-shadow:0 6px 60px rgba(0,0,0,.7)';
  const splashSub = document.createElement('div');
  splashSub.textContent = 'Analytic GPU Renderer';
  splashSub.style.cssText = 'color:#9fb3d8;font-size:clamp(12px,1.5vw,20px);font-weight:600;letter-spacing:.5em;text-transform:uppercase;padding-left:.5em';
  splash.append(splashTitle, splashSub);
  root.append(barTop, barBot, cap, splash);
  document.body.appendChild(root);
  let splashTimer = 0;

  let shots: Shot[] = [];
  let idx = 0;
  let phaseStart = 0;
  let from: Pose = { tx: 0, tz: 0, zoom: 1, az: 0, polar: 0 };

  const Cw = () => s.tCanvas.width;
  const Ch = () => s.tCanvas.height;
  const fitZoom = (w: number, h: number, pad = 0.9) => Math.min(Cw() / w, Ch() / h) * pad;

  // Pick a big heading glyph to dive into (falls back to the first page centre).
  function glyphTarget(): { x: number; y: number } {
    let best: any = null;
    for (const el of s.styledEls) {
      if (el.text && el.text.trim().length > 2 && el.fs >= 24) {
        if (!best || el.fs > best.fs) best = el;
      }
    }
    if (best) return { x: best.x + best.fs * 0.42, y: best.y + best.h * 0.42 };
    const p = s.pages[0];
    return { x: p.x + p.w / 2, y: p.y + 240 };
  }

  function overviewPose(polar = 0.5): Pose {
    return { tx: s.PAGE_W / 2, tz: s.docH / 2, zoom: fitZoom(s.PAGE_W, s.docH, 0.9), az: 0, polar };
  }

  function buildShots() {
    const p0 = s.pages[0] || { x: 0, y: 0, w: s.PAGE_W, h: 1200 };
    const g = glyphTarget();
    const list: Shot[] = [];

    // 1 — Slow majestic rise over the whole document (the splash plays here).
    list.push({ pose: overviewPose(0.4), travel: 4.6, hold: 1.6, ease: easeInOut,
      title: 'windfoil', sub: 'Analytic GPU Typography' });

    // 2 — Swoop down to the page from a swung-round, tilted angle.
    list.push({ pose: { tx: p0.x + p0.w / 2, tz: p0.y + p0.h * 0.42, zoom: fitZoom(p0.w, p0.h, 0.95), az: 0.34, polar: 0.5 },
      travel: 3.2, hold: 1.8, ease: easeOut,
      title: 'Every glyph is a closed-form integral', sub: 'No textures · No SDF' });

    // 3 — Push straight into a single glyph, flattening to top-down: infinite zoom.
    list.push({ pose: { tx: g.x, tz: g.y, zoom: 95, az: 0.16, polar: 0.14 },
      travel: 3.4, hold: 2.4, ease: easeOut,
      title: 'Infinitely zoomable', sub: 'One pixel is a winding integral · zero aliasing' });

    // 4 — Slow sweeping glide to the code editor, banking to the opposite side.
    if (s.editor) {
      const ed = s.editor, w = ed.contentWidth(), h = ed.contentHeight();
      list.push({ pose: { tx: ed.x0 + w / 2, tz: ed.y0 + h * 0.34, zoom: fitZoom(w, h, 0.9), az: -0.34, polar: 0.55 },
        travel: 5.0, hold: 1.8, ease: easeInOut, title: 'A code editor', sub: 'Same analytic pipeline',
        onEnter: () => { ed.focused = true; } });
    }

    // 5 — SLOW settle over the terminal (gives it time to boot), cycling commands.
    if (s.terminal) {
      const tm = s.terminal, w = tm.contentW, h = tm.contentH;
      const schedule: [string, number][] = [['neofetch', 0.5], ['colors', 2.5], ['progress', 4.3], ['graph', 6.8]];
      let base = -1, ci = 0;
      list.push({ pose: { tx: tm.x0 + w / 2, tz: tm.y0 + h * 0.36, zoom: fitZoom(w, h, 0.92), az: 0.18, polar: 0.5 },
        travel: 4.6, hold: 9.4, ease: easeInOut, title: 'A live terminal', sub: 'Vector widgets, real-time',
        onEnter: () => { tm.focused = true; tm.open(); base = -1; ci = 0; },
        tick: (t) => {
          if (tm.busy) return;                         // wait out the boot sequence
          if (base < 0) { base = t; tm.input = ''; (tm as any).cursorCol = 0; }
          const rel = t - base;
          if (ci >= schedule.length) return;
          const [cmd, at] = schedule[ci];
          if (rel < at) return;
          const n = Math.min(cmd.length, Math.floor((rel - at) / 0.05)); // ~20 cps
          while (tm.input.length < n) tm.insert(cmd[tm.input.length]);
          if (tm.input.length >= cmd.length && rel - at > cmd.length * 0.05 + 0.35) { tm.enter(); ci++; }
        } });
    }

    // 6 — Cut across to the file tree from a swung, tilted angle.
    if (s.fileTree) {
      const ft = s.fileTree, w = ft.width + 80, h = Math.max(ft.contentHeight, 200);
      list.push({ pose: { tx: ft.x0 + ft.width / 2, tz: ft.y0 + h * 0.42, zoom: fitZoom(w, h, 0.9), az: 0.4, polar: 0.56 },
        travel: 3.0, hold: 2.0, ease: easeOut, title: 'A project explorer', sub: 'Crisp at every zoom' });
    }

    // 7 — Slow majestic pull back to a tilted overview, then loop.
    list.push({ pose: overviewPose(0.44), travel: 5.4, hold: 2.2, ease: easeInOut,
      title: 'windfoil', sub: 'One draw call' });

    shots = list;
  }

  function applyPose(p: Pose) {
    orbitSetPose(p.tx, p.tz, orbitDistForZoom(p.zoom, Ch()), p.az, p.polar);
    updateOrbit(16);
  }

  function lerpPose(a: Pose, b: Pose, e: number): Pose {
    return {
      tx: a.tx + (b.tx - a.tx) * e,
      tz: a.tz + (b.tz - a.tz) * e,
      zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e),
      az: a.az + (b.az - a.az) * e,
      polar: a.polar + (b.polar - a.polar) * e,
    };
  }

  function enterShot(i: number, now: number) {
    idx = i;
    const cur = orbitGetPose();
    from = { tx: cur.tx, tz: cur.tz, zoom: orbitZoomForDist(cur.dist, Ch()), az: cur.az, polar: cur.polar };
    phaseStart = now;
    const sh = shots[i];
    titleEl.textContent = sh.title;
    subEl.textContent = sh.sub;
    sh.onEnter?.();
  }

  function frame2D() {
    // Frame the document in 2D so enter3D lifts off from a matching top-down view.
    s.camX = s.tgtX = s.viewX = s.PAGE_W / 2;
    s.camY = s.tgtY = s.viewY = s.docH / 2;
    s.camZ = s.tgtZ = s.viewZ = fitZoom(s.PAGE_W, s.docH, 0.9);
  }

  const ctrl: DemoController = {
    running: false,
    toggle() { this.running ? this.stop() : this.start(); },
    start() {
      if (this.running) return;
      frame2D();
      enter3D(s);          // lift into the 3D ground camera for the whole tour
      buildShots();
      this.running = true;
      barTop.style.transform = 'translateY(0)';
      barBot.style.transform = 'translateY(0)';
      splash.style.opacity = '1';
      clearTimeout(splashTimer);
      splashTimer = window.setTimeout(() => { splash.style.opacity = '0'; }, 2400);
      enterShot(0, performance.now());
      addEventListener('pointerdown', stopOnInput, true);
      addEventListener('wheel', stopOnInput, { capture: true, passive: true });
      addEventListener('keydown', stopOnKey, true);
    },
    stop() {
      if (!this.running) return;
      this.running = false;
      s.cam3d.active = false; s.cam3d.exiting = false; disableOrbit();
      frame2D();           // leave the viewer in a clean flat 2D overview
      barTop.style.transform = 'translateY(-100%)';
      barBot.style.transform = 'translateY(100%)';
      cap.style.opacity = '0';
      splash.style.opacity = '0';
      clearTimeout(splashTimer);
      removeEventListener('pointerdown', stopOnInput, true);
      removeEventListener('wheel', stopOnInput, true);
      removeEventListener('keydown', stopOnKey, true);
    },
    update(now: number) {
      if (!this.running || !shots.length) return;
      const sh = shots[idx];
      const t = (now - phaseStart) / 1000;
      const total = sh.travel + sh.hold;
      if (t >= total) { enterShot((idx + 1) % shots.length, now); return; }

      const eased = (sh.ease || easeInOut)(clamp01(t / sh.travel));
      applyPose(lerpPose(from, sh.pose, eased));

      sh.tick?.(t);

      // Caption fade: in over the first 0.9s, out over the last 0.9s of the shot.
      const fadeIn = clamp01(t / 0.9);
      const fadeOut = clamp01((total - t) / 0.9);
      const a = Math.min(fadeIn, fadeOut);
      cap.style.opacity = String(a);
      cap.style.transform = `translateY(${(1 - a) * 16}px)`;
    },
  };

  function stopOnInput() { ctrl.stop(); }
  function stopOnKey(e: KeyboardEvent) { if (e.key === 'Escape' || e.key === ' ') ctrl.stop(); }

  return ctrl;
}
