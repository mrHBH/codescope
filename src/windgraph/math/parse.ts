// ── windgraph · LaTeX-math parser (Phase 6) ──────────────────────────────────
// A focused recursive-descent parser for a math-mode LaTeX subset → an AST the
// box layouter consumes. Supports variables, numbers, operators, {groups},
// ^/_ scripts, \frac, \sqrt, big operators (\sum/\int/\prod) with limits, Greek,
// function names (\sin…), and common symbol macros.

export type Cls = 'var' | 'num' | 'op' | 'rm' | 'open' | 'close' | 'punct' | 'bin' | 'rel';

export type Node =
  | { t: 'row'; items: Node[] }
  | { t: 'char'; ch: string; cls: Cls }
  | { t: 'func'; name: string }
  | { t: 'limop'; name: string; sub?: Node; sup?: Node }
  | { t: 'space'; w: number }
  | { t: 'limits'; over: boolean }
  | { t: 'scripted'; base: Node; sup?: Node; sub?: Node }
  | { t: 'frac'; num: Node; den: Node }
  | { t: 'sqrt'; body: Node }
  | { t: 'bigop'; ch: string; sub?: Node; sup?: Node; mult?: number; over?: boolean }
  | { t: 'leftright'; open: string; close: string; body: Node }
  | { t: 'matrix'; rows: Node[][]; open: string; close: string }
  | { t: 'cases'; rows: Node[][] }
  | { t: 'align'; rows: Node[][]; numbered: boolean }
  | { t: 'accent'; accent: 'hat' | 'bar' | 'vec' | 'tilde' | 'dot'; body: Node }
  | { t: 'brace'; over: boolean; body: Node; label?: Node }
  | { t: 'xarrow'; dir: '→' | '←'; text?: Node; label?: Node };

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const SYMBOL: Record<string, [string, Cls]> = {
  cdot: ['·', 'bin'], times: ['×', 'bin'], div: ['÷', 'bin'], pm: ['±', 'bin'], mp: ['∓', 'bin'],
  leq: ['≤', 'rel'], le: ['≤', 'rel'], geq: ['≥', 'rel'], ge: ['≥', 'rel'], neq: ['≠', 'rel'], ne: ['≠', 'rel'],
  to: ['→', 'rel'], rightarrow: ['→', 'rel'], leftarrow: ['←', 'rel'], leftrightarrow: ['↔', 'rel'],
  in: ['∈', 'rel'], notin: ['∉', 'rel'], infty: ['∞', 'var'], partial: ['∂', 'var'], nabla: ['∇', 'var'],
  approx: ['≈', 'rel'], equiv: ['≡', 'rel'], cdots: ['⋯', 'punct'], ldots: ['…', 'punct'], prime: ['′', 'op'],
};
// Inline functions (scripts to the side). Limit-style operators (scripts ABOVE/
// BELOW in display mode) are handled separately as `limop`.
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'sinh', 'cosh', 'tanh', 'arg', 'deg']);
const LIMOPS: Record<string, string> = { lim: 'lim', max: 'max', min: 'min', sup: 'sup', inf: 'inf', det: 'det', gcd: 'gcd', limsup: 'lim sup', liminf: 'lim inf', Pr: 'Pr' };
const BIGOPS: Record<string, string> = { sum: '∑', int: '∫', prod: '∏', oint: '∮', bigcup: '⋃', bigcap: '⋂', coprod: '∐' };
const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'thinspace']);
const ACCENTS = new Set(['hat', 'bar', 'vec', 'tilde', 'dot', 'ddot', 'breve', 'check', 'acute', 'grave']);
const MATRIX_ENVS: Record<string, [string, string]> = {
  matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], smallmatrix: ['', ''],
};

function classify(ch: string): Cls {
  if (/[0-9.]/.test(ch)) return 'num';
  if (/[a-zA-Z]/.test(ch)) return 'var';
  if ('+-−*'.includes(ch)) return 'bin';
  if ('=<>≤≥≠≈≡→←↔∈'.includes(ch)) return 'rel';
  if ('([{'.includes(ch)) return 'open';
  if (')]}'.includes(ch)) return 'close';
  if (',;:'.includes(ch)) return 'punct';
  return 'op';
}

