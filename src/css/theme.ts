// ── Theme ─────────────────────────────────────────────────────────────────
// The yasmineOS "reference design system" — a VS Code-style dark component
// catalog. Concrete colors are emitted here so the JS CSS engine can resolve
// :hover/:active live. The renderer draws backgrounds, borders, and text, so the
// stylesheet must carry real layout + colors (the browser measures boxes from it).
//
// The design is a single dark theme; the three cycle slots (light/dark/highContrast)
// map to tuned variants of the same token set so the theme button stays meaningful.

export interface Palette { [k:string]:string }

// Shared reference tokens. Each palette overrides a few for its variant.
function ref(over: Partial<Record<string,string>> = {}): Palette {
  return {
    // Core surfaces
    bg: '#252526', bgAlt: '#2d2d30', border: '#333333',
    text: '#cccccc', textDim: '#888888',
    accent: '#007acc', accentHover: '#0098ff', accent2: '#9d4edd',
    success: '#3fb950', danger: '#d9534f', dangerHover: '#e06560', warn: '#f0ad4e',
    cardBg: 'rgba(255,255,255,0.08)', codeBg: 'rgba(255,255,255,0.06)',
    // Button face colour the analytic hover effects lerp toward (frame.ts renderHoverFx).
    hovFace: '#3a3d43',
    // Backdrop behind the page(s)
    backdrop: '#1a1a1b',
    // Keys the theme controller / renderer read directly:
    pageBg: '#252526', fg: '#cccccc', caret: '#cccccc', sel: '#264f78',
    shadow: 'rgba(0,0,0,0.4)', progFill: '#007acc', pulse: '#3fb950',
    ...over,
  };
}

export const palettes: Record<string,Palette> = {
  // Canonical reference (dark).
  dark: ref(),
  // Slightly deeper / higher-contrast variant.
  highContrast: ref({
    bg: '#1b1b1c', bgAlt: '#232326', border: '#4a4a4a',
    text: '#ffffff', textDim: '#a0a0a0', backdrop: '#0e0e0f', pageBg: '#1b1b1c',
    fg: '#ffffff', caret: '#ffffff', hovFace: '#34343b',
  }),
  // "light" slot: a warm-grey take that keeps the same structure (still dark-on
  // surfaces — a true light variant for daytime readability.
  light: ref({
    bg: '#f5f6f8', bgAlt: '#eceef2', border: '#cfd5df',
    text: '#1f2430', textDim: '#5f6777',
    accent: '#0b66d1', accentHover: '#2580ec', accent2: '#6f42c1',
    success: '#1f9d55', danger: '#c0392b', dangerHover: '#d64a3a', warn: '#bf8b00',
    cardBg: 'rgba(17,24,39,0.06)', codeBg: 'rgba(17,24,39,0.08)',
    backdrop: '#e7ebf2', pageBg: '#f5f6f8', fg: '#1f2430', caret: '#1f2430', sel: '#b8d3f6',
    shadow: 'rgba(15,23,42,0.22)', progFill: '#0b66d1', pulse: '#1f9d55', hovFace: '#ffffff',
  }),
};

export function buildCSS(p: Palette): string {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }

.page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: ${p.bg}; color: ${p.text};
  width: 100%; padding: 24px 32px 40px; margin: 0 0 90px; font-size: 13px;
}

/* Layout */
.reference-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.reference-inline-row { display: flex; gap: 8px; align-items: stretch; width: 100%; }
.reference-inline-row .reference-field { flex: 1 1 0%; min-width: 0; margin-bottom: 0; }
.button-row { display: flex; gap: 8px; margin-bottom: 12px; width: 100%; flex-wrap: wrap; }
.reference-separator-horizontal { width: 100%; height: 1px; background: ${p.border}; margin: 16px 0; }
.reference-separator-vertical { width: 1px; background: rgba(255,255,255,0.05); margin: 0 12px; align-self: stretch; min-height: 32px; }

