// ── Demo flight ──────────────────────────────────────────────────────────────
// A scripted cinematic tour, entirely in 3D: the document lies flat on the ground
// and the perspective camera flies over it — sweeping across the pages, diving
// deep into a single glyph to show off the infinitely-zoomable analytic render,
// then visiting the code editor, the animated terminal, the file tree, and the
// windgraph boards — with eased moves and animated typographic title-cards.
//
// The chrome (letterbox bars + sleek chapter timeline + play/replay/back controls
// + lower-third caption + splash) is the SAME analytic CinematicHud the explainer
// v2 uses (src/authoring/runtime/cinematicHud.ts) — zero DOM. It renders through
// the screen HUD overlay and is hit-tested in screen space; a shader postfx draws
// the opening vignette/splash.

import type { AppState } from '../state';
import { enter3D, bufCoords } from '../camera/camera';
import { clamp01 } from '../util/math';
import {
  updateOrbit, disableOrbit,
  orbitSetPose, orbitGetPose, orbitDistForZoom, orbitZoomForDist,
} from '../camera/orbit';
import { CinematicHud, type HudDriver } from '../authoring/runtime/cinematicHud';
import type { EmitBuffers } from '../authoring/islands/draw';
import { createPostFx } from '../windfoil/postfx';

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

export interface DemoController {
  running: boolean;
  playing: boolean;
  toggle(): void;
  start(): void;
  stop(): void;
  update(now: number): void;
  /** Emit the analytic HUD (letterbox + timeline + controls + caption) into the
   *  screen-overlay buffers for this frame. Only meaningful while running. */
  renderHud?(out: EmitBuffers, Cw: number, Ch: number, now: number): void;
}

