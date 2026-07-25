import type { Engine } from '../playground/engine';
import { advanceOf } from '../windfoil/font';
import { addRect, layoutStr, layoutIcon } from '../layout/metrics';
import { CodeEditor, type EditorTheme } from '../editor/editor';
import { Terminal, type TerminalTheme } from '../editor/terminal';
import { FileTree, type FileTreeTheme, type TreeNode } from '../editor/fileTree';
import { DEPTH_FORMAT } from '../windfoil/mesh3d';
import { createGlyphRenderer } from '../windfoil/gpu';
import { AnalyticToolbar, type ToolbarButton } from '../ui/analyticToolbar';
import { enterOrbit, orbitViewProj, orbitScale, setOrbitEnabled, updateOrbit, screenToDocLocal, setOrbitNear, setOrbitPanChord, orbitTruck, orbitZoomToRect, orbitPolar, orbitAzimuth, orbitSetAngles } from '../camera/orbit';
import { ANALYTIC_MENU_THEME } from '../ui/analyticMenu';
import { MenuGate, MultiClickTracker, RightGesture, routeScroll, resolveCursor } from '../ui/inputRouter';
import { tabMenu, folderMenu, fileMenu, editorMenu, terminalMenu, searchMenu, type IdeMenuActions } from './menus';
import { ideTheme as T } from './theme';

const AB_W = 50;
const SIDEBAR_W = 340;
const TAB_BAR_H = 36;
const STATUS_H = 22;
const TERM_HEADER_H = 28;
const ANIM_MS = 220;

const REP_R = 72, REP_R2 = REP_R * REP_R, REP_STR = 16;
const CLOTH_AX = 2.8, CLOTH_AY = 1.4, CLOTH_FX = 0.028, CLOTH_FY = 0.038, CLOTH_SX = 1.6, CLOTH_SY = 2.2;
const FW_R = 220, FW_R2 = FW_R * FW_R, FW_STR = 40, FW_LIFE = 3.0, FW_GRAV = 90;
const FW_Z_STR = 260, FW_SPIN = 4.5;
const BH_R = 200, BH_R2 = BH_R * BH_R, BH_CORE = 28;
const SN_R = 240, SN_R2 = SN_R * SN_R, SN_LIFE = 1.8, SN_SPEED = 320;
const DISSOLVE_MS = 2800;
const FX_NAMES = ['off', 'cloth', 'matrix', 'heartbeat', 'glitch', 'aurora', 'fireworks', 'blackhole', 'supernova', 'dissolve', 'earthquake', 'logo'] as const;
type FxMode = typeof FX_NAMES[number];
function fxHash(i: number): number { let h = (i * 2654435761) >>> 0; h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function wSDF(px: number, py: number): number {
  const S = [[0.06, 0.04, 0.27, 0.96], [0.27, 0.96, 0.50, 0.32], [0.50, 0.32, 0.73, 0.96], [0.73, 0.96, 0.94, 0.04]];
  let m = 1e9;
  for (const [x0, y0, x1, y1] of S) {
    const dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)));
  }
  return m;
}

const SB_HEADER_H = 53;
const SB_SEARCH_Y = 61;
const SB_SEARCH_H = 30;
const SB_TOOL_Y = 99;
const SB_TOOL_H = 30;
const SB_TREE_Y = 141;

// Tab bar constants — shared between render / hit-test / click.
const TAB_PAD_L = 12;
const TAB_CLOSE_SZ = 12;
const TAB_CLOSE_GAP = 8;
const TAB_PAD_R = 10;
function tabWidth(name: string, canClose: boolean, textW: (t: string, s: number) => number): number {
  return textW(name, 12) + TAB_PAD_L + (canClose ? TAB_CLOSE_GAP + TAB_CLOSE_SZ : 0) + TAB_PAD_R;
}

const smoothstep = (t: number) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * c * (c * (c * 6 - 15) + 10); };

const LOCAL_TREE: TreeNode[] = [
  { name: 'src', path: 'src', type: 'folder', children: [
    { name: 'camera', path: 'src/camera', type: 'folder', children: [
      { name: 'camera.ts', path: 'src/camera/camera.ts', type: 'file' },
      { name: 'input.ts', path: 'src/camera/input.ts', type: 'file' },
      { name: 'orbit.ts', path: 'src/camera/orbit.ts', type: 'file' },
      { name: 'mat4.ts', path: 'src/camera/mat4.ts', type: 'file' },
    ]},
    { name: 'css', path: 'src/css', type: 'folder', children: [
      { name: 'engine.ts', path: 'src/css/engine.ts', type: 'file' },
      { name: 'theme.ts', path: 'src/css/theme.ts', type: 'file' },
      { name: 'themeController.ts', path: 'src/css/themeController.ts', type: 'file' },
    ]},
    { name: 'editor', path: 'src/editor', type: 'folder', children: [
      { name: 'document.ts', path: 'src/editor/document.ts', type: 'file' },
      { name: 'editor.ts', path: 'src/editor/editor.ts', type: 'file' },
      { name: 'editorInput.ts', path: 'src/editor/editorInput.ts', type: 'file' },
      { name: 'fileTree.ts', path: 'src/editor/fileTree.ts', type: 'file' },
      { name: 'fileIcons.ts', path: 'src/editor/fileIcons.ts', type: 'file' },
      { name: 'highlight.ts', path: 'src/editor/highlight.ts', type: 'file' },
      { name: 'sample.ts', path: 'src/editor/sample.ts', type: 'file' },
      { name: 'terminal.ts', path: 'src/editor/terminal.ts', type: 'file' },
      { name: 'terminalInput.ts', path: 'src/editor/terminalInput.ts', type: 'file' },
    ]},
    { name: 'layout', path: 'src/layout', type: 'folder', children: [
      { name: 'editable.ts', path: 'src/layout/editable.ts', type: 'file' },
      { name: 'flow.ts', path: 'src/layout/flow.ts', type: 'file' },
      { name: 'metrics.ts', path: 'src/layout/metrics.ts', type: 'file' },
      { name: 'types.ts', path: 'src/layout/types.ts', type: 'file' },
      { name: 'walk.ts', path: 'src/layout/walk.ts', type: 'file' },
    ]},
    { name: 'ui', path: 'src/ui', type: 'folder', children: [
      { name: 'contextMenu.ts', path: 'src/ui/contextMenu.ts', type: 'file' },
      { name: 'icons.ts', path: 'src/ui/icons.ts', type: 'file' },
      { name: 'interactions.ts', path: 'src/ui/interactions.ts', type: 'file' },
    ]},
    { name: 'windfoil', path: 'src/windfoil', type: 'folder', children: [
      { name: 'bands.ts', path: 'src/windfoil/bands.ts', type: 'file' },
      { name: 'font.ts', path: 'src/windfoil/font.ts', type: 'file' },
      { name: 'geometry.ts', path: 'src/windfoil/geometry.ts', type: 'file' },
      { name: 'gpu.ts', path: 'src/windfoil/gpu.ts', type: 'file' },
      { name: 'svg.ts', path: 'src/windfoil/svg.ts', type: 'file' },
      { name: 'windfoil.wgsl', path: 'src/windfoil/windfoil.wgsl', type: 'file' },
    ]},
    { name: 'frame.ts', path: 'src/frame.ts', type: 'file' },
    { name: 'main.ts', path: 'src/main.ts', type: 'file' },
    { name: 'precompute.ts', path: 'src/precompute.ts', type: 'file' },
    { name: 'state.ts', path: 'src/state.ts', type: 'file' },
  ]},
  { name: 'public', path: 'public', type: 'folder', children: [
    { name: 'favicon.ico', path: 'public/favicon.ico', type: 'file' },
    { name: 'logo.svg', path: 'public/logo.svg', type: 'file' },
    { name: 'Lato-Regular.ttf', path: 'public/Lato-Regular.ttf', type: 'file' },
  ]},
  { name: 'scripts', path: 'scripts', type: 'folder', children: [
    { name: 'build.sh', path: 'scripts/build.sh', type: 'file' },
    { name: 'deploy.ps1', path: 'scripts/deploy.ps1', type: 'file' },
    { name: 'bench.py', path: 'scripts/bench.py', type: 'file' },
    { name: 'gen_atlas.rs', path: 'scripts/gen_atlas.rs', type: 'file' },
  ]},
  { name: 'docs', path: 'docs', type: 'folder', children: [
    { name: 'architecture.md', path: 'docs/architecture.md', type: 'file' },
    { name: 'api-reference.tex', path: 'docs/api-reference.tex', type: 'file' },
    { name: 'bibliography.bib', path: 'docs/bibliography.bib', type: 'file' },
    { name: 'whitepaper.pdf', path: 'docs/whitepaper.pdf', type: 'file' },
    { name: 'diagram.png', path: 'docs/diagram.png', type: 'file' },
    { name: 'screenshot.jpg', path: 'docs/screenshot.jpg', type: 'file' },
    { name: 'demo.mp4', path: 'docs/demo.mp4', type: 'file' },
  ]},
  { name: 'assets', path: 'assets', type: 'folder', children: [
    { name: 'hero.webp', path: 'assets/hero.webp', type: 'file' },
    { name: 'background.avif', path: 'assets/background.avif', type: 'file' },
    { name: 'icon-set.gif', path: 'assets/icon-set.gif', type: 'file' },
    { name: 'texture.tiff', path: 'assets/texture.tiff', type: 'file' },
    { name: 'ambient.mp3', path: 'assets/ambient.mp3', type: 'file' },
    { name: 'click.wav', path: 'assets/click.wav', type: 'file' },
    { name: 'theme.flac', path: 'assets/theme.flac', type: 'file' },
    { name: 'voiceover.ogg', path: 'assets/voiceover.ogg', type: 'file' },
    { name: 'podcast.m4a', path: 'assets/podcast.m4a', type: 'file' },
    { name: 'jingle.aac', path: 'assets/jingle.aac', type: 'file' },
  ]},
  { name: 'models', path: 'models', type: 'folder', children: [
    { name: 'scene.glb', path: 'models/scene.glb', type: 'file' },
    { name: 'character.gltf', path: 'models/character.gltf', type: 'file' },
    { name: 'llama-7b.gguf', path: 'models/llama-7b.gguf', type: 'file' },
    { name: 'mmproj-vision.gguf', path: 'models/mmproj-vision.gguf', type: 'file' },
  ]},
  { name: 'data', path: 'data', type: 'folder', children: [
    { name: 'schema.sql', path: 'data/schema.sql', type: 'file' },
    { name: 'seed.xml', path: 'data/seed.xml', type: 'file' },
    { name: 'config.yaml', path: 'data/config.yaml', type: 'file' },
    { name: 'settings.toml', path: 'data/settings.toml', type: 'file' },
    { name: 'env.ini', path: 'data/env.ini', type: 'file' },
    { name: 'records.csv', path: 'data/records.csv', type: 'file' },
  ]},
  { name: 'native', path: 'native', type: 'folder', children: [
    { name: 'renderer.cpp', path: 'native/renderer.cpp', type: 'file' },
    { name: 'renderer.h', path: 'native/renderer.h', type: 'file' },
    { name: 'math.hpp', path: 'native/math.hpp', type: 'file' },
    { name: 'bridge.java', path: 'native/bridge.java', type: 'file' },
    { name: 'interop.cs', path: 'native/interop.cs', type: 'file' },
    { name: 'plugin.php', path: 'native/plugin.php', type: 'file' },
    { name: 'server.rb', path: 'native/server.rb', type: 'file' },
    { name: 'cli.go', path: 'native/cli.go', type: 'file' },
    { name: 'app.swift', path: 'native/app.swift', type: 'file' },
    { name: 'module.kt', path: 'native/module.kt', type: 'file' },
  ]},
  { name: 'releases', path: 'releases', type: 'folder', children: [
    { name: 'v1.0.0.zip', path: 'releases/v1.0.0.zip', type: 'file' },
    { name: 'v1.0.0.tar.gz', path: 'releases/v1.0.0.tar.gz', type: 'file' },
    { name: 'v0.9.0.7z', path: 'releases/v0.9.0.7z', type: 'file' },
    { name: 'v0.8.0.rar', path: 'releases/v0.8.0.rar', type: 'file' },
    { name: 'v0.7.0.tar.bz2', path: 'releases/v0.7.0.tar.bz2', type: 'file' },
  ]},
  { name: 'infra', path: 'infra', type: 'folder', children: [
    { name: 'Dockerfile', path: 'infra/Dockerfile', type: 'file' },
    { name: 'docker-compose.yml', path: 'infra/docker-compose.yml', type: 'file' },
    { name: 'Makefile', path: 'infra/Makefile', type: 'file' },
    { name: 'nginx.conf', path: 'infra/nginx.conf', type: 'file' },
    { name: 'setup.bat', path: 'infra/setup.bat', type: 'file' },
  ]},
  { name: 'timelines', path: 'timelines', type: 'folder', children: [
    { name: 'intro.timeline.json', path: 'timelines/intro.timeline.json', type: 'file' },
    { name: 'outro.timeline.json', path: 'timelines/outro.timeline.json', type: 'file' },
  ]},
  { name: 'office', path: 'office', type: 'folder', children: [
    { name: 'report.docx', path: 'office/report.docx', type: 'file' },
    { name: 'budget.xlsx', path: 'office/budget.xlsx', type: 'file' },
    { name: 'pitch.pptx', path: 'office/pitch.pptx', type: 'file' },
    { name: 'contract.rtf', path: 'office/contract.rtf', type: 'file' },
  ]},
  { name: 'index.html', path: 'index.html', type: 'file' },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
  { name: 'vite.config.ts', path: 'vite.config.ts', type: 'file' },
  { name: 'VISION.md', path: 'VISION.md', type: 'file' },
  { name: 'PROGRESS.md', path: 'PROGRESS.md', type: 'file' },
  { name: 'README.md', path: 'README.md', type: 'file' },
  { name: '.gitignore', path: '.gitignore', type: 'file' },
  { name: 'LICENSE', path: 'LICENSE', type: 'file' },
  { name: 'CHANGELOG', path: 'CHANGELOG', type: 'file' },
];
const LOCAL_EXP = ['src', 'src/camera', 'src/css', 'src/editor', 'src/windfoil', 'public', 'scripts', 'docs', 'assets', 'models', 'data', 'native', 'releases', 'infra', 'timelines', 'office'];

