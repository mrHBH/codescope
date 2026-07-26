export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function remap(v: number, inLo: number, inHi: number, outLo: number, outHi: number): number {
  return outLo + (outHi - outLo) * ((v - inLo) / (inHi - inLo || 1e-9));
}
