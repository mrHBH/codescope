// ── SceneDoc runtime validation ──────────────────────────────────────────────
// Returns human-readable error messages. Empty array = valid.

import type {
  SceneDoc, ObjectSpec, Vec2, Color, ClipSpec, CameraKeyframe,
  EasingName, ParamRef, ParamValue, GroupSpec, LayoutSpec,
} from './types';

export function validateSceneDoc(doc: unknown, knownIslandIds?: Set<string>): string[] {
  const errs: string[] = [];
  if (!doc || typeof doc !== 'object') { errs.push('root must be an object'); return errs; }
  const d = doc as Record<string, unknown>;

  // version
  if (d.version !== 1) errs.push('version must be 1');

  // meta
  if (!d.meta || typeof d.meta !== 'object') errs.push('meta must be an object');
  else if (typeof (d.meta as any).title !== 'string' || !(d.meta as any).title) errs.push('meta.title must be a non-empty string');

  // objects
  if (!d.objects || typeof d.objects !== 'object' || Array.isArray(d.objects)) {
    errs.push('objects must be a plain object');
  } else {
    const objMap = d.objects as Record<string, unknown>;
    for (const [key, spec] of Object.entries(objMap)) {
      if (!spec || typeof spec !== 'object') { errs.push(`objects.${key}: must be an object`); continue; }
      const s = spec as Record<string, unknown>;
      if ((s as any).id !== key) errs.push(`objects.${key}: id field ("${s.id}") must match key ("${key}")`);
      validateSpec(key, s, errs);
    }

    // referential integrity: children exist
    for (const [key, spec] of Object.entries(objMap)) {
      if (!spec || typeof spec !== 'object') continue;
      const s = spec as Record<string, unknown>;
      if ((s as any).kind === 'group') {
        const children = (s as any).children as string[] | undefined;
        if (Array.isArray(children)) {
          for (const cid of children) {
            if (!objMap[cid]) errs.push(`objects.${key}.children: "${cid}" not found in objects`);
          }
        }
      }
    }

    // no group cycles (DFS)
    function hasCycle(nodeId: string, visited: Set<string>, stack: Set<string>): boolean {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId); stack.add(nodeId);
      const n = objMap[nodeId] as any;
      if (n && n.kind === 'group' && Array.isArray(n.children)) {
        for (const c of n.children) { if (hasCycle(c, visited, stack)) return true; }
      }
      stack.delete(nodeId);
      return false;
    }
    const rootIds = new Set(Object.keys(objMap));
    for (const [k, v] of Object.entries(objMap)) {
      if ((v as any).kind === 'group' && Array.isArray((v as any).children)) {
        for (const c of (v as any).children) rootIds.delete(c);
      }
    }
    const visited = new Set<string>();
    const toCheck = rootIds.size > 0 ? rootIds : new Set(Object.keys(objMap));
    for (const rid of toCheck) { if (hasCycle(rid, visited, new Set())) { errs.push(`object "${rid}" is part of a cycle`); break; } }

    // fit target must be chapter group with size
    if (d.camera && typeof d.camera === 'object' && !Array.isArray(d.camera)) {
      const kfs = (d.camera as any).keyframes as any[] | undefined;
      if (Array.isArray(kfs)) {
        for (let i = 0; i < kfs.length; i++) {
          const kf = kfs[i];
          if (kf.fit) {
            const target = objMap[kf.fit] as any;
            if (!target) errs.push(`camera.keyframes[${i}].fit: "${kf.fit}" not found in objects`);
            else if (target.kind !== 'group' || !target.chapter || !target.size)
              errs.push(`camera.keyframes[${i}].fit: "${kf.fit}" must be a chapter group with size`);
          }
        }
      }
    }

    // deep-walk $param refs
    for (const [key, spec] of Object.entries(objMap)) {
      if (!spec || typeof spec !== 'object') continue;
      const s = spec as Record<string, unknown>;
      if ((s as any).kind === 'island') {
        const params = (s as any).params as Record<string, unknown> | undefined;
        if (params && typeof params === 'object' && !Array.isArray(params)) {
          walkParamRefs(params, d.params as Record<string, unknown> | undefined, key, errs);
        }
      }
      // island id check
      if ((s as any).kind === 'island' && typeof (s as any).island === 'string' && knownIslandIds) {
        if (!knownIslandIds.has((s as any).island))
          errs.push(`objects.${key}.island: "${(s as any).island}" not in known island registry`);
      }
    }
  }

  // params
  if (!d.params || typeof d.params !== 'object' || Array.isArray(d.params)) {
    errs.push('params must be a plain object');
  } else {
    for (const [key, p] of Object.entries(d.params)) {
      if (!p || typeof p !== 'object') { errs.push(`params.${key}: must be an object`); continue; }
      const p2 = p as Record<string, unknown>;
      if (typeof p2.kind !== 'string') errs.push(`params.${key}.kind: must be a string`);
      else if (!['number', 'boolean', 'point', 'color'].includes(p2.kind as string))
        errs.push(`params.${key}.kind: must be number|boolean|point|color, got "${p2.kind}"`);
      if (typeof p2.label !== 'string') errs.push(`params.${key}.label: must be a string`);
      if (p2.default === undefined) errs.push(`params.${key}.default: required`);
      else {
        if (p2.kind === 'number') {
          if (typeof p2.default !== 'number' || !isFinite(p2.default as number))
            errs.push(`params.${key}.default: must be a finite number`);
          const min = p2.min as number | undefined;
          const max = p2.max as number | undefined;
          if (min !== undefined && (typeof min !== 'number' || !isFinite(min))) errs.push(`params.${key}.min: must be finite`);
          if (max !== undefined && (typeof max !== 'number' || !isFinite(max))) errs.push(`params.${key}.max: must be finite`);
          if (min !== undefined && (p2.default as number) < min) errs.push(`params.${key}.default ${p2.default} < min ${min}`);
          if (max !== undefined && (p2.default as number) > max) errs.push(`params.${key}.default ${p2.default} > max ${max}`);
          if (p2.step !== undefined && (typeof p2.step !== 'number' || p2.step <= 0)) errs.push(`params.${key}.step: must be > 0`);
        } else if (p2.kind === 'boolean') {
          if (typeof p2.default !== 'boolean') errs.push(`params.${key}.default: must be boolean`);
        } else if (p2.kind === 'point') {
          if (!isVec2(p2.default)) errs.push(`params.${key}.default: must be [x,y]`);
        } else if (p2.kind === 'color') {
          if (!isColor(p2.default)) errs.push(`params.${key}.default: must be [r,g,b,a]`);
        }
      }
    }
  }

  // clips
  if (!Array.isArray(d.clips)) {
    errs.push('clips must be an array');
  } else {
    const objMap = (d.objects as Record<string, unknown>) ?? {};
    const paramIds = d.params && typeof d.params === 'object' && !Array.isArray(d.params)
      ? new Set(Object.keys(d.params)) : new Set<string>();
    for (let i = 0; i < d.clips.length; i++) {
      const c = d.clips[i] as Record<string, unknown> | undefined;
      if (!c || typeof c !== 'object') { errs.push(`clips[${i}]: must be an object`); continue; }
      if (typeof c.id !== 'string' || !c.id) errs.push(`clips[${i}].id: required non-empty string`);
      if (typeof c.target !== 'string' || !c.target) errs.push(`clips[${i}].target: required non-empty string`);
      if (!['fadeIn','fadeOut','draw','write','moveTo','scaleTo','rotateTo','morph','param'].includes(c.kind as string))
        errs.push(`clips[${i}].kind: invalid "${c.kind}"`);
      if (typeof c.start !== 'number' || !isFinite(c.start as number) || (c.start as number) < 0)
        errs.push(`clips[${i}].start: must be finite >= 0`);
      if (typeof c.duration !== 'number' || !isFinite(c.duration as number) || (c.duration as number) <= 0)
        errs.push(`clips[${i}].duration: must be finite > 0`);
      if (c.ease !== undefined && typeof c.ease === 'string' && !VALID_EASINGS.has(c.ease as string))
        errs.push(`clips[${i}].ease: "${c.ease}" is not a known easing name`);
      if (!c.props || typeof c.props !== 'object') errs.push(`clips[${i}].props: must be an object`);

      // target exists
      const target = c.target as string;
      if (target.startsWith('param:')) {
        const pn = target.slice(6);
        if (!paramIds.has(pn)) errs.push(`clips[${i}].target "param:${pn}" does not reference an existing param`);
      } else if (!objMap[target]) {
        errs.push(`clips[${i}].target "${target}" not found in objects`);
      }
    }
  }

  // camera
  if (!d.camera || typeof d.camera !== 'object' || Array.isArray(d.camera)) {
    errs.push('camera must be an object');
  } else {
    const kfs = (d.camera as any).keyframes as unknown[];
    if (!Array.isArray(kfs)) {
      errs.push('camera.keyframes must be an array');
    } else {
      for (let i = 0; i < kfs.length; i++) {
        const kf = kfs[i] as Record<string, unknown> | undefined;
        if (!kf || typeof kf !== 'object') { errs.push(`camera.keyframes[${i}]: must be an object`); continue; }
        if (typeof kf.time !== 'number' || !isFinite(kf.time as number) || (kf.time as number) < 0)
          errs.push(`camera.keyframes[${i}].time: must be finite >= 0`);
        if (i > 0 && (kfs[i - 1] as any).time > (kf.time as number))
          errs.push(`camera.keyframes[${i}].time: ${kf.time} < previous keyframe's time ${(kfs[i-1] as any).time} (must be non-decreasing)`);
        const hasCenter = kf.center !== undefined && isVec2(kf.center);
        const hasZoom = typeof kf.zoom === 'number' && isFinite(kf.zoom as number) && (kf.zoom as number) > 0;
        const hasFit = typeof kf.fit === 'string' && !!kf.fit;
        const hasFitObj = typeof kf.fitObj === 'string' && !!kf.fitObj;
        if (!hasFit && !hasFitObj && !(hasCenter && hasZoom))
          errs.push(`camera.keyframes[${i}]: must have either (center + zoom), fit, or fitObj`);
        if (hasFitObj && !(d.objects as Record<string, unknown>)[kf.fitObj as string])
          errs.push(`camera.keyframes[${i}].fitObj "${kf.fitObj}" not found in objects`);
        if (kf.zoomMul !== undefined && (typeof kf.zoomMul !== 'number' || !isFinite(kf.zoomMul as number) || (kf.zoomMul as number) <= 0))
          errs.push(`camera.keyframes[${i}].zoomMul: must be > 0`);
        if (kf.offset !== undefined && !isVec2(kf.offset))
          errs.push(`camera.keyframes[${i}].offset: must be [x,y]`);
        if (kf.polar !== undefined && (typeof kf.polar !== 'number' || !isFinite(kf.polar as number)))
          errs.push(`camera.keyframes[${i}].polar: must be finite`);
        if (kf.azimuth !== undefined && (typeof kf.azimuth !== 'number' || !isFinite(kf.azimuth as number)))
          errs.push(`camera.keyframes[${i}].azimuth: must be finite`);
        if (kf.ease !== undefined && typeof kf.ease === 'string' && !VALID_EASINGS.has(kf.ease as string))
          errs.push(`camera.keyframes[${i}].ease: "${kf.ease}" is not a known easing name`);
        if (kf.drift !== undefined) {
          const dr = kf.drift as Record<string, unknown>;
          for (const key of ['xAmp','yAmp','azAmp']) {
            if (dr[key] !== undefined && (typeof dr[key] !== 'number' || !isFinite(dr[key] as number)))
              errs.push(`camera.keyframes[${i}].drift.${key}: must be finite`);
          }
          for (const key of ['xPeriod','yPeriod','azPeriod']) {
            if (dr[key] !== undefined && (typeof dr[key] !== 'number' || (dr[key] as number) <= 0))
              errs.push(`camera.keyframes[${i}].drift.${key}: must be > 0`);
          }
        }
      }
    }
  }

  return errs;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_EASINGS = new Set([
  'linear','easeInQuad','easeOutQuad','easeInOutQuad',
  'easeInCubic','easeOutCubic','easeInOutCubic',
  'easeInQuint','easeOutQuint','easeInOutQuint',
  'smoothstep','smootherstep',
  'easeInSine','easeOutSine','easeInOutSine',
  'easeOutBack','easeOutElastic','easeOutBounce',
  'rushInto','rushFrom',
]);

