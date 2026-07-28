// ── SceneDoc runtime validation ──────────────────────────────────────────────
// Returns human-readable error messages. Empty array = valid.

import type {
  SceneDoc, ObjectSpec, Vec2, Color, ClipSpec, CameraKeyframe,
  EasingName, ParamRef, ParamValue, GroupSpec, LayoutSpec,
} from './types';
import { checkExpr } from '../../windgraph/expr';

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

    // referential integrity: group children + windgraph object refs exist
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
      for (const rid of wgObjectRefs(s)) {
        if (!objMap[rid]) errs.push(`objects.${key}: reference "${rid}" not found in objects`);
      }
    }

    // no dependency cycles over group children + windgraph object refs (DFS
    // from every node — catches wg cycles disconnected from any root)
    function hasCycle(nodeId: string, visited: Set<string>, stack: Set<string>): boolean {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId); stack.add(nodeId);
      const n = objMap[nodeId] as any;
      if (n && n.kind === 'group' && Array.isArray(n.children)) {
        for (const c of n.children) { if (hasCycle(c, visited, stack)) return true; }
      }
      if (n) {
        for (const c of wgObjectRefs(n)) { if (hasCycle(c, visited, stack)) return true; }
      }
      stack.delete(nodeId);
      return false;
    }
    const visited = new Set<string>();
    for (const oid of Object.keys(objMap)) {
      if (hasCycle(oid, visited, new Set())) { errs.push(`object "${oid}" is part of a cycle`); break; }
    }

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

    // deep-walk $param refs in ANY spec (island params, windgraph numerics/points)
    for (const [key, spec] of Object.entries(objMap)) {
      if (!spec || typeof spec !== 'object') continue;
      const s = spec as Record<string, unknown>;
      walkParamRefs(s, d.params as Record<string, unknown> | undefined, key, errs);
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
      if (!['fadeIn','fadeOut','draw','write','moveTo','scaleTo','rotateTo','morph','param','moveAlongPath'].includes(c.kind as string))
        errs.push(`clips[${i}].kind: invalid "${c.kind}"`);
      if (c.kind === 'moveAlongPath') {
        const path = (c.props as Record<string, unknown> | undefined)?.path;
        if (typeof path !== 'string' || !path) errs.push(`clips[${i}].props.path: required object id`);
        else if (!objMap[path]) errs.push(`clips[${i}].props.path: "${path}" not found in objects`);
      }
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
        if (kf.fitPoint !== undefined && !isVec2(kf.fitPoint))
          errs.push(`camera.keyframes[${i}].fitPoint: must be [fx,fy]`);
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

const VALID_KINDS = new Set([
  'text','glyph','rect','circle','polygon','line','math','group','island',
  'wg-point','wg-segment','wg-vector','wg-polyline','wg-polygon',
  'wg-circle','wg-arc','wg-ellipse','wg-conic',
  'wg-midpoint','wg-centroid','wg-intersection','wg-glider','wg-reflection',
  'wg-line-through','wg-perpendicular','wg-parallel','wg-circumcircle',
  'wg-angle','wg-distance',
  'wg-plot-fn','wg-plot-parametric','wg-plot-polar','wg-plot-implicit','wg-field',
  'wg-plot-piecewise','wg-plot-inequality','wg-plot-sequence','wg-plot-spline',
  'wg-plot-tangent','wg-plot-accumulation','wg-plot-riemann','wg-streamlines',
  'wg-plot-ode','wg-plot-bifurcation','wg-plot-fourier','wg-histogram',
  'wg-boxplot','wg-plot-cells','wg-contours','wg-regression',
  'wg-chart-fin','wg-chart-multi',
]);

function validateSpec(key: string, s: Record<string, unknown>, errs: string[]) {
  if (typeof s.kind !== 'string') { errs.push(`objects.${key}.kind: must be a string`); return; }
  if (!VALID_KINDS.has(s.kind as string)) {
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
  } else if (k.startsWith('wg-')) {
    validateWgSpec(key, s, errs);
  }
  // common: item (all kinds)
  if (s.item !== undefined) validateItem(key, s.item, errs);
}

// ── windgraph spec validation ────────────────────────────────────────────────

function isParamRef(v: unknown): boolean {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as any).$param === 'string';
}

/** WgNum: finite number or $param ref. */
function isWgNum(v: unknown): boolean {
  return (typeof v === 'number' && isFinite(v as number)) || isParamRef(v);
}

