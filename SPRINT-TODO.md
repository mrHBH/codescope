# Windfoil Authoring System — Master Task List (v2)

**This file is written for a fast, zero-decision executor.** Every task tells
you exactly what file to create or edit, exactly what to write, exactly what
command to run to verify, and exactly when to mark it done. If anything is
ambiguous, **STOP and ask the user** — do not guess. After each task, mark its
checkbox `[x]`.

**Context document:** Read `SPRINT.md` (in this same directory) for the
architecture, the full SceneDoc schema, the island contract, camera gesture
compilation rules, timeline semantics, and the file map. **The schema in
SPRINT.md §2 is canonical** — do not add or remove fields from it.

---

## 0. Execution protocol (HARD RULES — read this first)

1. **Read before you write.** Every phase lists a "Required reading" section.
   Read those files fully before creating any new code. The `Reuse table`
   below shows exactly which existing modules to import.
2. **Never overwrite an existing file.** Use the `edit` tool (targeted
   replacements). For new files, use `write`. After every edit, run `grep`
   for accidental duplicate `function` or `export` definitions in that file.
3. **One task at a time.** Run verification after each task BEFORE starting
   the next. Only when `Verify` passes and `Done-when` is satisfied, mark
   the checkbox `[x]` and move on.
4. **Typecheck after EVERY task that modifies `.ts` files:**
   `bunx tsc --noEmit`. Fix all errors before proceeding. Never suppress
   errors with `any` or `@ts-ignore`.
5. **Visual checkpoints belong to the user.** When a task says `CHECKPOINT:`,
   tell the user to open the given URL and visually confirm the described
   behavior. The user owns visual testing. Do not skip checkpoints.
6. **No git commits.** The user handles git.
7. **No new npm dependencies.** Reuse modules in the Reuse table. If you
   think a dependency is needed, ask first.
8. **No scope creep.** Do not refactor, clean up, improve, or add helper
   functions beyond what the task explicitly says. Do not touch files
   outside the "Files to create/edit" list for that task.
9. **Match existing code style.** Use `// ── Title ──` header comments, terse
   single-purpose functions, no-extension TS imports (e.g.
   `import { foo } from '../../windgraph/anim/easing'` not `'./easing.js'`).
10. **Import the exact modules listed.** The `Reuse table` tells you exactly
    what to import. Do not import from different paths or reimplement
    existing functions.

---

## Reuse table — existing modules (import these, do NOT reimplement them)

| What | Import from | Key exports / usage |
|---|---|---|
| Easing functions | `../../windgraph/anim/easing` | `linear, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeInOutCubic, easeInQuint, easeOutQuint, easeInOutQuint, smoothstep, smootherstep, easeInSine, easeOutSine, easeInOutSine, easeOutBack, easeOutElastic, easeOutBounce, rushInto, rushFrom`, `clamp01` |
| Stroke engine | `../../windgraph/stroke/stroke` | `strokeInto`, `strokeQuadPath`, `fillQuads`, `polygonQuads`, `circleQuads`, `Pt`, `StrokeStyle` |
| Text layout | `../../layout/metrics` | `addRect`, `layoutStr`, `tw` |
| Glyph quads | `../../windfoil/font` | `glyphQuads`, `FontFace` |
| Emit cache | `../../windfoil/emitCache` | `EmitCache` — `run(sig, inst, crv, rws, build)` |
| Math rendering | `../../windgraph/math/mathtex` | `MathTex` — `new MathTex(latex)`, `.emit(atlas, inst, crv, rws, {x,y,size,color,opacity?,reveal?,anchor?})`, `MathEmitOpts` |
| AppState + board slot | `../../state` | `AppState`; `s.interactive` field (contract at `state.ts:137-146`) |
| Camera: orbit | `../../camera/orbit` | `orbitDistForZoom`, `orbitSetPose`, `updateOrbit`, `enterOrbit`, `disableOrbit`, `isEnabled`, `orbitScale` |
| Camera: 3D enter | `../../camera/camera` | `enter3D`, `exit3D`, `cameraScale`, `stepCamera` |
| Demo scaffold | `../app` | `createBaseApp(engine, useDoc)`, `finishApp(s, onBack, extras)`, `snapTo(s, x, y, z)` |
| Demo registry | `../demos` | `DEMOS`, `Demo` (interface with `id, name, blurb, boot`) |
| AppState factory | `../../state` | `createAppState(partial)` |
| Static buffers | `../../precompute` | `buildStatic(s)` |
| Taffy layout | `../../taffy/taffy` | `taffy`, `TaffyLayout`, `StyleProps`, `LayoutResult` |
| Timeline HUD (DOM) | `../timelineHud` | `createTimelineHud(opts)` → `{el, setVisible, setItems, setProgress01, setActive, setTimeLabel, onScrub}`, `TimelineHudItem` |
| Terminal | `../../editor/terminal` | `Terminal` — `setCommandHandler(handler: (raw: string, term: Terminal) => boolean)`, `writeLine(text)`, `TerminalCommandHandler` |

---

## Command reference

```bash
bun run dev           # Start Vite dev server on port 3000
bunx tsc --noEmit     # Typecheck (run after EVERY task)
bun src/path/__test_file.ts   # Run a Bun test script (uses the taffy __test pattern)
```

---

## Phase 1 — IR Foundation + Serialization

**Goal:** Types, validation, serialize/deserialize, round-trip test.
Nothing renders yet.

**Required reading before starting:** SPRINT.md §1-2, `src/taffy/__test.ts`
(to understand the Bun test script pattern), `src/windgraph/anim/easing.ts`
(all easing exports), `src/windgraph/stroke/stroke.ts` (exports).

---

### P1-001 — Create `src/authoring/ir/types.ts`

**Files to create:** `src/authoring/ir/types.ts`

**What to write:**
- Copy the complete types from SPRINT.md §2 (SceneDoc, all ObjectSpec subtypes,
  Vec2, Color, ParamDef, ParamRef, ClipSpec, EasingName, CameraTrack,
  CameraKeyframe, LayoutSpec, Stroke).
- `EasingName` is a **string literal union type** of exactly the 21 easing
  function names exported from `src/windgraph/anim/easing.ts` (listed in the
  Reuse table).
- Export everything.

**Verify:** `bunx tsc --noEmit` passes (types defined, no logic to error).

**Done-when:** `src/authoring/ir/types.ts` exists with all interfaces/types
exported; typecheck clean.

---

### P1-002 — Create `src/authoring/ir/validate.ts`

**Files to create:** `src/authoring/ir/validate.ts`

**What to write:** Export a single function:

```ts
export function validateSceneDoc(
  doc: unknown,
  knownIslandIds?: Set<string>,
): string[]
```

Returns an array of human-readable error messages. Empty array = valid. Checks
in this exact order:

1. `doc` is an object.
2. `doc.version === 1`.
3. `doc.meta` is an object with `meta.title` a non-empty string.
4. `doc.objects` is a plain object (not null, not array, constructor === Object).
5. For each `[key, spec]` in `objects`:
   - `spec` is an object with `id === key` (exact match).
   - `spec.kind` is one of `'text','glyph','rect','circle','polygon','line','math','group','island'`.
   - Per-kind required fields exist with correct types (see table below).
   - `opacity` if present is a number in `[0, 1]`.
   - `visible` if present is a boolean.
   - `at` (or `center` for circle) is `Vec2`: array of 2 finite numbers.
   - `Color` fields are arrays of 4 numbers in [0, 1].
   - `size` for rect is Vec2.
   - `points` for polygon/line is array of Vec2 (at least 2 for line, 3 for polygon).
   - `children` for group is array of strings.
   - `island` for island is a non-empty string.
   - For group: no duplicate child ids within a single group.
6. No group cycles (DFS from root groups — groups NOT in any `children` array).
   Check: every child id exists in `objects`.
7. `doc.params` is a plain object. For each value:
   - `kind` is `'number'|'boolean'|'point'|'color'`.
   - `label` is a string.
   - `default` matches the kind's ParamValue type.
   - number: `min <= default <= max` if present; `step > 0` if present.
   - point default: Vec2.
   - color default: Color.
8. `doc.clips` is an array. For each clip:
   - `id` non-empty string.
   - `target` non-empty string.
   - `kind` is one of the 9 ClipSpec kind strings.
   - `start` >= 0 and is finite; `duration` > 0 and is finite.
   - `ease` if present is one of the 21 EasingName values (exact string match).
   - `props` is an object (any shape — invalid props caught by the kind's
     runtime evaluation, validated here conservatively).
9. `doc.camera` is an object; `camera.keyframes` is an array sorted
   non-decreasing by `time`. For each keyframe:
   - `time` finite >= 0.
   - Either (`center` is Vec2 AND `zoom` > 0 AND `zoom` finite) OR
     (`fit` is a string).
   - `offset` if present is Vec2.
   - `zoomMul` if present > 0 and finite.
   - `polar` if present is finite; `azimuth` if present is finite.
   - `ease` if present is a valid EasingName.
   - `drift` if present is an object; its `*Amp` numbers are finite;
     its `*Period` numbers > 0 and finite.
