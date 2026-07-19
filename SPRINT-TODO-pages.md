# Pages + Taffy Layout — Task List

**Plan:** `SPRINT-pages.md` (canonical architecture).  
**Do not edit** `SPRINT.md` or `SPRINT-TODO.md`.

**Executor protocol:** one task at a time → verify → mark `[x]` → next.  
Typecheck after every TS edit: `bunx tsc --noEmit`.  
No new deps. No git commits unless asked. User owns visual checkpoints.

---

## Reuse

| What | From |
|------|------|
| Taffy | `src/taffy/taffy.ts` — `taffy`, `TaffyLayout`, `StyleProps` |
| Text width | `src/layout/metrics.ts` — `tw` |
| Islands | `src/authoring/islands/*` — `getIsland`, builtins |
| Runtime base | `src/authoring/runtime/runtime.ts` |
| Builder | `src/authoring/builder/scene.ts` |
| Demo boot | `src/playground/app.ts` — `createBaseApp`, `finishApp`, `snapTo` |
| Registry | `src/playground/demos.ts` |
| Test pattern | `src/taffy/__test.ts`, `src/authoring/ir/__test_ir.ts` |

---

## L1 — Layout solver (no pixels yet)

### L1-001 — Create `src/authoring/layout/measure.ts`

**Write:**

```ts
export type Size = { w: number; h: number };
export type MeasureFn = (id: string, spec: ObjectSpec) => Size;
export function makeMeasureFn(font: FontFace, getIslandDefault: (name: string) => Size | null): MeasureFn;
```

- `text` → `{ w: tw(content, font, size), h: size * 1.25 }`
- `rect` → `size`
- `island` → `spec.size ?? island.defaultSize ?? {480,360}`
- `math` → `{ w: max(80, latex.length * size * 0.42), h: size * 1.4 }`
- `circle` → `{ w: 2*r, h: 2*r }`
- `glyph` → `{ w: size, h: size }`
- `line`/`polygon` → bbox of points (padding 4)
- `group` → if `size` use it; else `{0,0}` (parent layout will size)

Respect `spec.item?.width/height` numbers when present (override intrinsic).

**Verify:** `bunx tsc --noEmit`

- [x] L1-001

---

### L1-002 — Create `src/authoring/layout/solve.ts`

**Write:**

```ts
export type Box = { x: number; y: number; w: number; h: number };
export type LayoutMap = Map<string, Box>; // local to parent

export async function ensureTaffy(): Promise<void>;

/** Requires taffy already init'd. */
export function solveDocLayout(doc: SceneDoc, measure: MeasureFn): LayoutMap;
```

Rules (see `SPRINT-pages.md` §2.5):

1. Find every `group` with `layout` set that is a **layout root**: either has
   `page` meta, or is not listed in any other group's `children` while having
   `layout`+`size`. For this sprint, **only solve groups with `page` set**
   (simpler, matches demo).
2. For each page group: `clear()` taffy (or use a fresh tree), build nodes:
   - Page root style from `LayoutSpec` + fixed `width/height = page.size`.
   - Each child: if child is group with `layout`, nest; else leaf with measured
     size + `item` flex props mapped to `StyleProps`.
3. Map Taffy results → `LayoutMap` entries keyed by object id. Store **parent-local**
   coordinates (Taffy already returns relative to parent if you use nested nodes
   correctly — verify against `src/taffy/__test.ts` conventions).
4. Nested layout groups: their box is in parent local space; their children are
   local to that group.

`LayoutSpec` → `StyleProps` mapping:

| LayoutSpec | StyleProps |
|------------|------------|
| direction row/column | flexDirection |
| gap | gap |
| padding | padding |
| align start/center/end/stretch | alignItems flex-start/center/flex-end/stretch |
| justify start/center/end/space-between/space-around | justifyContent likewise |

`LayoutItem` → child StyleProps: width/height/min/max/flexGrow/flexShrink/alignSelf.

**Verify:** `bunx tsc --noEmit`

- [x] L1-002

---

