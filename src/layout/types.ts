// ── Layout types ──────────────────────────────────────────────────────────

export interface Seg { kind:'word'|'space'|'nl'; text:string; color:number[]; }

export interface StyledEl {
  tag: string; classes: string[]; id: string;
  x: number; y: number; w: number; h: number;
  pad: number[];
  text: string;
  children: StyledEl[];
  parent: StyledEl | null;
  el: Element;
  fs: number; lh: number; radius: number;
  color: number[]; bg: number[]; textAlign: string; upper: boolean;
  curBg: number[]; curShadow: number;
  // Precomputed hover/active background colours (resolved once in buildStatic;
  // avoids running the CSS selector matcher every frame while hovering — that was
  // the cause of mouse-move FPS drops). `null` until computed / no such state.
  hoverBg?: number[] | null; activeBg?: number[] | null;
  // Per-side border widths [top,right,bottom,left] and their colors (RGBA). A
  // side draws only when its width > 0 and color alpha > 0.
  borderW: number[]; borderC: number[][];
  inline: boolean; skipText: boolean; hasFlow: boolean; isPre: boolean;
  inlineText: boolean;
  editable: boolean; editText: string; caret: number; selAnchor: number; originText: string;
  caretXs: number[] | null; caretLines: number[] | null; lineTops: number[] | null;
  // Precomputed per-frame dispatch flags (set once in walkDOM) — avoids repeated
  // classes.includes() scans and DOM getAttribute() calls in the frame loop.
  pageIdx: number; hoverable: boolean; shadowable: boolean; anim: string; dynamic: boolean;
  ownerPage: number;
  // Named hover effect (set once in walkDOM from a `hov-*` class). '' = the legacy
  // background-wash + shadow hover; otherwise the frame loop renders the named
  // analytic hover effect (see frame.ts renderHoverFx).
  hoverFx: string;
  // Named click effect (from a `clk-*` class) — a press-triggered animation
  // (ripple/burst/flash) timed off pressT. '' = none.
  clickFx: string;
  // Wall-clock time (performance.now) of the last pointerdown on this element —
  // drives click-effect animations. 0 = never pressed.
  pressT: number;
  // Vector art: atlas key (e.g. "icon:star" / "art:landscape"), else ''. When set
  // the element renders the shape scaled/centered into its box instead of text.
  icon: string;
}

export interface PageRect { x:number; y:number; w:number; h:number; }