10. Referential integrity:
    - Every clip `target` exists as a key in `objects`, OR matches
      `param:<name>` where `<name>` is a key in `params`.
    - Every group `children` id exists in `objects`.
    - Every `fit` CameraKeyframe references an id in `objects` whose spec is
      a `group` with `chapter` meta and `size` (fit only works on chapter groups).
    - Deep-walk every spec's `.params` (island params), every field — if a value
      is an object with a `$param` key, the value string must be a key in `params`.
    - Every island spec's `island` must be in `knownIslandIds` (if the set is
      provided; if not provided, skip this check — the caller decides).

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** `validate.ts` exists, typecheck clean. A test file in the next
task will exercise it.

---

### P1-003 — Create `src/authoring/ir/serialize.ts`

**Files to create:** `src/authoring/ir/serialize.ts`

**What to write:**
```ts
export function serialize(doc: SceneDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function deserialize(json: string, knownIslandIds?: Set<string>): SceneDoc {
  const parsed = JSON.parse(json);
  const errors = validateSceneDoc(parsed, knownIslandIds);
  if (errors.length > 0) {
    throw new Error('Invalid SceneDoc:\n' + errors.map(e => '  - ' + e).join('\n'));
  }
  return parsed as SceneDoc;
}
```

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean.

---

### P1-004 — Create `src/authoring/ir/__test_ir.ts`

**Files to create:** `src/authoring/ir/__test_ir.ts`

**What to write:**
- Pattern: copy the test structure from `src/taffy/__test.ts` (the `test(name, fn)` helper, `assert(cond, msg)`, `let passed/failed`, top-level `await`).
- At the top of the file, AFTER the imports, call `console.log('SceneDoc IR tests\n')`.
- Import `validateSceneDoc` from `./validate` and `serialize`/`deserialize` from `./serialize`.
- Write this exact test list:

Test 1 — "validate rejects non-object": call validate(42); assert errors.length > 0.

Test 2 — "validate rejects missing version": validate({}); assert error about version.

Test 3 — "validate rejects invalid kind": build a minimal doc with `objects: { x: { id: 'x', kind: 'bogus' as any } }` (and other required fields); assert error about kind.

Test 4 — "validate passes a minimal valid doc": construct this exact doc:
```ts
const minimalDoc = {
  version: 1,
  meta: { title: 'test' },
  objects: {
    r1: { kind: 'rect', id: 'r1', at: [0, 0], size: [100, 80], fill: [1, 0, 0, 1] },
  },
  params: {},
  clips: [],
  camera: { keyframes: [] },
};
```
assert `validateSceneDoc(minimalDoc)` returns empty array.

Test 5 — "validate catches wrong number of values in Vec2": objects.r1.at = [0, 0, 0]; assert error.

Test 6 — "validate catches NaN in param default": params: { n: { kind:'number', default:NaN } }; assert error.

Test 7 — "validate catches clip target missing": clip target 'nonexistent'; assert error.

Test 8 — "validate catches invalid ease name": clip ease 'bogusEase'; assert error.

Test 9 — "validate catches group cycle": objects { g: {kind:'group',... children:['g']} }; assert cycle error.

Test 10 — "validate catches clip negative start": starting at -1; assert error.

Test 11 — "validate catches param ref to missing param": island with params { x: { $param: 'nope' } }; assert error.

Test 12 — "validate catches fit on non-chapter": camera keyframe `fit` pointing to a rect, not a group with chapter; assert error.

Test 13 — "validate catches camera keyframes out of time order": two keyframes with times [2, 1]; assert error.

Test 14 — "validate all 9 object kinds": construct a doc with one object of each kind (text, glyph, rect, circle, polygon, line, math, group with one child, island — for island validation, use `knownIslandIds: new Set(['test-isl'])`). Validation must pass.

Test 15 — "serialize/deserialize round-trip": serialize(minimalDoc), then `deserialize(result)`. Assert `deserialized.meta.title === minimalDoc.meta.title` and `deserialized.objects.r1.size[0] === 100`.

- At end of file: `console.log(\`\n${passed} passed, ${failed} failed\`);`
  `if (failed > 0) throw new Error(\`${failed} tests failed\`);`
- `test` and `assert` are local functions defined in the script (NOT imported).

**Verify:** `bun src/authoring/ir/__test_ir.ts` — all tests pass.
Then `bunx tsc --noEmit` passes.

**Done-when:** All 15 tests pass + typecheck clean.

---

### P1-005 — Create `src/authoring/ir/index.ts`

**Files to create:** `src/authoring/ir/index.ts`

**What to write:** Barrel re-export:
```ts
export * from './types';
export { validateSceneDoc } from './validate';
export { serialize, deserialize } from './serialize';
```

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean.

---

### P1-006 — P1 checkpoint

- [ ] All 5 tasks above have `[x]`.
- [ ] `bun src/authoring/ir/__test_ir.ts` passes all 15 tests.
- [ ] `bunx tsc --noEmit` passes clean.

---

## Phase 2 — Builder API

**Goal:** Declarative TS builder producing valid SceneDoc. Test scene.

**Required reading:** SPRINT.md §7 (Builder API sketch), SPRINT.md §2 (schema),
SPRINT.md §5 (camera gesture compile table — you will implement these).

---

### P2-001 — Create `src/authoring/builder/scene.ts`

**Files to create:** `src/authoring/builder/scene.ts`

**What to write:** The `scene()` function and builder classes. Exact implementation:

