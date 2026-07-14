// ── Windfoil metrics + syntax highlighting ──────────────────────────────────
// Pure helpers: text width, glyph instance emission, rounded-rect decomposition,
// and the code tokenizer used by <pre> blocks.

import type { FontFace } from '../windfoil/font';
import { advanceOf, kerningOf } from '../windfoil/font';
import { bandPieces } from '../windfoil/bands';
import type { Seg } from './types';
import { parseColor } from '../css/engine';

export function tw(text: string, font: FontFace, size: number): number {
  const s=size/font.unitsPerEm;let w=0,prev:string|null=null;
  for(const ch of text){if(prev)w+=kerningOf(font,prev,ch)*s;w+=advanceOf(font,ch)*s;prev=ch}return w;
}

export function layoutStr(out:number[],text:string,clr:number[],tbl:Record<string,any>,font:FontFace,o:{x:number;y:number;size:number}){
  const s=o.size/font.unitsPerEm,bl=o.y+o.size*0.8;let p=o.x,prev:string|null=null;
  for(let i=0;i<text.length;i++){const ch=text[i];if(prev)p+=kerningOf(font,prev,ch)*s;const gl=tbl[ch];if(gl)out.push(p,bl,s,0,gl.bbox[0],gl.bbox[1],gl.bbox[2],gl.bbox[3],clr[0],clr[1],clr[2],clr[3],gl.rowBase,gl.bandCount,gl.bandH,gl.invH);p+=advanceOf(font,ch)*s;prev=ch;}
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

// Pre-allocated scratch arrays for addRect (avoid per-call allocation)
const _csScratch = [[0,0],[0,0],[0,0],[0,0]];
const _qsScratch:number[] = new Array(24); // 4 corners × 6 values
const _psScratch:number[] = new Array(48); // enough for 8 monotone pieces
export function addRect(x0:number,y0:number,x1:number,y1:number,clr:number[],crv:number[],rws:number[],out:number[]){
  const cs=_csScratch; cs[0][0]=x0;cs[0][1]=y0;cs[1][0]=x1;cs[1][1]=y0;cs[2][0]=x1;cs[2][1]=y1;cs[3][0]=x0;cs[3][1]=y1;
  const qs=_qsScratch; let qn=0;
  for(let i=0;i<4;i++){const[a,b]=cs[i],[c,d]=cs[(i+1)%4];qs[qn++]=a;qs[qn++]=b;qs[qn++]=(a+c)/2;qs[qn++]=(b+d)/2;qs[qn++]=c;qs[qn++]=d;}
  const ps=_psScratch; let pn=0;
  for(let i=0;i<qn;i+=6){
    // inline pushMonotonePieces to avoid allocation
    const q=qs;const o=ps;const bi=i;
    const q0=q[bi],q1=q[bi+1],q2=q[bi+2],q3=q[bi+3],q4=q[bi+4],q5=q[bi+5];
    const ax=q0-2*q2+q4,ay=q1-2*q3+q5;
    // extremum T
    let first:number|null=null,second:number|null=null;
    const txA=ax===0?null:(q0-q2)/ax; const tx=txA!==null&&(txA>0&&txA<1)?txA:null;
    const tyA=ay===0?null:(q1-q3)/ay; const ty=tyA!==null&&(tyA>0&&tyA<1)?tyA:null;
    if(tx!==null&&ty!==null){first=Math.min(tx,ty);second=Math.max(tx,ty);}
    else first=tx!==null?tx:ty;
    // inline subdivide + push
    let rest=[q0,q1,q2,q3,q4,q5]; let consumed=0;
    for(const t of [first,second]){
      if(t===null)continue;
      const denom=1-consumed; const local=denom>0?(t-consumed)/denom:1;
      if(!(local>0&&local<1))continue;
      // subdivide(rest, local)
      const lerp=(a:number,b:number)=>a+(b-a)*local;
      const x01=lerp(rest[0],rest[2]),y01=lerp(rest[1],rest[3]);
      const x12=lerp(rest[2],rest[4]),y12=lerp(rest[3],rest[5]);
      const xm=lerp(x01,x12),ym=lerp(y01,y12);
      o[pn++]=rest[0];o[pn++]=rest[1];o[pn++]=x01;o[pn++]=y01;o[pn++]=xm;o[pn++]=ym;
      rest=[xm,ym,x12,y12,rest[4],rest[5]];
      consumed=t;
    }
    o[pn++]=rest[0];o[pn++]=rest[1];o[pn++]=rest[2];o[pn++]=rest[3];o[pn++]=rest[4];o[pn++]=rest[5];
  }
  const h=bandPieces(ps.slice(0,pn),y0,y1,crv,rws);out.push(0,0,1,0,x0,y0,x1,y1,clr[0],clr[1],clr[2],clr[3],h.rowBase,h.bandCount,h.bandH,h.invH);
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
