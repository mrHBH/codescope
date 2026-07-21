// ── Code projection — emit builder TypeScript from a SceneDoc ─────────────────
// Produces deterministic, 2-space-indented builder code that reconstructs the doc.

import type { SceneDoc, ObjectSpec, Vec2, Color } from './ir/types';

function fmt(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return isFinite(v) ? String(v) : '0';
  if (Array.isArray(v)) return '[' + v.map(fmt).join(', ') + ']';
  if (v && typeof v === 'object' && '$param' in (v as any)) {
    return `s.param.ref('${(v as any).$param}')`;
  }
  return JSON.stringify(v);
}

function fmtObj(obj: Record<string, unknown>, indent: number): string {
  const sp = ' '.repeat(indent);
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  if (entries.length === 1) {
    return `{ ${entries[0][0]}: ${fmt(entries[0][1])} }`;
  }
  return '{\n' + entries.map(([k, v]) => `${sp}  ${k}: ${fmt(v)}`).join(',\n') + `\n${sp}}`;
}

function chapterOpts(g: any): Record<string, unknown> {
  const o: Record<string, unknown> = {
    title: g.chapter.title,
    sub: g.chapter.sub,
    at: g.at,
    dur: g.chapter.duration,
  };
  if (g.size && (g.size[0] !== 1260 || g.size[1] !== 820)) o.size = g.size;
  return o;
}

