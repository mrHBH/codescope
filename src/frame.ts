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
import { cameraViewProj, cameraScale, scrToDoc } from './camera/camera';
import type { EditorTheme } from './editor/editor';
import type { TerminalTheme } from './editor/terminal';
import type { FileTreeTheme } from './editor/fileTree';

function terminalTheme(): TerminalTheme {
  // A fixed dark VS Code-ish palette (the terminal reads as a dark surface in
  // every app theme — like a real embedded shell).
  return {
    bg: [0.086, 0.086, 0.098, 1],      // #16161a
    barBg: [0.13, 0.13, 0.15, 1],
    barFg: [0.7, 0.72, 0.78, 1],
    text: [0.83, 0.85, 0.90, 1],
    dim: [0.45, 0.48, 0.55, 1],
    prompt: [0.83, 0.85, 0.90, 1],
    green: [0.42, 0.80, 0.44, 1],
    cyan: [0.35, 0.82, 0.94, 1],
    yellow: [0.95, 0.76, 0.35, 1],
    red: [0.88, 0.40, 0.38, 1],
    magenta: [0.72, 0.48, 0.96, 1],
    caret: [0.62, 0.82, 0.55, 1],
  };
}

function fileTreeTheme(): FileTreeTheme {
  return {
    bg: [0.086, 0.086, 0.098, 1],       // #16161a
    barBg: [0.13, 0.13, 0.15, 1],
    barFg: [0.7, 0.72, 0.78, 1],
    text: [0.83, 0.85, 0.90, 1],
    dim: [0.56, 0.58, 0.64, 1],
    gold: [0.86, 0.71, 0.48, 1],         // #dcb67a — yasmineoss folder gold
    folder: [0.83, 0.85, 0.90, 1],       // folder name color
    line: [0.48, 0.40, 0.27, 1],         // warm rails (reference style)
    accent: [0.86, 0.71, 0.48, 1],       // chevron/branch highlight in folder-gold
    selected: [0.10, 0.34, 0.52, 0.42],  // subdued cyan selection strip
    hover: [1, 1, 1, 0.05],              // hover highlight
  };
}

function editorTheme(s: AppState): EditorTheme {
  const c = s.themeCol;
  const dark = s.isDark;
  return {
    bg: dark ? [0.06, 0.07, 0.10, 1] : [0.96, 0.97, 0.99, 1],
    gutterBg: dark ? [0.04, 0.05, 0.08, 1] : [0.92, 0.94, 0.97, 1],
    gutterFg: dark ? [0.42, 0.45, 0.58, 1] : [0.38, 0.42, 0.50, 1],
    curLineFg: dark ? [0.85, 0.88, 0.96, 1] : [0.18, 0.22, 0.30, 1],
    curLineBg: dark ? [1, 1, 1, 0.04] : [0.03, 0.16, 0.36, 0.08],
    text: dark ? [0.804, 0.839, 0.957, 1] : [0.14, 0.18, 0.26, 1],
    caret: dark ? [0.95, 0.96, 1, 1] : [0.10, 0.14, 0.22, 1],
    sel: [c.sel[0], c.sel[1], c.sel[2], 0.4],
  };
}

