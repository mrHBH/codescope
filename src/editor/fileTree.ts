// ── File tree ─────────────────────────────────────────────────────────────────
// A world-space file tree panel rendered through windfoil's analytic pipeline.
// Ported design from yasmineoss hybrid-coder: gold folder icons, tree connector
// lines, expand/collapse chevrons, and file-type icons.
//
// Rendering: items are laid out top-to-bottom with indentation per depth level.
// Tree lines are drawn as thin axis-aligned rects. Icons and text use the glyph
// atlas (icons are baked as "icon:name" entries). Viewport culling skips rows
// outside the camera's y-range.

import type { FontFace } from '../windfoil/font';
import { advanceOf } from '../windfoil/font';
import { addRect } from '../layout/metrics';

export interface FileTreeTheme {
  bg: number[]; barBg: number[]; barFg: number[];
  text: number[]; dim: number[]; gold: number[];
  folder: number[];
  line: number[]; accent: number[]; selected: number[]; hover: number[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

interface FlatRow {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  // For ancestor depth d (0-based), true when that ancestor has following
  // siblings after this row. Used to draw continuous connector lines.
  ancestorHasNext: boolean[];
  // Ancestor folder paths from root→parent (length = depth).
  ancestorPaths: string[];
}

const SAMPLE_TREE: TreeNode[] = [
  { name: 'src', path: 'src', type: 'folder', children: [
    { name: 'animations', path: 'src/animations', type: 'folder', children: [] },
    { name: 'camera', path: 'src/camera', type: 'folder', children: [
      { name: 'camera.ts', path: 'src/camera/camera.ts', type: 'file' },
      { name: 'input.ts', path: 'src/camera/input.ts', type: 'file' },
    ]},
    { name: 'content', path: 'src/content', type: 'folder', children: [
      { name: 'art.ts', path: 'src/content/art.ts', type: 'file' },
      { name: 'pages.ts', path: 'src/content/pages.ts', type: 'file' },
      { name: 'pages', path: 'src/content/pages', type: 'folder', children: [
        { name: '00-foundations.html', path: 'src/content/pages/00-foundations.html', type: 'file' },
        { name: '01-controls.html', path: 'src/content/pages/01-controls.html', type: 'file' },
        { name: '02-data-status.html', path: 'src/content/pages/02-data-status.html', type: 'file' },
        { name: '03-layout-content.html', path: 'src/content/pages/03-layout-content.html', type: 'file' },
      ] },
    ]},
    { name: 'css', path: 'src/css', type: 'folder', children: [
      { name: 'engine.ts', path: 'src/css/engine.ts', type: 'file' },
      { name: 'theme.ts', path: 'src/css/theme.ts', type: 'file' },
      { name: 'themeController.ts', path: 'src/css/themeController.ts', type: 'file' },
    ]},
    { name: 'editor', path: 'src/editor', type: 'folder', children: [
      { name: 'document.ts', path: 'src/editor/document.ts', type: 'file' },
      { name: 'editor.ts', path: 'src/editor/editor.ts', type: 'file' },
      { name: 'editorInput.ts', path: 'src/editor/editorInput.ts', type: 'file' },
      { name: 'fileTree.ts', path: 'src/editor/fileTree.ts', type: 'file' },
      { name: 'highlight.ts', path: 'src/editor/highlight.ts', type: 'file' },
      { name: 'sample.ts', path: 'src/editor/sample.ts', type: 'file' },
      { name: 'terminal.ts', path: 'src/editor/terminal.ts', type: 'file' },
    ]},
    { name: 'layout', path: 'src/layout', type: 'folder', children: [
      { name: 'editable.ts', path: 'src/layout/editable.ts', type: 'file' },
      { name: 'flow.ts', path: 'src/layout/flow.ts', type: 'file' },
      { name: 'metrics.ts', path: 'src/layout/metrics.ts', type: 'file' },
      { name: 'types.ts', path: 'src/layout/types.ts', type: 'file' },
      { name: 'walk.ts', path: 'src/layout/walk.ts', type: 'file' },
    ]},
    { name: 'ui', path: 'src/ui', type: 'folder', children: [
      { name: 'contextMenu.ts', path: 'src/ui/contextMenu.ts', type: 'file' },
      { name: 'icons.ts', path: 'src/ui/icons.ts', type: 'file' },
      { name: 'interactions.ts', path: 'src/ui/interactions.ts', type: 'file' },
      { name: 'toolbar.ts', path: 'src/ui/toolbar.ts', type: 'file' },
    ]},
    { name: 'windfoil', path: 'src/windfoil', type: 'folder', children: [
      { name: 'bands.ts', path: 'src/windfoil/bands.ts', type: 'file' },
      { name: 'font.ts', path: 'src/windfoil/font.ts', type: 'file' },
      { name: 'geometry.ts', path: 'src/windfoil/geometry.ts', type: 'file' },
      { name: 'gpu.ts', path: 'src/windfoil/gpu.ts', type: 'file' },
      { name: 'svg.ts', path: 'src/windfoil/svg.ts', type: 'file' },
      { name: 'windfoil.wgsl', path: 'src/windfoil/windfoil.wgsl', type: 'file' },
    ]},
    { name: 'frame.ts', path: 'src/frame.ts', type: 'file' },
    { name: 'main.ts', path: 'src/main.ts', type: 'file' },
    { name: 'precompute.ts', path: 'src/precompute.ts', type: 'file' },
    { name: 'state.ts', path: 'src/state.ts', type: 'file' },
  ]},
  { name: 'public', path: 'public', type: 'folder', children: [] },
  { name: 'index.html', path: 'index.html', type: 'file' },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'PROGRESS.md', path: 'PROGRESS.md', type: 'file' },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
  { name: 'VISION.md', path: 'VISION.md', type: 'file' },
  { name: 'vite.config.ts', path: 'vite.config.ts', type: 'file' },
];

export class FileTree {
  font: FontFace | null = null;
  focused = true;

