# Explainer v2 — Master Task List

**Context document:** Read `SPRINT-explainer-v2.md` for architecture, schema
deltas, acceptance criteria, and execution rules. Follow the same protocol as
`SPRINT-TODO.md` (one task at a time, typecheck after every task, visual
checkpoints belong to the user, no git commits, no scope creep).

---

## Phase E0 — Bands-aware fit (runtime-only, no re-authoring)

### E0-1 — Create `src/authoring/runtime/safeArea.ts` + `__test_safeArea.ts`

**Files to create:** `src/authoring/runtime/safeArea.ts`, `src/authoring/runtime/__test_safeArea.ts`

**What to write (safeArea.ts):**
- Export const `BAND_FRAC = 0.11` — matches the hardcoded `0.11` in `cinematicHud.ts:208`.
- Export function `effHeight(H: number, barT: number): number` — returns `H * (1 - 2 * BAND_FRAC * barT)`.
- Export function `safePageSize(wNominal: number, canvasW: number, canvasH: number, barT: number): { width: number; height: number }` — returns `{ width: wNominal, height: wNominal * effHeight(canvasH, barT) / canvasW }`.
- Export function `centerAnchor(at: Vec2, pageH: number): number` — returns the world top for a center-anchored page: `at[1] - pageH / 2`.

**What to write (__test_safeArea.ts):**
- Use the same `test/assert` pattern as `__test_ir.ts`.
- Test 1: `effHeight` at barT=0 returns H.
- Test 2: `effHeight` at barT=1 returns `H * (1 - 0.22)`.
- Test 3: `safePageSize` at barT=0 with a 1260 nominalW on 1920×1080 canvas returns `{ width: 1260, height: 708.75 }`.
- Test 4: `safePageSize` at barT=1 on the same canvas returns `{ width: 1260, height: 552.825 }`.
- Test 5: `centerAnchor` is symmetric.

**Verify:** `bun src/authoring/runtime/__test_safeArea.ts` — all 5 tests pass.
Then `bunx tsc --noEmit`.

**Done-when:** both files exist, all tests green, typecheck clean.

---

### E0-2 — Expose barT on CinematicHud; modify resolveFit to use H_eff

**Files to modify:** `src/authoring/runtime/cinematicHud.ts`, `src/authoring/runtime/runtime.ts`

**What to do (cinematicHud.ts):**
- Add a public getter `get barTValue(): number { return this.barT; }` (after line 63).

**What to do (runtime.ts):**
- In `resolveFit` (line 670–679), change the zoom formula to use an effective height:
  ```ts
  const ch = (g as any).size?.[1] ?? SEC_H;
  const effH = this.cinematicHud ? this.cinematicHud.barTValue * (1 - 2 * BAND_FRAC) * canvasH + (1 - this.cinematicHud.barTValue) * canvasH : canvasH;
  // Actually: barT 0 → effH = canvasH; barT 1 → effH = canvasH * (1 - 2*BAND_FRAC)
  ```
  Better: `effH = canvasH * (1 - 2 * BAND_FRAC * (this.cinematicHud?.barTValue ?? 0))`.
  (Import `BAND_FRAC` from `./safeArea`.)
- Then `zoom = Math.min(canvasW / (g.size[0] - 80), effH / (g.size[1] - 20)) * 1.02`.

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean. Explainer chapter content no longer covered by bands during tour (checkpoint E0-4 will verify).

---

### E0-3 — fitSettling: update() drives applyPose after stopTour while barT > ε

**Files to modify:** `src/authoring/runtime/runtime.ts`

**What to do:**
- Add a private field: `private fitSettling = false;` (near line 41).
- In `stopTour(s)` (line 709): set `this.fitSettling = true; this.lastNow = -1;` after `this.playing = false;`.
- In `update(now, s)` (line 659): change the early return to:
  ```ts
  if (!this.playing) {
    if (this.fitSettling) {
      this.fitSettle(s, now);
    }
    return;
  }
  ```
- Add a private method:
  ```ts
  private fitSettle(s: AppState, now: number) {
    if (!this.cinematicHud) { this.fitSettling = false; return; }
    const dt = this.lastNow < 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.05);
    this.lastNow = now;
    const barT = this.cinematicHud.barTValue;
    if (barT <= 0.01) { this.fitSettling = false; return; }
    this.applyPose(s);
  }
  ```
- In `seek` (line 692) and `play` (line 701): reset `this.fitSettling = false`.

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean. On stop, camera eases to uncovered fit as bars slide out.

---

### E0-4 — CHECKPOINT

