// ── GPU resource retirement tests ────────────────────────────────────────────
// Run with: bun src/windfoil/__test_retire.ts
//
// Guards the "Destroyed texture used in a submit" regression: WebGPU throws and
// black-screens when a resource still referenced by a submitted command buffer
// is destroyed synchronously (the MSAA auto-on / canvas-resize path recreates
// the depth + MSAA targets, and the instance/curve buffers grow on heavy emits).
// The contract: retire() NEVER destroys synchronously — the resource is kept
// alive and destroyed only once the queue drains (onSubmittedWorkDone resolves).

import { Retirer } from './retire';

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function assert(cond: boolean, msg = 'assertion failed') { if (!cond) throw new Error(msg); }

// A fake GPUDevice whose onSubmittedWorkDone resolves on demand (one per drain).
function fakeDevice() {
  const resolvers: (() => void)[] = [];
  const device: any = {
    queue: {
      onSubmittedWorkDone: () => new Promise<void>((r) => { resolvers.push(r); }),
    },
    drain() { resolvers.shift()?.(); },
  };
  return device;
}

function fakeTexture() {
  let destroyed = 0;
  return { tex: { destroy: () => { destroyed++; } } as unknown as GPUTexture, get destroyed() { return destroyed; } };
}

console.log('Retirer tests\n');

test('retire never destroys synchronously (the "Destroyed texture used in a submit" guard)', async () => {
  const d = fakeDevice();
  const t = fakeTexture();
  const r = new Retirer();
  r.retire(d, t.tex, () => t.tex.destroy());
  assert(t.destroyed === 0, 'old texture is NOT destroyed at retire time (still in-flight)');
  // Flush microtasks — retire's promise hasn't been handed a resolution yet.
  await Promise.resolve();
  assert(t.destroyed === 0, 'still alive before the queue drains');
});

test('resource is destroyed only after onSubmittedWorkDone resolves', async () => {
  const d = fakeDevice();
  const t = fakeTexture();
  const r = new Retirer();
  r.retire(d, t.tex, () => t.tex.destroy());
  d.drain();
  await Promise.resolve();
  assert(t.destroyed === 1, 'destroyed once the queue has drained');
});

test('retire(null) is a no-op and dispose() drains immediately', () => {
  const d = fakeDevice();
  const t = fakeTexture();
  const r = new Retirer();
  r.retire(d, null, () => t.tex.destroy());
  assert(t.destroyed === 0, 'null resource ignored');
  r.retire(d, t.tex, () => t.tex.destroy());
  r.dispose();
  assert(t.destroyed === 1, 'dispose destroys pending resources immediately (teardown)');
});

test('multiple retires destroy independently as each drains', async () => {
  const d = fakeDevice();
  const a = fakeTexture(), b = fakeTexture();
  const r = new Retirer();
  r.retire(d, a.tex, () => a.tex.destroy());
  r.retire(d, b.tex, () => b.tex.destroy());
  d.drain();
  await Promise.resolve();
  d.drain();
  await Promise.resolve();
  assert(a.destroyed === 1 && b.destroyed === 1, 'both destroyed after their queue drain');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} tests failed`);
