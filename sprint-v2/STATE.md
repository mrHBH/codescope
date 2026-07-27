# windgraph v2 — Live State

**This file is ground truth.** An agent starting fresh reads this first.
If this file and the code disagree, investigate before trusting either.

## Current position

- **Phase:** 0 — Substrate repair
- **Next task:** 0.1 — split `src/authoring/runtime/runtime.ts` (see `phase-0-substrate.md`)
- **Checkpoints passed:** none
- **Blockers:** none
- **Last updated:** 2026-07-27 (sprint docs created; no code work yet)

## Update protocol (every agent, every task)

1. After completing a task: check its box in the phase file **and** in
   `TODO.md`, advance "Next task" above, run `bunx tsc --noEmit` (+ any
   `__test_*.ts` in touched modules), append one line to the log below.
2. After a checkpoint: record the user's verdict in `checkpoints.md` and note
   it in the log. If the verdict culls tasks, strike them in the phase file
   with `~~strikethrough~~` + reason — never silently delete.
3. When you discover something future agents need: append to `NOTES.md`
   (tips/decisions/open questions). When an open question gets answered,
   move it to the decisions log with its answer.
4. Keep entries terse. This file is a dashboard, not a diary.

## Log

- 2026-07-27 — Sprint docs created (`sprint-v2/`, `SPRINT-windgraph-v2.md`,
  `WINDGRAPH.md`). Architecture settled: windgraph objects = IR primitives,
  islands = procedural/field content only. No code changed.
