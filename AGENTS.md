# AGENTS.md — Windfoil / codescope

Ground rules for any AI agent working in this repository. Read this before doing
anything. For deeper technical facts, also consult repo memory
(`/memories/repo/codescope.md`), `VISION.md`, `PROGRESS.md`, and
`docs/ALGORITHM.md` (the math behind the renderer).

**codescope builds on top of [windfoil](https://github.com/texel-org/windfoil)**
(texel-org), the open-source analytic WebGPU vector renderer. The core
winding-integral math, row-band acceleration structure, and minification guard
are from upstream; codescope adds 3D transforms, convex clip polygons, solid
rect fast path, anisotropic AA, and a full TypeScript host layer. See
`docs/ALGORITHM.md` for the full derivation and `package.json` for sync
scripts.

Active sprint: **windgraph v2** — expanding the windgraph math engine into the
most comprehensive plotting/geometry/animation system anywhere, leading with
the unique assets: continuous 2D↔3D with true glyph height, physics-driven
graphs (box3d), and analytic sharpness at any zoom.

**To continue work, read in this order** (all under `sprint-v2/`):
1. `sprint-v2/STATE.md` — current phase, next task, passed checkpoints (ground truth).
2. `sprint-v2/NOTES.md` — decisions log, technical tips (file:line anchored),
   open questions, execution lessons.
3. The current `sprint-v2/phase-N-*.md` — task list with acceptance criteria.
4. `sprint-v2/checkpoints.md` — the only authorized stops (human feel-tests).

Supporting docs: `WINDGRAPH.md` (full feature surface + competitor analysis),
`SPRINT-windgraph-v2.md` (master execution plan + architecture decision),
`sprint-v2/TODO.md` (master checklist).

Completed sprints (context, not active): Authoring System v2 (archived in
`oldsprintplan/`, status in `PROGRESS.md` §0), IDE Effects v3 (`SPRINT.md` +
`SPRINT-TODO.md`, produced the FX/3D/physics substrate v2 builds on), windgraph
v1 phases 0–8 (`sprint/`).

---

## 1. Project in one line

An analytic WebGPU renderer ("windfoil") that draws CSS-styled documents, a code
editor, terminal, and file tree entirely through a closed-form coverage integral
(one draw call, zero aliasing at any zoom). See `VISION.md` for the roadmap.

## 2. Dev commands

- Dev server: `bun run dev` (port 3000, see `vite.config.ts`).
- Typecheck: `bunx tsc --noEmit` (use `bunx`, never `npx`).
- Headless JS suites: `bun src/**/__test*.ts` + `bunx vitest run`.
- **Record/replay perf protocol (real browser, real WebGPU — see `src/recorder/`,
  `scripts/`, AGENTS "test infra"):**
  - Manual record: open a demo (`#windgraph`), press `F2`, do the action, `F2` to save.
  - Scripted record: `bun run perf:record <name> [--scenario drag|zoom|pan] [--zoom N]`.
  - Bulk replay + assert: `bun run perf:replay [--expect-min N] [name]` — headed on the
    system Chromium (`/usr/bin/chromium` or `PLAYWRIGHT_CHROMIUM`); `HEADLESS=1`
    is software-WebGPU only and NOT real fps. The dev server auto-starts.
  - `bun run perf` = record the default scenario then replay with a 30 fps floor.
  - `#testinfra` demo lists recordings (rename/delete/replay + a stats table with
    input labels, fps and js). Programmatic surface: `window.__recorder.start()/stop(name)`,
    `window.__rec.state/getCam/setCam`, `window.__perf`, `window.__recReport`.

## 3. Where things live

- `src/windfoil/` — GPU device, shader (`windfoil.wgsl`), glyph atlas/bands, SVG.
- `src/camera/` — pan/zoom transform + input.
- `src/layout/` — DOM walk, flow layout, metrics, editable text.
- `src/css/` — CSS engine, themes, theme controller.
- `src/editor/` — code editor, terminal, file tree.
- `src/frame.ts` — the per-frame instance-buffer build + single draw call.
- `src/windgraph/` — **(active sprint focus)** math engine v1: stroke engine,
  Mobject primitives, coords, plotting, animation, constraint graph, LaTeX
  math, 3D projection. v2 extends this + the authoring IR (see `sprint-v2/`).
- `src/authoring/` — Scene IR, declarative TS builder, layout (Taffy WASM),
  runtime, analytic chrome, REPL (sprint complete; v2 plugs windgraph objects
  into its IR — decision D1 in `sprint-v2/NOTES.md`).
- `src/ide/fx/` — modular FX architecture: per-instance 3D transforms
  (`fxXforms`), morph engine, box3d physics, fireworks — the substrate for
  windgraph v2's physics lane.
- `src/playground/` — demo boards + toolbar buttons; windgraph v2 boards
  register here.
- `docs/` — algorithm derivation (`ALGORITHM.md`), architecture notes.
