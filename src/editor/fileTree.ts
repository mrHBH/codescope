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
  line: number[]; selected: number[]; hover: number[];
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
  // followingSiblings[d] = true if at depth d the parent has more children after
  followingSiblings: boolean[];
}

const SAMPLE_TREE: TreeNode[] = [
  { name: 'src', path: 'src', type: 'folder', children: [
    { name: 'components', path: 'src/components', type: 'folder', children: [
      { name: 'Header.tsx', path: 'src/components/Header.tsx', type: 'file' },
      { name: 'Footer.tsx', path: 'src/components/Footer.tsx', type: 'file' },
      { name: 'Sidebar.tsx', path: 'src/components/Sidebar.tsx', type: 'file' },
    ]},
    { name: 'utils', path: 'src/utils', type: 'folder', children: [
      { name: 'helpers.ts', path: 'src/utils/helpers.ts', type: 'file' },
      { name: 'constants.ts', path: 'src/utils/constants.ts', type: 'file' },
    ]},
    { name: 'App.tsx', path: 'src/App.tsx', type: 'file' },
    { name: 'main.tsx', path: 'src/main.tsx', type: 'file' },
    { name: 'styles.css', path: 'src/styles.css', type: 'file' },
  ]},
  { name: 'public', path: 'public', type: 'folder', children: [
    { name: 'index.html', path: 'public/index.html', type: 'file' },
    { name: 'favicon.ico', path: 'public/favicon.ico', type: 'file' },
  ]},
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
  { name: 'vite.config.ts', path: 'vite.config.ts', type: 'file' },
];

export class FileTree {
  font: FontFace | null = null;
  focused = true;

  // World-space geometry
  x0 = 0; y0 = 0;
  width = 300;
  fontSize = 14;
  get lineHeight() { return this.fontSize * 1.7; }
  indent = 20;
  pad = 16;

  // State
  private roots: TreeNode[];
  private expanded: Set<string> = new Set();
  selected: string | null = null;
  hovered: string | null = null;

  // Cached flattened rows (rebuilt on expand/collapse)
  private flatRows: FlatRow[] = [];
  private dirty = true;

  constructor() {
    this.roots = SAMPLE_TREE;
    this.expanded.add('src');
    this.expanded.add('src/components');
    this.expanded.add('src/utils');
  }

  private get scale() { return this.font ? this.fontSize / (this.font as any).unitsPerEm : this.fontSize / 2048; }
  private advance(ch: string): number { return this.font ? advanceOf(this.font, ch) * this.scale : this.fontSize * 0.5; }
  private textWidth(text: string): number {
    let w = 0;
    for (const ch of text) w += this.advance(ch);
    return w;
  }

  get contentHeight(): number {
    this.ensureFlat();
    return this.pad * 2 + this.barH + this.flatRows.length * this.lineHeight + 8;
  }

  private get barH() { return this.fontSize * 1.6 + 8; }

  private ensureFlat() {
    if (!this.dirty) return;
    this.flatRows = this.flatten();
    this.dirty = false;
  }

