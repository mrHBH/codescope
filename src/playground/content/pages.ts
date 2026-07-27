// Document content. Each page is an independent .html file under ./pages,
// imported as a raw string (Vite `?raw`). To add/remove a page, edit the file
// and update this ordered list — nothing else in the app needs to change.

import foundations from './pages/00-foundations.html?raw';
import controls from './pages/01-controls.html?raw';
import dataStatus from './pages/02-data-status.html?raw';
import layoutContent from './pages/03-layout-content.html?raw';
import hud from './pages/04-hud.html?raw';

export const PAGES: string[] = [
  foundations, controls, dataStatus, layoutContent, hud,
];

export const HTML_SRC = PAGES.join('\n');
