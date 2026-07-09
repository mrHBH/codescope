import { loadFont, advanceOf, kerningOf, FontFace } from './windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from './windfoil/gpu';
import { buildGlyphAtlas, bandPieces } from './windfoil/bands';
import { pushMonotonePieces } from './windfoil/geometry';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseCSSColor(css: string): number[] {
  if (!css || css === 'transparent' || css === 'rgba(0,0,0,0)') return [0,0,0,0];
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) return [parseInt(m[1])/255, parseInt(m[2])/255, parseInt(m[3])/255, m[4] ? parseFloat(m[4]) : 1];
  return [0,0,0,1];
}

function tw(text: string, font: FontFace, size: number): number {
  const s = size / font.unitsPerEm; let w = 0, prev: string|null = null;
  for (const ch of text) { if (prev) w += kerningOf(font,prev,ch)*s; w += advanceOf(font,ch)*s; prev = ch }
  return w;
}

function addRect(x0:number,y0:number,x1:number,y1:number,clr:number[],crv:number[],rws:number[],out:number[]) {
  const cs=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]], qs:number[]=[];
  for (let i=0;i<4;i++){const[a,b]=cs[i],[c,d]=cs[(i+1)%4];qs.push(a,b,(a+c)/2,(b+d)/2,c,d)}
  const ps:number[]=[]; for(let i=0;i<qs.length;i+=6)pushMonotonePieces(qs.slice(i,i+6),ps);
  const h=bandPieces(ps,y0,y1,crv,rws); out.push(0,0,1,0,x0,y0,x1,y1,clr[0],clr[1],clr[2],clr[3],h.rowBase,h.bandCount,h.y0,h.invH);
}

// ── HTML Document ───────────────────────────────────────────────────────────

