// ── Theme ─────────────────────────────────────────────────────────────────
// Palette definitions + the stylesheet generator. Concrete colors are emitted
// here so the JS CSS engine can resolve :hover/:active pseudo-classes live.

export interface Palette { [k:string]:string }

export const palettes: Record<string,Palette> = {
  light: {
    backdrop:'#e9e6df', pageBg:'#f0ede6', fg:'#1a1a2e', muted:'#4a4a55',
    card:'#ffffff', accent:'#4466cc', accentDark:'#3355bb', accentActive:'#2244aa',
    codeBg:'#1e1e2e', codeFg:'#cdd6f4', tagBg:'#e0d8f0', tagFg:'#5a4a8a',
    callout:'#4a5bbf', cta:'#3a4db0', border:'#d8d2c6', kicker:'#8866aa', link:'#5a4a8a',
    progress:'#d9d3c8', progFill:'#4466cc', pulse:'#2f9e54',
    badgeBg:'#ffffff', badgeBorder:'#ddd6c8', badgeFg:'#444',
    alertBg:'#e3eefc', alertFg:'#1d4ed8', avatarBg:'#4466cc',
    timeline:'#d8d2c6', statusOk:'#2f9e54', shadow:'rgba(0,0,0,0.12)',
    caret:'#1a1a2e', sel:'#9db4ff',
  },
  dark: {
    backdrop:'#090b10', pageBg:'#12151d', fg:'#eef1f7', muted:'#a6adc0',
    card:'#2a3048', accent:'#8fa8ff', accentDark:'#7089f4', accentActive:'#5570dc',
    codeBg:'#0b0d14', codeFg:'#cdd6f4', tagBg:'#38406a', tagFg:'#cdd4ff',
    callout:'#4358cc', cta:'#5568d4', border:'#414a6b', kicker:'#b6a8ff', link:'#c2c9ff',
    progress:'#38406a', progFill:'#8fa8ff', pulse:'#5fe28c',
    badgeBg:'#2a3048', badgeBorder:'#4a5480', badgeFg:'#e2e6f2',
    alertBg:'#1f2b4d', alertFg:'#a6c0ff', avatarBg:'#8fa8ff',
    timeline:'#414a6b', statusOk:'#5fe28c', shadow:'rgba(0,0,0,0.6)',
    caret:'#eef1f7', sel:'#4a5da0',
  },
  highContrast: {
    backdrop:'#000000', pageBg:'#0a0c12', fg:'#ffffff', muted:'#c8cfe0',
    card:'#323a58', accent:'#a6bbff', accentDark:'#8ba3ff', accentActive:'#6f8bf5',
    codeBg:'#05060a', codeFg:'#e6ecff', tagBg:'#454f80', tagFg:'#e0e6ff',
    callout:'#4d63e0', cta:'#5f74e8', border:'#5a6698', kicker:'#c8bcff', link:'#d4d9ff',
    progress:'#454f80', progFill:'#a6bbff', pulse:'#6fff9c',
    badgeBg:'#323a58', badgeBorder:'#5a6698', badgeFg:'#ffffff',
    alertBg:'#243468', alertFg:'#c2d4ff', avatarBg:'#a6bbff',
    timeline:'#5a6698', statusOk:'#6fff9c', shadow:'rgba(0,0,0,0.7)',
    caret:'#ffffff', sel:'#5a70c0',
  },
};

