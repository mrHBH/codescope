// ── Scene IR schema validation ──────────────────────────────────────────────
// Runtime validation for externally-loaded IR (file load, REPL commands).
// Builder-generated IR is validated by TypeScript, but deserialized JSON
// from disk must be validated before loading into the runtime.

import type {
  SceneIR, ObjectSpec, AnimationClip, CameraTrack, ParamDef,
  AnimationKind, ObjectKind, EasingName, LayoutSpec,
  Padding, Vec2, Color,
} from './types';

export type ValidationResult = ValidationOk | ValidationErr;

export interface ValidationOk {
  ok: true;
}

export interface ValidationErr {
  ok: false;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fail(errors: string[]): ValidationErr {
  return { ok: false, errors };
}

function pass(): ValidationOk {
  return { ok: true };
}

function isString(v: unknown): v is string { return typeof v === 'string'; }
function isNumber(v: unknown): v is number { return typeof v === 'number' && !Number.isNaN(v); }
function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean'; }
function isObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function isPlainArray(v: unknown): v is unknown[] { return Array.isArray(v); }

function isVec2(v: unknown): v is Vec2 {
  if (!isPlainArray(v) || v.length !== 2) return false;
  return isNumber(v[0]) && isNumber(v[1]);
}

function isColor(v: unknown): v is Color {
  if (!isPlainArray(v) || v.length !== 4) return false;
  return isNumber(v[0]) && isNumber(v[1]) && isNumber(v[2]) && isNumber(v[3]);
}

function isVec2Optional(v: unknown): v is Vec2 | undefined {
  if (v === undefined) return true;
  return isVec2(v);
}

function isNumberOptional(v: unknown): v is number | undefined {
  if (v === undefined) return true;
  return isNumber(v);
}

function isBooleanOptional(v: unknown): v is boolean | undefined {
  if (v === undefined) return true;
  return isBoolean(v);
}

function isPadding(v: unknown): v is Padding {
  if (isNumber(v)) return true;
  if (!isPlainArray(v)) return false;
  const n = v.length;
  if (n !== 2 && n !== 4) return false;
  return (v as unknown[]).every(n => isNumber(n));
}

function isEasingName(v: unknown): v is EasingName {
  const valid: EasingName[] = [
    'linear',
    'quadIn', 'quadOut', 'quadInOut',
    'cubicIn', 'cubicOut', 'cubicInOut',
    'quintIn', 'quintOut', 'quintInOut',
    'smoothstep', 'smootherstep',
    'sineIn', 'sineOut', 'sineInOut',
    'backIn', 'backOut', 'backInOut',
    'elasticIn', 'elasticOut',
    'bounceIn', 'bounceOut',
    'rushInto', 'rushFrom',
  ];
  return isString(v) && valid.includes(v as EasingName);
}

function isAnimationKind(v: unknown): v is AnimationKind {
  const valid: AnimationKind[] = [
    'draw', 'fadeIn', 'fadeOut', 'write',
    'moveTo', 'shift', 'scaleTo', 'rotateTo',
    'morphTo', 'cameraTo', 'param',
  ];
  return isString(v) && valid.includes(v as AnimationKind);
}

function isObjectKind(v: unknown): v is ObjectKind {
  const valid: ObjectKind[] = [
    'text', 'glyph', 'rect', 'circle', 'ellipse',
    'polygon', 'arc', 'line', 'arrow', 'group', 'plot',
  ];
  return isString(v) && valid.includes(v as ObjectKind);
}

// ── ObjectSpec validation ────────────────────────────────────────────────────

function validateObjectSpec(obj: unknown, path: string): ValidationResult {
  if (!isObject(obj)) return fail([`${path}: expected object`]);
  if (!isObjectKind(obj.kind)) return fail([`${path}: unknown kind '${obj.kind}'`]);
  if (!isString(obj.id) || obj.id.length === 0) return fail([`${path}: missing or invalid id`]);

  const idPath = `${path}.${obj.kind}:${obj.id}`;
  const errs: string[] = [];

  // Common optional fields
  if (obj.at !== undefined && !isVec2(obj.at)) errs.push(`${idPath}: at must be [number, number]`);
  if (obj.opacity !== undefined && (!isNumber(obj.opacity) || obj.opacity < 0 || obj.opacity > 1)) errs.push(`${idPath}: opacity must be 0-1`);
  if (obj.visible !== undefined && !isBoolean(obj.visible)) errs.push(`${idPath}: visible must be boolean`);
  if (obj.zIndex !== undefined && !isNumber(obj.zIndex)) errs.push(`${idPath}: zIndex must be number`);
  if (obj.rotation !== undefined && !isNumber(obj.rotation)) errs.push(`${idPath}: rotation must be number`);
  if (obj.scaleX !== undefined && !isNumber(obj.scaleX)) errs.push(`${idPath}: scaleX must be number`);
  if (obj.scaleY !== undefined && !isNumber(obj.scaleY)) errs.push(`${idPath}: scaleY must be number`);
  if (obj.reveal !== undefined && (!isNumber(obj.reveal) || obj.reveal < 0 || obj.reveal > 1)) errs.push(`${idPath}: reveal must be 0-1`);

  // Kind-specific
  switch (obj.kind) {
    case 'text': {
      if (!isString(obj.content)) errs.push(`${idPath}: content must be string`);
      if (!isObject(obj.style)) { errs.push(`${idPath}: style must be object`); break; }
      if (!isNumber(obj.style.size)) errs.push(`${idPath}: style.size must be number`);
      if (!isColor(obj.style.color)) errs.push(`${idPath}: style.color must be [r,g,b,a]`);
      if (obj.style.font !== undefined && !isString(obj.style.font)) errs.push(`${idPath}: style.font must be string`);
      if (obj.style.weight !== undefined && !isNumber(obj.style.weight)) errs.push(`${idPath}: style.weight must be number`);
      if (obj.style.align !== undefined && (!isString(obj.style.align) || !['left','center','right'].includes(obj.style.align))) errs.push(`${idPath}: style.align must be 'left' | 'center' | 'right'`);
      if (obj.style.lineHeight !== undefined && !isNumber(obj.style.lineHeight)) errs.push(`${idPath}: style.lineHeight must be number`);
      break;
    }
    case 'glyph': {
      if (!isString(obj.char) || obj.char.length === 0) errs.push(`${idPath}: char must be non-empty string`);
      if (obj.scale !== undefined && !isNumber(obj.scale)) errs.push(`${idPath}: scale must be number`);
      if (obj.subregion !== undefined) {
        if (!isPlainArray(obj.subregion) || obj.subregion.length !== 3 || !(obj.subregion as unknown[]).every(n => isNumber(n))) {
          errs.push(`${idPath}: subregion must be [number, number, number]`);
        }
      }
      if (!isObject(obj.style)) errs.push(`${idPath}: style must be object`);
      break;
    }
    case 'rect': {
      if (!isVec2(obj.size)) errs.push(`${idPath}: size must be [number, number]`);
      if (obj.fill !== undefined && !isColor(obj.fill)) errs.push(`${idPath}: fill must be [r,g,b,a]`);
      if (obj.stroke !== undefined) {
        if (!isObject(obj.stroke) || !isColor(obj.stroke.color) || !isNumber(obj.stroke.width)) {
          errs.push(`${idPath}: stroke must be { color: [r,g,b,a], width: number }`);
        }
      }
      break;
    }
    case 'circle': {
      if (!isNumber(obj.radius)) errs.push(`${idPath}: radius must be number`);
      if (obj.fill !== undefined && !isColor(obj.fill)) errs.push(`${idPath}: fill must be [r,g,b,a]`);
      if (obj.stroke !== undefined) {
        if (!isObject(obj.stroke) || !isColor(obj.stroke.color) || !isNumber(obj.stroke.width)) {
          errs.push(`${idPath}: stroke must be { color: [r,g,b,a], width: number }`);
        }
      }
      break;
    }
    case 'ellipse': {
      if (!isNumber(obj.rx)) errs.push(`${idPath}: rx must be number`);
      if (!isNumber(obj.ry)) errs.push(`${idPath}: ry must be number`);
      break;
    }
    case 'polygon': {
      if (!isPlainArray(obj.points) || obj.points.length < 2) errs.push(`${idPath}: points must be array of [number,number]`);
      else if (!(obj.points as unknown[]).every(p => isVec2(p))) errs.push(`${idPath}: points elements must be [number,number]`);
      break;
    }
    case 'arc': {
      if (!isNumber(obj.radius)) errs.push(`${idPath}: radius must be number`);
      if (!isNumber(obj.startAngle)) errs.push(`${idPath}: startAngle must be number`);
      if (!isNumber(obj.endAngle)) errs.push(`${idPath}: endAngle must be number`);
      if (!isObject(obj.stroke) || !isColor(obj.stroke.color) || !isNumber(obj.stroke.width)) {
        errs.push(`${idPath}: stroke must be { color: [r,g,b,a], width: number }`);
      }
      break;
    }
    case 'line': {
      if (!isPlainArray(obj.points) || obj.points.length < 2) errs.push(`${idPath}: points must have at least 2 elements`);
      else if (!(obj.points as unknown[]).every(p => isVec2(p))) errs.push(`${idPath}: points elements must be [number,number]`);
      if (!isObject(obj.stroke) || !isColor(obj.stroke.color) || !isNumber(obj.stroke.width)) {
        errs.push(`${idPath}: stroke must be { color: [r,g,b,a], width: number }`);
      }
      break;
    }
    case 'arrow': {
      if (obj.from !== undefined && !isVec2(obj.from)) errs.push(`${idPath}: from must be [number, number]`);
      if (obj.to !== undefined && !isVec2(obj.to)) errs.push(`${idPath}: to must be [number, number]`);
      if (!isObject(obj.stroke) || !isColor(obj.stroke.color) || !isNumber(obj.stroke.width)) {
        errs.push(`${idPath}: stroke must be { color: [r,g,b,a], width: number }`);
      }
      break;
    }
    case 'group': {
      if (!isPlainArray(obj.children)) errs.push(`${idPath}: children must be string array`);
      if (obj.layout !== undefined) {
        if (!isObject(obj.layout) || !isString(obj.layout.kind)) {
          errs.push(`${idPath}: layout.kind must be a valid layout kind`);
        }
      }
      break;
    }
    case 'plot': {
      // Relaxed validation for plots — fully validated in Phase 4
      if (!isString(obj.plotKind)) errs.push(`${idPath}: plotKind must be string`);
      break;
    }
  }

  return errs.length > 0 ? fail(errs) : pass();
}

// ── Clip validation ──────────────────────────────────────────────────────────

function validateAnimationClip(clip: unknown, path: string): ValidationResult {
  if (!isObject(clip)) return fail([`${path}: expected object`]);
  const errs: string[] = [];
  if (!isString(clip.id) || clip.id.length === 0) errs.push(`${path}: missing id`);
  if (!isString(clip.target) || clip.target.length === 0) errs.push(`${path}: missing target`);
  if (!isAnimationKind(clip.kind)) errs.push(`${path}: unknown animation kind '${clip.kind}'`);
  if (!isNumber(clip.start) || clip.start < 0) errs.push(`${path}: start must be non-negative number`);
  if (!isNumber(clip.duration) || clip.duration <= 0) errs.push(`${path}: duration must be positive number`);
  if (!isEasingName(clip.ease)) errs.push(`${path}: unknown easing '${clip.ease}'`);
  return errs.length > 0 ? fail(errs) : pass();
}

// ── Camera validation ────────────────────────────────────────────────────────

function validateCameraTrack(cam: unknown, path: string): ValidationResult {
  if (!isObject(cam)) return fail([`${path}: expected object`]);
  const errs: string[] = [];
  if (!isPlainArray(cam.keyframes)) { errs.push(`${path}: keyframes must be array`); return fail(errs); }
  const kfs = cam.keyframes as unknown[];
  if (kfs.length === 0) return pass(); // no keyframes is valid (static camera)

  let prevTime = -Infinity;
  for (let i = 0; i < kfs.length; i++) {
    const kf = kfs[i];
    if (!isObject(kf)) { errs.push(`${path}.keyframes[${i}]: expected object`); continue; }
    if (!isNumber(kf.time)) errs.push(`${path}.keyframes[${i}]: time must be number`);
    else {
      if (kf.time < prevTime) errs.push(`${path}.keyframes[${i}]: keyframes must be sorted by time`);
      prevTime = kf.time;
    }
    if (!isVec2(kf.center)) errs.push(`${path}.keyframes[${i}]: center must be [number, number]`);
    if (!isNumber(kf.zoom) || kf.zoom <= 0) errs.push(`${path}.keyframes[${i}]: zoom must be positive number`);
    if (kf.rotation !== undefined && !isNumber(kf.rotation)) errs.push(`${path}.keyframes[${i}]: rotation must be number`);
    if (kf.ease !== undefined && !isEasingName(kf.ease)) errs.push(`${path}.keyframes[${i}]: unknown easing '${kf.ease}'`);
  }
  return errs.length > 0 ? fail(errs) : pass();
}

// ── Param validation ─────────────────────────────────────────────────────────

function validateParamDef(p: unknown, path: string): ValidationResult {
  if (!isObject(p)) return fail([`${path}: expected object`]);
  const errs: string[] = [];
  if (!isString(p.id) || p.id.length === 0) errs.push(`${path}: missing id`);
  if (!isString(p.label)) errs.push(`${path}: label must be string`);

  switch (p.kind) {
    case 'slider':
      if (!isNumber(p.default)) errs.push(`${path}: default must be number`);
      if (!isNumber(p.min)) errs.push(`${path}: min must be number`);
      if (!isNumber(p.max)) errs.push(`${path}: max must be number`);
      break;
    case 'toggle':
      if (!isBoolean(p.default)) errs.push(`${path}: default must be boolean`);
      break;
    case 'point':
      if (!isVec2(p.default)) errs.push(`${path}: default must be [number, number]`);
      break;
    case 'color':
      if (!isColor(p.default)) errs.push(`${path}: default must be [r,g,b,a]`);
      break;
    default:
      errs.push(`${path}: unknown param kind '${p.kind}'`);
  }
  return errs.length > 0 ? fail(errs) : pass();
}

// ── Top-level validation ─────────────────────────────────────────────────────

export function validateSceneIR(obj: unknown): ValidationResult {
  if (!isObject(obj)) return fail(['root: expected object']);
  if (obj.version !== 1) return fail([`root: unsupported version ${obj.version}`]);

  const errs: string[] = [];

  // Meta
  if (!isObject(obj.meta)) { errs.push('meta: expected object'); }
  else {
    if (!isString(obj.meta.title)) errs.push('meta.title: must be string');
    if (!isNumber(obj.meta.duration) || obj.meta.duration < 0) errs.push('meta.duration: must be non-negative number');
  }

  // Objects
  if (!isObject(obj.objects)) { errs.push('objects: expected object'); }
  else {
    const seenIds = new Set<string>();
    for (const [key, spec] of Object.entries(obj.objects)) {
      if (seenIds.has(key)) { errs.push(`objects: duplicate id '${key}'`); continue; }
      seenIds.add(key);
      const r = validateObjectSpec(spec, `objects.${key}`);
      if (!r.ok) errs.push(...r.errors);
    }
  }

  // Clips
  if (!isPlainArray(obj.clips)) { errs.push('clips: expected array'); }
  else {
    const objects = (obj.objects ?? {}) as Record<string, unknown>;
    const clipIds = new Set<string>();
    for (let i = 0; i < obj.clips.length; i++) {
      const clip = obj.clips[i];
      const r = validateAnimationClip(clip, `clips[${i}]`);
      if (!r.ok) { errs.push(...r.errors); continue; }
      const c = clip as AnimationClip;
      if (clipIds.has(c.id)) errs.push(`clips[${i}]: duplicate clip id '${c.id}'`);
      clipIds.add(c.id);
      if (c.target !== 'camera' && !(c.target in objects)) {
        errs.push(`clips[${i}]: target '${c.target}' not found in objects`);
      }
    }
  }

  // Camera
  const camR = validateCameraTrack(obj.camera, 'camera');
  if (!camR.ok) errs.push(...camR.errors);

  // Params
  if (!isPlainArray(obj.params)) { errs.push('params: expected array'); }
  else {
    const paramIds = new Set<string>();
    for (let i = 0; i < obj.params.length; i++) {
      const r = validateParamDef(obj.params[i], `params[${i}]`);
      if (!r.ok) { errs.push(...r.errors); continue; }
      const p = obj.params[i] as ParamDef;
      if (paramIds.has(p.id)) errs.push(`params[${i}]: duplicate param id '${p.id}'`);
      paramIds.add(p.id);
    }
  }

  // Cross-reference: do any clip targets reference object IDs?
  if (isPlainArray(obj.clips)) {
    const objects = (obj.objects ?? {}) as Record<string, unknown>;
    for (let i = 0; i < obj.clips.length; i++) {
      const clip = obj.clips[i] as AnimationClip;
      if (clip?.target && clip.target !== 'camera' && !(clip.target in objects)) {
        errs.push(`clips[${i}]: target '${clip.target}' refers to unknown object`);
      }
      if (clip?.kind === 'param') {
        const pId = clip.props?.paramId;
        if (pId && !(obj.params as ParamDef[]).some(p => p.id === pId)) {
          errs.push(`clips[${i}]: param clip references unknown param '${pId}'`);
        }
      }
    }
  }

  return errs.length > 0 ? fail(errs) : pass();
}
