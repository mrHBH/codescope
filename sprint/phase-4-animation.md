# Phase 4 — Scene graph & animation engine

**Status:** not started · **Depends on:** Phases 1–3 · **Blocks:** (enables 5–7 demos).

## Goal
A Manim-class animation system: a scene/timeline that plays eased animations over
Mobjects — create, transform/morph, fade, move — smoothly and continuously.

## Scope
- [ ] `Scene`: holds a Mobject tree, owns the frame loop (reuse windfoil's), a clock.
- [ ] Timeline: `play(anim)`, `sequence(...)`, `parallel(...)`, `wait(t)`; per-anim
      duration + easing (reuse/extend the demo's easing set).
- [ ] `Create`/`Draw`: partial-length path reveal (arc-length parameterized).
- [ ] `Transform`/`morph`: interpolate one Mobject's contours into another with a
      point-correspondence strategy (resample both to equal counts; match order).
- [ ] `FadeIn`/`FadeOut`, `Shift`, `Scale`, `Rotate`, `MoveAlongPath`.
- [ ] `ValueTracker` + **updaters**: objects that recompute from a tracked value
      every frame (dependent animation, e.g. a dot riding a plotted curve).
- [ ] Timeline scrubbing (seek to t) — stretch.

## Deliverables
- `src/windgraph/anim/` — `scene.ts`, `timeline.ts`, `animations.ts`, `easing.ts`.
- Demo: `y=sin x` **morphs** into a polynomial while a labeled point rides the
  curve and the area under it fills in — fully eased, no popping.

## Acceptance criteria
- All motion is eased and **continuous** — no snapping/popping across any animation
  or between sequenced animations (measure per-frame deltas if in doubt).
- Morph between two shapes is a smooth path interpolation (no vertices jumping).
- Updaters keep dependent objects perfectly in sync each frame.
- 60fps (tab focused) for a scene with a morphing curve + several updaters.

## Notes
- This is where the project's #1 quality bar (no snapping, eased, prove-it) is
  most visible — carry it in.
- Reuse the cinematic-demo timeline patterns already built in `src/ui/demo.ts`.
