// Document content. Each page is an independent .html file under ./pages,
// imported as a raw string (Vite `?raw`). To add/remove a page, edit the file
// and update this ordered list — nothing else in the app needs to change.

import home from './pages/00-home.html?raw';
import features from './pages/01-features.html?raw';
import showcase from './pages/02-showcase.html?raw';
import design from './pages/03-design.html?raw';
import animations from './pages/04-animations.html?raw';
import typography from './pages/05-typography.html?raw';
import components from './pages/06-components.html?raw';
import blog from './pages/07-blog.html?raw';
import pricing from './pages/08-pricing.html?raw';
import faq from './pages/09-faq.html?raw';
import playground from './pages/10-playground.html?raw';

export const PAGES: string[] = [
  home, features, showcase, design, animations, typography,
  components, blog, pricing, faq, playground,
];

export const HTML_SRC = PAGES.join('\n');
