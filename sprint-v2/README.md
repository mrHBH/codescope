# sprint-v2 — windgraph v2 working docs

Working documentation for the **windgraph v2** sprint: expanding the windgraph
math engine into the most comprehensive plotting/geometry/animation system
available, leading with the unique assets (continuous 2D↔3D, physics-driven
graphs, analytic sharpness).

## If you are an agent starting fresh, read in this order

1. **`STATE.md`** — where the sprint is *right now*: current phase, next task,
   passed checkpoints, blockers. This is ground truth; trust it over everything.
2. **`NOTES.md`** — decisions log, technical tips with file:line anchors, open
   questions, hard-won lessons. Read fully before touching code.
3. **The current phase file** (`phase-N-*.md`) — the task list with acceptance
   criteria. Work top-down from the first unchecked box.
4. **`checkpoints.md`** — the human feel-checkpoints. Stop *only* at these.

Then execute per the execution contract in `../SPRINT-windgraph-v2.md` §0:
churn autonomously, typecheck after every task, never stop except at a 🔍 CP.

## Document map

| Doc | Role |
|---|---|
| `../WINDGRAPH.md` | Feature surface: the full ~200-item capability list, competitor analysis, priorities. The *what*. |
| `../SPRINT-windgraph-v2.md` | Master execution plan: phases, parallelism map, checkpoint index, architecture decision. The *how*. |
| `STATE.md` | Live state — current task, log. **Update after every task and CP.** |
| `NOTES.md` | Decisions, tips, open questions, lessons. Append, never delete. |
| `TODO.md` | Master checklist across all phases (details live in phase files). |
| `checkpoints.md` | CP1–CP8 test procedures + results log. |
| `phase-0-substrate.md` … `phase-6-product.md` | Per-phase task lists with files + acceptance criteria. |

## Related (context, not active)

| Doc | Role |
|---|---|
| `../AGENTS.md` | Repo ground rules; points here. |
| `../PROGRESS.md` | Project-wide progress (authoring v2 complete, FX sprint status). |
| `../sprint/` | windgraph **v1** sprint (phases 0–8, complete) — acceptance-criteria style reference. |
| `../oldsprintplan/` | Authoring System v2 sprint + **POSTMORTEM.md** (execution lessons — read `NOTES.md` §5 for the digest). |
| `../SPRINT.md` | IDE Effects v3 sprint (FX architecture, morph engine) — nearly complete; produced the substrate v2 builds on. |

## Phase overview

| Phase | Theme | Tasks | Gate |
|---|---|---|---|
| 0 | Substrate repair (runtime split, docs, contracts) | 4 | CP1 regression smoke |
| 1 | windgraph objects as IR primitives + board adapter | 6 | CP2 drag feel |
| 2 | Moat foundation (extrude, tilt, shadows) | 5 | CP3 — **thesis kill-gate** |
| 3 | Moat flagships: contour→surface ‖ Galton board | 11 | CP4 + CP5 |
| 4 | Parity fan-out: plots/geometry/stats/linalg/mathtex | 49 | CP6 gallery cull |
| 5 | Depth: 3D catalog, expression engine, graph theory, anim | 27 | CP7 ship/fix/cut |
| 6 | Product: chrome, export, perf, island migration | ~20 | CP8 final |
