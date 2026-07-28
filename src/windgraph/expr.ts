// ── windgraph · minimal math expression compiler ─────────────────────────────
// Compiles "a*sin(x) + x^2" to a fast closure over a variable scope. This is
// the seed of the lane-L expression engine (sprint-v2): lists, Σ/Π, piecewise
// will extend this grammar — keep the tokenizer + precedence core reusable.
// Grammar: + - * / ^ (right-assoc), unary -, parentheses, function calls,
// identifiers (variables from scope; pi/e/tau built in). No implicit multiply.

export type ExprFn = (scope: Record<string, number>) => number;

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
  mod: (a, b) => ((a % b) + b) % b,
};

type Tok = { t: 'num' | 'id' | 'op'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const v = src.slice(i, j);
      if (v.split('.').length > 2) throw new Error(`bad number "${v}"`);
      toks.push({ t: 'num', v });
      i = j; continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i;
      while (j < src.length && ((src[j] >= 'a' && src[j] <= 'z') || (src[j] >= 'A' && src[j] <= 'Z') || (src[j] >= '0' && src[j] <= '9') || src[j] === '_')) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    if ('+-*/^(),'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '>' || c === '<' || c === '=' || c === '!') {
      const nx = src[i + 1];
      if (nx === '=') { toks.push({ t: 'op', v: c + '=' }); i += 2; continue; }
      if (c === '=') throw new Error('unexpected "=" (did you mean "=="?)');
      toks.push({ t: 'op', v: c }); i++; continue;
    }
    if ((c === '&' && src[i + 1] === '&') || (c === '|' && src[i + 1] === '|')) {
      toks.push({ t: 'op', v: c + c }); i += 2; continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return toks;
}

const PREC: Record<string, number> = {
  '||': 1, '&&': 2,
  '>': 3, '<': 3, '>=': 3, '<=': 3, '==': 3, '!=': 3,
  '+': 4, '-': 4, '*': 5, '/': 5, '^': 7,
};
const RIGHT_ASSOC = new Set(['^']);

export function compileExpr(src: string): ExprFn {
  const toks = tokenize(src);
  if (toks.length === 0) throw new Error('empty expression');
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];
  const eat = (v: string) => {
    const t = toks[pos++];
    if (!t || t.v !== v) throw new Error(`expected "${v}"`);
  };

  function binary(minPrec: number): ExprFn {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op' || PREC[t.v] === undefined || PREC[t.v] < minPrec) return left;
      const op = t.v;
      pos++;
      const right = binary(RIGHT_ASSOC.has(op) ? PREC[op] : PREC[op] + 1);
      const l = left, r = right;
      switch (op) {
        case '+': left = (s) => l(s) + r(s); break;
        case '-': left = (s) => l(s) - r(s); break;
        case '*': left = (s) => l(s) * r(s); break;
        case '/': left = (s) => l(s) / r(s); break;
        case '^': left = (s) => Math.pow(l(s), r(s)); break;
        case '>': left = (s) => (l(s) > r(s) ? 1 : 0); break;
        case '<': left = (s) => (l(s) < r(s) ? 1 : 0); break;
        case '>=': left = (s) => (l(s) >= r(s) ? 1 : 0); break;
        case '<=': left = (s) => (l(s) <= r(s) ? 1 : 0); break;
        case '==': left = (s) => (l(s) === r(s) ? 1 : 0); break;
        case '!=': left = (s) => (l(s) !== r(s) ? 1 : 0); break;
        case '&&': left = (s) => (l(s) !== 0 && r(s) !== 0 ? 1 : 0); break;
        case '||': left = (s) => (l(s) !== 0 || r(s) !== 0 ? 1 : 0); break;
      }
    }
  }

  function unary(): ExprFn {
    const t = peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) {
      pos++;
      const operand = binary(6); // binds tighter than * / , looser than ^
      if (t.v === '-') return (s) => -operand(s);
      if (t.v === '!') return (s) => (operand(s) !== 0 ? 0 : 1);
      return operand;
    }
    return primary();
  }

  function primary(): ExprFn {
    const t = toks[pos++];
    if (!t) throw new Error('unexpected end of expression');
    if (t.t === 'num') {
      const v = parseFloat(t.v);
      return () => v;
    }
    if (t.t === 'id') {
      const fn = FUNCS[t.v];
      const nxt = peek();
      if (fn && nxt && nxt.v === '(') {
        pos++;
        const args: ExprFn[] = [binary(0)];
        while (peek()?.v === ',') { pos++; args.push(binary(0)); }
        eat(')');
        return (s) => fn(...args.map((a) => a(s)));
      }
      if (nxt && nxt.v === '(') throw new Error(`unknown function "${t.v}"`);
      const name = t.v;
      return (s) => s[name] ?? CONSTS[name] ?? NaN;
    }
    if (t.v === '(') {
      const inner = binary(0);
      eat(')');
      return inner;
    }
    throw new Error(`unexpected "${t.v}"`);
  }

  const fn = binary(0);
  if (pos < toks.length) throw new Error(`unexpected "${toks[pos].v}"`);
  return fn;
}

/** Validation helper: null on success, error message on failure. */
export function checkExpr(src: string): string | null {
  try { compileExpr(src); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}
