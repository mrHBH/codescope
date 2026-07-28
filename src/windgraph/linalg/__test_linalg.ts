// ── Linear algebra tests (Lane D) ───────────────────────────────────────────
// Run with: bun src/windgraph/linalg/__test_linalg.ts

import {
  mat2, identity2, applyMat2, det2, transpose2, inverse2, mulMat2,
  rotation2, scale2, shear2, transformGrid, parallelogramArea, parallelogramVertices, trace2,
} from './matrix';
import { eigen2, invariantLines, isEigenline, powerIteration } from './eigen';
import { dot2, dot3, cross3, norm2, norm3, project2, project3, projectionLength, angleBetween2, parallelepipedVolume, normalize2 } from './products';
import { gramSchmidt2, gramSchmidtSteps, svd2, svdRotationAngle, changeOfBasis2, changeOfBasisMatrix } from './decomp';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function approx(a: number, b: number, eps = 1e-6) { if (Math.abs(a - b) > eps) throw new Error(`approx: ${a} !== ${b} (eps ${eps})`); }

console.log('Linear algebra tests (Lane D)\n');

// D1: Matrix transforms the plane
test('D1 identity leaves vector unchanged', () => {
  const v = applyMat2(identity2(), [3, 7]);
  approx(v[0], 3); approx(v[1], 7);
});
test('D1 rotation by 90°', () => {
  const v = applyMat2(rotation2(Math.PI / 2), [1, 0]);
  approx(v[0], 0); approx(v[1], 1);
});
test('D1 scale by 2', () => {
  const v = applyMat2(scale2(2), [3, 4]);
  approx(v[0], 6); approx(v[1], 8);
});
test('D1 transform grid produces lines + basis', () => {
  const g = transformGrid(rotation2(Math.PI / 4), 2, 1);
  assert(g.lines.length > 0);
  approx(norm2(g.basisI), 1);
  approx(norm2(g.basisJ), 1);
});
test('D1 shear transforms correctly', () => {
  const v = applyMat2(shear2(1, 0), [0, 1]);
  approx(v[0], 1); approx(v[1], 1);
});

// D2: Determinant
test('D2 det of identity = 1', () => approx(det2(identity2()), 1));
test('D2 det of rotation = 1', () => approx(det2(rotation2(0.7)), 1));
test('D2 det of scale(2) = 4', () => approx(det2(scale2(2)), 4));
test('D2 det of singular matrix = 0', () => approx(det2(mat2(1, 2, 2, 4)), 0));
test('D2 parallelogram area = |det|', () => {
  const m = mat2(3, 1, 0, 2);
  approx(Math.abs(parallelogramArea(m)), 6);
});
test('D2 parallelogram vertices form closed shape', () => {
  const m = mat2(2, 1, 0, 3);
  const v = parallelogramVertices(m);
  assert(v.length === 4);
  approx(v[0][0], 0); approx(v[0][1], 0);
});
test('D2 negative det = orientation flip', () => {
  const m = mat2(1, 0, 0, -1);
  assert(det2(m) < 0);
});

// D3: Eigenvectors
test('D3 eigenvalues of diagonal matrix', () => {
  const { values, real } = eigen2(mat2(3, 0, 0, 5));
  assert(real);
  const sorted = [...values].sort((a, b) => b - a);
  approx(sorted[0], 5); approx(sorted[1], 3);
});
test('D3 eigenvectors of diagonal matrix are axes', () => {
  const { vectors, values, real } = eigen2(mat2(3, 0, 0, 5));
  assert(real);
  const idx = values[0] > values[1] ? 0 : 1;
  assert(Math.abs(vectors[idx][1]) < 0.01 || Math.abs(vectors[idx][0]) < 0.01);
});
test('D3 rotation has no real eigenvectors', () => {
  const { real } = eigen2(rotation2(Math.PI / 3));
  assert(!real);
});
test('D3 invariant lines', () => {
  const lines = invariantLines(mat2(2, 1, 0, 3));
  assert(lines.length === 2);
});
test('D3 isEigenline check', () => {
  const m = mat2(2, 0, 0, 3);
  assert(isEigenline(m, [1, 0]));
  assert(isEigenline(m, [0, 1]));
  assert(!isEigenline(m, [1, 1]));
});
test('D3 power iteration finds dominant eigenvalue', () => {
  const { value } = powerIteration(mat2(4, 1, 0, 2));
  approx(value, 4, 0.01);
});

