# AGENTS.md — Windfoil / codescope

Ground rules for any AI agent working in this repository. Read this before doing
anything. For deeper technical facts, also consult repo memory
(`/memories/repo/codescope.md`), `VISION.md`, `PROGRESS.md`, `SPRINT.md`, and
`SPRINT-TODO.md`.

Active sprint: **Authoring System v2** — a document-centric JSON source of truth,
declarative TS builder, procedural islands + gallery, analytic tool chrome, and
REPL — all beating the Manim API. See `SPRINT.md` for full architecture and
phase plan. See `SPRINT-TODO.md` for the granular task list with checkboxes.


---

## 1. Project in one line

An analytic WebGPU renderer ("windfoil") that draws CSS-styled documents, a code
editor, terminal, and file tree entirely through a closed-form coverage integral
(one draw call, zero aliasing at any zoom). See `VISION.md` for the roadmap.

## 2. Dev commands

- Dev server: `bun run dev` (port 3000, see `vite.config.ts`).
- Typecheck: `bunx tsc --noEmit` (use `bunx`, never `npx`).

## 3. Where things live

- `src/windfoil/` — GPU device, shader (`windfoil.wgsl`), glyph atlas/bands, SVG.
- `src/camera/` — pan/zoom transform + input.
- `src/layout/` — DOM walk, flow layout, metrics, editable text.
- `src/css/` — CSS engine, themes, theme controller.
- `src/editor/` — code editor, terminal, file tree.
- `src/frame.ts` — the per-frame instance-buffer build + single draw call.
- `src/authoring/` — **(active sprint)** Scene IR, declarative TS builder,
  layout (Taffy WASM), runtime, analytic tool chrome, designer, REPL.