/** WgPoint: [x,y], $param ref, or object id string (existence checked separately). */
function isWgPoint(v: unknown): boolean {
  return isVec2(v) || isParamRef(v) || (typeof v === 'string' && (v as string).length > 0);
}

/** Object-id references held by a spec (for referential integrity + cycle detection). */
function wgObjectRefs(s: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const one = (v: unknown) => { if (typeof v === 'string' && v) refs.push(v); };
  const many = (v: unknown) => { if (Array.isArray(v)) for (const x of v) one(x); };
  switch (s.kind) {
    case 'wg-point': one(s.at); break;
    case 'wg-segment': case 'wg-vector': one(s.from); one(s.to); break;
    case 'wg-polyline': case 'wg-polygon': many(s.points); break;
    case 'wg-circle': case 'wg-arc': case 'wg-ellipse': one(s.center); break;
    case 'wg-conic': many(s.foci); one(s.directrix); one(s.through); break;
    case 'wg-midpoint': case 'wg-intersection': one(s.a); one(s.b); break;
    case 'wg-centroid': many(s.points); break;
    case 'wg-glider': one(s.curve); break;
    case 'wg-reflection': one(s.p); one(s.axis); break;
    case 'wg-line-through': one(s.a); one(s.b); break;
    case 'wg-perpendicular': case 'wg-parallel': one(s.line); one(s.point); break;
    case 'wg-circumcircle': one(s.a); one(s.b); one(s.c); break;
    case 'wg-angle': one(s.a); one(s.vertex); one(s.b); break;
    case 'wg-distance': one(s.a); one(s.b); break;
    case 'wg-plot-spline': many(s.points); break;
    case 'wg-plot-ode': many(s.through); break;
  }
  return refs;
}