### L1-003 — Create `src/authoring/layout/__test_layout.ts`

Tests (after `await ensureTaffy()`):

1. Page column, padding 20, gap 10, two rects 100×40 → second child y = 20+40+10.
2. Page row, three equal width children with flexGrow 1, page w=300, pad 0 gap 0
   → each w ≈ 100.
3. Nested: page column → head fixed height + body group row with two children.
4. `item.width` override beats intrinsic measure.
5. Two separate pages both appear in the map with independent coords.

Run: `bun src/authoring/layout/__test_layout.ts` — all pass.

- [x] L1-003

---

### L1-004 — L1 checkpoint

- [x] All L1 tasks `[x]`
- [ ] layout tests green
- [ ] `bunx tsc --noEmit` clean

---

## L2 — IR + builder

### L2-001 — Extend `src/authoring/ir/types.ts`

Add (do not remove existing fields):

```ts
export interface PageMeta {
  title?: string;
  resizable?: boolean;
  minSize?: Vec2;
  maxSize?: Vec2;
}

export interface LayoutItem {
  width?: number | 'auto';
  height?: number | 'auto';
  flexGrow?: number;
  flexShrink?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  resizable?: boolean;
}
```

- `GroupSpec`: add `page?: PageMeta`
- Every object spec that can be a layout child: add `item?: LayoutItem`
  (`text`, `glyph`, `rect`, `circle`, `polygon`, `line`, `math`, `group`, `island`)
- Widen `LayoutSpec.align` to include `'stretch'`
- Widen `LayoutSpec.justify` to include `'space-around'`

**Verify:** typecheck

- [x] L2-001

---

### L2-002 — Extend `src/authoring/ir/validate.ts`

Validate when present:

- `page.minSize` / `maxSize` are Vec2; if both, min ≤ max componentwise
- `item.*` numbers finite; flexGrow/flexShrink ≥ 0
- `layout.align` / `justify` accept new enums
- Unknown keys: ignore (don’t fail)

Add 2–3 cases to `__test_ir.ts`.

**Verify:** `bun src/authoring/ir/__test_ir.ts` + typecheck

- [x] L2-002

---

### L2-003 — Builder: `page`, `row`, `col`, `accentHead`

Edit `src/authoring/builder/scene.ts` (+ helpers file if cleaner:
`src/authoring/builder/page.ts` re-exported).

API sketch:

```ts
// on SceneBuilder:
page(id, opts: {
  title?: string;
  at: Vec2;
  size: Vec2;
  resizable?: boolean;
  minSize?: Vec2;
  maxSize?: Vec2;
  layout?: LayoutSpec; // default column gap 16 padding 28
}, build: (p: PageBuilder) => void): void;

// PageBuilder / FlexBuilder:
row(opts, build)
col(opts, build)
// object factories same as ChapterBuilder but set parent children + optional item
text / rect / island / math / ...
accentHead(prefix, { kicker, title, accent: Color })
body(prefix, lines: string[])
```

`accentHead` creates:

- group `prefix-head` with row layout, gap 16, item height ~78
- rect `prefix-bar` 6×78 fill accent
- col with kicker (14px dim) + title (40px head)

`body` creates text lines stacked via column group or sequential texts with
fixed heights in a column.

Children of layout parents: set `at: [0,0]` (ignored by solver).

**Verify:** typecheck; optional tiny builder test that `page` produces
`kind:'group'` with `page` + `layout` + children.

- [x] L2-003

---

### L2-004 — L2 checkpoint

- [x] L2 tasks done
- [ ] typecheck clean

---

## L3 — Runtime layout application

### L3-001 — Layout cache + solve hook in `SceneRuntime`

Edit `src/authoring/runtime/runtime.ts`:

- Fields: `layoutMap`, `worldBox: Map<string, Box>`, `layoutDirty`, `measure`,
  `livePageSize: Map<string, Vec2>`, `liveItemWH: Map<string, {w,h}>`
