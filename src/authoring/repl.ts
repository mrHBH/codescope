// ── REPL — scene command handler for the authoring demo ─────────────────────
// Routes `scene ...` commands typed in the Terminal, mirrors the `wf` command
// pattern from scriptRuntime.ts.

import type { Terminal } from '../editor/terminal';
import type { SceneRuntime } from './runtime/runtime';
import type { SceneDoc, ObjectSpec } from './ir/types';
import { evalScene, type FrameState } from './runtime/timeline';
import { serialize, deserialize } from './ir/serialize';

export function handleSceneCommand(
  raw: string,
  term: Terminal,
  runtime: SceneRuntime,
): boolean {
  const parts = raw.trim().split(/\s+/);
  if (parts[0] !== 'scene') return false;
  const cmd = parts[1];
  const arg = parts.slice(2).join(' ');

  const log = (msg: string) => term.writeLine(msg);
  const fail = (msg: string) => { term.writeLine('error: ' + msg); return true; };

  if (!cmd) return fail('usage: scene <command> [...] — try "scene help"');

  switch (cmd) {
    // ── Status ──────────────────────────────────────────────────────────
    case 'status': {
      const doc = runtime.getDoc();
      const nObj = Object.keys(doc.objects).length;
      const nClips = doc.clips.length;
      const dur = runtime.totalDuration();
      log(`title:  ${doc.meta.title}`);
      log(`objects: ${nObj}  clips: ${nClips}  params: ${Object.keys(doc.params).length}`);
      log(`duration: ${dur.toFixed(2)}s  time: ${runtime.tourT.toFixed(2)}s`);
      log(`playing: ${runtime.playing}`);
      return true;
    }

    // ── Objects ─────────────────────────────────────────────────────────
    case 'objects': {
      const doc = runtime.getDoc();
      const entries = Object.entries(doc.objects);
      if (entries.length === 0) { log('(no objects)'); return true; }
      for (const [id, spec] of entries) {
        const s = spec as ObjectSpec;
        log(`  ${id}  (${s.kind})`);
      }
      return true;
    }

    // ── Params ──────────────────────────────────────────────────────────
    case 'params': {
      const doc = runtime.getDoc();
      const entries = Object.entries(doc.params);
      if (entries.length === 0) { log('(no params)'); return true; }
      const live = (runtime as any).liveParams as Map<string, any> | undefined;
      for (const [name, pDef] of entries) {
        const d = pDef as any;
        const val = live?.get(name) ?? d.default;
        log(`  ${name}  (${d.kind})  = ${JSON.stringify(val)}`);
      }
      return true;
    }

    // ── Clips ───────────────────────────────────────────────────────────
    case 'clips': {
      const doc = runtime.getDoc();
      if (doc.clips.length === 0) { log('(no clips)'); return true; }
      for (const c of doc.clips) {
        log(`  ${c.id}  start=${c.start.toFixed(2)}s  dur=${c.duration.toFixed(2)}s  ${c.target}  ${c.kind}`);
      }
      return true;
    }

    // ── Inspect ─────────────────────────────────────────────────────────
    case 'inspect': {
      if (!arg) return fail('usage: scene inspect <id>');
      const doc = runtime.getDoc();
      const spec = doc.objects[arg] as ObjectSpec | undefined;
      if (!spec) return fail(`object "${arg}" not found`);
      const s = spec as any;
      log(`id:     ${s.id}`);
      log(`kind:   ${s.kind}`);
      for (const k of ['at', 'center', 'content', 'size', 'color', 'fill', 'stroke',
        'radius', 'points', 'children', 'island', 'params', 'opacity', 'visible',
        'weight', 'align', 'latex', 'char', 'width', 'dash', 'closed', 'chapter']) {
        if (k in s) {
          const v = s[k];
          log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
        }
      }
      // Show current frame state
      const fs: FrameState = evalScene(doc, runtime.tourT, (runtime as any).liveParams);
      const frame = fs.objects.get(arg);
      if (frame) {
        log(`-- frame state at t=${runtime.tourT.toFixed(2)}s --`);
        log(`  opacityMult: ${frame.opacityMult.toFixed(3)}`);
        log(`  reveal:   ${frame.reveal.toFixed(3)}`);
        log(`  offset:   [${frame.dx.toFixed(1)}, ${frame.dy.toFixed(1)}]`);
        log(`  scale:    [${frame.scaleX.toFixed(2)}, ${frame.scaleY.toFixed(2)}]`);
        log(`  rotation: ${frame.rotation.toFixed(2)}`);
        if (frame.chars > 0) log(`  chars:    ${frame.chars}`);

      }
      return true;
    }

    // ── Seek ────────────────────────────────────────────────────────────
    case 'seek': {
      const t = parseFloat(arg);
      if (isNaN(t) || t < 0) return fail('usage: scene seek <seconds>');
      runtime.seek((runtime as any)._s, t, true);
      log(`seeked to ${t.toFixed(2)}s`);
      return true;
    }

    // ── Play / Pause / Stop ─────────────────────────────────────────────
    case 'play': {
      runtime.resume((runtime as any)._s);
      log('playing');
      return true;
    }
    case 'pause': {
      runtime.stopTour((runtime as any)._s);
      log('paused');
      return true;
    }
    case 'stop': {
      runtime.stopTour((runtime as any)._s);
      runtime.tourT = 0;
      log('stopped');
      return true;
    }

    // ── Set ─────────────────────────────────────────────────────────────
    case 'set': {
      const eqIdx = arg.indexOf('=');
      if (eqIdx < 0) return fail('usage: scene set <id>.<prop> = <json-value>');
      const target = arg.slice(0, eqIdx).trim();
      const jsonVal = arg.slice(eqIdx + 1).trim();
      let val: any;
      try { val = JSON.parse(jsonVal); } catch { val = jsonVal; }

      const dotIdx = target.indexOf('.');
      if (dotIdx < 0) {
        // No dot — treat as param name
        const doc = runtime.getDoc();
        if (!doc.params[target]) return fail(`param "${target}" not found`);
        runtime.setParam(target, val);
        log(`set param ${target} = ${JSON.stringify(val)}`);
        return true;
      }

      const objId = target.slice(0, dotIdx);
      const prop = target.slice(dotIdx + 1);
      const doc = runtime.getDoc();

      if (prop === 'param') {
        // set <paramName> = value (alternative syntax)
        if (!doc.params[objId]) return fail(`param "${objId}" not found`);
        runtime.setParam(objId, val);
        log(`set param ${objId} = ${JSON.stringify(val)}`);
        return true;
      }

      // Object prop modification — e.g. "t0.content = new text" or "r0.fill = [1,0,0,1]"
      const spec = doc.objects[objId] as any;
      if (!spec) return fail(`object "${objId}" not found`);

      if (prop === 'at' && Array.isArray(val) && val.length === 2) {
        spec.at = val as [number, number];
      } else if (prop === 'size' && Array.isArray(val) && val.length === 2) {
        spec.size = val as [number, number];
      } else if (prop === 'content' && typeof val === 'string') {
        spec.content = val;
      } else if (prop === 'color' && Array.isArray(val) && val.length === 4) {
        spec.color = val;
      } else if (prop === 'fill' && Array.isArray(val) && val.length === 4) {
        spec.fill = val;
      } else if (prop === 'opacity' && typeof val === 'number') {
        spec.opacity = val;
      } else if (prop === 'radius' && typeof val === 'number') {
        spec.radius = val;
      } else {
        spec[prop] = val;
      }
      runtime.invalidateCaches?.();
      log(`set ${target} = ${JSON.stringify(val)}`);
      return true;
    }

    // ── Add ─────────────────────────────────────────────────────────────
    case 'add': {
      const kindArg = parts[2];
      const id = parts[3];
      if (!kindArg || !id) return fail('usage: scene add <kind> <id> [json]');
      const jsonStr = parts.slice(4).join(' ');
      const doc = runtime.getDoc();

      if (doc.objects[id]) return fail(`object "${id}" already exists`);

      const extras = jsonStr ? JSON.parse(jsonStr) : {};

      const kinds: Record<string, () => ObjectSpec> = {
        text: () => ({
          kind: 'text', id, content: extras.content ?? '', at: extras.at ?? [0, 0],
          size: extras.size ?? 20, color: extras.color ?? [1, 1, 1, 1],
        } as any),
        rect: () => ({
          kind: 'rect', id, at: extras.at ?? [0, 0], size: extras.size ?? [100, 80],
          fill: extras.fill ?? [0.5, 0.5, 0.5, 1],
        } as any),
        circle: () => ({
          kind: 'circle', id, center: extras.center ?? extras.at ?? [0, 0],
          radius: extras.radius ?? 50, fill: extras.fill ?? [0.5, 0.5, 0.5, 1],
        } as any),
        line: () => ({
          kind: 'line', id, points: extras.points ?? [[0, 0], [100, 0]],
          width: extras.width ?? 2, color: extras.color ?? [1, 1, 1, 1],
        } as any),
        glyph: () => ({
          kind: 'glyph', id, char: extras.char ?? '?', at: extras.at ?? [0, 0],
          size: extras.size ?? 24, color: extras.color ?? [1, 1, 1, 1],
        } as any),
        math: () => ({
          kind: 'math', id, latex: extras.latex ?? 'x^2', at: extras.at ?? [0, 0],
          size: extras.size ?? 24, color: extras.color ?? [1, 1, 1, 1],
        } as any),
        polygon: () => ({
          kind: 'polygon', id, points: extras.points ?? [[0, 0], [100, 0], [50, 80]],
          fill: extras.fill,
        } as any),
      };

      const fn = kinds[kindArg];
      if (!fn) return fail(`unknown kind "${kindArg}" — try text,rect,circle,line,glyph,math,polygon`);

      const spec = fn();
      doc.objects[id] = spec;
      runtime.invalidateCaches?.();
      log(`added ${kindArg} "${id}"`);
      return true;
    }

    // ── Remove ──────────────────────────────────────────────────────────
    case 'remove': {
      if (!arg) return fail('usage: scene remove <id>');
      const doc = runtime.getDoc();
      if (!doc.objects[arg]) return fail(`object "${arg}" not found`);
      delete doc.objects[arg];
      // Also remove clips targeting this object
      doc.clips = doc.clips.filter((c) => c.target !== arg && c.target !== `param:${arg}`);
      runtime.invalidateCaches?.();
      log(`removed "${arg}"`);
      return true;
    }

    // ── Save ────────────────────────────────────────────────────────────
    case 'save': {
      const doc = runtime.getDoc();
      const json = serialize(doc);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (doc.meta.title || 'scene').replace(/\s+/g, '_') + '.windfoil.json';
      a.click();
      URL.revokeObjectURL(url);
      log(`saved ${a.download}`);
      return true;
    }

    // ── Load ────────────────────────────────────────────────────────────
    case 'load': {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.windfoil.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = reader.result as string;
            const newDoc = deserialize(json);
            // Reload the runtime with the new doc
            runtime.reload?.(newDoc);
            log(`loaded "${newDoc.meta.title}"`);
          } catch (e: any) {
            term.writeLine('error: ' + e.message);
          }
        };
        reader.readAsText(file);
      };
      input.click();
      return true;
    }

    // ── Help ────────────────────────────────────────────────────────────
    case 'help': {
      log('scene commands:');
      log('  status                     — show title, counts, duration, time');
      log('  objects                    — list object ids and kinds');
      log('  params                     — list params and current values');
      log('  clips                      — list clips with timing');
      log('  inspect <id>               — print object spec + frame state');
      log('  seek <t>                   — jump to time t (seconds)');
      log('  play / pause / stop        — playback control');
      log('  set <id>.<prop> = <json>   — mutate object or param');
      log('  add <kind> <id> [json]     — add an object (text,rect,circle,line,glyph,math,polygon)');
      log('  remove <id>                — remove object + its clips');
      log('  save                       — download .windfoil.json');
      log('  load                       — open file picker');
      log('  help                       — this message');
      return true;
    }

    default:
      return fail(`unknown command "scene ${cmd}" — try "scene help"`);
  }
}
