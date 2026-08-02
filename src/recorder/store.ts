// ── recording store (dev tool) ───────────────────────────────────────────────
// A recording is a captured interaction (events + start camera + viewport) that
// the replay harness reproduces in a real browser to measure fps. Two backends:
//   · HttpStore  — files on disk via the vite dev plugin (GET/POST /__rec).
//                  Persistent + regression-grade (committed to the repo).
//   · LocalStore — localStorage fallback when the dev plugin isn't serving
//                  (e.g. `vite preview` / a static build). Per-browser, volatile.
// createStore() probes /__rec and uses HTTP if it answers, else localStorage.

import type { CamState } from './bridge';

export interface RecEvent {
  t: number;            // ms since the first recorded event
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'wheel';
  x: number; y: number; // clientX / clientY (CSS px)
  button: number;
  pointerId: number;    // normalized to 1 on record (replay uses one synthetic pointer)
  deltaX?: number; deltaY?: number; deltaMode?: number; ctrlKey?: boolean; // wheel
  /** Camera pose AT this event (captured on pointerdown — the gesture start). The
   *  replay re-syncs to it before dispatching, so a drift in the animated 3D orbit
   *  camera can't accumulate and make a handle-grab miss (which would turn the drag
   *  into a camera pan). Undefined on non-pointerdown / older recordings. */
  cam?: CamState | null;
}

/** Per-frame stats over a window: fps/js/dt percentiles, dropped (missed a 60fps
 *  deadline), and the input labels observed (e.g. "handle drag", "camera pan",
 *  "rotate (3D)", "wheel zoom", "slider drag") with gesture counts. */
export interface RecSummary {
  frames: number;
  fpsMin: number; fpsAvg: number; fpsP95: number;
  jsMax: number; jsAvg: number;
  dtAvg: number; dtP95: number; dtWorst: number;
  dropped: number;
  inputs: Record<string, number>;   // input label → gesture count
  /** Downsampled per-frame samples (dt + js ms) for the chart. */
  series?: { dt: number[]; js: number[] };
}

/** Reduce an array to ≤ maxN points by bucketing (max per bucket), preserving
 *  peaks — the chart's columns. Shared by the recorder + replay engine. */
export function downsampleMax(a: number[], maxN: number): number[] {
  const n = a.length;
  if (n <= maxN) return a.slice();
  const out: number[] = [];
  for (let bkt = 0; bkt < maxN; bkt++) {
    const i0 = Math.floor((bkt / maxN) * n), i1 = Math.max(i0 + 1, Math.floor(((bkt + 1) / maxN) * n));
    let m = 0;
    for (let k = i0; k < i1 && k < n; k++) if (a[k] > m) m = a[k];
    out.push(m);
  }
  return out;
}

export interface Recording {
  name: string;
  route: string;
  recordedAt: number;
  viewport: { w: number; h: number; dpr: number };
  start: CamState | null;
  events: RecEvent[];
  duration: number;     // ms (last event t)
  summary: RecSummary;
}

export interface RecMeta { name: string; route: string; recordedAt: number; summary: Recording['summary']; viewport: Recording['viewport']; }

export interface Store {
  list(): Promise<RecMeta[]>;
  get(name: string): Promise<Recording | null>;
  save(name: string, rec: Recording): Promise<void>;
  remove(name: string): Promise<void>;
}

const INDEX_KEY = 'cs-rec-index';
const dataKey = (n: string) => 'cs-rec-data-' + n;

class LocalStore implements Store {
  async list(): Promise<RecMeta[]> {
    const idx = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as RecMeta[];
    return idx.sort((a, b) => b.recordedAt - a.recordedAt);
  }
  async get(name: string): Promise<Recording | null> {
    const raw = localStorage.getItem(dataKey(name));
    return raw ? JSON.parse(raw) : null;
  }
  async save(name: string, rec: Recording): Promise<void> {
    localStorage.setItem(dataKey(name), JSON.stringify(rec));
    const idx = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as RecMeta[];
    const meta: RecMeta = { name, route: rec.route, recordedAt: rec.recordedAt, summary: rec.summary, viewport: rec.viewport };
    const i = idx.findIndex((m) => m.name === name);
    if (i >= 0) idx[i] = meta; else idx.push(meta);
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }
  async remove(name: string): Promise<void> {
    localStorage.removeItem(dataKey(name));
    const idx = (JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as RecMeta[]).filter((m) => m.name !== name);
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }
}

class HttpStore implements Store {
  private metaOf(r: Recording): RecMeta {
    return { name: r.name, route: r.route, recordedAt: r.recordedAt, summary: r.summary, viewport: r.viewport };
  }
  async list(): Promise<RecMeta[]> {
    const res = await fetch('/__rec');
    if (!res.ok) throw new Error('list ' + res.status);
    const recs = (await res.json()) as Recording[];
    return recs.map((r) => this.metaOf(r)).sort((a, b) => b.recordedAt - a.recordedAt);
  }
  async get(name: string): Promise<Recording | null> {
    const res = await fetch('/__rec/' + encodeURIComponent(name));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('get ' + res.status);
    return res.json();
  }
  async save(name: string, rec: Recording): Promise<void> {
    const res = await fetch('/__rec/' + encodeURIComponent(name), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) });
    if (!res.ok) throw new Error('save ' + res.status);
  }
  async remove(name: string): Promise<void> {
    await fetch('/__rec/' + encodeURIComponent(name), { method: 'DELETE' });
  }
}

/** Probe the dev plugin; use HTTP if present, else localStorage. */
export async function createStore(): Promise<Store> {
  try {
    const res = await fetch('/__rec', { method: 'GET' });
    if (res.ok) { void res.json().catch(() => {}); return new HttpStore(); }
  } catch { /* no dev server / plugin → fall back */ }
  return new LocalStore();
}