const DIST_TREE: TreeNode[] = [
  { name: 'dist', path: 'dist', type: 'folder', children: [
    { name: 'assets', path: 'dist/assets', type: 'folder', children: [
      { name: 'index.4f2c.js', path: 'dist/assets/index.4f2c.js', type: 'file' },
      { name: 'vendor.8b3a.js', path: 'dist/assets/vendor.8b3a.js', type: 'file' },
      { name: 'style.9a11.css', path: 'dist/assets/style.9a11.css', type: 'file' },
      { name: 'theme.2d4e.css', path: 'dist/assets/theme.2d4e.css', type: 'file' },
      { name: 'hero.webp', path: 'dist/assets/hero.webp', type: 'file' },
      { name: 'logo.svg', path: 'dist/assets/logo.svg', type: 'file' },
      { name: 'Lato-Regular.woff2', path: 'dist/assets/Lato-Regular.woff2', type: 'file' },
    ]},
    { name: 'index.html', path: 'dist/index.html', type: 'file' },
    { name: 'windfoil.wasm', path: 'dist/windfoil.wasm', type: 'file' },
    { name: 'manifest.json', path: 'dist/manifest.json', type: 'file' },
    { name: 'sitemap.xml', path: 'dist/sitemap.xml', type: 'file' },
    { name: 'robots.txt', path: 'dist/robots.txt', type: 'file' },
  ]},
];
const DIST_EXP = ['dist', 'dist/assets'];

const SERVER_TREE: TreeNode[] = [
  { name: 'projects', path: 'projects', type: 'folder', children: [
    { name: 'windfoil', path: 'projects/windfoil', type: 'folder', children: [
      { name: 'src', path: 'projects/windfoil/src', type: 'folder', children: [
        { name: 'frame.ts', path: 'projects/windfoil/src/frame.ts', type: 'file' },
        { name: 'state.ts', path: 'projects/windfoil/src/state.ts', type: 'file' },
        { name: 'server.py', path: 'projects/windfoil/src/server.py', type: 'file' },
        { name: 'worker.rs', path: 'projects/windfoil/src/worker.rs', type: 'file' },
      ]},
      { name: 'migrations', path: 'projects/windfoil/migrations', type: 'folder', children: [
        { name: '001_init.sql', path: 'projects/windfoil/migrations/001_init.sql', type: 'file' },
        { name: '002_users.sql', path: 'projects/windfoil/migrations/002_users.sql', type: 'file' },
      ]},
      { name: 'Dockerfile', path: 'projects/windfoil/Dockerfile', type: 'file' },
      { name: 'package.json', path: 'projects/windfoil/package.json', type: 'file' },
      { name: 'README.md', path: 'projects/windfoil/README.md', type: 'file' },
      { name: '.env', path: 'projects/windfoil/.env', type: 'file' },
      { name: 'Makefile', path: 'projects/windfoil/Makefile', type: 'file' },
    ]},
    { name: 'analytics', path: 'projects/analytics', type: 'folder', children: [
      { name: 'pipeline.py', path: 'projects/analytics/pipeline.py', type: 'file' },
      { name: 'model.gguf', path: 'projects/analytics/model.gguf', type: 'file' },
      { name: 'mmproj-vision.gguf', path: 'projects/analytics/mmproj-vision.gguf', type: 'file' },
      { name: 'config.toml', path: 'projects/analytics/config.toml', type: 'file' },
      { name: 'data.csv', path: 'projects/analytics/data.csv', type: 'file' },
    ]},
  ]},
];
const SERVER_EXP = ['projects', 'projects/windfoil', 'projects/windfoil/src', 'projects/windfoil/migrations', 'projects/analytics'];

const NATIVE_TREE: TreeNode[] = [
  { name: 'Documents', path: 'Documents', type: 'folder', children: [
    { name: 'notes.md', path: 'Documents/notes.md', type: 'file' },
    { name: 'todo.txt', path: 'Documents/todo.txt', type: 'file' },
    { name: 'resume.pdf', path: 'Documents/resume.pdf', type: 'file' },
    { name: 'report.docx', path: 'Documents/report.docx', type: 'file' },
    { name: 'budget.xlsx', path: 'Documents/budget.xlsx', type: 'file' },
    { name: 'thesis.tex', path: 'Documents/thesis.tex', type: 'file' },
    { name: 'refs.bib', path: 'Documents/refs.bib', type: 'file' },
  ]},
  { name: 'Downloads', path: 'Downloads', type: 'folder', children: [
    { name: 'spec.pdf', path: 'Downloads/spec.pdf', type: 'file' },
    { name: 'photo.jpg', path: 'Downloads/photo.jpg', type: 'file' },
    { name: 'wallpaper.png', path: 'Downloads/wallpaper.png', type: 'file' },
    { name: 'archive.zip', path: 'Downloads/archive.zip', type: 'file' },
    { name: 'video.mp4', path: 'Downloads/video.mp4', type: 'file' },
    { name: 'song.mp3', path: 'Downloads/song.mp3', type: 'file' },
    { name: 'model.glb', path: 'Downloads/model.glb', type: 'file' },
    { name: 'weights.gguf', path: 'Downloads/weights.gguf', type: 'file' },
    { name: 'data.csv', path: 'Downloads/data.csv', type: 'file' },
  ]},
  { name: 'Pictures', path: 'Pictures', type: 'folder', children: [
    { name: 'vacation.jpg', path: 'Pictures/vacation.jpg', type: 'file' },
    { name: 'screenshot.png', path: 'Pictures/screenshot.png', type: 'file' },
    { name: 'panorama.webp', path: 'Pictures/panorama.webp', type: 'file' },
    { name: 'logo.svg', path: 'Pictures/logo.svg', type: 'file' },
    { name: 'animation.gif', path: 'Pictures/animation.gif', type: 'file' },
    { name: 'raw-photo.tiff', path: 'Pictures/raw-photo.tiff', type: 'file' },
  ]},
  { name: 'Music', path: 'Music', type: 'folder', children: [
    { name: 'track01.flac', path: 'Music/track01.flac', type: 'file' },
    { name: 'track02.mp3', path: 'Music/track02.mp3', type: 'file' },
    { name: 'podcast.m4a', path: 'Music/podcast.m4a', type: 'file' },
    { name: 'ambient.ogg', path: 'Music/ambient.ogg', type: 'file' },
    { name: 'sample.wav', path: 'Music/sample.wav', type: 'file' },
  ]},
  { name: 'Videos', path: 'Videos', type: 'folder', children: [
    { name: 'presentation.mp4', path: 'Videos/presentation.mp4', type: 'file' },
    { name: 'screencast.webm', path: 'Videos/screencast.webm', type: 'file' },
    { name: 'clip.mkv', path: 'Videos/clip.mkv', type: 'file' },
    { name: 'recording.mov', path: 'Videos/recording.mov', type: 'file' },
  ]},
  { name: 'Projects', path: 'Projects', type: 'folder', children: [
    { name: 'app.py', path: 'Projects/app.py', type: 'file' },
    { name: 'server.go', path: 'Projects/server.go', type: 'file' },
    { name: 'lib.rs', path: 'Projects/lib.rs', type: 'file' },
    { name: 'index.js', path: 'Projects/index.js', type: 'file' },
    { name: 'style.scss', path: 'Projects/style.scss', type: 'file' },
    { name: 'schema.sql', path: 'Projects/schema.sql', type: 'file' },
    { name: 'Dockerfile', path: 'Projects/Dockerfile', type: 'file' },
    { name: 'deploy.sh', path: 'Projects/deploy.sh', type: 'file' },
    { name: 'config.yaml', path: 'Projects/config.yaml', type: 'file' },
  ]},
];
const NATIVE_EXP = ['Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Projects'];

const SOURCES: { label: string; roots: TreeNode[]; expanded: string[] }[] = [
  { label: 'DIST', roots: DIST_TREE, expanded: DIST_EXP },
  { label: 'LOCAL', roots: LOCAL_TREE, expanded: LOCAL_EXP },
  { label: 'SERVER', roots: SERVER_TREE, expanded: SERVER_EXP },
  { label: 'NATIVE', roots: NATIVE_TREE, expanded: NATIVE_EXP },
];

const SAMPLE_FILES: { name: string; code: string }[] = [
  {
    name: 'main.ts',
    code: `import { createEngine } from './engine';\nimport { bootIDE } from './ide/ide';\n\nconst engine = await createEngine();\n\nfunction launch() {\n  const dispose = bootIDE(engine, () => {\n    dispose();\n    launch();\n  });\n}\n\nlaunch();\n`,
  },
  {
    name: 'windfoil.wgsl',
    code: `// Box-filter coverage as a per-pixel winding integral.\n// One draw call, zero aliasing at any zoom.\n\noverride MINIFICATION_GUARD : bool = true;\noverride EXACT_MODE : bool = false;\n\n@fragment\nfn fs(in : VsOut) -> @location(0) vec4f {\n  let I = instances[in.inst];\n  let rc = in.rc;\n  let s = max(fwidth(rc), vec2f(1e-9));\n  return fold_shade(\n    integrate_face(I.band, I.bbox.y, rc, s)\n      / (s.x * s.y),\n    I.place.w, I.color);\n}\n`,
  },
  {
    name: 'bands.ts',
    code: `const TARGET_PER_BAND = 10;\nconst MAX_BANDS = 64;\nexport const BAND_SORT_MIN = 4;\n\nfunction chooseBands(n: number, t: number): number {\n  if (n <= t) return 1;\n  return Math.min(Math.ceil(n / t), MAX_BANDS);\n}\n\nexport function bandPieces(\n  pieces: number[], y0: number, y1: number,\n  curveOut: number[], rowOut: number[],\n): BandHeader {\n  const R = chooseBands(pieces.length / 6, TARGET_PER_BAND);\n  const invH = R > 1 && y1 > y0 ? R / (y1 - y0) : 0;\n  // ... file pieces into row bands\n  return { rowBase: 0, bandCount: R, bandH: 0, y0, invH };\n}\n`,
  },
];

