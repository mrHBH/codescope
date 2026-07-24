// ── Filled vector art ────────────────────────────────────────────────────────
// SVG path data for icons + illustrations that render through windfoil's analytic
// FILL pipeline (not the stroked DOM icons in ui/icons.ts). All art is authored on
// a 24×24 viewBox with Y-down coordinates, matching the renderer's world space, so
// paths drop straight into the glyph atlas and stay razor-sharp at any zoom.
//
// Each entry is one or more `d` strings (compound paths). Even-odd holes work
// because the winding integral handles overlap; where a hole is needed the inner
// contour is wound opposite to the outer.

// Solid, single-color glyph-style icons (Material-ish silhouettes).
// File tree icons (port from yasmineoss hybrid-coder).
// Folder shapes follow the yasmineoss closed/open folder design with gold (#dcb67a) aesthetic.
export const ICONS: Record<string, string | string[]> = {
  star: 'M12 2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.8 5.9 20.9 7.3 14.2 2.3 9.6l6.8-.8z',
  heart: 'M12 21C7 16.9 3 13.3 3 9.2 3 6.4 5.2 4.5 7.6 4.5c1.6 0 3.2.8 4.4 2.3C13.2 5.3 14.8 4.5 16.4 4.5 18.8 4.5 21 6.4 21 9.2c0 4.1-4 7.7-9 11.8z',
  bolt: 'M13 2L4.5 13.5H11l-1.5 8.5L20 9.5H13z',
  check: 'M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6 12-12-1.4-1.4z',
  play: 'M8 5v14l11-7z',
  gear: 'M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.5 3.4c0-.5 0-1-.1-1.4l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.4-1.4L15 2H9l-.6 2.8A7 7 0 0 0 6 6.2l-2.4-1-2 3.4 2 1.6c0 .4-.1.9-.1 1.4s0 1 .1 1.4l-2 1.6 2 3.4 2.4-1c.7.6 1.5 1 2.4 1.4L9 22h6l.6-2.8c.9-.4 1.7-.8 2.4-1.4l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.4z',
  cloud: 'M18.5 10a5.5 5.5 0 0 0-10.6-1.5A4.5 4.5 0 0 0 6.5 19h12a4 4 0 0 0 0-8z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z',
  rocket: 'M12 2c3.5 2 5.5 6 5.5 10l-2.5 2.5H9L6.5 12C6.5 8 8.5 4 12 2zm0 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM7.5 16 6 20l4-1.5zm9 0-2.5 2.5L18 20z',
  sparkle: 'M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6zM19 15l.8 2.7L22.5 18l-2.7.8L19 21l-.8-2.2L15.5 18l2.7-.3z',
  eye: 'M12 5C6.5 5 2.7 9.2 1.5 12 2.7 14.8 6.5 19 12 19s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.2a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  lock: 'M17 9h-1V7a4 4 0 1 0-8 0v2H7a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1zm-7-2a2 2 0 1 1 4 0v2h-4z',
  code: 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6z',
  chevron: 'M6 8 L12 14 L18 8 L18 11 L12 17 L6 11 Z',
  cross: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
  cube: 'M12 2 3 7v10l9 5 9-5V7z M12 4.3 18.5 8 12 11.7 5.5 8z M5 9.7l6 3.4v6.9l-6-3.3z M13 20v-6.9l6-3.4v7z',
  record: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',

  // ── File tree icons ────────────────────────────────────────────────────────
  // Folder — tab on top-left, rounded body (yasmineoss design). Open/closed
  // state is shown by the chevron rotation, so a single folder icon suffices.
  folder: 'M4,5 L9,5 L11,7 L20,7 A2,2 0 0,1 22,9 L22,19 A2,2 0 0,1 20,21 L4,21 A2,2 0 0,1 2,19 L2,7 A2,2 0 0,1 4,5 Z',
  // Open folder (back panel + front tray, see-through mouth) — cross-faded with
  // `folder` on expand/collapse.
  folderOpen: 'M2 14 V8 a2 2 0 0 1 2-2 h5 l2 2 h9 a2 2 0 0 1 2 2 v1 H4 a2 2 0 0 0-2 2 Z M2 14 h20 l-2 7 H4 Z',
  // Outline-style folder (even-odd fill creates a ring + inner cavity), closer
  // to hybridcoder's folder glyph appearance.
  folderOutline: 'M3,4 L9,4 L11,6 L21,6 L21,21 L3,21 Z M5,6 L8.4,6 L10.4,8 L19,8 L19,19 L5,19 Z',
  // Generic file / document with corner fold
  file: 'M7,3 L15,3 L19,7 L19,21 L5,21 L5,5 A2,2 0 0,1 7,3 Z M15,3 L15,7 L19,7 Z',
  // Chevron pointing right (for collapsed folders) — exact 90° rotation of
  // `chevron` so the expand/collapse cross-fade reads as a smooth rotation and
  // the glyph keeps the same weight in both states.
  chevronRight: 'M8 18 L14 12 L8 6 L11 6 L17 12 L11 18 Z',
  chevronUp: 'M6 15 L12 9 L18 15 L16.5 16.5 L12 12 L7.5 16.5 Z',
  search: 'M10 4a6 6 0 1 0 3.6 10.8l4.1 4.1 1.4-1.4-4.1-4.1A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  refresh: 'M12 5V2L7.5 6 12 10V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',

  copy: 'M9 9h9v9H9zM7 7h9v2H9v7H7z',
  cut: 'M6 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM6 13a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM9.5 8L20 15.5l-1 1.4L8.5 9.4zM9.5 16L20 8.5l1 1.4L10.5 17.4z',
  paste: 'M8 4h8v3H8zM6 6h2v2h8V6h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  selectAll: 'M4 4h16v16H4zM6 6v12h12V6zM9 12l2 2 4-4 1.4 1.4L11 17l-3.4-3.4z',
  trash: 'M5 7h14l-1 13H6zM4 5h16v2H4zM9 3h6v2H9zM9.5 10h1v7h-1zM13.5 10h1v7h-1z',
  closeOthers: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM8.3 8.3l1.4-1.4 7.4 7.4-1.4 1.4zM15.7 8.3l-1.4-1.4-7.4 7.4 1.4 1.4z',
  closeRight: 'M5 4h2v16H5zM10 8l4 4-4 4 1.4 1.4L16.8 12 11.4 6.6zM16 8l4 4-4 4 1.4 1.4L22.8 12 17.4 6.6z',
  filePlus: 'M7 3h8v4h4v14H7zM15 3l4 4h-4zM11 11h1.2v6H11zM8.5 13.4h6v1.2h-6z',
  folderPlus: 'M4 5h5l2 2h9v12H4zM11 10h1.2v6H11zM8.5 12.4h6v1.2h-6z',
  format: 'M4 6h16v2H4zM8 11h12v2H8zM4 16h16v2H4z',
  comment: 'M4 4h16v10H8l-4 4zM6 6h12v6H6z',
  undo: 'M4 12l5-5v3h6a4 4 0 0 1 0 8H9v-2h6a2 2 0 0 0 0-4H9v3z',
  redo: 'M20 12l-5-5v3H9a4 4 0 0 0 0 8h6v-2H9a2 2 0 0 1 0-4h6v3z',
  pencil: 'M17 3l4 4L7.5 20.5 2 22l1.5-5.5z',
  link: 'M8 16l-2 2a3.5 3.5 0 0 1-5-5l2-2a3.5 3.5 0 0 1 5 0l-1.4 1.4a1.5 1.5 0 0 0-2.2 0l-2 2a1.5 1.5 0 0 0 2.2 2.2l2-2zM16 8l2-2a3.5 3.5 0 0 1 5 5l-2 2a3.5 3.5 0 0 1-5 0l1.4-1.4a1.5 1.5 0 0 0 2.2 0l2-2a1.5 1.5 0 0 0-2.2-2.2l-2 2zM8.5 15.5l7-7 1.4 1.4-7 7z',
  external: 'M4 10v10h10v-4h2v6H2V8h6v2zM14 2h8v8h-2V5.4l-7.3 7.3-1.4-1.4L18.6 4H14z',
  terminalIcon: 'M3 4h18v16H3zM5 6v12h14V6zM7 10l3 2-3 2 1 1.4 4.4-3.4L8 8.6zM13 14h4v1.5h-4z',
  eraser: 'M19.5 9.5l-8-8a1.5 1.5 0 0 0-2.1 0L2 9l8 8 9.5-7.5zM4 20h16v2H4z',
  fit: 'M3 8V3h5v2H5v3zM16 3h5v5h-2V5h-3zM21 16v5h-5v-2h3v-3zM8 21H3v-5h2v3h3z',
  reset: 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
  theme: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM11 2h2v3h-2zM11 19h2v3h-2zM3.5 3.5l1.4 1.4 2.1 2.1-1.4 1.4-2.1-2.1zM17 17l1.4 1.4 2.1 2.1-1.4 1.4-2.1-2.1zM2 11h3v2H2zM19 11h3v2h-3zM3.5 20.5l1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1zM17 7l1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1z',
};

// Larger, multi-shape illustrations. Authored on the same 24×24 grid; the layout
// scales them up to their box. Each is a compound (array of subpaths).
export const ILLUSTRATIONS: Record<string, string[]> = {
  // A stylised mountain range with a sun — "landscape".
  landscape: [
    'M20 6.5a2.5 2.5 0 1 1 -5 0 2.5 2.5 0 0 1 5 0z',
    'M2 20l6-9 4 5.5 3-4 7 7.5z',
  ],
  // Overlapping document layers — "pages".
  pages: [
    'M6 3h8l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M8 8h6v1.6H8zM8 11h8v1.6H8zM8 14h8v1.6H8z',
  ],
  // Bar-chart growth — "analytics".
  analytics: [
    'M3 20h18v1.6H3z',
    'M5 12h3v7H5zM10 8h3v11h-3zM15 4h3v15h-3z',
  ],
};