  private flatten(): FlatRow[] {
    const rows: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        rows.push({ node, depth, isLast: i === nodes.length - 1, followingSiblings: [] });
        if (node.type === 'folder' && this.expanded.has(node.path)) {
          walk(node.children!, depth + 1);
        }
      }
    };
    walk(this.roots, 0);
    // Post-process: followingSiblings[d] = true if a later row at depth d exists
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sibs: boolean[] = [];
      for (let d = 0; d <= row.depth; d++) {
        let has = false;
        for (let j = i + 1; j < rows.length; j++) { if (rows[j].depth === d) { has = true; break; } }
        sibs.push(has);
      }
      row.followingSiblings = sibs;
    }
    return rows;
  }

  toggleFolder(path: string) {
    const node = this.findNode(path);
    if (!node || node.type !== 'folder') return;
    if (this.expanded.has(path)) this.expanded.delete(path);
    else this.expanded.add(path);
    this.dirty = true;
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
    const top = this.bodyTop;
    const idx = Math.floor((wy - top) / this.lineHeight);
    if (idx >= 0 && idx < this.flatRows.length) return this.flatRows[idx];
    return null;
  }

  // Returns true if the world point is on the chevron of the given row
  isOnChevron(wx: number, row: FlatRow): boolean {
    const cx = this.x0 + this.pad + row.depth * this.indent + 2;
    return wx >= cx - 4 && wx <= cx + 14;
  }

  private get bodyTop() { return this.y0 + this.pad + this.barH; }

  // ── Render ──────────────────────────────────────────────────────────────────
  render(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[],
         worldTop: number, worldBottom: number, now: number, th: FileTreeTheme) {
    if (!this.font) this.font = font;
    this.ensureFlat();

    const lh = this.lineHeight;
    const totalH = this.contentHeight;
    const indent = this.indent;
    const bodyTop = this.bodyTop;

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
    const title = 'files';
    const titleW = this.textWidth(title);
    const s = this.scale;
    this.emitText(inst, atlas, s, title, th.barFg, this.x0 + this.width / 2 - titleW / 2, this.y0 + barH / 2 + this.fontSize * 0.35);

    // Hairline under title bar
    addRect(this.x0, this.y0 + barH - 1, this.x0 + this.width, this.y0 + barH, [th.line[0], th.line[1], th.line[2], 0.18], crv, rws, inst);

    // Visible rows
    const first = Math.max(0, Math.floor((worldTop - bodyTop) / lh) - 1);
    const last = Math.min(this.flatRows.length - 1, Math.ceil((worldBottom - bodyTop) / lh) + 1);

    const treeLineColor: number[] = [th.line[0], th.line[1], th.line[2], 0.35];

    for (let i = first; i <= last; i++) {
      const row = this.flatRows[i];
      const top = bodyTop + i * lh;
      const indentPx = row.depth * indent;

      // Row background hover/selection
      const isHovered = row.node.path === this.hovered;
      const isSelected = row.node.path === this.selected;
      if (isSelected) {
        addRect(this.x0, top, this.x0 + this.width, top + lh, th.selected, crv, rws, inst);
      } else if (isHovered) {
        addRect(this.x0, top, this.x0 + this.width, top + lh, th.hover, crv, rws, inst);
      }

      // Tree connector lines — one vertical segment per depth level that has
      // a following sibling. Segments stack vertically to form continuous lines.
      const lineXbase = this.x0 + this.pad + 6;
      const lineW = 1.2;
      for (let d = 0; d <= row.depth; d++) {
        if (!row.followingSiblings[d]) continue;
        const lx = lineXbase + d * indent;
        if (d < row.depth) {
          // Ancestor level: full vertical through this row
          addRect(lx, top, lx + lineW, top + lh, treeLineColor, crv, rws, inst);
        } else {
          // Current level: L-shaped connector — vertical stub + horizontal tick
          addRect(lx, top, lx + lineW, top + lh / 2, treeLineColor, crv, rws, inst);
          const tickLen = 10;
          addRect(lx, top + lh / 2 - lineW / 2, lx + tickLen, top + lh / 2 + lineW / 2, treeLineColor, crv, rws, inst);
        }
      }

      // Chevron for folders
      const chevX = this.x0 + this.pad + indentPx + 2;
      const iconY = top + lh / 2;
      const iconSize = this.fontSize * 1.1;

      if (row.node.type === 'folder') {
        const isExpanded = this.expanded.has(row.node.path);
        // Chevron icon (small triangle)
        const chGl = isExpanded ? atlas.table['icon:chevron'] : atlas.table['icon:chevronRight'];
        if (chGl) {
          const bl = iconY + iconSize * 0.2;
          inst.push(chevX, bl, this.scale * 1.0, 1, chGl.bbox[0], chGl.bbox[1], chGl.bbox[2], chGl.bbox[3], th.dim[0], th.dim[1], th.dim[2], th.dim[3], chGl.rowBase, chGl.bandCount, chGl.y0, chGl.invH);
        }
      }

      // Folder/file icon
      const iconX = chevX + (row.node.type === 'folder' ? 16 : 2);
      const isFolder = row.node.type === 'folder';
      const iconName = isFolder ? 'icon:folder' : 'icon:file';
      const gl = atlas.table[iconName];
      if (gl) {
        const iconClr = isFolder ? th.gold : th.dim;
        inst.push(iconX, iconY + iconSize * 0.05, this.scale * 1.0, 1, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], iconClr[0], iconClr[1], iconClr[2], iconClr[3], gl.rowBase, gl.bandCount, gl.y0, gl.invH);
      }

      // Name text
      const textX = iconX + (isFolder ? 19 : 19);
      const baseline = iconY + this.fontSize * 0.4;
      this.emitText(inst, atlas, s, row.node.name, isFolder ? th.folder : th.text, textX, baseline);
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
}