const editorTh: EditorTheme = {
  bg: T.editorBg,
  gutterBg: [0.118, 0.118, 0.118, 1],
  gutterFg: [0.522, 0.522, 0.522, 1],
  curLineFg: [0.83, 0.83, 0.83, 1],
  curLineBg: [1, 1, 1, 0.04],
  text: [0.831, 0.831, 0.831, 1],
  caret: [0.95, 0.96, 1, 1],
  sel: [0.15, 0.31, 0.47, 0.5],
};

const fileTreeTh: FileTreeTheme = {
  bg: T.containerBg,
  barBg: T.contentBg,
  barFg: T.headerText,
  text: [0.8, 0.8, 0.8, 1],
  dim: [0.533, 0.533, 0.533, 1],
  gold: [0.863, 0.714, 0.478, 1],
  folder: [0.8, 0.8, 0.8, 1],
  line: [0.502, 0.502, 0.502, 0.4],
  accent: [0.0, 0.478, 0.8, 1],
  selected: [0.0, 0.478, 0.8, 0.28],
  hover: [1, 1, 1, 0.06],
};

const terminalTh: TerminalTheme = {
  bg: T.editorBg,
  barBg: T.tabBarBg,
  barFg: T.headerText,
  text: [0.83, 0.85, 0.90, 1],
  dim: [0.45, 0.48, 0.55, 1],
  prompt: [0.83, 0.85, 0.90, 1],
  green: [0.42, 0.80, 0.44, 1],
  cyan: [0.35, 0.82, 0.94, 1],
  yellow: [0.95, 0.76, 0.35, 1],
  red: [0.88, 0.40, 0.38, 1],
  magenta: [0.72, 0.48, 0.96, 1],
  caret: [0.62, 0.82, 0.55, 1],
};

