# Explainer Script v2 — "Compute The Covered Area"

**Spine:** one question — *"What fraction of this pixel does the shape cover?"* — is
asked in the intro, dodged by every existing method, and finally answered directly by
windfoil. Every chapter references that one question.

**One-sentence takeaway (the "aha"):** *Every other method stores or approximates the
answer — windfoil computes the exact covered area of each pixel, so it's sharp at any
zoom.*

**Total target ≈ 2:00**, slow and deliberate. Cinematic letterbox bands + lower-band
chapter/subchapter captions. Infinite 3D canvas; all chapters stay physically present for
manual revisiting after the tour.

---

## Chapter 0 — Splash (~5s)
`windfoil` / `analytic text & vector rendering`.
Camera drifts over the dark grid toward a single razor-sharp glyph. No teaching yet — tone
only. DOM splash overlay (radial vignette) like the playground cinematic, fading out.

## Chapter 1 — The Hook: "you've seen this break" (~12s)
One word rendered normally. Camera zooms hard into an edge — it dissolves into blurry
blocks (a fake bitmap). Freeze.
Caption: *"Text is curves. Screens are pixels."*
The core question appears for the first time, small: **`coverage = ?`** over one pixel
straddling an edge.

## Chapter 2 — Attempt #1: Bitmaps (~12s)
"Store the answer as pixels." Show the atlas; crisp at native size. Then the *same zoom* →
stair-steps.
Verdict card: `+ fast  + simple  − resolution-locked`.
The question `coverage = ?` is stamped **"guessed"**.

## Chapter 3 — Attempt #2: SDF / MSDF (~14s)
"Store *distance* instead of color." Distance field blooms; a threshold plane slices it →
smoother edges. Then push a sharp corner: the field visibly rounds it; MSDF's color
channels patch it partially.
Verdict: `+ scalable  − approximates the boundary  − corner artifacts`.
Question stamped **"approximated"**.

## Chapter 4 — Attempt #3: Tessellation (~12s)
"Turn the outline into triangles." Glyph shatters into triangles; slider adds more →
smoother but triangle count explodes; the GPU's own edge sampling still stair-steps at the
silhouette.
Verdict: `+ real outline  − flattened curves  − still samples coverage`.
Question stamped **"still sampled"**.

## Chapter 5 — The Turn (~10s)
All three verdict cards line up: guessed · approximated · sampled. Beat.
Caption: *"Nobody actually answered the question."*
Then, slowly, the real question rewritten as math:
`F = 1/A ∬_B w(x,y) dA`
"Don't store it. Don't approximate it. **Compute the covered area.**"

## Chapter 6 — Inside vs Outside (~12s)
Zoom on the integrand `w`. How do we know a point is inside? A test point + a ray crossing
the contour; crossings flip inside/outside (winding). Outside → cancels (0), inside → one
net turn (1). Kept light and visual — a *sub-step of Ch.5*, labeled as such, not a rival
chapter.

## Chapter 7 — Point → Pixel (~12s)
The test point grows into the pixel square. A scanline sweeps top-to-bottom; each row's
inside-interval is a covered length; they accumulate into total area. The live
`F = 0.xxx` ticks up as the sweep fills. *This* is the answer the other three dodged.

## Chapter 8 — "But isn't that expensive?" (~14s)
Show a full glyph with hundreds of curve pieces; naive = every pixel tests every curve.
Then bands: outline splits into monotone pieces, pieces drop into horizontal row-bands, a
pixel lights only the 2–3 rows it touches and gathers a short list.
Caption: *"The integral only looks at nearby edges."*

## Chapter 9 — It's All The Same Shape (~8s)
Pan across text, an icon, a math equation, a UI rounded rect — all revealed as filled
analytic contours running the identical coverage path.
Caption: *"One rule renders everything."*

## Chapter 10 — One GPU Pass (~10s)
Compact diagram: instances → rows → curves → shader gather → framebuffer. A single
pixel-query travels the path and resolves to a color.
Caption: *"CPU builds references. GPU integrates."*

## Chapter 11 — Infinite Zoom (payoff) (~10s)
Dive into a glyph edge far past UI scale — it stays perfectly smooth because it is
*recomputed*, never stored. Then pull back fast to reveal the whole explainer canvas.
Caption: *"Everything you just watched was drawn this way."*

## Chapter 12 — Your Turn (~5s)
Bands slide off, camera holds. Handles glow. Drag the coverage circle, the winding point,
the band probe; pan/orbit freely; resume from any chapter.

---

## Pacing table

| Chapter | Content            | Seconds |
|--------:|--------------------|--------:|
| 0       | Splash             | 5       |
| 1       | Hook / break-it    | 12      |
| 2       | Bitmaps            | 12      |
| 3       | SDF / MSDF         | 14      |
| 4       | Tessellation       | 12      |
| 5       | The turn (math)    | 10      |
| 6       | Inside vs outside  | 12      |
| 7       | Point → pixel      | 12      |
| 8       | Bands / cost       | 14      |
| 9       | Same shape         | 8       |
| 10      | GPU pass           | 10      |
| 11      | Infinite zoom      | 10      |
| 12      | Manual handoff     | 5       |

---

## Implementation notes (engine constraints)

- Rendered entirely analytically via the existing `ExplainerBoard` (`s.interactive`); 3D
  orbit-camera guided tour, playground-style DOM cinematic bands + lower-band captions.
- Keep all chapters physically present on the infinite canvas for manual revisit.
- Performance: static chapter geometry replays through `EmitCache`; only the small animated
  overlay for the current chapter is rebuilt per frame. No chapter hiding.
- Recurring motif: the `coverage = ?` token and the guessed/approximated/sampled stamps tie
  chapters 1–5 together.
- Splash + Ch.11 pull-back reuse the DOM overlay + camera drift pattern from
  `playground/cinematic.ts`.