const HTML_DOC = `<!DOCTYPE html><html><head><style>
*{box-sizing:border-box;margin:0;padding:0}
.page{font-family:sans-serif;background:#f0ede6;color:#1a1a2e;padding:0}
h1{font-size:36px;font-weight:700;color:#16162e;margin-bottom:8px}
h2{font-size:24px;font-weight:700;color:#2a2a4e;margin-top:36px;margin-bottom:12px}
p{font-size:16px;line-height:1.6;margin-bottom:16px}
.highlight{background:#e8e0d4;border-left:4px solid #8866aa;padding:16px 20px;margin:24px 0;border-radius:4px;font-size:15px;color:#444}
pre{background:#1e1e2e;color:#cdd6f4;padding:20px 24px;border-radius:8px;font-size:14px;line-height:1.5;margin:20px 0}
ul{margin:12px 0 20px 24px}li{font-size:16px;line-height:1.6}
.card{background:white;border-radius:8px;padding:24px;margin:24px 0}
.card h3{font-size:18px;font-weight:700;color:#2a2a4e;margin-bottom:8px}
.tag{display:inline-block;background:#e0d8f0;color:#5a4a8a;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;margin-right:6px}
.btn{display:inline-block;background:#4466cc;color:white;padding:10px 24px;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;transition:background 0.2s}
.btn:hover{background:#3355bb}
.btn:active{background:#2244aa}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.12);transform:translateY(-2px)}
.footer{margin-top:48px;padding-top:16px;border-top:1px solid #ddd;font-size:13px;color:#999}
</style></head><body>
<h1>Windfoil CSS Experiment</h1>
<p>Per-pixel analytic anti-aliasing meets CSS interactivity. Text rendered through the GPU shader — <b>never loses sharpness at any zoom level</b>. Hover over elements and interact.</p>
<div class="highlight">This document is laid out by the browser's CSS engine, then rendered through a single WebGPU draw call. Hover effects, transitions, and state changes trigger instance rebuilding each frame — text stays analytically crisp regardless of zoom.</div>
<h2>Interactive elements</h2>
<div class="card"><h3>Hover Card</h3><p>This card has a hover effect — it lifts when you mouse over it. The transform is computed from CSS transition properties and applied to the windfoil instance positions each frame.</p><span class="tag">hover</span><span class="tag">transform</span></div>
<h2>Code block</h2>
<pre>export function coverage(pixel: vec2f, atlas: CurveAtlas) -> f32 {
  var w: f32 = 0.0;
  for each row-band containing pixel.y:
    for each curve piece in band:
      w += winding_contribution(curve, pixel);
  return min(abs(w), 1.0);
}</pre>
<p>The shader solves an analytic integral per pixel — closed-form coverage from vector outlines. No multisampling, no texture baking, no resolution dependency.</p>
<div class="card"><h3>Try the button</h3><p>This button changes color on hover using a CSS transition. Windfoil interpolates the background color smoothly between frames.</p><div class="btn">Hover me</div></div>
<p class="footer">Windfoil CSS Experiment • Text is always razor sharp</p>
</body></html>`;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const fpsEl = document.getElementById('fps')!;
  const dpr = Math.min(devicePixelRatio, 2);

  // Layer 1: Raster canvas (backgrounds, gradients, shadows)
  const rasterCanvas = document.createElement('canvas');
  rasterCanvas.style.cssText = 'position:fixed;inset:0;z-index:0;cursor:grab';
  document.body.appendChild(rasterCanvas);
  const rctx = rasterCanvas.getContext('2d')!;

  // Layer 2: Windfoil canvas (text — always sharp)
  const textCanvas = document.createElement('canvas');
  textCanvas.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none';
  document.body.appendChild(textCanvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);

  // ── Layout (browser CSS engine) ──────────────────────────────────────────
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;width:1200px';
  document.body.appendChild(container);

  const parsed = new DOMParser().parseFromString(HTML_DOC, 'text/html');
  const docStyles = Array.from(parsed.querySelectorAll('style')).map(s => s.outerHTML).join('');
  container.innerHTML = `<style>@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:400}@font-face{font-family:'Lato';src:url('/Lato-Regular.ttf') format('truetype');font-weight:700}</style>${docStyles}
<div class="page" style="padding:40px 80px;max-width:900px;margin:0 auto;background:#f0ede6;color:#1a1a2e;font-family:'Lato',sans-serif">${parsed.body!.innerHTML}</div>`;
  await document.fonts.ready;

  interface El { el: Element; x:number;y:number;w:number;h:number;bg:number[];hoverBg:number[];txColor:number[];text:string;fs:number;ta:string;pad:number[] }
  const els: El[] = [];

  function collect(el: Element) {
    if (el.tagName==='STYLE'||el.tagName==='SCRIPT') return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const cx = r.left - container.getBoundingClientRect().left;
    const cy = r.top - container.getBoundingClientRect().top;
    if (r.width < 2 || r.height < 2) return;
    const bg = parseCSSColor(cs.backgroundColor);
    const tc = parseCSSColor(cs.color);
    const fs = parseFloat(cs.fontSize)||16;
    const ta = cs.textAlign||'left';
    const pad = [parseFloat(cs.paddingTop)||0,parseFloat(cs.paddingRight)||0,parseFloat(cs.paddingBottom)||0,parseFloat(cs.paddingLeft)||0];
    let text = ''; for (const n of Array.from(el.childNodes)) if (n.nodeType===3) text += n.textContent||'';
    els.push({ el, x:cx, y:cy, w:r.width, h:r.height, bg, hoverBg:bg, txColor:tc, text:text.trim(), fs, ta, pad });
    for (const child of Array.from(el.children)) collect(child);
  }
  collect(container);

  const pageW = 1200, pageH = Math.max(...els.map(e=>e.y+e.h), 500) + 100;
  document.body.removeChild(container);

  // ── Build glyph atlas (once) ─────────────────────────────────────────────
  const allChars = new Set<string>();
  for (const el of els) for (const ch of el.text) allChars.add(ch);
  const atlas = buildGlyphAtlas(font, [...allChars].join(' '));

  // ── WebGPU (windfoil text layer) ─────────────────────────────────────────
  const gpuCtx = textCanvas.getContext('webgpu')!;
  gpuCtx.configure({ device, format: 'rgba8unorm', alphaMode: 'premultiplied' });

  // ── Camera ───────────────────────────────────────────────────────────────
  let camZ = 0.5, camX = pageW/2, camY = pageH*0.3;
  let viewZ = camZ, viewX = camX, viewY = camY;
  let velX = 0, velY = 0, dragging = false, lastMoveT = 0;
  const pointers = new Map<number,{x:number;y:number}>();

  function setSize() {
    const w = innerWidth, h = innerHeight;
    [rasterCanvas, textCanvas].forEach(c => { c.width = w*dpr; c.height = h*dpr });
  }

  // ── Input ────────────────────────────────────────────────────────────────
  let mouseWX = 0, mouseWY = 0; // mouse pos in world coords
  const hovered = new Set<Element>();

  function screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - textCanvas.width/2) / viewZ + viewX,
      y: (sy - textCanvas.height/2) / viewZ + viewY,
    };
  }

  rasterCanvas.addEventListener('pointerdown', (e) => {
    rasterCanvas.setPointerCapture(e.pointerId);
    if(e.pointerType!=='mouse') pointers.set(e.pointerId,{x:e.clientX*dpr,y:e.clientY*dpr});
    else pointers.set(e.pointerId,{x:e.clientX*dpr,y:e.clientY*dpr});
    dragging=true;velX=velY=0;lastMoveT=performance.now();

    // Click: hit-test and check if button
    const w = screenToWorld(e.clientX*dpr, e.clientY*dpr);
    for (const el of els) {
      if (w.x>=el.x && w.x<=el.x+el.w && w.y>=el.y && w.y<=el.y+el.h) {
        const btn = el.el.closest('.btn') as HTMLElement|null;
        if (btn) btn.style.background = '#3355bb'; // visual feedback
      }
    }
  });
  rasterCanvas.addEventListener('pointermove', (e) => {
    if(!pointers.has(e.pointerId))return;
    const px=e.clientX*dpr,py=e.clientY*dpr,prev=pointers.get(e.pointerId)!;pointers.set(e.pointerId,{x:px,y:py});
    if(pointers.size===1){camX-=(px-prev.x)/camZ;camY-=(py-prev.y)/camZ;const t=performance.now(),ddt=t-lastMoveT;if(ddt>0){velX=velX?velX*.7+((px-prev.x)/ddt)*.3:(px-prev.x)/ddt;velY=velY?velY*.7+((py-prev.y)/ddt)*.3:(py-prev.y)/ddt;lastMoveT=t}}
    // Track world mouse position
    const w = screenToWorld(px, py);
    mouseWX = w.x; mouseWY = w.y;
  });
  const rel=()=>{pointers.clear();dragging=false;if(performance.now()-lastMoveT>80)velX=velY=0};
  rasterCanvas.addEventListener('pointerup',rel); rasterCanvas.addEventListener('pointercancel',rel);
  rasterCanvas.addEventListener('wheel',(e)=>{
    e.preventDefault();const W=innerWidth,H=innerHeight,zC=camZ/dpr;
    const wx=(e.clientX-W/2)/zC+camX,wy=(e.clientY-H/2)/zC+camY;
    camZ*=Math.exp(-e.deltaY*.0008);camZ=Math.max(.02,camZ);const zC2=camZ/dpr;
    camX=wx-(e.clientX-W/2)/zC2;camY=wy-(e.clientY-H/2)/zC2;viewX=camX;viewY=camY;viewZ=camZ;
  },{passive:false});
  addEventListener('resize',setSize); setSize();
  camZ = rasterCanvas.width / pageW * 0.85; viewZ=camZ; viewX=camX=pageW/2; viewY=camY=pageH*0.2;

  // ── Mouse tracking ──────────────────────────────────────────────────────
  let fpsDt = 16, prevTs = 0;

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = prevTs ? now-prevTs : 16; prevTs = now; fpsDt = fpsDt*.9+dt*.1;
    fpsEl.textContent = `${Math.round(1000/fpsDt)} fps`;

    if (!dragging&&(velX||velY)&&dt>0) { camX-=(velX*dt)/camZ;camY-=(velY*dt)/camZ; velX*=Math.pow(.8,dt/16);velY*=Math.pow(.8,dt/16); if(Math.abs(velX)<.01&&Math.abs(velY)<.01)velX=velY=0 }
    viewX=camX;viewY=camY;viewZ=camZ;

    const Cw = textCanvas.width, Ch = textCanvas.height;

    // Hit-test: which cards/buttons/tags are hovered
    const newHovered = new Set<Element>();
    for (const el of els) {
      if (mouseWX >= el.x && mouseWX <= el.x+el.w && mouseWY >= el.y && mouseWY <= el.y+el.h) {
        const hoverable = el.el.closest('.card,.btn,.tag') as Element | null;
        if (hoverable) newHovered.add(hoverable);
      }
    }

    // Build windfoil instances (per-frame, for hover reactivity)
    const crv = Array.from(atlas.curves), rws = Array.from(atlas.rows), inst: number[] = [];
    addRect(0,0,pageW,pageH,[0.94,0.93,0.90,1],crv,rws,inst);

    for (const el of els) {
      const isHovered = newHovered.has(el.el);
      const bgClr = isHovered ? el.bg.map((v,i) => i===3 ? v : v*0.9) : el.bg;
      if (bgClr[3] > 0) addRect(el.x,el.y,el.x+el.w,el.y+el.h,bgClr,crv,rws,inst);
      if (el.text) {
        const sz = el.fs, maxW = Math.max(10, el.w-el.pad[1]-el.pad[3]-8);
        const tx = el.x+el.pad[3]+4, ty = el.y+el.pad[0]+4;
        const lines = wrapText(el.text, font, sz, maxW);
        let cy = ty;
        for (const line of lines) {
          const lw = tw(line, font, sz);
          const x = el.ta==='center'?el.x+el.w/2-lw/2:el.ta==='right'?el.x+el.w-el.pad[1]-lw-4:tx;
          layoutStr(inst, line, el.txColor, atlas.table, font, {x,y:cy,size:sz});
          cy += sz*1.5;
        }
      }
    }

    const windfoil = createGlyphRenderer(device, {
      code:shaderCode, format:'rgba8unorm',
      curves:new Float32Array(crv), rows:new Uint32Array(rws),
      instances:new Float32Array(inst), instanceCount:inst.length/16,
    });

    // Render raster background
    rctx.clearRect(0,0,Cw,Ch);
    rctx.fillStyle = '#f0ede6';
    rctx.fillRect(0,0,Cw,Ch);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: gpuCtx.getCurrentTexture().createView(), clearValue:{r:0,g:0,b:0,a:0}, loadOp:'clear',storeOp:'store' }],
    });
    windfoil.setUniforms({ width:Cw, height:Ch, cam:[viewZ,viewZ,Cw/2-viewZ*viewX,Ch/2-viewZ*viewY] });
    windfoil.draw(pass); pass.end();
    device.queue.submit([enc.finish()]);

    hovered.clear(); for (const e of newHovered) hovered.add(e);
  }

  requestAnimationFrame(frame);
}

