// Sample source shown when the editor opens. It exercises the highlighter:
// keywords, types, strings, numbers, line + block comments, and function calls.

export const SAMPLE_CODE = `/*
 * windfoil — analytic GPU text, now with a code editor.
 * Every glyph below is a closed-form winding integral: zoom in and stay sharp.
 */
import { TextDocument } from "./document";
import { Highlighter } from "./highlight";

interface Token {
  start: number;
  end: number;
  color: number[];
}

// A tiny demo: count words per line and log the totals.
export class WordCounter {
  private total = 0;

  constructor(readonly doc: TextDocument) {}

  count(): number {
    for (let i = 0; i < this.doc.lineCount; i++) {
      const line = this.doc.lineText(i);
      const words = line.split(/\\s+/).filter((w) => w.length > 0);
      this.total += words.length;
    }
    return this.total;
  }
}

function fib(n: number): number {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

const editor = new WordCounter(new TextDocument("hello world"));
console.log(\`words = \${editor.count()}, fib(10) = \${fib(10)}\`);

// Try it: click to place the caret, select with the mouse or Shift+arrows,
// type, and press Ctrl+Z / Ctrl+Y to undo and redo. Zoom with the wheel.
`;
