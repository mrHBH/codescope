// ── Text flow layout ─────────────────────────────────────────────────────────
// Wraps an element's inline text (or <pre> code) into world-space glyph
// instances. Pure: depends only on the element box + font + atlas.

import type { FontFace } from '../windfoil/font';
import type { StyledEl, Seg } from './types';
import { tw, layoutStr, highlightCode } from './metrics';

// Inline flow: one wrapped paragraph for an element + its inline children.
// Clips strictly to the element box (hard page-width / card-width guarantee).
export function layoutFlow(el: StyledEl, font: FontFace, atlas: any, inst: number[], now: number) {
  const left=el.x+el.pad[3], right=el.x+el.w-el.pad[1];
  const mid=(left+right)/2;
  let align=el.textAlign; if(el.classes.includes('marquee'))align='left';
  const items:{text:string;color:number[];fs:number;child:StyledEl|null}[]=[];
  for(const node of Array.from(el.el.childNodes)){
    if(node.nodeType===3){let t=node.textContent||'';if(el.upper)t=t.toUpperCase();if(t.trim())items.push({text:t,color:el.color,fs:el.fs,child:null});}
    else if(node.nodeType===1){const child=el.children.find(c=>c.el===node);if(child&&child.inline){let t=child.el.textContent||'';if(child.upper)t=t.toUpperCase();items.push({text:t,color:child.color,fs:child.fs,child});}}
  }
  let scroll=0;
  if(el.classes.includes('marquee')){let all='';for(const it of items)all+=' '+it.text;scroll=((now*0.08)%(tw(all,font,el.fs)+right-left));}
  const bottom=el.y+el.h-el.pad[2];
  let curX=left-scroll, curY=el.y+el.pad[0];
  let line: {w:string;fs:number;color:number[];ww:number}[]=[];
  const flush=()=>{
    if(!line.length)return;
    let total=0;for(let i=0;i<line.length;i++){if(i)total+=tw(' ',font,line[i].fs);total+=line[i].ww;}
    let sx=align==='center'?mid-total/2:align==='right'?right-total:left;
    for(const wd of line){const oy=curY+(el.lh-wd.fs)*0.8;if(sx<=right && sx+wd.ww>=left && oy<=bottom)layoutStr(inst,wd.w,wd.color,atlas.table,font,{x:sx,y:oy,size:wd.fs});sx+=wd.ww+tw(' ',font,wd.fs);}
    line=[];
  };
  for(const it of items){
    if(it.child && it.child.y>curY+el.lh*0.5){flush();curY=it.child.y;curX=left-scroll;}
    for(const w of it.text.split(' ').filter(w=>w.length)){
      const ww=tw(w,font,it.fs);
      if(curX+ww>right && curX>left-scroll){flush();curY+=el.lh;curX=left-scroll;}
      line.push({w,fs:it.fs,color:it.color,ww});
    }
  }
  flush();
}

export function layoutPre(el: StyledEl, font: FontFace, atlas: any, inst: number[], highlightCache?: Map<StyledEl, Seg[]>) {
  const segs=(highlightCache&&highlightCache.get(el))||highlightCode(el.text);
  const left=el.x+el.pad[3], right=el.x+el.w-el.pad[1], bottom=el.y+el.h-el.pad[2];
  let curX=left, curY=el.y+el.pad[0];
  for(const s of segs){
    if(s.kind==='nl'){curX=left;curY+=el.lh;continue;}
    if(s.kind==='space'){curX+=tw(' ',font,14);continue;}
    const ww=tw(s.text,font,14);
    if(curX+ww>right&&curX>left){curX=left;curY+=el.lh;}
    const oy=curY+(el.lh-14)*0.8;
    if(curX>=left && curX+ww<=right && oy<=bottom) layoutStr(inst,s.text,s.color,atlas.table,font,{x:curX,y:oy,size:14});
    curX+=ww;
  }
}