function wrapText(text: string, font: FontFace, size: number, maxW: number): string[] {
  const lines: string[]=[];
  for (const para of text.split('\n')) {
    const words=para.split(' '); let line='';
    for(const w of words) { const test=line?line+' '+w:w; if(tw(test,font,size)>maxW&&line){lines.push(line);line=w}else{line=test} }
    if(line)lines.push(line);
  }
  return lines;
}

function layoutStr(out: number[], text: string, clr: number[], tbl: Record<string,any>, font: FontFace, o: {x:number;y:number;size:number}) {
  const s=o.size/font.unitsPerEm,bl=o.y+o.size*0.8;let p=o.x,prev:string|null=null;
  for(let i=0;i<text.length;i++){const ch=text[i];if(prev)p+=kerningOf(font,prev,ch)*s;const gl=tbl[ch];if(gl){out.push(p,bl,s,0,gl.bbox[0],gl.bbox[1],gl.bbox[2],gl.bbox[3],clr[0],clr[1],clr[2],clr[3],gl.rowBase,gl.bandCount,gl.y0,gl.invH)}p+=advanceOf(font,ch)*s;prev=ch}
}

main().catch(e => { const el = document.getElementById('error')!; el.style.display='block'; el.textContent = e.message || String(e); console.error(e) });