```ts
import type { SceneDoc, ObjectSpec, ClipSpec, CameraKeyframe, CameraTrack,
  GroupSpec, Vec2, Color, ParamDef, ParamRef, EasingName } from '../ir/types';
import { validateSceneDoc } from '../ir/validate';

// ── Builder class ─────────────────────────────────────────────────────────
export class SceneBuilder {
  private doc: SceneDoc;
  private idCounter = new Map<string, number>(); // base→count for auto-id

  constructor(meta: { title: string }) {
    this.doc = { version: 1, meta: { ...meta }, objects: {}, params: {}, clips: [], camera: { keyframes: [] } };
  }

  private uid(base: string): string {
    const n = this.idCounter.get(base) ?? 0;
    this.idCounter.set(base, n + 1);
    return `${base}_${n}`;
  }

  private assertUnique(id: string) {
    if (this.doc.objects[id]) throw new Error(`Duplicate object id: ${id}`);
  }

  // ── Params ──────────────────────────────────────────────────────────────
  param = {
    number: (id: string, def: { default: number; min?: number; max?: number; step?: number; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'number' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    point: (id: string, def: { default: Vec2; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'point' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    boolean: (id: string, def: { default: boolean; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'boolean' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    color: (id: string, def: { default: Color; label?: string }) => {
      this.doc.params[id] = { ...def, kind: 'color' as const, label: def.label ?? id };
      return { ref: (): ParamRef => ({ $param: id }) };
    },
    ref: (id: string): ParamRef => ({ $param: id }),
  };

  // ── Chapter builder ─────────────────────────────────────────────────────
  chapter(id: string, opts: { title: string; sub: string; at: Vec2; dur: number; size?: Vec2 }): ChapterBuilder {
    const grpId = id;
    const size = opts.size ?? [1260, 820];
    this.assertUnique(grpId);
    const grp: GroupSpec = { kind: 'group', id: grpId, at: opts.at, size, children: [], chapter: { title: opts.title, sub: opts.sub, duration: opts.dur } };
    this.doc.objects[grpId] = grp;
    return new ChapterBuilder(this, grpId, opts.at, size);
  }

  // ── Top-level camera keyframes ──────────────────────────────────────────
  cam = { keyframe: (time: number, pose: { center?: Vec2; zoom?: number; fit?: string; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
    this.doc.camera.keyframes.push({ time, ...pose });
  } };

  // ── Top-level clips (absolute start) ────────────────────────────────────
  clip = { add: (clip: ClipSpec) => { this.doc.clips.push(clip); } };

  // ── Top-level objects (chapter-less) ────────────────────────────────────
  addSpec(spec: ObjectSpec): this {
    this.assertUnique(spec.id);
    this.doc.objects[spec.id] = spec;
    return this;
  }

  build(): SceneDoc {
    // Sort camera keyframes by time (they may be added out of order).
    this.doc.camera.keyframes.sort((a, b) => a.time - b.time);
    const errors = validateSceneDoc(this.doc);
    if (errors.length > 0) {
      throw new Error('Invalid SceneDoc:\n' + errors.map(e => '  - ' + e).join('\n'));
    }
    return this.doc;
  }
}

// ── Chapter builder ────────────────────────────────────────────────────────
export class ChapterBuilder {
  // start time is undefined until set by the caller; 0 by default.
  start = 0;

  constructor(
    private s: SceneBuilder,
    private grpId: string,
    private origin: Vec2,
    private chSize: Vec2,
  ) {}

  private abs(p: Vec2): Vec2 { return [p[0] + this.origin[0], p[1] + this.origin[1]]; }

  // Object builder methods — each adds a spec with chapter-relative `at` → absolute
  text(id: string | null, content: string, opts: { at: Vec2; size: number; color: Color; weight?: number; align?: 'left'|'center'|'right'; opacity?: number }) {
    const oid = id ?? this.s['uid']('text');
    this.s.addSpec({ kind: 'text', id: oid, content, at: this.abs(opts.at), size: opts.size, color: opts.color, weight: opts.weight, align: opts.align, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  glyph(id: string | null, char: string, opts: { at: Vec2; size: number; color: Color; opacity?: number }) {
    const oid = id ?? this.s['uid']('glyph');
    this.s.addSpec({ kind: 'glyph', id: oid, char, at: this.abs(opts.at), size: opts.size, color: opts.color, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  rect(id: string | null, opts: { at: Vec2; size: Vec2; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? this.s['uid']('rect');
    this.s.addSpec({ kind: 'rect', id: oid, at: this.abs(opts.at), size: opts.size, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  circle(id: string | null, opts: { center: Vec2; radius: number; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? this.s['uid']('circle');
    this.s.addSpec({ kind: 'circle', id: oid, center: this.abs(opts.center), radius: opts.radius, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  polygon(id: string | null, points: Vec2[], opts: { closed?: boolean; fill?: Color; stroke?: { color: Color; width: number }; opacity?: number }) {
    const oid = id ?? this.s['uid']('polygon');
    this.s.addSpec({ kind: 'polygon', id: oid, points: points.map(p => this.abs(p)), closed: opts.closed, fill: opts.fill, stroke: opts.stroke, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  line(id: string | null, pts: Vec2[], opts: { width: number; color: Color; dash?: number[]; opacity?: number }) {
    const oid = id ?? this.s['uid']('line');
    this.s.addSpec({ kind: 'line', id: oid, points: pts.map(p => this.abs(p)), width: opts.width, color: opts.color, dash: opts.dash, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  math(id: string | null, latex: string, opts: { at: Vec2; size: number; color: Color; opacity?: number }) {
    const oid = id ?? this.s['uid']('math');
    this.s.addSpec({ kind: 'math', id: oid, latex, at: this.abs(opts.at), size: opts.size, color: opts.color, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  island(id: string | null, islandId: string, opts: { at: Vec2; size?: Vec2; params?: Record<string, any>; opacity?: number }) {
    const oid = id ?? this.s['uid']('island');
    this.s.addSpec({ kind: 'island', id: oid, island: islandId, at: this.abs(opts.at), size: opts.size, params: opts.params, opacity: opts.opacity });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return oid;
  }

  // ── Sub-group ───────────────────────────────────────────────────────────
  group(id: string | null, opts: { at?: Vec2 }): ChapterBuilder {
    const oid = id ?? this.s['uid']('group');
    this.s.addSpec({ kind: 'group', id: oid, at: this.abs(opts.at ?? [0, 0]), size: undefined, children: [] });
    this.s.doc.objects[this.grpId].children!.push(oid);
    return new ChapterBuilder(this.s, oid, this.abs(opts.at ?? [0, 0]), this.chSize);
  }

  // ── Camera gestures ─────────────────────────────────────────────────────
  cam = {
    moveTo: (t: number, pose: { center?: Vec2; zoom?: number; fit?: string; offset?: Vec2; zoomMul?: number; polar?: number; azimuth?: number; ease?: EasingName; drift?: any }) => {
      this.s.doc.camera.keyframes.push({ time: this.start + t, ...pose });
    },
    drop: (d = 2.6) => {
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, zoomMul: 1.8, ease: 'easeInOutCubic' });
      this.s.doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    sweep: (d = 2.6, dx = 340) => {
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, offset: [-dx, 0], ease: 'easeInOutCubic' });
      this.s.doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    rise: (d = 2.6, dy = 260) => {
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, offset: [0, -dy], ease: 'easeInOutCubic' });
      this.s.doc.camera.keyframes.push({ time: this.start + d, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    arc: (azAmp = 0.16, xAmp = 12, period = 12.566) => {
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic', drift: { azAmp, xAmp, azPeriod: period, xPeriod: period } });
    },
    pull: () => {
      const dur = this.chapterDur();
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      this.s.doc.camera.keyframes.push({ time: this.start + dur / 2, fit: this.grpId, zoomMul: 1.45, ease: 'smoothstep' });
      this.s.doc.camera.keyframes.push({ time: this.start + dur, fit: this.grpId, ease: 'smoothstep', drift: { xAmp: 6, yAmp: 4, xPeriod: 14.96, yPeriod: 17.45 } });
    },
    dive: (opts: { into: Vec2; zoom: number; hold?: number; d?: number }) => {
      const h = opts.hold ?? 3.2, d = opts.d ?? 2.2;
      const grp = this.s.doc.objects[this.grpId] as GroupSpec;
      const cw = grp.size?.[0] ?? 1260, ch = grp.size?.[1] ?? 820;
      const diveCenter: Vec2 = [grp.at[0] + opts.into[0] * cw, grp.at[1] + opts.into[1] * ch];
      const off: Vec2 = [diveCenter[0] - (grp.at[0] + cw / 2), diveCenter[1] - (grp.at[1] + ch / 2)];
      this.s.doc.camera.keyframes.push({ time: this.start, fit: this.grpId, ease: 'easeInOutCubic' });
      this.s.doc.camera.keyframes.push({ time: this.start + h, fit: this.grpId, ease: 'smoothstep' }); // hold
      this.s.doc.camera.keyframes.push({ time: this.start + h + d, fit: this.grpId, offset: off, zoomMul: 1 + opts.zoom, ease: 'smoothstep' });
    },
    hold: (t: number) => {
      this.s.doc.camera.keyframes.push({ time: this.start + t, fit: this.grpId, ease: 'smoothstep' });
    },
  };

  // ── Clips (chapter-relative start → absolute) ───────────────────────────
  clip = {
    fadeIn: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'fadeIn', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    fadeOut: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'fadeOut', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    draw: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'draw', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    write: (target: string, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'write', start: this.start + o.start, duration: o.duration, ease: o.ease, props: {} });
    },
    moveTo: (target: string, to: Vec2, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'moveTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { x: to[0], y: to[1] } });
    },
    scaleTo: (target: string, x: number, y: number, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'scaleTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { x, y } });
    },
    rotateTo: (target: string, deg: number, o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'rotateTo', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { deg } });
    },
    morph: (target: string, pts: Vec2[], o: { start: number; duration: number; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target, kind: 'morph', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { points: pts } });
    },
    param: (name: string, o: { start: number; duration: number; to: number | boolean | Vec2 | Color; ease?: EasingName }) => {
      this.s.doc.clips.push({ id: this.s['uid']('clip'), target: 'param:' + name, kind: 'param', start: this.start + o.start, duration: o.duration, ease: o.ease, props: { to: o.to } });
    },
  };

  private chapterDur(): number {
    return (this.s.doc.objects[this.grpId] as GroupSpec)?.chapter?.duration ?? 10;
  }
}

// ── Top-level convenience ─────────────────────────────────────────────────
export function scene(meta: { title: string }, fn: (s: SceneBuilder) => void): SceneDoc {
  const s = new SceneBuilder(meta);
  fn(s);
  return s.build();
}
```

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean.

---

### P2-002 — Create `src/authoring/builder/helpers.ts`

**Files to create:** `src/authoring/builder/helpers.ts`

**What to write:** Copy these functions from `src/playground/explainer.ts`
(identical implementations, export):

```ts
export function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v: number) { return clamp(v, 0, 1); }
export function smooth(v: number) { v = clamp01(v); return v * v * (3 - 2 * v); }
export function bump(v: number) { return Math.sin(clamp01(v) * Math.PI); }
export function rgba(c: number[], a = 1): number[] { return [c[0], c[1], c[2], (c[3] ?? 1) * a]; }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function loop01(t: number, period: number, phase = 0) { return ((t / period + phase) % 1 + 1) % 1; }
export function ping(t: number, period: number, phase = 0) { return 0.5 - 0.5 * Math.cos(loop01(t, period, phase) * Math.PI * 2); }
export function starPoints(cx: number, cy: number, R: number, rot = -Math.PI / 2): [number, number][] {
  const p: [number, number][] = [];
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5; const r = i % 2 ? R * 0.42 : R; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
}
```

Note: Use `[number, number][]` for Pt (Vec2).

**Verify:** `bunx tsc --noEmit` passes.

**Done-when:** typecheck clean.

---

### P2-003 — Create `src/authoring/builder/__test_builder.ts`

**Files to create:** `src/authoring/builder/__test_builder.ts`

**What to write:**
- Use the same test pattern as P1-006 (copy helper from `__test_ir.ts`).
- Import `scene` from `./scene` and `validateSceneDoc` from `../ir/validate`.
- Tests:

Test 1 — "builds minimal valid doc": call `scene({title:'t'}, s => {})`, assert `validateSceneDoc(doc)` returns empty.

Test 2 — "one chapter with title": scene doc with one chapter; assert `doc.objects.ch0.chapter.title === 'My Chapter'`.

Test 3 — "chapter with text child": chapter with `ch.text('t0', 'Hello', {at:[50,80],size:20,color:[1,1,1,1]})`; assert object exists, at is absolute (chapter.at + [50,80]), children array includes the text id.