// D4: Matrix multiplication as composition
test('D4 mul identity', () => {
  const m = mat2(2, 3, 4, 5);
  const r = mulMat2(identity2(), m);
  approx(r[0], 2); approx(r[1], 3); approx(r[2], 4); approx(r[3], 5);
});
test('D4 composition applies in order', () => {
  const rot = rotation2(Math.PI / 2);
  const scl = scale2(2);
  const composed = mulMat2(scl, rot);
  const v = applyMat2(composed, [1, 0]);
  approx(v[0], 0); approx(v[1], 2);
});
test('D4 inverse undoes transform', () => {
  const m = mat2(2, 1, 1, 1);
  const inv = inverse2(m)!;
  assert(inv !== null);
  const r = mulMat2(m, inv);
  approx(r[0], 1); approx(r[1], 0); approx(r[2], 0); approx(r[3], 1);
});
test('D4 trace', () => approx(trace2(mat2(3, 1, 2, 7)), 10));
test('D4 transpose', () => {
  const t = transpose2(mat2(1, 2, 3, 4));
  approx(t[0], 1); approx(t[1], 3); approx(t[2], 2); approx(t[3], 4);
});

// D5: Dot/cross products
test('D5 dot product', () => approx(dot2([1, 2], [3, 4]), 11));
test('D5 dot product perpendicular = 0', () => approx(dot2([1, 0], [0, 1]), 0));
test('D5 cross product magnitude = area', () => {
  const c = cross3([1, 0, 0], [0, 1, 0]);
  approx(c[2], 1);
});
test('D5 projection', () => {
  const p = project2([3, 4], [1, 0]);
  approx(p[0], 3); approx(p[1], 0);
});
test('D5 projection length', () => {
  approx(projectionLength([3, 4], [1, 0]), 3);
});
test('D5 angle between perpendicular = π/2', () => {
  approx(angleBetween2([1, 0], [0, 1]), Math.PI / 2);
});
test('D5 parallelepiped volume', () => {
  approx(parallelepipedVolume([1, 0, 0], [0, 1, 0], [0, 0, 1]), 1);
  approx(parallelepipedVolume([2, 0, 0], [0, 3, 0], [0, 0, 4]), 24);
});
test('D5 3D dot product', () => approx(dot3([1, 2, 3], [4, 5, 6]), 32));

// D6: Decompositions
test('D6 gram-schmidt produces orthonormal basis', () => {
  const basis = gramSchmidt2([[1, 1], [1, 0]]);
  approx(norm2(basis[0]), 1);
  approx(norm2(basis[1]), 1);
  approx(dot2(basis[0], basis[1]), 0);
});
test('D6 gram-schmidt steps', () => {
  const steps = gramSchmidtSteps([[3, 0], [1, 2]]);
  assert(steps.length === 2);
  approx(norm2(steps[0].result), 1);
  approx(dot2(steps[0].result, steps[1].result), 0, 1e-6);
});
test('D6 SVD reconstructs matrix', () => {
  const m = mat2(3, 1, 0, 2);
  const { U, S, V } = svd2(m);
  const sigma = mat2(S[0], 0, 0, S[1]);
  const reconstructed = mulMat2(mulMat2(U, sigma), transpose2(V));
  approx(reconstructed[0], m[0], 1e-4);
  approx(reconstructed[1], m[1], 1e-4);
  approx(reconstructed[2], m[2], 1e-4);
  approx(reconstructed[3], m[3], 1e-4);
});
test('D6 SVD singular values non-negative', () => {
  const { S } = svd2(mat2(1, 2, 3, 4));
  assert(S[0] >= 0 && S[1] >= 0);
  assert(S[0] >= S[1]);
});
test('D6 SVD rotation angles', () => {
  const { thetaU, thetaV, scales } = svdRotationAngle(rotation2(0.5));
  approx(scales[0], 1, 1e-4);
  approx(scales[1], 1, 1e-4);
});
test('D6 change of basis identity', () => {
  const v = changeOfBasis2([3, 4], [[1, 0], [0, 1]], [[1, 0], [0, 1]]);
  approx(v[0], 3); approx(v[1], 4);
});
test('D6 change of basis to rotated', () => {
  const from: [[number, number], [number, number]] = [[1, 0], [0, 1]];
  const to: [[number, number], [number, number]] = [[0, 1], [-1, 0]];
  const v = changeOfBasis2([1, 0], from, to);
  approx(v[0], 0, 1e-6); approx(v[1], 1, 1e-6);
});
test('D6 change of basis matrix', () => {
  const m = changeOfBasisMatrix([[1, 0], [0, 1]], [[2, 0], [0, 2]]);
  approx(m[0], 0.5); approx(m[3], 0.5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
