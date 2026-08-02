// ── scripted recorder (creates regression recordings) ────────────────────────
// Drives a scripted pointer gesture in a REAL Chromium while the in-page recorder
// (src/recorder/recorder.ts) captures it, then saves a Recording to recordings/
// via the /__rec HTTP store — the same file format F2 produces manually. The
// resulting recording is the input to scripts/replay.ts (the robust perf check).
//
//   bun run perf:record triangle-drag            # default scenario on #windgraph
//   bun run perf:record my-zoom --scenario zoom  # wheel-zoom at canvas center
//   bun run perf:record my-pan   --scenario pan  # left-drag pan
//   bun run perf:record deep-drag --zoom 4       # frame the triangle board at 4×,
//                                                # then drag point A (the deep-zoom
//                                                # plot-fill scenario)
//
// Browser: system Chromium (/usr/bin/chromium) headed, matching scripts/replay.ts.

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS === '1';
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM || '/usr/bin/chromium';

type Scenario = 'drag' | 'zoom' | 'pan';

function parseArgs(argv: string[]): { name: string; route: string; scenario: Scenario; zoom: number | null } {
  let name = '', route = 'windgraph', scenario: Scenario = 'drag', zoom: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--route') { route = argv[++i] ?? 'windgraph'; }
    else if (a === '--scenario') { scenario = (argv[++i] ?? 'drag') as Scenario; }
    else if (a === '--zoom') { zoom = Number(argv[++i]) || null; }
    else if (!a.startsWith('-') && name === '') name = a;
  }
  return { name: name || `auto-${scenario}-${Date.now().toString(36)}`, route, scenario, zoom };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Screen (CSS px) of a world point under the 2D camera. Uses innerWidth/Height
// (CSS), NOT canvas.width (backing px — at deviceScaleFactor 2 they differ 2×,
// and page.mouse works in CSS px).
async function worldToScreen(page: any, wx: number, wy: number) {
  return page.evaluate(([x, y]) => {
    const s = (window as any).__csState;
    return { sx: (x - s.viewX) * s.viewZ + innerWidth / 2, sy: (y - s.viewY) * s.viewZ + innerHeight / 2 };
  }, [wx, wy]);
}

async function scenarioBody(page: any, scenario: Scenario, cx: number, cy: number, w: number, h: number) {
  switch (scenario) {
    case 'drag': {
      // Grab triangle point A (the windgraph world's first board) and swing it.
      const A = await page.evaluate(() => {
        const s = (window as any).__csState;
        const A = s.interactive.boards[0].scene.points.get('A');
        return { x: A.x, y: A.y };
      });
      const p = await worldToScreen(page, A.x, A.y);
      await page.mouse.move(p.sx, p.sy);
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) {
        await page.mouse.move(p.sx + i * 7, p.sy + Math.sin(i / 2) * 7);
        await sleep(12);
      }
      await page.mouse.up();
      break;
    }
    case 'zoom': {
      // Pinch-less wheel zoom: alternate dolly in/out around the center.
      for (let i = 0; i < 6; i++) {
        await page.mouse.move(cx, cy);
        await page.mouse.wheel(0, i % 2 ? 140 : -140);
        await sleep(90);
      }
      break;
    }
    case 'pan': {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 20; i++) { await page.mouse.move(cx + i * 6, cy + (i % 2 ? 8 : -8)); await sleep(10); }
      await page.mouse.up();
      break;
    }
  }
  void w; void h;
}

async function main() {
  const { name, route, scenario, zoom } = parseArgs(process.argv.slice(2));
  if (!existsSync(CHROMIUM)) {
    process.stderr.write(`\nChromium not found at ${CHROMIUM}. Set PLAYWRIGHT_CHROMIUM to the browser that runs the demo.\n`);
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: HEADLESS, args: ['--no-sandbox', ...(HEADLESS ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [])] });
  try {
    // Match the real display so the window is crisp on the user's HiDPI screen:
    // Chromium reports the display's CSS size as `screen` but a fresh window at
    // deviceScaleFactor 1 gets upscaled by the compositor → "blurry and low
    // resolution". Render at the display's physical dpr (2× on a 2560×1440
    // panel; PLAYWRIGHT_DSF overrides) so canvas backing = physical pixels.
    const DSF = Number(process.env.PLAYWRIGHT_DSF) || 2;
    const probe = await browser.newPage();
    const screen = await probe.evaluate(() => ({ w: screen.width, h: screen.height }));
    await probe.close();
    const ctx = await browser.newContext({ viewport: { width: screen.w, height: screen.h }, deviceScaleFactor: DSF });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 200)));
    await page.goto(`${BASE}/#${route}`);
    await page.waitForFunction(() => !!(window as any).__rec?.state, null, { timeout: 20000 });

    // Frame the dragged handle on-screen BEFORE recording: at the boot overview
    // the world's first-board point A sits above the viewport top (its screen y
    // is negative), so an un-framed drag would miss the canvas → empty recording.
    // `--zoom N` sets the zoom (deep-zoom plot-fill scenarios); default 1 keeps
    // the handle big enough to grab. Pan/zoom scenarios use the boot framing
    // unless --zoom is given.
    if (scenario === 'drag' || zoom !== null) {
      await page.evaluate((z) => {
        const s = (window as any).__csState;
        const A = s.interactive.boards[0].scene.points.get('A');
        (window as any).__rec.setCam({ active: false, x: A.x, y: A.y, z });
      }, zoom ?? 1);
      await sleep(1200);
    }

    // Warm up: let caches settle (font load, board emit, mesh build) so the
    // recorded fps reflects the action, not the cold-start jank (the replay
    // engine likewise warms before sampling — numbers must be comparable).
    await sleep(1500);
    await page.evaluate(() => (window as any).__recorder.start());
    const dims = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    await scenarioBody(page, scenario, dims.w / 2, dims.h / 2, dims.w, dims.h);
    await sleep(150);
    const saved = await page.evaluate((n: string) => (window as any).__recorder.stop(n), name);
    await sleep(300);
    console.log(`recorded "${name}" (route #${route}, scenario ${scenario}) → recordings/${name}.json`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
