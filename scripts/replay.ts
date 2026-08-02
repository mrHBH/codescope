// ── automated replay runner (real browser, real WebGPU) ──────────────────────
// Reproduces every recording in recordings/*.json inside a REAL Chromium at the
// recording's exact viewport + deviceScaleFactor, waits for the in-page replay
// engine (src/recorder/replay.ts, driven by `#<route>?replay=<name>`) to publish
// window.__recReport, and prints the measured fps — ground truth on the real GPU,
// never a headless JS microbench.
//
//   bun run perf:replay                       # headed on YOUR chromium (honest fps)
//   bun run perf:replay --expect-min 60       # fail if any replay fpsMin < 60
//   bun run perf:replay my-drag               # replay just recordings/my-drag.json
//   HEADLESS=1 bun run perf:replay            # software WebGPU (see caveat below)
//
// Browser: defaults to the system Chromium at /usr/bin/chromium (the one that
// actually runs the demo on this machine) in HEADED mode — Playwright's bundled
// headless shell exposes no WebGPU adapter here. Override with PLAYWRIGHT_CHROMIUM.
// The dev server is auto-started if nothing is listening on :3000.

import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REC_DIR = resolve(ROOT, 'recordings');
const BASE = 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS === '1';
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';

interface Recording { name: string; route: string; viewport: { w: number; h: number; dpr: number }; summary: { fpsMin: number; fpsAvg: number; fpsP95: number; jsMax: number; jsAvg: number; dropped: number; frames: number; inputs: Record<string, number> }; }
interface Report { name: string; inputs: Record<string, number>; duration: number; replay: { fpsMin: number; fpsAvg: number; fpsP95: number; jsMax: number; jsAvg: number; dropped: number; frames: number }; recorded: { fpsMin: number; fpsAvg: number; fpsP95: number; jsMax: number; jsAvg: number; dropped: number; frames: number }; viewportMatch: boolean; error?: string; }

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

function parseArgs(argv: string[]): { expectMin: number; only: string | null } {
  let expectMin = 0, only: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect-min') { expectMin = Number(argv[++i]) || 0; }
    else if (!argv[i].startsWith('-') && only === null) only = argv[i];
  }
  return { expectMin, only };
}

async function loadPlaywright(): Promise<any> {
  const spec = 'playwright';            // non-literal → tsc skips module resolution
  try { return await import(spec); }
  catch {
    process.stderr.write(
      '\nPlaywright is not installed (it is opt-in; AGENTS.md D6 forbids new deps without sign-off).\n'
      + 'To enable the real-browser runner, run once:\n'
      + '    bun add -D playwright\n'
      + 'then re-run:  bun run perf:replay\n\n'
      + '(WebGPU needs your system Chromium — see the PLAYWRIGHT_CHROMIUM note above.)\n',
    );
    process.exit(1);
  }
}

async function main() {
  const { expectMin, only } = parseArgs(process.argv.slice(2));
  if (!existsSync(REC_DIR)) { console.log('no recordings/ directory — record one first (F2 in a demo, or bun run perf:record).'); process.exit(0); }
  let files = readdirSync(REC_DIR).filter((f) => f.endsWith('.json'));
  if (only) {
    const match = files.filter((f) => f.replace(/\.json$/, '') === only);
    if (!match.length) { console.log(`recording “${only}” not found in recordings/`); process.exit(1); }
    files = match;
  }
  if (!files.length) { console.log('recordings/ is empty — record one first (F2 in a demo, or bun run perf:record).'); process.exit(0); }
  const recs = files.map((f) => JSON.parse(readFileSync(join(REC_DIR, f), 'utf8')) as Recording);

  if (!existsSync(CHROMIUM)) {
    process.stderr.write(`\nChromium not found at ${CHROMIUM}.\nSet PLAYWRIGHT_CHROMIUM to the browser that runs the demo on this machine.\n`);
    process.exit(1);
  }
  if (!HEADLESS && !process.env.DISPLAY) {
    process.stderr.write('\nHEADLESS mode is unavailable (no WebGPU adapter in headless shell).\nRun headed (needs DISPLAY) or via xvfb-run:  xvfb-run -a bun run perf:replay\n');
    process.exit(1);
  }

  const pw = await loadPlaywright();
  const server = await ensureServer();
  const browser = await pw.chromium.launch({
    executablePath: CHROMIUM,
    headless: HEADLESS,
    args: ['--no-sandbox', ...(HEADLESS ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [])],
  });

  const rows: { name: string; inputs: string; recAvg: number; recMin: number; repAvg: number; repMin: number; jsMax: number; match: boolean; err?: string }[] = [];
  try {
    for (const rec of recs) {
      // The recording's viewport is the canvas BACKING size (device px); the
      // Playwright context viewport is CSS px, and deviceScaleFactor brings the
      // canvas backing back to the recorded device size (so dispatched
      // clientX/clientY land on identical canvas positions → viewportMatch).
      const dpr = rec.viewport.dpr || 1;
      const ctx = await browser.newContext({ viewport: { width: Math.round(rec.viewport.w / dpr), height: Math.round(rec.viewport.h / dpr) }, deviceScaleFactor: dpr });
      const page = await ctx.newPage();
      let report: Report | null = null;
      try {
        await page.goto(`${BASE}/#${rec.route}?replay=${encodeURIComponent(rec.name)}`, { waitUntil: 'load' });
        await page.waitForFunction(() => (window as any).__recReport != null, null, { timeout: 30000 });
        report = await page.evaluate(() => (window as any).__recReport as Report);
      } catch (e) {
        report = { name: rec.name, inputs: {}, duration: 0, replay: { fpsMin: 0, fpsAvg: 0, fpsP95: 0, jsMax: 0, jsAvg: 0, dropped: 0, frames: 0 }, recorded: rec.summary, viewportMatch: false, error: e instanceof Error ? e.message : String(e) };
      }
      const inputs = Object.entries(report.inputs || {}).map(([k, v]) => `${k}×${v}`).join(' ') || '—';
      rows.push({ name: rec.name, inputs, recAvg: rec.summary?.fpsAvg ?? 0, recMin: rec.summary?.fpsMin ?? 0, repAvg: report!.replay.fpsAvg, repMin: report!.replay.fpsMin, jsMax: report!.replay.jsMax, match: report!.viewportMatch, err: report!.error });
      await ctx.close();
    }
  } finally {
    await browser.close();
    killServer(server);
  }

  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.padEnd(n));
  console.log('\n' + pad('recording', 26) + pad('inputs', 30) + pad('rec avg/min', 12) + pad('replay avg/min', 16) + 'js≤   match  status');
  console.log('-'.repeat(108));
  let failed = 0;
  for (const r of rows) {
    const status = r.err ? `ERROR ${r.err}` : (expectMin && r.repMin < expectMin ? `FAIL (<${expectMin})` : 'ok');
    if (r.err || (expectMin && r.repMin < expectMin)) failed++;
    console.log(pad(r.name, 26) + pad(r.inputs, 30) + pad(`${r.recAvg}/${r.recMin}`, 12) + pad(`${r.repAvg}/${r.repMin}`, 16) + pad(String(r.jsMax), 6) + pad(r.match ? 'yes' : 'no', 7) + status);
  }
  console.log(HEADLESS ? '\n(HEADLESS=1 → software WebGPU; these fps are NOT real-GPU numbers.)' : '\n(headed on ' + CHROMIUM + ' → real GPU fps)');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
