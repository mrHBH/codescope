import { loadFont, advanceOf, kerningOf, FontFace } from './windfoil/font';
import { loadShaderCode, requestDevice, createGlyphRenderer } from './windfoil/gpu';
import { buildGlyphAtlas, bandPieces } from './windfoil/bands';
import { pushMonotonePieces } from './windfoil/geometry';

import geometrySrc from './windfoil/geometry.ts?raw';
import fontSrc from './windfoil/font.ts?raw';
import bandsSrc from './windfoil/bands.ts?raw';
import gpuSrc from './windfoil/gpu.ts?raw';
import mainSrc from './main.ts?raw';

const CODE_FILES = [
  { name: 'geometry.ts', text: geometrySrc },
  { name: 'font.ts', text: fontSrc },
  { name: 'bands.ts', text: bandsSrc },
  { name: 'gpu.ts', text: gpuSrc },
  { name: 'main.ts', text: mainSrc },
];

const JS_KW = new Set('async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof var void while with yield'.split(' '));
const TC: Record<string, number[]> = {
  keyword:[0.65,0.15,0.65,1], string:[0.30,0.70,0.40,1], comment:[0.50,0.50,0.55,1],
  number:[0.85,0.55,0.25,1], default:[0.85,0.82,0.78,1],
};
function tokenize(text: string) {
  const t: { type: string; text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c===' '||c==='\t') { t.push({ type:'ws', text:c }); i++; continue }
    if (c==='/'&&text[i+1]==='/') { let j=i; while(j<text.length&&text[j]!=='\n'&&text[j]!=='\r')j++; t.push({ type:'comment',text:text.slice(i,j) }); i=j; continue }
    if (c==='/'&&text[i+1]==='*') { let j=i+2; while(j<text.length&&!(text[j]==='*'&&text[j+1]==='/'))j++; t.push({ type:'comment',text:text.slice(i,Math.min(j+2,text.length)) }); i=Math.min(j+2,text.length); continue }
    if (c==='"'||c==="'"||c==='`') { const q=c; let j=i+1; while(j<text.length&&text[j]!==q){if(text[j]==='\\')j++;j++} t.push({ type:'string',text:text.slice(i,j+1) }); i=j+1; continue }
    if (/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(text[i+1]))){ let j=i; if(text[j]==='0'&&/[xX]/.test(text[j+1]))j+=2; while(j<text.length&&/[0-9a-fA-F.x_]/.test(text[j]))j++; t.push({ type:'number',text:text.slice(i,j) }); i=j; continue }
    if (/[a-zA-Z_$]/.test(c)){ let j=i+1; while(j<text.length&&/[a-zA-Z0-9_$]/.test(text[j]))j++; t.push({ type:JS_KW.has(text.slice(i,j))?'keyword':'identifier',text:text.slice(i,j) }); i=j; continue }
    t.push({ type:'op',text:c }); i++
  }
  return t
}
function clrs(t: { type: string; text: string }[]): number[][] { const c: number[][]=[]; for(const tk of t){const rc=TC[tk.type]||TC.default;for(let i=0;i<tk.text.length;i++)c.push(rc)} return c }
function tw(text: string, font: FontFace, size: number): number { const s=size/font.unitsPerEm;let w=0,prev:string|null=null;for(const ch of text){if(prev)w+=kerningOf(font,prev,ch)*s;w+=advanceOf(font,ch)*s;prev=ch}return w }
function layout(out: number[], text: string, cs: number[][], tbl: Record<string,any>, font: FontFace, o:{x:number;baselineY:number;size:number}){const s=o.size/font.unitsPerEm;let p=o.x,prev:string|null=null;for(let i=0;i<text.length;i++){const ch=text[i];if(prev)p+=kerningOf(font,prev,ch)*s;const gl=tbl[ch];if(gl){const c=cs[i]||TC.default;out.push(p,o.baselineY,s,0,gl.bbox[0],gl.bbox[1],gl.bbox[2],gl.bbox[3],c[0],c[1],c[2],c[3],gl.rowBase,gl.bandCount,gl.y0,gl.invH)}p+=advanceOf(font,ch)*s;prev=ch}}
function addRect(x0:number,y0:number,x1:number,y1:number,clr:number[],crv:number[],rws:number[],out:number[]){const cs=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],qs:number[]=[];for(let i=0;i<4;i++){const[a,b]=cs[i],[c,d]=cs[(i+1)%4];qs.push(a,b,(a+c)/2,(b+d)/2,c,d)}const ps:number[]=[];for(let i=0;i<qs.length;i+=6)pushMonotonePieces(qs.slice(i,i+6),ps);const h=bandPieces(ps,y0,y1,crv,rws);out.push(0,0,1,0,x0,y0,x1,y1,clr[0],clr[1],clr[2],clr[3],h.rowBase,h.bandCount,h.y0,h.invH)}