export function createDemo(s: AppState): DemoController {
  // Shader vignette + analytic splash (the only grade; no DOM splash overlay).
  const postfx = createPostFx(s.device, 'rgba8unorm');

  let shots: Shot[] = [];
  let idx = 0;
  let phaseStart = 0;
  let from: Pose = { tx: 0, tz: 0, zoom: 1, az: 0, polar: 0 };
  let shotStarts: number[] = [];

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

    list.push({ pose: overviewPose(0.4), travel: 4.6, hold: 1.6, ease: easeInOut,
      title: 'windfoil', sub: 'Analytic GPU Typography' });

    list.push({ pose: { tx: p0.x + p0.w / 2, tz: p0.y + p0.h * 0.42, zoom: fitZoom(p0.w, p0.h, 0.95), az: 0.34, polar: 0.5 },
      travel: 3.2, hold: 1.8, ease: easeOut,
      title: 'Every glyph is a closed-form integral', sub: 'No textures · No SDF' });

    list.push({ pose: { tx: g.x, tz: g.y, zoom: 95, az: 0.16, polar: 0.14 },
      travel: 3.4, hold: 2.4, ease: easeOut,
      title: 'Infinitely zoomable', sub: 'One pixel is a winding integral · zero aliasing' });

    if (s.morphDemo) {
      const m = s.morphDemo, w = m.width, h = m.height;
      list.push({ pose: { tx: m.x0 + w / 2, tz: m.y0 + h * 0.5, zoom: fitZoom(w + 120, h + 170, 0.92), az: -0.22, polar: 0.5 },
        travel: 4.6, hold: 4.6, ease: easeInOut,
        title: 'It animates', sub: 'Eased morphs · draw-on · riding point' });
    }

    if (s.interactive) {
      const it = s.interactive, w = it.width, h = it.height;
      list.push({ pose: { tx: it.x0 + w / 2, tz: it.y0 + h * 0.5, zoom: fitZoom(w + 140, h + 170, 0.9), az: 0.24, polar: 0.52 },
        travel: 4.2, hold: 5.2, ease: easeInOut,
        title: "And it's interactive", sub: 'Reactive constraints · live recompute',
        tick: () => { s.interactive?.autoDrive(); } });
    }

    if (s.graph3d) {
      const g3 = s.graph3d;
      const span = g3.halfSpan * 2 + 400;
      list.push({ pose: { tx: g3.cx, tz: g3.cy, zoom: fitZoom(span, span, 0.85), az: 0.5, polar: 0.95 },
        travel: 4.6, hold: 5.2, ease: easeInOut,
        title: 'True 3D graphs', sub: 'Surfaces that rise off the page' });
    }

    if (s.mathDemo) {
      const md = s.mathDemo, w = md.width, h = md.height;
      list.push({ pose: { tx: md.x0 + w / 2, tz: md.y0 + h * 0.5, zoom: fitZoom(w + 140, h + 180, 0.9), az: -0.16, polar: 0.48 },
        travel: 4.4, hold: 5.6, ease: easeInOut,
        title: 'LaTeX-quality math', sub: 'Parsed + analytic · razor-sharp at any zoom' });
    }

    if (s.editor) {
      const ed = s.editor, w = ed.contentWidth(), h = ed.contentHeight();
      list.push({ pose: { tx: ed.x0 + w / 2, tz: ed.y0 + h * 0.34, zoom: fitZoom(w, h, 0.9), az: -0.34, polar: 0.55 },
        travel: 5.0, hold: 1.8, ease: easeInOut, title: 'A code editor', sub: 'Same analytic pipeline',
        onEnter: () => { ed.focused = true; } });
    }

    if (s.terminal) {
      const tm = s.terminal, w = tm.contentW, h = tm.contentH;
      const schedule: [string, number][] = [['neofetch', 0.5], ['colors', 2.5], ['progress', 4.3], ['graph', 6.8]];
      let base = -1, ci = 0;
      list.push({ pose: { tx: tm.x0 + w / 2, tz: tm.y0 + h * 0.36, zoom: fitZoom(w, h, 0.92), az: 0.18, polar: 0.5 },
        travel: 4.6, hold: 9.4, ease: easeInOut, title: 'A live terminal', sub: 'Vector widgets, real-time',
        onEnter: () => { tm.focused = true; tm.open(); base = -1; ci = 0; },
        tick: (t) => {
          if (tm.busy) return;
          if (base < 0) { base = t; tm.input = ''; (tm as any).cursorCol = 0; }
          const rel = t - base;
          if (ci >= schedule.length) return;
          const [cmd, at] = schedule[ci];
          if (rel < at) return;
          const n = Math.min(cmd.length, Math.floor((rel - at) / 0.05));
          while (tm.input.length < n) tm.insert(cmd[tm.input.length]);
          if (tm.input.length >= cmd.length && rel - at > cmd.length * 0.05 + 0.35) { tm.enter(); ci++; }
        } });
    }

    if (s.fileTree) {
      const ft = s.fileTree, w = ft.width + 80, h = Math.max(ft.contentHeight, 200);
      list.push({ pose: { tx: ft.x0 + ft.width / 2, tz: ft.y0 + h * 0.42, zoom: fitZoom(w, h, 0.9), az: 0.4, polar: 0.56 },
        travel: 3.0, hold: 2.0, ease: easeOut, title: 'A project explorer', sub: 'Crisp at every zoom' });
    }

    list.push({ pose: overviewPose(0.44), travel: 5.4, hold: 2.2, ease: easeInOut,
      title: 'windfoil', sub: 'One draw call' });

    shots = list;
    shotStarts = [];
    let acc = 0;
    for (let i = 0; i < shots.length; i++) {
      shotStarts.push(acc);
      acc += shots[i].travel + shots[i].hold;
    }
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
    shots[i].onEnter?.();
  }

  function frame2D() {
    s.camX = s.tgtX = s.viewX = s.PAGE_W / 2;
    s.camY = s.tgtY = s.viewY = s.docH / 2;
    s.camZ = s.tgtZ = s.viewZ = fitZoom(s.PAGE_W, s.docH, 0.9);
  }

  // ── HUD driver: maps the CinematicHud's scrub/stop onto the shot list ────────
  const totalDuration = () => shots.reduce((a, sh) => a + sh.travel + sh.hold, 0);
  const chapters = () => {
    let acc = 0;
    return shots.map((sh, i) => {
      const c = { id: `shot-${i}`, start: acc, title: sh.title, sub: sh.sub, duration: sh.travel + sh.hold };
      acc += sh.travel + sh.hold;
      return c;
    });
  };
  const currentT = () => {
    if (!shots.length) return 0;
    return Math.min(totalDuration(), shotStarts[idx] + Math.max(0, (performance.now() - phaseStart) / 1000));
  };
  function seekTo(seconds: number) {
    let acc = 0;
    for (let i = 0; i < shots.length; i++) {
      const d = shots[i].travel + shots[i].hold;
      if (seconds < acc + d || i === shots.length - 1) {
        enterShot(i, performance.now() - (seconds - acc) * 1000);
        return;
      }
      acc += d;
    }
  }
  const driver: HudDriver = {
    totalDuration,
    seek: (_s, seconds, pause) => { seekTo(seconds); ctrl.playing = !pause; },
    stopTour: () => { ctrl.playing = false; },
  };
  const syncFx = () => {
    const t = currentT();
    postfx.set(t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2));
  };
  const hud = new CinematicHud(driver, s, {
    toggle: () => ctrl.toggle(),
    replay: () => { seekTo(0); ctrl.playing = true; },
    back: () => ctrl.stop(),
    sync: syncFx,
  });

  // ── Interaction: HUD controls act; any other input hands back to the user ───
  const onPointer = (e: Event) => {
    if ((e as PointerEvent).button !== 0) return;
    const b = bufCoords(s, (e as PointerEvent).clientX, (e as PointerEvent).clientY);
    if (hud.hitScreen(b.x, b.y)) { hud.pointerDownScreen(b.x, b.y); return; }
    ctrl.stop();
  };
  const onMove = (e: Event) => {
    const b = bufCoords(s, (e as PointerEvent).clientX, (e as PointerEvent).clientY);
    if (hud.hoverScreen(b.x, b.y)) hud.dragToScreen(b.x);
  };
  const onUp = () => hud.endDrag();
  const onWheel = () => { ctrl.stop(); };
  const onKey = (e: Event) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Escape') { ctrl.stop(); return; }
    if (k === ' ') { (e as KeyboardEvent).preventDefault(); ctrl.toggle(); return; }
    ctrl.stop();
  };
  const addCancel = () => {
    addEventListener('pointerdown', onPointer, true);
    addEventListener('pointermove', onMove, { capture: true, passive: true });
    addEventListener('pointerup', onUp, true);
    addEventListener('wheel', onWheel, { capture: true, passive: true });
    addEventListener('keydown', onKey, true);
  };
  const removeCancel = () => {
    removeEventListener('pointerdown', onPointer, true);
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('wheel', onWheel, true);
    removeEventListener('keydown', onKey, true);
  };

  const ctrl: DemoController = {
    running: false,
    playing: false,
    toggle() { if (!this.running) this.start(); else this.playing = !this.playing; },
    start() {
      if (this.running) { this.playing = true; return; }
      frame2D();
      enter3D(s);
      buildShots();
      this.running = true; this.playing = true;
      s.postfx = postfx;
      hud.setBars(true);
      enterShot(0, performance.now());
      syncFx();
      addCancel();
    },
    stop() {
      if (!this.running) return;
      this.running = false; this.playing = false;
      s.cam3d.active = false; s.cam3d.exiting = false; disableOrbit();
      frame2D();
      hud.setBars(false);
      s.postfx = null; postfx.set(0);
      removeCancel();
    },
    update(now: number) {
      if (!this.running || !shots.length) return;
      if (this.playing) {
        const sh = shots[idx];
        const t = (now - phaseStart) / 1000;
        const total = sh.travel + sh.hold;
        if (t >= total) {
          enterShot((idx + 1) % shots.length, now);
        } else {
          const eased = (sh.ease || easeInOut)(clamp01(t / sh.travel));
          applyPose(lerpPose(from, sh.pose, eased));
          sh.tick?.(t);
        }
      }
      syncFx();
    },
    renderHud(out: EmitBuffers, Cw2: number, Ch2: number, now: number) {
      if (!this.running) return;
      hud.build(s.font, s.atlas, now, Cw2, Ch2, {
        t: currentT(), total: Math.max(0.001, totalDuration()), playing: this.playing,
        chapters: chapters(), activeIdx: idx,
      }, out);
    },
  };

  return ctrl;
}
