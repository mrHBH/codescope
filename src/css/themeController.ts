// ── Theme controller ─────────────────────────────────────────────────────────
// Owns runtime theme switching: rebuilds the stylesheet, re-reads computed styles
// into the StyledEl tree, refreshes the themed GPU color cache, updates the
// context-menu CSS variables, and rebuilds the baked static buffers. Extracted
// from main.ts so the entry point stays pure wiring.

import type { AppState } from '../state';
import { parseCSS, parseColor } from './engine';
import { palettes, buildCSS } from './theme';

const THEME_CYCLE = ['light', 'dark', 'highContrast'] as const;
const THEME_ICON: Record<string, string> = { light: '🌙', dark: '🔆', highContrast: '☀️' };

export interface ThemeController {
  apply(mode: string): void;
  cycle(): void;
}

// `rebuildStatic` is injected to avoid a precompute→theme import cycle; it's only
// called after the first apply (once the baked buffers exist).
export function createThemeController(
  s: AppState,
  themeStyle: HTMLStyleElement,
  rebuildStatic: (s: AppState) => void,
): ThemeController {
  function apply(mode: string) {
    s.themeMode = mode;
    s.isDark = mode !== 'light';
    const p = palettes[mode] || palettes.light;

    // Stylesheet must be live before we read computed styles below.
    themeStyle.textContent = buildCSS(p);
    s.cssRules = parseCSS(themeStyle.textContent);
    s.themeCol = {
      backdrop: parseColor(p.backdrop), pageBg: parseColor(p.pageBg), prog: parseColor(p.progFill),
      pulse: parseColor(p.pulse), shadow: parseColor(p.shadow), caret: parseColor(p.caret), sel: parseColor(p.sel),
    };
    for (const el of s.styledEls) {
      const cs = getComputedStyle(el.el);
      el.color = parseColor(cs.color);
      el.bg = parseColor(cs.backgroundColor);
      el.curBg = parseColor(cs.backgroundColor);
      el.upper = cs.textTransform === 'uppercase';
      el.textAlign = cs.textAlign || 'left';
    }
    if (s.themeBtn) s.themeBtn.textContent = THEME_ICON[mode] || '🌙';

    // Context-menu CSS variables track the active theme.
    const rs = document.documentElement.style;
    rs.setProperty('--ctx-bg', mode === 'light' ? 'rgba(250,249,245,0.98)' : 'rgba(28,32,48,0.98)');
    rs.setProperty('--ctx-fg', p.fg);
    rs.setProperty('--ctx-border', p.border);
    rs.setProperty('--ctx-accent', p.accent);
    rs.setProperty('--ctx-hover', mode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.09)');

    // Static bg/text colors are baked into the precomputed buffers; rebuild them
    // on runtime theme changes (skipped on the first apply, before they exist).
    if (s.bgByPage.length) rebuildStatic(s);
  }

  function cycle() {
    const i = THEME_CYCLE.indexOf(s.themeMode as any);
    apply(THEME_CYCLE[(i + 1) % THEME_CYCLE.length]);
  }

  return { apply, cycle };
}