Test 4 — "build validates and throws on duplicate ids": two objects with same explicit id → `build()` throws.

Test 5 — "camera gestures produce keyframes": chapter with `.cam.dive({into:[0.5,0.5],zoom:9})`; assert at least 3 keyframes produced; times are >= chapter.start.

Test 6 — "chapter clip timing": chapter with clip `.clip.fadeIn('t0', {start:0, duration:1})`; assert clip.start === chapter.start; correct kind.

Test 7 — "param and param ref": `s.param.number('r', {default:0.5})`, then island with `params:{x: s.param.ref('r')}`; assert `doc.params.r.default === 0.5`; assert island params.x.$param === 'r'.

Test 8 — "validateSceneDoc catches invalid doc from builder (negative clip)": construct a SceneDoc by hand (not via builder) with a clip.start = -5; assert validate returns non-empty errors.

**Verify:** `bun src/authoring/builder/__test_builder.ts` — all tests pass.
Then `bunx tsc --noEmit`.

**Done-when:** All 8 tests pass + typecheck clean.

---

### P2-004 — Create `src/authoring/builder/index.ts`

**Files to create:** `src/authoring/builder/index.ts`

**What to write:**
```ts
export { scene, SceneBuilder, ChapterBuilder } from './scene';
export * from './helpers';
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

### P2-005 — P2 checkpoint

- [ ] All P2 tasks `[x]`.
- [ ] `bun src/authoring/builder/__test_builder.ts` all green.
- [ ] `bunx tsc --noEmit` clean.

---

## Phase 3 — Runtime + Smoke Demo

**Goal:** SceneDoc → pixels through the existing `s.interactive` slot.
Sample scene plays in `/#authoring` demo.

**Required reading:** SPRINT.md §6 (Runtime), `src/state.ts:137-146`
(interactive contract), `src/playground/explainer.ts:134-175` (ExplainerBoard
methods to mirror), `src/playground/explainer.ts:177-219` (bootExplainer to
mirror), `src/playground/app.ts`, `src/playground/demos.ts`.

---

### P3-001 — Create draw helpers `src/authoring/islands/draw.ts`

**Files to create:** `src/authoring/islands/draw.ts`

**What to write:** Extract the emission helper functions from
`src/playground/explainer.ts` into a **DrawHelper class/namespace** that both
the runtime AND islands use. Create forwarding wrappers that take an emit
context object instead of separate `(ctx, ...)` args. Exact functions:

```ts
import type { FontFace } from '../../windfoil/font';
import { glyphQuads } from '../../windfoil/font';
import { addRect, layoutStr, tw } from '../../layout/metrics';
import { fillQuads, strokeInto, strokeQuadPath, polygonQuads, circleQuads, type Pt } from '../../windgraph/stroke/stroke';

export interface EmitBuffers { inst: number[]; crv: number[]; rws: number[]; }
export interface DrawCtx { font: FontFace; atlas: any; buff: EmitBuffers; }

export class DrawHelpers {
  constructor(private ctx: DrawCtx) {}

  /** Emit text with size, color, optional anchor. */
  text(s: string, x: number, y: number, size: number, color: number[] = [1,1,1,1], alpha = 1, anchor: 'start'|'middle'|'end' = 'start') {
    let tx = x;
    if (anchor !== 'start') { const w = tw(s, this.ctx.font, size); tx -= anchor === 'middle' ? w / 2 : w; }
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color, alpha];
    layoutStr(this.ctx.buff.inst, s, c, this.ctx.atlas.table, this.ctx.font, { x: tx, y, size });
  }

  /** Stroked line through a point array. */
  line(pts: Pt[], color: number[], width = 3, alpha = 1, dash?: number[]) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    strokeInto(pts, { width, cap: 'round', join: 'round', dash }, c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  /** Filled axis-aligned rect. */
  rect(x0: number, y0: number, x1: number, y1: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    addRect(x0, y0, x1, y1, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  /** Stroked rect outline. */
  rectStroke(x0: number, y0: number, x1: number, y1: number, color: number[], width = 2, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    const h = width / 2;
    addRect(x0 - h, y0 - h, x1 + h, y0 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(x1 - h, y0 - h, x1 + h, y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(x0 - h, y1 - h, x1 + h, y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
    addRect(x0 - h, y0 - h, x0 + h, y1 + h, c, this.ctx.buff.crv, this.ctx.buff.rws, this.ctx.buff.inst);
  }

  /** Filled polygon. */
  fillPoly(pts: Pt[], color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    fillQuads(polygonQuads(pts, true), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  /** Filled circle. */
  fillCircle(x: number, y: number, r: number, color: number[], alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    fillQuads(circleQuads(x, y, r, 16), c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  /** Stroked circle outline. */
  strokeCircle(x: number, y: number, r: number, color: number[], width = 3, alpha = 1) {
    const c = color.length === 4 ? [color[0], color[1], color[2], color[3] * alpha] : [...color.slice(0,3), alpha * (color[3] ?? 1)];
    const q: number[] = [];
    strokeQuadPath(circleQuads(x, y, r, 14), { width, cap: 'round', join: 'round' }, true, q);
    fillQuads(q, c, this.ctx.buff.inst, this.ctx.buff.crv, this.ctx.buff.rws);
  }

  /** Arrow from (x0,y0) to (x1,y1). */
  arrow(x0: number, y0: number, x1: number, y1: number, color: number[], width = 4, alpha = 1): void {
    this.line([[x0,y0],[x1,y1]], color, width, alpha);
    const a = Math.atan2(y1 - y0, x1 - x0), l = width * 5, w = width * 3.2;
    this.fillPoly([
      [x1, y1],
      [x1 - Math.cos(a)*l + Math.sin(a)*w, y1 - Math.sin(a)*l - Math.cos(a)*w],
      [x1 - Math.cos(a)*l - Math.sin(a)*w, y1 - Math.sin(a)*l + Math.cos(a)*w],
    ], color, alpha);
  }

  /** Draggable handle circle. */
  handle(x: number, y: number, hot: boolean, alpha = 1) {
    if (hot) {
      this.fillCircle(x, y, 12, [0.97, 0.73, 0.33, 1], alpha);
      this.strokeCircle(x, y, 18, [0.97, 0.73, 0.33, 1], 2, alpha * 0.75);
    } else {
      this.fillCircle(x, y, 9, [0.30, 0.80, 0.40, 1], alpha);
      this.strokeCircle(x, y, 14, [0.30, 0.80, 0.40, 1], 2, alpha * 0.75);
    }
  }
}
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean.

---

### P3-002 — Create `src/authoring/runtime/timeline.ts`

**Files to create:** `src/authoring/runtime/timeline.ts`

**What to write:** Pure functions for timeline evaluation. Import easing
functions from `../../windgraph/anim/easing`. Import types from `../ir/types`.

**Exact exports:**

```ts
import { clamp01, smoothstep } from '../../windgraph/anim/easing';
import type { SceneDoc, ClipSpec, CameraKeyframe, CameraTrack, Vec2, EasingName } from '../ir/types';

// ── Chapter windows ───────────────────────────────────────────────────────
export interface ChapterWindow { id: string; start: number; duration: number; title: string; sub: string; }
export function chapterWindows(doc: SceneDoc): ChapterWindow[] {
  const chapters: ChapterWindow[] = [];
  let acc = 0;
  for (const [id, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group' && spec.chapter) {
      chapters.push({ id, start: acc, duration: spec.chapter.duration, title: spec.chapter.title, sub: spec.chapter.sub });
      acc += spec.chapter.duration;
    }
  }
  return chapters;
}

export function docDuration(doc: SceneDoc): number {
  let d = 0;
  for (const [id, spec] of Object.entries(doc.objects)) {
    if (spec.kind === 'group' && spec.chapter) d += spec.chapter.duration;
  }
  return d;
}

// ── Easing name → function (exact match, lower-camel) ────────────────────
function getEasing(name: EasingName | undefined): (t: number) => number {
  // This function lazily imports at call time? No — import all statically.
  // Map is constructed with all 21 names from easing.ts (listed in Reuse table).
  // (...implementation: a switch or Map — do the Map approach; import every easing by name)
  // DEFAULT: smoothstep.
  // (Any name not in the union type is caught at validation time by validate.ts.)
}

// ── Frame state ───────────────────────────────────────────────────────────
export interface ObjFrame {
  opacityMult: number;  // 0..1 (clip-driven)
  reveal: number;       // 0..1 (draw/write clip)
  dx: number; dy: number;          // moveTo offset in world px
  scaleX: number; scaleY: number;  // scaleTo multipliers
  rotation: number;                // degrees (rotateTo)
  chars: number;                   // write-reveal character count (0..len)
  visible: boolean;                // fadeOut may set false
}

export interface FrameState {
  objects: Map<string, ObjFrame>;
  params: Map<string, number | boolean | Vec2 | Color>;
  chapters: Map<string, { alpha: number; local: number }>;
}

