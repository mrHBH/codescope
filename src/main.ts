import { loadFont, advanceOf, kerningOf, FontFace } from './windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from './windfoil/gpu';
import { buildGlyphAtlas, bandPieces } from './windfoil/bands';
import { pushMonotonePieces } from './windfoil/geometry';

// ── CSS Engine ──────────────────────────────────────────────────────────────

interface CSSRule { selector: string; props: Record<string,string> }
interface StyledEl {
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
}

function parseCSS(css: string): CSSRule[] {
  const rules: CSSRule[] = [];
  css.replace(/([^{]+)\{([^}]+)\}/g, (_, sel, body) => {
    const props: Record<string,string> = {};
    body.split(';').forEach(s => { const [k,v] = s.split(':').map(x=>x.trim()); if(k&&v) props[k]=v });
    sel.split(',').forEach(s => rules.push({ selector: s.trim(), props: {...props} }));
    return '';
  });
  return rules;
}

function parseColor(c: string): number[] {
  if (!c || c==='transparent' || c==='none' || c==='inherit') return [0,0,0,0];
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(x=>parseFloat(x)); return [p[0]/255, p[1]/255, p[2]/255, p[3]===undefined?1:p[3]]; }
  if (c[0]==='#') {
    const h = c.slice(1);
    if (h.length===3) return [parseInt(h[0]+h[0],16)/255,parseInt(h[1]+h[1],16)/255,parseInt(h[2]+h[2],16)/255,1];
    if (h.length===6) return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4),16)/255,1];
  }
  if (c==='white') return [1,1,1,1];
  if (c==='black') return [0,0,0,1];
  return [0,0,0,1];
}

function rgb(c: number[]): string { return 'rgb('+Math.round(c[0]*255)+','+Math.round(c[1]*255)+','+Math.round(c[2]*255)+')'; }