export function buildCSS(p: Palette): string {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
.kicker { font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: ${p.kicker}; margin-bottom: 10px; }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: ${p.muted}; }
.status.ok::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${p.statusOk}; }
.page { font-family: Lato, sans-serif; background: ${p.pageBg}; color: ${p.fg}; padding: 32px 80px 64px; width: 100%; max-width: none; margin: 0 0 90px; border-radius: 0 0 18px 18px; }
.nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; padding-bottom: 18px; border-bottom: 1px solid ${p.border}; }
.brand { font-size: 22px; font-weight: 700; color: ${p.fg}; }
.brand span { color: ${p.accent}; }
.nav-links { display: flex; gap: 22px; }
.nav-links a { font-size: 14px; color: ${p.link}; text-decoration: none; }
.hero { margin-bottom: 44px; }
.hero h1 { font-size: 52px; font-weight: 700; color: ${p.fg}; line-height: 1.05; margin-bottom: 16px; }
.hero h1 em { font-style: normal; color: ${p.accent}; }
.lead { font-size: 19px; line-height: 1.6; color: ${p.muted}; margin-bottom: 22px; max-width: 640px; }
.btn-row { display: flex; gap: 12px; margin-bottom: 28px; }
h2 { font-size: 26px; font-weight: 700; color: ${p.fg}; margin-top: 44px; margin-bottom: 14px; }
p { font-size: 16px; line-height: 1.6; margin-bottom: 16px; }
.highlight { background: ${p.tagBg}; border-left: 4px solid ${p.kicker}; padding: 16px 20px; margin: 24px 0; border-radius: 4px; font-size: 15px; color: ${p.muted}; }
.alert { display: flex; gap: 12px; align-items: center; background: ${p.alertBg}; color: ${p.alertFg}; padding: 14px 18px; border-radius: 10px; margin: 22px 0; font-size: 15px; }
pre { background: ${p.codeBg}; color: ${p.codeFg}; padding: 20px 24px; border-radius: 8px; font-size: 14px; line-height: 1.5; margin: 20px 0; }
.grid { display: flex; gap: 20px; margin: 24px 0; }
.feature { flex: 1; background: ${p.card}; border-radius: 12px; padding: 24px; box-shadow: 0 0 0 rgba(0,0,0,0); border: 1px solid ${p.border}; }
.feature:hover { box-shadow: 0 8px 24px ${p.shadow}; }
.feature h3 { font-size: 19px; font-weight: 700; color: ${p.fg}; margin-bottom: 8px; }
.callout { background: ${p.callout}; color: white; padding: 28px 32px; border-radius: 14px; margin: 24px 0; display: flex; align-items: center; gap: 24px; }
.callout h3 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.callout p { color: #e8ecff; margin-bottom: 0; }
ul { margin: 12px 0 20px 22px; }
li { font-size: 16px; line-height: 1.7; }
.card { background: ${p.card}; border-radius: 12px; padding: 24px; margin: 24px 0; box-shadow: 0 0 0 rgba(0,0,0,0); border: 1px solid ${p.border}; }
.card:hover { box-shadow: 0 8px 24px ${p.shadow}; }
.card h3 { font-size: 19px; font-weight: 700; color: ${p.fg}; margin-bottom: 8px; }
.tag { display: inline-block; background: ${p.tagBg}; color: ${p.tagFg}; padding: 3px 11px; border-radius: 12px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.btn { display: inline-block; text-align: center; background: ${p.accent}; color: white; padding: 11px 26px; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 0 0 rgba(0,0,0,0); }
.btn:hover { background: ${p.accentDark}; box-shadow: 0 4px 14px ${p.shadow}; }
.btn:active { background: ${p.accentActive}; }
.btn.ghost { background: transparent; color: ${p.accent}; border: 2px solid ${p.accent}; }
.btn.ghost:hover { background: ${p.tagBg}; }
.progress { background: ${p.progress}; border-radius: 999px; height: 10px; margin: 18px 0; overflow: hidden; }
.pulse { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: ${p.pulse}; font-weight: 700; padding-left: 22px; }
.stats { display: flex; gap: 16px; margin: 24px 0; }
.stat { flex: 1; background: ${p.card}; border-radius: 12px; padding: 20px; text-align: center; }
.stat .num { font-size: 34px; font-weight: 700; color: ${p.accent}; }
.stat .lbl { font-size: 13px; color: ${p.muted}; margin-top: 4px; }
.steps { margin: 20px 0; }
.step { display: flex; gap: 16px; margin-bottom: 18px; align-items: flex-start; }
.step .n { flex: 0 0 34px; height: 34px; border-radius: 50%; background: ${p.accent}; color: white; font-weight: 700; text-align: center; }
.timeline { border-left: 2px solid ${p.timeline}; margin: 20px 0 20px 12px; padding-left: 20px; }
.tl { position: relative; margin-bottom: 18px; }
.tl::before { content:''; position:absolute; left:-27px; top:4px; width:10px; height:10px; border-radius:50%; background:${p.accent}; }
.pullquote { font-size: 24px; line-height: 1.4; color: ${p.fg}; border-left: 4px solid ${p.accent}; padding: 8px 0 8px 22px; margin: 24px 0; font-style: italic; }
.badges { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
.badge { background: ${p.badgeBg}; border: 1px solid ${p.badgeBorder}; border-radius: 8px; padding: 8px 14px; font-size: 14px; color: ${p.badgeFg}; }
.avatars { display: flex; align-items: center; }
.avatar { width: 38px; height: 38px; border-radius: 50%; background: ${p.avatarBg}; color: white; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-left: -10px; border: 2px solid ${p.pageBg}; }
.cta { text-align: center; background: ${p.cta}; color: white; border-radius: 16px; padding: 40px; margin: 24px 0; }
.cta h3 { font-size: 28px; font-weight: 700; margin-bottom: 12px; }
.cta p { color: #e8ecff; margin-bottom: 18px; }
.divider { height: 1px; background: ${p.border}; margin: 28px 0; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid ${p.border}; font-size: 13px; color: ${p.muted}; }
.tabs { display: flex; gap: 4px; margin: 22px 0; }
.tab { padding: 10px 22px; border-radius: 8px 8px 0 0; font-size: 14px; font-weight: 700; background: ${p.card}; color: ${p.muted}; cursor: pointer; }
.tab.active { background: ${p.accent}; color: white; }
.tab:hover { background: ${p.tagBg}; color: ${p.tagFg}; }
.tab-content { background: ${p.card}; border-radius: 0 12px 12px 12px; padding: 24px; margin-top: -4px; }
.btn.pill { padding: 10px 28px; border-radius: 999px; }
.btn.small { padding: 6px 16px; font-size: 13px; border-radius: 6px; }
.btn.large { padding: 15px 36px; font-size: 19px; border-radius: 10px; }
.btn.icon { padding: 10px 14px; gap: 8px; }
.table { display: flex; flex-direction: column; margin: 20px 0; }
.row { display: flex; }
.row.head { background: ${p.accent}; color: white; font-weight: 700; border-radius: 8px 8px 0 0; }
.row.body { background: ${p.card}; }
.row.body:last-child { border-radius: 0 0 8px 8px; }
.cell { flex: 1; padding: 12px 16px; font-size: 14px; }
.list-desc { margin: 16px 0; }
.list-desc dt { font-weight: 700; margin-bottom: 4px; font-size: 16px; }
.list-desc dd { margin-left: 18px; margin-bottom: 14px; font-size: 15px; color: ${p.muted}; }
.label { display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-right: 6px; }
.label.accent { background: ${p.accent}; color: white; }
.label.green { background: ${p.pulse}; color: white; }
.label.muted { background: ${p.tagBg}; color: ${p.tagFg}; }
.bounce { width: 64px; height: 64px; background: ${p.accent}; border-radius: 16px; display: inline-block; margin: 10px; }
.heartbeat { width: 72px; height: 72px; background: ${p.pulse}; border-radius: 50%; display: inline-block; margin: 10px; }
.glow { width: 64px; height: 64px; background: ${p.accent}; border-radius: 50%; display: inline-block; margin: 10px; }
.float { width: 64px; height: 64px; background: ${p.callout}; border-radius: 16px; display: inline-block; margin: 10px; }
.spin { width: 64px; height: 64px; background: ${p.pulse}; border-radius: 12px; display: inline-block; margin: 10px; }
.shimmer { width: 200px; height: 64px; background: ${p.card}; border-radius: 12px; display: inline-block; margin: 10px; border: 1px solid ${p.border}; }
.check-list { margin: 12px 0 18px; }
.check-list li { font-size: 16px; line-height: 1.7; }
.split { display: flex; gap: 24px; margin: 20px 0; }
.split > * { flex: 1; }
.text-sm { font-size: 13px; }
.text-lg { font-size: 20px; line-height: 1.5; }
.text-xl { font-size: 30px; font-weight: 700; line-height: 1.2; }
.text-2xl { font-size: 44px; font-weight: 700; line-height: 1.05; }
.text-muted { color: ${p.muted}; }
.text-accent { color: ${p.accent}; }
.uppercase { text-transform: uppercase; letter-spacing: 1px; }
blockquote { border-left: 4px solid ${p.accent}; padding: 12px 20px; margin: 20px 0; background: ${p.card}; border-radius: 0 8px 8px 0; font-size: 17px; line-height: 1.6; color: ${p.muted}; font-style: italic; }
code { font-size: 14px; background: ${p.codeBg}; color: ${p.codeFg}; padding: 3px 8px; border-radius: 5px; font-family: monospace; }
.kbd { display: inline-block; font-size: 12px; font-weight: 700; background: ${p.card}; border: 1px solid ${p.border}; border-radius: 5px; padding: 3px 8px; font-family: monospace; color: ${p.muted}; }
.chip { display: inline-block; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; background: ${p.tagBg}; color: ${p.tagFg}; margin: 4px; }
.chip.accent { background: ${p.accent}; color: white; }
.icon-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
.icon-item { text-align: center; width: 72px; padding: 12px 6px; border-radius: 8px; background: ${p.card}; }
.icon-item .glyph { font-size: 28px; }
.icon-item .name { font-size: 10px; color: ${p.muted}; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.well { background: ${p.card}; border-radius: 12px; padding: 24px; margin: 20px 0; }
.section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${p.kicker}; margin-bottom: 8px; }
.vec-icon { display: inline-block; width: 28px; height: 28px; color: ${p.accent}; vertical-align: middle; }
.vec-grid { display: flex; flex-wrap: wrap; gap: 14px; margin: 22px 0; }
.vec-card { width: 96px; padding: 18px 10px 12px; border-radius: 14px; background: ${p.card}; border: 1px solid ${p.border}; text-align: center; }
.vec-card .vec-icon { width: 40px; height: 40px; }
.vec-card .cap { display: block; margin-top: 10px; font-size: 11px; color: ${p.muted}; text-transform: uppercase; letter-spacing: 0.6px; }
.vec-feature { display: flex; align-items: center; gap: 18px; background: ${p.card}; border: 1px solid ${p.border}; border-radius: 14px; padding: 20px 24px; margin: 16px 0; }
.vec-feature .vec-icon { width: 48px; height: 48px; flex: 0 0 48px; color: ${p.kicker}; }
.vec-feature .vec-body h3 { font-size: 18px; font-weight: 700; color: ${p.fg}; margin-bottom: 4px; }
.vec-feature .vec-body p { margin: 0; color: ${p.muted}; font-size: 15px; }
.illus { width: 320px; height: 200px; border-radius: 16px; background: ${p.tagBg}; color: ${p.accent}; margin: 22px 0; }
.illus-row { display: flex; gap: 20px; flex-wrap: wrap; margin: 22px 0; }
.illus-sm { width: 200px; height: 150px; border-radius: 14px; background: ${p.card}; border: 1px solid ${p.border}; color: ${p.kicker}; }
`;
}