function validateWgSpec(key: string, s: Record<string, unknown>, errs: string[]) {
  const k = s.kind as string;
  const optPointLike = () => {
    if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
    if (s.radius !== undefined && (typeof s.radius !== 'number' || s.radius <= 0)) errs.push(`objects.${key}.radius: must be > 0`);
    if (s.label !== undefined && typeof s.label !== 'string') errs.push(`objects.${key}.label: must be a string`);
  };
  const optStrokeFill = () => {
    if (s.stroke !== undefined) validateStroke(key, s.stroke, errs);
    if (s.fill !== undefined && !isColor(s.fill)) errs.push(`objects.${key}.fill: invalid color`);
  };
  const expr = (field: string) => {
    const v = s[field];
    if (typeof v !== 'string' || !v) { errs.push(`objects.${key}.${field}: required non-empty string`); return; }
    const err = checkExpr(v);
    if (err) errs.push(`objects.${key}.${field}: ${err}`);
  };
  const range = (field: string) => {
    const r = s[field];
    if (!Array.isArray(r) || r.length !== 2) { errs.push(`objects.${key}.${field}: required [min,max]`); return; }
    if (!isWgNum(r[0]) || !isWgNum(r[1])) errs.push(`objects.${key}.${field}: entries must be numbers or $param refs`);
  };
  const idField = (field: string) => {
    if (typeof s[field] !== 'string' || !(s[field] as string)) errs.push(`objects.${key}.${field}: required object id`);
  };
  const idArray = (field: string, min: number) => {
    const arr = s[field];
    if (!Array.isArray(arr) || arr.length < min) errs.push(`objects.${key}.${field}: array of object ids (>= ${min})`);
    else arr.forEach((v, i) => { if (typeof v !== 'string' || !v) errs.push(`objects.${key}.${field}[${i}]: must be an object id`); });
  };
  const samples = () => {
    if (s.samples !== undefined && (typeof s.samples !== 'number' || s.samples < 2))
      errs.push(`objects.${key}.samples: must be a number >= 2`);
  };

  switch (k) {
    case 'wg-point':
      if (s.at === undefined || !isWgPoint(s.at)) errs.push(`objects.${key}.at: required [x,y], $param, or object id`);
      if (s.free !== undefined && typeof s.free !== 'boolean') errs.push(`objects.${key}.free: must be boolean`);
      optPointLike();
      break;
    case 'wg-segment':
      if (s.from === undefined || !isWgPoint(s.from)) errs.push(`objects.${key}.from: required point`);
      if (s.to === undefined || !isWgPoint(s.to)) errs.push(`objects.${key}.to: required point`);
      optStrokeFill();
      break;
    case 'wg-vector':
      if (s.from === undefined || !isWgPoint(s.from)) errs.push(`objects.${key}.from: required point`);
      if (s.to === undefined || !isWgPoint(s.to)) errs.push(`objects.${key}.to: required point`);
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      if (s.width !== undefined && (typeof s.width !== 'number' || s.width <= 0)) errs.push(`objects.${key}.width: must be > 0`);
      break;
    case 'wg-polyline':
    case 'wg-polygon': {
      const pts = s.points;
      const min = k === 'wg-polygon' ? 3 : 2;
      if (!Array.isArray(pts) || pts.length < min) errs.push(`objects.${key}.points: array of points (>= ${min})`);
      else pts.forEach((p, i) => { if (!isWgPoint(p)) errs.push(`objects.${key}.points[${i}]: invalid point`); });
      optStrokeFill();
      break;
    }
    case 'wg-circle':
      if (s.center === undefined || !isWgPoint(s.center)) errs.push(`objects.${key}.center: required point`);
      if (!isWgNum(s.radius)) errs.push(`objects.${key}.radius: required number or $param`);
      optStrokeFill();
      break;
    case 'wg-arc':
      if (s.center === undefined || !isWgPoint(s.center)) errs.push(`objects.${key}.center: required point`);
      if (!isWgNum(s.radius)) errs.push(`objects.${key}.radius: required number or $param`);
      if (!isWgNum(s.a0)) errs.push(`objects.${key}.a0: required number or $param`);
      if (!isWgNum(s.a1)) errs.push(`objects.${key}.a1: required number or $param`);
      optStrokeFill();
      break;
    case 'wg-ellipse':
      if (s.center === undefined || !isWgPoint(s.center)) errs.push(`objects.${key}.center: required point`);
      if (!isWgNum(s.rx)) errs.push(`objects.${key}.rx: required number or $param`);
      if (!isWgNum(s.ry)) errs.push(`objects.${key}.ry: required number or $param`);
      if (s.rot !== undefined && !isWgNum(s.rot)) errs.push(`objects.${key}.rot: must be number or $param`);
      optStrokeFill();
      break;
    case 'wg-conic':
      if (!['ellipse','hyperbola','parabola'].includes(s.conic as string))
        errs.push(`objects.${key}.conic: must be ellipse|hyperbola|parabola`);
      if (s.foci !== undefined) idArray('foci', 1);
      for (const f of ['directrix','through']) {
        if (s[f] !== undefined && (typeof s[f] !== 'string' || !(s[f] as string)))
          errs.push(`objects.${key}.${f}: must be an object id`);
      }
      optStrokeFill();
      break;
    case 'wg-midpoint':
    case 'wg-intersection':
      idField('a'); idField('b'); optPointLike();
      break;
    case 'wg-centroid':
      idArray('points', 3); optPointLike();
      break;
    case 'wg-glider':
      idField('curve');
      if (!isWgNum(s.t)) errs.push(`objects.${key}.t: required number or $param`);
      optPointLike();
      break;
    case 'wg-reflection':
      idField('p'); idField('axis'); optPointLike();
      break;
    case 'wg-line-through':
      idField('a'); idField('b'); optStrokeFill();
      break;
    case 'wg-perpendicular':
    case 'wg-parallel':
      idField('line'); idField('point'); optStrokeFill();
      break;
    case 'wg-circumcircle':
      idField('a'); idField('b'); idField('c'); optStrokeFill();
      break;
    case 'wg-angle':
      idField('a'); idField('vertex'); idField('b');
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-distance':
      idField('a'); idField('b');
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-fn':
      expr('expr');
      if (s.domain !== undefined) range('domain');
      samples();
      optStrokeFill();
      break;
    case 'wg-plot-parametric':
      expr('xExpr'); expr('yExpr'); range('tRange');
      samples();
      optStrokeFill();
      break;
    case 'wg-plot-polar':
      expr('rExpr'); range('tRange');
      samples();
      optStrokeFill();
      break;
    case 'wg-plot-implicit':
      expr('expr');
      optStrokeFill();
      break;
    case 'wg-field':
      if (!['vector','slope'].includes(s.field as string)) errs.push(`objects.${key}.field: must be vector|slope`);
      if (s.field === 'vector' && s.xExpr === undefined) errs.push(`objects.${key}.xExpr: required for vector fields`);
      if (s.xExpr !== undefined) expr('xExpr');
      expr('yExpr');
      if (s.density !== undefined && (typeof s.density !== 'number' || s.density <= 0))
        errs.push(`objects.${key}.density: must be > 0`);
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-piecewise': {
      const pieces = s.pieces;
      if (!Array.isArray(pieces) || pieces.length < 1) errs.push(`objects.${key}.pieces: array of {cond, expr} (>= 1)`);
      else pieces.forEach((p, i) => {
        if (!p || typeof p !== 'object') { errs.push(`objects.${key}.pieces[${i}]: must be an object`); return; }
        if (typeof p.cond !== 'string' || !p.cond) errs.push(`objects.${key}.pieces[${i}].cond: required non-empty string`);
        else { const e = checkExpr(p.cond); if (e) errs.push(`objects.${key}.pieces[${i}].cond: ${e}`); }
        if (typeof p.expr !== 'string' || !p.expr) errs.push(`objects.${key}.pieces[${i}].expr: required non-empty string`);
        else { const e = checkExpr(p.expr); if (e) errs.push(`objects.${key}.pieces[${i}].expr: ${e}`); }
      });
      if (s.domain !== undefined) range('domain');
      samples(); optStrokeFill();
      break;
    }
    case 'wg-plot-inequality': {
      const exprs = s.exprs;
      if (!Array.isArray(exprs) || exprs.length < 1) errs.push(`objects.${key}.exprs: array of expressions (>= 1)`);
      else exprs.forEach((e2, i) => {
        if (typeof e2 !== 'string' || !e2) errs.push(`objects.${key}.exprs[${i}]: required non-empty string`);
        else { const e = checkExpr(e2); if (e) errs.push(`objects.${key}.exprs[${i}]: ${e}`); }
      });
      if (s.cmps !== undefined) {
        const nExpr = Array.isArray(exprs) ? exprs.length : 0;
        if (!Array.isArray(s.cmps) || s.cmps.length !== nExpr) errs.push(`objects.${key}.cmps: must match exprs length`);
        else s.cmps.forEach((c2, i) => { if (!['>', '<', '>=', '<='].includes(c2)) errs.push(`objects.${key}.cmps[${i}]: must be >|<|>=|<=`); });
      }
      if (s.fill !== undefined && !isColor(s.fill)) errs.push(`objects.${key}.fill: invalid color`);
      if (s.gridRes !== undefined && (typeof s.gridRes !== 'number' || s.gridRes <= 0)) errs.push(`objects.${key}.gridRes: must be > 0`);
      break;
    }
    case 'wg-plot-sequence':
      expr('expr');
      if (s.nRange !== undefined) range('nRange');
      if (s.cobweb !== undefined && typeof s.cobweb !== 'boolean') errs.push(`objects.${key}.cobweb: must be boolean`);
      if (s.x0 !== undefined && !isWgNum(s.x0)) errs.push(`objects.${key}.x0: must be number or $param`);
      if (s.iters !== undefined && (typeof s.iters !== 'number' || s.iters < 1)) errs.push(`objects.${key}.iters: must be >= 1`);
      optPointLike(); optStrokeFill();
      break;
    case 'wg-plot-spline': {
      const pts = s.points;
      if (!Array.isArray(pts) || pts.length < 2) errs.push(`objects.${key}.points: array of points (>= 2)`);
      else pts.forEach((p, i) => { if (!isWgPoint(p)) errs.push(`objects.${key}.points[${i}]: invalid point`); });
      if (s.spline !== undefined && !['catmull', 'cubic', 'bspline'].includes(s.spline as string))
        errs.push(`objects.${key}.spline: must be catmull|cubic|bspline`);
      samples(); optStrokeFill();
      break;
    }
    case 'wg-plot-tangent':
      expr('expr');
      if (!isWgNum(s.at)) errs.push(`objects.${key}.at: required number or $param`);
      if (s.domain !== undefined) range('domain');
      if (s.showNormal !== undefined && typeof s.showNormal !== 'boolean') errs.push(`objects.${key}.showNormal: must be boolean`);
      if (s.showDerivatives !== undefined && typeof s.showDerivatives !== 'boolean') errs.push(`objects.${key}.showDerivatives: must be boolean`);
      samples(); optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-accumulation':
      expr('expr');
      if (!isWgNum(s.from)) errs.push(`objects.${key}.from: required number or $param`);
      if (s.domain !== undefined) range('domain');
      samples(); optStrokeFill();
      break;
    case 'wg-plot-riemann':
      expr('expr'); range('domain');
      if (!isWgNum(s.n)) errs.push(`objects.${key}.n: required number or $param`);
      if (s.mode !== undefined && !['left', 'right', 'midpoint', 'trapezoid', 'simpson'].includes(s.mode as string))
        errs.push(`objects.${key}.mode: must be left|right|midpoint|trapezoid|simpson`);
      optStrokeFill();
      break;
    case 'wg-streamlines':
      expr('xExpr'); expr('yExpr');
      if (s.density !== undefined && (typeof s.density !== 'number' || s.density <= 0)) errs.push(`objects.${key}.density: must be > 0`);
      if (s.steps !== undefined && (typeof s.steps !== 'number' || s.steps < 1)) errs.push(`objects.${key}.steps: must be >= 1`);
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-ode': {
      expr('yExpr');
      if (s.xExpr !== undefined) expr('xExpr');
      const through = s.through;
      if (!Array.isArray(through) || through.length < 1) errs.push(`objects.${key}.through: array of points (>= 1)`);
      else through.forEach((p, i) => { if (!isWgPoint(p)) errs.push(`objects.${key}.through[${i}]: invalid point`); });
      if (s.domain !== undefined) range('domain');
      if (s.h !== undefined && (typeof s.h !== 'number' || s.h <= 0)) errs.push(`objects.${key}.h: must be > 0`);
      optStrokeFill();
      break;
    }
    case 'wg-plot-bifurcation':
      expr('expr'); range('rRange');
      if (s.iters !== undefined && (typeof s.iters !== 'number' || s.iters < 1)) errs.push(`objects.${key}.iters: must be >= 1`);
      if (s.transient !== undefined && (typeof s.transient !== 'number' || s.transient < 0)) errs.push(`objects.${key}.transient: must be >= 0`);
      if (s.rSteps !== undefined && (typeof s.rSteps !== 'number' || s.rSteps < 1)) errs.push(`objects.${key}.rSteps: must be >= 1`);
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-fourier':
      expr('expr');
      if (!isWgNum(s.terms)) errs.push(`objects.${key}.terms: required number or $param`);
      if (s.period !== undefined && !isWgNum(s.period)) errs.push(`objects.${key}.period: must be number or $param`);
      if (s.domain !== undefined) range('domain');
      if (s.epicycles !== undefined && typeof s.epicycles !== 'boolean') errs.push(`objects.${key}.epicycles: must be boolean`);
      samples(); optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-histogram':
      if (!Array.isArray(s.data) || s.data.length < 1) errs.push(`objects.${key}.data: array of numbers (>= 1)`);
      else s.data.forEach((v, i) => { if (typeof v !== 'number' || !isFinite(v)) errs.push(`objects.${key}.data[${i}]: must be finite`); });
      if (s.method !== undefined && !['sturges', 'fd'].includes(s.method as string)) errs.push(`objects.${key}.method: must be sturges|fd`);
      if (s.bins !== undefined && (typeof s.bins !== 'number' || s.bins < 1)) errs.push(`objects.${key}.bins: must be >= 1`);
      optStrokeFill();
      break;
    case 'wg-boxplot':
      if (!Array.isArray(s.data) || s.data.length < 1) errs.push(`objects.${key}.data: array of numbers (>= 1)`);
      else s.data.forEach((v, i) => { if (typeof v !== 'number' || !isFinite(v)) errs.push(`objects.${key}.data[${i}]: must be finite`); });
      if (s.variant !== undefined && !['box', 'violin', 'strip', 'beeswarm'].includes(s.variant as string))
        errs.push(`objects.${key}.variant: must be box|violin|strip|beeswarm`);
      if (s.at !== undefined && !isWgNum(s.at)) errs.push(`objects.${key}.at: must be number or $param`);
      optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-plot-cells':
      if (!['bubble', 'heatmap', 'hexbin'].includes(s.cell as string)) errs.push(`objects.${key}.cell: must be bubble|heatmap|hexbin`);
      if (s.points !== undefined && !Array.isArray(s.points)) errs.push(`objects.${key}.points: must be an array`);
      if (s.sizes !== undefined && !Array.isArray(s.sizes)) errs.push(`objects.${key}.sizes: must be an array`);
      if (s.matrix !== undefined && !Array.isArray(s.matrix)) errs.push(`objects.${key}.matrix: must be an array`);
      if (s.size !== undefined && !isWgNum(s.size)) errs.push(`objects.${key}.size: must be number or $param`);
      optStrokeFill();
      break;
    case 'wg-contours':
      expr('expr');
      if (s.levels !== undefined && !Array.isArray(s.levels)) errs.push(`objects.${key}.levels: must be an array`);
      if (s.count !== undefined && (typeof s.count !== 'number' || s.count < 1)) errs.push(`objects.${key}.count: must be >= 1`);
      if (s.filled !== undefined && typeof s.filled !== 'boolean') errs.push(`objects.${key}.filled: must be boolean`);
      if (s.labels !== undefined && typeof s.labels !== 'boolean') errs.push(`objects.${key}.labels: must be boolean`);
      if (s.gridRes !== undefined && (typeof s.gridRes !== 'number' || s.gridRes <= 0)) errs.push(`objects.${key}.gridRes: must be > 0`);
      optStrokeFill();
      break;
    case 'wg-regression':
      if (!Array.isArray(s.points) || s.points.length < 2) errs.push(`objects.${key}.points: array of [x,y] (>= 2)`);
      else s.points.forEach((p, i) => { if (!isVec2(p)) errs.push(`objects.${key}.points[${i}]: invalid [x,y]`); });
      if (!['linear', 'poly', 'exp', 'logistic', 'power'].includes(s.fit as string))
        errs.push(`objects.${key}.fit: must be linear|poly|exp|logistic|power`);
      if (s.degree !== undefined && (typeof s.degree !== 'number' || s.degree < 1)) errs.push(`objects.${key}.degree: must be >= 1`);
      if (s.showResiduals !== undefined && typeof s.showResiduals !== 'boolean') errs.push(`objects.${key}.showResiduals: must be boolean`);
      if (s.showBand !== undefined && typeof s.showBand !== 'boolean') errs.push(`objects.${key}.showBand: must be boolean`);
      optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-chart-fin':
      if (!['candle', 'waterfall', 'funnel', 'radar', 'windrose'].includes(s.chart as string))
        errs.push(`objects.${key}.chart: must be candle|waterfall|funnel|radar|windrose`);
      if (s.chart === 'candle') {
        if (!Array.isArray(s.ohlc) || s.ohlc.length < 1) errs.push(`objects.${key}.ohlc: required for candle charts`);
      } else if (s.values !== undefined && !Array.isArray(s.values)) errs.push(`objects.${key}.values: must be an array`);
      optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    case 'wg-chart-multi':
      if (!['ternary', 'parallel', 'scattermatrix'].includes(s.chart as string))
        errs.push(`objects.${key}.chart: must be ternary|parallel|scattermatrix`);
      if (s.columns !== undefined && !Array.isArray(s.columns)) errs.push(`objects.${key}.columns: must be an array`);
      if (s.triples !== undefined && !Array.isArray(s.triples)) errs.push(`objects.${key}.triples: must be an array`);
      optStrokeFill();
      if (s.color !== undefined && !isColor(s.color)) errs.push(`objects.${key}.color: invalid color`);
      break;
    default:
      errs.push(`objects.${key}: unhandled windgraph kind "${k}"`);
  }
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
  const checkRef = (refName: string, path: string) => {
    if (!params || !params[refName])
      errs.push(`objects.${path}: $param "${refName}" not found in doc.params`);
  };
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      // WgNum/WgPoint entries (domain tuples, point lists) may carry $param refs
      v.forEach((x, i) => {
        if (!x || typeof x !== 'object') return;
        if (typeof (x as any).$param === 'string') checkRef((x as any).$param, `${objKey}.${k}[${i}]`);
        else if (!Array.isArray(x)) walkParamRefs(x as Record<string, unknown>, params, `${objKey}.${k}[${i}]`, errs);
      });
    } else if (v && typeof v === 'object') {
      if (typeof (v as any).$param === 'string') {
        checkRef((v as any).$param, `${objKey}.${k}`);
      } else {
        walkParamRefs(v as Record<string, unknown>, params, objKey + '.' + k, errs);
      }
    }
  }
}
