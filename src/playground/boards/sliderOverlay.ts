// ── Board slider overlay helpers ─────────────────────────────────────────────
// Each windgraph board owns a real AnalyticPanel for its parameter sliders.
// The panel is rendered in WORLD space (doc coords) at the board's corner with
// a screen-constant size (k = 1/cameraScale), drawn into the world instance
// buffer through the live view-projection — so in 3D it sits on the ground
// plane (perspective-foreshortened, "in 3D" like the context menu), and in 2D
// the ortho VP maps it to the same screen position as before. Hit-testing uses
// world coords directly (no screen-px conversion needed). At scale=1 (app=null
// in headless tests) the panel sits at the board corner in board-local coords.

import type { AppState } from '../../state';
import type { AnalyticPanel } from '../../ui/analyticPanel';
import { ANALYTIC_PANEL_THEME } from '../../ui/analyticPanel';
import type { FontFace } from '../../windfoil/font';
import type { GlyphAtlas } from '../../windfoil/bands';
import { cameraScale, cameraViewProj } from '../../camera/camera';

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

/** Position (and show/hide by visibility) one board's slider panel for this frame.
 *  Positions in DOC coords at the board's corner, with screen-constant size. */
export function positionBoardPanel(b: SliderBoard, s: AppState | null): void {
  if (!b.panel) return;
  const Cw = s ? s.tCanvas.width : 1e9;
  const Ch = s ? s.tCanvas.height : 1e9;
  const c = worldToScreenPx(b.x0, b.y0, s);
  const vis = c.x > -600 && c.x < Cw + 600 && c.y > -600 && c.y < Ch + 600;
  if (!vis) { b.panel.open = false; return; }
  b.panel.open = true;
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