/** Evaluate scene at absolute time t. Default paramValues from doc.params.defaults; can be overridden. */
export function evalScene(doc: SceneDoc, t: number, paramOverrides?: Map<string, any>): FrameState {
  // Algorithm per SPRINT.md §4. Implement steps:
  // 1. Resolve live param values: defaults + paramOverrides (animated param clips are in the clip list — evaluate them).
  // 2. Chapter windows → compute alpha_i(t) for each chapter (smoothstep fade-in, never decreases).
  // 3. Per-object frame properties via clip evaluation (rules in SPRINT.md §4).
  // 4. Return FrameState.
  // (...full implementation)
}
```

**The exact algorithm for clip evaluation (implement this verbatim):**

```
For each object id O:
  props = default ObjFrame (opacityMult=1, reveal=1, dx=0, dy=0, scaleX=1, scaleY=1, rotation=0, chars=0, visible=true)
  For each property in [opacity, reveal, dx, dy, scaleX, scaleY, rotation, chars, visible, morphPoints]:
    Collect clips on (target=O, kind maps to this property) sorted by start
    Find the driver clip D = last with start <= t
    If D exists:
      local = t - D.start
      progress = clamp01(local / D.duration)
      eased = easing(D.ease)(progress)
      to = D.props
      from = previous clip's END value for this property (or base if no previous)
      value = lerp(from, to, eased)  // for scalar
      // For moveTo: (dx,dy) = (to.x - fromX, to.y - fromY) * eased (absolute: current pos = from + (to-from)*eased; offset = current - base)
      // Actually store the absolute value? Frame state stores OFFSET from doc spec (dx,dy). Base = spec.at (handle at runtime).
      // Implement: store the absolute delta from the spec's original value? No — the runtime adds dx to spec.at.
      // Simpler: build "current absolute value" for each property, then store offsets relative to spec defaults.
```

**IMPORTANT for the executor:** The above is pseudocode. I realize this algorithm
is the trickiest part — it must be correct. Let me provide exact code:

```ts
// Convert clip kind + props → list of property keys affected.
// fadeIn/fadeOut → opacityMult; draw → reveal; write → chars; moveTo → (dx,dy); scaleTo → (scaleX,scaleY); rotateTo → rotation; morph → morphPoints; param → param
// For each (target, prop) pair:
//   relevantClips = doc.clips.filter(c => c.target === target && clipAffects(c.kind, prop)).sort((a,b) => a.start - b.start)
//   base[prop] = specDefaultValue(...)
//   let current = base[prop]
//   let found = false
//   for clip in relevantClips:
//     if clip.start <= t:
//       local = t - clip.start
//       if local >= 0 && local <= clip.duration:
//         // clip is active
//         eased = easingFns[clip.ease](clamp01(local / clip.duration))
//         // From = (last clip that finished)'s end value, or base
//         // Actually: from is the VALUE AT clip.start which equals the previous clip's value at its end if any, else base.
//         // Compute that: run eval of all previous clips? Recursive? NO — simpler per property: iterate clips sorted by start; advance a "currentValue" pointer.
//         // Each clip at start overrides currentValue going forward; evaluate at t.
//         found = true
//         from = current
//         to = clipValue(clip, from)
//         current = lerp(from, to, eased)
//         break // the last clip with start<=t is the driver
//       else:
//         // clip finished — update current to its end value (it becomes the base for later clips)
//         current = clipValue(clip, current) // fully applied
//     // else clip has not started yet — ignore
//   if found:
//     frameState.objects.get(target)[prop] = current
```

OK, I should write this as part of the task instructions. But it's getting very long. Instead, I'll state: "Implement the algorithm from SPRINT.md §4 rules 1-5. The FrameState stores final absolute property values (e.g., dx = the total X offset from spec.at). Property composition: for a given (target, property) pair, iterate clips sorted by start; the value at time t = lerp(from, to, eased) where (from, to) are the start/end values of the last-started clip whose window contains t, and from = the accumulated value from earlier clips." And I'll refer to the test for concrete expected behavior, which the test file will encode.

For the test file (P3-003), I'll specify exact input clips and expected FrameState at specific times — that makes the implementation requirements concrete. Let me think of test cases:
1. clip fadeIn r1 0→1 over 0.5s: at t=0, opacityMult=0; at t=0.25, ≈0.5; at t=0.5+, =1.
2. clip moveTo r1 to [100,0] over 1s starting at t=2, from base [0,0]: at t=2, dx=0; at t=2.5, dx=50; at t=3+, dx=100.
3. Two overlapping moveTo clips: first 0→[100,0] over 1s at t=0; second 0→[200,0] over 1s at t=0.5. At t=0.5: first is active (dx≈50). At t=1: second is active, from 100 → 200, eased → dx≈150. At t=1.5: dx=200. (This tests "from = highest previous value").
4. fadeIn then fadeOut: r1 fadeIn t=0 d=1; r1 fadeOut t=1.5 d=0.5. At t=1, opacityMult=1; at t=2+, opacityMult=0.

OK, I'll put the test cases in the test file task. The executor needs just enough algorithm text.

Let me continue drafting the todo — I'll be more concise for the remaining tasks, trusting that the test files pin the expected behavior.

---

### P3-003 — Create `src/authoring/runtime/__test_timeline.ts`

**Files to create:** `src/authoring/runtime/__test_timeline.ts`

**What to write:** Bun script testing evalScene with the cases listed above.
Assert specific numeric values at specific times.

---

### P3-004 — Create `src/authoring/runtime/camera.ts`

**Files to create:** `src/authoring/runtime/camera.ts`

**What to write:** `poseAt(track: CameraTrack, t: number, resolveFit: (fitId: string) => {center: Vec2, zoom: number} | null): CameraPose`.

Resolution rules from SPRINT.md §5. Geometric zoom interpolation between keyframes (`z = z0 * Math.pow(z1/z0, p)`). Drift oscillation via `amp * Math.sin(2*PI*(t-k.time)/period)`. Returns `{x, y, z, azimuth, polar}`. Note: the 'flip' per chapter (polar swap) — handled by the doc's camera track polar values set at builder time (the explainer's `flip` sets alternate polar=0.06 — that's just a configuration on the chapter, not a runtime flip). So no runtime flip logic needed.

**Verify:** `bunx tsc --noEmit`.

---

### P3-005 — Create `src/authoring/runtime/runtime.ts`

**Files to create:** `src/authoring/runtime/runtime.ts`

**What to write:** `SceneRuntime` class implementing the `s.interactive`
contract from `state.ts:137-146`. Properties: `x0, y0, width, height,
playing, tourT`.

Constructor: `(doc: SceneDoc, ctx: {font: FontFace, atlas: any})`.
- Store doc, font, atlas.
- Width/height = computed from chapter groups bounds (union of all chapter rects)... or for v1: fixed 14500×5200 (like ExplainerBoard, explainer.ts:135). Use the same constants: `this.x0 = -900; this.y0 = -2200; this.width = 14500; this.height = 5200`.
- One `EmitCache` per chapter group: `Map<string, EmitCache>`.
- `MathTex` cache: `Map<string, MathTex>` (by latex string + size + color key? — simpler: by spec id).
- Live param values map initialized from doc.params defaults.

`emit(font, atlas, inst, crv, rws, now, view)`:
- Same signature as the s.interactive contract.
- Build DrawCtx + DrawHelpers from the incoming buffers.
- Call `evalScene(doc, playing ? tourT : totalDuration, liveParams)`.
- For each chapter group (in object insertion order):
  - skip if culled (chapter rect outside view + margin 160/zoom — reuse ExplainerBoard.visible() logic from explainer.ts:153).
  - Compute `chapterAlpha` = FrameState.chapters.get(id).alpha.
  - If not the current chapter: use EmitCache (key = `${alpha.toFixed(2)}|${paramSig}`) → run with a closure that emits this chapter's objects recursively.
  - If current chapter: emit directly (no cache — it animates).
  - For each object in the group's children (recursive):
    - Emit the spec kind using DrawHelpers + FrameState offsets:
      - text → DrawHelpers.text(content, at.x+dx, at.y+dy, size*scaleX, color, opacityMult, align). chars: slice content to chars count.
      - glyph → fill glyph quads (use glyphQuads + bbox-normalize logic from explainer.ts:119-129 — extract into a local helper `emitGlyph`).
      - rect → rect(at+[dx,dy], size scaled, fill, stroke, opacityMult).
      - circle → fillCircle/strokeCircle at center+[dx,dy], radius.
      - polygon → fillPoly at points+[dx,dy], or line (strokeInto) if only stroke.
      - line → line(points+[dx,dy] — each point offset by dx,dy), with reveal → trimPolyline.
      - math → create/cache MathTex instance; call .emit(atlas, inst, crv, rws, {x:at.x+dx, y:at.y+dy, size*scaleX, color, opacity:opacityMult, reveal}).
      - island → resolve island def from registry; resolve params (spec.params overridden by liveParams for $param refs); wrap time info {local, now, playing, alpha, build};
        call def.emit with IslandEmitCtx including DrawHelpers + the emit buffers + view.
      - group → recurse with accumulated (dx,dy,scaleX,scaleY) from FrameState.
    - Apply child group's own FrameState offsets additively.

`update(now: number, s: AppState)`:
- Must be called every frame if playing (mirrors ExplainerBoard.update, explainer.ts:146).
- If `lastNow < 0`: set lastNow = now, return.
- dt = (now - lastNow)/1000 clamped 0..0.05.
- tourT += dt; if tourT >= totalDuration: tourT = totalDuration; playing = false.
- Compute pose via poseAt(tourT); call `orbitSetPose(x, y, orbitDistForZoom(z, canvasH), azimuth, polar)`; call `updateOrbit(16)`.
- `lastNow = now`.

`seek(s, seconds, pause = true)`, `play(s, from=0)`, `stopTour(s)`, `replay(s)`:
- Mirror ExplainerBoard methods exactly (explainer.ts:143-149, 143-144).
- At play/seek/replay: call `enter3D(s)`.

`tryBeginDrag(wx, wy, scale)`:
- Iterate island instances (reverse insertion order).
- For each island handle: compute worldPos = islandAbsAt + handle.at(resolvedParams).
- If `dist(wx,wy, worldPos) <= max(12, 18/scale)` → set grabbed = {islandId, islandSpecId, handle}.
- Return true if grabbed.

`dragTo(wx, wy)`:
- If grabbed: compute island-relative pos, call handle.set(resolvedParams, relPos).
- Handle.set writes into `liveParams` (if param is a $param ref) or into instance overrides.

`endDrag()`: clear grabbed.

`updateHover(wx, wy, scale)`: same hit-test → set hovered (used by island emit to highlight handle). Return true if hovering.

`autoDrive()`: no-op.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** typecheck clean. Smoke demo test next.

---

### P3-006 — Create `src/authoring/scenes/sampleScene.ts`

**Files to create:** `src/authoring/scenes/sampleScene.ts`

**What to write:** A builder script producing a small test SceneDoc:

```ts
import { scene } from '../builder/scene';
export const SAMPLE_DOC = scene({ title: 'Sample Scene' }, (s) => {
  const r = s.param.number('radius', { default: 50, min: 30, max: 150, label: 'Circle radius' });
  const ch = s.chapter('ch0', { title: 'Hello', sub: 'A sample chapter', at: [0, 0], dur: 8 });
  ch.text('t0', 'Hello, world!', { at: [100, 60], size: 32, color: [0.95, 0.96, 0.98, 1] });
  ch.circle('c0', { center: [600, 400], radius: r.ref() as any, fill: [0.2, 0.5, 1, 0.6] });
  ch.rect('r0', { at: [300, 500], size: [200, 80], fill: [1, 0.3, 0.3, 1] });
  ch.cam.drop();
  ch.clip.fadeIn('t0', { start: 0.5, duration: 1 });
  ch.clip.fadeIn('r0', { start: 1, duration: 0.8 });
  ch.clip.draw('r0', { start: 1.5, duration: 1.5 });
  ch.clip.param('radius', { start: 2, duration: 3, to: 130, ease: 'easeOutElastic' });
  s.cam.keyframe(0, { fit: 'ch0', ease: 'easeInOutCubic' });
});
```

(Note: `r.ref()` returns `{ $param: 'radius' }` — a ParamRef. The island in the doc expects a ParamValue
in its params. But ParamRef vs ParamValue — the builder stores `{ $param: 'radius' }` (a ParamRef) as
the param value; runtime resolves it. So `r.ref() as any` is fine for type flexibility. The `build()`
validation deep-checks the ref exists.)

**Verify:** `bun src/authoring/scenes/sampleScene.ts` — if it was an executable script... no,
it just exports. Import it in the next task's test? Actually, just verify typecheck: `bunx tsc --noEmit`.

**Done-when:** typecheck clean. The scene will be validated when the demo boots.

---

### P3-007 — Create `src/authoring/demo.ts` (authoring demo boot)

**Files to create:** `src/authoring/demo.ts`

**What to write:** A function `bootAuthoring(engine: Engine, onBack: () => void): () => void`
that mirrors `bootExplainer` (explainer.ts:177-219) exactly.

Template:
```ts
import type { Engine } from '../playground/engine';
import type { AppState } from '../state';
import { createBaseApp, finishApp, snapTo } from '../playground/app';
import { enter3D } from '../camera/camera';
import { disableOrbit } from '../camera/orbit';
import { SceneRuntime } from './runtime/runtime';
import { SAMPLE_DOC } from './scenes/sampleScene';
import { createTimelineHud } from '../playground/timelineHud';
import type { TimelineHudItem } from '../playground/timelineHud';

