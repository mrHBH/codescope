// ── Board slider overlay helpers ─────────────────────────────────────────────
// Each windgraph board owns a real AnalyticPanel for its parameter sliders.
// In 2D the panel lives in WORLD space (doc coords, k = 1/cameraScale) drawn into
// the world instance buffer — the ortho VP makes it screen-constant and crisp.
// In 3D a ground-plane rect can NEVER be screen-constant under perspective (it
// projects to a trapezoid and drifts in size as the camera dollies — the "sliders
// keep shrinking" bug), so there the panel is drawn into the SCREEN HUD overlay
// (screen-ortho, backing-store px) pinned to the board corner's projected screen
// position: truly fixed-size and undistorted, like the toolbar/quality panel.
// Hit-testing follows the same split: doc coords in 2D, screen px in 3D
// (panelHitXY). At scale=1 (app=null, headless) the panel sits at the corner.

import type { AppState } from '../../state';
import type { AnalyticPanel } from '../../ui/analyticPanel';
import { ANALYTIC_PANEL_THEME } from '../../ui/analyticPanel';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { cameraScale, cameraViewProj, uiScale } from '../../camera/camera';

export interface SliderBoard {
  x0: number; y0: number; width: number; height: number;
  panel: AnalyticPanel | null;
  app: AppState | null;
}

// Inset (world px at scale=1) of the panel from the board's top-left corner.
const INSET = 8;

/** World (doc-space) → backing-store device px. Used only for visibility culling
 *  (is the board's corner on screen?). Identity when s=null (headless). */
export function worldToScreenPx(wx: number, wy: number, s: AppState | null): { x: number; y: number } {
  if (!s) return { x: wx, y: wy };
  const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
  if (s.cam3d.active) {
    // Full perspective projection — used only for the visibility check.
    const m = cameraViewProj(s, Cw, Ch);
    const cx = m[0] * wx + m[4] * wy + m[12];
    const cy = m[1] * wx + m[5] * wy + m[13];
    const cw = m[3] * wx + m[7] * wy + m[15];
    return { x: ((cx / cw) + 1) * 0.5 * Cw, y: (1 - (cy / cw)) * 0.5 * Ch };
  }
  return { x: (wx - s.viewX) * s.viewZ + Cw / 2, y: (wy - s.viewY) * s.viewZ + Ch / 2 };
}

/** Pointer coords to hit-test a panel in: screen backing-px in 3D (the panel is a
 *  screen-HUD overlay there), doc coords in 2D (world-space panel). `sx/sy` are the
 *  pointer's backing-store px; in 2D they are ignored. */
export function panelHitXY(b: SliderBoard, wx: number, wy: number, sx?: number, sy?: number): [number, number] {
  return b.app?.cam3d.active ? [sx ?? wx, sy ?? wy] : [wx, wy];
}

/** Position (and show/hide by visibility) one board's slider panel for this frame.
 *  2D: doc coords at the board's corner (world buffer). 3D: backing-store px at the
 *  corner's projected screen position (screen HUD), clamped to the viewport. */
export function positionBoardPanel(b: SliderBoard, s: AppState | null): void {
  if (!b.panel) return;
  const Cw = s ? s.tCanvas.width : 1e9;
  const Ch = s ? s.tCanvas.height : 1e9;
  const c = worldToScreenPx(b.x0, b.y0, s);
  const vis = c.x > -600 && c.x < Cw + 600 && c.y > -600 && c.y < Ch + 600;
  if (!vis) { b.panel.open = false; return; }
  b.panel.open = true;
  if (s?.cam3d.active) {
    const ui = uiScale(s);
    b.panel.reposition(c.x + INSET * ui, c.y + INSET * ui, Cw, Ch, ui);
    return;
  }
  const k = s ? 1 / cameraScale(s) : 1;
  // No viewport clamping (1e9) — the panel sits at the board's corner in doc
  // coords; the world instance buffer handles culling/depth.
  b.panel.reposition(b.x0 + INSET * k, b.y0 + INSET * k, 1e9, 1e9, k);
}

/** Cheap per-frame signature of a board's panel interaction state (for frameSig). */
export function boardPanelSig(b: SliderBoard, s: AppState | null): string {
  if (!b.panel) return '';
  const p = b.panel;
  let vals = '';
  for (const it of p.items) if (it.kind === 'slider') vals += it.get().toFixed(3) + ',';
  return `${p.open ? 1 : 0}|${p.hovered}|${p.isDragging ? 1 : 0}|${vals}`;
}

/** Emit one board's panel into the world instance buffer (uncached chrome). */
export function renderBoardPanel(b: SliderBoard, inst: number[], crv: number[], rws: number[], font: FontFace, atlas: GlyphAtlas): void {
  if (b.panel && b.panel.open) b.panel.render(font, atlas, inst, crv, rws, ANALYTIC_PANEL_THEME);
}

/** Screen-HUD chrome signature for one board's panel (3D only): the projected
 *  corner (moves with the camera) plus interaction state, so the HUD rebuilds when
 *  the panel moves or is touched. Empty in 2D (panel lives in the world buffer). */
export function boardScreenChromeSig(b: SliderBoard, s: AppState): string {
  if (!s.cam3d.active || !b.panel) return '';
  const c = worldToScreenPx(b.x0, b.y0, s);
  return `${Math.round(c.x)},${Math.round(c.y)},${b.panel.open ? 1 : 0},${b.panel.hovered},${b.panel.isDragging ? 1 : 0}`;
}

/** Render one board's panel into the screen-HUD overlay buffers (3D only), pinned
 *  to the corner's projected screen position. No-op in 2D. */
export function renderBoardScreenChrome(b: SliderBoard, s: AppState, hud: { inst: number[]; crv: number[]; rws: number[] }, font: FontFace, atlas: GlyphAtlas): void {
  if (!s.cam3d.active) return;
  positionBoardPanel(b, s);
  renderBoardPanel(b, hud.inst, hud.crv, hud.rws, font, atlas);
}
