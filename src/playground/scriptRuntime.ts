// ── Playground script runtime (POC) ──────────────────────────────────────────
// Manim/Motion-Canvas-style control surface for the in-canvas demos. This POC
// controls the real ExplainerBoard, so terminal snippets and editor scripts
// recreate the exact explainer frames/video rather than a separate mock scene.

import type { AppState } from '../state';
import type { Terminal } from '../editor/terminal';
import { ExplainerBoard, EXPLAINER_CHAPTERS } from './explainer';

export const EXPLAINER_SAMPLE_SCRIPT = `// windfoil scripting POC
// Run this with the ▶ toolbar button, or use terminal commands like:
//   wf frame bitmap
//   wf seek 32
//   wf play

wf.timeline();
wf.explainer();
wf.play();
`;

type Log = (message: string) => void;

export interface WindfoilScriptAPI {
  explainer(): ExplainerBoard;
  chapters(): typeof EXPLAINER_CHAPTERS;
  timeline(): typeof EXPLAINER_CHAPTERS;
  frame(id: string | number): number;
  seek(seconds: number): void;
  play(from?: number): void;
  pause(): void;
  loadSample(): void;
}

export class PlaygroundScriptRuntime {
  private board: ExplainerBoard | null = null;

  constructor(private s: AppState, private log: Log = () => {}) {}

  api(): WindfoilScriptAPI {
    return {
      explainer: () => this.ensureExplainer(),
      chapters: () => EXPLAINER_CHAPTERS,
      timeline: () => this.timeline(),
      frame: (id) => this.frame(id),
      seek: (seconds) => this.seek(seconds),
      play: (from) => this.play(from),
      pause: () => this.pause(),
      loadSample: () => this.loadSample(),
    };
  }

  execute(source: string) {
    const wf = this.api();
    const run = new Function('wf', source);
    run(wf);
  }

  handleTerminal(raw: string, term: Terminal): boolean {
    const [cmd, ...args] = raw.trim().split(/\s+/);
    if (cmd !== 'wf' && cmd !== 'windfoil') return false;
    const sub = (args.shift() || 'help').toLowerCase();
    const log = (message: string) => term.writeLine(message);
    const fail = (message: string) => { term.writeLine('error: ' + message); return true; };

    try {
      switch (sub) {
        case 'help':
          log('windfoil script commands:');
          log('  wf chapters              list explainer chapters');
          log('  wf timeline              show chapter times');
          log('  wf frame <id|index>      recreate one explainer frame');
          log('  wf seek <seconds>        seek the explainer timeline');
          log('  wf play [seconds]        play the exact explainer video');
          log('  wf pause                 pause scripted playback');
          log('  wf sample                load sample script into editor');
          log('  wf run                   execute editor script');
          return true;
        case 'chapters':
          for (const c of EXPLAINER_CHAPTERS) log(`${c.index}: ${c.id} — ${c.title}`);
          return true;
        case 'timeline':
          this.timeline((line) => log(line));
          return true;
        case 'frame': {
          const id = args[0];
          if (!id) return fail('usage: wf frame <id|index>');
          const idx = this.frame(isFinite(Number(id)) ? Number(id) : id);
          log(`frame ${idx}: ${EXPLAINER_CHAPTERS[idx].id}`);
          return true;
        }
        case 'seek': {
          const t = Number(args[0]);
          if (!Number.isFinite(t)) return fail('usage: wf seek <seconds>');
          this.seek(t); log(`seek ${t.toFixed(2)}s`); return true;
        }
        case 'play': {
          const from = args[0] === undefined ? undefined : Number(args[0]);
          if (from !== undefined && !Number.isFinite(from)) return fail('usage: wf play [seconds]');
          this.play(from); log(from === undefined ? 'playing explainer' : `playing from ${from.toFixed(2)}s`); return true;
        }
        case 'pause':
          this.pause(); log('paused'); return true;
        case 'sample':
          this.loadSample(); log('loaded sample script into editor'); return true;
        case 'run':
          this.runEditorScript(); log('executed editor script'); return true;
        default:
          return fail(`unknown wf command: ${sub}`);
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private ensureExplainer(): ExplainerBoard {
    if (!this.board) this.board = new ExplainerBoard();
    this.s.interactive = this.board;
    return this.board;
  }

  private installDemo(board: ExplainerBoard) {
    this.s.demo = {
      running: board.playing,
      toggle: () => { board.playing ? this.pause() : this.play(board.tourT); },
      start: () => this.play(board.tourT),
      stop: () => this.pause(),
      update: (now: number) => {
        if (!board.playing) return;
        board.update(now, this.s);
        if (!board.playing && this.s.demo) this.s.demo.running = false;
      },
    };
  }

  private frame(id: string | number): number {
    const board = this.ensureExplainer();
    const idx = board.frame(this.s, id);
    this.installDemo(board);
    if (this.s.demo) this.s.demo.running = false;
    return idx;
  }

  private seek(seconds: number) {
    const board = this.ensureExplainer();
    board.seek(this.s, seconds);
    this.installDemo(board);
    if (this.s.demo) this.s.demo.running = false;
  }

  private play(from = 0) {
    const board = this.ensureExplainer();
    board.play(this.s, from);
    this.installDemo(board);
    if (this.s.demo) this.s.demo.running = true;
  }

  private pause() {
    const board = this.ensureExplainer();
    board.stopTour(this.s);
    if (this.s.demo) this.s.demo.running = false;
  }

  private timeline(log?: Log) {
    let t = 0;
    const rows = EXPLAINER_CHAPTERS.map((c) => {
      const row = { ...c, start: t, end: t + c.duration };
      t += c.duration;
      return row;
    });
    if (log) for (const r of rows) log(`${r.start.toFixed(1).padStart(5)}s  ${String(r.index).padStart(2)}  ${r.id.padEnd(10)} ${r.title}`);
    else {
      this.log('timeline:');
      for (const r of rows) this.log(`${r.start.toFixed(1)}s ${r.id} — ${r.title}`);
    }
    return EXPLAINER_CHAPTERS;
  }

  private loadSample() {
    const ed = this.s.editor;
    if (!ed) throw new Error('editor is not available');
    ed.selectAll();
    ed.insertText(EXPLAINER_SAMPLE_SCRIPT);
    ed.focused = true;
  }

  private runEditorScript() {
    const ed = this.s.editor;
    if (!ed) throw new Error('editor is not available');
    this.execute(ed.doc.toString());
  }
}

export function createScriptRuntime(s: AppState, log?: Log) {
  return new PlaygroundScriptRuntime(s, log);
}