export function bootAuthoring(engine: Engine, onBack: () => void): () => void {
  const s = createBaseApp(engine, false);
  const runtime = new SceneRuntime(SAMPLE_DOC, { font: engine.font, atlas: engine.atlas });
  s.interactive = runtime;
  snapTo(s, SAMPLE_DOC.objects['ch0']...??? — hmm need chapter center.)

  // Set up demo controller
  s.demo = {
    running: true,
    toggle() { this.running ? this.stop() : this.start(); },
    start() { this.running = true; runtime.play(s); },
    stop() { this.running = false; runtime.stopTour(s); },
    update(now: number) { if (!this.running) return; runtime.update(now, s); if (!runtime.playing) this.stop(); },
  };

  // DOM chrome: reuse timeline HUD (DOM)
  const timeline = createTimelineHud({ left: '7%', right: '7%', bottom: '2.4vh', activeScale: 2.0, interactive: true });
  const chapters = runtime.chapterWindows(); // helper method on runtime
  timeline.setItems(chapters.map(c => ({ title: c.title, subtitle: c.sub, duration: c.duration })));
  timeline.onScrub(ratio => runtime.seek(s, ratio * runtime.totalDuration, true));
  document.body.appendChild(timeline.el);

  let lastCaption = '';
  const updateHud = () => {
    timeline.setProgress01(runtime.tourT / Math.max(1, runtime.totalDuration));
    timeline.setTimeLabel(`${runtime.tourT.toFixed(1)}s / ${runtime.totalDuration.toFixed(1)}s`);
    // (caption update — find current chapter)
  };

  s.demo.update = (now: number) => {
    if (!s.demo || !s.demo.running) return;
    runtime.update(now, s);
    updateHud();
    if (!runtime.playing) s.demo.stop();
  };

  return finishApp(s, onBack, [
    { icon: '▶', title: 'Play / Pause', onClick: () => s.demo?.toggle() },
    { icon: '↺', title: 'Replay', onClick: () => { runtime.replay(s); s.demo?.start(); } },
  ]);
}
```

(The above is a sketch — the executor must adapt to exactly match the existing `bootExplainer` pattern.)

**Verify:** `bunx tsc --noEmit`. Then start with `bun run dev` and open
`http://localhost:3000/#authoring`.

**CHECKPOINT:** Ask the user to open `http://localhost:3000/#authoring` and
confirm: (1) the sample scene renders (text + circle + rect visible); (2)
the animation plays (fade-in of text, then rect, then circle radius changes);
(3) scrubbing the timeline HUD works; (4) pressing play/pause toggles.

**Done-when:** User confirms the sample scene works.

---

### P3-008 — Register authoring demo in `demos.ts`

**Files to edit:** `src/playground/demos.ts`

**Edit:** Add import for `bootAuthoring` from `../authoring/demo`. Add a
`Demo` entry to the `DEMOS` array:

```ts
{ id: 'authoring', name: 'Authoring (smoke test)', blurb: 'Internal — sample scene rendering via the new authoring runtime.', boot: bootAuthoring },
```

Insert it at the top of the array (before 'playground').

**Verify:** `bunx tsc --noEmit`. Open `http://localhost:3000/#authoring` and confirm.

**Done-when:** Typecheck clean + user confirms the demo boots from URL hash.

---

### P3-009 — P3 checkpoint

- [ ] All P3 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User visual confirmation of `/#authoring`.

---

## Phase 4 — Island System + Gallery

**Goal:** Island registry, draw helpers confirmed working, gallery demo.

**Required reading:** SPRINT.md §3 (Islands), `src/playground/explainer.ts:104-132`
(glyph asset machinery — will be extracted).

---

### P4-001 — Extract glyph asset into `src/authoring/islands/glyphAsset.ts`

**Files to create:** `src/authoring/islands/glyphAsset.ts`

**What to write:** Copy the following functions **verbatim** from
`src/playground/explainer.ts`:

- `type Seg` (line 104)
- `interface GlyphAsset` (line 105)
- `flattenNorm` (line 106)
- `insidePoly` (line 115)
- `distSeg` (line 116)
- `signedDist` (line 117)
- `buildGlyphAsset` (line 118)
- `place` (line 126)
- `sampleSDF` (line 127)
- `glyphAnalytic` (line 128) — adapt to use `DrawHelpers` passed as a parameter
- `glyphOutline` (line 129) — same adapt
- `glyphBitmap` (line 130) — same adapt
- `glyphField` (line 131) — same adapt
- `glyphTess` (line 132) — same adapt

The adaptation: the original functions receive `(ctx: EmitCtx, ...)` where
`EmitCtx = { font, atlas, inst, crv, rws, view, now }`. Replace the `ctx`
parameter with:

