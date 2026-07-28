// ── Expression compiler tests ────────────────────────────────────────────────
// Run with: bun src/windgraph/__test_expr.ts

import { compileExpr, checkExpr } from './expr';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 1e-9) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b}`); }

console.log('Expr tests\n');

test('precedence: 2+3*4 = 14', () => approx(compileExpr('2+3*4')({}), 14));
test('parens: (2+3)*4 = 20', () => approx(compileExpr('(2+3)*4')({}), 20));
test('division left-assoc: 8/4/2 = 1', () => approx(compileExpr('8/4/2')({}), 1));
test('power right-assoc: 2^3^2 = 512', () => approx(compileExpr('2^3^2')({}), 512));
test('unary minus binds looser than ^: -x^2 at x=3 = -9', () => approx(compileExpr('-x^2')({ x: 3 }), -9));
test('unary in term: 1+-2 = -1', () => approx(compileExpr('1+-2')({}), -1));
test('unary plus: +5 = 5', () => approx(compileExpr('+5')({}), 5));
test('variables: a*x+b', () => approx(compileExpr('a*x+b')({ a: 2, x: 3, b: 1 }), 7));
test('constants: pi, e, tau', () => {
  approx(compileExpr('pi')({}), Math.PI);
  approx(compileExpr('e')({}), Math.E);
  approx(compileExpr('tau/2')({}), Math.PI);
});
test('scope shadows constants', () => approx(compileExpr('pi')({ pi: 1 }), 1));
test('functions: sin/cos/sqrt', () => {
  approx(compileExpr('sin(0)')({}), 0);
  approx(compileExpr('cos(0)')({}), 1);
  approx(compileExpr('sqrt(x)')({ x: 9 }), 3);
});
test('multi-arg functions: max/min/atan2/pow', () => {
  approx(compileExpr('max(1,2,3)')({}), 3);
  approx(compileExpr('min(4,2,5)')({}), 2);
  approx(compileExpr('atan2(0,1)')({}), 0);
  approx(compileExpr('pow(2,10)')({}), 1024);
});
test('mod wraps positive', () => approx(compileExpr('mod(-1,3)')({}), 2));
test('nested: a*sin(x)+x^2', () => {
  const f = compileExpr('a*sin(x)+x^2');
  approx(f({ a: 1, x: 0 }), 0);
  approx(f({ a: 2, x: Math.PI / 2 }), 2 + Math.PI * Math.PI / 4);
});
test('unknown var → NaN', () => assert(Number.isNaN(compileExpr('q')({})), 'expected NaN'));
test('decimal + leading dot: .5 + 1.5 = 2', () => approx(compileExpr('.5+1.5')({}), 2));

test('comparisons return 1/0', () => {
  approx(compileExpr('3 > 2')({}), 1);
  approx(compileExpr('2 > 3')({}), 0);
  approx(compileExpr('2 < 3')({}), 1);
  approx(compileExpr('3 < 2')({}), 0);
  approx(compileExpr('3 >= 3')({}), 1);
  approx(compileExpr('2 >= 3')({}), 0);
  approx(compileExpr('3 <= 3')({}), 1);
  approx(compileExpr('4 <= 3')({}), 0);
  approx(compileExpr('2 == 2')({}), 1);
  approx(compileExpr('2 == 3')({}), 0);
  approx(compileExpr('2 != 3')({}), 1);
  approx(compileExpr('2 != 2')({}), 0);
});

test('logical && || ! treat nonzero as true', () => {
  approx(compileExpr('1 && 1')({}), 1);
  approx(compileExpr('1 && 0')({}), 0);
  approx(compileExpr('3 && 4')({}), 1);
  approx(compileExpr('0 || 1')({}), 1);
  approx(compileExpr('0 || 0')({}), 0);
  approx(compileExpr('!0')({}), 1);
  approx(compileExpr('!5')({}), 0);
  approx(compileExpr('!(1 && 0)')({}), 1);
});

test('comparison precedence: additive binds tighter', () => {
  approx(compileExpr('1 + 2 > 2')({}), 1);   // (1+2) > 2 → 3 > 2
  approx(compileExpr('2 * 3 == 6')({}), 1);
  approx(compileExpr('x^2 > 4')({ x: 3 }), 1); // (x^2) > 4
});

test('logical precedence: && tighter than ||', () => {
  approx(compileExpr('1 || 0 && 0')({}), 1);  // 1 || (0 && 0)
  approx(compileExpr('0 && 0 || 1')({}), 1);  // (0 && 0) || 1
  approx(compileExpr('0 || 1 && 1')({}), 1);
});

test('comparison tighter than logical', () => {
  approx(compileExpr('2 > 1 && 3 > 2')({}), 1);
  approx(compileExpr('2 > 1 && 3 < 2')({}), 0);
});

test('piecewise-style condition over a variable', () => {
  const f = compileExpr('x > 0 && x < 2');
  approx(f({ x: 1 }), 1);
  approx(f({ x: 3 }), 0);
  approx(f({ x: -1 }), 0);
});

test('error: empty', () => assert(checkExpr('') !== null));
test('error: dangling op "2+"', () => assert(checkExpr('2+') !== null));
test('error: unbalanced "sin("', () => assert(checkExpr('sin(') !== null));
test('error: stray close ")"', () => assert(checkExpr(')') !== null));
test('error: adjacent ids "x y"', () => assert(checkExpr('x y') !== null));
test('error: unknown function "foo(1)"', () => assert(checkExpr('foo(1)') !== null));
test('error: bad char "x$"', () => assert(checkExpr('x$') !== null));
test('error: bad number "1.2.3"', () => assert(checkExpr('1.2.3') !== null));
test('error: bare assignment "x = 1"', () => assert(checkExpr('x = 1') !== null));
test('checkExpr: null on success', () => assert(checkExpr('sin(x)^2 + cos(x)^2') === null));
test('checkExpr: null on comparisons', () => assert(checkExpr('x > 0 && x <= 2 || x == -1') === null));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
