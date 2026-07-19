// ── Builder helpers ──────────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v: number) { return clamp(v, 0, 1); }
export function smooth01(v: number) { v = clamp01(v); return v * v * (3 - 2 * v); }
export function bump(v: number) { return Math.sin(clamp01(v) * Math.PI); }
export function rgba(c: number[], a = 1): number[] { return [c[0], c[1], c[2], (c[3] ?? 1) * a]; }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function loop01(t: number, period: number, phase = 0) { return ((t / period + phase) % 1 + 1) % 1; }
export function ping(t: number, period: number, phase = 0) { return 0.5 - 0.5 * Math.cos(loop01(t, period, phase) * Math.PI * 2); }
export function starPoints(cx: number, cy: number, R: number, rot = -Math.PI / 2): [number, number][] {
  const p: [number, number][] = [];
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5; const r = i % 2 ? R * 0.42 : R; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
}
