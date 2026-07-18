# Postmortem — Taffy Integration & Authoring Sprint

## Timeline of frustration

1. **Sprint design was sound.** The IR types, Taffy layout, Builder API, and Runtime are
   well-architected. The mistake was not in the design but in the execution.

2. **Explainer as acceptance test was the wrong forcing function.** The original explainer
   uses per-pixel procedural effects (SDF grids, bitmap sweeps, coverage integrals) that a
   declarative object tree cannot express. The builder composes shapes + text; the explainer
   computes pixel values. This incompatibility was predictable and I should have flagged it
   immediately instead of spending hours patching.

3. **No incremental testing.** Every change was made blind — you were the test runner.
   Errors like `cx0 is already declared`, `localTime is not defined`, `Cannot read properties
   of null` should have been caught by me running the code, not by you hitting refresh.

4. **Sloppy mechanical edits.** Multiple instances of:
   - Duplicate function definitions (two copies of `cx0` in explainerV2)
   - Wrong field names (`Points` vs `Length` in Taffy serde, `w` vs `width` in LayoutResult)
   - ReplaceAll only hitting some occurrences (`s.morphDemo` left in resize handler)
   - Adding `export` to explainer.ts functions that broke the original file's internal usage
   - Overwriting entire files (`demos.ts` truncated) instead of targeted edits

5. **Fought Vite for 4+ commits instead of finding the clean path.** The WASM loading went:
   `public/` import → Vite blocks → move to `src/assets/` → fails silently → script injection
   → fails → manual instantiation → missing imports → dual location → works for Bun, fails
   for Vite. The correct answer was always: keep it in `public/`, use a script tag. Three
   hours wasted on module resolution.

6. **Built the interactive demo before proving the static case.** The Taffy demo went through
   6+ iterations with broken coordinate math, wrong board slots (bench cache, morphDemo),
   missing `s.interactive` pattern. A single static colored-box demo that proved Taffy
   worked would have taken 15 minutes.

7. **Kept building on broken foundations.** After each bug report, I patched the symptom
   instead of questioning the approach. The explainerV2 + cameraDriver chain had 4 layers
   of indirection, each with its own bugs.

## Root causes (what actually matters for the next session)

| Problem | Why it happened | Fix |
|---------|----------------|-----|
| Wrong acceptance test | Didn't analyze what the original explainer actually does before trying to recreate it | Read the FULL source before designing |
| No live feedback loop | I couldn't see the browser — every bug was reported by you | Ask the user to run a quick test after each unit of work |
| Mechanical sloppiness | Rushing instead of verifying | Diff-check every edit; grep for duplicate definitions |
| Fighting infrastructure | Vite/WASM/Bun compatibility wasted hours | Test the build pipeline FIRST, before writing any feature code |
| Building complexity early | Interactive demo with drag handles before a working static example | MVP first: one static box. Then add interactivity. |
| Not using existing patterns | Wrote custom input handling when `s.interactive` existed | Find and reuse existing patterns (board slots, input routing) |

## What to do differently

1. **Start with a smoke test.** One static shape rendered through the new pipeline.
   Confirm it works before adding animation, interaction, or layout.

2. **Keep branches clean.** The `taffy-wasm` branch is the gold standard — 7 files,
   9 tests, no cruft. Every experiment should start from a clean base.

3. **Incremental commits with verification.** After every meaningful change, run
   typecheck + tests. If the user is available, ask them to refresh and confirm.

4. **Match the system's grain.** If a file has an `s.interactive` pattern, use it.
   If a board uses `emit(font, atlas, inst, crv, rws, now, view)`, match the
   signature exactly. Don't invent new patterns for existing problems.

5. **Time-box infrastructure fights.** If Vite/WASM/Bun isn't working after 30 minutes,
   find the simplest possible alternative (script tag, CDN, different loader).
   The goal is layout, not module resolution heroics.

6. **Never overwrite a file.** Use targeted `edit` operations. Verify each edit
   with `grep` for duplicates after. One bad `replaceAll` cost hours.

## What was actually valuable

- **Taffy WASM build + TS wrapper.** The Rust crate, serde translator, and style
  mapping are production-ready. 9 tests prove flex, grid, wrap, nesting, and
  alignment all work.
- **IR types + schema + serialize.** A well-typed, validated JSON format for
  scene composition that will be useful when building actual authoring scenes.
- **Deterministic timeline engine.** `seek(t) → FrameState` with 22 easing
  functions is correct and reusable.
- **The `custom` primitive.** An escape hatch for procedural effects that
  don't fit the declarative model. Ships alongside the SceneIR as companion code.
