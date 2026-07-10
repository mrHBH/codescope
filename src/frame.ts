// ── Frame loop ──────────────────────────────────────────────────────────────
// Builds the instance buffer each frame: static backgrounds, dynamic
// (hover/animated) backgrounds, then all text including editable elements, and
// submits a single GPU draw call.

import type { AppState } from './state';
import type { StyledEl } from './layout/types';
import { resolveStyle, rgb, parseColor } from './css/engine';
import { addRect } from './layout/metrics';
import { layoutFlow } from './layout/flow';
import { layoutEditable } from './layout/editable';
import { hitTest } from './layout/walk';
import { stepCamera } from './camera/camera';

export function runFrame(s: AppState) {
  let prevTs = 0, fpsDt = 16;

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = prevTs ? now - prevTs : 16; prevTs = now;
    fpsDt = fpsDt * .9 + dt * .1; s.fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps`;

    stepCamera(s, dt, now);

    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    s.mwx = (s.mx - Cw / 2) / s.viewZ + s.viewX;
    s.mwy = (s.my - Ch / 2) / s.viewZ + s.viewY;

    // Skip expensive hit-test + resolveStyle during wheel zoom (200ms cooldown)
    const wheelCool = (performance.now() - s.lastWheelT) < 200;
    const hovered = wheelCool ? null : hitTest(s.docRoot, s.mwx, s.mwy);
    const hoveredSet = new Set<StyledEl>();
    if (hovered) { let cur: StyledEl | null = hovered; while (cur) { hoveredSet.add(cur); cur = cur.parent; } }

    // Build working arrays: base atlas + pre-computed static backgrounds
    const crv: number[] = s.baseCrv as number[];
    crv.length = s.baseCrvLen;
    for (let i = 0; i < s.preCrvLen; i++) crv.push(s.preCrv[i]);
    const rws: number[] = s.baseRws as number[];
    rws.length = s.baseRwsLen;
    for (let i = 0; i < s.preRwsLen; i++) rws.push(s.preRws[i]);
    s.instJS.length = 0;
    const inst: number[] = s.instJS;
    // Layer 1: static backgrounds
    for (let i = 0; i < s.preInstLen; i++) inst.push(s.preInst[i]);

    const k = 1 - Math.pow(0.0015, dt / 1000);
    let cursor = 'grab';
    // Layer 2: dynamic backgrounds (hover, bounce, heartbeat, progress, pulse) — BEFORE text
    for (const el of s.styledEls) {
      const isHov = hoveredSet.has(el), isAct = el === s.pressed;
      const isHoverable = el.classes.includes('btn') || el.classes.includes('card') || el.classes.includes('feature') || el.classes.includes('tab') || !!el.el.getAttribute('data-page');
      if (isHov || isAct) {
        const state = isHov ? 'hover' : 'active';
        const st = resolveStyle(el, s.cssRules, state);
        const hovBg = parseColor(st['background-color'] || st.background || '');
        if (hovBg[3] > 0.001) for (let i = 0; i < 4; i++) el.curBg[i] += (hovBg[i] - el.curBg[i]) * k;
        if (isHov && (isHoverable || el.el.tagName === 'A')) cursor = 'pointer';
      } else {
        for (let i = 0; i < 4; i++) el.curBg[i] += (el.bg[i] - el.curBg[i]) * k;
      }

      const tgtShadow = (el.classes.includes('card') || el.classes.includes('btn') || el.classes.includes('feature')) && isHov ? 1 : 0;
      el.curShadow += (tgtShadow - el.curShadow) * k;

      if (el.classes.includes('bounce')) {
        const dy = Math.sin(now / 520) * 8;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (el.classes.includes('heartbeat')) {
        const sc = 1 + Math.sin(now / 380) * 0.065;
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (el.classes.includes('glow')) {
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600));
        const g = 18 * pulse;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [el.curBg[0], el.curBg[1], el.curBg[2], 0.35 * pulse], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (el.classes.includes('float')) {
        const dy = Math.sin(now / 900) * 12;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (el.classes.includes('spin')) {
        const sc = 0.85 + 0.15 * Math.sin(now / 450);
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (el.classes.includes('shimmer')) {
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
        const shimX = el.x + ((now * 0.12) % (el.w + 60)) - 30;
        addRect(shimX, el.y, shimX + 30, el.y + el.h, [1, 1, 1, 0.12], crv, rws, inst);
      }
      if ((isHov || isAct) && el.curShadow > 0.01) {
        const g = 14 * el.curShadow;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [s.themeCol.shadow[0], s.themeCol.shadow[1], s.themeCol.shadow[2], s.themeCol.shadow[3] * el.curShadow], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, crv, rws, inst);
      }

      if (el.classes.includes('progress')) {
        const frac = ((now % 3200) / 3200);
        const fw = (el.w - el.pad[3] - el.pad[1]) * frac;
        addRect(el.x + el.pad[3], el.y + el.h / 2 - 5, el.x + el.pad[3] + fw, el.y + el.h / 2 + 5, s.themeCol.prog, crv, rws, inst);
      }
      if (el.classes.includes('pulse')) {
        const a = 0.45 + 0.55 * Math.sin(now / 280);
        addRect(el.x + 2, el.y + el.h / 2 - 7, el.x + 16, el.y + el.h / 2 + 7, [s.themeCol.pulse[0], s.themeCol.pulse[1], s.themeCol.pulse[2], a], crv, rws, inst);
      }
    }

    if (!cursor || cursor === 'grab') {
      let he: StyledEl | null = hovered; while (he && !he.editable) he = he.parent;
      if (he) cursor = 'text';
    }
    s.rCanvas.style.cursor = cursor;

    // Layer 3: ALL text (static pre-computed + marquee dynamic + editable) — on top of all backgrounds
    for (let i = 0; i < s.preTextLen; i++) inst.push(s.preTextInst[i]);
    for (const el of s.styledEls) {
      if (el.hasFlow && !el.skipText && el.classes.includes('marquee')) {
        layoutFlow(el, s.font, s.atlas, inst, now);
      }
    }
    const caretW = 2 / s.viewZ;
    for (const el of s.editableEls) {
      layoutEditable(el, s.font, s.atlas, inst, crv, rws, caretW, now, el === s.activeEdit, s.themeCol.caret, s.themeCol.sel);
    }

    s.rCtx.fillStyle = rgb(s.themeCol.backdrop);
    s.rCtx.fillRect(0, 0, Cw, Ch);
    if (crv.length > s.crvFA.length) s.crvFA = new Float32Array(crv.length * 2);
    s.crvFA.set(crv);
    if (rws.length > s.rwsUA.length) s.rwsUA = new Uint32Array(rws.length * 2);
    s.rwsUA.set(rws);
    if (inst.length > s.instFA.length) s.instFA = new Float32Array(inst.length * 2);
    s.instFA.set(inst);
    const enc = s.device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: s.gpuCtx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
    s.renderer.setUniforms({ width: Cw, height: Ch, cam: [s.viewZ, s.viewZ, Cw / 2 - s.viewZ * s.viewX, Ch / 2 - s.viewZ * s.viewY] });
    s.renderer.draw(pass, s.crvFA.subarray(0, crv.length), s.rwsUA.subarray(0, rws.length), s.instFA.subarray(0, inst.length), inst.length / 16);
    pass.end();
    s.device.queue.submit([enc.finish()]);
  }
  requestAnimationFrame(frame);
}
