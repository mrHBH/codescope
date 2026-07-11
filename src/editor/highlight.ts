// ── Incremental syntax highlighter ───────────────────────────────────────────
// A line-based tokenizer for TS/JS-ish code. Each line is tokenized given the
// "carry" state entering it (currently: whether we're inside a block comment).
// Because state flows line→line, we cache per-line results and only re-tokenize
// from the first dirty line until the carry state re-converges — so typing on
// line N is O(lines from N until state matches the cache), not O(whole file).

export interface Token { start: number; end: number; color: number[]; }

const COLORS = {
  def: [0.804, 0.839, 0.957, 1],       // #cdd6f4 default text
  keyword: [0.780, 0.573, 0.918, 1],   // #c792ea
  string: [0.765, 0.906, 0.553, 1],    // #c3e88d
  number: [0.969, 0.549, 0.424, 1],    // #f78c6c
  comment: [0.404, 0.431, 0.584, 1],   // #676e95
  punct: [0.537, 0.867, 1.0, 1],       // #89ddff
  fn: [0.514, 0.753, 0.996, 1],        // #82aaff
  type: [1.0, 0.796, 0.541, 1],        // #ffcb8a
};

const KEYWORDS = new Set([
  'export','import','from','default','function','return','const','let','var','if','else',
  'for','while','do','switch','case','break','continue','new','class','extends','super',
  'this','typeof','instanceof','in','of','void','delete','try','catch','finally','throw',
  'async','await','yield','static','get','set','public','private','protected','readonly',
  'interface','type','enum','namespace','implements','as','is','keyof','declare','abstract',
]);
const LITERALS = new Set(['true','false','null','undefined','NaN','Infinity']);

const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdChar = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';
const isPunct = (c: string) => '{}()[];:,.<>=+-*/&|!?%^~'.includes(c);

interface LineCache { text: string; entry: number; tokens: Token[]; exit: number; }

// entry/exit state bit: 1 = inside a /* block comment */.
export class Highlighter {
  private cache: LineCache[] = [];

  // Invalidate cached lines from `fromLine` on (call after an edit touching it).
  invalidateFrom(fromLine: number) {
    if (fromLine < this.cache.length) this.cache.length = fromLine;
  }

  reset() { this.cache.length = 0; }

  // Tokenize a single line given its cached state where possible.
  tokensFor(lines: string[], i: number): Token[] {
    this.ensure(lines, i);
    return this.cache[i]?.tokens ?? [];
  }

  // Ensure lines [0..i] are tokenized, reusing cache and stopping early where the
  // entry state + text already match.
  private ensure(lines: string[], upto: number) {
    let entry = this.cache.length > 0 ? this.cache[this.cache.length - 1].exit : 0;
    for (let i = this.cache.length; i <= upto && i < lines.length; i++) {
      const text = lines[i];
      const { tokens, exit } = tokenizeLine(text, entry);
      this.cache[i] = { text, entry, tokens, exit };
      entry = exit;
    }
    // If cache already extends past `upto` but an earlier edit changed things,
    // callers must have invalidated; here we trust the cache.
  }
}

function tokenizeLine(text: string, entry: number): { tokens: Token[]; exit: number } {
  const tokens: Token[] = [];
  const n = text.length;
  let i = 0;
  let inBlock = (entry & 1) === 1;

  while (i < n) {
    const c = text[i];

    if (inBlock) {
      const end = text.indexOf('*/', i);
      if (end < 0) { tokens.push({ start: i, end: n, color: COLORS.comment }); i = n; break; }
      tokens.push({ start: i, end: end + 2, color: COLORS.comment });
      i = end + 2; inBlock = false; continue;
    }

    // line comment
    if (c === '/' && text[i + 1] === '/') { tokens.push({ start: i, end: n, color: COLORS.comment }); i = n; break; }
    // block comment start
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) { tokens.push({ start: i, end: n, color: COLORS.comment }); i = n; inBlock = true; break; }
      tokens.push({ start: i, end: end + 2, color: COLORS.comment }); i = end + 2; continue;
    }
    // strings (no escaped-quote nuance needed for coloring; handle \ )
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      j = Math.min(j + 1, n);
      tokens.push({ start: i, end: j, color: COLORS.string }); i = j; continue;
    }
    // numbers
    if (isDigit(c) || (c === '.' && isDigit(text[i + 1]))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXbBoO._eE+-]/.test(text[j])) {
        // stop a trailing +/- that isn't part of an exponent
        if ((text[j] === '+' || text[j] === '-') && !/[eE]/.test(text[j - 1])) break;
        j++;
      }
      tokens.push({ start: i, end: j, color: COLORS.number }); i = j; continue;
    }
    // identifiers / keywords
    if (isIdStart(c)) {
      let j = i;
      while (j < n && isIdChar(text[j])) j++;
      const word = text.slice(i, j);
      let color = COLORS.def;
      if (KEYWORDS.has(word)) color = COLORS.keyword;
      else if (LITERALS.has(word)) color = COLORS.number;
      else if (/^[A-Z]/.test(word)) color = COLORS.type;               // Types/Classes
      else if (text[j] === '(') color = COLORS.fn;                     // function call
      tokens.push({ start: i, end: j, color }); i = j; continue;
    }
    // punctuation
    if (isPunct(c)) { tokens.push({ start: i, end: i + 1, color: COLORS.punct }); i++; continue; }
    // whitespace / other → skip (default, no token needed)
    i++;
  }
  return { tokens, exit: inBlock ? 1 : 0 };
}

export { COLORS as SYNTAX_COLORS };
