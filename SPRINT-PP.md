# Sprint — Post-Processing & GUI Chrome (P9-PP)

**Goal:** Per-instance glow/halo effect applied to the explainer, smooth band
animations in interactive islands, and analytic Taffy-laid-out GUI chrome panels
(object tree, inspector, timeline) — all rendered through the same draw call.

---

## 0. Quick reference

```bash
bun run dev           # Dev server on port 3000
bunx tsc --noEmit     # Typecheck
```

### Files touched

| Step | File | Change |
|---|---|---|
| PP-1 | `islands/draw.ts` | Add `glowRect`, `glowCircle` helpers |
| PP-2 | `runtime/runtime.ts` | `emitObjectAt` case for rect/circle/text: emit glow aura if `glow` prop set |
| PP-3 | `ir/types.ts` | Add `glow?: GlowSpec` to LayoutItem |
| PP-4 | `scenes/explainerScene.ts` | Apply glow to kickers, titles, accent bars |
| PP-5 | `islands/builtin/bandProbe.ts` | Animate bands with easing, sliding probes |
| PP-6 | `islands/builtin/coverageSweep.ts` | Animate via time-looping bands, ping-driven transitions |
| PP-7 | `runtime/runtime.ts` | Add `panels` — chapterless Taffy pages for GUI chrome |
| PP-8 | `runtime/chrome.ts` | NEW: object tree panel rendered via DrawHelpers |
| PP-9 | `runtime/chrome.ts` | NEW: property inspector panel (selected object params) |
| PP-10 | `runtime/chrome.ts` | NEW: clip-lane timeline panel |
| PP-11 | `scenes/explainerScene.ts` | Final visual pass — halo-styled chapter cards, band polish |

---

## PP-1 — Glow emission helpers (`draw.ts`)

Add to `DrawHelpers`:

```ts
/**
 * Soft glow aura around a rect. Emits `layers` concentric rects of decreasing
 * opacity: innermost = `color` at `opacity`, outermost = same color at opacity*0.08.
 * Each layer is offset outward by spread/layers.
 */
glowRect(x0: number, y0: number, x1: number, y1: number, color: number[], layers = 3, spread = 18, alpha = 1) {}

/**
 * Soft glow aura around a circle. Same layers logic.
 */
glowCircle(cx: number, cy: number, r: number, color: number[], layers = 3, spread = 18, alpha = 1) {}

/**
 * Text glow: emit the text at decreasing opacities with slight position offsets
 * (simulates bloom). Fewer layers than rect (2 default, spread proportional to size).
 */
glowText(s: string, x: number, y: number, size: number, color: number[], layers = 2, spread = 4, alpha = 1) {}
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-2 — Per-object glow trigger (`runtime.ts`)

In `emitObjectAt`:

- Read `glow` from `(spec as any).item?.glow` (a `GlowSpec` or boolean).
- If `glow === true` or a `GlowSpec` object:
  - For `rect`: call `draw.glowRect(...)` with the layout box, using fill color + glow settings.
  - For `circle`: call `draw.glowCircle(...)`.
  - For `text`: call `draw.glowText(...)`.
- Glow aura always drawn BEFORE the base shape (so it sits behind).

**GlowSpec shape:**
```ts
interface GlowSpec {
  layers?: number;   // default 3
  spread?: number;   // default 18
  alpha?: number;    // default 1
}
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-3 — Glow type definition (`ir/types.ts`)

Add to `LayoutItem`:
```ts
glow?: true | { layers?: number; spread?: number; alpha?: number };
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-4 — Apply glow to explainer (`explainerScene.ts`)

For each chapter's accent bar, kicker text, and title text:
- Add `item: { ..., glow: true }` (or `glow: { spread: 24, layers: 4 }` for larger elements).
- Glow color matches the element's own color.
- Visual result: chapters have a soft colored aura that fades into the dark background — the "halo" effect from the original explainer.

**Verify:** `bunx tsc --noEmit` + `bun run dev` → open `/#explainer-v2`.

**CHECKPOINT:** User visually confirms glow aura on chapter cards.

**Done-when:** User confirms.

---

## PP-5 — Band animations (`bandProbe.ts`)

The band-probe island currently shows static bands. Animate:

