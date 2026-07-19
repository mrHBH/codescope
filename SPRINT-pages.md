# Sprint — Pages + Taffy Layout Canvas

**Status:** proposed (not started)  
**Relation to main sprint:** *Additive.* Does **not** replace or edit `SPRINT.md` /
`SPRINT-TODO.md`. Builds on the existing authoring stack (`SceneDoc`, builder,
`SceneRuntime`, islands, Taffy WASM). Unlocks page-based Manim-style explainers
later; this sprint’s only product is a **layout demo**.

---

## 0. Goal

Ship a new playground demo **`/#pages`**:

- Infinite world canvas (same pan / zoom / 2D↔3D orbit grain as the playground).
- Multiple **pages** (cards) at free world positions, **different outer sizes**.
- **Inside each page**, content is positioned by **Taffy** (flex), not magic
  numbers.
- Mix of content: explainer-style **accent bar + kicker + title + body**,
  **islands**, cards, math, simple chrome.
- **Reactive layout:**
  - Some **entire pages** are resizable (corner handle → page `size` changes →
    children reflow).
  - Some **inner content** is resizable (handle → that item’s box changes →
    siblings reflow).

**Out of scope for this sprint:** full explainer rewrite, REPL, GUI chrome,
code projection, pedagogy rewrite, new npm deps, video export.

---

## 1. Acceptance test (user-owned visual)

Open `/#pages` (or launcher tile **Pages / Layout**). Confirm all of:

| # | Check |
|---|--------|
| A1 | Canvas pans and zooms freely; 3D orbit still available like other board demos. |
| A2 | ≥ **5** pages visible at different world positions. |
| A3 | ≥ **4** distinct **outer** page sizes (e.g. wide, square-ish, tall, compact). |
| A4 | ≥ **3** distinct **inner** layouts (column stack, row split, nested column+row). |
| A5 | At least one page uses explainer vocabulary: **accent bar + kicker + title + body lines**. |
| A6 | At least one page hosts a **live island** (e.g. `coverage-sweep` or `glyph-analytic`) that still animates / accepts handles if it has them. |
| A7 | At least **two** pages show a **SE resize handle**; dragging changes page size and **content reflows** (text/island boxes move or grow — not just clip). |
| A8 | At least **one** inner region (island slot or card) is resizable; dragging reflows **siblings** inside that page. |
| A9 | No crash on rapid resize; typecheck clean; layout unit tests green. |

If A1–A8 pass, the sprint is done. Visual polish after that is optional.

---

## 2. Architecture (locked for this sprint)

### 2.1 Two layers

```
WORLD (infinite canvas)
  page.outer.at     → absolute world position (authored)
  page.outer.size   → available box for Taffy root (authored + live resize)
  └─ TAFFY TREE     → resolves every child’s local (x,y,w,h)
       leaves emit using world = page.at + local
```

- **World placement** stays free-form (cinematic geography later).
- **Page interior** is always layout-driven when `group.layout` is set.
- Children’s authored `at` is **ignored** while a parent `layout` is active
  (except as a non-layout escape: parent has no `layout` → legacy absolute).

### 2.2 Page = group with `page` meta

Extend `GroupSpec` (additive fields only):

```ts
interface PageMeta {
  title?: string;
  /** Show SE handle; drag mutates this group’s size. Default false. */
  resizable?: boolean;
  minSize?: Vec2;   // default [320, 200]
  maxSize?: Vec2;   // default [2400, 1600]
}

// GroupSpec gains:
page?: PageMeta;
// chapter? remains for cinematic explainers — pages demo uses page, not chapter.
```

A **page root** is any group with `page` set (and usually `layout` + `size`).

### 2.3 Layout item props on every object

Children need flex-item sizing. Add optional common field:

```ts
interface LayoutItem {
  width?: number | 'auto';
  height?: number | 'auto';
  flexGrow?: number;
  flexShrink?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  /** Show resize handle on this leaf/group; drag mutates width/height item bits. */
  resizable?: boolean;
}

// On TextSpec | RectSpec | IslandSpec | GroupSpec | MathSpec | … :
item?: LayoutItem;
```

**Intrinsic measurement (leaves):**