function isVec2(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && isFinite(v[0])
    && typeof v[1] === 'number' && isFinite(v[1]);
}

function isColor(v: unknown): v is Color {
  return Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number' && x >= 0 && x <= 1);
}

function validateSpec(key: string, s: Record<string, unknown>, errs: string[]) {
  if (typeof s.kind !== 'string') { errs.push(`objects.${key}.kind: must be a string`); return; }
  if (!['text','glyph','rect','circle','polygon','line','math','group','island'].includes(s.kind as string)) {
    errs.push(`objects.${key}.kind: invalid "${s.kind}"`); return;
  }
  if (s.id !== undefined && typeof s.id !== 'string') errs.push(`objects.${key}.id: must be a string`);
  if (s.opacity !== undefined && (typeof s.opacity !== 'number' || s.opacity < 0 || s.opacity > 1))
    errs.push(`objects.${key}.opacity: must be in [0,1]`);
  if (s.visible !== undefined && typeof s.visible !== 'boolean') errs.push(`objects.${key}.visible: must be boolean`);
  // per-kind checks
  const k = s.kind as string;
  if (k === 'text') {
    if (typeof s.content !== 'string') errs.push(`objects.${key}.content: required string`);
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (typeof s.size !== 'number' || s.size <= 0) errs.push(`objects.${key}.size: required > 0`);
    if (!isColor(s.color)) errs.push(`objects.${key}.color: required [r,g,b,a]`);
    if (s.align !== undefined && !['left','center','right'].includes(s.align as string))
      errs.push(`objects.${key}.align: must be left|center|right`);
  } else if (k === 'glyph') {
    if (typeof s.char !== 'string' || !s.char) errs.push(`objects.${key}.char: required non-empty string`);
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (typeof s.size !== 'number' || s.size <= 0) errs.push(`objects.${key}.size: required > 0`);
    if (!isColor(s.color)) errs.push(`objects.${key}.color: required [r,g,b,a]`);
  } else if (k === 'rect') {
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (!isVec2(s.size)) errs.push(`objects.${key}.size: required [x,y]`);
    if (s.fill !== undefined && !isColor(s.fill)) errs.push(`objects.${key}.fill: invalid color`);
    if (s.stroke !== undefined) validateStroke(key, s.stroke, errs);
  } else if (k === 'circle') {
    if (!isVec2(s.center)) errs.push(`objects.${key}.center: required [x,y]`);
    if (typeof s.radius !== 'number' || s.radius <= 0) errs.push(`objects.${key}.radius: required > 0`);
    if (s.fill !== undefined && !isColor(s.fill)) errs.push(`objects.${key}.fill: invalid color`);
    if (s.stroke !== undefined) validateStroke(key, s.stroke, errs);
  } else if (k === 'polygon') {
    if (!Array.isArray(s.points) || s.points.length < 3) errs.push(`objects.${key}.points: array of [x,y] with length >= 3`);
    else { for (let i = 0; i < s.points.length; i++) if (!isVec2(s.points[i])) errs.push(`objects.${key}.points[${i}]: invalid [x,y]`); }
    if (s.fill !== undefined && !isColor(s.fill)) errs.push(`objects.${key}.fill: invalid color`);
    if (s.stroke !== undefined) validateStroke(key, s.stroke, errs);
  } else if (k === 'line') {
    if (!Array.isArray(s.points) || s.points.length < 2) errs.push(`objects.${key}.points: array of [x,y] with length >= 2`);
    else { for (let i = 0; i < s.points.length; i++) if (!isVec2(s.points[i])) errs.push(`objects.${key}.points[${i}]: invalid [x,y]`); }
    if (typeof s.width !== 'number' || s.width <= 0) errs.push(`objects.${key}.width: required > 0`);
    if (!isColor(s.color)) errs.push(`objects.${key}.color: required [r,g,b,a]`);
    if (s.dash !== undefined && (!Array.isArray(s.dash) || (s.dash as number[]).some(x => typeof x !== 'number')))
      errs.push(`objects.${key}.dash: array of numbers`);
  } else if (k === 'math') {
    if (typeof s.latex !== 'string') errs.push(`objects.${key}.latex: required string`);
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (typeof s.size !== 'number' || s.size <= 0) errs.push(`objects.${key}.size: required > 0`);
    if (!isColor(s.color)) errs.push(`objects.${key}.color: required [r,g,b,a]`);
  } else if (k === 'group') {
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (!Array.isArray(s.children)) errs.push(`objects.${key}.children: required array of ids`);
    if (s.size !== undefined && !isVec2(s.size)) errs.push(`objects.${key}.size: invalid [x,y]`);
    if (s.chapter !== undefined) {
      if (typeof s.chapter !== 'object') errs.push(`objects.${key}.chapter: must be an object`);
      else {
        const ch = s.chapter as Record<string, unknown>;
        if (typeof ch.title !== 'string' || !ch.title) errs.push(`objects.${key}.chapter.title: non-empty string required`);
        if (typeof ch.sub !== 'string') errs.push(`objects.${key}.chapter.sub: string required`);
        if (typeof ch.duration !== 'number' || ch.duration <= 0) errs.push(`objects.${key}.chapter.duration: >0 required`);
      }
    }
    if (s.layout !== undefined) validateLayout(key, s.layout, errs);
    if (s.page !== undefined) validatePage(key, s.page, errs);
  } else if (k === 'island') {
    if (typeof s.island !== 'string' || !s.island) errs.push(`objects.${key}.island: required non-empty string`);
    if (!isVec2(s.at)) errs.push(`objects.${key}.at: required [x,y]`);
    if (s.size !== undefined && !isVec2(s.size)) errs.push(`objects.${key}.size: invalid [x,y]`);
    if (s.params !== undefined && (typeof s.params !== 'object' || Array.isArray(s.params)))
      errs.push(`objects.${key}.params: must be an object`);
  }
  // common: item (all kinds)
  if (s.item !== undefined) validateItem(key, s.item, errs);
}

