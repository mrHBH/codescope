// ── replay engine (dev tool) ─────────────────────────────────────────────────
// Reproduces a Recording in the LIVE page (a real browser, real WebGPU) so the
// fps read off window.__perf is ground truth — not a headless JS microbench.
// Triggered by `?replay=<name>` on the route hash (e.g. /#windgraph?replay=foo):
// the page boots the route normally, this restores the start camera, dispatches
// the recorded events at their cadence onto the canvas, samples __perf over the
// action window, and publishes the report to window.__recReport — which the
// Playwright runner (scripts/replay.ts) polls and asserts on. When opened from the
// #testinfra demo (`&stats=1`), a compact stats table (input labels + fps + js)
// is shown with a "back to testinfra" button.

import type { Recording, RecEvent, RecSummary, Store } from './store';
import { downsampleMax } from './store';

export interface StatSide { fpsMin: number; fpsAvg: number; fpsP95: number; jsMax: number; jsAvg: number; dtAvg: number; dtP95: number; dtWorst: number; dropped: number; frames: number; }
export interface ReplayReport {
  name: string; route: string;
  recorded: StatSide;
  replay: StatSide;
  inputs: Record<string, number>;
  duration: number;
  viewportMatch: boolean;
  /** Replay per-frame dt + js (downsampled) for the chart. */
  series: { dt: number[]; js: number[] };
  error?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor(pred: () => any, timeout = 8000): Promise<any> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeout) { const v = pred(); if (v) return v; await sleep(30); }
  return null;
}

function dispatch(canvas: HTMLCanvasElement, ev: RecEvent) {
  if (ev.type === 'wheel') {
    canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, composed: true,
      clientX: ev.x, clientY: ev.y, deltaX: ev.deltaX ?? 0, deltaY: ev.deltaY ?? 0,
      deltaMode: ev.deltaMode ?? 0, ctrlKey: !!ev.ctrlKey,
    }));
    return;
  }
  const down = ev.type === 'pointerdown';
  canvas.dispatchEvent(new PointerEvent(ev.type, {
    bubbles: true, cancelable: true, composed: true,
    clientX: ev.x, clientY: ev.y, button: ev.button, buttons: down ? 1 : 0,
    pointerId: ev.pointerId, pointerType: 'mouse', isPrimary: true,
  }));
}

function statSide(fps: number[], js: number[], dt: number[]): StatSide {
  if (!fps.length) return { fpsMin: 0, fpsAvg: 0, fpsP95: 0, jsMax: 0, jsAvg: 0, dtAvg: 0, dtP95: 0, dtWorst: 0, dropped: 0, frames: 0 };
  let min = Infinity, sum = 0;
  const sorted = [...fps].sort((a, b) => a - b);
  for (const f of fps) { if (f < min) min = f; sum += f; }
  const p95 = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))] : 0;
  const dtSorted = [...dt].sort((a, b) => a - b);
  let jsMax = 0, jsSum = 0, dtSum = 0, dtWorst = 0;
  for (const j of js) { if (j > jsMax) jsMax = j; jsSum += j; }
  for (const d of dt) { dtSum += d; if (d > dtWorst) dtWorst = d; }
  return {
    fpsMin: Math.round(min), fpsAvg: Math.round(sum / fps.length), fpsP95: Math.round(p95(sorted, 0.95)),
    jsMax: +jsMax.toFixed(1), jsAvg: +(jsSum / js.length).toFixed(1),
    dtAvg: +(dtSum / Math.max(dt.length, 1)).toFixed(2), dtP95: +p95(dtSorted, 0.95).toFixed(2), dtWorst: +dtWorst.toFixed(2),
    dropped: 0, frames: fps.length,
  };
}