| kind | default width | default height |
|------|---------------|----------------|
| `text` | `tw(content, font, size)` | `size * 1.25` |
| `math` | estimate from latex length × size × 0.5 (good enough) | `size * 1.4` |
| `rect` | `size[0]` | `size[1]` |
| `island` | `size?.[0] ?? def.defaultSize[0]` | `size?.[1] ?? def.defaultSize[1]` |
| `circle` | `2*radius` | `2*radius` |
| `group` with layout | from Taffy after children | from Taffy |
| `group` without layout | `size` or union of absolute children | same |

If `item.width` / `item.height` is a number, it wins over intrinsic.
`flexGrow > 0` with `'auto'` main size → fills free space.

### 2.4 Expand `LayoutSpec` (still flex-only)

```ts
type LayoutSpec = {
  kind: 'flex';
  direction: 'row' | 'column';
  gap?: number;
  padding?: number | [number, number] | [number, number, number, number];
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
};
```

Map to existing `StyleProps` in `src/taffy/taffy.ts` (already supports flex + gap +
padding + align + justify).

### 2.5 Layout solver

New module: `src/authoring/layout/solve.ts`

```ts
export type Box = { x: number; y: number; w: number; h: number };
export type LayoutMap = Map<string, Box>; // id → box in PARENT local space

export async function ensureTaffy(): Promise<void>;
export function solveDocLayout(
  doc: SceneDoc,
  measure: MeasureFn,
): LayoutMap;
```

Algorithm:

1. Ensure `taffy` initialized once (async boot in demo; solver sync after init).
2. For each **root page** (group with `page` + `layout` + `size`):
   - Build Taffy nodes depth-first for the group tree under that page.
   - Leaf nodes get measured sizes; nested layout-groups get flex styles.
   - `computeLayout(root, page.size[0], page.size[1])`.
   - Write every node’s `(x,y,w,h)` into `LayoutMap` **relative to its parent**.
3. Runtime converts to world: walk ancestors summing `at` of non-layout parents
   and layout boxes of layout parents.

**Dirty model:** `layoutDirty = true` on:

- doc load / reload  
- page resize end/move  
- item resize end/move  
- font ready (first measure)

Re-solve only when dirty (not every frame).

### 2.6 Runtime emit path

In `SceneRuntime`:

1. If layout dirty → `solveDocLayout` → cache `LayoutMap` + world-box cache.
2. Emit **all pages** that intersect the view (no “current chapter only” cull —
   this demo is free-explore). Keep chapter culling behavior for docs that use
   `chapter` only; pages use view culling.
3. For each object under a laid-out parent, position = resolved world box origin
   (text/island/rect use box; islands also get **content size** = box w/h so
   they can scale their internal drawing to the slot).
4. Draw page chrome: optional background rect from page world box + 1px border.
5. Resize handles: world-space SE circles on `page.resizable` and `item.resizable`
   targets; hit-test before island handles.

**Island content box:** pass resolved `w,h` into emit by temporarily setting
origin and scaling — minimal approach for this sprint:

- Prefer: island `emit` already draws in local space assuming `defaultSize`;
  runtime sets origin to box origin and applies uniform scale
  `min(box.w/defW, box.h/defH)` via draw helper **or** writes live
  `spec.size = [box.w, box.h]` into a resolved overlay (do not mutate doc —
  use a parallel `resolvedSize` map).

### 2.7 Resize interaction

```ts
// Runtime private state
grab:
  | { kind: 'page'; id: string; startWx, startWy: number; startSize: Vec2 }
  | { kind: 'item'; id: string; startWx, startWy: number; startW: number; startH: number }
  | island-handle (existing)
```

- Page SE handle at `(pageWorldX + w, pageWorldY + h)`.
- Item SE handle at item world SE.
- `dragTo`: update size with min/max clamps; set `layoutDirty`; re-solve
  immediately (cheap for <50 nodes).
- Persist live sizes in runtime maps (`livePageSize`, `liveItemSize`) so the
  SceneDoc defaults remain the authored baseline; optional later: write-back.

### 2.8 Builder helpers (ergonomics)

In `builder/scene.ts` (additive):

```ts
s.page(id, {
  title, at, size,
  resizable?, minSize?, maxSize?,
  layout: { kind:'flex', direction:'column', gap:16, padding:28, ... },
}, (p) => {
  p.row({ gap:12, align:'start' }, (r) => { ... });
  p.col({ gap:8 }, (c) => { ... });
  p.accentHead({ kicker, title, accent });
  p.body(lines);
  p.island(id, islandName, { item: { flexGrow:1, minHeight:200, resizable:true } });
});
```

