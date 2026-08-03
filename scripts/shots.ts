// ── replay + screenshots + section trace (dev verification tool) ─────────────
// Replays one recording in the real browser, LOOKS at the result (saves PNGs at
// fractions of the action window for image-capable review), and reports the
// per-section frame timings + GPU upload bytes measured during the action —
// the two ground-truth signals for the drag-fps work (postmortem §6.1/§6.3).
//
//   bun run shots repro                 # shots at 25/50/75% + end of the action
//   bun run shots repro 7000            # one shot 7000ms into the action window
//
// Output: recordings/shots/<name>-<label>.png + a console summary (fps, js,
// section ms/frame, upload KB/frame during the action).

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REC_DIR = resolve(ROOT, 'recordings');
const SHOT_DIR = join(REC_DIR, 'shots');
const BASE = 'http://localhost:3000';
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function portUp(): Promise<boolean> {
  try { const r = await fetch(BASE + '/__rec', { method: 'GET' }); return r.ok || r.status === 404; } catch { return false; }
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await portUp()) return null;
  const child = spawn('bun', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore', detached: true });
  process.stdout.write('starting dev server… ');
  for (let i = 0; i < 120; i++) { if (await portUp()) { process.stdout.write('up\n'); return child; } await sleep(500); }
  throw new Error('dev server did not start on :3000');
}

function killServer(child: ChildProcess | null) {
  if (!child || !child.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } }
}

