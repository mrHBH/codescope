// ── Context menu ─────────────────────────────────────────────────────────────
// A modular, DOM-based context menu rendered above the GPU canvas. Callers build
// it from a list of MenuItem definitions; each item carries an icon, label,
// optional shortcut hint, an enabled predicate, and an action. The menu handles
// its own positioning (clamped to the viewport), keyboard/blur dismissal, and
// styling that follows the active theme via CSS variables.

import { icons } from './icons';

export interface MenuItem {
  id: string;
  label?: string;
  icon?: keyof typeof icons;
  shortcut?: string;
  separator?: boolean;
  enabled?: () => boolean;
  action?: () => void;
}

export class ContextMenu {
  private root: HTMLDivElement;
  private open = false;
  private ac = new AbortController();

  constructor() {
    const root = document.createElement('div');
    root.className = 'ctx-menu';
    root.style.display = 'none';
    root.setAttribute('role', 'menu');
    document.body.appendChild(root);
    this.root = root;

    if (!document.getElementById('ctx-menu-style')) {
      const st = document.createElement('style');
      st.id = 'ctx-menu-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }

    const { signal } = this.ac;
    addEventListener('pointerdown', (e) => { if (this.open && !this.root.contains(e.target as Node)) this.hide(); }, { capture: true, signal });
    addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') { e.stopPropagation(); this.hide(); } }, { capture: true, signal });
    addEventListener('blur', () => this.hide(), { signal });
    addEventListener('resize', () => this.hide(), { signal });
  }

  dispose() {
    this.ac.abort();
    this.root.remove();
  }

  isOpen() { return this.open; }

  show(x: number, y: number, items: MenuItem[]) {
    const root = this.root;
    root.innerHTML = '';
    for (const it of items) {
      if (it.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        root.appendChild(sep);
        continue;
      }
      const disabled = it.enabled ? !it.enabled() : false;
      const row = document.createElement('button');
      row.className = 'ctx-item';
      row.type = 'button';
      row.setAttribute('role', 'menuitem');
      if (disabled) row.setAttribute('disabled', '');
      row.innerHTML =
        `<span class="ctx-icon">${it.icon ? icons[it.icon] : ''}</span>` +
        `<span class="ctx-label">${it.label ?? ''}</span>` +
        `<span class="ctx-key">${it.shortcut ?? ''}</span>`;
      if (!disabled && it.action) {
        row.addEventListener('click', () => { this.hide(); it.action!(); });
      }
      root.appendChild(row);
    }

    // Reveal off-screen to measure, then clamp within the viewport.
    root.style.display = 'block';
    root.style.left = '-9999px';
    root.style.top = '-9999px';
    const r = root.getBoundingClientRect();
    const px = Math.min(x, innerWidth - r.width - 8);
    const py = Math.min(y, innerHeight - r.height - 8);
    root.style.left = Math.max(8, px) + 'px';
    root.style.top = Math.max(8, py) + 'px';
    this.open = true;
  }

  hide() {
    if (!this.open) return;
    this.root.style.display = 'none';
    this.open = false;
  }
}

const STYLE = `
.ctx-menu {
  position: fixed; z-index: 1000; min-width: 220px; padding: 6px;
  background: var(--ctx-bg, rgba(28,32,48,0.98));
  border: 1px solid var(--ctx-border, rgba(255,255,255,0.10));
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset;
  backdrop-filter: blur(12px);
  font: 13px/1 -apple-system, "Segoe UI", system-ui, sans-serif;
  color: var(--ctx-fg, #e8ebf5);
  user-select: none;
  animation: ctx-pop 90ms ease-out;
}
@keyframes ctx-pop { from { opacity: 0; transform: scale(0.97) translateY(-3px); } to { opacity: 1; transform: none; } }
.ctx-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 8px 12px; border: none; background: none; border-radius: 8px;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.ctx-item:hover:not([disabled]) { background: var(--ctx-hover, rgba(255,255,255,0.09)); }
.ctx-item[disabled] { opacity: 0.38; cursor: default; }
.ctx-icon { display: inline-flex; width: 16px; height: 16px; color: var(--ctx-accent, #8fa8ff); flex: 0 0 16px; }
.ctx-label { flex: 1 1 auto; }
.ctx-key { flex: 0 0 auto; font-size: 11px; opacity: 0.55; letter-spacing: 0.5px; }
.ctx-sep { height: 1px; margin: 6px 8px; background: var(--ctx-border, rgba(255,255,255,0.10)); }
`;
