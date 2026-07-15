// ── Windfoil metrics + syntax highlighting ──────────────────────────────────
// Pure helpers: text width, glyph instance emission, rounded-rect decomposition,
// and the code tokenizer used by <pre> blocks.

import type { FontFace } from '../windfoil/font';
import { advanceOf, kerningOf } from '../windfoil/font';
import type { Seg } from './types';
import { parseColor } from '../css/engine';

// Font metrics are constant, but `advanceOf`/`kerningOf` do opentype cmap lookups
// (`charToGlyph`) on every call — thousands per frame for dynamic text (editor,
// terminal, marquee, math/graph boards). Cache them (keyed by char / char-pair;
// UI text always uses the one base font). This is what made a text-heavy frame
// tank when the mouse moved.
const _advCache = new Map<string, number>();
const _kernCache = new Map<string, number>();
function advCached(font: FontFace, ch: string): number {
  let v = _advCache.get(ch);
  if (v === undefined) { v = advanceOf(font, ch); _advCache.set(ch, v); }
  return v;
}
function kernCached(font: FontFace, a: string, b: string): number {
  const key = a + b;
  let v = _kernCache.get(key);
  if (v === undefined) { v = kerningOf(font, a, b); _kernCache.set(key, v); }
  return v;
}

export function tw(text: string, font: FontFace, size: number): number {
  const s=size/font.unitsPerEm;let w=0,prev:string|null=null;
  for(const ch of text){if(prev)w+=kernCached(font,prev,ch)*s;w+=advCached(font,ch)*s;prev=ch}return w;
}

export function layoutStr(out:number[],text:string,clr:number[],tbl:Record<string,any>,font:FontFace,o:{x:number;y:number;size:number}){
  const s=o.size/font.unitsPerEm,bl=o.y+o.size*0.8;let p=o.x,prev:string|null=null;
  for(let i=0;i<text.length;i++){const ch=text[i];if(prev)p+=kernCached(font,prev,ch)*s;const gl=tbl[ch];if(gl){out.push(p,bl,s,0,gl.bbox[0],gl.bbox[1],gl.bbox[2],gl.bbox[3],clr[0],clr[1],clr[2],clr[3],gl.rowBase,gl.bandCount,gl.bandH,gl.invH);p+=gl.advance*s;}else p+=advCached(font,ch)*s;prev=ch;}
}

// Place a baked vector shape (icon/illustration) scaled to fit `box` while keeping
// aspect ratio, centered. The atlas entry stores the shape in its own coordinate
// space (e.g. a 24×24 grid); `place` = (originX, originY, unitsToPx) maps shape
// units → world px exactly as glyphs do, so it renders through the fill pipeline.
export function layoutIcon(out:number[], gl:any, box:{x:number;y:number;w:number;h:number}, clr:number[]){
  if(!gl) return;
  const sw = gl.bbox[2]-gl.bbox[0], sh = gl.bbox[3]-gl.bbox[1];
  if(sw<=0||sh<=0) return;
  const scale = Math.min(box.w/sw, box.h/sh);
  const drawW = sw*scale, drawH = sh*scale;
  // Top-left of the shape's bbox in world px, so the shape sits centered in box.
  const ox = box.x + (box.w-drawW)/2 - gl.bbox[0]*scale;
  const oy = box.y + (box.h-drawH)/2 - gl.bbox[1]*scale;
  // fillRule = 1 (even-odd) so counter-wound holes render regardless of contour
  // orientation — hand-authored icon paths don't guarantee nonzero winding.
  out.push(ox, oy, scale, 1, gl.bbox[0], gl.bbox[1], gl.bbox[2], gl.bbox[3], clr[0], clr[1], clr[2], clr[3], gl.rowBase, gl.bandCount, gl.bandH, gl.invH);
}

// Axis-aligned SOLID rectangle. The shader computes coverage directly from the
// ink bbox (place.w === 2 → box-overlap fast path), so we emit ONLY an instance —
// no edge decomposition, no band gather. This makes UI backgrounds, borders,
// hover fills and shadows nearly free (they used to run the full per-pixel
// winding integral, which is what tanked FPS when a hovered element filled the
// screen). crv/rws are unused (kept for signature compatibility).
export function addRect(x0:number,y0:number,x1:number,y1:number,clr:number[],crv:number[],rws:number[],out:number[]){
  void crv; void rws;
  // place = (originX, originY, unitsToPx=1, fillRule=2); bbox is LOCAL (0,0,w,h)
  // so the fragment coord + edges stay small (deep-zoom stable, like glyphs — the
  // camera's f64 subtraction is applied to place.xy).
  out.push(x0, y0, 1, 2, 0, 0, x1 - x0, y1 - y0, clr[0], clr[1], clr[2], clr[3], 0, 0, 0, 0);
}

const CODE_KW = new Set(['export','function','var','let','const','for','each','return','min','abs','if','else','in','of','while','new','type']);
export function highlightCode(text: string): Seg[] {
  const segs:Seg[]=[];
  let buf=''; let col=parseColor('#cdd6f4');
  const flush=()=>{ if(buf){segs.push({kind:'word',text:buf,color:col});buf='';} };
  let i=0;const n=text.length;
  while(i<n){
    const c=text[i];
    if(c==='/'&&text[i+1]==='/'){flush();let j=text.indexOf('\n',i);if(j<0)j=n;segs.push({kind:'word',text:text.slice(i,j),color:parseColor('#676e95')});i=j;continue;}
    if(c==='/'&&text[i+1]==='*'){flush();let j=text.indexOf('*/',i+2);j=j<0?n:j+2;segs.push({kind:'word',text:text.slice(i,j),color:parseColor('#676e95')});i=j;continue;}
    if(c==='"'||c==="'"||c==='`'){flush();const q=c;let j=i+1;while(j<n&&text[j]!==q)j++;j++;segs.push({kind:'word',text:text.slice(i,j),color:parseColor('#c3e88d')});i=j;continue;}
    if(c==='\n'){flush();segs.push({kind:'nl',text:'\n',color:col});i++;continue;}
    if(c===' '||c==='\t'){flush();segs.push({kind:'space',text:c,color:col});i++;continue;}
    if(/[0-9]/.test(c)){flush();let j=i;while(j<n&&/[0-9._]/.test(text[j]))j++;segs.push({kind:'word',text:text.slice(i,j),color:parseColor('#f78c6c')});i=j;continue;}
    if(/[A-Za-z_]/.test(c)){flush();let j=i;while(j<n&&/[A-Za-z0-9_]/.test(text[j]))j++;const w=text.slice(i,j);segs.push({kind:'word',text:w,color:CODE_KW.has(w)?parseColor('#c792ea'):parseColor('#cdd6f4')});i=j;continue;}
    if(/[{}()[\];:,.<>=+\-*/&|!?]/.test(c)){flush();segs.push({kind:'word',text:c,color:parseColor('#89ddff')});i++;continue;}
    buf+=c; i++;
  }
  flush();
  return segs;
}
