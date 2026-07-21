# Explainer v3 — Design Document

## Infinite Canvas · Varied Layouts · Analytic Everything

**Goal**: Build a new interactive explainer that demonstrates any mathematical concept through the windfoil analytic pipeline — using diverse layouts, interactive islands, live plots, and the full playground toolset. Every element is drawn through the same single GPU pass: text, equations, interactive controls, charts, and HUD.

**Target concept**: *Fourier Series* — approximation of periodic functions through superposition of sinusoids. It has natural visual hierarchy (complex → simple), interactive sliders, live plots, and a satisfying "aha" moment when harmonics accumulate into the target shape.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Infinite Canvas Model](#2-infinite-canvas-model)
3. [Layout Archetypes](#3-layout-archetypes)
4. [New Islands](#4-new-islands)
5. [Interaction Patterns](#5-interaction-patterns)
6. [Chapter-by-Chapter Map](#6-chapter-by-chapter-map)
7. [Builder API Additions](#7-builder-api-additions)
8. [Visual Design System](#8-visual-design-system)
9. [Camera & Animation Guide](#9-camera--animation-guide)
10. [Implementation Plan](#10-implementation-plan)

---

## 1. Design Principles

| Principle | Meaning |
|---|---|
| **One pipeline** | Everything — text, curves, plots, controls, HUD — renders through the same analytic coverage integral. No DOM, no canvas 2D, no raster fallbacks. |
| **Infinite canvas** | No card borders or page edges. Content floats directly on the dark backdrop. Pages exist only as flexbox layout containers and dive targets. |
| **Every chapter is different** | 6 layout archetypes, chosen to best explain each section. No two chapters share the same visual grammar. |
| **Interactive first** | Islands are not illustrations but tools: drag a slider, probe a curve, tap a harmonic to mute it. The user learns by doing. |
| **Deterministic camera** | All transitions are keyframed with geometric-zoom interpolation and `fitObj` tracking. Dives target specific elements inside a page, not page corners. |
| **Reference-quality design** | Typography, spacing, color, and component style follow the yasmineOS design language. |

---

## 2. Infinite Canvas Model

Pages are **noChrome: true** by default — no card background or border is drawn at the page level. Individual content sections opt into card backgrounds as a design choice.

```
World space (infinite 2D)
├── Chapter 1 "splash"     @ [0, 0]        — HeroCentered
├── Chapter 2 "sound"      @ [1450, -430]  — FullBleedVisual
├── Chapter 3 "sine"       @ [3100, 230]   — SplitNarrative
├── Chapter 4 "freq"       @ [3000, -1120] — Dashboard
├── Chapter 5 "harmonics"  @ [4740, -430]  — PipelineFlow
├── Chapter 6 "sum"        @ [4560, 900]   — Comparison
├── Chapter 7 "dive"       @ [6340, 250]   — HeroCentered (deep zoom)
├── Chapter 8 "controls"   @ [6200, -970]  — Dashboard (living UI peel)
└── ...
```

Each chapter is a `chapterPage` with `noChrome: true` and its own layout. The camera flies between them through choreographed keyframes (`drop`, `sweep`, `dive`, `arc`, `pull`, `trace`).

---

## 3. Layout Archetypes

Six layout archetypes, implemented as builder wrapper methods.

### 3.1 HeroCentered

```
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│             [hero island]               │
│                                         │
│                                         │
│          Title / subtitle               │
│          (bottom overlay)               │
└─────────────────────────────────────────┘
```

**Parameters**: `island`, `title`, `subtitle`, `overlayStyle?: 'bottom' | 'left' | 'center'`

**Camera**: `dive({ into: [0.5, 0.5], zoom })` into the island center.

**Example**: Splash screen, infinite-zoom finale.

```typescript
chB.heroCentered('splash', {
  island: 'fourier-logo',
  title: 'Fourier Series',
  subtitle: 'ANY PERIODIC FUNCTION IS A SUM OF SINES',
  overlayStyle: 'center',
});
```

### 3.2 SplitNarrative

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────┐  ┌───────────────────┐    │
│  │ COPY     │  │ VISUAL            │    │
│  │ ┌──┐     │  │ ┌─────────────┐   │    │
│  │ │▐▐│body │  │ │             │   │    │
│  │ └──┘     │  │ │  island     │   │    │
│  │          │  │ │  or plot    │   │    │
│  │ [tail]   │  │ └─────────────┘   │    │
│  └──────────┘  └───────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Parameters**: `kicker`, `title`, `body: string[]`, `island`, `ratio?: number` (default 1:1.6), `tail?: (c) => void`, `flip?: boolean`

This is the current `splitChapter` but with an asymmetric default ratio (visual gets more space) and optional card background only on the copy panel.

**Example**: Sine wave explanation.

```typescript
chB.splitNarrative('sine', {
  kicker: 'The building block',
  title: 'Sine waves.',
  body: ['Every periodic function can be decomposed into sine', 'waves of different frequencies and amplitudes.'],
  island: 'sine-plot',
  ratio: 1.6,
  tail: (c) => c.math('sine-eq', 'f(t) = A \\cdot \\sin(2\\pi f \\cdot t + \\phi)', { size: 24, color: C.ink }),
});
```

### 3.3 FullBleedVisual

```
┌─────────────────────────────────────────┐
│                                         │
│        [full-bleed island]              │
│                                         │
│  ┌──────────────────┐                   │
│  │ KICKER           │  ← semi-transparent│
│  │ Title            │    overlay panel   │
│  │ body text...     │                   │
│  └──────────────────┘                   │
│                                         │
└─────────────────────────────────────────┘
```

**Parameters**: `island`, `kicker`, `title`, `body`, `overlay?: 'left' | 'bottom'`, `overlayOpacity?: number`

The island fills the entire page. The text overlays sit on a `rect` with `fill: [0.02, 0.025, 0.04, overlayOpacity]`.

**Example**: Sound as vibration, visualizing complex waveforms.

```typescript
chB.fullBleedVisual('sound', {
  island: 'wave-visualizer',
  kicker: 'Sound is vibration',
  title: 'Periodic motion.',
  body: ['A plucked string, a voice, a speaker cone —', 'periodic vibrations in the air.'],
  overlay: 'left',
});
```

### 3.4 Dashboard

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   interactive island (hero)     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ stat │ │ stat │ │ stat │ │ stat │  │
│  └──────┘ └──────┘ └──────┘ └──────┘  │
│                                         │
│  ┌─ insight ───────────────────────┐    │
│  │  key takeaway text              │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Parameters**: `island`, `kicker?`, `title?`, `stats: { label, value, color }[]`, `insight?: string`, `accent?: Color`

**Example**: Frequency domain exploration.

```typescript
chB.dashboard('freq', {
  island: 'freq-plot',
  kicker: 'Frequency domain',
  title: 'What frequencies are present?',
  stats: [
    { label: 'f = 1 Hz', value: 'A = 1.0', color: C.accent },
    { label: 'f = 3 Hz', value: 'A = 0.33', color: C.gold },
    { label: 'f = 5 Hz', value: 'A = 0.20', color: C.green },
    { label: 'Total harmonics', value: '7', color: C.accent2 },
  ],
  insight: 'The first harmonic dominates. Higher harmonics add finer detail.',
});
```

### 3.5 PipelineFlow

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐│
│  │  1   │  │  2   │  │  3   │  │  4   ││
│  │ step │→│ step │→│ step │→│ step ││
│  └──────┘  └──────┘  └──────┘  └──────┘│
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   [live preview island]         │    │
│  │   (reflects highlighted step)   │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Parameters**: `steps: { title, icon?, island?, label }[]`, `preview: string` (island id), `animated?: boolean`

The active step is highlighted; the preview island shows what that step produces. Steps advance automatically with the timeline or on click.

**Example**: The Fourier pipeline (signal → decompose → modify → reconstruct).

```typescript
chB.pipelineFlow('pipeline', {
  steps: [
    { title: 'Original', icon: 'wave', label: 'f(t)' },
    { title: 'Decompose', icon: 'code', label: 'sin, cos' },
    { title: 'Modify', icon: 'gear', label: 'filter' },
    { title: 'Reconstruct', icon: 'check', label: "f'(t)" },
  ],
  preview: 'pipeline-preview',
  animated: true,
});
```

### 3.6 Comparison

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌──────────┐     ┌──────────┐          │
│  │ APPROACH │     │ ANALYTIC │         │
│  │    A     │  →  │    B     │         │
│  │          │     │          │         │
│  │ [island] │     │ [island] │         │
│  └──────────┘     └──────────┘         │
│                                         │
│  ┌───────── verdict row ──────────┐     │
│  │  1 harmonic  vs  7 harmonics   │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
```

**Parameters**: `left: { label, island, caption }`, `right: { label, island, caption }`, `arrow?: boolean`, `verdict?: { left, right, color }`

**Example**: 1 harmonic vs. 7 harmonics, few terms vs. many terms.

```typescript
chB.comparison('harm-sum', {
  left: { label: '1 term', island: 'fourier-1-term', caption: 'Just a sine wave' },
  right: { label: '7 terms', island: 'fourier-7-term', caption: 'Looking like a square wave' },
  arrow: true,
  verdict: { left: 'approximation', right: 'convergence', color: C.green },
});
```

---

## 4. New Islands

Islands are interactive widgets that render through the analytic pipeline. They receive `time` (for animation), `params` (for user interaction), and a `DrawCtx` for emitting geometry.

### 4.1 Plot Islands

| Island | Description | Params |
|---|---|---|
| `xy-plot` | Generic Cartesian plot with grid, axes, labels, and 1-N curve traces. Supports auto-ranging, zoom, and interactive probes. | `traces: TraceDef[]`, `xRange`, `yRange`, `grid?: boolean`, `probe?: 'x' | 'point'` |
| `polar-plot` | Polar coordinate plot for showing radial functions. | `func: string`, `rMax`, `thetaSteps` |
| `spectrogram` | Time-frequency heatmap. | `data: number[][]`, `freqLabels`, `timeLabels` |
| `stem-plot` | Discrete frequency spectrum (amplitude bars). | `values: { freq, amp }[]`, `highlight?: number` |
| `domain-coloring` | Complex function visualization through domain coloring. | `func: string`, `complexPlane: { re, im }` |

**Implementation note**: `xy-plot` is the workhorse. It emits grid lines as analytic strokes, axis labels as analytic text, and curves as filled Bézier paths. The probe is a draggable handle that emits a crosshair + readout.

### 4.2 Control Islands

| Island | Description | Params |
|---|---|---|
| `slider` | Horizontal slider with label, value readout, and interactive drag handle. Emits as analytic geometry (track + thumb + text). | `value: number`, `min`, `max`, `step`, `label`, `color` |
| `knob` | Circular knob for continuous value control. | `value: number`, `min`, `max`, `label`, `color` |
| `toggle` | Binary toggle switch. | `on: boolean`, `label`, `activeColor` |
| `button` | Push button with label. | `label`, `onClick?: string` (param mutation) |
| `radio-group` | Vertical/horizontal group of radio buttons. | `options: string[]`, `selected: number`, `label` |

### 4.3 Data Display Islands

| Island | Description | Params |
|---|---|---|
| `stat-card` | Single metric with label, value, optional sparkline, trend indicator. | `label`, `value`, `sparkline?: number[]`, `trend?: 'up' | 'down' | 'flat'`, `color` |
| `badge` | Small colored label/count, like version tags. | `text`, `color`, `size?` |
| `progress-bar` | Horizontal progress with fill color, label. | `value: number (0-1)`, `label`, `color` |
| `led` | Small colored dot (on/off/multi-state). | `state: number`, `colors: Color[]` |

### 4.4 Diagram Islands

| Island | Description | Params |
|---|---|---|
| `graph-editor` | Interactive node-edge graph. Nodes are draggable; edges are Bézier curves. | `nodes: NodeDef[]`, `edges: EdgeDef[]`, `selected?: number` |
| `block-diagram` | Rectangular blocks with arrows between them. | `blocks: { id, label, color }[]`, `edges: { from, to }[]` |
| `arrow-annotation` | Callout arrow pointing to a region with label. | `from: Vec2`, `to: Vec2`, `label`, `color` |
| `insight-block` | Left-accent-bar text block (from reference design). | `text: string`, `accent: Color` |

---

## 5. Interaction Patterns

### 5.1 Param-Driven Interactivity

The explainer uses `SceneDoc.params` to carry live state. Islands read/write params. Sliders update on drag; plots react.

```typescript
// Declare params
s.param.number('numHarmonics', { default: 3, min: 1, max: 20, step: 1, label: 'Harmonics' });
s.param.number('frequency', { default: 440, min: 20, max: 2000, step: 1, label: 'Frequency (Hz)' });
s.param.point('probeX', { default: [0.5, 0], label: 'Probe position' });

// Island reads param
chB.lIsland('freq-plot', 'xy-plot', {
  params: { numHarmonics: { $param: 'numHarmonics' }, probeX: { $param: 'probeX' } },
  item: { flexGrow: 1, fill: true },
});
```

### 5.2 Living UI / HUD Peel

One chapter demonstrates the "one analytic pipeline" concept by peeling the HUD into the world — the same cinematic controls (playhead, scrubber, buttons) that were a screen overlay become a world-space card, proving the HUD is drawn by the same renderer.

This is the `hudDetach` system already built. In the Fourier explainer, this chapter shows the "control room" — all the interactive controls (sliders, buttons, plots) rendered analytically, and the HUD peels off to join them.

### 5.3 Auto-Advance + User Interrupt

Camera auto-advances through chapters. User can:
- **Drag** any interactive island handle at any time
- **Scroll/wheel** to interrupt the tour and free-explore
- **Press timeline scrubber** to seek
- The chapter's island continues animating even when the tour stops

### 5.4 Island Animations (Param-Driven)

Islands self-animate when not being interacted with:
```typescript
const t = loop01(time.now, 6); // 6-second loop
plot.addTrace('f(t)', computeFourier(t, numHarmonics));
```

When the user drags a slider, the animation pauses on that parameter value — the user explores, then releases, and the animation resumes from the current state.

---

## 6. Chapter-by-Chapter Map

A Fourier Series explainer in 8 chapters, each using a different layout:

### Chapter 1: `splash` — HeroCentered

```
FOURIER SERIES
ANY PERIODIC FUNCTION IS A SUM OF SINES

[animating logo: sine waves stacking into a square wave]
```

- **Island**: `fourier-logo` — animated demo: 1→7→1 harmonics cycling
- **Camera**: `drop` from slight zoom, settle with drift
- **Duration**: 5s
- **noChrome**: true

### Chapter 2: `sound` — FullBleedVisual

```
┌──────────────────────────────────────────┐
│                                          │
│   [full-bleed waveform visualizer]       │
│                                          │
│  ┌──────────────────────────┐            │
│  │ SOUND IS VIBRATION       │            │
│  │ Periodic motion.         │  ← overlay │
│  │ A plucked string, a      │            │
│  │ voice — periodic waves.  │            │
│  └──────────────────────────┘            │
└──────────────────────────────────────────┘
```

- **Island**: `wave-visualizer` — animated sine wave with moving dot tracing the oscillation, frequency sweep 1→5→1 Hz
- **Camera**: `sweep` from right, settling
- **noChrome**: true

### Chapter 3: `sine` — SplitNarrative (asymmetric)

```
┌──────────────────────────────────────────┐
│  ┌──────┐   ┌──────────────────────┐     │
│  │▐     │   │                      │     │
│  │SINE  │   │   [xy-plot: sine]    │     │
│  │WAVES │   │   f(t)=A·sin(2πf·t)  │     │
│  │      │   │                      │     │
│  │body  │   │   ┌─ probe ─┐        │     │
│  │...   │   │   │ t=1.2s  │        │     │
│  └──────┘   │   └─────────┘        │     │
│             └──────────────────────┘     │
└──────────────────────────────────────────┘
```

- **Island**: `xy-plot` with sine trace, interactive probe (drag the vertical line)
- **Copy panel**: has its own subtle card background (`rect` + `stroke`)
- **Camera**: `diveObj({ target: 'sine-plot', zoom: 2 })` into the plot after 3s hold
- **Tail**: Equation `f(t) = A · sin(2πf · t + φ)`
- **Clip**: equation fades in after plot settles

### Chapter 4: `freq` — Dashboard

```
┌──────────────────────────────────────────┐
│                                          │
│   [stem-plot: frequency spectrum]        │
│                                          │
│  ┌──────┐┌──────┐┌──────┐┌──────┐       │
│  │1Hz   ││3Hz   ││5Hz   ││7Hz   │       │
│  │A=1.0 ││A=0.33││A=0.20││A=0.14│       │
│  └──────┘└──────┘└──────┘└──────┘       │
│                                          │
│  ┌─ insight ─────────────────────────┐   │
│  │ Odd harmonics only: the square    │   │
│  │ wave contains no even frequencies.│   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

- **Island**: `stem-plot` showing amplitude bars for each harmonic. Animated highlight sweeps through them
- **Stats**: 4 stat cards showing frequency, amplitude, phase, weight
- **Insight block**: odd-harmonics observation
- **Camera**: `rise` from below, looking up at the stems

### Chapter 5: `harmonics` — PipelineFlow

```
┌──────────────────────────────────────────┐
│                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐        │
│  │  1 Hz  │ │  3 Hz  │ │  5 Hz  │  ...  │
│  │ ██████ │→│ ████   │→│ ██     │→     │
│  └────────┘ └────────┘ └────────┘        │
│                                          │
│   [live preview: accumulation]           │
│                                          │
│   ┌──────┐                               │
│   │ +Nth │ ← tap to toggle harmonic     │
│   └──────┘                               │
└──────────────────────────────────────────┘
```

- **Steps**: individual harmonic cards in a horizontal flow. Each is a `stat-card` + mini sine preview
- **Preview**: `xy-plot` showing the accumulated waveform so far
- **Interaction**: tap any harmonic card to toggle it on/off. The preview updates live
- **Camera**: `sweep` across the flow, then `diveObj({ target: 'preview-plot', zoom: 3 })`
- **Animated highlighting**: the pipeline advances step by step

### Chapter 6: `sum` — Comparison

```
┌──────────────────────────────────────────┐
│                                          │
│  ┌────────────┐     ┌────────────┐       │
│  │ 1 TERM     │     │ ∞ TERMS    │      │
│  │            │  →  │            │      │
│  │ [rough     │     │ [perfect   │      │
│  │  approx]   │     │  square]   │      │
│  └────────────┘     └────────────┘       │
│                                          │
│  ┌── verdict: convergence ─────────┐     │
│  │  More terms → better fit        │     │
│  │  Error = 1/N                     │     │
│  └──────────────────────────────────┘     │
└──────────────────────────────────────────┘
```

- **Left plot**: `xy-plot` with 1-term approximation (just a sine)
- **Right plot**: `xy-plot` with N-term approximation (user-controlled via slider)
- **Arrow**: animated stroke pointing left→right
- **Verdict row**: convergence rate text + equation
- **Slider**: `numHarmonics` param, rendered as a `slider` island between the two plots
- **Camera**: `diveObj({ target: 'right-plot', zoom: 4 })` — dives into the convergence

### Chapter 7: `dive` — HeroCentered (deep zoom)

```
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│        [xy-plot: full reconstruction]    │
│                                          │
│                                          │
│    RECOMPUTED · NEVER STORED             │
│    Dive into the edge — it stays smooth  │
│    because it's recomputed instantly.     │
└──────────────────────────────────────────┘
```

- **Island**: `xy-plot` with the full reconstruction, animating from 1→50 terms cycling
- **Camera**: `trace` — follows the curve outline at deep zoom, showing smooth edges
- **noChrome**: true, full-bleed
- This demonstrates the windfoil payoff: the plot is recomputed, never stored, so it stays sharp at any zoom

### Chapter 8: `controls` — Dashboard + Living UI Peel

```
┌──────────────────────────────────────────┐
│                                          │
│   [full-plot: user's playground]         │
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ freq │ │harm  │ │wave  │ │reset │   │
│  │slider│ │slider│ │toggle│ │ btn  │   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
│                                          │
│  ┌─ HUD peels off screen ────────────┐   │
│  │  play | 3.2s / 12.0s | scrubber  │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

- **The HUD peel**: `hudDetach` param drives the cinematic HUD from screen overlay → world-space card
- **Controls**: real `slider` islands for frequency, harmonics, amplitude; toggle for wave shape
- **Plot**: `xy-plot` showing the live result of all controls
- **Camera**: starts wide (all controls visible), dives into the plot, peels back
- **Purpose**: demonstrates that the entire UI — controls, plots, HUD — is drawn by the same analytic pipeline

---

## 7. Builder API Additions

New methods on `ChapterBuilder` (all combinators over existing primitives):

### 7.1 Layout Archetypes

```typescript
// Full-bleed hero island with overlaid text
heroCentered(id: string, opts: {
  island: string; islandParams?: Record<string, any>;
  title: string; subtitle: string;
  overlayStyle?: 'center' | 'bottom' | 'left';
  accent?: Color;
}): void

// Asymmetric narrative split (default visual 1.6× copy)
splitNarrative(id: string, opts: {
  kicker: string; title: string; body: string[];
  island: string; islandParams?: Record<string, any>;
  caption?: string; ratio?: number; flip?: boolean;
  tail?: (c: PageBuilder) => void;
  cardCopy?: boolean; // draw card bg behind copy
  accent?: Color;
}): void

// Full-bleed island with text overlay panel
fullBleedVisual(id: string, opts: {
  island: string; islandParams?: Record<string, any>;
  kicker: string; title: string; body: string[];
  overlayPosition?: 'left' | 'bottom';
  overlayOpacity?: number;
}): void

// Interactive dashboard: hero island + stat row + insight
dashboard(id: string, opts: {
  island: string; islandParams?: Record<string, any>;
  kicker?: string; title?: string;
  stats: { label: string; value: string; color: Color }[];
  insight?: string;
  accent?: Color;
}): void

// Pipeline flow: step cards + preview island
pipelineFlow(id: string, opts: {
  steps: { title: string; icon?: string; label?: string }[];
  previewIsland: string; previewParams?: Record<string, any>;
  animated?: boolean;
}): void

// Side-by-side comparison
comparison(id: string, opts: {
  left: { label: string; island: string; params?: Record<string, any>; caption?: string };
  right: { label: string; island: string; params?: Record<string, any>; caption?: string };
  arrow?: boolean;
  verdict?: { left: string; right: string; color: Color };
}): void
```

### 7.2 Reusable Components

```typescript
// Stat card row (from reference design)
statRow(id: string, items: { label: string; value: string; color?: Color; accent?: Color }[]): string

// Insight block with left accent bar
insightBlock(id: string, text: string, opts: { accent?: Color; size?: number }): string

// Chip/verdict row (already exists as chipRow, promote to builder method)
chipRow(id: string, items: [string, Color][], opts?: { labelColor?: Color; size?: number }): string

// Separator line
separator(id: string): string // thin horizontal stroke

// Control bar (reference design: button group + status indicator)
controlsBar(id: string, opts: {
  buttons: { label: string; icon?: string; active?: boolean }[];
  status?: { label: string; color: Color };
}): string
```

### 7.3 Camera Helpers

```typescript
// Dive into a laid-out object by id (uses fitObj)
diveInto(opts: { target: string; zoom: number; hold?: number; duration?: number }): void

// Sweep across a visual — start at left side, end at right
sweepAcross(opts: { target: string; zoom: number; hold?: number }): void

// Trace the outline of a glyph/shape at deep zoom
traceOutline(opts: { target: string; zoom: number; duration: number; samples?: number }): void

// Pull back to show full page, then drift
pullBack(opts: { hold?: number; drift?: boolean }): void
```

---

## 8. Visual Design System

### 8.1 Color Palette

Uses the yasmineOS palette from the reference design:

```typescript
const C = {
  // Backgrounds
  bg:       [0.145, 0.145, 0.149, 1],  // #252526
  bgAlt:    [0.176, 0.176, 0.188, 1],  // #2d2d30
  border:   [0.20,  0.20,  0.20,  1],  // #333333
  
  // Text
  text:     [0.80,  0.80,  0.80,  1],  // #cccccc
  textDim:  [0.53,  0.53,  0.53,  1],  // #888888
  head:     [0.94,  0.95,  0.97,  1],  // #eef0f4
  
  // Accents
  accent:   [0.00,  0.48,  0.80,  1],  // #007acc
  accent2:  [0.61,  0.30,  0.87,  1],  // #9d4edd
  success:  [0.25,  0.73,  0.31,  1],  // #3fb950
  danger:   [0.85,  0.33,  0.31,  1],  // #d9534f
  warn:     [0.94,  0.68,  0.31,  1],  // #f0ad4e
  
  // Semantic
  cyan:     [0.36,  0.85,  0.97,  1],
  gold:     [0.97,  0.73,  0.33,  1],
  green:    [0.30,  0.80,  0.40,  1],
  rose:     [0.93,  0.36,  0.34,  1],
  ink:      [0.85,  0.87,  0.91,  1],
  blue:     [0.40,  0.64,  1.0,  1],
};
```

### 8.2 Typography Hierarchy

| Element | Size | Weight | Color | Notes |
|---|---|---|---|---|
| App title / hero | 160px | 700 | head | Splash only |
| Chapter title | 40px | 650 | head | Left accent bar |
| Kicker | 13px | 600 | textDim | UPPERCASE, spaced |
| Body text | 19px | 400 | text | Multi-line |
| Equation | 24-40px | 400 | ink | MathTex island |
| Stat label | 12px | 600 | textDim | UPPERCASE |
| Stat value | 28px | 650 | head | |
| Caption | 12px | 400 | textDim | Below islands |
| Insight | 16px | 450 | text | Italic-inspired |

### 8.3 Spacing

- **Page padding**: 40px horizontal, 32px vertical (only for layout containment, no visual background)
- **Card padding** (when used inside a chapter): 24-30px
- **Row gap**: 16-26px (tighter for related content, wider for sections)
- **Column gap**: 8-16px (4px for closely stacked lines, 16px for sections)
- **Stat card**: 10px internal padding, 14px between stat cards

### 8.4 Component Styles (from reference design)

**Stat card**:
```
┌──────────────────┐
│  STAT LABEL      │  ← 10px uppercase, textDim
│  28.4k           │  ← 28px value, head
│  ┌── sparkline ─┐│  ← optional mini trend line
└──────────────────┘
```
`rect` with `fill: bgAlt`, `stroke: border, width: 1`, optional 4px left accent bar.

**Insight block**:
```
│  ┌─ 4px accent bar ──┐
│  │ Insight: the       │
│  │ key takeaway.      │
│  └────────────────────┘
```
`rect` with `fill: [0.16, 0.17, 0.19, 1]`, 4px left accent rect, 12px text.

**Chip / verdict row**:
```
┌────┐  ┌─────────────┐
│color│  label text    │
└────┘  └─────────────┘
```
10×24px color rect + 16px text in a flex row.

**Control bar**:
```
┌──────────────────────────────────────┐
│  [▸ Tour] [● Record]  │  ● Ready    │
│  ─────── buttons ─────  │  ─ status ─│
└──────────────────────────────────────┘
```
Buttons with icon + label, separator line, status LED + label.

---

## 9. Camera & Animation Guide

### 9.1 Gesture Library

| Gesture | Effect | When to use |
|---|---|---|
| `drop` | Zoom in from 1.8×, settle into position | Chapter openers |
| `sweep(dx)` | Slide in from the side (dx px offset) | Introducing islands |
| `rise(dy)` | Rise from below | Stats, data displays |
| `arc` | Gentle polar/orbit drift throughout the chapter | Immersive viewing |
| `pull` | Zoom in to 1.45× mid-chapter, then pull back | Highlighting detail |
| `dive({ into, zoom })` | Deep zoom into a specific point | Focus on a detail |
| `diveObj({ target, zoom })` | Deep zoom into a laid-out element | Focus that survives reflow |
| `trace({ target, zoom, d })` | Follow a glyph/curve outline at deep zoom | Proving smoothness |

### 9.2 Chapter Timing Template

```typescript
const chB = s.chapterPage('sine', { title, sub, at, dur: 12, noChrome: true });

// Phase 1: entrance (0s - 2.6s)
chB.cam.sweep();         // or drop / rise / arc

// Phase 2: settle + drift (2.6s - 6s)
// Content clips fade in during this period

// Phase 3: dive into detail (6s - 9s)
chB.cam.diveObj({ target: 'sine-plot', zoom: 3, hold: 0, d: 1.8 });

// Phase 4: hold + drift (9s - 11s)
// Auto-generated hold keyframe

// Phase 5: pull back for next chapter (11s - 12s)
// Auto-generated exit keyframe
```

### 9.3 Clip Timing

All clips are chapter-relative (added to `chB.start`):

```typescript
chB.clip.fadeIn('sine-copy', { start: 0, duration: 0.6 });
chB.clip.fadeIn('sine-plot', { start: 0.3, duration: 0.8 });
chB.clip.draw('sine-eq', { start: 1.5, duration: 1.5 });
```

### 9.4 Param Animations

```typescript
// Auto-sweep the number of harmonics through the chapter
chB.clip.param('numHarmonics', { start: 0, duration: 5, to: 7, ease: 'smoothstep' });
chB.clip.param('numHarmonics', { start: 5, duration: 5, to: 1, ease: 'smoothstep' });
```

---

## 10. Implementation Plan

### Phase 1: Infrastructure (estimate: 1-2 sessions)

1. **Add layout archetype methods** to `ChapterBuilder` (`heroCentered`, `splitNarrative`, `fullBleedVisual`, `dashboard`, `pipelineFlow`, `comparison`)
2. **Add reusable component methods** (`statRow`, `insightBlock`, `controlsBar`, `separator`)
3. **Add camera helpers** (`diveInto`, `sweepAcross`, `traceOutline`, `pullBack`)

### Phase 2: New Islands (estimate: 2-3 sessions)

1. **`xy-plot`** — the workhorse. Grid, axes, multiple traces, interactive probe
2. **`stem-plot`** — discrete spectrum bars with highlighting
3. **`slider`** — interactive horizontal slider
4. **`stat-card`** — reference-design metric display
5. **`insight-block`** — left-accent text block
6. **`controls-bar`** — button group + status display

### Phase 3: Fourier Explainer (estimate: 2 sessions)

1. Write `fourierScene.ts` with all 8 chapters
2. Wire up param-driven interactivity
3. Configure camera choreography
4. Add HUD peel chapter (reuse `hudDetach` system)

### Phase 4: Polish (estimate: 1 session)

1. Color palette pass (align with yasmineOS)
2. Typography pass
3. Animation timing pass
4. Test with `bun run dev`

---

## Visual Reference: Key Layout Mockups

### SplitNarrative (chapter 3: sine)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌────────────────────┐  ┌────────────────────────┐  │
│  │ ┌──┐               │  │                        │  │
│  │ │▐ │ SINE WAVES    │  │   ┌────────────────┐   │  │
│  │ └──┘               │  │   │                │   │  │
│  │ Every periodic     │  │   │   xy-plot      │   │  │
│  │ function can be    │  │   │   sine wave     │   │  │
│  │ decomposed into    │  │   │   f(t)          │   │  │
│  │ sine waves of      │  │   │                │   │  │
│  │ different...       │  │   │     ✦ drag     │   │  │
│  │                    │  │   └────────────────┘   │  │
│  │ f(t)=A·sin(2πf·t) │  │                        │  │
│  └────────────────────┘  └────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
     ^ copy card (bgAlt + border)     ^ no card, just island
```

### Dashboard (chapter 4: freq)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│   ┌────────────────────────────────────────────┐     │
│   │          [stem-plot: spectrum]             │     │
│   │  ██ ██ ██ ██ ██                           │     │
│   │  ██ ██ ██ ██ ██ ██                        │     │
│   │  ██ ██ ██ ██ ██ ██ ██                     │     │
│   │  1   3   5   7   9   freq                  │     │
│   └────────────────────────────────────────────┘     │
│                                                      │
│  ┌────────┐┌────────┐┌────────┐┌────────┐           │
│  │ f=1Hz  ││ f=3Hz  ││ f=5Hz  ││ f=7Hz  │           │
│  │ A=1.00 ││ A=0.33 ││ A=0.20 ││ A=0.14 │           │
│  └────────┘└────────┘└────────┘└────────┘           │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ Odd harmonics only — the square wave         │    │
│  │ contains no even frequencies.                │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### PipelineFlow (chapter 5: harmonics)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ │
│  │  f=1Hz   │  │  f=3Hz   │  │  f=5Hz   │  │ ...  │ │
│  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │  │      │ │
│  │  │\/  │  │  │  │\/  │  │  │  │\/  │  │  │      │ │
│  │  │/   │  │  │  │/   │  │  │  │/   │  │  │      │ │
│  │  └────┘  │  │  └────┘  │  │  └────┘  │  │      │ │
│  │  A=1.0   │→│  A=0.33  │→│  A=0.20  │→│  ...  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────┘ │
│                      ↓                              │
│   ┌────────────────────────────────────────────┐    │
│   │  [accumulated sum: live xy-plot]           │    │
│   │  ─── rising edge forming...                │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
└──────────────────────────────────────────────────────┘
     ^ each step card is a stat-card + mini sine preview
     ^ tap any to toggle, preview updates live
```

---

## Key Technical Decisions

1. **No new IR types needed** — all archetypes are combinators over `row`, `col`, `rect`, `text`, `island`, `math`. The `item` field carries `flexGrow`, `fill`, `minHeight` for layout control.

2. **noChrome: true by default** — pages become invisible layout grids. Cards are opt-in per content section, allowing the "floating panels on infinite canvas" look.

3. **Islands carry all interactivity** — `slider`, `xy-plot`, `stem-plot` are islands that read/write params. They handle their own drag/hover state. The runtime just dispatches pointer events to the active island.

4. **Camera tracks laid-out elements** — `fitObj` + `fitPoint` make dives robust against reflow and safe-area changes. No hardcoded world-coordinate offsets.

5. **HUD peel in any chapter** — the `hudDetach` system is reusable. Any chapter can include a `sm-slot` rect and drive `hudDetach` param from 0→1 to peel the HUD into its layout.

---

*This document is a design spec. The next step is Phase 1 implementation: build the layout archetype methods and new islands, then write `fourierScene.ts`.*