export function emitTS(doc: SceneDoc): string {
  const lines: string[] = [];
  const chGroups: [string, any][] = [];
  const orphans: [string, ObjectSpec][] = [];

  for (const [id, spec] of Object.entries(doc.objects)) {
    const s = spec as any;
    if (s.kind === 'group' && s.chapter) {
      chGroups.push([id, s]);
    } else {
      // Check if this object is a child of a chapter group
      let isChild = false;
      for (const [, g] of chGroups) {
        if (g.children && g.children.includes(id)) { isChild = true; break; }
      }
      if (!isChild) orphans.push([id, spec]);
    }
  }

  // ── Emit ────────────────────────────────────────────────────────────────
  lines.push(`import { scene } from '../builder/scene';`);
  lines.push('');
  lines.push(`export const doc = scene({ title: ${JSON.stringify(doc.meta.title)} }, (s) => {`);

  // Params
  for (const [name, pDef] of Object.entries(doc.params)) {
    const p = pDef as any;
    switch (p.kind) {
      case 'number': {
        const extras: string[] = [];
        if (p.min !== undefined) extras.push(`min: ${fmt(p.min)}`);
        if (p.max !== undefined) extras.push(`max: ${fmt(p.max)}`);
        if (p.step !== undefined) extras.push(`step: ${fmt(p.step)}`);
        if (p.label && p.label !== name) extras.push(`label: ${JSON.stringify(p.label)}`);
        lines.push(`  s.param.number('${name}', { default: ${fmt(p.default)}${extras.length ? ', ' + extras.join(', ') : ''} });`);
        break;
      }
      case 'point':
        lines.push(`  s.param.point('${name}', { default: ${fmt(p.default)}${p.label && p.label !== name ? `, label: ${JSON.stringify(p.label)}` : ''} });`);
        break;
      case 'boolean':
        lines.push(`  s.param.boolean('${name}', { default: ${fmt(p.default)}${p.label && p.label !== name ? `, label: ${JSON.stringify(p.label)}` : ''} });`);
        break;
      case 'color':
        lines.push(`  s.param.color('${name}', { default: ${fmt(p.default)}${p.label && p.label !== name ? `, label: ${JSON.stringify(p.label)}` : ''} });`);
        break;
    }
  }
  if (Object.keys(doc.params).length > 0) lines.push('');

  // Chapters
  for (const [gid, g] of chGroups) {
    const opts = chapterOpts(g);
    lines.push(`  const ${gid} = s.chapter('${gid}', ${fmtObj(opts, 2)});`);

    // Chapter children
    for (const cid of (g.children ?? []) as string[]) {
      const spec = doc.objects[cid] as any;
      if (!spec) continue;
      emitObject(lines, gid, cid, spec, g);
    }

    // Find clips for children of this chapter
    const myClips = doc.clips.filter((c) => {
      const tgt = c.target;
      if (tgt.startsWith('param:')) return doc.params[tgt.slice(6)] != null;
      return g.children?.includes(tgt);
    });
    for (const clip of myClips) {
      emitClip(lines, gid, clip, doc);
    }

    lines.push('');
  }

  // Orphan objects (not in any chapter)
  for (const [id, spec] of orphans) {
    emitOrphanObject(lines, id, spec as any);
  }

  // Camera keyframes
  if (doc.camera.keyframes.length > 0 && chGroups.length === 0) {
    for (const kf of doc.camera.keyframes) {
      const parts: string[] = [];
      if (kf.fit) parts.push(`fit: '${kf.fit}'`);
      if (kf.center) parts.push(`center: ${fmt(kf.center)}`);
      if (kf.zoom !== undefined) parts.push(`zoom: ${fmt(kf.zoom)}`);
      if (kf.offset) parts.push(`offset: ${fmt(kf.offset)}`);
      if (kf.zoomMul !== undefined && kf.zoomMul !== 1) parts.push(`zoomMul: ${fmt(kf.zoomMul)}`);
      if (kf.polar !== undefined) parts.push(`polar: ${fmt(kf.polar)}`);
      if (kf.azimuth !== undefined) parts.push(`azimuth: ${fmt(kf.azimuth)}`);
      if (kf.ease) parts.push(`ease: '${kf.ease}'`);
      if (kf.drift) parts.push(`drift: ${fmt(kf.drift)}`);
      lines.push(`  s.cam.keyframe(${fmt(kf.time)}, { ${parts.join(', ')} });`);
    }
  }

  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function emitObject(lines: string[], chId: string, id: string, s: any, parentGroup: any): void {
  // Convert absolute at to chapter-relative
  const origin = parentGroup.at as Vec2;
  const relAt = (p: Vec2): Vec2 => [p[0] - origin[0], p[1] - origin[1]];

  const rest: Record<string, unknown> = {};
  switch (s.kind) {
    case 'text':
      rest.at = relAt(s.at);
      rest.size = s.size;
      rest.color = s.color;
      if (s.weight) rest.weight = s.weight;
      if (s.align && s.align !== 'left') rest.align = s.align;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.text('${id}', ${JSON.stringify(s.content)}, ${fmtObj(rest, 4)});`);
      break;
    case 'glyph':
      rest.at = relAt(s.at);
      rest.size = s.size;
      rest.color = s.color;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.glyph('${id}', '${s.char}', ${fmtObj(rest, 4)});`);
      break;
    case 'rect':
      rest.at = relAt(s.at);
      rest.size = s.size;
      if (s.fill) rest.fill = s.fill;
      if (s.stroke) rest.stroke = s.stroke;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.rect('${id}', ${fmtObj(rest, 4)});`);
      break;
    case 'circle':
      rest.center = relAt(s.center);
      rest.radius = s.radius;
      if (s.fill) rest.fill = s.fill;
      if (s.stroke) rest.stroke = s.stroke;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.circle('${id}', ${fmtObj(rest, 4)});`);
      break;
    case 'line':
      // Points are chapter-relative
      rest.width = s.width;
      rest.color = s.color;
      if (s.dash) rest.dash = s.dash;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.line('${id}', ${fmt(s.points.map(relAt))}, ${fmtObj(rest, 4)});`);
      break;
    case 'polygon':
      rest.fill = s.fill;
      if (s.stroke) rest.stroke = s.stroke;
      if (s.closed !== undefined) rest.closed = s.closed;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.polygon('${id}', ${fmt(s.points.map(relAt))}, ${fmtObj(rest, 4)});`);
      break;
    case 'math':
      rest.at = relAt(s.at);
      rest.size = s.size;
      rest.color = s.color;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.math('${id}', ${JSON.stringify(s.latex)}, ${fmtObj(rest, 4)});`);
      break;
    case 'island':
      rest.at = relAt(s.at);
      if (s.size) rest.size = s.size;
      if (s.params) rest.params = s.params;
      if (s.opacity !== undefined) rest.opacity = s.opacity;
      lines.push(`  ${chId}.island('${id}', '${s.island}', ${fmtObj(rest, 4)});`);
      break;
  }
}

function emitOrphanObject(lines: string[], id: string, s: any): void {
  // No chapter context — emit as top-level objects (not implemented in builder API)
  // Skip for now — orphans are rare
}

function emitClip(lines: string[], chId: string, clip: any, doc: SceneDoc): void {
  const rest: Record<string, unknown> = {
    start: clip.start,
    duration: clip.duration,
  };
  // Make start chapter-relative: find the chapter's start time
  const chs = doc.objects;
  for (const [, spec] of Object.entries(chs)) {
    const g = spec as any;
    if (g.kind === 'group' && g.id === chId) {
      // Chapter-relative: subtract chapter start
      let chStart = 0;
      // Chapter starts are sequential — find by object insertion order
      let acc = 0;
      for (const [oid, o] of Object.entries(doc.objects)) {
        const og = o as any;
        if (og.kind === 'group' && og.id === chId) { chStart = acc; break; }
        if (og.kind === 'group' && og.chapter) acc += og.chapter.duration;
      }
      rest.start = Math.max(0, (clip.start as number) - chStart);
      break;
    }
  }
  if (clip.ease) rest.ease = clip.ease;

  const target = clip.target.startsWith('param:') ? `'${clip.target.slice(6)}'` : `'${clip.target}'`;

  switch (clip.kind) {
    case 'fadeIn':
      lines.push(`  ${chId}.clip.fadeIn(${target}, ${fmtObj(rest, 4)});`);
      break;
    case 'fadeOut':
      lines.push(`  ${chId}.clip.fadeOut(${target}, ${fmtObj(rest, 4)});`);
      break;
    case 'draw':
      lines.push(`  ${chId}.clip.draw(${target}, ${fmtObj(rest, 4)});`);
      break;
    case 'write':
      lines.push(`  ${chId}.clip.write(${target}, ${fmtObj(rest, 4)});`);
      break;
    case 'moveTo':
      if ((clip.props as any).x !== undefined) rest.x = (clip.props as any).x;
      if ((clip.props as any).y !== undefined) rest.y = (clip.props as any).y;
      lines.push(`  ${chId}.clip.moveTo(${target}, [${(clip.props as any).x ?? 0}, ${(clip.props as any).y ?? 0}], ${fmtObj(rest, 4)});`);
      break;
    case 'scaleTo':
      lines.push(`  ${chId}.clip.scaleTo(${target}, ${(clip.props as any).x ?? 1}, ${(clip.props as any).y ?? 1}, ${fmtObj(rest, 4)});`);
      break;
    case 'rotateTo':
      lines.push(`  ${chId}.clip.rotateTo(${target}, ${(clip.props as any).deg ?? 0}, ${fmtObj(rest, 4)});`);
      break;
    case 'morph':
      if ((clip.props as any).points) rest.points = (clip.props as any).points;
      lines.push(`  ${chId}.clip.morph(${target}, ${fmt((clip.props as any).points ?? [])}, ${fmtObj(rest, 4)});`);
      break;
    case 'param':
      rest.to = (clip.props as any).to;
      lines.push(`  ${chId}.clip.param(${target}, ${fmtObj(rest, 4)});`);
      break;
  }
}
