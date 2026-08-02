// ── recorder (dev tool) ──────────────────────────────────────────────────────
// Press F2 in any demo to start recording; reproduce the action; F2 again to stop
// + save. Records the canvas pointer/wheel events (capture phase, so we see them
// before the app's handlers) with timestamps, plus the start camera pose +
// viewport, and samples window.__perf for a recorded-fps baseline. It also
// CLASSIFIES the input gestures (handle drag / slider / camera pan / rotate /
// wheel zoom) so the recording's stats table can label what the action exercised.
// Replayed by replay.ts on the same page via `?replay=<name>` and, in bulk, by
// scripts/replay.ts under Playwright (the robust perf protocol).
//
// Coordinates are stored as event.clientX/clientY (CSS px). Replay dispatches on
// the same canvas at the same CSS position, so it is faithful when the canvas
// occupies the same rect + dpr (the Playwright runner matches both exactly).
// For automation (scripts/record.ts) the recorder is also driven programmatically
// through window.__recorder.start() / stop(name).

import type { CamState } from './bridge';
import type { Recording, RecEvent, RecSummary, Store } from './store';
import { downsampleMax } from './store';
import { bufCoords } from '../camera/camera';

interface RecState {
  t0: number;
  armed: boolean;          // a button is down → record moves (drag)
  events: RecEvent[];
  fps: number[];           // __perf.fps samples during the recording
  js: number[];            // __perf.frameMs samples (per-frame JS)
  dt: number[];            // __perf.dt samples (raw frame delta — dropped detection)
  inputs: Record<string, number>; // classified input labels → gesture count
  startCam: CamState | null; // camera pose captured at START (the replay restore point)
  raf: number;
}

let store: Store | null = null;
let canvas: HTMLCanvasElement | null = null;
let rec: RecState | null = null;
let indicator: HTMLDivElement | null = null;
let suspended = false;     // true while a replay is driving events (don't record it)

function route(): string { return location.hash.slice(1).split('?')[0] || 'launcher'; }

function ensureIndicator() {
  if (indicator || typeof document === 'undefined') return;
  indicator = document.createElement('div');
  indicator.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483647;'
    + 'font:600 13px/1 system-ui,sans-serif;color:#fff;background:#c0392b;padding:6px 12px;border-radius:6px;'
    + 'box-shadow:0 2px 10px rgba(0,0,0,.4);display:none;pointer-events:none;letter-spacing:.3px';
  document.body.appendChild(indicator);
}

function sampleLoop() {
  if (!rec) return;
  const p = (window as any).__perf;
  if (p) {
    if (typeof p.fps === 'number' && p.fps > 0) rec.fps.push(p.fps);
    if (typeof p.frameMs === 'number') rec.js.push(p.frameMs);
    if (typeof p.dt === 'number') rec.dt.push(p.dt);
  }
  if (indicator) {
    const secs = ((performance.now() - rec.t0) / 1000).toFixed(1);
    const inp = Object.keys(rec.inputs).join(' · ') || '—';
    indicator.textContent = `● REC  ${secs}s  ·  ${rec.events.length} ev  ·  ${inp}  ·  F2 to stop`;
  }
  rec.raf = requestAnimationFrame(sampleLoop);
}

function start() {
  if (rec || suspended || !canvas) return;
  if (route() === 'launcher') { flash('open a demo first — F2 records interactions inside a demo'); return; }
  const cam = (window as any).__rec?.getCam?.() ?? null;
  rec = { t0: performance.now(), armed: false, events: [], fps: [], js: [], dt: [], inputs: Object.create(null), startCam: cam, raf: 0 };
  rec.raf = requestAnimationFrame(sampleLoop);
  ensureIndicator();
  if (indicator) indicator.style.display = 'block';
}

function summarize(fps: number[], js: number[], dt: number[], inputs: Record<string, number>): RecSummary {
  // Drop the first ~15 warm frames; the rest is the action window.
  const arr = fps.slice(15);
  if (!arr.length) {
    return { frames: 0, fpsMin: 0, fpsAvg: 0, fpsP95: 0, jsMax: 0, jsAvg: 0, dtAvg: 0, dtP95: 0, dtWorst: 0, dropped: 0, inputs };
  }
  const jsArr = js.slice(15), dtArr = dt.slice(15);
  let min = Infinity, sum = 0, dropped = 0;
  for (const f of arr) { if (f < min) min = f; sum += f; }
  for (const d of dtArr) if (d > 32) dropped++; // missed a 60fps deadline (≈ a visible stutter)
  const sorted = [...arr].sort((a, b) => a - b);
  const dtSorted = [...dtArr].sort((a, b) => a - b);
  const p95 = (a: number[], q: number) => a.length ? a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))] : 0;
  let jsMax = 0, jsSum = 0, dtSum = 0;
  for (const j of jsArr) { if (j > jsMax) jsMax = j; jsSum += j; }
  for (const d of dtArr) dtSum += d;
  return {
    frames: arr.length,
    fpsMin: Math.round(min), fpsAvg: Math.round(sum / arr.length), fpsP95: Math.round(p95(sorted, 0.95)),
    jsMax: +jsMax.toFixed(1), jsAvg: +(jsSum / Math.max(jsArr.length, 1)).toFixed(1),
    dtAvg: +(dtSum / Math.max(dtArr.length, 1)).toFixed(2), dtP95: +p95(dtSorted, 0.95).toFixed(2), dtWorst: +Math.max(...dtArr).toFixed(2),
    dropped, inputs,
    series: { dt: downsampleMax(dtArr, 400), js: downsampleMax(jsArr, 400) },
  };
}

