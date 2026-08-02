// ── frustum culling for ground-plane rects ───────────────────────────────────
// Pure, headless-testable 3D visibility tests used by frame.ts. The document
// lies flat on the ground plane (doc z = 0), so a page/board rect is a 2D rect
// in doc space transformed by the view-projection.

// Conservative clip-space frustum test for a doc-plane rect (z = 0). Returns
// false only when the whole rect is provably outside a single frustum plane — so
// in the 3D free camera we skip emitting boards/pages that aren't on screen
// (otherwise EVERY board + page emits every frame, tanking FPS in 3D).
//
// The left/right/top/bottom clip-space tests are EXACT only when every corner
// has w > 0 (all in front of the camera). With corners BEHIND the near plane
// (w ≤ 0) the inequalities are unreliable: a behind corner near the view axis
// increments BOTH `left` and `right`, and a mixed rect's image can bleed onto
// screen even when all its FRONT corners sit off one side (a behind corner far
// to the other side pulls the near-plane crossing back across the viewport).
// So:
//   • all 4 corners behind → NEVER cull (ALWAYS draw). The near plane clips the
//     ground plane when the camera is low/close, so a rect the camera LOOKS AT can
//     have all four corners behind the near plane while it fills the screen — the
//     old "camera ground position inside the rect" guard culled exactly those
//     (the user: "things disappear even when they are in view"). Over-drawing the
//     all-behind case costs only the near-camera boards (cheap cached replays;
//     the GPU clips the genuinely off-screen ones) — correctness over culling.
//   • 0 < behind < 4 (any corner behind, some in front) → NEVER cull: the side
//     tests cannot prove it off-screen, and drawing a near-camera rect is always
//     the safe answer (the "culling too aggressive" fix — dolly close to a board
//     and it stays on screen).
//   • all corners in front → the side tests are exact: all corners beyond one
//     plane means the whole convex quad is outside the frustum → culled.
export function rect3DVisible(
  vp: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number,
  _camLocal?: { x: number; y: number } | null,
): boolean {
  let left = 0, right = 0, top = 0, bot = 0, front = 0, behind = 0;
  let cx = vp[0] * x0 + vp[4] * y0 + vp[12];
  let cy = vp[1] * x0 + vp[5] * y0 + vp[13];
  let cw = vp[3] * x0 + vp[7] * y0 + vp[15];
  if (cw <= 1e-6) behind++; else { front++; if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; }
  cx = vp[0] * x1 + vp[4] * y0 + vp[12];
  cy = vp[1] * x1 + vp[5] * y0 + vp[13];
  cw = vp[3] * x1 + vp[7] * y0 + vp[15];
  if (cw <= 1e-6) behind++; else { front++; if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; }
  cx = vp[0] * x1 + vp[4] * y1 + vp[12];
  cy = vp[1] * x1 + vp[5] * y1 + vp[13];
  cw = vp[3] * x1 + vp[7] * y1 + vp[15];
  if (cw <= 1e-6) behind++; else { front++; if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; }
  cx = vp[0] * x0 + vp[4] * y1 + vp[12];
  cy = vp[1] * x0 + vp[5] * y1 + vp[13];
  cw = vp[3] * x0 + vp[7] * y1 + vp[15];
  if (cw <= 1e-6) behind++; else { front++; if (cx < -cw) left++; if (cx > cw) right++; if (cy < -cw) top++; if (cy > cw) bot++; }
  if (behind > 0) {
    // Any corner behind the near plane: the side tests can't prove the rect
    // off-screen (see header) → always draw. Includes the all-4-behind case (a
    // rect the camera looks at low/close fills the screen with every corner
    // behind the near plane — culling it was the "things disappear" bug).
    return true;
  }
  // All corners in front: exact plane tests.
  if (left === 4 || right === 4 || top === 4 || bot === 4) return false;
  return true;
}

// True when all 4 corners of a ground rect are BEHIND the near plane (w ≤ 0) —
// the camera looks away from it entirely. Unlike rect3DVisible this is only the
// behind-camera case, so it NEVER culls a board that could be on screen (a rect
// the camera looks at has at least one corner in front — the mixed case). Used to
// gate the 4× MSAA mesh pass: a mesh whose boards are all behind the camera is
// invisible, so the expensive full-screen MSAA pass can be skipped.
export function rectBehindNear(vp: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number): boolean {
  const cw = (x: number, y: number) => vp[3] * x + vp[7] * y + vp[15];
  return cw(x0, y0) <= 1e-6 && cw(x1, y0) <= 1e-6 && cw(x1, y1) <= 1e-6 && cw(x0, y1) <= 1e-6;
}