- Method `invalidateLayout()`
- Method `ensureLayout()`:
  - if !dirty return
  - clone-view of sizes: for page groups, effective size =
    `livePageSize.get(id) ?? spec.size`
  - for items with live WH, overlay into measure/item
  - `solveDocLayout(doc, measure)`
  - compute `worldBox` by walking: page world = `page.at + local`; child world =
    parentWorld + childLocal
- Call `ensureLayout()` at start of `emit`
- Constructor: `layoutDirty = true`; accept font for measure

**Boot requirement:** demo must `await ensureTaffy()` and construct runtime after.

**Verify:** typecheck

- [x] L3-001

---

### L3-002 — Emit uses world boxes for laid-out objects

- If object id ∈ worldBox, draw at `box.x, box.y` (not raw `spec.at`).
- Rects with layout: draw using `box.w, box.h` (not only spec.size) when under layout.
- Islands: origin = box origin; store `resolvedIslandSize`; scale drawing with
  `sx = box.w/defW`, `sy = box.h/defH` — **prefer uniform**
  `s = min(sx,sy)` and letterbox inside slot OR stretch; pick **uniform min** for
  this sprint and document in a one-line comment.
- Text: position at box origin (top-left); do not reflow glyphs inside box yet.
- Page chrome: for each page group, fill `panelBg` + stroke border using world box
  **behind** children (emit pages first or draw chrome before leaves).

**Visibility:** objects under `page` groups: cull by page world box vs view.
Do **not** apply `currentChapterId` hiding to page-backed content.

**Verify:** typecheck

- [x] L3-002

---

### L3-003 — Fix island double-emit if still present

In current `runtime.ts` island branch, `def.emit` is invoked twice — remove the
duplicate as part of this task if still there.

**Verify:** typecheck + visual later

- [x] L3-003

---

### L3-004 — L3 smoke scene (minimal)

Create `src/authoring/scenes/pagesScene.ts` with **one** page first if needed for
debug — or jump to full L5 scene. Prefer **full scene in L5-001**; here only
ensure runtime compiles with layout path.

**Verify:** typecheck

- [x] L3-004

---

## L4 — Resize handles

### L4-001 — Page SE handle hit-test + drag

In `SceneRuntime`:

- After island handles, test page SE handles for `page.resizable`.
- Handle world pos: `(worldBox.x + w, worldBox.y + h)`.
- Hit radius: `max(12, 18/scale)` (same as islands).
- On drag:  
  `newW = clamp(startW + (wx-startWx), minW, maxW)`  
  `newH = clamp(startH + (wy-startWy), minH, maxH)`  
  write `livePageSize`; `invalidateLayout()`.
- Draw handle: small fill circle + ring (reuse island handle look: green/gold).

**Verify:** typecheck

- [x] L4-001

---

### L4-002 — Item SE handle hit-test + drag

Same for any object with `item.resizable` under a page:

- Drag mutates `liveItemWH` (width & height together from SE).
- Clamps: `item.minWidth/maxWidth/minHeight/maxHeight` if set, else
  `[40,40]` … `[2000,2000]`.
- `invalidateLayout()` each move.

**Verify:** typecheck

- [x] L4-002

---

### L4-003 — Hover cursor feedback (optional small)

If easy: set `hoveredHandle` style for resize vs island. Skip if >30 lines.

- [x] L4-003 (or skip with note)

---

### L4-004 — L4 checkpoint

- [x] Handles compile; full visual in L6

---

## L5 — Demo product

### L5-001 — Full `pagesScene.ts`

Build `PAGE_DEMO_DOC` with builder. Requirements:

1. **p-explainer** — 1260×820 at `[80, 80]`, column, accentHead + body (3 lines)
   + island `glyph-analytic` flexGrow 1, **page.resizable** true  
2. **p-narrow** — 420×720 at `[1500, 40]`, column of title + 6 body lines  
3. **p-compare** — 1400×480 at `[80, 1000]`, row of 3 cards (each card = col:
   accent chip + label + short text), **page.resizable**  
4. **p-island** — 900×700 at `[1600, 1000]`, title + `coverage-sweep` with
   **item.resizable** true, minHeight 180  