- [ ] E0-1, E0-2, E0-3 all marked `[x]`.
- [ ] `bun src/authoring/runtime/__test_safeArea.ts` passes all 5 tests.
- [ ] `bunx tsc --noEmit` passes clean.
- [ ] User confirms: during tour no chapter content is cut off by bands; on pause the camera settles to fill the screen.

---

## Phase E1 — Chapter → safe-page migration

### E1-1 — Schema additions

**Files to modify:** `src/authoring/ir/types.ts`, `src/authoring/ir/validate.ts`,
`src/authoring/ir/__test_ir.ts`, `src/authoring/builder/scene.ts`

**What to change (types.ts):**
- Add to `PageMeta` (after `maxSize`):
  ```ts
  safe?: boolean;
  nominalW?: number;
  ```
- Add to `LayoutSpec`: `wrap?: boolean;` (maps to `flexWrap: 'wrap'` in taffy).
- Add to `CameraKeyframe`:
  ```ts
  fitObj?: string;    // resolve from laid-out box
  trace?: { target: string; zoom: number; d: number; samples?: number; pullBack?: boolean };
  ```

**What to change (validate.ts):**
- In `validatePage`: no extra checks for `safe`/`nominalW` (any boolean/number is valid).
- In `validateCameraKeyframe`: if `fitObj` present, verify it's a non-empty string and that the referenced object exists (skip for now — it can be a non-chapter object, unlike fit).
- If `trace` present: verify `target` string, `zoom` > 0, `d` > 0, `samples` if present is positive integer.
- Update `EasingName` union if needed (no — all existing easings apply to dive keyframes).

**What to do (__test_ir.ts):**
- Add test 16: "validates fitObj exists" — keyframe with fitObj 'nonexistent' → error.
- Add test 17: "validates trace positive params" — keyframe with trace.zoom = -1 → error.

**What to change (builder/scene.ts):**
- Add `chapterPage` method that calls `chapter` then adds `page: { safe: true }` and `layout` to the group spec.
- Add `cam.diveObj({ target, zoom, hold?, d?, offset? })` — writes a keyframe at `start + hold` with `fitObj: target, zoomMul: 1+zoom, ...`.
- Add `cam.trace({ target, zoom, d, samples?, pullBack? })` — writes a keyframe with `trace` descriptor at `start`.

**Verify:** `bun src/authoring/ir/__test_ir.ts` green. `bunx tsc --noEmit`.

**Done-when:** types + validations + builder sugar done.

---

### E1-2 — Runtime safe-page driver + center-anchor

**Files to modify:** `src/authoring/runtime/runtime.ts`, `src/authoring/layout/solve.ts`

**What to do:**
- In `runtime.ts`, after `ensureLayout()` fires, add a new private method `applySafePageSizes()`:
  - Iterate all objects, find group specs with `chapter && page?.safe && layout`.
  - Compute `Hp` from `safePageSize(g.nominalW ?? 1260, W, H, barT)` where W/H come from `_s.tCanvas` or last known.
  - Set `this.livePageSize.set(id, [Wp, Hp])`.
  - Invalidate layout if size changed (track last Hp per page id).
- In `ensureLayout()`, call `applySafePageSizes()` first.
- For center-anchor: in the emit loop for page backgrounds (line ~192-218), when a page is safe, add the center offset: `y = at[1] - pageH / 2` (the runtime currently uses `at` directly for top-level pages and `pageLocal + ...` for nested). Adapt: for safe pages, read `livePageSize`, compute `topY = spec.at[1] - h / 2`, store temporarily.
  - Actually cleaner: in `ensureLayout()`, for safe pages, also compute a per-frame `pageOrigin` offset and store it alongside livePageSize. Add `private livePageCenterAnchor = new Map<string, number>()` storing page top Y. The emit path reads it.
