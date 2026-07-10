// ── Layout types ──────────────────────────────────────────────────────────
import type { FontFace } from '../windfoil/font';

export type { FontFace };

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
}

export interface PageRect { x:number; y:number; w:number; h:number; }
