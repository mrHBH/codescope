// ── IDE sample data ──────────────────────────────────────────────────────────
// Static file-tree + sample-file content for the IDE demo. Pure data — no logic
// — extracted from ide.ts so the shell stays focused on rendering and input.

import type { TreeNode } from '../editor/fileTree';

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

export const SOURCES: { label: string; roots: TreeNode[]; expanded: string[] }[] = [
  { label: 'DIST', roots: DIST_TREE, expanded: DIST_EXP },
  { label: 'LOCAL', roots: LOCAL_TREE, expanded: LOCAL_EXP },
  { label: 'SERVER', roots: SERVER_TREE, expanded: SERVER_EXP },
  { label: 'NATIVE', roots: NATIVE_TREE, expanded: NATIVE_EXP },
];

export const SAMPLE_FILES: { name: string; code: string }[] = [
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