async function main() {
  const fpsEl = document.getElementById('fps')!;
  const dpr = Math.min(devicePixelRatio, 2);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;cursor:grab';
  document.body.appendChild(canvas);

  const [font] = await Promise.all([loadFont('/Lato-Regular.ttf')]);
  const texts = CODE_FILES.map(f => f.text);
  const [device, shaderCode] = await Promise.all([requestDevice(), loadShaderCode()]);

  const CARD_W = 600, CARD_H = 400, GAP = 40, COLS = 3, MARGIN = 80;
  const cards: { name:string;text:string;x:number;y:number;w:number;h:number }[] = [];
  for (let i=0;i<CODE_FILES.length;i++) cards.push({ name:CODE_FILES[i].name, text:texts[i], x:MARGIN+(i%COLS)*(CARD_W+GAP), y:MARGIN+Math.floor(i/COLS)*(CARD_H+GAP), w:CARD_W, h:CARD_H });
  const WORLD_W = MARGIN*2+COLS*(CARD_W+GAP), WORLD_H = MARGIN*2+Math.ceil(cards.length/COLS)*(CARD_H+GAP);

  const atlas = buildGlyphAtlas(font, texts.join(' '));
  const crv = Array.from(atlas.curves), rws = Array.from(atlas.rows);
  const inst: number[] = [];
  const meta: { rcStart:number;farStart:number;farCount:number;nearStart:number;nearCount:number }[] = [];

  for (const card of cards) {
    const rcStart = inst.length/16;
    addRect(card.x, card.y, card.x+card.w, card.y+card.h, [0.08,0.08,0.16,0.92], crv, rws, inst);

    const farStart = inst.length/16;
    const name = card.name, farSz = card.w*0.065;
    const nameW = tw(name, font, farSz);
    const nc = Array(name.length).fill([0.35,0.55,0.85,1]);
    layout(inst, name, nc, atlas.table, font, { x:card.x+(card.w-nameW)/2, baselineY:card.y+(card.h+farSz*0.35)/2, size:farSz });
    const farCount = inst.length/16 - farStart;

    const nearStart = inst.length/16;
    const titleSz = card.w*0.035, codeSz = titleSz*0.85, m = card.w*0.015;
    layout(inst, name, nc, atlas.table, font, { x:card.x+m, baselineY:card.y+m+0.56*titleSz, size:titleSz });
    let cy = card.y+m+1.2*titleSz;
    const lines = card.text.split('\n'), LCS = lines.map(l=>clrs(tokenize(l)));
    for (let l=1; l<Math.min(lines.length,120); l++) {
      layout(inst, lines[l], LCS[l]||[], atlas.table, font, { x:card.x+m, baselineY:cy+0.56*codeSz, size:codeSz });
      cy+=1.2*codeSz;
      if (cy>card.y+card.h-m) break;
    }
    const nearCount = inst.length/16 - nearStart;
    meta.push({ rcStart, farStart, farCount, nearStart, nearCount });
  }

  const instanceData = new Float32Array(inst);
  const N = instanceData.length/16;

  const ctx = canvas.getContext('webgpu')!;
  ctx.configure({ device, format:'rgba8unorm', alphaMode:'premultiplied' });

  const renderer = createGlyphRenderer(device, {
    code:shaderCode, format:'rgba8unorm',
    curves:new Float32Array(crv), rows:new Uint32Array(rws),
    instances:instanceData, instanceCount:N,
  });

  // ── 2D camera ─────────────────────────────────────────────────────────────
  const cam = { x:0,y:0,z:1 }, view = { x:0,y:0,z:1 };
  let attackT = -Infinity, velX = 0, velY = 0, dragging = false;

  function recenter() { velX=velY=0; view.z=canvas.width/WORLD_W; view.x=WORLD_W/2; view.y=WORLD_H/2; cam.x=view.x;cam.y=view.y;cam.z=view.z }

  let rect = canvas.getBoundingClientRect();
  function devPos(e: PointerEvent) { return { x:(e.clientX-rect.left)*(canvas.width/rect.width), y:(e.clientY-rect.top)*(canvas.height/rect.height) } }

  const pointers = new Map<number,{x:number;y:number}>();
  let lastMoveT = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); if(pointers.size===0&&e.pointerType!=='mouse')attackT=performance.now(); pointers.set(e.pointerId,devPos(e)); dragging=true;velX=velY=0;lastMoveT=performance.now();canvas.style.cursor='grabbing' });
  canvas.addEventListener('pointermove', (e) => {
    if(!pointers.has(e.pointerId))return; const p=devPos(e),prev=pointers.get(e.pointerId)!; pointers.set(e.pointerId,p);
    if(pointers.size===1){const dx=p.x-prev.x,dy=p.y-prev.y;cam.x-=dx/cam.z;cam.y-=dy/cam.z;const t=performance.now(),ddt=t-lastMoveT;if(ddt>0){velX=velX?velX*.7+(dx/ddt)*.3:dx/ddt;velY=velY?velY*.7+(dy/ddt)*.3:dy/ddt;lastMoveT=t}}
  });
  const release = ()=>{ pointers.clear(); dragging=false; if(performance.now()-lastMoveT>80)velX=velY=0; canvas.style.cursor='grab' };
  canvas.addEventListener('pointerup',release); canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p=devPos(e as any); const w={ x:(p.x-canvas.width/2)/cam.z+cam.x, y:(p.y-canvas.height/2)/cam.z+cam.y }; cam.z*=Math.exp(-e.deltaY*.0008); cam.z=Math.max(.001,cam.z); cam.x=w.x-(p.x-canvas.width/2)/cam.z; cam.y=w.y-(p.y-canvas.height/2)/cam.z; attackT=performance.now() }, { passive:false });

  function resize() { const w=innerWidth,h=innerHeight; canvas.width=w*dpr;canvas.height=h*dpr; rect=canvas.getBoundingClientRect() }
  addEventListener('resize',resize);

  // ── Frame loop ────────────────────────────────────────────────────────────
  let fpsDt = 16, prevTs = 0; let prevNear: boolean[]|null = null;
  resize(); recenter(); view.x=cam.x;view.y=cam.y;view.z=cam.z;
  const A=300,K=.3;

  function frame(now:number) {
    requestAnimationFrame(frame);
    const dt = prevTs?now-prevTs:16; prevTs=now; fpsDt=fpsDt*.9+dt*.1; fpsEl.textContent=`${Math.round(1000/fpsDt)} fps`;
    if(!dragging&&(velX||velY)&&dt>0){cam.x-=(velX*dt)/cam.z;cam.y-=(velY*dt)/cam.z;velX*=Math.pow(.8,dt/16);velY*=Math.pow(.8,dt/16);if(Math.abs(velX)<.01&&Math.abs(velY)<.01)velX=velY=0}
    const s=now-attackT>=A?0:1-(now-attackT)/A;
    if(s>0){const k=1-s*(1-K),kf=1-Math.pow(1-k,dt/16);view.x+=(cam.x-view.x)*kf;view.y+=(cam.y-view.y)*kf;view.z*=Math.pow(cam.z/view.z,kf)}
    else{view.x=cam.x;view.y=cam.y;view.z=cam.z}
    const n=cards.length,nearArr=cards.map(c=>view.z*c.h>200);
    if(!prevNear||nearArr.some((v,i)=>v!==prevNear![i])){prevNear=nearArr;for(let i=0;i<n;i++){const m=meta[i];instanceData[m.rcStart*16+11]=.92;const fa=nearArr[i]?0:1,na=nearArr[i]?1:0;for(let j=m.farStart*16+11;j<(m.farStart+m.farCount)*16;j+=16)instanceData[j]=fa;for(let j=m.nearStart*16+11;j<(m.nearStart+m.nearCount)*16;j+=16)instanceData[j]=na}renderer.setInstances(instanceData)}
    renderer.setUniforms({width:canvas.width,height:canvas.height,cam:[view.z,view.z,canvas.width/2-view.z*view.x,canvas.height/2-view.z*view.y]});
    const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:ctx.getCurrentTexture().createView(),clearValue:{r:.1,g:.1,b:.18,a:1},loadOp:'clear',storeOp:'store'}]});renderer.draw(pass);pass.end();device.queue.submit([enc.finish()])
  }
  requestAnimationFrame(frame)
}

main().catch(e=>{const el=document.getElementById('error')!;el.style.display='block';el.textContent=e.message||String(e);console.error(e)})
