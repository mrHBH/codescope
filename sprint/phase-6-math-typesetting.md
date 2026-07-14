# Phase 6 — Math typesetting (the differentiator)

**Status:** not started · **Depends on:** Phases 1, 4 · **Blocks:** —

## Goal
**LaTeX-quality math, rendered analytically** through windfoil — infinitely sharp,
zoomable, and animatable as a first-class Mobject. This is the standout feature no
competitor has (Manim rasterizes SVG-from-LaTeX; MathJax/KaTeX are DOM/SVG).

## Design decision (settled)
Use the **"LaTeX way" via a KaTeX-style layout**, not a TeX engine:
1. Parse LaTeX math → an expression tree.
2. Run a **box-and-glue layout** (KaTeX already does this well; we can adopt its
   layout output / positioned box tree rather than its DOM/SVG renderer).
3. Extract positioned **glyph boxes** (char + font + size + x/y) and **rules**
   (fraction bars, radicals, matrices).
4. Bake the math fonts (KaTeX/Latin-Modern/STIX) into the windfoil atlas and emit
   glyph + rule instances — analytic, alias-free at any zoom.

*Not* a full TeX/DVI/PDF engine. *Not* general text-mode LaTeX (math-mode focus).

## Scope
- [ ] Math font atlas (KaTeX fonts → windfoil `buildGlyphAtlas`).
- [ ] LaTeX-math → box tree (adopt KaTeX layout, or a focused subset parser+layout).
- [ ] Box tree → windfoil instances (glyphs + rules), with correct metrics/kerning.
- [ ] `MathTex` Mobject: inline + display; anchoring; participates in transforms.
- [ ] Animatable: write-on (Create), morph between equations (Transform), fade.

## Deliverables
- `src/windgraph/math/` — `layout.ts` (or KaTeX adaptor), `mathtex.ts`, font assets.
- Demo: `\int_0^1 x^2\,dx = \tfrac13` writes on, then **morphs** into another
  identity, staying razor-sharp at 1000× zoom.

## Acceptance criteria
- Rendered math matches KaTeX layout (spacing/positioning) and is **analytically
  sharp at any zoom** — visibly better than SVG/MathJax when zoomed.
- A `MathTex` can be created/transformed/faded like any Mobject.
- Common constructs render: fractions, exponents/subscripts, radicals, sums/
  integrals with limits, Greek, operators, matrices.

## Notes / decisions to make
- **Dependency call:** adopting KaTeX (for layout only) is the one sanctioned heavy
  dependency — it saves a massive amount of TeX-layout work. Alternative: a focused
  in-house math layout (more control, more effort). Decide at phase start.
- Kerning/metrics fidelity is the tricky part; validate against KaTeX output.
