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

function matchesSelector(el: StyledEl, sel: string): boolean {
  if (!sel) return false;
  const parts = sel.match(/([.#]?[\w-]+)/g) || [];
  if (parts.length === 0) return false;
  const hasTag = parts[0][0] !== '.' && parts[0][0] !== '#';
  let tagOk = !hasTag || el.tag === parts[0].toUpperCase();
  if (hasTag) parts.shift();
  for (const p of parts) {
    if (p[0]==='.') { if (!el.classes.includes(p.slice(1))) return false }
    else if (p[0]==='#') { if (el.id !== p.slice(1)) return false }
  }
  return tagOk;
}

function resolveStyle(el: StyledEl, rules: CSSRule[], state: string): Record<string,string> {
  const props: Record<string,string> = {};
  for (const rule of rules) {
    const sel = rule.selector;
    const isState = sel.endsWith(':'+state);
    const baseSel = isState ? sel.slice(0, -(state.length+1)) : sel;
    if ((!state || isState) && matchesSelector(el, baseSel)) Object.assign(props, rule.props);
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

// Inline text flow: lays out an element's own text plus inline children as one
// wrapped paragraph, honoring text-align (so button/centered text is centered)
// and per-element uppercase. `now` drives the marquee scroll.
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
  let curX=left-scroll, curY=el.y+el.pad[0];
  let line: {w:string;fs:number;color:number[];ww:number}[]=[];
  const flush=()=>{
    if(!line.length)return;
    let total=0;for(let i=0;i<line.length;i++){if(i)total+=tw(' ',font,line[i].fs);total+=line[i].ww;}
    let sx=align==='center'?mid-total/2:align==='right'?right-total:left;
    for(const wd of line){const oy=curY+(el.lh-wd.fs)*0.8;if(!(el.classes.includes('marquee')&&(sx>right||sx+wd.ww<left)) && oy<=el.y+el.h-el.pad[2])layoutStr(inst,wd.w,wd.color,atlas.table,font,{x:sx,y:oy,size:wd.fs});sx+=wd.ww+tw(' ',font,wd.fs);}
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
  const left=el.x+el.pad[3], right=el.x+el.w-el.pad[1];
  let curX=left, curY=el.y+el.pad[0];
  for(const s of segs){
    if(s.kind==='nl'){curX=left;curY+=el.lh;continue;}
    if(s.kind==='space'){curX+=tw(' ',font,14);continue;}
    const ww=tw(s.text,font,14);
    if(curX+ww>right&&curX>left){curX=left;curY+=el.lh;}
    const oy=curY+(el.lh-14)*0.8;
    if(oy<=el.y+el.h-el.pad[2]) layoutStr(inst,s.text,s.color,atlas.table,font,{x:curX,y:oy,size:14});
    curX+=ww;
  }
}

// ── Document ────────────────────────────────────────────────────────────────

const CSS_SRC = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.kicker { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #8866aa; margin-bottom: 10px; }
.page { font-family: Lato, sans-serif; background: #f0ede6; color: #1a1a2e; padding: 32px 80px 64px; width: 100%; max-width: none; margin: 0 0 90px; border-radius: 0 0 18px 18px; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; padding-bottom: 18px; border-bottom: 1px solid #d8d2c6; }
.brand { font-size: 22px; font-weight: 700; color: #16162e; }
.brand span { color: #4466cc; }
.nav-links { display: flex; gap: 22px; }
.nav-links a { font-size: 14px; color: #5a4a8a; text-decoration: none; }
.hero { margin-bottom: 44px; }
.hero h1 { font-size: 52px; font-weight: 700; color: #16162e; line-height: 1.05; margin-bottom: 16px; }
.hero h1 em { font-style: normal; color: #4466cc; }
.lead { font-size: 19px; line-height: 1.6; color: #4a4a55; margin-bottom: 22px; max-width: 640px; }
.btn-row { display: flex; gap: 12px; margin-bottom: 28px; }
h2 { font-size: 26px; font-weight: 700; color: #2a2a4e; margin-top: 44px; margin-bottom: 14px; }
p { font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
.highlight { background: #e8e0d4; border-left: 4px solid #8866aa; padding: 16px 20px; margin: 24px 0; border-radius: 4px; font-size: 15px; color: #444; }
pre { background: #1e1e2e; color: #cdd6f4; padding: 20px 24px; border-radius: 8px; font-size: 14px; line-height: 1.5; margin: 20px 0; }
.grid { display: flex; gap: 20px; margin: 24px 0; }
.feature { flex: 1; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 0 0 rgba(0,0,0,0); }
.feature:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.feature h3 { font-size: 19px; font-weight: 700; color: #2a2a4e; margin-bottom: 8px; }
.callout { background: #4a5bbf; color: white; padding: 28px 32px; border-radius: 14px; margin: 24px 0; display: flex; align-items: center; gap: 24px; }
.callout h3 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.callout p { color: #e8ecff; margin-bottom: 0; }
ul { margin: 12px 0 20px 22px; }
li { font-size: 16px; line-height: 1.7; }
.card { background: white; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 0 0 rgba(0,0,0,0); }
.card:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.card h3 { font-size: 19px; font-weight: 700; color: #2a2a4e; margin-bottom: 8px; }
.tag { display: inline-block; background: #e0d8f0; color: #5a4a8a; padding: 3px 11px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.btn { display: inline-block; text-align: center; background: #4466cc; color: white; padding: 11px 26px; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 0 0 rgba(0,0,0,0); }
.btn:hover { background: #3355bb; box-shadow: 0 4px 14px rgba(68,102,204,0.4); }
.btn:active { background: #2244aa; }
.btn.ghost { background: transparent; color: #4466cc; border: 2px solid #4466cc; }
.btn.ghost:hover { background: #eef2ff; }
.progress { background: #d9d3c8; border-radius: 999px; height: 10px; margin: 18px 0; overflow: hidden; }
.pulse { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: #2f9e54; font-weight: 700; padding-left: 22px; }
.marquee { background: #16162e; color: #9aa6ff; padding: 12px 18px; border-radius: 8px; font-size: 14px; overflow: hidden; white-space: nowrap; margin: 20px 0; }
.stats { display: flex; gap: 16px; margin: 24px 0; }
.stat { flex: 1; background: #fff; border-radius: 12px; padding: 20px; text-align: center; }
.stat .num { font-size: 34px; font-weight: 700; color: #4466cc; }
.stat .lbl { font-size: 13px; color: #777; margin-top: 4px; }
.steps { margin: 20px 0; }
.step { display: flex; gap: 16px; margin-bottom: 18px; align-items: flex-start; }
.step .n { flex: 0 0 34px; height: 34px; border-radius: 50%; background: #4466cc; color: white; font-weight: 700; text-align: center; }
.pullquote { font-size: 24px; line-height: 1.4; color: #2a2a4e; border-left: 4px solid #4466cc; padding: 8px 0 8px 22px; margin: 24px 0; font-style: italic; }
.badges { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
.badge { background: #fff; border: 1px solid #ddd6c8; border-radius: 8px; padding: 8px 14px; font-size: 14px; color: #444; }
.cta { text-align: center; background: #3a4db0; color: white; border-radius: 16px; padding: 40px; margin: 24px 0; }
.cta h3 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.cta p { color: #e8ecff; margin-bottom: 18px; }
.divider { height: 1px; background: #d8d2c6; margin: 28px 0; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #d8d2c6; font-size: 13px; color: #999; }
`;

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
    <div class="stat"><div class="num">∞</div><div class="lbl">zoom levels</div></div>
  </div>
  <h2>How it works</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><div><h3>Parse</h3><p>The stylesheet is parsed into rules; selectors are matched against the element tree.</p></div></div>
    <div class="step"><div class="n">2</div><div><h3>Layout</h3><p>The browser computes every box; we read its rect so hits line up with pixels.</p></div></div>
    <div class="step"><div class="n">3</div><div><h3>Paint</h3><p>Each background and glyph is one GPU instance, shaded analytically.</p></div></div>
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
  <div class="badges">
    <div class="badge">Headings</div><div class="badge">Lead text</div><div class="badge">Cards</div><div class="badge">Badges</div><div class="badge">Stats</div><div class="badge">Quotes</div><div class="badge">Code</div><div class="badge">Buttons</div>
  </div>
  <h2>Components</h2>
  <div class="grid">
    <div class="feature"><h3>Stat blocks</h3><p>Big numbers with small labels &mdash; great for dashboards.</p></div>
    <div class="feature"><h3>Step lists</h3><p>Numbered steps with circular markers guide the reader.</p></div>
    <div class="feature"><h3>Pull quotes</h3><p>Italic callouts break up long-form text.</p></div>
  </div>
  <div class="cta"><h3>Ready to render?</h3><p>Bring your own stylesheet &mdash; windfoil will parse it.</p><div class="btn jump" data-page="0">Back to home</div></div>
  <p class="footer">Windfoil &middot; Showcase page</p>
</div>
`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fpsEl = document.getElementById('fps')!;
  const dpr = Math.min(devicePixelRatio, 2);
  const PAGE_W = 1040;   // hard maximum page column width (world units)
  const NAV_W = 76;     // permanent side-nav width (CSS px, zoom-independent)

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

  const cssRules = parseCSS(CSS_SRC);

  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:'+PAGE_W+'px';
  document.body.appendChild(container);
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style><style>${CSS_SRC}</style>${HTML_SRC}`;
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
  document.body.removeChild(container);

  const allChars=new Set<string>();
  for(const el of styledEls) for(const ch of el.text) allChars.add(ch);
  for(const ch of '●∞→★✓—') allChars.add(ch);
  const atlas=buildGlyphAtlas(font,[...allChars].join(' '));

  // ── Camera (with eased navigation between pages) ───────────────────────────
  let camZ=0.5,camX=600,camY=300;
  let viewZ=camZ,viewX=camX,viewY=camY;
  let tgtX=camX,tgtY=camY,tgtZ=camZ;
  let velX=0,velY=0,dragging=false,lastMoveT=0;
  let pressed:StyledEl|null=null;
  const pointers=new Map<number,{x:number;y:number}>();
  let mx=innerWidth*dpr/2, my=innerHeight*dpr/2, mwx=0, mwy=0;
  let minZoom=0.02;
  let docCY=docH/2;

  function setSize(){
    const w=innerWidth,h=innerHeight;
    [rCanvas,tCanvas].forEach(c=>{c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.height=h+'px';});
    if(pages.length){const allH=Math.max(...pages.map(p=>p.y+p.h))+60;minZoom=Math.min((tCanvas.width-NAV_W*dpr)/PAGE_W,tCanvas.height/allH)*0.95;}
  }
  function bufCoords(clientX:number,clientY:number){
    const rc=rCanvas.getBoundingClientRect();
    return { x:(clientX-rc.left)*(rCanvas.width/rc.width), y:(clientY-rc.top)*(rCanvas.height/rc.height) };
  }
  function scrToWorld(sx:number,sy:number){return{x:(sx-tCanvas.width/2)/camZ+camX,y:(sy-tCanvas.height/2)/camZ+camY}}
  function navOffsetX(z:number){ return (NAV_W*dpr)/(2*z); }
  let currentPage=0; const navBtns:HTMLButtonElement[]=[];
  function updateNav(){ navBtns.forEach((b,i)=>{ const on=i===currentPage; b.style.background=on?'#4466cc':'rgba(255,255,255,0.06)'; b.style.color=on?'#fff':'#cfc8e8'; }); }
  function goToPage(i:number){
    const p=pages[i]; if(!p) return;
    tgtZ=((tCanvas.width-NAV_W*dpr)/PAGE_W)*0.96; // fit page WIDTH into the area right of the side nav
    tgtX=p.x+p.w/2 - navOffsetX(tgtZ);           // center inside the area right of the side nav
    tgtY=p.y+p.h/2;
    velX=velY=0; currentPage=i; updateNav();
  }

  // Virtual root spanning all pages for hit-testing
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

  rCanvas.addEventListener('pointerdown',e=>{
    rCanvas.setPointerCapture(e.pointerId);
    const b=bufCoords(e.clientX,e.clientY);
    pointers.set(e.pointerId,{x:b.x,y:b.y});dragging=true;velX=velY=0;lastMoveT=performance.now();
    const w=scrToWorld(b.x,b.y);
    const hit=hitTest(w.x,w.y);
    pressed = (hit && (hit.classes.includes('btn')||hit.classes.includes('card')||hit.classes.includes('feature')))?hit:null;
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
  rCanvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const b=bufCoords(e.clientX,e.clientY);
    const Cw=tCanvas.width, Ch=tCanvas.height;
    const wx=(b.x-Cw/2)/camZ+camX, wy=(b.y-Ch/2)/camZ+camY;
    camZ*=Math.exp(-e.deltaY*.0008); camZ=Math.max(minZoom,camZ);
    camX=wx-(b.x-Cw/2)/camZ; camY=wy-(b.y-Ch/2)/camZ;
    if(camZ<=minZoom*1.02){ camX=PAGE_W/2 - navOffsetX(minZoom); camY=docCY; camZ=minZoom; } // zoom-out reveals the whole document
    tgtX=camX;tgtY=camY;tgtZ=camZ; viewX=camX;viewY=camY;viewZ=camZ;
  },{passive:false});
  // Permanent side navigation — real DOM, fixed, never affected by zoom/pan
  const navEl=document.createElement('nav');
  navEl.style.cssText=`position:fixed;left:0;top:0;bottom:0;width:${NAV_W}px;z-index:10;`+
    `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;`+
    `background:rgba(22,22,46,0.92);border-right:1px solid rgba(255,255,255,0.08);`;
  const pageNames=['Home','Features','Showcase'];
  pages.forEach((p,i)=>{
    const b=document.createElement('button');
    b.textContent=String(i+1); b.title=pageNames[i]||('Page '+(i+1));
    b.style.cssText=`width:44px;height:44px;border-radius:12px;border:none;cursor:pointer;`+
      `font:700 15px Lato,sans-serif;color:#cfc8e8;background:rgba(255,255,255,0.06);transition:background .15s,color .15s;`;
    b.onmouseenter=()=>{ if(i!==currentPage){b.style.background='rgba(68,102,204,0.35)';b.style.color='#fff';} };
    b.onmouseleave=()=>{ if(i!==currentPage){b.style.background='rgba(255,255,255,0.06)';b.style.color='#cfc8e8';} };
    b.onclick=()=>goToPage(i);
    navBtns.push(b); navEl.appendChild(b);
    const lab=document.createElement('div'); lab.textContent=pageNames[i]||('Page '+(i+1));
    lab.style.cssText='font:600 9px Lato,sans-serif;color:#8a85a8;letter-spacing:.5px;text-transform:uppercase;';
    navEl.appendChild(lab);
  });
  document.body.appendChild(navEl);

  addEventListener('resize',setSize);setSize();goToPage(0);camX=tgtX;camY=tgtY;camZ=tgtZ;

  // ── Frame loop ────────────────────────────────────────────────────────────
  let fpsDt=16, prevTs=0;
  function frame(now:number){
    requestAnimationFrame(frame);
    const dt=prevTs?now-prevTs:16;prevTs=now;
    fpsDt=fpsDt*.9+dt*.1;fpsEl.textContent=`${Math.round(1000/fpsDt)} fps`;

    // Camera update: inertia, then eased navigation
    if(!dragging){
      if(Math.abs(velX)>0.01||Math.abs(velY)>0.01){
        camX-=(velX*dt)/camZ;camY-=(velY*dt)/camZ;tgtX=camX;tgtY=camY;tgtZ=camZ;
        velX*=Math.pow(.85,dt/16);velY*=Math.pow(.85,dt/16);
        if(Math.abs(velX)<.01&&Math.abs(velY)<.01)velX=velY=0;
      } else {
        const e=1-Math.pow(0.004,dt/1000);
        camX+=(tgtX-camX)*e;camY+=(tgtY-camY)*e;camZ+=(tgtZ-camZ)*e;
      }
    }
    camZ=Math.max(minZoom,camZ);
    viewX=camX;viewY=camY;viewZ=camZ;
    const Cw=tCanvas.width,Ch=tCanvas.height;

    mwx=(mx-Cw/2)/viewZ+viewX;
    mwy=(my-Ch/2)/viewZ+viewY;
    const hovered=hitTest(mwx,mwy);
    const hoveredSet=new Set<StyledEl>();let cur=hovered;while(cur){hoveredSet.add(cur);cur=cur.parent;}

    const crv=Array.from(atlas.curves),rws=Array.from(atlas.rows),inst:number[]=[];
    addRect(0,0,PAGE_W,docH,[0.94,0.93,0.90,1],crv,rws,inst);

    const k=1-Math.pow(0.0015,dt/1000);
    for(const el of styledEls){
      const state=hoveredSet.has(el)?'hover':(el===pressed?'active':'');
      const st=resolveStyle(el,cssRules,state);
      const nrm=resolveStyle(el,cssRules,'');
      const tgtBg=parseColor(st['background-color']||st.background||nrm['background-color']||nrm.background||'transparent');
      for(let i=0;i<4;i++) el.curBg[i]+=(tgtBg[i]-el.curBg[i])*k;

      const tgtShadow=(el.classes.includes('card')||el.classes.includes('btn')||el.classes.includes('feature'))&&hoveredSet.has(el)?1:0;
      el.curShadow+=(tgtShadow-el.curShadow)*k;

      if(el.curBg[3]>0.004){
        if(el.curShadow>0.01){const g=14*el.curShadow;addRect(el.x-g,el.y-g,el.x+el.w+g,el.y+el.h+g,[0,0,0,0.12*el.curShadow],crv,rws,inst);}
        addRect(el.x,el.y,el.x+el.w,el.y+el.h,el.curBg,crv,rws,inst);
      }

      if(el.hasFlow && !el.skipText){
        if(el.isPre) layoutPre(el, font, atlas, inst);
        else layoutFlow(el, font, atlas, inst, now);
      }

      if(el.classes.includes('progress')){
        const frac=((now%3200)/3200);
        const fw=(el.w-el.pad[3]-el.pad[1])*frac;
        addRect(el.x+el.pad[3], el.y+el.h/2-5, el.x+el.pad[3]+fw, el.y+el.h/2+5, [0.27,0.4,0.8,1], crv,rws,inst);
      }
      if(el.classes.includes('pulse')){
        const a=0.45+0.55*Math.sin(now/280);
        addRect(el.x+2, el.y+el.h/2-7, el.x+16, el.y+el.h/2+7, [0.18,0.62,0.33,a], crv,rws,inst);
      }
    }

    rCtx.fillStyle='#f0ede6';rCtx.fillRect(0,0,Cw,Ch);
    const wf=createGlyphRenderer(device,{code:shaderCode,format:'rgba8unorm',curves:new Float32Array(crv),rows:new Uint32Array(rws),instances:new Float32Array(inst),instanceCount:inst.length/16});
    const enc=device.createCommandEncoder();
    const pass=enc.beginRenderPass({colorAttachments:[{view:gpuCtx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    wf.setUniforms({width:Cw,height:Ch,cam:[viewZ,viewZ,Cw/2-viewZ*viewX,Ch/2-viewZ*viewY]});wf.draw(pass);pass.end();device.queue.submit([enc.finish()]);
  }
  requestAnimationFrame(frame);
}
main().catch(e=>{const el=document.getElementById('error')!;el.style.display='block';el.textContent=e.message||String(e);console.error(e)});