`accentHead` is sugar: accent `rect` (fixed 6×78) + kicker text + title text in a
row/column group — matches explainer visual language without new IR kinds.

### 2.9 Demo scene content (required pages)

World roughly `0..4000 × 0..3000`. Suggested layout:

| id | Outer size | Layout | Notes |
|----|------------|--------|-------|
| `p-explainer` | 1260×820 | column: head, body, island grow | accent head + `glyph-analytic`; **page resizable** |
| `p-narrow` | 420×720 | column text stack | compact reading card |
| `p-compare` | 1400×480 | row of 3 verdict cards | **page resizable** |
| `p-island` | 900×700 | column title + island | island **item resizable** |
| `p-split` | 1100×640 | row: text col \| math | nested |
| `p-chips` | 640×400 | row wrap-ish via nested rows | small cards |

Faint world title text at origin: `"pages · taffy layout demo"`.

No auto-play camera tour. Boot frames all pages (bounding box) then user explores.

---

## 3. File map

**Create:**

```
src/authoring/layout/
  solve.ts              # solveDocLayout + types
  measure.ts            # intrinsic leaf measure (uses tw, island defaults)
  __test_layout.ts      # unit tests (bun)

src/authoring/scenes/
  pagesScene.ts         # PAGE_DEMO_DOC via builder

src/authoring/
  pagesDemo.ts          # bootPages() — free camera, no tour HUD required
```

**Edit (targeted only):**

```
src/authoring/ir/types.ts          # PageMeta, LayoutItem, LayoutSpec align/justify widen
src/authoring/ir/validate.ts       # validate new fields
src/authoring/builder/scene.ts     # page(), row(), col(), accentHead helpers
src/authoring/runtime/runtime.ts   # layout solve, world boxes, resize, multi-page emit
src/authoring/demo.ts              # export bootPages if preferred single entry
src/playground/demos.ts            # register id: 'pages'
src/authoring/ir/__test_ir.ts      # a few validation cases
```

**Do not modify:** `SPRINT.md`, `SPRINT-TODO.md`, old explainer, island math
unless a bug blocks the demo.

---

## 4. Phase plan

| Phase | Goal | Done when |
|-------|------|-----------|
| **L1** | Measure + solve modules + tests | `bun src/authoring/layout/__test_layout.ts` green |
| **L2** | IR + validate + builder page helpers | typecheck; builder can emit page groups |
| **L3** | Runtime applies layout on emit | `/#pages` smoke with fixed sizes looks laid out |
| **L4** | Resize handles (page + item) | A7–A8 |
| **L5** | Full demo scene + register | A1–A6, A9 |
| **L6** | Checkpoint + small polish | User signs acceptance table |

Dependencies: L1 → L2 → L3 → L4 → L5 → L6.  
L1 can start immediately (Taffy already works).

---

## 5. Execution rules

Same contract as main sprint:

1. One task at a time from `SPRINT-TODO-pages.md`; mark `[x]` there only.
2. `bunx tsc --noEmit` after every TS change.
3. No new npm dependencies.
4. No git commits unless user asks.
5. Visual checkpoints are user-owned.
6. Prefer small targeted edits; no drive-by refactors.
7. Reuse `taffy` from `src/taffy/taffy.ts`, `tw` from `layout/metrics`, islands
   registry, `createBaseApp` / `finishApp` / `snapTo`.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Taffy async init race on first frame | `bootPages` awaits `taffy.init()` before setting `s.interactive` |
| Text measure needs font | Solver `MeasureFn` closes over `engine.font`; demo waits font ready |
| Island doesn’t scale to slot | Resolved size map + uniform scale in emit (document in L3 task) |
| Resize fights camera drag | Handles take priority in `tryBeginDrag`; only SE hits |
| Perf on solve every drag | <100 nodes; solve is sub-ms; still gate on dirty |
| Chapter cull hides pages | Pages path skips chapter-only visibility filter |

---

## 7. After this sprint (not now)

- Rebuild explainer chapters as **pages** + beat clips (Manim pedagogy).
- Screen-sized reactive pages (`size` from viewport).
- Grid layout in Taffy.
- Write-back resize into SceneDoc + save/load.

---

## 8. Success definition (one line)

**`/#pages` is an infinite canvas of differently sized, Taffy-laid-out cards —
some pages and some inner slots live-resizable — using authoring IR/runtime,
with at least one explainer-style head and one live island.**