function validateStroke(key: string, v: unknown, errs: string[]) {
  if (typeof v !== 'object' || !v) { errs.push(`objects.${key}.stroke: must be an object`); return; }
  const st = v as Record<string, unknown>;
  if (!isColor(st.color)) errs.push(`objects.${key}.stroke.color: required [r,g,b,a]`);
  if (typeof st.width !== 'number' || st.width <= 0) errs.push(`objects.${key}.stroke.width: required > 0`);
}

function validateLayout(key: string, v: unknown, errs: string[]) {
  if (typeof v !== 'object' || !v) { errs.push(`objects.${key}.layout: must be an object`); return; }
  const l = v as Record<string, unknown>;
  if (l.kind !== 'flex') errs.push(`objects.${key}.layout.kind: must be "flex"`);
  if (!['row','column'].includes(l.direction as string)) errs.push(`objects.${key}.layout.direction: must be row|column`);
  if (l.align !== undefined && !['start','center','end','stretch'].includes(l.align as string))
    errs.push(`objects.${key}.layout.align: must be start|center|end|stretch`);
  if (l.justify !== undefined && !['start','center','end','space-between','space-around'].includes(l.justify as string))
    errs.push(`objects.${key}.layout.justify: must be start|center|end|space-between|space-around`);
}

function validatePage(key: string, v: unknown, errs: string[]) {
  if (typeof v !== 'object' || !v) { errs.push(`objects.${key}.page: must be an object`); return; }
  const p = v as Record<string, unknown>;
  if (p.title !== undefined && typeof p.title !== 'string') errs.push(`objects.${key}.page.title: must be a string`);
  if (p.resizable !== undefined && typeof p.resizable !== 'boolean') errs.push(`objects.${key}.page.resizable: must be boolean`);
  if (p.minSize !== undefined && !isVec2(p.minSize)) errs.push(`objects.${key}.page.minSize: must be [x,y]`);
  if (p.maxSize !== undefined && !isVec2(p.maxSize)) errs.push(`objects.${key}.page.maxSize: must be [x,y]`);
  if (p.minSize !== undefined && p.maxSize !== undefined && isVec2(p.minSize) && isVec2(p.maxSize)) {
    const mn = p.minSize as Vec2, mx = p.maxSize as Vec2;
    if (mn[0] > mx[0] || mn[1] > mx[1]) errs.push(`objects.${key}.page: minSize (${mn}) > maxSize (${mx})`);
  }
}