export function bootIDE(engine: Engine, onBack: () => void): () => void {
  const { device, font, atlas, renderer, tCanvas, gpuCtx, dpr, rCanvas, shaderCode } = engine;
  // Separate HUD renderer — same pattern as explainer v2's CinematicHud
  const hudRenderer = createGlyphRenderer(device, { code: shaderCode, format: 'rgba8unorm' });
  const fpsEl = engine.fpsEl;
  const prevFpsDisplay = fpsEl.style.display;
  fpsEl.style.display = 'none';

  const tabs = SAMPLE_FILES.map(f => {
    const ed = new CodeEditor(f.code);
    ed.fontSize = 15;
    ed.focused = false;
    return { name: f.name, editor: ed };
  });
  let activeTab = 0;
  tabs[0].editor.focused = true;

  const fileTree = new FileTree();
  fileTree.fontSize = 18;
  fileTree.lineHeightMul = 1.6;
  fileTree.indent = 18;
  fileTree.pad = 4;
  fileTree.iconGap = 12;
  fileTree.showTitleBar = false;
  fileTree.clipPad = 4;
  fileTree.setRoots(SOURCES[1].roots, SOURCES[1].expanded);

  const terminal = new Terminal();
  terminal.fontSize = 14;
  terminal.showTitleBar = false;
  terminal.open();

  const gate = new MenuGate((t, s) => textW(t, s));
  const menu = gate.menu;
  const rg = new RightGesture();
  const mct = new MultiClickTracker();

  let sidebarOpen = true;
  let sidebarT = 1;
  let sidebarDir = 0;

  let termOpen = false;
  let termT = 0;
  let termDir = 0;
  const TERM_H = 220;

  let cam3d = true;
  let showDebug = false;

  let activeSource = 1;
  let searchFocused = false;
  let searchQuery = '';
  let searchCaretPhase = 0;

  let focus: 'editor' | 'terminal' = 'editor';

  // ── Tab animations ───────────────────────────────────────────────────────
  let tabFrom = -1;           // old activeTab during cross-fade (-1 = idle)
  let tabTransT = 0;          // 0→1 progression per-frame
  const TAB_TRANS_MS = 160;

  interface AccentAnim { fromX: number; fromW: number; toX: number; toW: number; start: number; }
  let accentAnim: AccentAnim | null = null;
  const ACCENT_MS = 220;

  // Which tab's close button the pointer is currently over.
  let hoverCloseTab = -1;
  // Tab positions (x + width) filled each frame by the tab renderer, consumed
  // by the accent line animation when activeTab changes.
  const tabPositions: { x: number; w: number }[] = [];

  function switchToTab(i: number) {
    if (i === activeTab) return;
    tabFrom = activeTab;
    tabTransT = 0;
    tabs[activeTab].editor.focused = false;
    activeTab = i;
    tabs[i].editor.focused = true;
  }

  // Shared tab/file helpers — used by both left-click handling and the
  // context-menu actions so behaviour stays in one place.
  function closeTabAt(i: number) {
    if (tabs.length <= 1) return;
    tabFrom = -1;                // skip cross-fade on close
    tabs[i].editor.focused = false;
    tabs.splice(i, 1);
    if (activeTab > i) activeTab--;
    else if (activeTab >= tabs.length) activeTab = tabs.length - 1;
    focus = 'editor';
    tabs[activeTab].editor.focused = true;
  }

  function openFileNode(node: TreeNode) {
    const existing = tabs.findIndex(t => t.name === node.name);
    if (existing >= 0) { switchToTab(existing); }
    else {
      const ed = new CodeEditor('// ' + node.path + '\n');
      ed.fontSize = 15;
      tabs.push({ name: node.name, editor: ed });
      tabFrom = -1;  // no cross-fade for newly opened tabs
      activeTab = tabs.length - 1;
    }
    focus = 'editor';
    tabs[activeTab].editor.focused = true;
  }

  // Implementation of every context-menu capability (see menus.ts). Resolves
  // the active tab lazily so actions stay valid as tabs open/close.
  const actions: IdeMenuActions = {
    closeTab: (i) => closeTabAt(i),
    closeOtherTabs: (keep) => {
      tabFrom = -1;
      for (let i = tabs.length - 1; i >= 0; i--) if (i !== keep) tabs.splice(i, 1);
      activeTab = 0;
      focus = 'editor';
      tabs[0].editor.focused = true;
    },
    closeTabsToRight: (i) => {
      tabFrom = -1;
      while (tabs.length > i + 1) tabs.pop();
      if (activeTab > i) activeTab = i;
      tabs[activeTab].editor.focused = true;
    },
    openFile: (node) => openFileNode(node),
    toggleFolder: (path) => fileTree.toggleFolder(path),
    newFileIn: (folder) => {
      const name = prompt('New file name:');
      if (!name?.trim()) return;
      fileTree.addChild(folder.path, { name: name.trim(), path: folder.path + '/' + name.trim(), type: 'file' });
    },
    newFolderIn: (folder) => {
      const name = prompt('New folder name:');
      if (!name?.trim()) return;
      fileTree.addChild(folder.path, { name: name.trim(), path: folder.path + '/' + name.trim(), type: 'folder', children: [] });
    },
    renameNode: (node) => {
      const name = prompt('Rename:', node.name);
      if (name) fileTree.renameNode(node.path, name);
    },
    deleteNode: (node) => fileTree.removeNode(node.path),
    copyPath: (path) => { navigator.clipboard?.writeText(path).catch(() => {}); },
    canUndo: () => tabs[activeTab].editor.doc.canUndo(),
    canRedo: () => tabs[activeTab].editor.doc.canRedo(),
    hasSelection: () => tabs[activeTab].editor.hasSelection(),
    undo: () => tabs[activeTab].editor.undo(),
    redo: () => tabs[activeTab].editor.redo(),
    cut: () => {
      const ed = tabs[activeTab].editor;
      const t = ed.selectedText();
      if (!t) return;
      navigator.clipboard?.writeText(t).catch(() => {});
      ed.insertText('');
    },
    copy: () => {
      const t = tabs[activeTab].editor.selectedText();
      if (t) navigator.clipboard?.writeText(t).catch(() => {});
    },
    paste: () => {
      const ed = tabs[activeTab].editor;
      navigator.clipboard?.readText().then((t) => { if (t) ed.insertText(t.replace(/\r\n/g, '\n')); }).catch(() => {});
    },
    formatDocument: () => tabs[activeTab].editor.formatDocument(),
    toggleComment: () => tabs[activeTab].editor.toggleComment(),
    selectAll: () => tabs[activeTab].editor.selectAll(),
    clearTerminal: () => terminal.clear(),
    closeTerminal: () => {
      termOpen = false; termDir = -1;
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      terminal.focused = false;
    },
    hasQuery: () => searchQuery.length > 0,
    cutQuery: () => {
      if (searchQuery) navigator.clipboard?.writeText(searchQuery).catch(() => {});
      searchQuery = '';
      fileTree.setFilter('');
    },
    copyQuery: () => {
      if (searchQuery) navigator.clipboard?.writeText(searchQuery).catch(() => {});
    },
    pasteQuery: () => {
      navigator.clipboard?.readText().then((t) => {
        if (!t) return;
        searchQuery += t.replace(/\s+/g, ' ').trim();
        fileTree.setFilter(searchQuery);
        searchCaretPhase = 0;
      }).catch(() => {});
    },
    clearQuery: () => { searchQuery = ''; fileTree.setFilter(''); },
  };

  let mx = 0, my = 0;
  let fxMode: FxMode = 'cloth';
  const fxClicks: { x: number; y: number; t: number }[] = [];
  let fxXforms = new Float32Array(65536);
  let fx3dActive = false;
  let fwTiltTarget = -1;
  interface FwParticle { src: number; x: number; y: number; vx: number; vy: number; vz: number; z: number; rotX: number; rotY: number; spinX: number; spinY: number; birth: number; life: number; }
  const fwParticles: FwParticle[] = [];
  let dissolveT0 = -1;
  let logoT0 = -1;
  let logoTargets: Float32Array | null = null;
  let logoGlyphMap = new Map<number, number>();
  let d3 = { x: 0, y: 0, t: 0, moved: false, active: false };
  let dragSel = false, dragPX = 0, dragPY = 0;
  // "Fitted" = the camera frames the whole IDE (true at boot via enterOrbit
  // and after a double-click fit). While set, window resizes re-fit the camera
  // so the IDE keeps filling the screen; any manual navigation clears it.
  let fitted = true, fitW = cssW(), fitH = cssH();
  let hoverExplorer = false;
  let hoverTerminal = false;
  let hoverSource = -1;
  let hoverAction = -1;
  let hoverSearch = false;
  let hoverTab = -1;
  let prevNow = 0;
  let fpsDt = 16, lastFpsShown = 0, jsMs = 0, worstDt = 0;

  let depthTex: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
  let depthW = 0, depthH = 0;

  const inst: number[] = [];
  const crv: number[] = [];
  const rws: number[] = [];
  let instFA = new Float32Array(65536);
  // Separate screen-space buffers for the toolbar overlay (CinematicHud pattern)
  const toolInst: number[] = [];
  const toolCrv: number[] = [];
  const toolRws: number[] = [];
  let toolFA = new Float32Array(4096);
  let toolCrvFA = new Float32Array(4096);
  let toolRwsUA = new Uint32Array(1024);
  const toolVP = new Float32Array(16);
  const vp2d = new Float32Array(16);
  const uCamScale: number[] = [1, 1];
  const uCamCenter: number[] = [0, 0];
  const uHudScale: number[] = [1, 1];
  let crvFA = new Float32Array(65536);
  let rwsUA = new Uint32Array(16384);

  function ensureDepth(w: number, h: number): GPUTextureView {
    if (!depthTex || depthW !== w || depthH !== h) {
      depthTex?.destroy();
      depthTex = device.createTexture({ size: [w, h], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      depthView = depthTex.createView();
      depthW = w; depthH = h;
    }
    return depthView!;
  }

  function cssW() { return tCanvas.width / dpr; }
  function cssH() { return tCanvas.height / dpr; }

  function stepAnim(t: number, dir: number, dt: number): [number, number] {
    if (dir === 0) return [t, 0];
    let nt = t + dir * dt / ANIM_MS;
    let nd = dir;
    if (nt >= 1) { nt = 1; nd = 0; }
    if (nt <= 0) { nt = 0; nd = 0; }
    return [nt, nd];
  }

  function layout() {
    const w = cssW(), h = cssH();
    const sw = SIDEBAR_W * smoothstep(sidebarT);
    const termH = TERM_H * smoothstep(termT);
    const editorX = AB_W + sw;
    const editorW = w - editorX;
    const termPanelH = termH > 1 ? termH + TERM_HEADER_H : 0;
    const editorH = h - TAB_BAR_H - STATUS_H - termPanelH;

    fileTree.x0 = AB_W;
    fileTree.y0 = SB_TREE_Y;
    fileTree.width = SIDEBAR_W;
    fileTree.height = Math.max(120, h - SB_TREE_Y - STATUS_H);

    const ed = tabs[activeTab].editor;
    ed.x0 = editorX;
    ed.y0 = TAB_BAR_H;

    terminal.x0 = editorX;
    terminal.y0 = h - STATUS_H - termH;
    terminal.cols = Math.max(20, Math.floor((editorW - terminal.pad * 2) / (terminal.fontSize * 0.55)));
    terminal.rows = Math.max(4, Math.floor((termH - terminal.pad * 2 - terminal.lineHeight) / terminal.lineHeight));

    return { w, h, editorX, editorW, editorH, sw, termH };
  }

  function emitText(text: string, x: number, y: number, size: number, color: number[]) {
    layoutStr(inst, text, color, atlas.table, font, { x, y, size });
  }

  function emitIcon(name: string, x: number, y: number, w: number, h: number, color: number[]) {
    const gl = atlas.table[name];
    if (gl) layoutIcon(inst, gl, { x, y, w, h }, color);
  }

  function textW(text: string, size: number): number {
    const s = size / (font as any).unitsPerEm;
    let w = 0;
    for (const ch of text) w += advanceOf(font, ch) * s;
    return w;
  }

  function ring(x0: number, y0: number, x1: number, y1: number, c: number[]) {
    addRect(x0, y0, x1, y0 + 1, c, crv, rws, inst);
    addRect(x0, y1 - 1, x1, y1, c, crv, rws, inst);
    addRect(x0, y0, x0 + 1, y1, c, crv, rws, inst);
    addRect(x1 - 1, y0, x1, y1, c, crv, rws, inst);
  }

  function sourceTabGeom() {
    const x0 = AB_W + 10;
    const inner = SIDEBAR_W - 20;
    const tx0 = x0 + 1, ty0 = SB_TOOL_Y + 1, tw = inner - 2, th = SB_TOOL_H - 2;
    const tabs_: { x: number; w: number }[] = [];
    let cx = tx0 + 2;
    for (const s of SOURCES) {
      const w = textW(s.label, 11) + 16;
      tabs_.push({ x: cx, w });
      cx += w + 2;
    }
    const actW = 20, gap = 2;
    const actions: { x: number; icon: string; title: string }[] = [];
    let ax = tx0 + tw - 6 - actW;
    const push = (icon: string, title: string) => { actions.unshift({ x: ax, icon, title }); ax -= actW + gap; };
    push('icon:refresh', 'Refresh');
    push('icon:chevronUp', 'Collapse All');
    push('icon:chevron', 'Expand All');
    return { tx0, ty0, tw, th, tabs_, actions, actW };
  }

  function render(now: number) {
    const t0 = performance.now();
    const dt = prevNow ? Math.min(now - prevNow, 50) : 16;
    prevNow = now;
    fpsDt = fpsDt * 0.9 + dt * 0.1;
    if (dt > worstDt) worstDt = dt;
    searchCaretPhase += dt;

    [sidebarT, sidebarDir] = stepAnim(sidebarT, sidebarDir, dt);
    [termT, termDir] = stepAnim(termT, termDir, dt);
    if (cam3d) updateOrbit(dt);
    if (fwTiltTarget >= 0 && cam3d) {
      const polar = orbitPolar();
      if (Math.abs(polar - fwTiltTarget) > 0.01) {
        const k = 1 - Math.exp(-dt / 400);
        orbitSetAngles(orbitAzimuth(), polar + (fwTiltTarget - polar) * k);
      } else {
        fwTiltTarget = -1;
      }
    }

    // Advance tab cross-fade and accent animations.
    if (tabFrom >= 0) {
      tabTransT = Math.min(1, tabTransT + dt / TAB_TRANS_MS);
      if (tabTransT >= 1) tabFrom = -1;   // done
    }
    // Accent line — start it here on the frame where the switch was triggered.
    if (tabFrom >= 0 && !accentAnim && tabPositions.length > 0) {
      const oldPos = tabPositions[tabFrom];
      const newPos = tabPositions[activeTab];
      if (oldPos && newPos && (oldPos.x !== newPos.x || oldPos.w !== newPos.w)) {
        accentAnim = { fromX: oldPos.x, fromW: oldPos.w, toX: newPos.x, toW: newPos.w, start: now };
      }
    }
    if (accentAnim) {
      const t2 = Math.min(1, (now - accentAnim.start) / ACCENT_MS);
      if (t2 >= 1) accentAnim = null;
    }

    const { w, h, editorX, editorH, sw, termH } = layout();
    tabPositions.length = 0;  // rebuilt each frame

    // The IDE layout adapts to the canvas every frame; while fitted, keep the
    // camera framing in sync too (immediate re-fit, no animation).
    if (fitted && (w !== fitW || h !== fitH)) {
      fitW = w; fitH = h;
      orbitZoomToRect(0, 0, w, h, tCanvas.width, tCanvas.height, 1, false);
    }

    inst.length = 0; crv.length = 0; rws.length = 0;

    addRect(0, 0, w, h, T.editorBg, crv, rws, inst);

    // ── Activity bar ──
    addRect(0, 0, AB_W, h, T.activityBarBg, crv, rws, inst);
    const tile = 34, ty = 8;
    const tileX = (AB_W - tile) / 2;
    const active = sidebarT > 0.5;
    // Explorer icon tile
    if (active) {
      addRect(tileX - 3, ty - 3, tileX + tile + 3, ty + tile + 3, T.activeTileGlow, crv, rws, inst);
      addRect(tileX, ty, tileX + tile, ty + tile, T.activeTile, crv, rws, inst);
    } else if (hoverExplorer) {
      addRect(tileX, ty, tileX + tile, ty + tile, T.activityBarHover, crv, rws, inst);
    }
    emitIcon('icon:folder', tileX + 7, ty + 7, tile - 14, tile - 14, active ? T.activityBarActive : T.activityBarFg);
    // Separator between the top icon group and the bottom icon group
    const sepY = ty + tile + 10;
    addRect(0, sepY, AB_W, sepY + 1, T.separator, crv, rws, inst);
    // Terminal icon (bottom)
    const bty = h - STATUS_H - 12 - tile;
    const termActive = termT > 0.5;
    if (termActive) {
      addRect(tileX - 3, bty - 3, tileX + tile + 3, bty + tile + 3, T.activeTileGlow, crv, rws, inst);
      addRect(tileX, bty, tileX + tile, bty + tile, T.activeTile, crv, rws, inst);
    } else if (hoverTerminal) {
      addRect(tileX, bty, tileX + tile, bty + tile, T.activityBarHover, crv, rws, inst);
    }
    emitIcon('icon:code', tileX + 7, bty + 7, tile - 14, tile - 14, termActive ? T.activityBarActive : T.activityBarFg);
    addRect(AB_W - 1, 0, AB_W, h, T.border, crv, rws, inst);

    // ── Sidebar ──
    if (sw > 1) {
      addRect(AB_W, 0, AB_W + sw, h - STATUS_H, T.containerBg, crv, rws, inst);
      addRect(AB_W + sw - 1, 0, AB_W + sw, h - STATUS_H, T.border, crv, rws, inst);

      const op = smoothstep((sidebarT - 0.25) / 0.55);
      if (op > 0.01) {
        const contentStart = inst.length;
        const headSize = 16;
        emitText('FILE EXPLORER', AB_W + 12, ty + tile / 2 - headSize / 2, headSize, T.headerText);
        addRect(AB_W, SB_HEADER_H - 1, AB_W + sw, SB_HEADER_H, T.separator, crv, rws, inst);

        // Search box
        const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
        if (sx1 - sx0 > 40) {
          addRect(sx0, SB_SEARCH_Y, sx1, SB_SEARCH_Y + SB_SEARCH_H, searchFocused ? T.accent : T.searchBorder, crv, rws, inst);
          addRect(sx0 + 1, SB_SEARCH_Y + 1, sx1 - 1, SB_SEARCH_Y + SB_SEARCH_H - 1, T.searchBg, crv, rws, inst);
          emitIcon('icon:search', sx0 + 8, SB_SEARCH_Y + 9, 12, 12, T.magnifier);
          const tx = sx0 + 28, tBase = SB_SEARCH_Y + (SB_SEARCH_H - 12) / 2;
          if (searchQuery.length === 0 && !searchFocused) {
            emitText('Search files...', tx, tBase, 12, T.placeholder);
          } else {
            emitText(searchQuery, tx, tBase, 12, T.text);
            if (searchFocused && (searchCaretPhase % 1060) < 530) {
              const cx = tx + textW(searchQuery, 12);
              addRect(cx, SB_SEARCH_Y + 7, cx + 1, SB_SEARCH_Y + SB_SEARCH_H - 7, T.text, crv, rws, inst);
            }
          }
        }

        // Source toolbar
        const g = sourceTabGeom();
        const tbx1 = AB_W + sw - 10;
        if (tbx1 - g.tx0 > 40) {
          addRect(g.tx0, SB_TOOL_Y, tbx1, SB_TOOL_Y + SB_TOOL_H, T.searchBorder, crv, rws, inst);
          addRect(g.tx0 + 1, SB_TOOL_Y + 1, tbx1 - 1, SB_TOOL_Y + SB_TOOL_H - 1, T.searchBg, crv, rws, inst);
          for (let i = 0; i < SOURCES.length; i++) {
            const tb = g.tabs_[i];
            if (tb.x + tb.w > tbx1 - 80) break;
            const isActive = i === activeSource;
            if (isActive) {
              ring(tb.x, g.ty0, tb.x + tb.w, g.ty0 + g.th, T.accent);
              emitText(SOURCES[i].label, tb.x + 8, g.ty0 + (g.th - 11) / 2, 11, T.sidebarTabActiveFg);
            } else {
              const hov = i === hoverSource;
              if (hov) addRect(tb.x, g.ty0, tb.x + tb.w, g.ty0 + g.th, [1, 1, 1, 0.05], crv, rws, inst);
              emitText(SOURCES[i].label, tb.x + 8, g.ty0 + (g.th - 11) / 2, 11, T.sidebarTabFg);
            }
          }
          for (let i = 0; i < g.actions.length; i++) {
            const a = g.actions[i];
            if (a.x < g.tx0 + 4) continue;
            const hov = i === hoverAction;
            if (hov) addRect(a.x, g.ty0 + 3, a.x + g.actW, g.ty0 + g.th - 3, [1, 1, 1, 0.06], crv, rws, inst);
            emitIcon(a.icon, a.x + 4, g.ty0 + (g.th - 12) / 2, 12, 12, hov ? T.text : T.dim);
          }
        }

        addRect(AB_W, SB_TREE_Y - 4, AB_W + sw, SB_TREE_Y - 3, T.separator, crv, rws, inst);

        // Tree
        fileTree.hovered = null;
        if (sidebarT > 0.9 && mx >= AB_W && mx < AB_W + sw && my > SB_TREE_Y && my < h - STATUS_H && !searchFocused) {
          const row = fileTree.rowAtY(my);
          if (row) fileTree.hovered = row.node.path;
        }
        fileTree.render(font, atlas, inst, crv, rws, fileTree.y0, fileTree.y0 + fileTree.height, now, fileTreeTh);
        if (op < 1) {
          for (let i = contentStart; i < inst.length; i += 16) inst[i + 11] *= op;
        }
      }
    }

    // ── Editor tab bar ──
    addRect(editorX, 0, w, TAB_BAR_H, T.tabBarBg, crv, rws, inst);
    let tx = editorX + 4;
    for (let i = 0; i < tabs.length; i++) {
      const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
      tabPositions.push({ x: tx, w: tw2 });
      const isActive = i === activeTab;
      const hovered = i === hoverTab;
      if (isActive) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, T.tabActiveBg, crv, rws, inst);
      } else if (hovered) {
        addRect(tx, 0, tx + tw2, TAB_BAR_H, [1, 1, 1, 0.04], crv, rws, inst);
      }
      emitText(tabs[i].name, tx + TAB_PAD_L, (TAB_BAR_H - 12) / 2, 12, isActive ? T.tabActiveFg : T.tabFg);
      if (tabs.length > 1) {
        const cix = tx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ;
        const ciy = (TAB_BAR_H - TAB_CLOSE_SZ) / 2;
        const closeHov = i === hoverCloseTab;
        const closeCol = closeHov ? T.text : (isActive ? T.tabActiveFg : T.tabFg);
        if (closeHov) {
          // Subtle highlight behind hovered close icon
          addRect(cix - 2, ciy - 2, cix + TAB_CLOSE_SZ + 2, ciy + TAB_CLOSE_SZ + 2, [1, 1, 1, 0.08], crv, rws, inst);
        }
        emitIcon('icon:cross', cix, ciy, TAB_CLOSE_SZ, TAB_CLOSE_SZ, closeCol);
      }
      tx += tw2;
    }

    // Animated accent line — slides between old and new tab position on switch,
    // shrinking/growing with tab width. Pure GPU rect; CSS can't animate border
    // position independently from layout.
    {
      let ax: number, aw: number;
      if (accentAnim) {
        const t2 = Math.min(1, (now - accentAnim.start) / ACCENT_MS);
        const e = t2 < 1 ? 1 - Math.pow(1 - t2, 3) : 1;   // ease-out cubic
        ax = accentAnim.fromX + (accentAnim.toX - accentAnim.fromX) * e;
        aw = accentAnim.fromW + (accentAnim.toW - accentAnim.fromW) * e;
      } else {
        const pos = tabPositions[activeTab];
        ax = pos ? pos.x : 0;
        aw = pos ? pos.w : 0;
      }
      if (aw > 0) addRect(ax, TAB_BAR_H - 2, ax + aw, TAB_BAR_H, T.accent, crv, rws, inst);
    }

    // ── Editor ──
    const ed = tabs[activeTab].editor;
    ed.focused = focus === 'editor' && !searchFocused;
    const crossFade = tabFrom >= 0 && tabTransT < 1;
    if (crossFade) {
      const oldStart = inst.length;
      tabs[tabFrom].editor.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
      for (let k = oldStart; k < inst.length; k += 16) inst[k + 11] *= 1 - tabTransT;
      const newStart = inst.length;
      tabs[activeTab].editor.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
      for (let k = newStart; k < inst.length; k += 16) inst[k + 11] *= tabTransT;
    } else {
      ed.render(font, atlas, inst, crv, rws, ed.y0, ed.y0 + editorH, now, editorTh, 2);
    }

    // ── Terminal panel ──
    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      addRect(editorX, ty2, w, ty2 + TERM_HEADER_H, T.tabBarBg, crv, rws, inst);
      if (termT > 0.85) {
        emitText('TERMINAL', editorX + 12, ty2 + (TERM_HEADER_H - 11) / 2, 11, T.headerText);
        const closeX = w - 28, closeY = ty2 + TERM_HEADER_H / 2;
        addRect(closeX - 4, closeY - 0.5, closeX + 4, closeY + 0.5, T.headerText, crv, rws, inst);
        addRect(closeX - 0.5, closeY - 4, closeX + 0.5, closeY + 4, T.headerText, crv, rws, inst);
      }
      addRect(editorX, ty2 + TERM_HEADER_H - 1, w, ty2 + TERM_HEADER_H, T.border, crv, rws, inst);
      if (termT > 0.85) {
        terminal.focused = focus === 'terminal';
        terminal.render(font, atlas, inst, crv, rws, now, dt, terminalTh, 2);
      }
    }

    // ── Status bar ──
    addRect(0, h - STATUS_H, w, h, T.statusbarBg, crv, rws, inst);
    emitText('main', 10, h - STATUS_H + (STATUS_H - 11) / 2, 11, T.statusbarFg);
    if (fxMode !== 'off') {
      const fxLabel = 'fx: ' + fxMode;
      emitText(fxLabel, 70, h - STATUS_H + (STATUS_H - 11) / 2, 11, [0.365, 0.839, 1.0, 0.9]);
    }
    const right = 'UTF-8  ·  TypeScript  ·  Ln ' + (ed.cursor.line + 1) + ', Col ' + (ed.cursor.col + 1);
    emitText(right, w - textW(right, 11) - 14, h - STATUS_H + (STATUS_H - 11) / 2, 11, [1, 1, 1, 0.85]);

    // ── App frame ─
    addRect(0, 0, w, 1, T.separator, crv, rws, inst);
    addRect(0, h - 1, w, h, T.separator, crv, rws, inst);
    addRect(0, 1, 1, h - 1, T.separator, crv, rws, inst);
    addRect(w - 1, 1, w, h - 1, T.separator, crv, rws, inst);

    // Toolbar overlay — backing-store coords + separate HUD renderer,
    // identical to how CinematicHud works in the explainer v2.
    toolInst.length = 0; toolCrv.length = 0; toolRws.length = 0;
    const Cw = tCanvas.width, Ch = tCanvas.height;
    toolbar.setScreen(Cw, Ch, 8 * dpr, 5 * dpr, 26 * dpr);
    toolbar.render(toolInst, toolCrv, toolRws, now);

    gate.setViewport(w, h);

    gate.setViewport(w, h);
    gate.menu.render(font, atlas, inst, crv, rws, ANALYTIC_MENU_THEME);

    // ── Draw
    if (inst.length > instFA.length) instFA = new Float32Array(inst.length * 2);
    let vp: Float32Array;
    let cs: number;
    if (cam3d) {
      vp = orbitViewProj(Cw, Ch);
      cs = orbitScale(Ch);
      instFA.set(inst);
    } else {
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < inst.length; i += 16) {
        instFA[i] = inst[i] - cx;
        instFA[i + 1] = inst[i + 1] - cy;
        for (let j = 2; j < 16; j++) instFA[i + j] = inst[i + j];
      }
      const sxm = (2 * dpr) / Cw, sym = (2 * dpr) / Ch;
      vp2d[0] = sxm; vp2d[5] = -sym; vp2d[10] = 0; vp2d[15] = 1;
      vp = vp2d;
      cs = dpr;
    }
    if (fxMode === 'logo' && logoT0 < 0) {
      logoT0 = now;
      logoGlyphMap.clear();
      let gCount = 0;
      for (let i = 0; i < inst.length; i += 16) {
        if (inst[i + 3] < 1.5) logoGlyphMap.set(i, gCount++);
      }
      const cell = 7;
      const gw = Math.floor(w * 0.72 / cell), gh = Math.floor(h * 0.62 / cell);
      const gx0 = w * 0.14, gy0 = h * 0.19;
      const strokeW = 0.11;
      const cells: number[] = [];
      for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
        if (wSDF((c + 0.5) / gw, (r + 0.5) / gh) < strokeW) cells.push(gx0 + (c + 0.5) * cell, gy0 + (r + 0.5) * cell);
      }
      const nc = cells.length / 2;
      logoTargets = new Float32Array(gCount * 2);
      for (let g = 0; g < gCount; g++) {
        const ci = nc > 0 ? g % nc : 0;
        logoTargets[g * 2] = nc > 0 ? cells[ci * 2] : w / 2;
        logoTargets[g * 2 + 1] = nc > 0 ? cells[ci * 2 + 1] : h / 2;
      }
    }
    if (fxMode !== 'logo' && logoT0 >= 0) { logoT0 = -1; logoTargets = null; logoGlyphMap.clear(); }

    fx3dActive = fxMode === 'fireworks' && fxClicks.length > 0;
    if (fx3dActive) {
      const need = (inst.length / 16) * 4;
      if (fxXforms.length < need) fxXforms = new Float32Array(need * 2);
      fxXforms.fill(0, 0, need);
    }

    if (fxMode !== 'off') {
      const t = now / 1000;
      const invW = 1 / Math.max(w, 1);
      const n = inst.length;
      for (let i = 0; i < n; i += 16) {
        const wx = inst[i], wy = inst[i + 1];
        const glyph = inst[i + 3] < 1.5;
        const h = fxHash(i);
        let ox = 0, oy = 0;

        if (fxMode === 'cloth') {
          if (glyph) {
            const dx = wx - mx, dy = wy - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < REP_R2 && d2 > 1) {
              const d = Math.sqrt(d2), f = 1 - d / REP_R, s = REP_STR * f * f;
              ox = (dx / d) * s; oy = (dy / d) * s;
            }
          }
          const frac = wx * invW;
          ox += CLOTH_AX * Math.sin(wy * CLOTH_FY - t * CLOTH_SY) * frac;
          oy += CLOTH_AY * Math.sin(wx * CLOTH_FX - t * CLOTH_SX) * frac;

        } else if (fxMode === 'matrix') {
          const col = Math.floor(wx / 9);
          const speed = 40 + fxHash(col * 7) * 80;
          const phase = fxHash(col * 13) * 600;
          oy += ((t * speed + phase) % 70) - 35;
          const flicker = Math.sin(t * (3 + h * 5) + h * 40) * 0.5 + 0.5;
          if (glyph) {
            instFA[i + 8] = 0.1 + 0.15 * flicker;
            instFA[i + 9] = 0.7 + 0.3 * flicker;
            instFA[i + 10] = 0.15 + 0.1 * flicker;
            instFA[i + 11] *= 0.35 + 0.65 * flicker;
          }

        } else if (fxMode === 'heartbeat') {
          const cx = w * 0.5, cy = 300;
          const dx = wx - cx, dy = wy - cy;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const beat = t % 1.1;
          const pulse = beat < 0.12 ? Math.sin(beat / 0.12 * Math.PI) : beat < 0.28 ? 0.6 * Math.sin((beat - 0.12) / 0.16 * Math.PI) : 0;
          const wave = Math.max(0, pulse - d * 0.0012);
          if (glyph) {
            instFA[i + 2] *= 1 + wave * 0.22;
            instFA[i + 8] = Math.min(1, inst[i + 8] + wave * 0.7);
            instFA[i + 9] *= 1 - wave * 0.4;
            instFA[i + 10] *= 1 - wave * 0.4;
          }
          ox += (dx / d) * wave * 5;
          oy += (dy / d) * wave * 5;

        } else if (fxMode === 'glitch') {
          const sliceY = Math.floor(wy / 18);
          const sliceH = fxHash(sliceY * 31 + Math.floor(t * 8));
          if (sliceH > 0.7) {
            ox += (fxHash(sliceY * 17 + Math.floor(t * 12)) - 0.5) * 30 * ((sliceH - 0.7) / 0.3);
          }
          if (glyph && h > 0.88) {
            ox += (Math.sin(t * 47 + h * 100) > 0 ? 1 : -1) * 3;
            oy += (Math.cos(t * 53 + h * 200) > 0 ? 1 : -1) * 2;
            const ch = Math.floor(t * 14 + h * 10) % 3;
            if (ch === 0) { instFA[i + 8] = 1; instFA[i + 9] = 0.1; instFA[i + 10] = 0.1; }
            else if (ch === 1) { instFA[i + 8] = 0.1; instFA[i + 9] = 1; instFA[i + 10] = 0.2; }
            else { instFA[i + 8] = 0.2; instFA[i + 9] = 0.3; instFA[i + 10] = 1; }
          }
          if (glyph && h > 0.95) instFA[i + 11] *= Math.sin(t * 30 + h * 50) > 0 ? 1 : 0.15;

        } else if (fxMode === 'aurora') {
          oy += 3.5 * Math.sin(wx * 0.018 + t * 0.7) + 2 * Math.sin(wx * 0.031 - t * 1.1);
          ox += 1.5 * Math.cos(wy * 0.022 + t * 0.5);
          if (glyph) {
            const hue = (wx * 0.003 + wy * 0.002 + t * 0.15) % 1;
            const r = Math.abs(hue * 6 - 3) - 1;
            const g = 2 - Math.abs(hue * 6 - 2);
            const b = 2 - Math.abs(hue * 6 - 4);
            instFA[i + 8] = Math.max(0, Math.min(1, r)) * 0.7 + inst[i + 8] * 0.3;
            instFA[i + 9] = Math.max(0, Math.min(1, g)) * 0.7 + inst[i + 9] * 0.3;
            instFA[i + 10] = Math.max(0, Math.min(1, b)) * 0.7 + inst[i + 10] * 0.3;
          }
          instFA[i + 2] *= 1 + 0.06 * Math.sin(t * 1.8 + wx * 0.01);

        } else if (fxMode === 'fireworks') {
          for (let r = fxClicks.length - 1; r >= 0; r--) {
            const c = fxClicks[r];
            const age = t - c.t;
            if (age > FW_LIFE) { fxClicks.splice(r, 1); continue; }
            const dx = wx - c.x, dy = wy - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > FW_R2 || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const f = 1 - d / FW_R;
            const ease = 1 - Math.pow(1 - Math.min(age / 0.2, 1), 3);
            const decay = Math.max(0, 1 - age / FW_LIFE);
            const s = FW_STR * f * ease * decay;
            ox += (dx / d) * s;
            oy += (dy / d) * s * 0.4;
            if (glyph) {
              const zLaunch = FW_Z_STR * f * ease;
              const zGrav = 0.5 * FW_GRAV * age * age;
              const z = Math.max(0, zLaunch * decay - zGrav * f * decay);
              const spinPhase = h * 6.283;
              const rotX = Math.sin(age * FW_SPIN + spinPhase) * f * decay * 1.8;
              const rotY = Math.cos(age * FW_SPIN * 0.7 + spinPhase * 1.3) * f * decay * 2.2;
              const sc = 1 + f * ease * decay * 0.3;
              const xi = (i / 16) * 4;
              fxXforms[xi] = rotX;
              fxXforms[xi + 1] = rotY;
              fxXforms[xi + 2] = z;
              fxXforms[xi + 3] = sc;
              const warm = f * decay;
              instFA[i + 8] = Math.min(1, inst[i + 8] + warm * 0.8);
              instFA[i + 9] = Math.min(1, inst[i + 9] + warm * 0.35);
              instFA[i + 10] *= 1 - warm * 0.5;
              instFA[i + 11] *= 0.4 + 0.6 * decay;
            }
          }

        } else if (fxMode === 'blackhole') {
          if (glyph) {
            const dx = wx - mx, dy = wy - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < BH_R2 && d2 > 1) {
              const d = Math.sqrt(d2);
              const pull = 1 - d / BH_R;
              const swirl = pull * pull * 42;
              const inv = 1 / d;
              ox += (-dy * inv * swirl - dx * inv * pull * 18);
              oy += (dx * inv * swirl - dy * inv * pull * 18);
              if (d < BH_CORE) {
                const crush = 1 - d / BH_CORE;
                instFA[i + 2] *= Math.max(0.05, 1 - crush * 0.95);
                instFA[i + 11] *= 1 - crush;
                instFA[i + 8] = Math.min(1, inst[i + 8] + crush * 0.6);
                instFA[i + 9] *= 1 - crush * 0.7;
                instFA[i + 10] *= 1 - crush * 0.9;
              } else if (d < BH_CORE * 2.5) {
                const ring = 1 - Math.abs(d - BH_CORE * 1.6) / (BH_CORE * 0.9);
                if (ring > 0) {
                  instFA[i + 2] *= 1 + ring * 0.5;
                  instFA[i + 8] = Math.min(1, inst[i + 8] + ring * 0.5);
                  instFA[i + 9] = Math.min(1, inst[i + 9] + ring * 0.25);
                }
              }
            }
          }

        } else if (fxMode === 'supernova') {
          for (let r = fxClicks.length - 1; r >= 0; r--) {
            const c = fxClicks[r];
            const age = t - c.t;
            if (age > SN_LIFE) { fxClicks.splice(r, 1); continue; }
            const dx = wx - c.x, dy = wy - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > SN_R2 || d2 < 1) continue;
            const d = Math.sqrt(d2);
            const ring = age * SN_SPEED;
            const behind = d < ring;
            const fade = Math.max(0, 1 - age / SN_LIFE);
            if (behind) {
              const scorch = Math.max(0, 1 - (ring - d) / 80) * fade;
              if (glyph && scorch > 0.01) {
                instFA[i + 8] = Math.min(1, inst[i + 8] + scorch);
                instFA[i + 9] = Math.min(1, inst[i + 9] + scorch * 0.85);
                instFA[i + 10] = Math.min(1, inst[i + 10] + scorch * 0.6);
                instFA[i + 2] *= 1 - scorch * 0.55;
                instFA[i + 11] *= 1 - scorch * 0.7;
              }
            }
            const dw = Math.abs(d - ring);
            if (dw < 30) {
              const crest = (1 - dw / 30) * fade;
              const inv = 1 / d;
              ox += dx * inv * crest * 22;
              oy += dy * inv * crest * 22;
              if (glyph) {
                instFA[i + 2] *= 1 + crest * 0.4;
                instFA[i + 8] = Math.min(1, inst[i + 8] + crest * 0.9);
                instFA[i + 9] = Math.min(1, inst[i + 9] + crest * 0.7);
                instFA[i + 10] = Math.min(1, inst[i + 10] + crest * 0.3);
              }
            }
          }

        } else if (fxMode === 'dissolve') {
          if (dissolveT0 >= 0) {
            const elapsed = now - dissolveT0;
            const sweep = (elapsed / DISSOLVE_MS) * (w + 200) - 100;
            const threshold = h * 120;
            const local = sweep - wx + threshold;
            if (local > 0) {
              const prog = Math.min(local / 90, 1);
              const ease = prog * prog;
              if (glyph) {
                instFA[i + 11] *= 1 - ease;
                instFA[i + 2] *= 1 - ease * 0.6;
                oy += ease * 14;
                ox += (h - 0.5) * ease * 20;
                const ember = ease * (1 - ease) * 4;
                instFA[i + 8] = Math.min(1, inst[i + 8] + ember * 0.7);
                instFA[i + 9] = Math.min(1, inst[i + 9] + ember * 0.25);
              } else {
                instFA[i + 11] *= 1 - ease * 0.85;
              }
            }
            if (elapsed > DISSOLVE_MS + 1200) dissolveT0 = -1;
          }

        } else if (fxMode === 'earthquake') {
          const mag = Math.sin(t * 0.4) * 0.5 + 0.5;
          const amp = mag * mag * 7;
          const depthPhase = wy * 0.008;
          ox += amp * Math.sin(t * 23 + depthPhase) * (0.5 + h * 0.5);
          oy += amp * 0.6 * Math.cos(t * 19 + depthPhase * 1.3);
          const waveX = ((t * 200) % (w + 300)) - 150;
          const dw = Math.abs(wx - waveX);
          if (dw < 60) {
            const crest = (1 - dw / 60) * mag;
            oy -= crest * 12;
            if (glyph) instFA[i + 2] *= 1 + crest * 0.15;
          }
          if (glyph && mag > 0.7 && h > 0.92) {
            instFA[i + 11] *= 0.4 + 0.6 * Math.abs(Math.sin(t * 40 + h * 80));
          }

        } else if (fxMode === 'logo' && logoTargets) {
          const elapsed = (now - logoT0) / 1000;
          const prog = Math.min(elapsed / 3.2, 1);
          const ease = prog < 0.5 ? 4 * prog * prog * prog : 1 - Math.pow(-2 * prog + 2, 3) / 2;
          const gi = logoGlyphMap.get(i);
          if (gi !== undefined) {
            const tx = logoTargets[gi * 2], ty = logoTargets[gi * 2 + 1];
            const lx = inst[i], ly = inst[i + 1];
            instFA[i] = lx + (tx - lx) * ease;
            instFA[i + 1] = ly + (ty - ly) * ease;
            const wave = ease * 0.14 * Math.sin(tx * 0.045 + t * 2.6) * Math.cos(ty * 0.035 + t * 1.8);
            instFA[i + 2] = inst[i + 2] * (1 - ease * 0.35 + wave);
            instFA[i + 1] += ease * 3.5 * Math.sin(tx * 0.03 + t * 1.4);
            const hue = (tx * 0.004 + ty * 0.003 + t * 0.12) % 1;
            const cr = Math.max(0, Math.min(1, Math.abs(hue * 6 - 3) - 1));
            const cg = Math.max(0, Math.min(1, 2 - Math.abs(hue * 6 - 2)));
            const cb = Math.max(0, Math.min(1, 2 - Math.abs(hue * 6 - 4)));
            instFA[i + 8] = inst[i + 8] * (1 - ease) + cr * ease;
            instFA[i + 9] = inst[i + 9] * (1 - ease) + cg * ease;
            instFA[i + 10] = inst[i + 10] * (1 - ease) + cb * ease;
            continue;
          }
          instFA[i + 11] *= 1 - ease;
          continue;
        }

        instFA[i] += ox;
        instFA[i + 1] += oy;
      }
    }
    if (crv.length > crvFA.length) crvFA = new Float32Array(crv.length * 2);
    crvFA.set(crv);
    if (rws.length > rwsUA.length) rwsUA = new Uint32Array(rws.length * 2);
    rwsUA.set(rws);

    let totalInst = inst.length;
    if (fwParticles.length > 0 && fxMode === 'fireworks') {
      const t = now / 1000;
      const grav = 320;
      let alive = 0;
      const extraCap = fwParticles.length * 16;
      if (instFA.length < inst.length + extraCap) instFA = new Float32Array((inst.length + extraCap) * 2);
      const xNeed = ((inst.length / 16) + fwParticles.length) * 4;
      if (fxXforms.length < xNeed) fxXforms = new Float32Array(xNeed * 2);
      for (let p = 0; p < fwParticles.length; p++) {
        const pt = fwParticles[p];
        const age = t - pt.birth;
        if (age > pt.life) continue;
        const prog = age / pt.life;
        const fade = 1 - prog * prog;
        pt.x += pt.vx * (1 / 60); pt.y += pt.vy * (1 / 60);
        pt.vz -= grav * (1 / 60);
        pt.z = Math.max(0, pt.z + pt.vz * (1 / 60));
        pt.rotX += pt.spinX * (1 / 60);
        pt.rotY += pt.spinY * (1 / 60);
        const dst = totalInst;
        for (let j = 0; j < 16; j++) instFA[dst + j] = inst[pt.src + j];
        instFA[dst] = pt.x;
        instFA[dst + 1] = pt.y;
        instFA[dst + 8] = Math.min(1, inst[pt.src + 8] + fade * 0.6);
        instFA[dst + 9] = Math.min(1, inst[pt.src + 9] + fade * 0.3);
        instFA[dst + 10] = inst[pt.src + 10] * (1 - fade * 0.4);
        instFA[dst + 11] = inst[pt.src + 11] * fade;
        const xi = (dst / 16) * 4;
        fxXforms[xi] = pt.rotX;
        fxXforms[xi + 1] = pt.rotY;
        fxXforms[xi + 2] = pt.z;
        fxXforms[xi + 3] = 0.7 + fade * 0.5;
        totalInst += 16;
        fwParticles[alive++] = pt;
      }
      fwParticles.length = alive;
      fx3dActive = true;
    }

    const dv = ensureDepth(Cw, Ch);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: gpuCtx.getCurrentTexture().createView(), clearValue: { r: T.editorBg[0], g: T.editorBg[1], b: T.editorBg[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: dv, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    uCamScale[0] = cs; uCamScale[1] = cs;
    const instCount = totalInst / 16;
    renderer.setUniforms({ width: Cw, height: Ch, camScale: uCamScale, camCenter: uCamCenter, viewProj: vp, fxActive: fx3dActive ? 1 : 0 });
    renderer.draw(pass, crvFA.subarray(0, crv.length), rwsUA.subarray(0, rws.length), instFA.subarray(0, totalInst), instCount, fx3dActive ? fxXforms.subarray(0, instCount * 4) : undefined);

    // Toolbar overlay — EXACT CinematicHud pattern (backing-store px + screen-ortho matrix)
    if (toolInst.length > 0) {
      if (toolInst.length > toolFA.length) toolFA = new Float32Array(toolInst.length * 2);
      toolFA.set(toolInst);
      if (toolCrv.length > toolCrvFA.length) toolCrvFA = new Float32Array(toolCrv.length * 2);
      toolCrvFA.set(toolCrv);
      if (toolRws.length > toolRwsUA.length) toolRwsUA = new Uint32Array(toolRws.length * 2);
      toolRwsUA.set(toolRws);
      toolVP[0] = 2 / Cw; toolVP[5] = -2 / Ch; toolVP[10] = 0; toolVP[12] = -1; toolVP[13] = 1; toolVP[15] = 1;
      hudRenderer.setUniforms({ width: Cw, height: Ch, camScale: uHudScale, camCenter: uCamCenter, viewProj: toolVP });
      hudRenderer.draw(pass, toolCrvFA.subarray(0, toolCrv.length), toolRwsUA.subarray(0, toolRws.length), toolFA.subarray(0, toolInst.length), toolInst.length / 16);
    }

    pass.end();
    device.queue.submit([enc.finish()]);

    jsMs = performance.now() - t0;
    if (now - lastFpsShown > 120) {
      lastFpsShown = now;
      fpsEl.textContent = `${Math.round(1000 / fpsDt)} fps  ·  js ${jsMs.toFixed(1)}ms  ·  worst ${worstDt.toFixed(0)}ms`;
      worstDt = 0;
    }
  }

  function toWorld(e: MouseEvent): [number, number] {
    const r = tCanvas.getBoundingClientRect();
    return [(e.clientX - r.left), (e.clientY - r.top)];
  }

  function hitSidebarChrome(): 'search' | { kind: 'source'; i: number } | { kind: 'action'; i: number } | null {
    if (sidebarT <= 0.9) return null;
    const sw = SIDEBAR_W * smoothstep(sidebarT);
    if (mx < AB_W || mx >= AB_W + sw) return null;
    const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
    if (my >= SB_SEARCH_Y && my < SB_SEARCH_Y + SB_SEARCH_H && mx >= sx0 && mx <= sx1) return 'search';
    if (my >= SB_TOOL_Y && my < SB_TOOL_Y + SB_TOOL_H) {
      const g = sourceTabGeom();
      for (let i = 0; i < g.actions.length; i++) {
        const a = g.actions[i];
        if (mx >= a.x - 2 && mx <= a.x + g.actW + 2) return { kind: 'action', i };
      }
      for (let i = 0; i < SOURCES.length; i++) {
        const tb = g.tabs_[i];
        if (mx >= tb.x && mx <= tb.x + tb.w) return { kind: 'source', i };
      }
    }
    return null;
  }

  function onPointerMove(e: PointerEvent) {
    rg.move(e.clientX, e.clientY);
    [mx, my] = toWorld(e);
    const scrMx = mx, scrMy = my;   // raw CSS pixels for toolbar hit-test
    if (cam3d) {
      if (d3.active && (Math.abs(e.clientX - d3.x) > 5 || Math.abs(e.clientY - d3.y) > 5)) d3.moved = true;
      const p = screenToDocLocal(mx * dpr, my * dpr, tCanvas.width, tCanvas.height);
      mx = p.x; my = p.y;
      if (d3.active && d3.moved) {
        if (dragSel) tabs[activeTab].editor.placeCursor(mx, my, true);
        else { orbitTruck((e.clientX - dragPX) * dpr, (e.clientY - dragPY) * dpr, tCanvas.height); fitted = false; }
      }
      dragPX = e.clientX; dragPY = e.clientY;
    }
    hoverExplorer = false; hoverTerminal = false; hoverSource = -1; hoverAction = -1; hoverSearch = false; hoverTab = -1;

    const tile = 34, ty = 8, tileX = (AB_W - tile) / 2;
    if (mx < AB_W) {
      if (my >= ty && my <= ty + tile) hoverExplorer = true;
      const bty = cssH() - STATUS_H - 12 - tile;
      if (my >= bty && my <= bty + tile) hoverTerminal = true;
    }

    const chrome = hitSidebarChrome();
    if (chrome === 'search') hoverSearch = true;
    else if (chrome && chrome.kind === 'source') hoverSource = chrome.i;
    else if (chrome && chrome.kind === 'action') hoverAction = chrome.i;

    const { editorX, editorH } = layout();
    hoverCloseTab = -1;
    if (my < TAB_BAR_H && mx >= editorX) {
      let txx = editorX + 4;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (mx >= txx && mx <= txx + tw2) {
          hoverTab = i;
          // Check if pointer is over the close icon sub-area
          if (tabs.length > 1) {
            const cix = txx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ;
            const ciy = (TAB_BAR_H - TAB_CLOSE_SZ) / 2;
            if (mx >= cix && mx <= cix + TAB_CLOSE_SZ && my >= ciy && my <= ciy + TAB_CLOSE_SZ) {
              hoverCloseTab = i;
            }
          }
          break;
        }
        txx += tw2;
      }
    }

    toolbar.updateHover(scrMx * dpr, scrMy * dpr);
    gate.updateHover(mx, my);
    const overChrome = hoverExplorer || hoverTerminal || hoverSearch || hoverSource >= 0 || hoverAction >= 0 || hoverTab >= 0;
    const overEditorBody = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    rCanvas.style.cursor = resolveCursor({
      menuCursor: gate.resolveCursor() ?? toolbar.cursor,
      overText: hoverSearch || overEditorBody,
      overChrome,
    });
  }

  function blurSearch() { searchFocused = false; focus = 'editor'; tabs[activeTab].editor.focused = true; }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2) { rg.press(e.clientX, e.clientY); setOrbitPanChord(true); fitted = false; gate.dismiss(); return; }
    if (e.button === 1) { fitted = false; return; }
    if (e.button !== 0) return;

    // Toolbar uses backing-store coords (CinematicHud pattern).
    // Use raw screen CSS px from this event, not potentially-transformed mx/my.
    {
      const [sx, sy] = toWorld(e);
      const tbHit = toolbar.hitTest(sx * dpr, sy * dpr);
      if (tbHit) { tbHit.onClick(); return; }
    }

    let [wx, wy] = toWorld(e);
    if (cam3d) { const p = screenToDocLocal(wx * dpr, wy * dpr, tCanvas.width, tCanvas.height); wx = p.x; wy = p.y; }
    if (gate.consumeClick(wx, wy)) return;
    if ((fxMode === 'fireworks' || fxMode === 'supernova') && fxClicks.length < 10) {
      fxClicks.push({ x: wx, y: wy, t: performance.now() / 1000 });
      if (fxMode === 'fireworks' && cam3d) {
        if (orbitPolar() < 0.35) fwTiltTarget = 0.55;
        const now_s = performance.now() / 1000;
        const glyphIdxs: number[] = [];
        for (let gi = 0; gi < inst.length; gi += 16) {
          if (inst[gi + 3] < 1.5) {
            const dx = inst[gi] - wx, dy = inst[gi + 1] - wy;
            if (dx * dx + dy * dy < FW_R2) glyphIdxs.push(gi);
          }
        }
        const count = Math.min(glyphIdxs.length, 40);
        for (let p = 0; p < count; p++) {
          const src = glyphIdxs[Math.floor(fxHash(p * 77 + fxClicks.length * 13) * glyphIdxs.length)];
          const ang = fxHash(p * 31 + fxClicks.length * 7) * Math.PI * 2;
          const spd = 60 + fxHash(p * 53) * 140;
          fwParticles.push({
            src, x: inst[src], y: inst[src + 1],
            vx: Math.cos(ang) * spd * 0.4, vy: Math.sin(ang) * spd * 0.3,
            vz: 180 + fxHash(p * 19) * 200, z: 0,
            rotX: 0, rotY: 0,
            spinX: (fxHash(p * 41) - 0.5) * 10, spinY: (fxHash(p * 67) - 0.5) * 12,
            birth: now_s, life: 1.8 + fxHash(p * 23) * 1.2,
          });
        }
      }
    }
    if (fxMode === 'dissolve' && dissolveT0 < 0) dissolveT0 = performance.now();
    [mx, my] = toWorld(e);
    if (cam3d) {
      d3 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, active: true };
      dragPX = e.clientX; dragPY = e.clientY;
      // A press inside the editor body anchors a drag-selection (the caret is
      // placed now so the drag extends from here); elsewhere a drag pans.
      const p = screenToDocLocal(mx * dpr, my * dpr, tCanvas.width, tCanvas.height);
      const { editorX, editorH } = layout();
      if (!searchFocused && p.x >= editorX && p.y >= TAB_BAR_H && p.y < TAB_BAR_H + editorH) {
        dragSel = true;
        focus = 'editor';
        const ed = tabs[activeTab].editor;
        ed.focused = true;
        ed.placeCursor(p.x, p.y, e.shiftKey);
        if (!e.shiftKey) ed.anchor = { line: ed.cursor.line, col: ed.cursor.col };
      }
      return;
    }
    handlePick(mx, my, e.shiftKey);
  }

  function handlePick(px: number, py: number, shift: boolean) {
    mx = px; my = py;
    const { w, h, editorX, editorH, sw, termH } = layout();
    const tile = 34, ty = 8;

    // Multi-click tracking (400ms / ~6px). On the editor body clicks escalate
    // caret → token → line → all; on any other NON-TEXT surface the second
    // click fits the whole IDE to the screen — the IDE is the "UI component"
    // here, mirroring yasmineOS's double-click → HybridUIComponent.zoom.
    const inEditor = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    const overSearch = sw > 1 && sidebarT > 0.9 && mx >= AB_W + 10 && mx <= AB_W + sw - 10 && my >= SB_SEARCH_Y && my <= SB_SEARCH_Y + SB_SEARCH_H;
    const clickCount = mct.track(mx, my);
    if (!inEditor && !overSearch && clickCount === 2) {
      mct.reset();
      orbitZoomToRect(0, 0, cssW(), cssH(), tCanvas.width, tCanvas.height);
      fitted = true; fitW = cssW(); fitH = cssH();
    }

    if (mx < AB_W) {
      if (my >= ty && my <= ty + tile) {
        sidebarOpen = !sidebarOpen;
        sidebarDir = sidebarOpen ? 1 : -1;
        if (!sidebarOpen && searchFocused) blurSearch();
      }
      const bty = h - STATUS_H - 12 - tile;
      if (my >= bty && my <= bty + tile) {
        termOpen = !termOpen;
        termDir = termOpen ? 1 : -1;
        if (termOpen) { focus = 'terminal'; terminal.focused = true; tabs[activeTab].editor.focused = false; }
        else { focus = 'editor'; tabs[activeTab].editor.focused = true; terminal.focused = false; }
      }
      return;
    }

    const chrome = hitSidebarChrome();
    if (chrome === 'search') {
      searchFocused = true;
      tabs[activeTab].editor.focused = false;
      searchCaretPhase = 0;
      return;
    }
    if (chrome && chrome.kind === 'source') {
      const i = chrome.i;
      if (i !== activeSource) {
        activeSource = i;
        fileTree.setRoots(SOURCES[i].roots, SOURCES[i].expanded);
        searchQuery = '';
      }
      if (searchFocused) blurSearch();
      return;
    }
    if (chrome && chrome.kind === 'action') {
      const i = chrome.i;
      if (i === 0) fileTree.expandAll();
      else if (i === 1) fileTree.collapseAll();
      else fileTree.refresh();
      if (searchFocused) blurSearch();
      return;
    }

    if (sw > 1 && mx >= AB_W && mx < AB_W + sw && my >= SB_TREE_Y && my < h - STATUS_H && sidebarT > 0.9) {
      if (searchFocused) blurSearch();
      const row = fileTree.rowAtY(my);
      if (row) {
        if (fileTree.isOnChevron(mx, row) || row.node.type === 'folder') {
          fileTree.toggleFolder(row.node.path);
        } else {
          fileTree.select(row.node.path);
          if (row.node.type === 'file') openFileNode(row.node);
        }
      }
      return;
    }

    if (searchFocused) { blurSearch(); return; }

    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      if (my >= ty2 && my < ty2 + TERM_HEADER_H) {
        const closeX = w - 28;
        if (Math.abs(mx - closeX) < 10) {
          termOpen = false; termDir = -1;
          focus = 'editor'; tabs[activeTab].editor.focused = true; terminal.focused = false;
        }
        return;
      }
      if (my >= ty2 + TERM_HEADER_H && my < h - STATUS_H) {
        focus = 'terminal'; terminal.focused = true; tabs[activeTab].editor.focused = false;
        return;
      }
    }

    if (my < TAB_BAR_H && mx >= editorX) {
      let txx = editorX + 4;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (mx >= txx && mx <= txx + tw2) {
          const closeCx = txx + tw2 - TAB_PAD_R - TAB_CLOSE_SZ / 2;
          if (Math.abs(mx - closeCx) < TAB_CLOSE_SZ && tabs.length > 1) {
            closeTabAt(i);
          } else {
            switchToTab(i);
            focus = 'editor';
          }
          return;
        }
        txx += tw2;
      }
      return;
    }

    if (mx >= editorX && my >= TAB_BAR_H && my < h - STATUS_H) {
      focus = 'editor';
      const ed = tabs[activeTab].editor;
      ed.focused = true;
      if (shift) ed.placeCursor(mx, my, true);
      else if (clickCount === 2) ed.selectTokenAt(mx, my);
      else if (clickCount === 3) ed.selectLineAt(my);
      else if (clickCount >= 4) { ed.selectAll(); mct.reset(); }
      else ed.placeCursor(mx, my, false);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (e.button === 2) { rg.release(); setOrbitPanChord(false); return; }
    if (e.button !== 0) return;
    dragSel = false;
    if (cam3d && d3.active) {
      d3.active = false;
      if (d3.moved || performance.now() - d3.t > 400) return;
      const [sx, sy] = toWorld(e);
      const p = screenToDocLocal(sx * dpr, sy * dpr, tCanvas.width, tCanvas.height);
      handlePick(p.x, p.y, e.shiftKey);
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    fitted = false;
    rg.wheel();

    const { editorX, editorH, sw } = layout();

    const overTree = sw > 1 && sidebarT > 0.9 && mx >= AB_W && mx < AB_W + sw && my >= SB_TREE_Y && my < cssH() - STATUS_H;
    const overEditor = mx >= editorX && my >= TAB_BAR_H && my < TAB_BAR_H + editorH;
    const panel = overTree ? 'tree' : overEditor ? 'editor' : null;
    const decision = routeScroll(rg.down, panel);

    if (decision.kind === 'scroll') {
      e.stopImmediatePropagation();
      if (decision.panel === 'tree') {
        fileTree.scrollBy(e.deltaY * 0.5);
      } else {
        const ed = tabs[activeTab].editor;
        ed.y0 -= e.deltaY * 0.5;
        const maxScroll = Math.max(0, ed.contentHeight() - editorH);
        ed.y0 = Math.min(TAB_BAR_H, Math.max(TAB_BAR_H - maxScroll, ed.y0));
      }
      return;
    }
    if (!cam3d) return;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (searchFocused) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') { e.preventDefault(); blurSearch(); }
      else if (e.key === 'Enter') { e.preventDefault(); blurSearch(); }
      else if (ctrl && e.key === 'v') { e.preventDefault(); actions.pasteQuery(); }
      else if (ctrl && e.key === 'c') { e.preventDefault(); actions.copyQuery(); }
      else if (ctrl && e.key === 'x') { e.preventDefault(); actions.cutQuery(); }
      else if (e.key === 'Backspace') { e.preventDefault(); searchQuery = searchQuery.slice(0, -1); fileTree.setFilter(searchQuery); }
      else if (e.key.length === 1 && !ctrl) { e.preventDefault(); searchQuery += e.key; fileTree.setFilter(searchQuery); searchCaretPhase = 0; }
      return;
    }
    if (focus === 'terminal') {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        termOpen = false; termDir = -1;
        focus = 'editor';
        tabs[activeTab].editor.focused = true;
        terminal.focused = false;
        return;
      }
      if (terminal.handleKey(e)) return;
    }
    const ed = tabs[activeTab].editor;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z') { e.preventDefault(); ed.undo(); return; }
    if (ctrl && e.key === 'y') { e.preventDefault(); ed.redo(); return; }
    if (ctrl && e.key === 'a') { e.preventDefault(); ed.selectAll(); return; }
    if (ctrl && e.key === 'c') { e.preventDefault(); actions.copy(); return; }
    if (ctrl && e.key === 'x') { e.preventDefault(); actions.cut(); return; }
    if (ctrl && e.key === 'v') { e.preventDefault(); actions.paste(); return; }
    if (ctrl && e.key === 'p') { e.preventDefault(); sidebarOpen = true; sidebarDir = 1; searchFocused = true; tabs[activeTab].editor.focused = false; searchCaretPhase = 0; return; }
    if (ctrl && e.key === '`') { e.preventDefault(); termOpen = !termOpen; termDir = termOpen ? 1 : -1; if (termOpen) { focus = 'terminal'; terminal.focused = true; ed.focused = false; } else { focus = 'editor'; ed.focused = true; terminal.focused = false; } return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); ed.moveLeft(e.shiftKey); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ed.moveRight(e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ed.moveVert(-1, e.shiftKey); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); ed.moveVert(1, e.shiftKey); }
    else if (e.key === 'Home') { e.preventDefault(); ed.moveHome(e.shiftKey); }
    else if (e.key === 'End') { e.preventDefault(); ed.moveEnd(e.shiftKey); }
    else if (e.key === 'Backspace') { e.preventDefault(); ed.backspace(); }
    else if (e.key === 'Delete') { e.preventDefault(); ed.del(); }
    else if (e.key === 'Enter') { e.preventDefault(); ed.newline(); }
    else if (e.key === 'Tab') { e.preventDefault(); ed.indent(); }
    else if (e.key.length === 1 && !ctrl) { e.preventDefault(); ed.insertText(e.key); }
  }

  enterOrbit(cssW() / 2, cssH() / 2, dpr, tCanvas.height);
  setOrbitEnabled(true);
  setOrbitNear(1e-3);

  // ── Context menu routing ───────────────────────────────────────────────────
  // Right-click (or the keyboard menu key) opens the menu for the surface under
  // the pointer. Hit-test order mirrors handlePick: tab bar → sidebar tree →
  // terminal → editor. In 3D the screen point is projected onto the document
  // plane first, exactly like the left-click path. A right-DRAG (orbit/pan) is
  // suppressed via rightMoved so releasing an orbit never pops a menu.
  // New surfaces: add a builder in menus.ts, then a branch here.
  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (rg.suppressMenu) return;
    gate.setViewport(cssW(), cssH());
    let [wx, wy] = toWorld(e);
    if (cam3d) {
      const p = screenToDocLocal(wx * dpr, wy * dpr, tCanvas.width, tCanvas.height);
      wx = p.x; wy = p.y;
    }
    const { h, editorX, sw, termH } = layout();

    // Editor tab strip (right-click also activates the targeted tab).
    if (wy < TAB_BAR_H && wx >= editorX) {
      let txx = editorX + 4, idx = -1;
      for (let i = 0; i < tabs.length; i++) {
        const tw2 = tabWidth(tabs[i].name, tabs.length > 1, textW);
        if (wx >= txx && wx <= txx + tw2) { idx = i; break; }
        txx += tw2;
      }
      if (idx >= 0) {
        switchToTab(idx);
        focus = 'editor';
        gate.show(wx, wy, tabMenu(actions, idx, tabs.length));
      }
      return;
    }

    // Sidebar search box.
    if (sw > 1 && sidebarT > 0.9) {
      const sx0 = AB_W + 10, sx1 = AB_W + sw - 10;
      if (wx >= sx0 && wx <= sx1 && wy >= SB_SEARCH_Y && wy <= SB_SEARCH_Y + SB_SEARCH_H) {
        searchFocused = true;
        tabs[activeTab].editor.focused = false;
        searchCaretPhase = 0;
        gate.show(wx, wy, searchMenu(actions));
        return;
      }
    }

    // File tree rows — folders and files get distinct menus.
    if (sw > 1 && sidebarT > 0.9 && wx >= AB_W && wx < AB_W + sw && wy >= SB_TREE_Y && wy < h - STATUS_H) {
      const row = fileTree.rowAtY(wy);
      if (row) {
        fileTree.select(row.node.path);
        gate.show(wx, wy, row.node.type === 'folder'
          ? folderMenu(actions, row.node, fileTree.isExpanded(row.node.path))
          : fileMenu(actions, row.node));
      }
      return;
    }

    // Terminal panel (header + body).
    if (termH > 1) {
      const ty2 = h - STATUS_H - termH - TERM_HEADER_H;
      if (wx >= editorX && wy >= ty2 && wy < h - STATUS_H) {
        focus = 'terminal';
        terminal.focused = true;
        tabs[activeTab].editor.focused = false;
        gate.show(wx, wy, terminalMenu(actions));
        return;
      }
    }

    // Code editor body.
    if (wx >= editorX && wy >= TAB_BAR_H && wy < h - STATUS_H) {
      focus = 'editor';
      tabs[activeTab].editor.focused = true;
      gate.show(wx, wy, editorMenu(actions));
    }
  }

  let alive = true;
  function frame(now: number) {
    if (!alive) return;
    requestAnimationFrame(frame);
    render(now);
  }
  requestAnimationFrame(frame);

  rCanvas.addEventListener('pointermove', onPointerMove);
  rCanvas.addEventListener('pointerdown', onPointerDown);
  rCanvas.addEventListener('pointerup', onPointerUp);
  rCanvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  rCanvas.addEventListener('contextmenu', onContextMenu);
  addEventListener('keydown', onKeyDown);

  const toolbar = new AnalyticToolbar([
    { id: 'back', icon: 'home', title: 'Back to launcher', onClick: onBack },
    { id: 'debug', icon: 'stats', title: 'Toggle debug stats', onClick: () => {
      showDebug = !showDebug;
      fpsEl.style.display = showDebug ? '' : 'none';
    }},
    { id: 'fx', icon: 'film', title: 'Shader FX', altIcon: 'play',
      active: () => fxMode !== 'off',
      onClick: () => {
        const items: import('../ui/analyticMenu').AnalyticMenuItem[] = FX_NAMES.map((name) => ({
          id: name,
          label: name === 'off' ? 'None' : name[0].toUpperCase() + name.slice(1),
          icon: name === fxMode ? 'icon:check' : undefined,
          action: () => { fxMode = name; },
        }));
        gate.show(mx, my, items);
      }},
  ]);
  toolbar.setScreen(cssW(), cssH(), 8, 5, 26);

  return () => {
    alive = false;
    setOrbitEnabled(false);
    setOrbitNear(1);
    rCanvas.removeEventListener('pointermove', onPointerMove);
    rCanvas.removeEventListener('pointerdown', onPointerDown);
    rCanvas.removeEventListener('pointerup', onPointerUp);
    rCanvas.removeEventListener('wheel', onWheel, { capture: true });
    rCanvas.removeEventListener('contextmenu', onContextMenu);
    removeEventListener('keydown', onKeyDown);
    fpsEl.style.display = prevFpsDisplay;
    depthTex?.destroy();
  };
}
