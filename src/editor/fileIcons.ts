// ── File-type icons ──────────────────────────────────────────────────────────
// Ported from yasmineOS's HybridUIComponent file-type icon set (21 distinct
// shapes, ~85 extensions). Each icon is authored as filled SVG path `d`
// string(s) on a 20×20 grid (matching yasmineOS's viewBox), converted from
// their stroked SVG primitives to filled outlines so they render through
// windfoil's analytic coverage integral at any zoom.
//
// The extension→icon+color lookup mirrors yasmineOS's FileTreeRenderer
// (getFileIconSVG + getFileTypeColor). Colors are the resolved hex values
// from their CSS custom properties (file-tree.css + UploadProgressUI fallbacks).

export const FILE_TYPE_ICONS: Record<string, string | string[]> = {
  ft_code: 'M13 3l7 7-7 7v-2l5-5-5-5zM7 3L0 10l7 7v-2L2 10l5-5z',
  ft_python: [
    'M9.8 1C7.1 1 5.4 2.2 5.4 4.1v1.7h4.5v.6H4.1C2.2 6.4.6 7.7.6 10c0 2.3 1.3 3.6 3.3 3.6h1.5v-2c0-1.5 1.3-2.8 2.8-2.8h4.3c1.3 0 2.3-1.1 2.3-2.3V4.1C14.8 2.1 12.5 1 9.8 1zm-2.5 1.8c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z',
    'M10.2 19c2.7 0 4.4-1.2 4.4-3.1v-1.7h-4.5v-.6h5.8c1.9 0 3.5-1.3 3.5-3.6 0-2.3-1.3-3.6-3.3-3.6h-1.5v2c0 1.5-1.3 2.8-2.8 2.8H7.5c-1.3 0-2.3 1.1-2.3 2.3v2.4C5.2 17.9 7.5 19 10.2 19zm2.5-1.8c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z',
  ],
  ft_terminal: 'M1 3h18v14H1zM2.1 4.1v11.8h15.8V4.1zM4 6.4l3.6 3.6-3.6 3.6 1.2 1.2 4.8-4.8-4.8-4.8zM9 12.4h6v1.2H9z',
  ft_world: [
    'M10 .45a9.55 9.55 0 1 1 0 19.1 9.55 9.55 0 0 1 0-19.1zM10 1.55a8.45 8.45 0 1 0 0 16.9 8.45 8.45 0 0 0 0-16.9z',
    'M1 9.45h2v1.1H1zM17 9.45h2v1.1H17zM9.45 1h1.1v2H9.45zM9.45 17h1.1v2H9.45z',
    'M5.6 5.6l1.42 1.42-.78.78L4.82 6.38zM13.76 13.76l1.42 1.42-.78.78-1.42-1.42zM5.6 14.4l1.42-1.42.78.78-1.42 1.42zM13.76 6.24l1.42-1.42.78.78-1.42 1.42z',
  ],
  ft_paint: 'M10.21 1L5 6.21V9l2 2 5.79-5.79L10.21 1zM16 10V8h-2v2h-2v2h2v2h2v-2h2v-2h-2z',
  ft_text: [
    'M3.5 1.5h14v17h-14zM4.6 2.6v14.8h11.8V2.6z',
    'M6 6h8v1.1H6zM6 8h8v1.1H6zM6 10h8v1.1H6zM6 12h6v1.1H6z',
  ],
  ft_bolt: 'M4.74 20L7.73 12H3L9.43 1h4.74L11.2 8h4.71L10.51 20z',
  ft_database: [
    'M10 1.5a7.5 3.14 0 1 1 0 6.28 7.5 3.14 0 0 1 0-6.28zM10 2.6a6.4 2.04 0 1 0 0 4.08A6.4 2.04 0 0 0 10 2.6z',
    'M17.5 8.11c0 1.74-3.36 3.14-7.5 3.14S2.5 9.85 2.5 8.11v1.1c0 1.74 3.36 3.14 7.5 3.14s7.5-1.4 7.5-3.14z',
    'M17.5 11.25c0 1.74-3.36 3.14-7.5 3.14S2.5 12.99 2.5 11.25v1.1c0 1.74 3.36 3.14 7.5 3.14s7.5-1.4 7.5-3.14z',
    'M17.5 14.39c0 1.74-3.36 3.14-7.5 3.14S2.5 16.13 2.5 14.39v1.1c0 1.74 3.36 3.14 7.5 3.14s7.5-1.4 7.5-3.14z',
  ],
  ft_cog: [
    'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 7.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z',
    'M16.91 12.68h1.65c.25-.65.44-1.35.44-2.07V9.39c0-.72-.19-1.42-.44-2.07h-1.65c-.26-.64-.61-1.22-1.05-1.72l.91-.91c-.47-.64-1.07-1.24-1.71-1.71l-.91.91c-.5-.44-1.08-.79-1.72-1.05V1.19C11.78.94 11.08.75 10.36.75H9.14c-.72 0-1.42.19-2.07.44v1.65c-.64.26-1.22.61-1.72 1.05l-.91-.91c-.64.47-1.24 1.07-1.71 1.71l.91.91c-.44.5-.79 1.08-1.05 1.72H.94C.69 7.97.5 8.67.5 9.39v1.22c0 .72.19 1.42.44 2.07h1.65c.26.64.61 1.22 1.05 1.72l-.91.91c.47.64 1.07 1.24 1.71 1.71l.91-.91c.5.44 1.08.79 1.72 1.05v1.65c.65.25 1.35.44 2.07.44h1.22c.72 0 1.42-.19 2.07-.44v-1.65c.64-.26 1.22-.61 1.72-1.05l.91.91c.64-.47 1.24-1.07 1.71-1.71l-.91-.91c.44-.5.79-1.08 1.05-1.72zM10 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  ],
  ft_pdf: [
    'M3.5 1.5h13v17h-13z',
    'M14.65 11.67c-.48.3-1.37-.19-1.79-.37a4.65 4.65 0 0 1 1.49.06c.35.1.36.28.3.31zm-6.3.06l.43-.79a14.7 14.7 0 0 0 .75-1.64 5.48 5.48 0 0 0 1.25 1.55l.2.15a16.36 16.36 0 0 0-2.63.73zM9.5 5.32c.2 0 .32.5.32.97a1.99 1.99 0 0 1-.23 1.04 5.05 5.05 0 0 1-.17-1.3s0-.71.08-.71zm-3.9 9a4.35 4.35 0 0 1 1.21-1.46l.24-.22a4.35 4.35 0 0 1-1.46 1.68zm9.23-3.3a2.05 2.05 0 0 0-1.32-.3 11.07 11.07 0 0 0-1.58.11 4.09 4.09 0 0 1-.74-.5 5.39 5.39 0 0 1-1.32-2.06 10.37 10.37 0 0 0 .28-2.62 1.83 1.83 0 0 0-.07-.25.57.57 0 0 0-.52-.4H9.4a.59.59 0 0 0-.6.38 6.95 6.95 0 0 0 .37 3.14c-.26.63-1 2.12-1 2.12-.3.58-.57 1.08-.82 1.5l-.8.44A3.11 3.11 0 0 0 5 14.16a.39.39 0 0 0 .15.42l.24.13c1.15.56 2.28-1.74 2.66-2.42a23.1 23.1 0 0 1 3.59-.85 4.56 4.56 0 0 0 2.91.8.5.5 0 0 0 .3-.21 1.1 1.1 0 0 0 .12-.75.84.84 0 0 0-.14-.25z',
  ],
  ft_image: [
    'M.5 2.5h19v15H.5zM1.6 3.6v12.8h16.8V3.6z',
    'M16.1 5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
    'M4 13l4-4 5 5-1.2 1.2L8 11.4l-2.8 2.8z',
    'M11 12l4-4 4 4-1.2 1.2L15 10.4l-2.8 2.8z',
  ],
  ft_audio: [
    'M5.37 17.58a3.25 3.25 0 1 1 3.25-3.25 3.26 3.26 0 0 1-3.25 3.25zm0-5.33a2.08 2.08 0 1 0 2.08 2.08 2.08 2.08 0 0 0-2.08-2.08z',
    'M14.64 15.43a3.25 3.25 0 1 1 3.25-3.25 3.26 3.26 0 0 1-3.25 3.25zm0-5.33a2.08 2.08 0 1 0 2.08 2.08 2.08 2.08 0 0 0-2.08-2.08z',
    'M8.03 14.9a.59.59 0 0 1-.59-.59V4.66a.59.59 0 0 1 .46-.57l9.27-2.1a.59.59 0 0 1 .71.57v9.98a.59.59 0 0 1-1.17 0V3.29l-8.1 1.84v9.18a.59.59 0 0 1-.58.59z',
    'M8.03 7.91a.59.59 0 0 1-.13-1.16l9.27-2.1a.59.59 0 0 1 .26 1.14l-9.27 2.1a.58.58 0 0 1-.13.02z',
  ],
  ft_video: [
    'M1 4h18v12H1zM2.1 5.1v9.8h15.8V5.1z',
    'M1 4h3v3H1zM16 4h3v3h-3zM1 13h3v3H1zM16 13h3v3h-3z',
    'M8 8v4l4-2z',
  ],
  ft_model3d: [
    'M10 1l8 4.5v9L10 19 2 14.5v-9zM10 2.3L3.1 6.1v7.8L10 17.7l6.9-3.8V6.1z',
    'M2 5.5l8 4.5 8-4.5v1.3l-8 4.5-8-4.5z',
    'M9.4 10h1.2v9H9.4z',
  ],
  ft_archive: [
    'M3 2h14v16H3zM4.1 3.1v13.8h11.8V3.1z',
    'M9 2h2v2H9zM9 5h2v2H9zM9 8h2v2H9z',
    'M8 12h4v3H8zM9.2 12.8h1.6v1H9.2z',
  ],
  ft_docker: [
    'M3 8h3v2.5H3zM6.5 8h3v2.5h-3zM10 8h3v2.5h-3zM6.5 5h3v2.5h-3zM10 5h3v2.5h-3zM13.5 8h3v2.5h-3z',
    'M18 11c-.3-1.2-1.4-1.8-2.5-1.8-.3 0-.5 0-.8.1-.4-.8-1-1.4-2-1.6v-.2c0-.2 0-.5-.1-.8l-.1-.3-.3.2c-.4.3-.7.7-.9 1.1-.3-.1-.5-.1-.8-.1-2.5 0-4.5 2-4.5 4.5 0 .3 0 .6.1.9h-2c-.3 0-.5.2-.5.5s.2.5.5.5h14c1.7 0 2.3-1.8 2-3z',
  ],
  ft_noext: [
    'M3 2h14v16H3zM4.1 3.1v13.8h11.8V3.1z',
    'M5 4h10v1.2H5zM5 6h8v.8H5zM5 7.3h9v.8H5zM5 8.6h6v.8H5z',
    'M8 10.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  ],
  ft_gguf: [
    'M5 2.5h6.2L16 7.3v9.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1zM5 3.6v12.8h10V7.8l-4.3-4.2z',
    'M11 2.7v4.5h4.5v1.1H9.9V2.7z',
    'M7.7 11.6l4-1.7v1.2l-4 1.7zM7.7 11.6l4 1.7v-1.2l-4-1.7z',
    'M7.4 10.45a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM12 8.55a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM12 12.15a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z',
  ],
  ft_mmproj: [
    'M5 2.5h6.2L16 7.3v9.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1zM5 3.6v12.8h10V7.8l-4.3-4.2z',
    'M11 2.7v4.5h4.5v1.1H9.9V2.7z',
    'M5.6 12.2c1.2-1.9 2.8-2.8 4.4-2.8s3.2.9 4.4 2.8c-1.2 1.9-2.8 2.8-4.4 2.8s-3.2-.9-4.4-2.8z',
    'M10 10.95a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z',
  ],
  ft_timeline: [
    'M4.5 1.5h7.8l3.2 3.2v13.8H4.5zM5.6 2.6v14.8h8.8V5.2l-2.6-2.6z',
    'M12.3 1.5v3.4h3.2z',
    'M8 7.2v5.6l4.6-2.8z',
  ],
  ft_file: 'M3.5 1.5h14v17h-14zM4.6 2.6v14.8h11.8V2.6z',
};

const C = (r: number, g: number, b: number): number[] => [r / 255, g / 255, b / 255, 1];

const FILE_COLORS: Record<string, number[]> = {
  js: C(247, 223, 30), ts: C(49, 120, 198), html: C(227, 76, 38),
  css: C(21, 114, 182), scss: C(204, 102, 153), sass: C(204, 102, 153), less: C(29, 54, 93),
  json: C(203, 203, 65), xml: C(227, 121, 51), txt: C(144, 144, 144),
  md: C(81, 154, 186), py: C(55, 118, 171),
  java: C(237, 139, 0), cs: C(23, 134, 0), php: C(79, 93, 149),
  rb: C(112, 21, 22), go: C(0, 173, 216), rs: C(222, 165, 132),
  cpp: C(243, 75, 125), c: C(243, 75, 125), h: C(243, 75, 125), hpp: C(243, 75, 125),
  sql: C(227, 140, 0),
  yaml: C(203, 23, 30), yml: C(203, 23, 30), toml: C(109, 128, 134),
  ini: C(109, 128, 134), conf: C(109, 128, 134), config: C(109, 128, 134),
  pdf: C(229, 57, 53),
  png: C(160, 116, 196), jpg: C(160, 116, 196), jpeg: C(160, 116, 196),
  gif: C(160, 116, 196), svg: C(160, 116, 196), webp: C(160, 116, 196),
  avif: C(160, 116, 196), bmp: C(160, 116, 196), tiff: C(160, 116, 196), tif: C(160, 116, 196),
  mp3: C(233, 30, 99), wav: C(233, 30, 99), flac: C(233, 30, 99),
  ogg: C(233, 30, 99), m4a: C(233, 30, 99), aac: C(233, 30, 99),
  mp4: C(156, 39, 176), webm: C(156, 39, 176), mkv: C(156, 39, 176),
  mov: C(156, 39, 176), avi: C(156, 39, 176), m4v: C(156, 39, 176), ogv: C(156, 39, 176),
  glb: C(79, 195, 247), gltf: C(79, 195, 247),
  zip: C(230, 163, 82), tar: C(230, 163, 82), gz: C(230, 163, 82),
  bz2: C(230, 163, 82), xz: C(230, 163, 82), '7z': C(230, 163, 82),
  rar: C(230, 163, 82), tgz: C(230, 163, 82),
  sh: C(78, 170, 37), bash: C(78, 170, 37), zsh: C(78, 170, 37),
  fish: C(78, 170, 37), ksh: C(78, 170, 37),
  xlsx: C(24, 90, 189), docx: C(24, 90, 189), pptx: C(24, 90, 189),
  tex: C(81, 154, 186), latex: C(81, 154, 186), bib: C(81, 154, 186),
  wasm: C(101, 79, 240), wgsl: C(49, 120, 198),
  swift: C(255, 172, 69), kt: C(169, 123, 255), kts: C(169, 123, 255),
  ps1: C(1, 36, 86), bat: C(193, 241, 46), cmd: C(193, 241, 46),
  gguf: C(126, 91, 239), mmproj: C(199, 146, 234),
  timeline: C(91, 155, 213),
  noext: C(139, 115, 85),
  default: C(144, 144, 144),
};

const ICON_MAP: Record<string, string> = {
  js: 'ft_code', jsx: 'ft_code', mjs: 'ft_code', cjs: 'ft_code',
  ts: 'ft_code', tsx: 'ft_code', java: 'ft_code', cs: 'ft_code',
  php: 'ft_code', rb: 'ft_code', go: 'ft_code', rs: 'ft_code',
  swift: 'ft_code', kt: 'ft_code', kts: 'ft_code',
  py: 'ft_python',
  sh: 'ft_terminal', bash: 'ft_terminal', zsh: 'ft_terminal',
  fish: 'ft_terminal', ksh: 'ft_terminal', ps1: 'ft_terminal',
  bat: 'ft_terminal', cmd: 'ft_terminal',
  html: 'ft_world', htm: 'ft_world',
  css: 'ft_paint', scss: 'ft_paint', sass: 'ft_paint', less: 'ft_paint',
  json: 'ft_text', xml: 'ft_text', txt: 'ft_text',
  md: 'ft_text', markdown: 'ft_text',
  xlsx: 'ft_text', docx: 'ft_text', pptx: 'ft_text',
  tex: 'ft_text', latex: 'ft_text', bib: 'ft_text',
  doc: 'ft_text', rtf: 'ft_text',
  cpp: 'ft_bolt', c: 'ft_bolt', h: 'ft_bolt', hpp: 'ft_bolt',
  sql: 'ft_database',
  yaml: 'ft_cog', yml: 'ft_cog', toml: 'ft_cog',
  ini: 'ft_cog', conf: 'ft_cog', config: 'ft_cog',
  pdf: 'ft_pdf',
  png: 'ft_image', jpg: 'ft_image', jpeg: 'ft_image', gif: 'ft_image',
  svg: 'ft_image', webp: 'ft_image', avif: 'ft_image', bmp: 'ft_image',
  tiff: 'ft_image', tif: 'ft_image', ico: 'ft_image',
  mp3: 'ft_audio', wav: 'ft_audio', flac: 'ft_audio',
  ogg: 'ft_audio', m4a: 'ft_audio', aac: 'ft_audio',
  wma: 'ft_audio',
  mp4: 'ft_video', webm: 'ft_video', mkv: 'ft_video',
  mov: 'ft_video', avi: 'ft_video', m4v: 'ft_video', ogv: 'ft_video',
  wmv: 'ft_video', flv: 'ft_video',
  glb: 'ft_model3d', gltf: 'ft_model3d',
  zip: 'ft_archive', tar: 'ft_archive', gz: 'ft_archive',
  bz2: 'ft_archive', xz: 'ft_archive', '7z': 'ft_archive',
  rar: 'ft_archive', tgz: 'ft_archive', zst: 'ft_archive',
  wasm: 'ft_code', wgsl: 'ft_code',
};

const SPECIAL_NAMES: Record<string, string> = {
  dockerfile: 'ft_docker', makefile: 'ft_cog', gnumakefile: 'ft_cog',
};

export function fileIconForPath(path: string): { name: string; color: number[] } {
  const lower = path.toLowerCase();
  const base = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;

  if (base.endsWith('.timeline.json')) return { name: 'icon:ft_timeline', color: FILE_COLORS.timeline };

  const special = SPECIAL_NAMES[base] || SPECIAL_NAMES[base.split('.')[0]];
  if (special) return { name: 'icon:' + special, color: FILE_COLORS.config };

  if (base.endsWith('.gguf')) {
    const isMm = /(?:^|[/_.-])mmproj/.test(lower);
    return { name: 'icon:' + (isMm ? 'ft_mmproj' : 'ft_gguf'), color: isMm ? FILE_COLORS.mmproj : FILE_COLORS.gguf };
  }

  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { name: 'icon:ft_noext', color: FILE_COLORS.noext };

  const ext = base.slice(dot + 1);
  const icon = ICON_MAP[ext] || 'ft_file';
  const color = FILE_COLORS[ext] || FILE_COLORS.default;
  return { name: 'icon:' + icon, color };
}
