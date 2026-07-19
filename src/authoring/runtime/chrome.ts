// ── GUI Chrome panels rendered through the analytic pipeline ─────────────────
import type { SceneDoc, ObjectSpec, Vec2 } from '../ir/types';
import { DrawHelpers } from '../islands/draw';
import type { SceneRuntime } from './runtime';

interface ViewState { zoom: number; left: number; right: number; top: number; bottom: number; }

const C = {
  bg:    [0.07, 0.075, 0.09, 1],
  bar:   [0.10, 0.105, 0.13, 1],
  text:  [0.82, 0.83, 0.88, 1],
  dim:   [0.48, 0.50, 0.55, 1],
  accent:[0.12, 0.60, 0.95, 1],
  border:[0.17, 0.175, 0.21, 1],
  sel:   [0.10, 0.45, 0.80, 1],
  green: [0.30, 0.80, 0.40, 1],
  cyan:  [0.36, 0.85, 0.97, 1],
  gold:  [0.97, 0.73, 0.33, 1],
  rose:  [0.93, 0.36, 0.34, 1],
  accent2:[0.66, 0.42, 0.92, 1],
};

const KIND_COLORS: Record<string, number[]> = {
  text:    C.text,
  rect:    C.green,
  circle:  C.cyan,
  group:   C.gold,
  island:  C.rose,
  glyph:   C.accent,
  polygon: C.accent2,
  line:    C.dim,
  math:    C.accent,
};

const PANEL_W = 280;
const ROW_H = 26;
const TITLE_H = 32;

export class ChromeController {
  private runtime: SceneRuntime;
  selectedId: string | null = null;
  private expanded = new Set<string>();

  constructor(runtime: SceneRuntime) {
    this.runtime = runtime;
  }

  /** Emit all chrome panels at viewport-relative positions. */
  emit(draw: DrawHelpers, view: ViewState, now: number) {
    const z = view.zoom;
    const ox = view.left;
    const oy = view.top;

    this.emitObjectTree(draw, view, ox, oy);
    this.emitInspector(draw, view, ox, oy);
    this.emitTimeline(draw, view, ox, oy);
  }

  /** Handle click on panel area. Returns true if consumed. */
  handleClick(wx: number, wy: number, view: ViewState): boolean {
    const doc = this.runtime.getDoc();
    // Object tree panel hit test
    const treeH = this.treePanelHeight(doc);
    const tx0 = view.left;
    const ty0 = view.bottom - treeH / view.zoom;
    const tx1 = tx0 + PANEL_W / view.zoom;
    const ty1 = view.bottom;
    if (wx >= tx0 && wx <= tx1 && wy >= ty0 && wy <= ty1) {
      const rowIdx = Math.floor((view.bottom - wy) * view.zoom / ROW_H);
      const items = this.buildTreeItems(doc);
      if (rowIdx >= 0 && rowIdx < items.length) {
        this.selectedId = items[rowIdx].id;
        if (items[rowIdx].kind === 'group') {
          if (this.expanded.has(items[rowIdx].id)) this.expanded.delete(items[rowIdx].id);
          else this.expanded.add(items[rowIdx].id);
        }
        return true;
      }
    }
    return false;
  }

