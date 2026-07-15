// ── windgraph · math fonts (Phase 6) ─────────────────────────────────────────
// KaTeX font files (TTF only — no KaTeX library) baked into the windfoil atlas
// under prefixed keys so a single draw call renders UI text AND analytic math.
// Prefixes: mi: = Math-Italic (variables/greek), mn: = Main-Regular (digits,
// operators, upright function names, small symbols), sz: = Size2 (big operators
// + large delimiters + radical).

import { loadFont, type FontFace } from '../../windfoil/font';
import type { ExtraFont } from '../../windfoil/bands';

export const MI = 'mi:';   // italic (math variables)
export const MN = 'mn:';   // upright main (numbers/operators/function names)
export const SZ = 'sz:';   // size-2 (big operators/delimiters)

const GREEK_LOWER = 'αβγδεζηθικλμνξοπρστυφχψω';
const GREEK_UPPER = 'ΓΔΘΛΞΠΣΦΨΩ';
const LATIN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Italic font: math variables (latin + greek).
const ITALIC_CHARS = LATIN + GREEK_LOWER + GREEK_UPPER;
// Main upright: digits, punctuation/operators, upright letters (function names),
// and the common small symbols.
const MAIN_CHARS = '0123456789' + LATIN + '+-=()[]{}.,/|<>!:;*?' + '−×÷±∓≤≥≠≈≡→←↔∈∉∀∃∞∂∇√∫∮…⋯·′' + GREEK_UPPER;
// Size-2: big operators, radical, large delimiters, and multiple/contour
// integrals (∬ ∭ ∮) + n-ary union/intersection/coproduct.
const SIZE2_CHARS = '∑∫∏√()[]{}|∬∭∮∐⋃⋂';

export const MATH_FONT_URLS = {
  italic: '/KaTeX_Math-Italic.ttf',
  main: '/KaTeX_Main-Regular.ttf',
  size2: '/KaTeX_Size2-Regular.ttf',
};

export interface MathFonts { italic: FontFace; main: FontFace; size2: FontFace; }

export async function loadMathFonts(): Promise<MathFonts> {
  const [italic, main, size2] = await Promise.all([
    loadFont(MATH_FONT_URLS.italic),
    loadFont(MATH_FONT_URLS.main),
    loadFont(MATH_FONT_URLS.size2),
  ]);
  return { italic, main, size2 };
}

export function mathExtraFonts(f: MathFonts): ExtraFont[] {
  return [
    { font: f.italic, chars: ITALIC_CHARS, prefix: MI },
    { font: f.main, chars: MAIN_CHARS, prefix: MN },
    { font: f.size2, chars: SIZE2_CHARS, prefix: SZ },
  ];
}