export function runFrame(s: AppState) {
  let prevTs = 0, fpsDt = 16;

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = prevTs ? now - prevTs : 16; prevTs = now;
    fpsDt = fpsDt * .9 + dt * .1; s.fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps`;

    if (s.demo && s.demo.running) s.demo.update(now);
    else stepCamera(s, dt, now);

    const Cw = s.tCanvas.width, Ch = s.tCanvas.height;
    s.mwx = (s.mx - Cw / 2) / s.viewZ + s.viewX;
    s.mwy = (s.my - Ch / 2) / s.viewZ + s.viewY;
    // In 3D the world-mouse comes from ray-casting the pointer onto the ground.
    if (s.cam3d.active) { const d = scrToDoc(s, s.mx, s.my); s.mwx = d.x; s.mwy = d.y; }

    // Viewport bounds in world space (+margin) → which pages are on screen. Off-screen
    // pages contribute no instances, so we skip their (large) static text/bg buffers.
    const marginX = 200 / s.viewZ, marginY = 200 / s.viewZ;
    const vL = (0 - Cw / 2) / s.viewZ + s.viewX - marginX;
    const vR = (Cw - Cw / 2) / s.viewZ + s.viewX + marginX;
    const vT = (0 - Ch / 2) / s.viewZ + s.viewY - marginY;
    const vB = (Ch - Ch / 2) / s.viewZ + s.viewY + marginY;
    const visible = s.pageVisible;
    for (let p = 0; p < s.pageRoots.length; p++) {
      const pg = s.pageRoots[p];
      visible[p] = s.cam3d.active || (pg.x <= vR && pg.x + pg.w >= vL && pg.y <= vB && pg.y + pg.h >= vT);
    }

    // Skip expensive hit-test + resolveStyle during wheel zoom (200ms cooldown)
    const wheelCool = (performance.now() - s.lastWheelT) < 200;
    const hovered = wheelCool ? null : hitTest(s.docRoot, s.mwx, s.mwy);
    const hoveredSet = new Set<StyledEl>();
    if (hovered) { let cur: StyledEl | null = hovered; while (cur) { hoveredSet.add(cur); cur = cur.parent; } }

    // File tree hover detection (world-space panel, not in DOM)
    if (s.fileTree && !wheelCool) {
      const ft = s.fileTree;
      if (s.mwx >= ft.x0 && s.mwx <= ft.x0 + ft.width && s.mwy >= ft.y0 && s.mwy <= ft.y0 + ft.contentHeight) {
        const row = ft.rowAtY(s.mwy);
        ft.hovered = row ? row.node.path : null;
      } else {
        ft.hovered = null;
      }
    }

    // Build working arrays: base atlas + pre-computed static backgrounds
    const crv: number[] = s.baseCrv as number[];
    crv.length = s.baseCrvLen;
    for (let i = 0; i < s.preCrvLen; i++) crv.push(s.preCrv[i]);
    const rws: number[] = s.baseRws as number[];
    rws.length = s.baseRwsLen;
    for (let i = 0; i < s.preRwsLen; i++) rws.push(s.preRws[i]);
    s.instJS.length = 0;
    const inst: number[] = s.instJS;
    // Layer 1: static backgrounds (visible pages only)
    for (let p = 0; p < s.bgByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.bgByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }

    const k = 1 - Math.pow(0.0015, dt / 1000);
    let cursor = 'grab';
    // Layer 2: dynamic backgrounds (hover, bounce, heartbeat, progress, pulse) — BEFORE text.
    // Only elements flagged `dynamic` in walkDOM reach this loop; static text/boxes
    // are already baked into the precomputed buffers.
    for (const el of s.dynamicEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      const isHov = hoveredSet.has(el), isAct = el === s.pressed;
      if (isHov || isAct) {
        const state = isHov ? 'hover' : 'active';
        const st = resolveStyle(el, s.cssRules, state);
        const hovBg = parseColor(st['background-color'] || st.background || '');
        if (hovBg[3] > 0.001) for (let i = 0; i < 4; i++) el.curBg[i] += (hovBg[i] - el.curBg[i]) * k;
        if (isHov && el.hoverable) cursor = 'pointer';
      } else {
        for (let i = 0; i < 4; i++) el.curBg[i] += (el.bg[i] - el.curBg[i]) * k;
      }

      const tgtShadow = el.shadowable && isHov ? 1 : 0;
      el.curShadow += (tgtShadow - el.curShadow) * k;

      const anim = el.anim;
      if (anim === 'bounce') {
        const dy = Math.sin(now / 520) * 8;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'heartbeat') {
        const sc = 1 + Math.sin(now / 380) * 0.065;
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'glow') {
        const pulse = 0.3 + 0.7 * Math.abs(Math.sin(now / 600));
        const g = 18 * pulse;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [el.curBg[0], el.curBg[1], el.curBg[2], 0.35 * pulse], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'float') {
        const dy = Math.sin(now / 900) * 12;
        addRect(el.x, el.y + dy, el.x + el.w, el.y + el.h + dy, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'spin') {
        const sc = 0.85 + 0.15 * Math.sin(now / 450);
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2, hw = el.w * sc / 2, hh = el.h * sc / 2;
        addRect(cx - hw, cy - hh, cx + hw, cy + hh, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
      } else if (anim === 'shimmer') {
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg[3] > 0.004 ? el.curBg : [0, 0, 0, 0], crv, rws, inst);
        const shimX = el.x + ((now * 0.12) % (el.w + 60)) - 30;
        addRect(shimX, el.y, shimX + 30, el.y + el.h, [1, 1, 1, 0.12], crv, rws, inst);
      }
      if ((isHov || isAct) && el.curShadow > 0.01) {
        const g = 14 * el.curShadow;
        addRect(el.x - g, el.y - g, el.x + el.w + g, el.y + el.h + g, [s.themeCol.shadow[0], s.themeCol.shadow[1], s.themeCol.shadow[2], s.themeCol.shadow[3] * el.curShadow], crv, rws, inst);
        addRect(el.x, el.y, el.x + el.w, el.y + el.h, el.curBg, crv, rws, inst);
      } else if (anim === '' && (isHov || isAct)) {
        // Hover/active fill for non-animated controls (buttons, tabs, toggles,
        // dropdown, cards). Inset by the border so the baked border ring stays
        // visible; the baked static bg beneath is fully covered by curBg.
        const [bt, br, bb, bl] = el.borderW;
        addRect(el.x + bl, el.y + bt, el.x + el.w - br, el.y + el.h - bb, el.curBg, crv, rws, inst);
      }

      if (anim === 'progress') {
        const frac = ((now % 3200) / 3200);
        const fw = (el.w - el.pad[3] - el.pad[1]) * frac;
        addRect(el.x + el.pad[3], el.y + el.h / 2 - 5, el.x + el.pad[3] + fw, el.y + el.h / 2 + 5, s.themeCol.prog, crv, rws, inst);
      } else if (anim === 'pulse') {
        const a = 0.45 + 0.55 * Math.sin(now / 280);
        addRect(el.x + 2, el.y + el.h / 2 - 7, el.x + 16, el.y + el.h / 2 + 7, [s.themeCol.pulse[0], s.themeCol.pulse[1], s.themeCol.pulse[2], a], crv, rws, inst);
      }
    }

    if (!cursor || cursor === 'grab') {
      let he: StyledEl | null = hovered; while (he && !he.editable) he = he.parent;
      if (he) cursor = 'text';
    }
    // File tree cursor: pointer when hovering over items
    if (s.fileTree && s.fileTree.hovered) {
      cursor = 'pointer';
    }
    s.rCanvas.style.cursor = cursor;

    // Layer 3: ALL text (static pre-computed + marquee dynamic + editable) — on top of all backgrounds
    for (let p = 0; p < s.textByPage.length; p++) {
      if (!visible[p]) continue;
      const buf = s.textByPage[p];
      for (let i = 0; i < buf.length; i++) inst.push(buf[i]);
    }
    for (const el of s.marqueeEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage]) continue;
      layoutFlow(el, s.font, s.atlas, inst, now);
    }
    const caretW = 2 / cameraScale(s);
    for (const el of s.editableEls) {
      if (el.ownerPage >= 0 && !visible[el.ownerPage] && el !== s.activeEdit) continue;
      layoutEditable(el, s.font, s.atlas, inst, crv, rws, caretW, now, el === s.activeEdit, s.themeCol.caret, s.themeCol.sel);
    }

    // Code editor (world-space panel). Rendered when it intersects the viewport.
    if (s.editor) {
      const ed = s.editor;
      const edR = ed.x0 + ed.contentWidth(), edB = ed.y0 + ed.contentHeight();
      if (s.cam3d.active || (ed.x0 <= vR && edR >= vL && ed.y0 <= vB && edB >= vT)) {
        ed.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, editorTheme(s), caretW);
      }
    }

    // Terminal (world-space panel). Rendered when it intersects the viewport.
    if (s.terminal) {
      const tm = s.terminal;
      const tR = tm.x0 + tm.contentW, tB = tm.y0 + tm.contentH;
      if (s.cam3d.active || (tm.x0 <= vR && tR >= vL && tm.y0 <= vB && tB >= vT)) {
        tm.render(s.font, s.atlas, inst, crv, rws, now, dt, terminalTheme(), caretW);
      }
    }

    // File tree (world-space panel).
    if (s.fileTree) {
      const ft = s.fileTree;
      const fR = ft.x0 + ft.width, fB = ft.y0 + ft.contentHeight;
      if (s.cam3d.active || (ft.x0 <= vR && fR >= vL && ft.y0 <= vB && fB >= vT)) {
        ft.render(s.font, s.atlas, inst, crv, rws, vT, vB, now, fileTreeTheme());
      }
    }

    // windgraph demo board (world-space).
    if (s.windgraph) {
      const g = s.windgraph;
      const gR = g.x0 + g.width, gB = g.y0 + g.height;
      if (s.cam3d.active || (g.x0 <= vR && gR >= vL && g.y0 <= vB && gB >= vT)) {
        g.emit(s.font, s.atlas, inst, crv, rws, now);
      }
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
    // View-projection: orthographic (2D) or perspective (3D free camera). `cam`
    // still feeds the AA-skirt pad via the effective on-axis scale.
    const camScale = cameraScale(s);
    const viewProj = cameraViewProj(s, Cw, Ch);
    s.renderer.setUniforms({ width: Cw, height: Ch, cam: [camScale, camScale, 0, 0], viewProj });
    s.renderer.draw(pass, s.crvFA.subarray(0, crv.length), s.rwsUA.subarray(0, rws.length), s.instFA.subarray(0, inst.length), inst.length / 16);
    pass.end();
    s.device.queue.submit([enc.finish()]);
  }
  requestAnimationFrame(frame);
}