- `font: FontFace, atlas: any` (explicit)
- `draw: DrawHelpers` (from `./draw`)
- `inst/crv/rws: number[]` (explicit buffer refs)

Never use `ctx.inst` — always the passed `inst`. Replace
`rect(ctx, ...)` → `draw.rect(...)`; `line(ctx, ...)` → `draw.line(...)`;
`fillQuads(lq, ...)` → keep `fillQuads` import from stroke.ts;
`strokeQuadPath(...)` → keep from stroke.ts. Only draw-calls via the
`draw` helper change.

Export everything — types + functions.

**Verify:** `bunx tsc --noEmit`.

**Done-when:** Typecheck clean.

---

### P4-002 — Create `src/authoring/islands/registry.ts`

**Files to create:** `src/authoring/islands/registry.ts`

**What to write:**

```ts
import type { ParamDef, Vec2, Color, ParamRef, ParamValue } from '../ir/types';
import type { DrawHelpers } from './draw';

export interface IslandEmitCtx {
  font: any; atlas: any;
  inst: number[]; crv: number[]; rws: number[];
  view: { zoom: number; left: number; right: number; top: number; bottom: number };
  now: number; // wall-clock ms
  draw: DrawHelpers;
}

export interface IslandTime {
  local: number;   // seconds since chapter start (or 0 for free-running)
  now: number;     // wall-clock seconds
  playing: boolean;
  alpha: number;   // chapter fade-in × opacity
  build: number;   // 0..1 draw reveal (from 'draw' clips)
}

export type IslandKind = 'visual';

export interface IslandHandleDef {
  param: string;
  at(params: Record<string, ParamValue>): Vec2;
  set(params: Record<string, ParamValue>, to: Vec2): void;
}

export interface IslandDef {
  id: string;
  title: string;
  kind: IslandKind;
  params: Record<string, ParamDef>;
  defaultSize: Vec2;
  handles?: IslandHandleDef[];
  emit(ctx: IslandEmitCtx, params: Record<string, ParamValue>, time: IslandTime): void;
}

const registry = new Map<string, IslandDef>();

export function registerIsland(def: IslandDef): void {
  if (registry.has(def.id)) throw new Error(`Duplicate island id: ${def.id}`);
  registry.set(def.id, def);
}

export function getIsland(id: string): IslandDef {
  const d = registry.get(id);
  if (!d) throw new Error(`Unknown island: ${id}`);
  return d;
}

export function listIslands(): IslandDef[] {
  return [...registry.values()];
}
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** Typecheck clean.

---

### P4-003 — Create `src/authoring/islands/index.ts`

**Files to create:** `src/authoring/islands/index.ts`

**What to write:**
```ts
export { registerIsland, getIsland, listIslands } from './registry';
export type { IslandDef, IslandEmitCtx, IslandTime, IslandHandleDef, IslandKind } from './registry';
export { DrawHelpers } from './draw';
export type { DrawCtx, EmitBuffers } from './draw';
// Placeholder islands (until P5 replaces them):
```

**Verify:** `bunx tsc --noEmit`.

**Done-when:** Typecheck clean.

---

### P4-004 — Create gallery demo `src/authoring/islands/gallery.ts`

**Files to create:** `src/authoring/islands/gallery.ts`

**What to write:** A board implementing the `s.interactive` contract that
renders all registered islands in a grid. Simple — no drag support (return
false for tryBeginDrag, always empty hover). Properties:

- `x0 = 0; y0 = 0; width = 4000; height = 3000` (oversize for large gallery).
- `emit`: for each registered island (index i), compute cell position
  (cols = ceil(sqrt(count)), row = floor(i/cols), col = i % cols,
  cellW = 520, cellH = 440, x = col*cellW, y = row*cellH).
  Emit label (text), then island.emit with default params, time.playing=true,
  local = now (wall clock in seconds), alpha = 1, build = 1.

`tryBeginDrag` → false, `dragTo` → no-op, `endDrag` → no-op, `updateHover` → false,
`autoDrive` → no-op, `dragging` → always false.

**Verify:** `bunx tsc --noEmit`.

---

### P4-005 — Register gallery demo in `demos.ts` + import islands

**Files to edit:** `src/playground/demos.ts`

**Edit:** Add import for `gallery` board from `../authoring/islands/gallery`.
Add a demo entry: `{ id: 'islands', name: 'Island Gallery', blurb: '...', boot }`
where `boot` creates `createBaseApp(engine, false)`, sets `s.interactive = gallery`,
frames it, and calls `finishApp`.

Also create a function `bootIslands(engine, onBack)` inline in demos.ts,
similar to `bootReference` (lines 24-29).

**Verify:** `bunx tsc --noEmit`. Open `http://localhost:3000/#islands`.