async function run(rec: Recording): Promise<ReplayReport> {
  const w = window as any;
  const state = await waitFor(() => w.__rec?.state);
  const zero = () => ({ fpsMin: 0, fpsAvg: 0, fpsP95: 0, jsMax: 0, jsAvg: 0, dtAvg: 0, dtP95: 0, dtWorst: 0, dropped: 0, frames: 0 });
  if (!state) return { name: rec.name, route: rec.route, recorded: rec.summary ? statFromSummary(rec.summary) : zero(), replay: zero(), inputs: rec.summary?.inputs ?? {}, duration: rec.duration, viewportMatch: false, series: { dt: [], js: [] }, error: 'app state never appeared' };
  const canvas: HTMLCanvasElement = w.__csState?.rCanvas;
  if (!canvas) return { ...mkErr(rec, 'no canvas on __csState'), recorded: rec.summary ? statFromSummary(rec.summary) : zero() };
  const vp = state.viewport ?? { w: 0, h: 0, dpr: 0 };
  const viewportMatch = Math.abs(vp.w - rec.viewport.w) <= 2 && Math.abs(vp.h - rec.viewport.h) <= 2 && Math.abs(vp.dpr - rec.viewport.dpr) < 0.01;

  // Suspend the recorder so the replayed events aren't re-recorded.
  w.__recorder?.suspend?.(true);
  w.__recReplaying = true;

  if (rec.start) w.__rec.setCam(rec.start);
  // The boot skipped its own camera framing because a replay was pending; the
  // recorded pose is now the camera, so snapTo can behave normally again.
  w.__replayPending = false;
  await sleep(250); // let the frame loop reflect the pose + warm caches

  // Sample __perf on every frame; tag each sample with a timestamp so we can
  // window the stats to the action (excluding the pre/post settle).
  const samples: { t: number; fps: number; js: number; dt: number }[] = [];
  let alive = true;
  const loop = () => { if (!alive) return; const p = w.__perf; if (p) samples.push({ t: performance.now(), fps: p.fps, js: p.frameMs, dt: p.dt }); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  console.log(`[replay] “${rec.name}” — replaying ${rec.events.length} events over ${(rec.duration / 1000).toFixed(1)}s`);
  await sleep(120);
  const t0 = performance.now();
  for (const ev of rec.events) {
    const at = t0 + ev.t;
    const now = performance.now();
    if (at > now) await sleep(at - now);
    // Re-sync the camera to the recording's pose at each gesture start. Without
    // this, the animated 3D orbit camera (camera-controls damping) drifts from the
    // recording and a handle-grab misses → the drag replays as a camera pan.
    if (ev.type === 'pointerdown' && ev.cam) w.__rec.setCam(ev.cam);
    dispatch(canvas, ev);
  }
  const tEnd = performance.now();
  await sleep(300); // let the last frames' cost land in __perf
  alive = false;

  const win = samples.filter((s) => s.t >= t0 && s.t <= tEnd);
  const arr = win.length ? win : samples;
  const side = statSide(arr.map((s) => s.fps), arr.map((s) => s.js), arr.map((s) => s.dt));
  side.dropped = arr.reduce((n, s) => n + (s.dt > 32 ? 1 : 0), 0);
  const report: ReplayReport = {
    name: rec.name, route: rec.route,
    recorded: rec.summary ? statFromSummary(rec.summary) : zero(),
    replay: side,
    inputs: rec.summary?.inputs ?? {},
    duration: rec.duration,
    viewportMatch,
    series: { dt: downsampleMax(arr.map((s) => s.dt), 400), js: downsampleMax(arr.map((s) => s.js), 400) },
  };
  w.__recReport = report;
  // Persist for the analytic #testinfra board (reads it back after you return).
  try { localStorage.setItem('cs-last-report', JSON.stringify(report)); } catch { /* private mode */ }
  console.log(`[replay] “${rec.name}” → replay ${report.replay.fpsAvg} fps (min ${report.replay.fpsMin}, js≤${report.replay.jsMax}ms) · recorded ${report.recorded.fpsAvg} fps${report.viewportMatch ? '' : ' · ⚠ viewport/dpr differs'}`);
  w.__recorder?.suspend?.(false);
  w.__recReplaying = false;
  // Opened from the #testinfra board (?back=testinfra): let the user see the
  // replayed end state briefly, then return to the recordings list (the board
  // shows the stats table from cs-last-report).
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('back') === 'testinfra') {
    await sleep(1600);
    try { location.hash = '#testinfra'; location.reload(); } catch { /* already gone */ }
  }
  return report;
}

function statFromSummary(s: RecSummary): StatSide {
  return { fpsMin: s.fpsMin, fpsAvg: s.fpsAvg, fpsP95: s.fpsP95, jsMax: s.jsMax, jsAvg: s.jsAvg, dtAvg: s.dtAvg, dtP95: s.dtP95, dtWorst: s.dtWorst, dropped: s.dropped, frames: s.frames };
}

function mkErr(rec: Recording, error: string): ReplayReport {
  const zero = () => ({ fpsMin: 0, fpsAvg: 0, fpsP95: 0, jsMax: 0, jsAvg: 0, dtAvg: 0, dtP95: 0, dtWorst: 0, dropped: 0, frames: 0 });
  return { name: rec.name, route: rec.route, recorded: rec.summary ? statFromSummary(rec.summary) : zero(), replay: zero(), inputs: rec.summary?.inputs ?? {}, duration: rec.duration, viewportMatch: false, series: { dt: [], js: [] }, error };
}

/** If the route hash carries `?replay=<name>`, fetch + run it once the app boots.
 *  The report lands on window.__recReport + localStorage['cs-last-report'] (the
 *  analytic #testinfra board reads the latter when you return). */
export function runReplayFromQuery(store: Store) {
  const q = location.hash.slice(1).split('?')[1] || '';
  const name = new URLSearchParams(q).get('replay');
  if (!name) return;
  // Don't block boot: wait a tick for createBaseApp to set state, then run.
  setTimeout(() => {
    store.get(name).then((rec) => {
      if (!rec) { console.warn(`[replay] recording “${name}” not found`); return; }
      run(rec).catch((e) => console.error('[replay] error:', e));
    }).catch((e) => console.error('[replay] fetch error:', e));
  }, 50);
}
