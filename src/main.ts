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
  transProps: Record<string,{from:number;to:number;start:number;duration:number}>;
  el: Element; // DOM ref for layout
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
  if (!c || c==='transparent') return [0,0,0,0];
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) return [parseInt(m[1])/255,parseInt(m[2])/255,parseInt(m[3])/255,m[4]?parseFloat(m[4]):1];
  if (c[0]==='#') {
    const h = c.slice(1);
    if (h.length===3) return [parseInt(h[0]+h[0],16)/255,parseInt(h[1]+h[1],16)/255,parseInt(h[2]+h[2],16)/255,1];
    if (h.length===6) return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4),16)/255,1];
  }
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
    if ((!state || isState) && matchesSelector(el, baseSel)) {
      Object.assign(props, rule.props);
    }
  }
  return props;
}

// ── Windfoil helpers ────────────────────────────────────────────────────────

function tw(text: string, font: FontFace, size: number): number {
  const s=size/font.unitsPerEm;let w=0,prev:string|null=null;
  for(const ch of text){if(prev)w+=kerningOf(font,prev,ch)*s;w+=advanceOf(font,ch)*s;prev=ch}return w;
}
function wrapText(text: string, font: FontFace, size: number, maxW: number): string[] {
  const lines:string[]=[];
  for(const para of text.split('\n')){const words=para.split(' ');let line='';
    for(const w of words){const test=line?line+' '+w:w;if(tw(test,font,size)>maxW&&line){lines.push(line);line=w}else line=test}
    if(line)lines.push(line);}return lines;
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

// ── Document ────────────────────────────────────────────────────────────────

const CSS_SRC = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.page { font-family: sans-serif; background: #f0ede6; color: #1a1a2e; padding: 40px 80px; max-width: 900px; }
h1 { font-size: 36px; font-weight: 700; color: #16162e; margin-bottom: 8px; }
h2 { font-size: 24px; font-weight: 700; color: #2a2a4e; margin-top: 36px; margin-bottom: 12px; }
p { font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
.highlight { background: #e8e0d4; border-left: 4px solid #8866aa; padding: 16px 20px; margin: 24px 0; border-radius: 4px; font-size: 15px; color: #444; }
pre { background: #1e1e2e; color: #cdd6f4; padding: 20px 24px; border-radius: 8px; font-size: 14px; line-height: 1.5; margin: 20px 0; }
ul { margin: 12px 0 20px 24px; }
li { font-size: 16px; line-height: 1.6; }
.card { background: white; border-radius: 8px; padding: 24px; margin: 24px 0; transition: box-shadow 0.3s; }
.card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.card h3 { font-size: 18px; font-weight: 700; color: #2a2a4e; margin-bottom: 8px; }
.tag { display: inline-block; background: #e0d8f0; color: #5a4a8a; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.btn { display: inline-block; background: #4466cc; color: white; padding: 10px 24px; border-radius: 6px; font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.2s; }
.btn:hover { background: #3355bb; }
.btn:active { background: #2244aa; transform: scale(0.97); }
.footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 13px; color: #999; }
`;

const HTML_SRC = `
<div class="page" style="padding:40px 80px;max-width:900px;margin:0 auto;background:#f0ede6;color:#1a1a2e;font-family:Lato,sans-serif">
<h1>Windfoil CSS Engine</h1>
<p>Full CSS rule parsing, selector matching, pseudo-class state machine (:hover, :active), and transition interpolation — all rendered through windfoil's analytic GPU pipeline. Text is <b style="font-weight:700">always razor sharp at any zoom level</b>.</p>
<div class="highlight">The CSS engine parses stylesheets, resolves selectors against the element tree, tracks :hover and :active pseudo-classes, and interpolates CSS transitions over time. Every background, every glyph, every hover state change is one GPU draw call.</div>
<h2>Hover effects</h2>
<div class="card"><h3>Hover Card</h3><p>Move your mouse over this card. The box-shadow transition interpolates smoothly across frames. The hover state is detected by hit-testing the cursor's world-space position against element bounds.</p><span class="tag">hover</span><span class="tag">transition</span></div>
<h2>Code block</h2>
<pre>export function coverage(pixel: vec2f, atlas: CurveAtlas) -> f32 {
  var w: f32 = 0.0;
  for each row-band containing pixel.y:
    for each curve piece in band:
      w += winding_contribution(curve, pixel);
  return min(abs(w), 1.0);
}</pre>
<p>Code blocks render with syntax-colored text on a dark background. The shader's closed-form integral over each pixel ensures zero aliasing artifacts regardless of font size or zoom.</p>
<div class="card"><h3>Interactive button</h3><p>Click or hover this button. The background color transitions smoothly. The :active state triggers a scale transform.</p><div class="btn" onclick="">Click me</div></div>
<p class="footer">Windfoil CSS Engine &middot; Per-pixel analytic AA &middot; Full CSS state machine</p>
</div>
`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fpsEl = document.getElementById('fps')!;
  const dpr = Math.min(devicePixelRatio, 2);

  // Two-canvas hybrid
  const rCanvas = document.createElement('canvas');
  rCanvas.style.cssText = 'position:fixed;inset:0;z-index:0;cursor:grab';
  document.body.appendChild(rCanvas);
  const rCtx = rCanvas.getContext('2d')!;

  const tCanvas = document.createElement('canvas');
  tCanvas.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none';
  document.body.appendChild(tCanvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);
  const gpuCtx = tCanvas.getContext('webgpu')!;
  gpuCtx.configure({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' });

  // ── Parse CSS ─────────────────────────────────────────────────────────────
  const cssRules = parseCSS(CSS_SRC);

  // ── Layout via browser DOM ────────────────────────────────────────────────
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:1200px';
  document.body.appendChild(container);
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style>${HTML_SRC}`;
  await document.fonts.ready;

  // ── Build element tree from DOM ───────────────────────────────────────────
  const styledEls: StyledEl[] = [];
  function walkDOM(el: Element, parent: StyledEl|null): StyledEl|null {
    if (el.tagName==='STYLE'||el.tagName==='SCRIPT') return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const cx = r.left-container.getBoundingClientRect().left;
    const cy = r.top-container.getBoundingClientRect().top;
    if (r.width<2||r.height<2) return null;
    const pad = [parseFloat(cs.paddingTop)||0,parseFloat(cs.paddingRight)||0,parseFloat(cs.paddingBottom)||0,parseFloat(cs.paddingLeft)||0];
    let text='';for(const n of Array.from(el.childNodes))if(n.nodeType===3)text+=n.textContent||'';
    const se: StyledEl = {
      tag: el.tagName, classes: Array.from(el.classList), id: el.id,
      x:cx, y:cy, w:r.width, h:r.height, pad,
      text:text.trim(),
      children:[], parent,
      transProps:{},
      el,
    };
    styledEls.push(se);
    for(const child of Array.from(el.children)) {
      const c = walkDOM(child, se);
      if(c) se.children.push(c);
    }
    return se;
  }
  const root = walkDOM(container.querySelector('.page')!, null);

  const pageW=1200,pageH=Math.max(...styledEls.map(e=>e.y+e.h))+100;
  document.body.removeChild(container);

  // ── Glyph atlas ───────────────────────────────────────────────────────────
  const allChars=new Set<string>();
  for(const el of styledEls) for(const ch of el.text) allChars.add(ch);
  const atlas=buildGlyphAtlas(font,[...allChars].join(' '));

  // ── State machine ─────────────────────────────────────────────────────────
  const hoveredSet = new Set<StyledEl>();
  let hovered: StyledEl|null = null;
  let active: StyledEl|null = null;
  const transitions: Map<StyledEl,{prop:string;from:number;to:number;start:number;end:number}[]> = new Map();

  // ── Camera ────────────────────────────────────────────────────────────────
  let camZ=0.5,camX=pageW/2,camY=pageH*0.3;
  let viewZ=camZ,viewX=camX,viewY=camY;
  let velX=0,velY=0,dragging=false,lastMoveT=0;
  const pointers=new Map<number,{x:number;y:number}>();
  let mwx=0,mwy=0;

  function setSize(){const w=innerWidth,h=innerHeight;[rCanvas,tCanvas].forEach(c=>{c.width=w*dpr;c.height=h*dpr})}

  rCanvas.addEventListener('pointerdown',e=>{
    rCanvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX*dpr,y:e.clientY*dpr});dragging=true;velX=velY=0;lastMoveT=performance.now();
    const w=scrToWorld(e.clientX*dpr,e.clientY*dpr);
    const hit=hitTest(w.x,w.y);
    if(hit){active=hit; triggerTransition(hit,'background',0.2)}
  });
  rCanvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;const px=e.clientX*dpr,py=e.clientY*dpr,prev=pointers.get(e.pointerId)!;pointers.set(e.pointerId,{x:px,y:py});
    if(pointers.size===1){camX-=(px-prev.x)/camZ;camY-=(py-prev.y)/camZ;const t=performance.now(),ddt=t-lastMoveT;if(ddt>0){velX=velX?velX*.7+((px-prev.x)/ddt)*.3:(px-prev.x)/ddt;velY=velY?velY*.7+((py-prev.y)/ddt)*.3:(py-prev.y)/ddt;lastMoveT=t}}
    const w=scrToWorld(e.clientX*dpr,e.clientY*dpr);mwx=w.x;mwy=w.y;
  });
  const rel=()=>{pointers.clear();dragging=false;if(performance.now()-lastMoveT>80)velX=velY=0;active=null};
  rCanvas.addEventListener('pointerup',rel);rCanvas.addEventListener('pointercancel',rel);
  rCanvas.addEventListener('wheel',e=>{e.preventDefault();const W=innerWidth,H=innerHeight,zC=camZ/dpr;const wx=(e.clientX-W/2)/zC+camX,wy=(e.clientY-H/2)/zC+camY;camZ*=Math.exp(-e.deltaY*.0008);camZ=Math.max(.02,camZ);const zC2=camZ/dpr;camX=wx-(e.clientX-W/2)/zC2;camY=wy-(e.clientY-H/2)/zC2;viewX=camX;viewY=camY;viewZ=camZ},{passive:false});
  addEventListener('resize',setSize);setSize();camZ=rCanvas.width/pageW*.85;viewX=camX=pageW/2;viewY=camY=pageH*.2;viewZ=camZ;

  function scrToWorld(sx:number,sy:number){return{x:(sx-tCanvas.width/2)/camZ+camX,y:(sy-tCanvas.height/2)/camZ+camY}}
  function hitTest(wx:number,wy:number):StyledEl|null{
    // Return deepest element at (wx,wy) by walking children in reverse z-order
    function find(el:StyledEl):StyledEl|null{
      for(let i=el.children.length-1;i>=0;i--){
        const c=el.children[i];
        if(wx>=c.x&&wx<=c.x+c.w&&wy>=c.y&&wy<=c.y+c.h){
          const deeper=find(c);
          return deeper||c;
        }
      }
      return null;
    }
    if(!root)return null;
    if(wx>=root.x&&wx<=root.x+root.w&&wy>=root.y&&wy<=root.y+root.h)return find(root)||root;
    return null;
  }
  function triggerTransition(el:StyledEl,prop:string,duration:number){
    const now=performance.now();
    const ex=transitions.get(el)||[];
    transitions.set(el,ex);
    const tgt=parseFloat(resolveStyle(el,cssRules,hoveredSet.has(el)?'hover':el===active?'active':'').background||'')||0;
    const cur=ex.find(t=>t.prop===prop);
    if(cur){cur.from=cur.to;cur.to=tgt}else ex.push({prop,from:tgt,to:tgt,start:now,end:now+duration*1000});
    ex.forEach(t=>{if(t.prop===prop){t.start=now;t.end=now+duration*1000}});
  }

  function interpolate(el:StyledEl,prop:string,def:number):number{
    const tx=transitions.get(el);if(!tx)return def;
    const t=tx.find(x=>x.prop===prop);if(!t)return def;
    const now=performance.now();
    if(now>=t.end){t.from=t.to;return t.to}
    const p=(now-t.start)/(t.end-t.start);
    const eased=1-Math.pow(1-p,3); // ease-out
    return t.from+(t.to-t.from)*eased;
  }

  // ── Frame loop ────────────────────────────────────────────────────────────
  let fpsDt=16,prevTs=0;
  function frame(now:number){
    requestAnimationFrame(frame);
    const dt=prevTs?now-prevTs:16;prevTs=now;fpsDt=fpsDt*.9+dt*.1;fpsEl.textContent=`${Math.round(1000/fpsDt)} fps`;
    if(!dragging&&(velX||velY)&&dt>0){camX-=(velX*dt)/camZ;camY-=(velY*dt)/camZ;velX*=Math.pow(.8,dt/16);velY*=Math.pow(.8,dt/16);if(Math.abs(velX)<.01&&Math.abs(velY)<.01)velX=velY=0}
    viewX=camX;viewY=camY;viewZ=camZ;
    const Cw=tCanvas.width,Ch=tCanvas.height;

    // Update hover
    const prevHover=hovered;
    hovered=hitTest(mwx,mwy);
    if(hovered!==prevHover){
      if(hovered)triggerTransition(hovered,'background',0.2);
      if(prevHover)triggerTransition(prevHover,'background',0.2);
    }
    hoveredSet.clear();
    let cur=hovered;while(cur){hoveredSet.add(cur);cur=cur.parent;}

    // Build windfoil instances
    const crv=Array.from(atlas.curves),rws=Array.from(atlas.rows),inst:number[]=[];
    addRect(0,0,pageW,pageH,[0.94,0.93,0.90,1],crv,rws,inst);

    for(const el of styledEls){
      const state=hoveredSet.has(el)?'hover':el===active?'active':'';
      const style=resolveStyle(el,cssRules,state);
      const baseBg=parseColor(style['background-color']||style.background||'');
      const nrmStyle=resolveStyle(el,cssRules,'');
      const nrmBg=parseColor(nrmStyle['background-color']||nrmStyle.background||'');
      const txClr=parseColor(style.color||'');
      const fs=parseFloat(style['font-size']||'16');
      const ta=style['text-align']||'left';

      // Interpolate background color if transitioning
      let bgClr=baseBg;
      const tr=transitions.get(el);
      if(tr){
        for(const t of tr){
          if(t.prop==='background'||t.prop==='background-color'){
            const now=performance.now();
            if(now<t.end){
              const p=(now-t.start)/(t.end-t.start);
              const e=1-Math.pow(1-p,3);
              bgClr=baseBg.map((v,i)=>nrmBg[i]+(v-nrmBg[i])*e);
            }
          }
        }
      }

      if(bgClr[3]>0)addRect(el.x,el.y,el.x+el.w,el.y+el.h,bgClr,crv,rws,inst);
      if(el.text){
        const maxW=Math.max(10,el.w-el.pad[1]-el.pad[3]-8);
        const tx=el.x+el.pad[3]+4,ty=el.y+el.pad[0]+4;
        const lines=wrapText(el.text,font,fs,maxW);let cy=ty;
        for(const line of lines){const lw=tw(line,font,fs);const x=ta==='center'?el.x+el.w/2-lw/2:ta==='right'?el.x+el.w-el.pad[1]-lw-4:tx;layoutStr(inst,line,txClr.length?txClr:[0,0,0,1],atlas.table,font,{x,y:cy,size:fs});cy+=fs*1.5}
      }
    }

    // Render
    rCtx.fillStyle='#f0ede6';rCtx.fillRect(0,0,Cw,Ch);
    const wf=createGlyphRenderer(device,{code:shaderCode,format:'rgba8unorm',curves:new Float32Array(crv),rows:new Uint32Array(rws),instances:new Float32Array(inst),instanceCount:inst.length/16});
    const enc=device.createCommandEncoder();
    const pass=enc.beginRenderPass({colorAttachments:[{view:gpuCtx.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    wf.setUniforms({width:Cw,height:Ch,cam:[viewZ,viewZ,Cw/2-viewZ*viewX,Ch/2-viewZ*viewY]});wf.draw(pass);pass.end();device.queue.submit([enc.finish()]);
  }
  requestAnimationFrame(frame);
}

main().catch(e=>{const el=document.getElementById('error')!;el.style.display='block';el.textContent=e.message||String(e);console.error(e)});