function matchesSelector(el: StyledEl, sel: string): boolean {
  if (!sel) return false;
  // Split by spaces to handle descendant selectors like ".card h3"
  const compoundSels = sel.trim().split(/\s+/);
  if (compoundSels.length === 0) return false;

  // Match the rightmost compound against `el`, then walk up ancestors for the rest
  function matchCompound(e: StyledEl, cs: string): boolean {
    const parts = cs.match(/([.#]?[\w-]+)/g) || [];
    if (parts.length === 0) return false;
    const hasTag = parts[0][0] !== '.' && parts[0][0] !== '#';
    let tagOk = !hasTag || e.tag === parts[0].toUpperCase();
    if (hasTag) parts.shift();
    for (const p of parts) {
      if (p[0]==='.') { if (!e.classes.includes(p.slice(1))) return false }
      else if (p[0]==='#') { if (e.id !== p.slice(1)) return false }
    }
    return tagOk;
  }

  // Match rightmost compound against el
  if (!matchCompound(el, compoundSels[compoundSels.length - 1])) return false;

  // Walk up ancestors for remaining compound selectors (right to left)
  let cur: StyledEl | null = el;
  for (let i = compoundSels.length - 2; i >= 0; i--) {
    let found = false;
    cur = cur.parent;
    while (cur) {
      if (matchCompound(cur, compoundSels[i])) { found = true; break; }
      cur = cur.parent;
    }
    if (!found) return false;
  }
  return true;
}

function resolveStyle(el: StyledEl, rules: CSSRule[], state: string): Record<string,string> {
  const props: Record<string,string> = {};
  for (const rule of rules) {
    const sel = rule.selector;
    const colonIdx = sel.lastIndexOf(':');
    const hasPseudo = colonIdx > 0 && sel[colonIdx-1] !== ':'; // exclude ::before/::after
    if (hasPseudo) {
      // Rule targets a pseudo-class state — only match when that state is active
      const pseudoSuffix = sel.slice(colonIdx);
      if (state && pseudoSuffix === ':'+state) {
        const baseSel = sel.slice(0, colonIdx);
        if (matchesSelector(el, baseSel)) Object.assign(props, rule.props);
      }
    } else {
      // Normal rule — only match when resolving normal (empty) state
      if (!state && matchesSelector(el, sel)) Object.assign(props, rule.props);
    }
  }
  return props;
}

// ── Windfoil helpers ────────────────────────────────────────────────────────

function tw(text: string, font: FontFace, size: number): number {
  const s=size/font.unitsPerEm;let w=0,prev:string|null=null;
  for(const ch of text){if(prev)w+=kerningOf(font,prev,ch)*s;w+=advanceOf(font,ch)*s;prev=ch}return w;
}
function layoutStr(out:number[],text:string,clr:number[],tbl:Record<string,any>,font:FontFace,o:{x:number;y:number;size:number}){
  const s=o.size/font.unitsPerEm,bl=o.y+o.size*0.8;let p=o.x,prev:string|null=null;
  for(let i=0;i<text.length;i++){const ch=text[i];if(prev)p+=kerningOf(font,prev,ch)*s;const gl=tbl[ch];if(gl)out.push(p,bl,s,0,gl.bbox[0],gl.bbox[1],gl.bbox[2],gl.bbox[3],clr[0],clr[1],clr[2],clr[3],gl.rowBase,gl.bandCount,gl.y0,gl.invH);p+=advanceOf(font,ch)*s;prev=ch;}
}
function addRect(x0:number,y0:number,x1:number,y1:number,clr:number[],crv:number[],rws:number[],out:number[]){
  const cs=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],qs:number[]=[];
  for(let i=0;i<4;i++){const[a,b]=cs[i],[c,d]=cs[(i+1)%4];qs.push(a,b,(a+c)/2,(b+d)/2,c,d)}
  const ps:number[]=[];for(let i=0;i<qs.length;i+=6)pushMonotonePieces(qs.slice(i,i+6),ps);
  const h=bandPieces(ps,y0,y1,crv,rws);out.push(0,0,1,0,x0,y0,x1,y1,clr[0],clr[1],clr[2],clr[3],h.rowBase,h.bandCount,h.y0,h.invH);
}

// ── Inline text flow + syntax highlighting ──────────────────────────────────

const CODE_KW = new Set(['export','function','var','let','const','for','each','return','min','abs','if','else','in','of','while','new','type']);
interface Seg { kind:'word'|'space'|'nl'; text:string; color:number[]; }
function highlightCode(text: string): Seg[] {
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

// Inline flow: one wrapped paragraph for an element + its inline children.
// Clips strictly to the element box (hard page-width / card-width guarantee).
function layoutFlow(el: StyledEl, font: FontFace, atlas: any, inst: number[], now: number) {
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

function layoutPre(el: StyledEl, font: FontFace, atlas: any, inst: number[]) {
  const segs=highlightCode(el.text);
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

// ── Themes (concrete colors so the JS CSS engine handles :hover/:active) ─────

interface Palette { [k:string]:string }
const palettes: Record<string,Palette> = {
  light: {
    backdrop:'#e9e6df', pageBg:'#f0ede6', fg:'#1a1a2e', muted:'#4a4a55',
    card:'#ffffff', accent:'#4466cc', accentDark:'#3355bb', accentActive:'#2244aa',
    codeBg:'#1e1e2e', codeFg:'#cdd6f4', tagBg:'#e0d8f0', tagFg:'#5a4a8a',
    callout:'#4a5bbf', cta:'#3a4db0', border:'#d8d2c6', kicker:'#8866aa', link:'#5a4a8a',
    progress:'#d9d3c8', progFill:'#4466cc', pulse:'#2f9e54',
    badgeBg:'#ffffff', badgeBorder:'#ddd6c8', badgeFg:'#444',
    alertBg:'#e3eefc', alertFg:'#1d4ed8', avatarBg:'#4466cc',
    timeline:'#d8d2c6', statusOk:'#2f9e54', shadow:'rgba(0,0,0,0.12)',
  },
  dark: {
    backdrop:'#0c0e14', pageBg:'#161922', fg:'#e6e6ef', muted:'#9aa0b5',
    card:'#1f2330', accent:'#6f8bff', accentDark:'#5a76f0', accentActive:'#3f57d0',
    codeBg:'#0a0c12', codeFg:'#cdd6f4', tagBg:'#2a2f45', tagFg:'#aab4ff',
    callout:'#3a4db0', cta:'#4a5bbf', border:'#262b3a', kicker:'#9a8cff', link:'#aab4ff',
    progress:'#2a2f40', progFill:'#6f8bff', pulse:'#4fd07a',
    badgeBg:'#1f2330', badgeBorder:'#2a2f45', badgeFg:'#cfd3e6',
    alertBg:'#16223c', alertFg:'#8fb4ff', avatarBg:'#6f8bff',
    timeline:'#262b3a', statusOk:'#4fd07a', shadow:'rgba(0,0,0,0.45)',
  },
};

function buildCSS(p: Palette): string {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
.kicker { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${p.kicker}; margin-bottom: 10px; }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: ${p.muted}; }
.status.ok::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${p.statusOk}; }
.page { font-family: Lato, sans-serif; background: ${p.pageBg}; color: ${p.fg}; padding: 32px 80px 64px; width: 100%; max-width: none; margin: 0 0 90px; border-radius: 0 0 18px 18px; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; padding-bottom: 18px; border-bottom: 1px solid ${p.border}; }
.brand { font-size: 22px; font-weight: 700; color: ${p.fg}; }
.brand span { color: ${p.accent}; }
.nav-links { display: flex; gap: 22px; }
.nav-links a { font-size: 14px; color: ${p.link}; text-decoration: none; }
.hero { margin-bottom: 44px; }
.hero h1 { font-size: 52px; font-weight: 700; color: ${p.fg}; line-height: 1.05; margin-bottom: 16px; }
.hero h1 em { font-style: normal; color: ${p.accent}; }
.lead { font-size: 19px; line-height: 1.6; color: ${p.muted}; margin-bottom: 22px; max-width: 640px; }
.btn-row { display: flex; gap: 12px; margin-bottom: 28px; }
h2 { font-size: 26px; font-weight: 700; color: ${p.fg}; margin-top: 44px; margin-bottom: 14px; }
p { font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
.highlight { background: ${p.tagBg}; border-left: 4px solid ${p.kicker}; padding: 16px 20px; margin: 24px 0; border-radius: 4px; font-size: 15px; color: ${p.muted}; }
.alert { display: flex; gap: 12px; align-items: center; background: ${p.alertBg}; color: ${p.alertFg}; padding: 14px 18px; border-radius: 10px; margin: 22px 0; font-size: 15px; }
pre { background: ${p.codeBg}; color: ${p.codeFg}; padding: 20px 24px; border-radius: 8px; font-size: 14px; line-height: 1.5; margin: 20px 0; }
.grid { display: flex; gap: 20px; margin: 24px 0; }
.feature { flex: 1; background: ${p.card}; border-radius: 12px; padding: 24px; box-shadow: 0 0 0 rgba(0,0,0,0); }
.feature:hover { box-shadow: 0 8px 24px ${p.shadow}; }
.feature h3 { font-size: 19px; font-weight: 700; color: ${p.fg}; margin-bottom: 8px; }
.callout { background: ${p.callout}; color: white; padding: 28px 32px; border-radius: 14px; margin: 24px 0; display: flex; align-items: center; gap: 24px; }
.callout h3 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.callout p { color: #e8ecff; margin-bottom: 0; }
ul { margin: 12px 0 20px 22px; }
li { font-size: 16px; line-height: 1.7; }
.card { background: ${p.card}; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 0 0 rgba(0,0,0,0); }
.card:hover { box-shadow: 0 8px 24px ${p.shadow}; }
.card h3 { font-size: 19px; font-weight: 700; color: ${p.fg}; margin-bottom: 8px; }
.tag { display: inline-block; background: ${p.tagBg}; color: ${p.tagFg}; padding: 3px 11px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.btn { display: inline-block; text-align: center; background: ${p.accent}; color: white; padding: 11px 26px; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 0 0 rgba(0,0,0,0); }
.btn:hover { background: ${p.accentDark}; box-shadow: 0 4px 14px ${p.shadow}; }
.btn:active { background: ${p.accentActive}; }
.btn.ghost { background: transparent; color: ${p.accent}; border: 2px solid ${p.accent}; }
.btn.ghost:hover { background: ${p.tagBg}; }
.progress { background: ${p.progress}; border-radius: 999px; height: 10px; margin: 18px 0; overflow: hidden; }
.pulse { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: ${p.pulse}; font-weight: 700; padding-left: 22px; }
.stats { display: flex; gap: 16px; margin: 24px 0; }
.stat { flex: 1; background: ${p.card}; border-radius: 12px; padding: 20px; text-align: center; }
.stat .num { font-size: 34px; font-weight: 700; color: ${p.accent}; }
.stat .lbl { font-size: 13px; color: ${p.muted}; margin-top: 4px; }
.steps { margin: 20px 0; }
.step { display: flex; gap: 16px; margin-bottom: 18px; align-items: flex-start; }
.step .n { flex: 0 0 34px; height: 34px; border-radius: 50%; background: ${p.accent}; color: white; font-weight: 700; text-align: center; }
.timeline { border-left: 2px solid ${p.timeline}; margin: 20px 0 20px 12px; padding-left: 20px; }
.tl { position: relative; margin-bottom: 18px; }
.tl::before { content:''; position:absolute; left:-27px; top:4px; width:10px; height:10px; border-radius:50%; background:${p.accent}; }
.pullquote { font-size: 24px; line-height: 1.4; color: ${p.fg}; border-left: 4px solid ${p.accent}; padding: 8px 0 8px 22px; margin: 24px 0; font-style: italic; }
.badges { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
.badge { background: ${p.badgeBg}; border: 1px solid ${p.badgeBorder}; border-radius: 8px; padding: 8px 14px; font-size: 14px; color: ${p.badgeFg}; }
.avatars { display: flex; align-items: center; }
.avatar { width: 38px; height: 38px; border-radius: 50%; background: ${p.avatarBg}; color: white; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-left: -10px; border: 2px solid ${p.pageBg}; }
.cta { text-align: center; background: ${p.cta}; color: white; border-radius: 16px; padding: 40px; margin: 24px 0; }
.cta h3 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.cta p { color: #e8ecff; margin-bottom: 18px; }
.divider { height: 1px; background: ${p.border}; margin: 28px 0; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid ${p.border}; font-size: 13px; color: ${p.muted}; }
.tabs { display: flex; gap: 4px; margin: 22px 0; }
.tab { padding: 10px 22px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 700; background: ${p.card}; color: ${p.muted}; cursor: pointer; }
.tab.active { background: ${p.accent}; color: white; }
.tab:hover { background: ${p.tagBg}; color: ${p.tagFg}; }
.tab-content { background: ${p.card}; border-radius: 0 12px 12px 12px; padding: 24px; margin-top: -4px; }
.btn.pill { padding: 10px 28px; border-radius: 999px; }
.btn.small { padding: 6px 16px; font-size: 13px; border-radius: 6px; }
.btn.large { padding: 15px 36px; font-size: 19px; border-radius: 10px; }
.btn.icon { padding: 10px 14px; gap: 8px; }
.table { display: flex; flex-direction: column; margin: 20px 0; }
.row { display: flex; }
.row.head { background: ${p.accent}; color: white; font-weight: 700; border-radius: 8px 8px 0 0; }
.row.body { background: ${p.card}; }
.row.body:last-child { border-radius: 0 0 8px 8px; }
.cell { flex: 1; padding: 12px 16px; font-size: 14px; }
.list-desc { margin: 16px 0; }
.list-desc dt { font-weight: 700; margin-bottom: 4px; font-size: 16px; }
.list-desc dd { margin-left: 18px; margin-bottom: 14px; font-size: 15px; color: ${p.muted}; }
.label { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.label.accent { background: ${p.accent}; color: white; }
.label.green { background: ${p.pulse}; color: white; }
.label.muted { background: ${p.tagBg}; color: ${p.tagFg}; }
.bounce { width: 64px; height: 64px; background: ${p.accent}; border-radius: 16px; display: inline-block; margin: 10px; }
.heartbeat { width: 72px; height: 72px; background: ${p.pulse}; border-radius: 50%; display: inline-block; margin: 10px; }
.check-list { margin: 12px 0 18px; }
.check-list li { font-size: 16px; line-height: 1.7; }
.split { display: flex; gap: 24px; margin: 20px 0; }
.split > * { flex: 1; }
.text-sm { font-size: 13px; }
.text-lg { font-size: 20px; line-height: 1.5; }
.text-xl { font-size: 30px; font-weight: 700; line-height: 1.2; }
.text-2xl { font-size: 44px; font-weight: 700; line-height: 1.05; }
.text-muted { color: ${p.muted}; }
.text-accent { color: ${p.accent}; }
.uppercase { text-transform: uppercase; letter-spacing: 1px; }
blockquote { border-left: 4px solid ${p.accent}; padding: 12px 20px; margin: 20px 0; background: ${p.card}; border-radius: 0 8px 8px 0; font-size: 17px; line-height: 1.6; color: ${p.muted}; font-style: italic; }
code { font-size: 14px; background: ${p.codeBg}; color: ${p.codeFg}; padding: 3px 8px; border-radius: 5px; font-family: monospace; }
.kbd { display: inline-block; font-size: 12px; font-weight: 700; background: ${p.card}; border: 1px solid ${p.border}; border-radius: 5px; padding: 3px 8px; font-family: monospace; color: ${p.muted}; }
.chip { display: inline-block; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; background: ${p.tagBg}; color: ${p.tagFg}; margin: 4px; }
.chip.accent { background: ${p.accent}; color: white; }
.icon-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
.icon-item { text-align: center; width: 72px; padding: 12px 6px; border-radius: 8px; background: ${p.card}; }
.icon-item .glyph { font-size: 28px; }
.icon-item .name { font-size: 10px; color: ${p.muted}; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.well { background: ${p.card}; border-radius: 12px; padding: 24px; margin: 20px 0; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${p.kicker}; margin-bottom: 8px; }
`;
}

// ── Document content ─────────────────────────────────────────────────────────

const HTML_SRC = `
<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">GPU text rendering</div>
    <h1>Pixel-perfect type, <em>rendered analytically</em>.</h1>
    <p class="lead">A full CSS rule engine &mdash; selector matching, :hover/:active pseudo-classes, and transition interpolation &mdash; drawn through windfoil's closed-form GPU pipeline. Text stays razor sharp at any zoom.</p>
    <div class="btn-row">
      <div class="btn jump" data-page="1">Explore features</div>
      <div class="btn ghost jump" data-page="2">View showcase</div>
    </div>
    <div class="progress"></div>
    <div class="pulse">Live &mdash; 60 fps</div>
  </div>
  <div class="alert"><div>Everything you see &mdash; every box, every glyph &mdash; is one GPU draw call, shaded analytically.</div></div>
  <h2>Hover effects</h2>
  <div class="card"><h3>Hover Card</h3><p>Move your mouse over this card. The box-shadow interpolates smoothly. Hover state is detected by hit-testing the cursor's world position against element bounds.</p><span class="tag">hover</span><span class="tag">transition</span></div>
  <h2>Features</h2>
  <div class="grid">
    <div class="feature"><h3>Sharp text</h3><p>Glyphs stay razor sharp at any zoom. The shader integrates a closed-form winding number per pixel.</p></div>
    <div class="feature"><h3>One draw call</h3><p>Every background, glyph, and hover state is a single GPU instance batch.</p></div>
  </div>
  <div class="callout"><div><h3>Built for the GPU</h3><p>Per-pixel analytic anti-aliasing with zero aliasing artifacts at any scale.</p></div></div>
  <h2>Code block</h2>
  <pre>export function coverage(pixel: vec2f, atlas: CurveAtlas) -> f32 {
  var w: f32 = 0.0;
  for each row-band containing pixel.y:
    for each curve piece in band:
      w += winding_contribution(curve, pixel);
  return min(abs(w), 1.0);
}</pre>
  <p>Code blocks render syntax-colored on a dark background.</p>
  <div class="marquee">windfoil | analytic coverage | zero aliasing | full CSS state machine | one draw call | razor-sharp at any zoom | </div>
  <h2>What you get</h2>
  <ul><li>Full CSS selector matching</li><li>:hover and :active pseudo-classes</li><li>CSS transition interpolation</li><li>Per-pixel analytic AA</li></ul>
  <div class="card"><h3>Interactive button</h3><p>Click or hover this button. The background color transitions smoothly. The :active state triggers a color change.</p><div class="btn">Click me</div></div>
  <p class="footer">Windfoil CSS Engine &middot; Per-pixel analytic AA &middot; Full CSS state machine</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Capabilities</div>
    <h1>Everything a CSS engine should do.</h1>
  </div>
  <div class="stats">
    <div class="stat"><div class="num">0</div><div class="lbl">aliasing artifacts</div></div>
    <div class="stat"><div class="num">1</div><div class="lbl">draw call</div></div>
    <div class="stat"><div class="num">&#8734;</div><div class="lbl">zoom levels</div></div>
  </div>
  <h2>How it works</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><div><h3>Parse</h3><p>The stylesheet is parsed into rules; selectors are matched against the element tree.</p></div></div>
    <div class="step"><div class="n">2</div><div><h3>Layout</h3><p>The browser computes every box; we read its rect so hits line up with pixels.</p></div></div>
    <div class="step"><div class="n">3</div><div><h3>Paint</h3><p>Each background and glyph is one GPU instance, shaded analytically.</p></div></div>
  </div>
  <h2>Timeline</h2>
  <div class="timeline">
    <div class="tl"><h3>Parse</h3><p>CSS becomes a rule list in microseconds.</p></div>
    <div class="tl"><h3>Match</h3><p>Selectors resolve against the live DOM tree.</p></div>
    <div class="tl"><h3>Shade</h3><p>Windfoil integrates coverage per pixel, analytically.</p></div>
  </div>
  <div class="callout"><div><h3>Try it</h3><p>Scroll-zoom all the way out to see the entire document at once.</p></div></div>
  <div class="marquee">selectors | pseudo-classes | transitions | analytic coverage | closed-form integral | GPU instances | </div>
  <div class="card"><h3>Next</h3><p>See the engine in a real layout on the showcase page.</p><div class="btn jump" data-page="2">Go to showcase</div></div>
  <p class="footer">Windfoil &middot; Features page</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Showcase</div>
    <h1>Designed to be read.</h1>
  </div>
  <div class="pullquote">"Typography is what language looks like." &mdash; and windfoil makes it look sharp everywhere.</div>
  <div class="status ok">All systems operational</div>
  <div class="badges">
    <div class="badge">Headings</div><div class="badge">Lead text</div><div class="badge">Cards</div><div class="badge">Badges</div><div class="badge">Stats</div><div class="badge">Quotes</div><div class="badge">Code</div><div class="badge">Buttons</div>
  </div>
  <div class="avatars"><div class="avatar">A</div><div class="avatar">B</div><div class="avatar">C</div><div class="avatar">D</div></div>
  <h2>Components</h2>
  <div class="grid">
    <div class="feature"><h3>Stat blocks</h3><p>Big numbers with small labels &mdash; great for dashboards.</p></div>
    <div class="feature"><h3>Step lists</h3><p>Numbered steps with circular markers guide the reader.</p></div>
    <div class="feature"><h3>Pull quotes</h3><p>Italic callouts break up long-form text.</p></div>
  </div>
  <div class="cta"><h3>Ready to render?</h3><p>Bring your own stylesheet &mdash; windfoil will parse it.</p><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Showcase page</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Design tokens</div>
    <h1>Tabs, buttons, lists, tables.</h1>
  </div>
  <div class="tabs">
    <div class="tab active">Overview</div>
    <div class="tab">Details</div>
    <div class="tab">Settings</div>
  </div>
  <div class="tab-content"><p>This tab panel shows content for the active tab. In a real app clicking a tab would switch panels.</p></div>
  <h2>Button sizes</h2>
  <div class="btn-row">
    <div class="btn large">Large</div>
    <div class="btn">Default</div>
    <div class="btn small">Small</div>
    <div class="btn pill">Pill</div>
    <div class="btn ghost">Ghost</div>
    <div class="btn icon"><span>></span> Play</div>
  </div>
  <h2>Labels</h2>
  <div><span class="label accent">New</span><span class="label green">Success</span><span class="label muted">Draft</span></div>
  <h2>Table</h2>
  <div class="table">
    <div class="row head"><div class="cell">Name</div><div class="cell">Role</div><div class="cell">Status</div></div>
    <div class="row body"><div class="cell">Coverage shader</div><div class="cell">Fragment</div><div class="cell"><span class="label green">Active</span></div></div>
    <div class="row body"><div class="cell">Glyph bander</div><div class="cell">CPU pre-pass</div><div class="cell"><span class="label accent">Beta</span></div></div>
    <div class="row body"><div class="cell">CSS engine</div><div class="cell">Runtime</div><div class="cell"><span class="label green">Active</span></div></div>
  </div>
  <h2>Description list</h2>
  <dl class="list-desc"><dt>Analytic coverage</dt><dd>Closed-form winding number per pixel; zero aliasing at any zoom.</dd><dt>GPU instance batch</dt><dd>Every rect and glyph in one draw call; sorted for closest-hit early-out.</dd></dl>
  <h2>Split layout</h2>
  <div class="split"><div class="card"><h3>Left panel</h3><p>Flex-based side-by-side with equal-width boxes.</p></div><div class="card"><h3>Right panel</h3><p>Both children share space equally; great for comparisons.</p></div></div>
  <div class="btn-row"><div class="btn jump" data-page="4">Next: Animations</div></div>
  <p class="footer">Windfoil &middot; Design System page</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Showcase</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Motion</div>
    <h1>Time-driven animations.</h1>
  </div>
  <h2>Bounce &amp; heartbeat</h2>
  <div style="display:flex;align-items:center;gap:24px;margin:20px 0;">
    <div class="bounce"></div>
    <div class="heartbeat"></div>
    <div class="bounce"></div>
    <div class="heartbeat"></div>
  </div>
  <h2>Check list</h2>
  <ul class="check-list"><li>v Full CSS selector matching</li><li>v :hover and :active pseudo-classes</li><li>v CSS transition interpolation</li><li>v Per-pixel analytic AA</li><li>v One GPU draw call</li></ul>
  <h2>Progress &amp; pulse</h2>
  <div class="progress"></div>
  <div class="pulse">Live &mdash; 60 fps</div>
  <div class="marquee">bounce | heartbeat | progress | pulse | marquee | tabs | table | badges | avatars | icons | </div>
  <h2>More cards</h2>
  <div class="grid">
    <div class="feature"><h3>Progress</h3><p>Bar fills automatically using a fraction of the frame timestamp.</p></div>
    <div class="feature"><h3>Bounce</h3><p>Rectangle oscillates vertically on a sine wave.</p></div>
    <div class="feature"><h3>Heartbeat</h3><p>Square pulses around its center point.</p></div>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Animations page</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Design</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Typography</div>
    <h1>Every scale, every weight.</h1>
  </div>
  <div class="section-title">Hero heading</div>
  <div class="text-2xl">The quick brown fox jumps over the lazy dog.</div>
  <div class="section-title">XL heading</div>
  <div class="text-xl">Analytic coverage integrates over pixel footprints.</div>
  <div class="section-title">Large text</div>
  <div class="text-lg">Full CSS rule parsing, selector matching, pseudo-class state machine.</div>
  <div class="section-title">Body text</div>
  <p>A <code>const</code> binding inside the fragment shader captures the winding number. Use <span class="text-accent">coloured accents</span> and <span class="text-muted">muted text</span> to build <code>inline code</code> with emphasis.</p>
  <div class="section-title">Blockquote</div>
  <blockquote>"The shader integrates a closed-form winding number per pixel for perfect edges at any font size." &mdash; Windfoil docs</blockquote>
  <div class="section-title">Keyboard shortcuts</div>
  <p>Press <span class="kbd">Ctrl</span> <span class="kbd">N</span> for a new document, or <span class="kbd">Opt</span> <span class="kbd">Cmd</span> <span class="kbd">K</span> to open the palette.</p>
  <div class="section-title">Chips / tags</div>
  <div><span class="chip">CSS engine</span><span class="chip accent">GPU backend</span><span class="chip">Closed form</span><span class="chip accent">Analytic AA</span><span class="chip">Type rendering</span></div>
  <div class="section-title">Uppercase</div>
  <div class="uppercase" style="font-size:14px;color:#8866aa;">System operational &middot; zero errors detected</div>
  <div class="well">
    <div class="section-title">Well / inset card</div>
    <p>Use wells to group secondary content or show contextual panels.</p>
    <div class="btn-row"><div class="btn small">Action</div><div class="btn small ghost">Cancel</div></div>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="6">Next: Components</div></div>
  <p class="footer">Windfoil &middot; Typography page</p>
</div>

<div class="page">
  <div class="nav">
    <div class="brand">Wind<span>foil</span></div>
    <div class="nav-links"><a>Engine</a><a>Features</a><a>Design</a></div>
    <div class="btn jump" data-page="0">Home</div>
  </div>
  <div class="hero">
    <div class="kicker">Components</div>
    <h1>Icons, chips, keys, wells.</h1>
  </div>
  <div class="section-title">Icon gallery</div>
  <div class="icon-grid">
    <div class="icon-item"><div class="glyph">></div><div class="name">play</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">star</div></div>
    <div class="icon-item"><div class="glyph">v</div><div class="name">check</div></div>
    <div class="icon-item"><div class="glyph">x</div><div class="name">cross</div></div>
    <div class="icon-item"><div class="glyph">&lt;3</div><div class="name">heart</div></div>
    <div class="icon-item"><div class="glyph">^</div><div class="name">up</div></div>
    <div class="icon-item"><div class="glyph">v</div><div class="name">down</div></div>
    <div class="icon-item"><div class="glyph">&lt;</div><div class="name">left</div></div>
    <div class="icon-item"><div class="glyph">#</div><div class="name">block</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">diamond</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">lozenge</div></div>
    <div class="icon-item"><div class="glyph">*</div><div class="name">snow</div></div>
  </div>
  <div class="section-title">More chips</div>
  <div>
    <span class="chip accent">&gt; Play</span>
    <span class="chip accent">* Star</span>
    <span class="chip"># Edit</span>
    <span class="chip">v Done</span>
    <span class="chip accent">x Close</span>
  </div>
  <div class="section-title">Button variants</div>
  <div class="btn-row">
    <div class="btn pill">Pill</div>
    <div class="btn pill ghost">Ghost Pill</div>
  </div>
  <div class="btn-row">
    <div class="btn large">Large CTA</div>
    <div class="btn icon"><span>--></span> Next</div>
  </div>
  <h2>Status cards</h2>
  <div class="grid">
    <div class="card"><h3>v Done</h3><p>This card has a check icon in its heading. The check glyph is part of the text flow and renders via windfoil.</p><span class="label green">Complete</span></div>
    <div class="card"><h3>* Starred</h3><p>Icon + text combos work because icons are regular characters in the glyph atlas.</p><span class="label accent">Featured</span></div>
  </div>
  <h2>Inline code + keys</h2>
  <p>Type <code>npm run dev</code> and press <span class="kbd">F5</span> to reload. The <code>buildCSS</code> function generates a full stylesheet from a <span class="text-accent">palette object</span>.</p>
  <div class="well">
    <div class="section-title">Tip</div>
    <p>Any Unicode character added to the atlas renders via windfoil. Characters missing from the font will simply not draw &mdash; no errors, no fallback.</p>
  </div>
  <div class="btn-row"><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Components page</p>
</div>
`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fpsEl = document.getElementById('fps')!;
  fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:100;font:13px/1 monospace;color:#ccc;background:rgba(14,14,18,0.8);padding:4px 8px;border-radius:5px;pointer-events:none;';
  const dpr = Math.min(devicePixelRatio, 2);
  const PAGE_W = 1040;

  const rCanvas = document.createElement('canvas');
  rCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0;cursor:grab';
  document.body.appendChild(rCanvas);
  const rCtx = rCanvas.getContext('2d')!;

  const tCanvas = document.createElement('canvas');
  tCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';
  document.body.appendChild(tCanvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);
  const gpuCtx = tCanvas.getContext('webgpu')!;
  gpuCtx.configure({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' });

  // Build layout DOM (kept in the document, hidden, so themes can be swapped live)
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:'+PAGE_W+'px';
  document.body.appendChild(container);
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style><style id="themeStyle">${buildCSS(palettes.light)}</style>${HTML_SRC}`;
  const themeStyle = container.querySelector('#themeStyle') as HTMLStyleElement;
  await document.fonts.ready;

  const styledEls: StyledEl[] = [];
  const pageRoots: StyledEl[] = [];
  for (const rootEl of Array.from(container.querySelectorAll('.page'))) {
    const r = walkDOM(rootEl, null);
    if (r) pageRoots.push(r);
  }

  function walkDOM(el: Element, parent: StyledEl|null): StyledEl|null {
    if (el.tagName==='STYLE'||el.tagName==='SCRIPT') return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const cx = r.left, cy = r.top;
    if (r.width<2||r.height<2) return null;
    const pad = [parseFloat(cs.paddingTop)||0,parseFloat(cs.paddingRight)||0,parseFloat(cs.paddingBottom)||0,parseFloat(cs.paddingLeft)||0];
    let text='';for(const n of Array.from(el.childNodes))if(n.nodeType===3)text+=n.textContent||'';
    const fs=parseFloat(cs.fontSize)||16;
    const lh=cs.lineHeight==='normal'?fs*1.2:parseFloat(cs.lineHeight)||fs*1.2;
    const radius=parseFloat(cs.borderTopLeftRadius)||0;
    const inline=cs.display==='inline'||cs.display==='inline-block';
    const isPre=el.tagName==='PRE';
    const upper=cs.textTransform==='uppercase';
    const se: StyledEl = {
      tag: el.tagName, classes: Array.from(el.classList), id: el.id,
      x:cx, y:cy, w:r.width, h:r.height, pad,
      text:text.trim(),
      children:[], parent, el,
      fs, lh, radius,
      color: parseColor(cs.color),
      bg: parseColor(cs.backgroundColor),
      textAlign: cs.textAlign||'left', upper,
      curBg: parseColor(cs.backgroundColor),
      curShadow: 0,
      inline, skipText: false, hasFlow: false, isPre,
    };
    styledEls.push(se);
    for(const child of Array.from(el.children)) {
      const c = walkDOM(child, se);
      if(c){ if(c.inline) c.skipText=true; se.children.push(c); }
    }
    se.hasFlow = isPre || text.trim().length>0 || se.children.some(c=>c.inline);
    return se;
  }

  const docH=Math.max(...styledEls.map(e=>e.y+e.h))+60;
  const pages = pageRoots.map(r=>({x:r.x,y:r.y,w:r.w,h:r.h}));

  const allChars=new Set<string>();
  for(const el of styledEls) for(const ch of el.text) allChars.add(ch);
  const atlas=buildGlyphAtlas(font,[...allChars].join(' '));

  // ── Theme state ─────────────────────────────────────────────────────────────
  let cssRules = parseCSS(buildCSS(palettes.light));
  let isDark=false;
  let themeCol = { backdrop: parseColor(palettes.light.backdrop), pageBg: parseColor(palettes.light.pageBg), prog: parseColor(palettes.light.progFill), pulse: parseColor(palettes.light.pulse), shadow: parseColor(palettes.light.shadow) };
  function applyTheme(dark:boolean){
    isDark=dark; const p=palettes[dark?'dark':'light'];
    themeStyle.textContent=buildCSS(p);
    cssRules=parseCSS(themeStyle.textContent);
    themeCol={ backdrop:parseColor(p.backdrop), pageBg:parseColor(p.pageBg), prog:parseColor(p.progFill), pulse:parseColor(p.pulse), shadow:parseColor(p.shadow) };
    for(const el of styledEls){ const cs=getComputedStyle(el.el); el.color=parseColor(cs.color); el.bg=parseColor(cs.backgroundColor); el.curBg=parseColor(cs.backgroundColor); el.upper=cs.textTransform==='uppercase'; el.textAlign=cs.textAlign||'left'; }
    if(themeBtn) themeBtn.textContent=dark?'☀️':'🌙';
  }

  // ── Camera ───────────────────────────────────────────────────────────────────
  let camZ=0.5,camX=600,camY=300;
  let viewZ=camZ,viewX=camX,viewY=camY;
  let tgtX=camX,tgtY=camY,tgtZ=camZ;
  let velX=0,velY=0,dragging=false,lastMoveT=0;
  const pointers=new Map<number,{x:number;y:number}>();
  let mx=innerWidth*dpr/2, my=innerHeight*dpr/2, mwx=0, mwy=0;
  let minZoom=0.02;

  function setSize(){
    const w=innerWidth,h=innerHeight;
    [rCanvas,tCanvas].forEach(c=>{c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.height=h+'px';});
    if(pages.length){const allH=Math.max(...pages.map(p=>p.y+p.h))+60;minZoom=Math.min(tCanvas.width/PAGE_W,tCanvas.height/allH)*0.95;} else minZoom=0.002;
  }
  function bufCoords(clientX:number,clientY:number){
    const rc=rCanvas.getBoundingClientRect();
    return { x:(clientX-rc.left)*(rCanvas.width/rc.width), y:(clientY-rc.top)*(rCanvas.height/rc.height) };
  }
  function scrToWorld(sx:number,sy:number){return{x:(sx-tCanvas.width/2)/camZ+camX,y:(sy-tCanvas.height/2)/camZ+camY}}
  function goToPage(i:number){
    const p=pages[i]; if(!p) return;
    tgtZ=(tCanvas.width/PAGE_W)*0.96;
    tgtX=p.x+p.w/2; tgtY=p.y+p.h/2;
    velX=velY=0;
  }

  const docRoot: StyledEl = {
    tag:'BODY', classes:[], id:'', x:0, y:0, w:PAGE_W, h:docH, pad:[0,0,0,0], text:'',
    children: pageRoots, parent:null, el: container,
    fs:16, lh:16, radius:0, color:[0,0,0,1], bg:[0,0,0,0], textAlign:'left', upper:false,
    curBg:[0,0,0,0], curShadow:0, inline:false, skipText:true, hasFlow:false, isPre:false,
  };
  function hitTest(wx:number,wy:number):StyledEl|null{
    function find(el:StyledEl):StyledEl|null{
      for(let i=el.children.length-1;i>=0;i--){
        const c=el.children[i];
        if(wx>=c.x&&wx<=c.x+c.w&&wy>=c.y&&wy<=c.y+c.h){const deeper=find(c);return deeper||c;}
      }
      return null;
    }
    if(wx>=docRoot.x&&wx<=docRoot.x+docRoot.w&&wy>=docRoot.y&&wy<=docRoot.y+docRoot.h)return find(docRoot)||docRoot;
    return null;
  }

  let pressed:StyledEl|null=null;
  rCanvas.addEventListener('pointerdown',e=>{
    rCanvas.setPointerCapture(e.pointerId);
    const b=bufCoords(e.clientX,e.clientY);
    pointers.set(e.pointerId,{x:b.x,y:b.y});dragging=true;velX=velY=0;lastMoveT=performance.now();
    const w=scrToWorld(b.x,b.y);
    const hit=hitTest(w.x,w.y);
    pressed=(hit&&(hit.classes.includes('btn')||hit.classes.includes('card')||hit.classes.includes('feature')))?hit:null;
    let nav:StyledEl|null=hit; while(nav && !nav.el.getAttribute('data-page')) nav=nav.parent;
    if(nav) goToPage(parseInt(nav.el.getAttribute('data-page')||'0',10));
  });
  rCanvas.addEventListener('pointermove',e=>{
    const b=bufCoords(e.clientX,e.clientY); mx=b.x; my=b.y;
    if(!pointers.has(e.pointerId))return;
    const prev=pointers.get(e.pointerId)!;pointers.set(e.pointerId,{x:b.x,y:b.y});
    if(pointers.size===1){camX-=(b.x-prev.x)/camZ;camY-=(b.y-prev.y)/camZ;tgtX=camX;tgtY=camY;tgtZ=camZ;const t=performance.now(),ddt=t-lastMoveT;if(ddt>0){velX=velX?velX*.7+((b.x-prev.x)/ddt)*.3:(b.x-prev.x)/ddt;velY=velY?velY*.7+((b.y-prev.y)/ddt)*.3:(b.y-prev.y)/ddt;lastMoveT=t}}
  });
  const rel=()=>{pointers.clear();dragging=false;pressed=null;if(performance.now()-lastMoveT>80)velX=velY=0;};
  rCanvas.addEventListener('pointerup',rel);rCanvas.addEventListener('pointercancel',rel);
  // Direct, fast zoom-to-cursor (no easing — continuous deltaY, no steps)
  rCanvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const b=bufCoords(e.clientX,e.clientY);
    const Cw=tCanvas.width, Ch=tCanvas.height;
    const wx=(b.x-Cw/2)/camZ+camX, wy=(b.y-Ch/2)/camZ+camY;
    camZ*=Math.exp(-e.deltaY*.0008);
    if(camZ<minZoom){ camZ=minZoom; camX=PAGE_W/2; camY=docH/2; tgtX=camX; tgtY=camY; tgtZ=camZ; }
    else { camX=wx-(b.x-Cw/2)/camZ; camY=wy-(b.y-Ch/2)/camZ; tgtX=camX; tgtY=camY; tgtZ=camZ; }
    viewX=camX;viewY=camY;viewZ=camZ;
  },{passive:false});

  // Dark-mode toggle (fixed DOM control, never affected by zoom)
  let themeBtn:HTMLButtonElement|null=null;
  const tb=document.createElement('button');
  tb.textContent='🌙'; tb.title='Toggle dark mode';
  tb.style.cssText='position:fixed;top:14px;right:14px;z-index:10;width:42px;height:42px;border-radius:10px;border:none;cursor:pointer;font-size:18px;background:rgba(22,22,46,0.85);color:#fff;';
  tb.onclick=()=>applyTheme(!isDark);
  document.body.appendChild(tb); themeBtn=tb;

  addEventListener('resize',setSize);setSize();goToPage(0);camX=tgtX;camY=tgtY;camZ=tgtZ;

  // ── Frame loop ────────────────────────────────────────────────────────────
  // Cache static atlas data (curves/rows never change after atlas build)
  // Pre-create renderer ONCE — only shader module + pipeline are cached
  const renderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' });
  // Base glyph atlas data — copied into mutable arrays each frame, then rect geometry appended
  const baseCrv:number[] = Array.from(atlas.curves);
  const baseRws:number[] = Array.from(atlas.rows);
  const baseCrvLen = baseCrv.length;
  const baseRwsLen = baseRws.length;
  // Reusable typed array buffers (grow on demand, never shrink)
  let crvFA = new Float32Array(Math.max(baseCrvLen * 2, 4096));
  let rwsUA = new Uint32Array(Math.max(baseRwsLen * 2, 1024));
  let instFA = new Float32Array(16384);
  let instJS:number[] = [];
  let fpsDt=16, prevTs=0;
  function frame(now:number){
    requestAnimationFrame(frame);
    const dt=prevTs?now-prevTs:16;prevTs=now;
    fpsDt=fpsDt*.9+dt*.1;fpsEl.textContent=`${Math.round(1000/fpsDt)} fps`;

    const e=1-Math.pow(0.01,dt/1000); // smooth easing factor
    if(!dragging){
      if(Math.abs(velX)>0.01||Math.abs(velY)>0.01){
        camX-=(velX*dt)/camZ;camY-=(velY*dt)/camZ;tgtX=camX;tgtY=camY;tgtZ=camZ;
        velX*=Math.pow(.85,dt/16);velY*=Math.pow(.85,dt/16);
        if(Math.abs(velX)<.01&&Math.abs(velY)<.01)velX=velY=0;
      } else {
        camX+=(tgtX-camX)*e; camY+=(tgtY-camY)*e; camZ+=(tgtZ-camZ)*e;
      }
    }
    camZ=Math.max(minZoom,camZ);
    viewX=camX;viewY=camY;viewZ=camZ;
    const Cw=tCanvas.width,Ch=tCanvas.height;

    mwx=(mx-Cw/2)/viewZ+viewX;
    mwy=(my-Ch/2)/viewZ+viewY;
    const hovered=hitTest(mwx,mwy);
    const hoveredSet=new Set<StyledEl>();let cur=hovered;while(cur){hoveredSet.add(cur);cur=cur.parent;}

    // Copy static glyph data, then append rect geometry each frame
    const crv:number[]=(baseCrv as number[]), rws:number[]=(baseRws as number[]);
    crv.length=baseCrvLen; rws.length=baseRwsLen;
    instJS.length=0;
    const inst:number[]=instJS;
    // Pass 1: per-page backgrounds
    for(const pg of pageRoots) addRect(pg.x, pg.y, pg.x+pg.w, pg.y+pg.h, themeCol.pageBg, crv, rws, inst);

    const k=1-Math.pow(0.0015,dt/1000);
    // Pass 2: element backgrounds (non-inline only)
    // Cache: only resolve CSS for hovered/pressed elements; everyone else uses cached bg
    for(const el of styledEls){
      const isHov=hoveredSet.has(el), isAct=el===pressed;
      if(isHov||isAct){
        const state=isHov?'hover':'active';
        const st=resolveStyle(el,cssRules,state);
        const hovBg=parseColor(st['background-color']||st.background||'');
        if(hovBg[3]>0.001) for(let i=0;i<4;i++) el.curBg[i]+=(hovBg[i]-el.curBg[i])*k;
      }else{
        for(let i=0;i<4;i++) el.curBg[i]+=(el.bg[i]-el.curBg[i])*k;
      }

      const tgtShadow=(el.classes.includes('card')||el.classes.includes('btn')||el.classes.includes('feature'))&&isHov?1:0;
      el.curShadow+=(tgtShadow-el.curShadow)*k;

      if(!el.inline && (el.curBg[3]>0.004 || el.classes.includes('bounce') || el.classes.includes('heartbeat'))){
        const b=el.curBg;
        if(el.classes.includes('bounce')){
          const dy=Math.sin(now/520)*8;
          addRect(el.x,el.y+dy,el.x+el.w,el.y+el.h+dy,b[3]>0.004?b:[0,0,0,0],crv,rws,inst);
        }else if(el.classes.includes('heartbeat')){
          const sc=1+Math.sin(now/380)*0.065;
          const cx=el.x+el.w/2, cy=el.y+el.h/2, hw=el.w*sc/2, hh=el.h*sc/2;
          addRect(cx-hw,cy-hh,cx+hw,cy+hh,b[3]>0.004?b:[0,0,0,0],crv,rws,inst);
        }else{
          if(el.curShadow>0.01){const g=14*el.curShadow;addRect(el.x-g,el.y-g,el.x+el.w+g,el.y+el.h+g,[themeCol.shadow[0],themeCol.shadow[1],themeCol.shadow[2],themeCol.shadow[3]*el.curShadow],crv,rws,inst);}
          addRect(el.x,el.y,el.x+el.w,el.y+el.h,el.curBg,crv,rws,inst);
        }
      }

      if(el.classes.includes('progress')){
        const frac=((now%3200)/3200);
        const fw=(el.w-el.pad[3]-el.pad[1])*frac;
        addRect(el.x+el.pad[3], el.y+el.h/2-5, el.x+el.pad[3]+fw, el.y+el.h/2+5, themeCol.prog, crv,rws,inst);
      }
      if(el.classes.includes('pulse')){
        const a=0.45+0.55*Math.sin(now/280);
        addRect(el.x+2, el.y+el.h/2-7, el.x+16, el.y+el.h/2+7, [themeCol.pulse[0],themeCol.pulse[1],themeCol.pulse[2],a], crv,rws,inst);
      }
    }
    // Pass 3: text (all text drawn AFTER all backgrounds for correct z-order)
    for(const el of styledEls){
      if(el.hasFlow && !el.skipText){
        if(el.isPre) layoutPre(el, font, atlas, inst);
        else layoutFlow(el, font, atlas, inst, now);
      }
    }

    rCtx.fillStyle=rgb(themeCol.backdrop);rCtx.fillRect(0,0,Cw,Ch);
    // Convert to typed arrays, reusing buffers when possible
    if (crv.length > crvFA.length) crvFA = new Float32Array(crv.length * 2);
    crvFA.set(crv);
    if (rws.length > rwsUA.length) rwsUA = new Uint32Array(rws.length * 2);
    rwsUA.set(rws);
    if (inst.length > instFA.length) instFA = new Float32Array(inst.length * 2);
    instFA.set(inst);
    const enc=device.createCommandEncoder();
    const pass=enc.beginRenderPass({colorAttachments:[{view:gpuCtx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    renderer.setUniforms({width:Cw,height:Ch,cam:[viewZ,viewZ,Cw/2-viewZ*viewX,Ch/2-viewZ*viewY]});
    renderer.draw(pass, crvFA.subarray(0,crv.length), rwsUA.subarray(0,rws.length), instFA.subarray(0,inst.length), inst.length/16);
    pass.end();device.queue.submit([enc.finish()]);
  }
  requestAnimationFrame(frame);
}
main().catch(e=>{const el=document.getElementById('error')!;el.style.display='block';el.textContent=e.message||String(e);console.error(e)});