  // World-space geometry
  x0 = 0; y0 = 0;
  width = 300;
  height = 560;
  fontSize = 14;
  get lineHeight() { return this.fontSize * 1.7; }
  indent = 16;
  pad = 16;
  private readonly iconUnits = 24;

  // State
  private roots: TreeNode[];
  private expanded: Set<string> = new Set();
  private scrollY = 0;
  private chevAnim: Map<string, number> = new Map();  // target: 0=collapsed, 1=expanded
  private chevDisp: Map<string, number> = new Map();  // displayed (animated) value
  private _lastNow = 0;
  selected: string | null = null;
  hovered: string | null = null;

  // Cached flattened rows (rebuilt on expand/collapse)
  private flatRows: FlatRow[] = [];
  private dirty = true;

  constructor() {
    this.roots = SAMPLE_TREE;
    this.expanded.add('src');
    this.expanded.add('src/camera');
    this.expanded.add('src/content');
    this.expanded.add('src/content/pages');
    this.expanded.add('src/css');
    this.expanded.add('src/editor');
    this.expanded.add('src/layout');
    this.expanded.add('src/ui');
    this.expanded.add('src/windfoil');
    for (const p of this.expanded) this.chevAnim.set(p, 1);
  }

  private get scale() { return this.font ? this.fontSize / (this.font as any).unitsPerEm : this.fontSize / 2048; }
  private advance(ch: string): number { return this.font ? advanceOf(this.font, ch) * this.scale : this.fontSize * 0.5; }
  private textWidth(text: string): number {
    let w = 0;
    for (const ch of text) w += this.advance(ch);
    return w;
  }

  get contentHeight(): number {
    return this.height;
  }

  private get bodyH() { return Math.max(this.height - this.pad * 2 - this.barH - 8, this.lineHeight); }
  private get listHeight() { this.ensureFlat(); return this.flatRows.length * this.lineHeight; }
  private get maxScroll() { return Math.max(0, this.listHeight - this.bodyH); }

