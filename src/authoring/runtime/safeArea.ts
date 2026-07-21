// ── Safe-area layout — bands-aware page sizing + camera fit ──────────────────
// Driving invariant: a safe chapter page sized for H_eff(barT) fills the visible
// area between letterbox bars exactly, so the camera never moves when bars toggle
// and content is never covered.

export const BAND_FRAC = 0.11; // matches cinematicHud.ts:208

/** Visible canvas height between letterbox bars. */
export function effHeight(canvasH: number, barT: number): number {
  return canvasH * (1 - 2 * BAND_FRAC * barT);
}

/**
 * Safe-page world size.  W_p is the authored nominal width (fixed).
 * H_p tracks the safe-area ratio so the page always fills exactly the
 * visible area between bars at the current barT — growing/shrinking
 * symmetrically about its center.
 *
 * For `cover` pages, H_p uses the FULL canvas height (not band-shrunk) so the
 * page is always at canvas aspect — used by the Living-UI chapter where the
 * slot must fill the screen at fitObj for a seamless peel.
 */
export function safePageWH(
  nominalW: number,
  canvasW: number,
  canvasH: number,
  barT: number,
  cover = false,
): [number, number] {
  const Wp = nominalW;
  const effH = cover ? canvasH : effHeight(canvasH, barT);
  const ratio = effH / canvasW;
  const Hp = Wp * ratio;
  return [Wp, Hp];
}

/**
 * Camera zoom for a safe page: fit W_p to the canvas width.
 * Does NOT depend on barT → camera never moves when bands toggle.
 */
export function safePageZoom(
  nominalW: number,
  canvasW: number,
  marginX = 40,
): number {
  return canvasW / (nominalW + 2 * marginX);
}

/**
 * Safe-page center (world coordinates).  The page is center-anchored:
 * at is the page center, so top = cy - Hp/2, bottom = cy + Hp/2.
 */
export function safePageCenter(
  at: [number, number],
  _hp: number,
): [number, number] {
  return [at[0], at[1]];
}