function validateItem(key: string, v: unknown, errs: string[]) {
  if (typeof v !== 'object' || !v) { errs.push(`objects.${key}.item: must be an object`); return; }
  const it = v as Record<string, unknown>;
  if (it.width !== undefined && !(typeof it.width === 'number' && it.width > 0) && it.width !== 'auto')
    errs.push(`objects.${key}.item.width: must be a positive number or "auto"`);
  if (it.height !== undefined && !(typeof it.height === 'number' && it.height > 0) && it.height !== 'auto')
    errs.push(`objects.${key}.item.height: must be a positive number or "auto"`);
  if (it.flexGrow !== undefined && (typeof it.flexGrow !== 'number' || it.flexGrow < 0))
    errs.push(`objects.${key}.item.flexGrow: must be >= 0`);
  if (it.flexShrink !== undefined && (typeof it.flexShrink !== 'number' || it.flexShrink < 0))
    errs.push(`objects.${key}.item.flexShrink: must be >= 0`);
  if (it.minWidth !== undefined && (typeof it.minWidth !== 'number' || it.minWidth <= 0))
    errs.push(`objects.${key}.item.minWidth: must be > 0`);
  if (it.minHeight !== undefined && (typeof it.minHeight !== 'number' || it.minHeight <= 0))
    errs.push(`objects.${key}.item.minHeight: must be > 0`);
  if (it.maxWidth !== undefined && (typeof it.maxWidth !== 'number' || it.maxWidth <= 0))
    errs.push(`objects.${key}.item.maxWidth: must be > 0`);
  if (it.maxHeight !== undefined && (typeof it.maxHeight !== 'number' || it.maxHeight <= 0))
    errs.push(`objects.${key}.item.maxHeight: must be > 0`);
  if (it.alignSelf !== undefined && !['start','center','end','stretch'].includes(it.alignSelf as string))
    errs.push(`objects.${key}.item.alignSelf: must be start|center|end|stretch`);
  if (it.resizable !== undefined && typeof it.resizable !== 'boolean')
    errs.push(`objects.${key}.item.resizable: must be boolean`);
}

function walkParamRefs(
  obj: Record<string, unknown>,
  params: Record<string, unknown> | undefined,
  objKey: string,
  errs: string[],
) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof (v as any).$param === 'string') {
        const refName = (v as any).$param;
        if (!params || !params[refName])
          errs.push(`objects.${objKey}.params.${k}: $param "${refName}" not found in doc.params`);
      } else {
        walkParamRefs(v as Record<string, unknown>, params, objKey + '.' + k, errs);
      }
    }
  }
}