**CHECKPOINT:** Ask user to confirm the gallery renders (it will show text "No
islands registered" or empty grid until P5 adds islands).

**Done-when:** Gallery page loads, typecheck clean, user confirms.

---

### P4-006 — P4 checkpoint

- [ ] All P4 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User confirms `/#islands` loads (empty).

---

## Phase 5 — Extract the 6 explainer visuals as islands

**Goal:** 6 procedural islands extracted from the explainer, visible in the
gallery. Each matches the original frame.

**Required reading:** SPRINT.md §3, `src/playground/explainer.ts` (specific
line ranges given per island).

Each island task follows this pattern:

1. Create `src/authoring/islands/builtin/<name>.ts`.
2. Import `registerIsland` from `../registry`, `DrawHelpers` from `../draw`,
   glyphAsset machinery from `../glyphAsset`, helper functions from
   `../../builder/helpers` (ping, clamp, etc.), type defs from `../../ir/types`.
3. Define an `IslandDef` with id, title, param schema, emit fn.
4. Call `registerIsland(def)` at module scope.
5. Edit `src/authoring/islands/index.ts` to add `import './builtin/<name>';`
   (side-effect registration).
6. `bunx tsc --noEmit`.
7. Mark task `[x]`.

**CHECKPOINT after all 6 islands:** User opens `/#islands`, compares each
island's visual against the corresponding chapter in `/#explainer` at
`http://localhost:3000/#explainer` (user navigates interactively). If any
island visual differs significantly, tasks iterate until parity.

---

### P5-001 — Island: bitmap-dissolve

**Files to create:** `src/authoring/islands/builtin/bitmapDissolve.ts`

**Emit fn:** Copy `glyphBitmap` render logic from `glyphAsset.ts`, replacing
the original static render call with `draw` helpers. The glyph asset is
pre-built once (lazily, on first emit) via `buildGlyphAsset(font, 'a')`.

**Params:** `cells: number` (default 16), `color: Color` (default rose
`[0.93, 0.36, 0.34, 1]`).

**Time:** `local` drives the sweep line (use `local` clamped to some
period or build-in). The original uses `this.loop(i, period)` — for the
island, `time.build` drives a sweep from 0→1, drawing rows top-down.

**Edit:** `src/authoring/islands/index.ts` — add `import './builtin/bitmapDissolve';`

---

### P5-002 — Island: sdf-field

**Files to create:** `src/authoring/islands/builtin/sdfField.ts`

**Emit fn:** `glyphField` logic from `glyphAsset.ts`.

**Params:** `fine: number` (default 44), `color: Color` (default gold).

**Edit:** `src/authoring/islands/index.ts`.

---

### P5-003 — Island: tessellation-fan

**Files to create:** `src/authoring/islands/builtin/tessellationFan.ts`

**Emit fn:** `glyphTess` logic.

**Params:** `maxSub: number` (default 3), `color: Color` (default accent2).

**Edit:** `src/authoring/islands/index.ts`.

---

### P5-004 — Island: coverage-sweep

**Files to create:** `src/authoring/islands/builtin/coverageSweep.ts`

**Emit fn:** The `chPixel` visual block from explainer.ts:165 (the pixel
grid + coverage circle + scanline + mini plot + F readout). Copy the
emission code, adapting to draw helpers.

**Params:**
- `center: Vec2` (default `[120, 200]` — island-local, within the ~260×260 bounds)
- `radius: number` (default 60, min 30, max 120)
- `scanColor: Color` (default gold)
- `circleColor: Color` (default blue)

**Handles:**
- `center`: handle at = center param value; set clamps within island bounds.
- `radius`: handle at = [center.x + radius, center.y]; set via `Math.hypot(to.x - center.x, to.y - center.y)`, clamped [30, 120].

**Edit:** `src/authoring/islands/index.ts`.

---

### P5-005 — Island: winding-ray

**Files to create:** `src/authoring/islands/builtin/windingRay.ts`

**Emit fn:** The `chInside` visual block (star shape + ray + test point +
inside/outside label + orbiting dot) from explainer.ts:164.

**Params:**
- `testPoint: Vec2` (default `[100, 100]` — island-local)

**Handles:** `testPoint`: at = the param value.

**Edit:** `src/authoring/islands/index.ts`.

---

### P5-006 — Island: band-probe

**Files to create:** `src/authoring/islands/builtin/bandProbe.ts`

**Emit fn:** The `chBands` visual block from explainer.ts:166.

**Params:**
- `probeY: number` (default 210 — island-local)

**Handles:** `probeY`: at = [0, probeY] relative to island origin; set
clamps within band bounds.

**Edit:** `src/authoring/islands/index.ts`.

---

### P5-007 — P5 checkpoint (visual acceptance)

**CHECKPOINT:** User opens `http://localhost:3000/#islands`, sees all 6
islands animating, and navigates to `http://localhost:3000/#explainer` to
compare visuals. User confirms visual parity for each island.

**Done-when:** User confirms all 6 islands match the original.

---

## Phase 6 — Explainer Recreation (acceptance)

**Goal:** Recreate the full 12-chapter explainer via the builder. Camera,
text, islands, HUD — indistinguishable from the original.

**Required reading:** `src/playground/explainer.ts` (full file),
SPRINT.md §5 (gesture compile table), the 6 island defs from P5.

---

### P6-001 — Create explainer scene scaffold

**Files to create:** `src/authoring/scenes/explainerScene.ts`

**What to write:** Copy the constant palette `C` and chapter config from
explainer.ts:33-58 exactly. Create a `scene()` builder call. Add chapter
headings, sizes, durations, positions, and camera gestures:

Chapters:
- splash at [0,0], drop
- problem at [1450,-430], sweep
- bitmap at [3100,230], dive into glyph box center with flip
- sdf at [3000,-1120], dive, flip
- tess at [4740,-430], dive, flip
- answer at [4560,900], dive
- inside at [6340,250], arc
- pixel at [6200,-970], sweep
- bands at [7920,-170], rise
- same at [7740,1100], pull
- gpu at [9600,420], sweep
- infinite at [11220,-240], dive

Text positions use `LX=76` / `RX=700` (left/right column); flipping = text on
RX side, visual on LX side. The `head()` function draws an accent bar + kicker
+ title — implement as two text objects + a thin rect.

**Done-when:** `bunx tsc --noEmit` clean; the scene imports correctly.

---

### P6-002 — Fill text-chapter content (problem, bitmap, sdf, tess, answer)

Continue filling `explainerScene.ts`: For each of these 5 chapters, add
text content (head + body lines + verdictChip where applicable), and
add a glyph-visual island instance at the correct position (VXW=470,
vh=540). From explainer.ts methods: `chProblem`, `chBitmap`, `chSDF`,
`chTess`, `chAnswer`.

**Done-when:** Typecheck clean.

---

### P6-003 — Fill interactive chapters (inside, pixel, bands)

Add island instances for `winding-ray` (inside chapter), `coverage-sweep`
(pixel chapter), `band-probe` (bands chapter). Wire params: the
explainer's `covCx/covCy/covR`, `testX/testY`, `bandY` become SceneDoc
params with the same defaults as ExplainerBoard.

Camera gestures: inside → arc, pixel → sweep, bands → rise.

**Done-when:** Typecheck clean.

---

### P6-004 — Fill remaining chapters (same, gpu, infinite)

same chapter: 4 cards (glyph, star, math equation, UI rect) drawn via
islands + math/rext. gpu: pipeline diagram (mostly text + rect) plus
a glyph visual. infinite: full-frame glyph + text.

**Done-when:** Typecheck clean.

---

### P6-005 — Create explainer demo entry (`/#explainer-v2`)

**Files to create:** `src/authoring/bootExplainerV2.ts` (or edit demo.ts)

**What to write:** A boot function that loads the explainer scene instead
of the sample scene. Mirrors `bootExplainer` (explainer.ts:177-219) but
uses `SceneRuntime` with the explainer SceneDoc. Wire the same DOM chrome
(letterbox bars, caption, splash overlay, timeline HUD).

**Edit demos.ts:** Add new demo entry `explainer-v2`.

**Verify:** `bunx tsc --noEmit`. Open `http://localhost:3000/#explainer-v2`.

**CHECKPOINT:** User watches the full tour and verifies each chapter
visually against `/#explainer`. Scrubs timeline. Interacts with handles
(inside chapter test point, pixel circle, band probe).

**Done-when:** User approves visual parity.

---

### P6-006 — P6 checkpoint

- [ ] All P6 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User parity approval.

---

## Phase 7 — REPL (Terminal Scene Commands)

**Goal:** `scene` commands in the authoring demo's terminal, mirroring the
`wf` command pattern from `scriptRuntime.ts`.

**Required reading:** `src/playground/scriptRuntime.ts` (command handler
pattern), `src/playground/playground.ts:199-207` (terminal wiring).

---

### P7-001 — Create `src/authoring/repl.ts`

**Files to create:** `src/authoring/repl.ts`

**What to write:** `handleSceneCommand(raw: string, term: Terminal,
runtime: SceneRuntime): boolean`. Register this via
`terminal.setCommandHandler(...)`.

Commands (exact):
- `scene status` — print title, objects count, clips count, duration, current time.
- `scene objects` — list ids with kind.
- `scene params` — list params with current values.
- `scene clips` — list clips with start/duration/target/kind.
- `scene inspect <id>` — print all visible properties of an object, its frame state at current time.
- `scene seek <t>` — seek.
- `scene play` / `scene pause` / `scene stop`.
- `scene set <id>.<prop> <json-value>` — update live param or object spec (runtime doc mutation).
- `scene add rect|text|circle <id> <json>` — add a new object spec to the doc.
- `scene remove <id>` — remove object and its clips.
- `scene save` — download SceneDoc JSON.
- `scene load` — open file picker, parse, reload runtime.
- `scene help` — list commands.

**Verify:** `bunx tsc --noEmit`.

---

### P7-002 — Wire REPL into the authoring demo

**Files to edit:** `src/authoring/demo.ts`

**Edit:** Add a `Terminal` instance (like playground.ts does:
`new Terminal()`, set font, position to right of scene, `s.terminal = terminal`).
Add `setCommandHandler` routing `scene ...` through the REPL handler.
The authoring demo now has a terminal.

**Verify:** `bunx tsc --noEmit`. Open `http://localhost:3000/#authoring`.

**CHECKPOINT:** User types `scene status` in the terminal and sees the
sample scene info.

**Done-when:** User confirms REPL works live.

---

### P7-003 — P7 checkpoint

- [ ] All P7 tasks `[x]`.
- [ ] `bunx tsc --noEmit` clean.
- [ ] User confirms REPL commands.

---

## Phase 8 — Code Projection + Save/Load

**Goal:** `emitTS(doc): string`, JSON save/load, round-trip.

---

### P8-001 — Create `src/authoring/emitTS.ts`

**Files to create:** `src/authoring/emitTS.ts`

**What to write:** `emitTS(doc: SceneDoc): string` — produces builder code
that reconstructs the doc. Flat formatting, one method call per line.
Parameters emitted as `s.param.number(...)` lines. Chapters as
`s.chapter(...)` blocks. Keep deterministic; indentation 2 spaces.

**Test:** Create `src/authoring/__test_emit.ts` — build a minimal doc,
emit TS, execute the emitted TS via `new Function` or `eval` (it must
import `scene` from the builder... not easy to do in a Bun test without
running the full web app). Instead: test that emitTS produces a non-empty
string; spot-check it contains the title and key identifiers.

**Verify:** `bunx tsc --noEmit`; `bun src/authoring/__test_emit.ts` passes.

**Done-when:** Tests pass + typecheck.

---

### P8-002 — Implement save/load in REPL + GUI

**Files to edit:** `src/authoring/repl.ts`, `src/authoring/demo.ts`

**Edit:** `scene save` downloads JSON via a Blob + URL.createObjectURL + link
click. `scene load` opens a hidden `<input type="file">`, reads, parses,
validates, and calls `runtime.reload(newDoc)`.

**Verify:** User saves a scene, loads it back, confirms deterministic
behavior.

---

### P8-003 — P8 checkpoint

- [ ] Save/load round-trip works.
- [ ] `emitTS` produces valid-looking builder code.

---

## Phase 9 — GUI Chrome (post-acceptance)

**Goal:** Analytic-tree/inspector/timeline/viewport-manipulation — all
rendered through the pipeline as chapterless chrome panels.

**These tasks are coarser — they are post-acceptance and depend on all
previous phases. The executor should build Taffy-based panels rendered via
the same DrawHelpers.**

### P9-001 — Object tree panel

### P9-002 — Property inspector

### P9-003 — Timeline panel (clip lanes + scrubber)

### P9-004 — Viewport object drag + island handle drag (already wired)

### P9-005 — GUI checkpoint

---

## Phase 10 — Polish & Docs

### P10-001 — Verify EmitCache integration

### P10-002 — Update AGENTS.md + PROGRESS.md

### P10-003 — Create example scenes

---

## Dependency graph

```
P1 (IR) → P2 (Builder) → P3 (Runtime)
                              ├─→ P4 (Islands) → P5 (Builtins) → P6 (Explainer)
                              ├─→ P7 (REPL)
                              ├─→ P8 (Projection + Save/Load)
                              └─→ P9 (GUI)
                                        └─→ P10 (Polish)
```

P3 must complete before ANY of P4–P9. After P3, P4/P5/P6 are sequential
(the acceptance spine). P7, P8, P9 can start in parallel after P3.
P10 is last.