- In `camera.ts` `resolveFit`: when the chapter is a safe page, use its `livePageSize`'s center for `fit` resolution (center = page at[1] + liveH/2 for safe, or at + liveSize/2 for legacy). Wait, `resolveFit` is a pure function passed to poseAt — it receives a `fitId` string and looks up the group. Safe pages already have their live size in the spec (because `ensureLayout` writes to `spec.size` as a side effect? No — it restores after solving). For fit resolution, the camera needs to see the *target* page center + size. The `resolveFit` callback in `applyPose` already reads `g.at` and `g.size`. For safe pages, the page *size* is the live size (stores back to spec? Currently runtime observes: `restorePages` temp patches spec.size, then restores. Camera `resolveFit` reads during that window. But if camera reads _after_ restore... the fit moment is in `applyPose` which is called mid-frame. Actually `resolveFit` resolves during `poseAt` which is called from `applyPose` which is called from `update`/`play`/`seek`. At that point, `ensureLayout` may or may not have been called yet (it's called in `emit`, which happens after `update` in the frame loop — see `frame.ts`). So the fit could read a stale size. 
  
  **Fix:** make `applyPose` call a lightweight `resolveSafePageSizes()` that patches spec.size for safe pages just-in-time. Or simpler: add a getter on SceneRuntime that returns the target chapter's live size. Since `resolveFit` is a closure over `this` (runtime.ts:670), it can access `this.livePageSize` directly:
  ```ts
  const live = this.livePageSize.get(fitId);
  if (live) return { center: [g.at[0] + live[0]/2, g.at[1] - live[1]/2 + live[1]/2] = at center... };
  ```
  Hmm, center-anchor means page world top = `at[1] - live[1]/2`, then center = `top + live[1]/2 = at[1]`. So fit center = `[g.at[0], g.at[1]]` for center-anchored safe pages! That's nice — the page's `at` IS the center for safe pages. So for safe pages: `center = [g.at[0], g.at[1]]` (no size calculation needed for center), `zoom = Math.min(canvasW / (live[0] + 80), effH / (live[1] + 20)) * 1.02`.

  Keep it simple: in the `resolveFit`, check if the fitId is a safe page with a live size; if so, use live size + `at` as center.

**What to do (solve.ts):**
- In `layoutSpecToProps` (solve.ts:17), add `flexWrap` mapping: `sp.flexWrap = ls.wrap ? 'wrap' : 'no-wrap'` (or similar). Check taffy StyleProps: it's `flexWrap?: 'no-wrap' | 'wrap' | 'wrap-reverse'`.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** safe pages drive their live size from barT, layout re-solves on barT change, fit uses live size, center-anchor renders at the correct world position.

---

### E1-3 — Migrate `same` chapter end-to-end

**Files to modify:** `src/authoring/scenes/explainerScene.ts`

**What to do:** Rewrite the `case 'same'` block as a safe page with a flex layout. The 4 cards (text/icon/math/ui) become a wrapped flex row (2×2 grid) of nested sub-pages. Add a `hud-slot` card for Pillar B. Remove all absolute `at` positioning — use page builder methods (`row`, `col`, `card`, `accentHead`, `body`, `island`). Add `layout: { direction: 'column', gap: ..., padding: ..., wrap: true }` where appropriate.

**Acceptance:** `bunx tsc --noEmit` clean. User confirms chapter looks correct in covered state (bands up) and reflows on pause (cards grow, gaps redistribute).

---

### E1-4 through E1-7 — Migrate remaining 11 chapters

Each task:
- Rewrite one chapter as a safe page with flex layout per the catalog in §3.3 of the sprint doc.
- Use existing page builder vocabulary (`accentHead`, `body`, `card`, `row`, `col`, `subpage`, `island`).
- Add clips (fadeIn/fadeOut/draw) — check that all object ids are correct.
- Verify: `bunx tsc --noEmit`.
- Done-when: chapter renders correctly in tour (covered state).

### E1-8 — CHECKPOINT

- [ ] All E1 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User confirms A1–A6 acceptance.

---

## Phase E2 — Living UI

### E2-1 — Create `src/authoring/runtime/hudWorld.ts`

**Files to create:** `src/authoring/runtime/hudWorld.ts`

**What to write:** World emit path for the HUD. Export a function `buildHudWorld(runtime, draw, slotBox, detach, view, now)` that calls `cinematicHud.buildHudWorld(...)`. Also a function `hudWorldHit(hudWorld, wx, wy): string | null` for hit-testing.

Full implementation details scoped to the phase when it starts.

### E2-2 through E2-5
Scoped to the phase.

---

## Phase E3 — Layout-resolved + glyph-trace dives

### E3-1 through E3-5
Scoped to the phase.

---

## Phase E4 — Docs + polish

### E4-1 through E4-3
Scoped to the phase.

---

## Reuse table (same as main sprint)

Same modules as `SPRINT-TODO.md`'s reuse table. New imports:
- `glyphQuads` from `../../windfoil/font`
- `flattenNorm` from `../islands/glyphAsset`
- Math helpers from `../builder/helpers`

## Command reference

- Dev: `bun run dev`
- Typecheck: `bunx tsc --noEmit`
- Test: `bun src/authoring/runtime/__test_<name>.ts`