5. **p-split** — 1100×640 at `[80, 1700]`, row: left text col, right math
   `F = \\frac{1}{A}\\iint_B w\\,dA`  
6. **p-chips** — 640×400 at `[1400, 1800]`, row of 4 small rect+label chips  

World label text object (no page): `"pages · taffy layout"` at `[-40, -60]`.

Colors: reuse explainer C palette (inline consts).

**Verify:** typecheck; `validateSceneDoc(PAGE_DEMO_DOC)` empty errors
(register known islands set).

- [x] L5-001

---

### L5-002 — `bootPages` entry

Create `src/authoring/pagesDemo.ts` (or export from `demo.ts`):

```ts
export async function bootPages(engine, onBack): Promise<() => void> // or sync if init pre-awaited
```

Steps:

1. `await ensureTaffy()` (if not top-level await in boot — use async IIFE and
   return disposer; match how other demos return `() => void` — **block**: if
   boot must be sync, call `ensureTaffy()` without await only if already inited;
   preferred: make boot sync and in constructor path call void ensure then
   `layoutDirty` until ready; **simplest accepted:**  
   `bootPages` starts `ensureTaffy().then(() => runtime.markReady())` and first
   emits no-op until ready).
2. `createBaseApp(engine, false)`
3. `SceneRuntime` with `PAGE_DEMO_DOC`
4. `s.interactive = runtime`
5. Compute bounds of all pages → `snapTo` center + zoom to fit with margin
6. **No** tour timeline HUD required (optional tiny DOM hint:
   `"drag SE handles to resize · pan/zoom freely"` bottom-left, pointer-events
   none)
7. `finishApp(s, onBack)`

Import islands side-effect: `import '../authoring/islands'` or from demos.ts.

**Verify:** typecheck

- [x] L5-002

---

### L5-003 — Register demo in `demos.ts`

```ts
{
  id: 'pages',
  name: 'Pages / Layout',
  blurb: 'Infinite canvas of Taffy-laid-out cards — resize pages and slots live.',
  boot: bootPages,
}
```

Put near top of `DEMOS` list for easy access.

**Verify:** typecheck; dev server loads `/#pages`

- [x] L5-003

---

### L5-004 — L5 checkpoint (code)

- [x] All L5 code tasks done
- [ ] typecheck clean

---

## L6 — User acceptance

### L6-001 — CHECKPOINT: free navigation

User opens `/#pages`:

- [ ] A1 pan/zoom/orbit works

### L6-002 — CHECKPOINT: content variety

- [ ] A2 ≥5 pages
- [ ] A3 ≥4 outer sizes
- [ ] A4 ≥3 layout kinds
- [ ] A5 accent head present
- [ ] A6 live island present

### L6-003 — CHECKPOINT: reactivity

- [ ] A7 ≥2 page resize → reflow
- [ ] A8 ≥1 item resize → sibling reflow
- [ ] A9 stable under rapid drag

### L6-004 — Fix list from user (only reported issues)

Implement only bugs/layout fails user reports. No scope creep.

- [ ] L6-004 (as needed)

### L6-005 — Sprint close

- [ ] Acceptance table in `SPRINT-pages.md` §1 all checked by user
- [ ] Brief note at top of `SPRINT-pages.md`: `Status: done (YYYY-MM-DD)`

---

## Task count

| Phase | Tasks |
|-------|------:|
| L1 | 4 |
| L2 | 4 |
| L3 | 4 |
| L4 | 4 |
| L5 | 4 |
| L6 | 5 |
| **Total** | **~25** |

Estimated: 1 focused session for L1–L3, 1 for L4–L5, user L6.

---

## Explicit non-goals (reject if tempted)

- [ ] Explainer-v3 full story rewrite
- [ ] REPL / emitTS / GUI panels
- [ ] Grid layout
- [ ] Viewport-linked page size
- [ ] Mutating SceneDoc on resize (live maps only)
- [ ] Editing `SPRINT.md` / `SPRINT-TODO.md`