  scrollBy(dy: number) {
    this.scrollY = Math.min(Math.max(this.scrollY + dy, 0), this.maxScroll);
  }

  setViewportHeight(hWorld: number) {
    const minH = 320;
    this.height = Math.max(minH, Math.min(hWorld - 48, 860));
    if (this.height < minH) this.height = minH;
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
  }

  private get barH() { return this.fontSize * 1.6 + 8; }

  private ensureFlat() {
    if (!this.dirty) return;
    this.flatRows = this.flatten();
    this.dirty = false;
  }

  private flatten(): FlatRow[] {
    const rows: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number, ancestorHasNext: boolean[], ancestorPaths: string[]) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isLast = i === nodes.length - 1;
        rows.push({ node, depth, isLast, ancestorHasNext: ancestorHasNext.slice(), ancestorPaths: ancestorPaths.slice() });
        if (node.type === 'folder' && this.expanded.has(node.path)) {
          walk(node.children || [], depth + 1, ancestorHasNext.concat(!isLast), ancestorPaths.concat(node.path));
        }
      }
    };
    walk(this.roots, 0, [], []);
    return rows;
  }

  toggleFolder(path: string) {
    const node = this.findNode(path);
    if (!node || node.type !== 'folder') return;
    if (this.expanded.has(path)) this.expanded.delete(path);
    else this.expanded.add(path);
    this.chevAnim.set(path, this.expanded.has(path) ? 1 : 0);
    this.dirty = true;
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
  }

  select(path: string) {
    this.selected = path;
  }

  private findNode(path: string): TreeNode | null {
    const walk = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children) { const r = walk(n.children); if (r) return r; }
      }
      return null;
    };
    return walk(this.roots);
  }

  // Hit-test helpers. Returns the path of the row at a world y, or null.
  rowAtY(wy: number): FlatRow | null {
    this.ensureFlat();
    const top = this.bodyTop - this.scrollY;
    const idx = Math.floor((wy - top) / this.lineHeight);
    if (idx >= 0 && idx < this.flatRows.length) return this.flatRows[idx];
    return null;
  }

  private get chevSize() { return this.fontSize * 1.0; }
  // Tree guide-line center for a given depth (chevron tip aligns here).
  private guideXFor(depth: number): number {
    return this.x0 + this.pad + 6 + depth * this.indent;
  }

  // Returns true if the world point is on the chevron of the given row
  isOnChevron(wx: number, row: FlatRow): boolean {
    const cx = this.guideXFor(row.depth) - this.chevSize / 2;
    return wx >= cx - 3 && wx <= cx + this.chevSize + 3;
  }

  // If wx hits a connector line for this row, return the folder path that line
  // belongs to (matching hybridcoder's line-click-to-toggle behavior).
  connectorTarget(wx: number, row: FlatRow): string | null {
    if (row.depth <= 0) return null;
    const cx = this.guideXFor(row.depth) - this.chevSize / 2;
    if (wx >= cx - 6 && wx <= cx + this.chevSize + 6) return null;
    const lineXbase = this.x0 + this.pad + 6;
    const tol = 2.2;
    for (let d = 0; d < row.depth; d++) {
      if (!row.ancestorHasNext[d]) continue;
      const lx = lineXbase + d * this.indent;
      if (Math.abs(wx - lx) <= tol) return row.ancestorPaths[d] || null;
    }
    const lx = lineXbase + row.depth * this.indent;
    if (Math.abs(wx - lx) <= tol) return row.ancestorPaths[row.depth - 1] || null;
    return null;
  }

  private fileIconFor(path: string): { name: string; color: number[] } {
    const p = path.toLowerCase();
    const ext = p.includes('.') ? p.slice(p.lastIndexOf('.') + 1) : '';
    if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'wgsl') {
      return { name: 'icon:code', color: [0.39, 0.67, 0.96, 1] };
    }
    if (ext === 'html') return { name: 'icon:file', color: [0.90, 0.56, 0.36, 1] };
    if (ext === 'css') return { name: 'icon:file', color: [0.56, 0.70, 0.96, 1] };
    if (ext === 'json') return { name: 'icon:file', color: [0.90, 0.80, 0.45, 1] };
    if (ext === 'md') return { name: 'icon:file', color: [0.62, 0.78, 0.70, 1] };
    return { name: 'icon:file', color: [0.62, 0.66, 0.76, 1] };
  }

  private get bodyTop() { return this.y0 + this.pad + this.barH; }

  // ── Render ──────────────────────────────────────────────────────────────────
  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[],
         worldTop: number, worldBottom: number, now: number, th: FileTreeTheme) {
    if (!this.font) this.font = font;
    this.ensureFlat();
    const dt = this._lastNow ? Math.min((now - this._lastNow) / 1000, 0.05) : 0;
    this._lastNow = now;

    const lh = this.lineHeight;
    const totalH = this.contentHeight;
    const indent = this.indent;
    const bodyTop = this.bodyTop;
    const listTop = bodyTop - this.scrollY;

    // Panel + title bar
    addRect(this.x0, this.y0, this.x0 + this.width, this.y0 + totalH, th.bg, crv, rws, inst);
    const barH = this.barH;
    addRect(this.x0, this.y0, this.x0 + this.width, this.y0 + barH, th.barBg, crv, rws, inst);

    // Traffic-light dots
    const dot = this.fontSize * 0.45, dy = this.y0 + barH / 2 - dot / 2;
    addRect(this.x0 + 12, dy, this.x0 + 12 + dot, dy + dot, [0.85, 0.33, 0.31, 1], crv, rws, inst);
    addRect(this.x0 + 12 + dot * 2, dy, this.x0 + 12 + dot * 3, dy + dot, [0.94, 0.68, 0.30, 1], crv, rws, inst);
    addRect(this.x0 + 12 + dot * 4, dy, this.x0 + 12 + dot * 5, dy + dot, [0.42, 0.80, 0.44, 1], crv, rws, inst);

    // Title
    const title = 'workspace';
    const titleW = this.textWidth(title);
    const s = this.scale;
    this.emitText(inst, atlas, s, title, th.barFg, this.x0 + this.width / 2 - titleW / 2, this.y0 + barH / 2 + this.fontSize * 0.35);

    // Hairline under title bar
    addRect(this.x0, this.y0 + barH - 1, this.x0 + this.width, this.y0 + barH, [th.line[0], th.line[1], th.line[2], 0.18], crv, rws, inst);

    // Visible rows
    const first = Math.max(0, Math.floor((worldTop - listTop) / lh) - 1);
    const last = Math.min(this.flatRows.length - 1, Math.ceil((worldBottom - listTop) / lh) + 1);

    const treeLineColor: number[] = [th.line[0], th.line[1], th.line[2], 0.35];
    const accent = th.accent || th.dim;
    const hoverPulse = 0.65 + 0.35 * Math.sin(now / 220);
    const hoveredRow = this.hovered ? this.flatRows.find((r) => r.node.path === this.hovered) : null;
    const selectedRow = this.selected ? this.flatRows.find((r) => r.node.path === this.selected) : null;
    const activeRow = hoveredRow || selectedRow;

    for (let i = first; i <= last; i++) {
      const row = this.flatRows[i];
      const top = listTop + i * lh;
      if (top + lh < bodyTop || top > bodyTop + this.bodyH) continue;
      const depth = row.depth;

      const lineXbase = this.x0 + this.pad + 6;
      const guideX = lineXbase + depth * indent;       // tree line center for this depth
      const chevSize = this.chevSize;
      const iconSize = this.fontSize * 1.05;
      // Icon column is offset from the guide line so the chevron (centered on the
      // line) sits in its own clear column and never collides with the icon.
      const iconX = guideX + 13;
      const textX = iconX + iconSize + 4;
      const iconY = top + lh / 2;
      const baseline = iconY + this.fontSize * 0.4;

      // ── Connected-path highlight ───────────────────────────────────────────
      // On hover/select, accent the tree connector lines forming the item's path
      // through the tree: its own L, plus every ancestor rail it shares, drawn
      // continuously up to the chevron of the nearest collapsible folder.
      const isHovered = row.node.path === this.hovered;
      const isSelected = row.node.path === this.selected;
      const onActivePath = !!activeRow &&
        (row.node.path === activeRow.node.path || activeRow.node.path.startsWith(row.node.path + '/'));
      const pathAccent = (a: number): number[] => [accent[0], accent[1], accent[2], a];
      const pathA = isHovered || isSelected ? 0.98 : 0.82;
      // Persistent selection strip (hover is conveyed by the line accent below).
      if (isSelected) addRect(this.x0, top, this.x0 + this.width, top + lh, th.selected, crv, rws, inst);

      // Tree connector lines with proper ancestry continuation.
      const lineW = 1.0;
      // Ancestor rails: continuous verticals for every ancestor that has a
      // following sibling. Accented only when this row shares that ancestor with
      // the active (hovered/selected) item, so the highlighted path stays
      // connected from the root down to the item.
      for (let d = 0; d < depth; d++) {
        if (!row.ancestorHasNext[d]) continue;
        const lx = lineXbase + d * indent;
        const sharesAncestor = !!activeRow && d < activeRow.depth && row.ancestorPaths[d] === activeRow.ancestorPaths[d];
        const col = sharesAncestor ? pathAccent(pathA) : treeLineColor;
        addRect(lx, top, lx + lineW, top + lh, col, crv, rws, inst);
      }
      // Current-depth connector: the vertical rail continues to the next row (or
      // to the last descendant) and a horizontal tick branches to the label.
      // Only the absolute last item ends at the elbow, so rails stay connected
      // through a last folder and its children. For a folder, the rail is gapped
      // around the chevron (which sits at the intercept) and the tick starts just
      // past the chevron, so the guide lines never cross the chevron.
      if (depth > 0) {
        const lx = lineXbase + depth * indent;
        const isLastItem = i === this.flatRows.length - 1;
        const col = onActivePath ? pathAccent(pathA) : treeLineColor;
        if (row.node.type === 'folder') {
          const midY = top + lh / 2;
          const vGap = iconSize * 0.20;               // half-gap for the chevron
          addRect(lx, top, lx + lineW, midY - vGap, col, crv, rws, inst);
          addRect(lx, midY + vGap, lx + lineW, isLastItem ? midY : top + lh, col, crv, rws, inst);
          const tickX0 = lx + iconSize * 0.25 + 2;    // just past the chevron
          addRect(tickX0, midY - lineW / 2, iconX, midY + lineW / 2, col, crv, rws, inst);
        } else {
          const vEnd = isLastItem ? top + lh / 2 : top + lh;
          addRect(lx, top, lx + lineW, vEnd, col, crv, rws, inst);
          addRect(lx, top + lh / 2 - lineW / 2, iconX, top + lh / 2 + lineW / 2, col, crv, rws, inst);
        }
      }

      // Folder open/closed animation value (eased toward target). Shared by the
      // chevron rotation and the folder-icon cross-fade below.
      let folderT = 0;
      if (row.node.type === 'folder') {
        const target = this.chevAnim.get(row.node.path) ?? (this.expanded.has(row.node.path) ? 1 : 0);
        const prev = this.chevDisp.get(row.node.path) ?? target;
        folderT = prev + (target - prev) * (1 - Math.exp(-dt * 16));
        this.chevDisp.set(row.node.path, folderT);
      }

      // Chevron for folders — centered on the guide line (the intercept), animated.
      if (row.node.type === 'folder') {
        // Subtle scale "pop" peaks mid-transition for a livelier feel.
        const pop = 1 + 0.18 * Math.sin(Math.PI * Math.max(0, Math.min(1, folderT)));
        const sIcon = (iconSize / this.iconUnits) * pop;
        const ca = isSelected ? 1 : (isHovered || onActivePath) ? 0.7 + 0.3 * hoverPulse : 1;
        const cc = (isHovered || isSelected || onActivePath) ? accent : th.dim;
        const chDown = atlas.table['icon:chevron'];
        const chRight = atlas.table['icon:chevronRight'];
        // Center the ink at (guideX, midY) so it lands exactly on the line intercept.
        if (chRight && (1 - folderT) > 0.01) {
          this.pushCentered(inst, chRight, guideX, iconY, sIcon, cc, ca * (1 - folderT));
        }
        if (chDown && folderT > 0.01) {
          this.pushCentered(inst, chDown, guideX, iconY, sIcon, cc, ca * folderT);
        }
      }

      // Folder/file icon (file type aware) — clear of the tree line, ink centered.
      const isFolder = row.node.type === 'folder';
      const fileIcon = this.fileIconFor(row.node.path);
      const sIcon = iconSize / this.iconUnits;
      const iconCx = iconX + iconSize / 2;
      const iconCy = iconY;
      if (isFolder) {
        // Cross-fade closed ↔ open folder in sync with the chevron rotation.
        const closed = atlas.table['icon:folder'];
        const open = atlas.table['icon:folderOpen'];
        const ca = isSelected ? 1 : (isHovered || onActivePath) ? 0.85 + 0.15 * hoverPulse : 1;
        this.pushCentered(inst, closed, iconCx, iconCy, sIcon, th.gold, ca * (1 - folderT));
        this.pushCentered(inst, open, iconCx, iconCy, sIcon, th.gold, ca * folderT);
      } else {
        const gl = atlas.table[fileIcon.name];
        if (gl) this.pushCentered(inst, gl, iconCx, iconCy, sIcon, fileIcon.color, 1);
      }

      // Name text
      this.emitText(inst, atlas, s, row.node.name, isFolder ? th.folder : th.text, textX, baseline);
    }

    // Scrollbar
    if (this.maxScroll > 0.1) {
      const trackX0 = this.x0 + this.width - 6;
      const trackX1 = this.x0 + this.width - 4;
      const trackY0 = bodyTop;
      const trackY1 = bodyTop + this.bodyH;
      addRect(trackX0, trackY0, trackX1, trackY1, [th.line[0], th.line[1], th.line[2], 0.35], crv, rws, inst);

      const thumbH = Math.max(24, this.bodyH * (this.bodyH / Math.max(this.listHeight, 1)));
      const t = this.maxScroll > 0 ? this.scrollY / this.maxScroll : 0;
      const thumbY = trackY0 + (this.bodyH - thumbH) * t;
      addRect(trackX0 - 0.6, thumbY, trackX1 + 0.6, thumbY + thumbH, [th.dim[0], th.dim[1], th.dim[2], 0.9], crv, rws, inst);
    }
  }

  private emitText(inst: number[], atlas: any, s: number, text: string, color: number[], x: number, baseline: number) {
    let cx = x;
    for (const ch of text) {
      if (ch === ' ') { cx += this.advance(ch); continue; }
      const gl = atlas.table[ch];
      if (gl) inst.push(cx, baseline, s, 0, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], color[3], gl.rowBase, gl.bandCount, gl.y0, gl.invH);
      cx += this.advance(ch);
    }
  }

  // Pushes a glyph so its ink-bbox CENTER lands at (cx, cy). windfoil places a
  // glyph by its ink-bbox low corner (place.xy), so we must offset by half the
  // ink box — using sIcon/2 (assumes a 24x24 ink box) is what shoved the chevron
  // diagonally bottom-right off the guide line.
  private pushCentered(inst: number[], gl: any, cx: number, cy: number, sIcon: number, color: number[], alpha: number) {
    if (!gl) return;
    const bw = gl.bbox[2] - gl.bbox[0];
    const bh = gl.bbox[3] - gl.bbox[1];
    const x = cx - (bw / 2) * sIcon;
    const y = cy - (bh / 2) * sIcon;
    inst.push(x, y, sIcon, 1, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], color[0], color[1], color[2], alpha, gl.rowBase, gl.bandCount, gl.y0, gl.invH);
  }
}