export function parseMath(src: string): Node {
  let i = 0;
  const s = src;

  function readCmd(): string { let n = ''; while (i < s.length && /[a-zA-Z]/.test(s[i])) n += s[i++]; return n; }

  function skipSpaces() { while (i < s.length && s[i] === ' ') i++; }

  function readDelim(): string {
    skipSpaces();
    if (i >= s.length) return '.';
    if (s[i] === '\\') {
      i++;
      if (i < s.length && !/[a-zA-Z]/.test(s[i])) { const c = s[i++]; return c; }
      const nm = readCmd();
      if (nm === 'lbrace') return '{';
      if (nm === 'rbrace') return '}';
      if (nm === 'vert') return '|';
      if (nm === 'Vert') return '‖';
      if (nm === 'langle') return '⟨';
      if (nm === 'rangle') return '⟩';
      return '.';
    }
    return s[i++];
  }

  function parseLeftRight(open: string): Node {
    const items: Node[] = [];
    for (;;) {
      skipSpaces();
      if (i >= s.length || s[i] === '}') break;
      if (s[i] === '\\') {
        let k = i + 1; let nm = ''; while (k < s.length && /[a-zA-Z]/.test(s[k])) nm += s[k++];
        if (nm === 'right') { i = k; const close = readDelim(); return { t: 'leftright', open, close, body: { t: 'row', items } }; }
      }
      const atom = parseAtom();
      if (atom) items.push(atom);
    }
    return { t: 'leftright', open, close: '.', body: { t: 'row', items } };
  }

  function parseCell(): Node {
    const items: Node[] = [];
    for (;;) {
      skipSpaces();
      if (i >= s.length || s[i] === '&' || s[i] === '}') break;
      if (s[i] === '\\' && s[i + 1] === '\\') break;
      if (s[i] === '\\') {
        let k = i + 1; let nm = ''; while (k < s.length && /[a-zA-Z]/.test(s[k])) nm += s[k++];
        if (nm === 'end') break;
      }
      const atom = parseAtom();
      if (atom) items.push(atom);
    }
    return { t: 'row', items };
  }

  function parseGrid(): Node[][] {
    const rows: Node[][] = [];
    let cells: Node[] = [parseCell()];
    for (;;) {
      skipSpaces();
      if (i < s.length && s[i] === '&') { i++; cells.push(parseCell()); continue; }
      if (i + 1 < s.length && s[i] === '\\' && s[i + 1] === '\\') { i += 2; rows.push(cells); cells = [parseCell()]; continue; }
      break;
    }
    rows.push(cells);
    return rows;
  }

  function consumeEnd() {
    skipSpaces();
    if (i < s.length && s[i] === '\\') {
      let k = i + 1; let nm = ''; while (k < s.length && /[a-zA-Z]/.test(s[k])) nm += s[k++];
      if (nm === 'end') {
        i = k; skipSpaces();
        if (s[i] === '{') { i++; while (i < s.length && s[i] !== '}') i++; if (s[i] === '}') i++; }
      }
    }
  }

  function parseEnv(name: string): Node {
    const grid = parseGrid();
    consumeEnd();
    if (name === 'cases' || name === 'dcases') return { t: 'cases', rows: grid };
    if (name === 'align' || name === 'align*' || name === 'aligned') return { t: 'align', rows: grid, numbered: name === 'align' };
    const dm = MATRIX_ENVS[name] ?? ['', ''];
    return { t: 'matrix', rows: grid, open: dm[0], close: dm[1] };
  }

  // Parse until a closing '}' or end (or a stop set). Returns a row.
  function parseRow(stopBrace: boolean): Node {
    const items: Node[] = [];
    while (i < s.length) {
      const c = s[i];
      if (c === '}') { if (stopBrace) { i++; return { t: 'row', items }; } i++; continue; }
      if (c === '^' || c === '_') { i++; attachScript(items, c === '^'); continue; }
      const atom = parseAtom();
      if (!atom) continue;
      // \limits / \nolimits modify the preceding big operator's limit placement.
      if (atom.t === 'limits') { const prev = items[items.length - 1]; if (prev && prev.t === 'bigop') prev.over = atom.over; continue; }
      items.push(atom);
    }
    return { t: 'row', items };
  }

  function attachScript(items: Node[], isSup: boolean) {
    const arg = parseAtom() ?? { t: 'row', items: [] };
    let base = items.pop();
    if (!base) base = { t: 'row', items: [] };
    // Big operators + limit-style operators keep scripts as their own limits.
    if (base.t === 'bigop' || base.t === 'limop') { if (isSup) base.sup = arg; else base.sub = arg; items.push(base); return; }
    if (base.t === 'scripted') { if (isSup) base.sup = arg; else base.sub = arg; items.push(base); return; }
    if (base.t === 'brace') { base.label = arg; items.push(base); return; }
    items.push({ t: 'scripted', base, [isSup ? 'sup' : 'sub']: arg } as Node);
  }

  // Parse a single atom/group/command.
  function parseAtom(): Node | null {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) return null;
    const c = s[i];
    if (c === '}') return null;
    if (c === '{') { i++; return parseRow(true); }
    if (c === '\\') {
      i++;
      // Escaped space / control-symbol spacing macros (\, \; \: \! \ ).
      if (i < s.length && !/[a-zA-Z]/.test(s[i])) {
        const ch = s[i++];
        if (ch === ',') return { t: 'space', w: 0.17 };
        if (ch === ':') return { t: 'space', w: 0.22 };
        if (ch === ';') return { t: 'space', w: 0.28 };
        if (ch === ' ') return { t: 'space', w: 0.25 };
        if (ch === '!') return { t: 'space', w: -0.17 };
        return { t: 'char', ch, cls: classify(ch) };
      }
      const name = readCmd();
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const num = parseAtom() ?? empty(); const den = parseAtom() ?? empty(); return { t: 'frac', num, den }; }
      if (name === 'sqrt') { const body = parseAtom() ?? empty(); return { t: 'sqrt', body }; }
      if (name === 'limits') return { t: 'limits', over: true };
      if (name === 'nolimits') return { t: 'limits', over: false };
      if (name === 'iint') return { t: 'bigop', ch: '∬' };
      if (name === 'iiint') return { t: 'bigop', ch: '∭' };
      if (BIGOPS[name]) return { t: 'bigop', ch: BIGOPS[name] };
      if (LIMOPS[name]) return { t: 'limop', name: LIMOPS[name] };
      if (GREEK[name]) return { t: 'char', ch: GREEK[name], cls: 'var' };
      if (SYMBOL[name]) return { t: 'char', ch: SYMBOL[name][0], cls: SYMBOL[name][1] };
      if (FUNCS.has(name)) return { t: 'func', name };
      if (name === 'left') { const open = readDelim(); return parseLeftRight(open); }
      if (name === 'right') { readDelim(); return null; }
      if (name === 'begin') {
        skipSpaces(); let env = '';
        if (s[i] === '{') { i++; while (i < s.length && s[i] !== '}') env += s[i++]; if (s[i] === '}') i++; }
        return parseEnv(env);
      }
      if (ACCENTS.has(name)) { const body = parseAtom() ?? empty(); const a = (name === 'ddot' ? 'dot' : name) as 'hat' | 'bar' | 'vec' | 'tilde' | 'dot'; return { t: 'accent', accent: a, body }; }
      if (name === 'overbrace' || name === 'underbrace') { const body = parseAtom() ?? empty(); return { t: 'brace', over: name === 'overbrace', body }; }
      if (name === 'xrightarrow' || name === 'xleftarrow') {
        let text: Node | undefined;
        skipSpaces();
        if (s[i] === '[') { i++; const items: Node[] = []; while (i < s.length && s[i] !== ']') { const a = parseAtom(); if (a) items.push(a); } if (s[i] === ']') i++; text = { t: 'row', items }; }
        const label = parseAtom() ?? empty();
        return { t: 'xarrow', dir: name === 'xrightarrow' ? '→' : '←', text, label };
      }
      if (name === 'quad') return { t: 'space', w: 1.0 };
      if (name === 'qquad') return { t: 'space', w: 2.0 };
      if (name === 'thinspace' || name === 'thin') return { t: 'space', w: 0.17 };
      if (SPACES.has(name)) return null;
      if (name === 'mathrm' || name === 'operatorname' || name === 'text') { const g = parseAtom() ?? empty(); return rmify(g); }
      // Unknown command → render its name upright (best effort).
      if (name) return { t: 'row', items: [...name].map((ch) => ({ t: 'char', ch, cls: 'rm' } as Node)) };
      return null;
    }
    i++;
    return { t: 'char', ch: c, cls: classify(c) };
  }

  function empty(): Node { return { t: 'row', items: [] }; }
  function rmify(n: Node): Node {
    if (n.t === 'char') return { t: 'char', ch: n.ch, cls: 'rm' };
    if (n.t === 'row') return { t: 'row', items: n.items.map(rmify) };
    return n;
  }

  return parseRow(false);
}
