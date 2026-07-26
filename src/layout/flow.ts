// ── Text flow layout ─────────────────────────────────────────────────────────
// Wraps an element's inline text (or <pre> code) into world-space glyph
// instances. Pure: depends only on the element box + font + atlas.

import type { FontFace } from '../windfoil/font';
import type { GlyphAtlas } from '../windfoil/bands';
import type { StyledEl, Seg } from './types';
import { tw, layoutStr, highlightCode } from './metrics';

interface MarqueeCache {
  items: { text: string; color: number[]; fs: number; child: StyledEl | null }[];
  totalW: number;
  words: { w: string; fs: number; color: number[]; ww: number; childY: number }[];
}
const _marqueeCache = new WeakMap<StyledEl, MarqueeCache>();

export function layoutFlow(el: StyledEl, font: FontFace, atlas: GlyphAtlas, inst: number[], now: number) {
  const left=el.x+el.pad[3], right=el.x+el.w-el.pad[1];
  const mid=(left+right)/2;
  const isMarquee=el.classes.includes('marquee');
  let align=el.textAlign; if(isMarquee)align='left';

  let items: MarqueeCache['items'];
  let scroll=0;
  let cachedWords: MarqueeCache['words'] | null = null;

  if (isMarquee) {
    let mc = _marqueeCache.get(el);
    if (!mc) {
      items=[];
      for(const node of Array.from(el.el.childNodes)){
        if(node.nodeType===3){let t=node.textContent||'';if(el.upper)t=t.toUpperCase();if(t.trim())items.push({text:t,color:el.color,fs:el.fs,child:null});}
        else if(node.nodeType===1){const child=el.children.find(c=>c.el===node);if(child&&child.inline){let t=child.el.textContent||'';if(child.upper)t=t.toUpperCase();items.push({text:t,color:child.color,fs:child.fs,child});}}
      }
      let all='';for(const it of items)all+=' '+it.text;
      const totalW=tw(all,font,el.fs)+right-left;
      const words: MarqueeCache['words']=[];
      for(const it of items){
        for(const w of it.text.split(' ').filter(w=>w.length)){
          words.push({w,fs:it.fs,color:it.color,ww:tw(w,font,it.fs),childY:it.child?it.child.y:0});
        }
      }
      mc = { items, totalW, words };
      _marqueeCache.set(el, mc);
    }
    items = mc.items;
    cachedWords = mc.words;
    scroll=((now*0.08)%(mc.totalW));
  } else {
    items=[];
    for(const node of Array.from(el.el.childNodes)){
      if(node.nodeType===3){let t=node.textContent||'';if(el.upper)t=t.toUpperCase();if(t.trim())items.push({text:t,color:el.color,fs:el.fs,child:null});}
      else if(node.nodeType===1){const child=el.children.find(c=>c.el===node);if(child&&child.inline){let t=child.el.textContent||'';if(child.upper)t=t.toUpperCase();items.push({text:t,color:child.color,fs:child.fs,child});}}
    }
  }

  const bottom=el.y+el.h-el.pad[2];

  if (cachedWords) {
    let curX=left-scroll, curY=el.y+el.pad[0];
    for(const wd of cachedWords){
      if(wd.childY && wd.childY>curY+el.lh*0.5){curY=wd.childY;curX=left-scroll;}
      if(curX+wd.ww>right && curX>left-scroll){curY+=el.lh;curX=left-scroll;}
      const oy=curY+(el.lh-wd.fs)*0.8;
      if(curX<=right && curX+wd.ww>=left && oy<=bottom)layoutStr(inst,wd.w,wd.color,atlas.table,font,{x:curX,y:oy,size:wd.fs});
      curX+=wd.ww+tw(' ',font,wd.fs);
    }
    return;
  }

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

export function layoutPre(el: StyledEl, font: FontFace, atlas: GlyphAtlas, inst: number[], highlightCache?: Map<StyledEl, Seg[]>) {
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