async function main() {
  const name = process.argv[2] || 'repro';
  const atMs = process.argv[3] && !process.argv[3].includes(':') ? Number(process.argv[3]) : null;
  const file = join(REC_DIR, `${name}.json`);
  if (!existsSync(file)) { console.log(`recording "${name}" not found in recordings/`); process.exit(1); }
  const rec = JSON.parse(readFileSync(file, 'utf8'));

  const spec = 'playwright';
  const pw = await import(spec);
  const server = await ensureServer();
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM, headless: false, args: ['--no-sandbox'] });
  try {
    const dpr = rec.viewport.dpr || 1;
    const ctx = await browser.newContext({ viewport: { width: Math.round(rec.viewport.w / dpr), height: Math.round(rec.viewport.h / dpr) }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    // Enable the in-page trace BEFORE boot: accumulate section timings + upload
    // bytes only while the replay engine is dispatching (window.__recReplaying).
    await page.addInitScript(() => {
      const w = window as any;
      w.__trace = 1;
      // Per-frame series during the action: { t (ms since event-dispatch t0), js, upKB, sec }.
      // The replay engine sets __recReplaying, then sleeps 250ms (pose warm) + 120ms
      // (pre-dispatch) before t0 — so t0 ≈ flip + 370ms.
      let wasReplaying = false, t0 = 0, lastUp = 0;
      const series: { t: number; js: number; up: number; dirtyKB: number; sec: Record<string, number> }[] = [];
      const loop = () => {
        requestAnimationFrame(loop);
        const isRep = !!w.__recReplaying;
        if (isRep && !wasReplaying) t0 = performance.now() + 370;
        wasReplaying = isRep;
        if (!isRep) { lastUp = w.__uploadStats?.bytes ?? 0; return; }
        const up = w.__uploadStats?.bytes ?? 0;
        const p = w.__perf;
        const dr = w.__csState?.interactive?.dirtyRanges?.();
        const dirtyKB = dr ? (dr.crv.reduce((n: number, r: number[]) => n + (r[1] - r[0]), 0) * 4) / 1024 : -1;
        series.push({ t: performance.now() - t0, js: p?.frameMs ?? 0, up: (up - lastUp) / 1024, dirtyKB, sec: w.__perfSections ?? {} });
        lastUp = up;
      };
      requestAnimationFrame(loop);
      w.__traceSeries = () => series;
    });
    await page.goto(`${BASE}/#${rec.route}?replay=${encodeURIComponent(name)}`, { waitUntil: 'load' });
    // Wait for the replay engine to start dispatching.
    await page.waitForFunction(() => (window as any).__recReplaying === true, null, { timeout: 20000 });
    const tStart = Date.now();
    const dur = rec.duration ?? 2000;
    const shots: { label: string; at: number }[] = atMs !== null
      ? [{ label: `at${atMs}`, at: atMs }]
      : [
          { label: 'p25', at: Math.round(dur * 0.25) },
          { label: 'p50', at: Math.round(dur * 0.5) },
          { label: 'p75', at: Math.round(dur * 0.75) },
          { label: 'end', at: dur + 150 },
        ];
    mkdirSync(SHOT_DIR, { recursive: true });
    for (const sh of shots) {
      const wait = tStart + 370 + sh.at - Date.now(); // replay engine settles ~250+120ms before t0
      if (wait > 0) await sleep(wait);
      const out = join(SHOT_DIR, `${name}-${sh.label}.png`);
      await page.screenshot({ path: out });
      console.log(`  shot ${sh.label} @${sh.at}ms → ${out}`);
    }
    await page.waitForFunction(() => (window as any).__recReport != null, null, { timeout: 30000 });
    const report = await page.evaluate(() => (window as any).__recReport);
    const series: { t: number; js: number; up: number; dirtyKB: number; sec: Record<string, number> }[] = await page.evaluate(() => (window as any).__traceSeries());
    // Optional "start:end" arg (ms into the action) windows the stats, e.g.
    // `bun run shots repro 5307:8871` for just the handle-drag window.
    let wA = 0, wB = Infinity;
    const winArg = process.argv.slice(2).find((a) => a.includes(':'));
    if (winArg) { const [a, b] = winArg.split(':').map(Number); wA = a; wB = b; }
    const inWin = series.filter((f) => f.t >= wA && f.t <= wB && f.t >= 0);
    const stats = (frames: typeof series, label: string) => {
      if (!frames.length) { console.log(`\n[${label}] no frames`); return; }
      let jsSum = 0, jsMax = 0, upSum = 0;
      const acc: Record<string, { sum: number; n: number }> = {};
      for (const f of frames) {
        jsSum += f.js; if (f.js > jsMax) jsMax = f.js;
        upSum += f.up;
        for (const k of Object.keys(f.sec)) { const a = acc[k] ?? (acc[k] = { sum: 0, n: 0 }); a.sum += f.sec[k]; a.n++; }
      }
      const withDirty = frames.filter((f) => (f as any).dirtyKB >= 0);
      const small = withDirty.filter((f) => (f as any).dirtyKB < 200).length;
      const dirtyStr = withDirty.length ? ` · dirty<200KB: ${small}/${withDirty.length} frames` : '';
      console.log(`\n[${label}] ${frames.length} frames · jsAvg ${(jsSum / frames.length).toFixed(2)} / jsMax ${jsMax.toFixed(1)} · upload ${(upSum / frames.length).toFixed(0)} KB/frame${dirtyStr}`);
      for (const [k, v] of Object.entries(acc).map(([k, v]) => [k, v.sum / Math.max(1, v.n)] as [string, number]).sort((a, b) => b[1] - a[1])) {
        if (v >= 0.02) console.log(`  ${k.padEnd(12)} ${v.toFixed(3)}`);
      }
      // Frames over the 240fps budget (4.17ms): t, js, upload, dominant section.
      const over = frames.filter((f) => f.js > 4.17);
      if (over.length) {
        console.log(`  over-budget frames: ${over.length}`);
        for (const f of over.slice(0, 12)) {
          const dom = Object.entries(f.sec).sort((a, b) => b[1] - a[1])[0];
          console.log(`    t=${f.t.toFixed(0).padStart(5)} js=${f.js.toFixed(1).padStart(5)} up=${f.up.toFixed(0).padStart(5)}KB ${dom ? dom[0] + '=' + dom[1].toFixed(1) : ''}`);
        }
      }
    };
    console.log(`\nreplay ${report.replay.fpsAvg} fps avg / ${report.replay.fpsMin} min · js≤${report.replay.jsMax} · dropped ${report.replay.dropped}`);
    stats(series.filter((f) => f.t >= 0), 'whole action');
    if (winArg) stats(inWin, `window ${winArg}`);
    // Per-gesture stats: group recording events by gaps < 500ms, label by type.
    const evs = rec.events as { t: number; type: string; button?: number; deltaY?: number }[];
    const gestures: { a: number; b: number; label: string }[] = [];
    for (const e of evs) {
      const last = gestures[gestures.length - 1];
      const label = e.type === 'wheel' ? 'wheel zoom' : e.button === 2 ? 'rotate/pan (rmb)' : e.type === 'pointerdown' ? 'press' : e.type;
      if (last && e.t - last.b < 500) { last.b = e.t; if (!last.label.includes(label)) last.label += '+' + label; }
      else gestures.push({ a: e.t, b: e.t, label });
    }
    for (const g of gestures) {
      if (g.b - g.a < 150) continue;
      stats(series.filter((f) => f.t >= g.a && f.t <= g.b + 200), `${g.label} [${g.a.toFixed(0)}–${g.b.toFixed(0)}]`);
    }
    await ctx.close();
  } finally {
    await browser.close();
    killServer(server);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