1. **Sliding probe**: `probeY` oscillates vertically (ping-based, period ~3s) when `time.playing`, or follows wall-clock time otherwise.
2. **Band cross-sections**: Each band's cross-value is computed as the probe passes through — with a short decay tail (exponential smoothstep).
3. **Color pulse**: Bands under the probe briefly highlight with a warmer color.

```ts
const probeY = time.playing
  ? py0 + 40 * Math.sin(time.local * 2.5)
  : params.probeY;
const bandAlpha = []; // per band: fades to 1 when probe is near, decays after
```

**Verify:** `bunx tsc --noEmit` + open `/#explainer` or `/#islands` to see animated bands.

**CHECKPOINT:** User visually confirms band animation.

**Done-when:** User confirms.

---

## PP-6 — Animate coverage-sweep island

The coverage-sweep scanline already bounces (ping animation). Enhance:

1. **Banding rings**: Draw concentric dashed rings around the coverage circle at integer multiples of pixel size (10px, 20px, ...) that faintly pulse with the scanline phase.
2. **F-number trail**: The coverage integral `F` value draws a short trail (last 1s of values as a fading line history).
3. **Circle pulse**: The coverage circle gently pulses (size oscillates ±2px) to draw eye attention.

**Verify:** `bunx tsc --noEmit` + open `/#islands`.

**CHECKPOINT:** User confirms animated coverage-sweep.

**Done-when:** User confirms.

---

## PP-7 — Panel infrastructure (`runtime.ts`)

Add a `SceneRuntime.panels` list of Taffy-laid-out chrome panels. Each panel is a `GroupSpec` with:
- `page: true` (so it renders as a page card)
- `at: [viewportX, viewportY]` — fixed screen position (pinned to viewport, not world)
- `layout: { ... }` — Taffy layout for the panel's children
- Panel children are text/rect objects rendered via the same emit pipeline

In `emit()`:
- After rendering the scene's page backgrounds, render each panel at viewport coordinates (convert screen → doc via inverse camera).
- Panels are always on top (drawn last, no culling).

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-8 — Object tree panel (`runtime/chrome.ts`)

Create `src/authoring/runtime/chrome.ts` with:

```ts
export class ChromeController {
  private runtime: SceneRuntime;
  treePanel: PanelDef;     // object hierarchy
  inspectorPanel: PanelDef; // selected object details
  timelinePanel: PanelDef;  // clip lanes

  constructor(runtime: SceneRuntime) { ... }

  /** Build Taffy panel specs from current doc state. */
  buildPanels(): GroupSpec[] { ... }

  /** Handle clicks on tree entries (select object). */
  handleClick(wx: number, wy: number): boolean { ... }

  /** Returns all panels for emission. */
  get panels(): GroupSpec[] { ... }
}

interface PanelDef {
  id: string;
  at: Vec2;        // viewport position
  size: Vec2;
  layout: LayoutSpec;
}
```

**Object tree panel:**
- Title bar: "Objects" with bg color.
- Scrollable list of object ids, indented by tree depth.
- Each entry: colored dot (kind), id text. Click to select.
- Selected entry highlighted.
- Fixed at bottom-left of viewport.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-9 — Property inspector panel

Part of `runtime/chrome.ts`:

- Shows the selected object's spec: kind, id, position, size, color, params.
- For islands with handles, shows param values with live drag support.
- Editable fields: clicking a value opens an inline text input (simplified for v1 — no DOM).
- Fixed at bottom-right of viewport.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-10 — Timeline clip-lane panel

Part of `runtime/chrome.ts`:

- Horizontal bar representing doc total duration.
- Colored blocks for each clip (position = start, width = duration, color = kind).
- Vertical scrub line at current tourT.
- Click on a clip block to select it; details shown in inspector.
- Fixed at bottom center of viewport, spanning ~60% width.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

## PP-11 — Final visual pass (`explainerScene.ts`)

Apply the completed effects:

1. Every chapter card gets `glow: true` on its accent bar and kicker.
2. Interactive islands (winding-ray, coverage-sweep, band-probe) get their animated versions.
3. Chapter transitions are smooth (already via easing in poseAt).
4. Overall scene feels polished — chapters glow, bands pulse, coverage sweeps animate.

**CHECKPOINT:** User opens `/#explainer-v2`, scrubs through chapters, confirms:
- Halo aura around chapter kickers/titles
- Band-probe island has sliding probe + band highlights
- Coverage-sweep has pulsing circle + scanline + F trail

**Done-when:** User confirms visual parity / improved quality.
