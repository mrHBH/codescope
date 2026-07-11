// ── Toolbar ──────────────────────────────────────────────────────────────────
// Fixed-position DOM controls that float above the GPU canvas (never affected by
// the world-space camera). Kept out of main.ts so the entry point stays wiring.

interface ToolbarButton {
  icon: string;
  title: string;
  onClick: () => void;
  ref?: (el: HTMLButtonElement) => void;
}

const BTN_CSS =
  'position:fixed;top:14px;z-index:10;width:42px;height:42px;border-radius:10px;' +
  'border:none;cursor:pointer;font-size:18px;background:rgba(22,22,46,0.85);color:#fff;';

// Create the top-right toolbar. Buttons are laid out right-to-left in order.
export function createToolbar(buttons: ToolbarButton[]) {
  buttons.forEach((b, i) => {
    const el = document.createElement('button');
    el.textContent = b.icon;
    el.title = b.title;
    el.style.cssText = BTN_CSS + `right:${14 + i * 50}px;`;
    el.onclick = b.onClick;
    document.body.appendChild(el);
    b.ref?.(el);
  });
}
