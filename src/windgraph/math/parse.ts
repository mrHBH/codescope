// ── windgraph · LaTeX-math parser (Phase 6) ──────────────────────────────────
// A focused recursive-descent parser for a math-mode LaTeX subset → an AST the
// box layouter consumes. Supports variables, numbers, operators, {groups},
// ^/_ scripts, \frac, \sqrt, big operators (\sum/\int/\prod) with limits, Greek,
// function names (\sin…), and common symbol macros.

export type Cls = 'var' | 'num' | 'op' | 'rm' | 'open' | 'close' | 'punct' | 'bin' | 'rel';

export type Node =
  | { t: 'row'; items: Node[] }
  | { t: 'char'; ch: string; cls: Cls }
  | { t: 'scripted'; base: Node; sup?: Node; sub?: Node }
  | { t: 'frac'; num: Node; den: Node }
  | { t: 'sqrt'; body: Node }
  | { t: 'bigop'; ch: string; sub?: Node; sup?: Node };

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
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'gcd', 'sinh', 'cosh', 'tanh', 'arg', 'deg']);
const BIGOPS: Record<string, string> = { sum: '∑', int: '∫', prod: '∏', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'thinspace']);

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

  // Parse until a closing '}' or end (or a stop set). Returns a row.
  function parseRow(stopBrace: boolean): Node {
    const items: Node[] = [];
    while (i < s.length) {
      const c = s[i];
      if (c === '}') { if (stopBrace) { i++; return { t: 'row', items }; } i++; continue; }
      if (c === '^' || c === '_') { i++; attachScript(items, c === '^'); continue; }
      const atom = parseAtom();
      if (atom) items.push(atom);
    }
    return { t: 'row', items };
  }

  function attachScript(items: Node[], isSup: boolean) {
    const arg = parseAtom() ?? { t: 'row', items: [] };
    let base = items.pop();
    if (!base) base = { t: 'row', items: [] };
    // Big operators keep limits as sub/sup on themselves.
    if (base.t === 'bigop') { if (isSup) base.sup = arg; else base.sub = arg; items.push(base); return; }
    if (base.t === 'scripted') { if (isSup) base.sup = arg; else base.sub = arg; items.push(base); return; }
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
      // Escaped space/brace or a control symbol.
      if (i < s.length && !/[a-zA-Z]/.test(s[i])) { const ch = s[i++]; if (' ,;:!'.includes(ch)) return null; return { t: 'char', ch, cls: classify(ch) }; }
      const name = readCmd();
      if (name === 'frac') { const num = parseAtom() ?? empty(); const den = parseAtom() ?? empty(); return { t: 'frac', num, den }; }
      if (name === 'sqrt') { const body = parseAtom() ?? empty(); return { t: 'sqrt', body }; }
      if (BIGOPS[name]) return { t: 'bigop', ch: BIGOPS[name] };
      if (GREEK[name]) return { t: 'char', ch: GREEK[name], cls: 'var' };
      if (SYMBOL[name]) return { t: 'char', ch: SYMBOL[name][0], cls: SYMBOL[name][1] };
      if (FUNCS.has(name)) return { t: 'row', items: [...name].map((ch) => ({ t: 'char', ch, cls: 'rm' } as Node)) };
      if (name === 'left' || name === 'right') { if (i < s.length && '()[]{}|.'.includes(s[i])) { const d = s[i++]; if (d === '.') return null; return { t: 'char', ch: d, cls: d === '(' || d === '[' || d === '{' ? 'open' : 'close' }; } return null; }
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
