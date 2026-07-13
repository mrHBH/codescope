# AGENTS.md — Windfoil / codescope

Ground rules for any AI agent working in this repository. Read this before doing
anything. For deeper technical facts, also consult repo memory
(`/memories/repo/codescope.md`), `VISION.md`, and `PROGRESS.md`.

---

## 0. Interaction protocol (HARD RULES — never violate)

- **ALWAYS talk to the user through the `ask_user` tool.** Never just write a
  question in prose and stop — every question, choice, or request for direction
  goes through `ask_user`.
- **NEVER end a session or declare a task "done" on your own.** After each unit
  of work, call `ask_user` to confirm with the user and WAIT for their reply
  before continuing or stopping. Task completion without a preceding `ask_user`
  call is a workflow violation.
- **Iterate in small, verified steps.** Do one focused change, get it in front of
  the user, confirm, then continue. Do not batch large unreviewed changes.
- **Never silently change scope.** For anything beyond a trivial tweak, propose a
  short plan first and get explicit approval via `ask_user` before implementing.
- **Match effort to the task.** Small tweaks (constants, positions, quick
  adjustments): make the change, typecheck at most, then immediately hand it back
  to the user to test. Reserve long measurement/verification cycles for genuinely
  tricky bugs or when the user explicitly asks to "measure / verify / be thorough".

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
