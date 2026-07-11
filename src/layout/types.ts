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
  inline: boolean; skipText: boolean; hasFlow: boolean; isPre: boolean;
  editable: boolean; editText: string; caret: number; selAnchor: number; originText: string;
  caretXs: number[] | null; caretLines: number[] | null; lineTops: number[] | null;
  // Precomputed per-frame dispatch flags (set once in walkDOM) — avoids repeated
  // classes.includes() scans and DOM getAttribute() calls in the frame loop.
  pageIdx: number; hoverable: boolean; shadowable: boolean; anim: string; dynamic: boolean;
  ownerPage: number;
  // Vector art: atlas key (e.g. "icon:star" / "art:landscape"), else ''. When set
  // the element renders the shape scaled/centered into its box instead of text.
  icon: string;
}

export interface PageRect { x:number; y:number; w:number; h:number; }