function labelInput(kind: string, detail = '') {
  if (!rec) return;
  const key = detail ? `${kind} ${detail}` : kind;
  rec.inputs[key] = (rec.inputs[key] || 0) + 1;
}

/** Classify a gesture the app just processed (runs after the app's handlers —
 *  the recorder's listener is capture-phase, so it fires first; a 0ms timeout
 *  runs once the current task finishes and the drag/pan/chrome state is settled). */
function classifyPointerDown(button: number, x: number, y: number) {
  if (!rec) return;
  if (button === 2) { labelInput('rotate (3D)'); return; }
  if (button !== 0) return;
  setTimeout(() => {
    if (!rec) return;
    const s = (window as any).__csState;
    if (!s) return;
    // UI chrome press (toolbar button like the 3D toggle, open menu/panel) —
    // captured as a pointer event; label it so the stats table shows what fired.
    const b = bufCoords(s, x, y);
    if (s.toolbar && s.toolbar.hitTest?.(b.x, b.y)) { labelInput('ui button'); return; }
    if (s.analyticMenu?.open || (s.panel?.open && !s.panel.isDragging)) { labelInput('ui click'); return; }
    const inter = s.interactive as any;
    if (inter?.boards) for (const bd of inter.boards) if (bd.panel?.isDragging) { labelInput('slider drag'); return; }
    const h = inter?.activeHandle;
    if (h) { labelInput('handle drag', h); return; }
    if (inter?.dragging) { labelInput('handle drag'); return; }
    if (s.dragging) { labelInput('camera pan'); return; }
  }, 0);
}

async function stop(nameArg?: string) {
  if (!rec) return;
  cancelAnimationFrame(rec.raf);
  if (indicator) indicator.style.display = 'none';
  const r = rec; rec = null;
  if (r.events.length === 0) { flash('recording empty — nothing saved'); return; }
  const startCam: CamState | null = r.startCam ?? (window as any).__rec?.getCam?.() ?? null;
  const vp = (window as any).__rec?.state?.viewport ?? { w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  const summary = summarize(r.fps, r.js, r.dt, r.inputs);
  const defName = `${route()}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
  let name = defName;
  if (nameArg) {
    name = nameArg.trim().replace(/[^\w.-]+/g, '-').slice(0, 80) || defName;
  } else {
    try {
      const prompted = prompt('Save recording as:', defName);
      if (prompted === null) { flash('recording discarded'); return; }
      name = prompted.trim().replace(/[^\w.-]+/g, '-').slice(0, 80) || defName;
    } catch { /* prompt blocked → use default */ }
  }
  const recording: Recording = {
    name, route: route(), recordedAt: Date.now(),
    viewport: vp, start: startCam,
    events: r.events, duration: r.events[r.events.length - 1].t, summary,
  };
  try { await store?.save(name, recording); flash(`saved “${name}”  (rec ${summary.fpsAvg} fps, min ${summary.fpsMin})`); }
  catch (e) { flash('save failed: ' + (e instanceof Error ? e.message : String(e))); }
}

function flash(msg: string) {
  ensureIndicator();
  if (!indicator) return;
  indicator.textContent = msg;
  indicator.style.background = '#2c3e50';
  indicator.style.display = 'block';
  setTimeout(() => { if (indicator && !rec) indicator.style.display = 'none'; indicator && (indicator.style.background = '#c0392b'); }, 2200);
}

function push(ev: RecEvent) {
  if (!rec) return;
  if (rec.events.length === 0) rec.t0 = performance.now();
  ev.t = Math.round(performance.now() - rec.t0);
  rec.events.push(ev);
}

/** Install the recorder on the shared canvas + window. Idempotent. */
export function installRecorder(c: HTMLCanvasElement, s: Store) {
  if (canvas) return;
  canvas = c; store = s;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'F2' || suspended) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (rec) stop(); else start();
  };
  window.addEventListener('keydown', onKey, true);
  // Capture phase on the canvas → fires before the app's (bubble) handlers, and
  // before its capture-phase wheel handler (we register first).
  const ptr = (type: RecEvent['type']) => (e: PointerEvent) => {
    if (suspended) return;
    if (type === 'pointerdown') {
      rec && (rec.armed = true);
      classifyPointerDown(e.button, e.clientX, e.clientY);
      // Capture the camera AT the gesture start: the replay re-syncs to it before
      // this event so 3D orbit drift can't make the grab miss (which turns a
      // handle drag into a camera pan — the "recorded as camera movement" bug).
      const cam = (window as any).__rec?.getCam?.() ?? null;
      push({ t: 0, type, x: e.clientX, y: e.clientY, button: e.button, pointerId: 1, cam });
    } else if (type === 'pointerup' || type === 'pointercancel') {
      rec && (rec.armed = false);
      push({ t: 0, type, x: e.clientX, y: e.clientY, button: e.button, pointerId: 1 });
    } else if (rec?.armed) {
      push({ t: 0, type, x: e.clientX, y: e.clientY, button: e.button, pointerId: 1 });
    }
  };
  c.addEventListener('pointerdown', ptr('pointerdown'), true);
  c.addEventListener('pointermove', ptr('pointermove'), true);
  c.addEventListener('pointerup', ptr('pointerup'), true);
  c.addEventListener('pointercancel', ptr('pointercancel'), true);
  c.addEventListener('wheel', (e: WheelEvent) => {
    if (suspended) return;
    labelInput('wheel zoom');
    push({ t: 0, type: 'wheel', x: e.clientX, y: e.clientY, button: 0, pointerId: 1, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey });
  }, true);
  (window as any).__recorder = { start, stop, get isRecording() { return !!rec; }, suspend: (v: boolean) => { suspended = v; } };
}