  // ── Object tree panel ──────────────────────────────────────────────────────
  private emitObjectTree(draw: DrawHelpers, view: ViewState, ox: number, oy: number) {
    const z = view.zoom;
    const doc = this.runtime.getDoc();
    const items = this.buildTreeItems(doc);
    const panelH = Math.max(120, TITLE_H + items.length * ROW_H);
    const x0 = ox;
    const y0 = view.bottom - panelH / z;
    const x1 = x0 + PANEL_W / z;
    const y1 = view.bottom;

    // Panel background
    draw.rect(x0, y0, x1, y1, C.bg);
    draw.rectStroke(x0, y0, x1, y1, C.border, 1.2);

    // Title bar
    draw.rect(x0, y0, x1, y0 + TITLE_H / z, C.bar);
    draw.text('Objects', x0 + 10 / z, y0 + 6 / z, 16, C.text);

    // Scroll region (if needed)
    const pz = z;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const ry = y0 + (TITLE_H + i * ROW_H) / z;
      const rH = ROW_H / z;
      if (ry + rH < y0 || ry > y1) continue;

      const isSel = item.id === this.selectedId;
      const indent = item.depth * 18 / z;

      // Row highlight on hover/select
      if (isSel) draw.rect(x0, ry, x1, ry + rH, C.sel, 0.22);

      // Kind dot
      const dotColor = KIND_COLORS[item.kind] ?? C.dim;
      const dotR = 4 / z;
      draw.fillCircle(x0 + 14 / z + indent, ry + rH / 2, dotR, dotColor);

      // Label
      const label = item.id + (item.kind === 'group' ? (this.expanded.has(item.id) ? ' ▾' : ' ▸') : '');
      draw.text(label, x0 + 24 / z + indent, ry + (rH - 14 / z) / 2, 14, isSel ? C.text : C.dim, 1, 'start');
    }
  }

  // ── Inspector panel ────────────────────────────────────────────────────────
  private emitInspector(draw: DrawHelpers, view: ViewState, ox: number, _oy: number) {
    const z = view.zoom;
    const doc = this.runtime.getDoc();
    const selId = this.selectedId;
    if (!selId) return;

    const spec = doc.objects[selId] as any;
    if (!spec) return;

    const x0 = ox + (PANEL_W + 12) / z;
    const w = 300 / z;
    const h = 260 / z;
    const y0 = view.bottom - h;
    const x1 = x0 + w;
    const y1 = y0 + h;

    draw.rect(x0, y0, x1, y1, C.bg);
    draw.rectStroke(x0, y0, x1, y1, C.border, 1.2);

    // Title
    draw.rect(x0, y0, x1, y0 + TITLE_H / z, C.bar);
    draw.text(`Inspector: ${spec.id}`, x0 + 10 / z, y0 + 6 / z, 15, C.accent);

    // Properties
    const props: [string, string][] = [
      ['kind', spec.kind ?? '—'],
      ['id', spec.id ?? '—'],
    ];
    if (spec.at) { props.push(['at', `[${spec.at[0].toFixed(0)}, ${spec.at[1].toFixed(0)}]`]); }
    if (spec.size) {
      if (Array.isArray(spec.size)) props.push(['size', `[${spec.size[0].toFixed(0)}, ${spec.size[1].toFixed(0)}]`]);
      else props.push(['size', spec.size.toFixed(1)]);
    }
    if (spec.content !== undefined) props.push(['content', spec.content.slice(0, 40) + (spec.content.length > 40 ? '…' : '')]);
    if (spec.fill) props.push(['fill', `[${spec.fill.map((v: number) => v.toFixed(2)).join(',')}]`]);
    if (spec.color) props.push(['color', `[${spec.color.map((v: number) => v.toFixed(2)).join(',')}]`]);

    for (let i = 0; i < props.length; i++) {
      const ry = y0 + (TITLE_H + 8 + i * 22) / z;
      draw.text(props[i][0], x0 + 10 / z, ry, 13, C.dim, 1, 'start');
      draw.text(props[i][1], x0 + 100 / z, ry, 13, C.text, 1, 'start');
    }
  }

  // ── Timeline clip-lane panel ──────────────────────────────────────────────
  private emitTimeline(draw: DrawHelpers, view: ViewState, ox: number, _oy: number) {
    const z = view.zoom;
    const doc = this.runtime.getDoc();
    const total = this.runtime.totalDuration();
    if (total <= 0) return;
    const t = this.runtime.tourT;
    const clips = doc.clips;
    if (clips.length === 0) return;

    const vw = (view.right - view.left);
    const w = Math.min(800 / z, vw * 0.7);
    const h = 80 / z;
    const x0 = ox + (vw - w) / 2;
    const y0 = view.bottom - h - 8 / z;
    const x1 = x0 + w;
    const y1 = y0 + h;
    const TW = w - 20 / z;

    draw.rect(x0, y0, x1, y1, C.bg);
    draw.rectStroke(x0, y0, x1, y1, C.border, 1.2);
    draw.rect(x0, y0, x1, y0 + TITLE_H / z, C.bar);
    draw.text(`Timeline · ${t.toFixed(1)}s / ${total.toFixed(1)}s`, x0 + 10 / z, y0 + 6 / z, 14, C.text);

    const laneY = y0 + TITLE_H / z + 4 / z;
    const laneH = h - TITLE_H / z - 10 / z;

    // Clip blocks
    const CLIP_COLORS: Record<string, number[]> = {
      fadeIn: C.green, fadeOut: C.rose, draw: C.cyan,
      write: C.accent, moveTo: C.gold, scaleTo: C.accent2,
      rotateTo: C.accent, morph: C.rose, param: C.gold,
    };
    for (const clip of clips) {
      const cx = x0 + 10 / z + (clip.start / total) * TW;
      const cw = Math.max(4 / z, (clip.duration / total) * TW);
      const col = CLIP_COLORS[clip.kind] ?? C.dim;
      draw.rect(cx, laneY, cx + cw, laneY + laneH, col, 0.7);
      const labelW = (clip.target ?? '').length * 7 / z;
      if (cw > labelW + 8 / z) {
        draw.text(clip.target, cx + 3 / z, laneY + laneH / 2 - 6 / z, 11, C.text, 1, 'start');
      }
    }

    // Scrub line
    const sx = x0 + 10 / z + (t / total) * TW;
    draw.line([[sx, laneY - 4 / z], [sx, laneY + laneH + 4 / z]], C.gold, 2, 1);
    draw.fillCircle(sx, laneY + laneH / 2, 5 / z, C.gold, 1);
  }

  // ── Tree builder ───────────────────────────────────────────────────────────
  private buildTreeItems(doc: SceneDoc): TreeItem[] {
    const parentMap = new Map<string, string>();
    for (const [id, spec] of Object.entries(doc.objects)) {
      if (spec.kind === 'group') {
        for (const cid of spec.children) parentMap.set(cid, id);
      }
    }
    // Find roots (objects with no parent or parent not a group)
    const roots: string[] = [];
    for (const id of Object.keys(doc.objects)) {
      const p = parentMap.get(id);
      if (!p || !doc.objects[p] || doc.objects[p].kind !== 'group') roots.push(id);
    }

    const items: TreeItem[] = [];
    const visited = new Set<string>();
    const walk = (id: string, depth: number) => {
      if (visited.has(id)) return;
      visited.add(id);
      const spec = doc.objects[id];
      if (!spec) return;
      items.push({ id, kind: spec.kind, depth });
      if (spec.kind === 'group' && this.expanded.has(id)) {
        for (const cid of spec.children) {
          if (doc.objects[cid]) walk(cid, depth + 1);
        }
      }
    };
    for (const r of roots) walk(r, 0);
    return items;
  }

  private treePanelHeight(doc: SceneDoc): number {
    const n = Object.keys(doc.objects).length;
    return TITLE_H + n * ROW_H;
  }
}

interface TreeItem { id: string; kind: string; depth: number; }