/* Typography */
.reference-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: ${p.textDim}; font-weight: 600; margin-bottom: 8px; }
.fc-field { color: ${p.text}; font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
.fc-field code, code { font-family: Consolas, Monaco, monospace; background: ${p.codeBg}; padding: 1px 5px; font-size: 11px; color: ${p.text}; }
.audio-player-header, .app-header { padding: 16px 0 12px 0; margin-bottom: 16px; border-bottom: 1px solid ${p.border}; }
.audio-player-title, .app-title { font-size: 28px; font-weight: 600; color: ${p.fg}; letter-spacing: -0.5px; }
.audio-player-subtitle, .app-subtitle { margin-top: 6px; color: ${p.textDim}; font-size: 14px; }
.section-title { font-size: 14px; font-weight: 600; margin: 8px 0 4px; color: ${p.text}; }
.section-description { font-size: 12px; color: ${p.textDim}; margin-bottom: 8px; }

/* Buttons */
.reference-btn { font-size: 12px; line-height: 1.2; padding: 7px 12px; font-weight: 500; border: 1px solid ${p.border}; background: ${p.bgAlt}; color: ${p.text}; cursor: pointer; text-align: center; }
.reference-btn:hover { background: ${p.cardBg}; border-color: ${p.accent}; }
.reference-btn:active { background: ${p.cardBg}; border-color: ${p.accent}; }
.reference-btn-primary { background: ${p.accent}; border-color: ${p.accent}; color: #ffffff; }
.reference-btn-primary:hover { background: ${p.accentHover}; border-color: ${p.accentHover}; }
.reference-btn-danger { background: ${p.danger}; border-color: ${p.danger}; color: #ffffff; }
.reference-btn-danger:hover { background: ${p.dangerHover}; border-color: ${p.dangerHover}; }
.reference-btn-accent { background: ${p.accent2}; border-color: ${p.accent2}; color: #ffffff; }
.reference-btn-accent:hover { background: #b166e8; border-color: #b166e8; }
.reference-btn-secondary { background: transparent; border-color: ${p.border}; color: ${p.textDim}; }
.reference-btn-secondary:hover { background: ${p.cardBg}; border-color: ${p.textDim}; color: ${p.text}; }
.reference-btn-ghost { background: transparent; border-color: transparent; color: ${p.textDim}; }
.reference-btn-ghost:hover { background: ${p.cardBg}; color: ${p.text}; }

/* Named analytic hover effects — the distinguishing accent geometry is drawn in
   frame.ts (renderHoverFx); the face colour below is what the frame loop lerps the
   button toward on hover. Placed after .reference-btn:hover so it wins the cascade. */
.hov-lift:hover, .hov-sweep:hover, .hov-underline:hover, .hov-glow:hover,
.hov-border:hover, .hov-topbar:hover, .hov-ring:hover, .hov-corners:hover { background: ${p.hovFace}; }

/* Inputs */
.reference-input { width: 100%; padding: 7px 10px; font-size: 12px; color: ${p.text}; background: ${p.bg}; border: 1px solid ${p.border}; }
.reference-input:hover { background: ${p.bgAlt}; }
.reference-input:focus { border-color: ${p.accent}; }
.reference-textarea { display: block; width: 100%; min-height: 96px; padding: 8px 10px; font-size: 12px; line-height: 1.5; color: ${p.text}; background: ${p.bg}; border: 1px solid ${p.border}; font-family: Consolas, Monaco, monospace; }
.reference-textarea:hover { background: ${p.bgAlt}; }

/* Dropdown */
.reference-dropdown-wrapper { display: inline-block; width: max-content; }
.reference-dropdown-btn { font-size: 12px; padding: 7px 12px; border: 1px solid ${p.border}; background: ${p.bgAlt}; color: ${p.text}; display: flex; align-items: center; gap: 8px; min-width: 160px; cursor: pointer; }
.reference-dropdown-btn:hover { border-color: ${p.accent}; }
.dropdown-text { flex: 1; }
.dropdown-chevron { display: inline-block; width: 12px; height: 12px; color: ${p.textDim}; }
.reference-sub-tabs-inline { display: none; margin-top: 2px; min-width: 160px; background: ${p.bg}; border: 1px solid ${p.border}; }
.reference-dropdown-wrapper.expanded .reference-sub-tabs-inline { display: block; }
.reference-sub-tab-inline { display: block; width: 100%; padding: 7px 12px; background: transparent; color: ${p.text}; font-size: 12px; cursor: pointer; }
.reference-sub-tab-inline:hover { background: ${p.cardBg}; }

/* Sliders */
.seek-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; width: 100%; }
.reference-grid-value, .control-value, .value-display { min-width: 40px; font-size: 11px; color: ${p.accent}; text-align: right; font-weight: 600; font-family: Consolas, Monaco, monospace; }
.reference-slider { position: relative; flex: 1 1 auto; height: 6px; background: ${p.border}; border: 1px solid rgba(255,255,255,0.06); cursor: pointer; }
.reference-slider-fill { position: absolute; left: 0; top: 0; bottom: 0; background: ${p.accent}; }
.reference-slider-thumb { position: absolute; top: -6px; width: 14px; height: 14px; margin-left: -7px; background: ${p.accent}; border: 2px solid ${p.bg}; }
.advanced-grid { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.control-row { display: flex; align-items: center; gap: 10px; padding: 2px 0; width: 100%; }
.control-label { min-width: 64px; font-size: 12px; color: ${p.text}; }

/* Toggles */
.reference-toggle { display: flex; align-items: center; gap: 10px; font-size: 12px; padding: 6px 10px; background: ${p.bg}; border: 1px solid transparent; width: max-content; }
.reference-toggle:hover { background: ${p.cardBg}; border-color: ${p.border}; }
.toggle-box { width: 16px; height: 16px; background: ${p.bg}; border: 1px solid ${p.border}; }
.toggle-box.on { background: ${p.accent}; border-color: ${p.accent}; }
.toggle-label { font-size: 12px; color: ${p.text}; }

/* Cards */
.reference-card { background: ${p.cardBg}; border: 1px solid ${p.border}; padding: 16px; margin-bottom: 16px; }

/* Tabs */
.model-selector-toolbar { display: flex; justify-content: flex-start; align-items: center; background: ${p.backdrop}; padding: 4px; border: 1px solid ${p.border}; margin-bottom: 12px; }
.model-type-buttons { display: flex; }
.model-type-selector { padding: 6px 14px; font-size: 11px; border: 1px solid transparent; background: transparent; color: ${p.text}; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; }
.model-type-selector.active-model-type { background: ${p.backdrop}; border-color: ${p.accent}; color: #ffffff; }
.model-type-selector:hover { background: rgba(255,255,255,0.05); border-color: ${p.accent}; }
.model-content-panel { display: none; }
.model-content-panel.active { display: block; }

/* Status badges */
.status-badge { display: inline-block; padding: 3px 10px; font-size: 11px; font-weight: 600; }
.status-unknown { background: #555555; color: #cccccc; }
.status-ok { background: #2d6a2e; color: #88ffcc; }
.status-error { background: #6a2d2d; color: #ff8888; }
.status-info { background: #2d4a6a; color: #88bbff; }

/* Status LEDs */
.led-row { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.led-item { display: flex; align-items: center; gap: 8px; }
.status-led { width: 10px; height: 10px; }
.status-led.idle { background: ${p.textDim}; }
.status-led.loading { background: ${p.warn}; }
.status-led.ready { background: ${p.success}; }
.status-led.error { background: ${p.danger}; }

.master-status { font-size: 13px; font-weight: 600; padding: 8px 12px; margin-bottom: 8px; border-left: 3px solid ${p.danger}; background: rgba(217,83,79,0.10); color: ${p.danger}; }
.master-status.on { border-left-color: ${p.success}; background: rgba(63,185,80,0.10); color: ${p.success}; }

/* Log container */
.log-container { background: ${p.bgAlt}; border: 1px solid ${p.border}; padding: 6px 10px; font-family: Consolas, Monaco, monospace; font-size: 11px; }
.log-entry { margin: 2px 0; }
.log-success { color: ${p.success}; }
.log-error { color: ${p.danger}; }
.log-info { color: ${p.textDim}; }
.log-warn { color: ${p.warn}; }

/* Stats grid */
.stats-grid { display: flex; gap: 1px; background: ${p.border}; border: 1px solid ${p.border}; flex-wrap: wrap; }
.stat-row { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 10px 14px; background: ${p.bg}; flex: 1 1 200px; }
.stat-name { font-size: 11px; color: ${p.textDim}; text-transform: uppercase; letter-spacing: 0.3px; }
.stat-val { font-size: 14px; font-family: Consolas, Monaco, monospace; color: ${p.text}; font-weight: 600; }

/* Control groups */
.control-group { background: ${p.bgAlt}; border: 1px solid ${p.border}; padding: 14px; margin-bottom: 8px; }
.control-group-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${p.accent}; font-weight: 600; margin-bottom: 10px; display: block; }
.control-group .control-row label { flex: 0 0 150px; font-size: 12px; color: ${p.text}; }

/* Entity grid */
.entity-grid { display: flex; flex-direction: column; gap: 4px; }
.entity-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: ${p.bgAlt}; border: 1px solid ${p.border}; }
.entity-type { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 9px; background: ${p.border}; color: ${p.textDim}; }
.entity-type.zoom-active { background: rgba(0,122,204,0.2); color: ${p.accent}; }
.entity-desc { font-size: 12px; color: ${p.text}; }

/* Progress bars */
.progress-bar-container { height: 8px; background: ${p.bgAlt}; border: 1px solid ${p.border}; }
.progress-bar-fill { height: 100%; background: ${p.accent}; }
.progress-text { font-size: 11px; color: ${p.textDim}; margin-top: 6px; }

/* Header + logo */
.header-with-logo { display: flex; align-items: center; justify-content: space-between; gap: 24px; background: ${p.bgAlt}; padding: 16px; border: 1px solid ${p.border}; }
.header-text { flex: 1; }
.header-logo { display: flex; flex-shrink: 0; }
.header-logo [data-icon] { display: inline-block; width: 48px; height: 48px; color: ${p.accent}; }
.logo-ascii { font-size: 12px; font-family: Consolas, Monaco, monospace; line-height: 1.2; white-space: pre; color: ${p.accent}; }

/* Controls bar */
.controls-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: ${p.bgAlt}; border: 1px solid ${p.border}; }
.controls-group { display: flex; gap: 4px; }
.controls-separator { width: 1px; height: 24px; background: ${p.border}; }
.control-btn { display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: transparent; border: 1px solid transparent; color: ${p.textDim}; font-size: 12px; cursor: pointer; }
.control-btn [data-icon] { display: inline-block; width: 14px; height: 14px; }
.control-btn:hover { color: ${p.text}; background: ${p.cardBg}; border-color: ${p.border}; }
.control-btn.primary { background: ${p.accent}; border-color: ${p.accent}; color: #ffffff; }
.controls-status { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.status-indicator { font-size: 11px; font-family: Consolas, Monaco, monospace; color: ${p.textDim}; padding: 5px 9px; background: ${p.bg}; border: 1px solid ${p.border}; }
.status-indicator.success { color: ${p.success}; border-color: ${p.success}; }
.status-mode { font-size: 10px; font-family: Consolas, Monaco, monospace; color: ${p.accent}; text-transform: uppercase; }

/* Article / blog */
.blog-article { background: ${p.bgAlt}; padding: 20px; border: 1px solid ${p.border}; }
.blog-section h2 { color: ${p.fg}; font-size: 22px; font-weight: 600; margin-bottom: 16px; letter-spacing: -0.3px; }
.blog-section p { margin-bottom: 14px; color: ${p.text}; font-size: 14px; line-height: 1.7; }
.lead { font-size: 16px; color: ${p.text}; line-height: 1.6; }
.insight-block { display: flex; gap: 12px; padding: 16px; background: rgba(0,122,204,0.08); border-left: 3px solid ${p.accent}; margin: 16px 0; }
.insight-marker { width: 8px; height: 8px; background: ${p.accent}; margin-top: 5px; }
.insight-content { flex: 1; font-size: 14px; line-height: 1.6; color: ${p.text}; }
.callout-block { padding: 14px 18px; background: ${p.cardBg}; border: 1px solid ${p.border}; margin: 16px 0; }
.callout-block p { color: ${p.textDim}; font-size: 14px; }
.feature-list { margin: 12px 0; padding-left: 22px; }
.feature-list li { margin-bottom: 10px; color: ${p.text}; font-size: 14px; line-height: 1.5; }

/* Viewport slot */
.viewport-container { background: ${p.bg}; border: 1px solid ${p.border}; width: 340px; max-width: 100%; }
.viewport-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: ${p.bgAlt}; border-bottom: 1px solid ${p.border}; }
.viewport-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${p.textDim}; }
.viewport-slot-label { font-size: 10px; font-family: Consolas, Monaco, monospace; color: ${p.accent}; padding: 2px 7px; background: rgba(0,122,204,0.15); }
.me-container { width: 100%; height: 150px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: ${p.textDim}; font-size: 12px; }
.viewport-footer { display: flex; align-items: center; justify-content: center; padding: 6px 12px; background: ${p.bgAlt}; border-top: 1px solid ${p.border}; }
.viewport-hint { font-size: 10px; color: ${p.textDim}; font-style: italic; }

/* Token swatches */
.token-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.token-swatch { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: ${p.bgAlt}; border: 1px solid ${p.border}; width: 210px; }
.swatch-color { width: 26px; height: 26px; border: 1px solid rgba(255,255,255,0.12); }
.swatch-name { font-size: 10px; color: ${p.textDim}; text-transform: uppercase; letter-spacing: 0.3px; }
.swatch-value { font-size: 11px; font-family: Consolas, Monaco, monospace; color: ${p.text}; }

/* Test runner */
.test-runner { background: ${p.backdrop}; border: 1px solid ${p.border}; }
.test-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: ${p.bgAlt}; border-bottom: 1px solid ${p.border}; }
.test-title { font-size: 13px; font-weight: 600; color: #fff; }
.test-summary { font-size: 12px; color: ${p.success}; padding: 8px 12px; border-bottom: 1px solid ${p.border}; }
.test-list { padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.test-item { display: flex; align-items: center; gap: 10px; background: ${p.bg}; border: 1px solid ${p.border}; padding: 7px 12px; }
.test-item.fail { border-color: ${p.danger}; }
.test-name { flex: 1; font-size: 12px; color: ${p.text}; }
.test-dur { font-size: 10px; color: ${p.textDim}; font-family: Consolas, Monaco, monospace; }
.test-pass { color: ${p.success}; font-weight: 700; }
.test-pass[data-icon], .test-failmark[data-icon] { display: inline-block; width: 14px; height: 14px; }
.test-failmark { color: ${p.danger}; font-weight: 700; }
.test-footer { display: flex; justify-content: space-between; padding: 8px 12px; border-top: 1px solid ${p.border}; font-size: 11px; background: ${p.bg}; }
`;
}
