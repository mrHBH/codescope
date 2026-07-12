// ── Interactions ─────────────────────────────────────────────────────────────
// Makes the rendered design-language catalog interactive. Because the document
// is a hidden real DOM projected through the analytic pipeline, an interaction
// just mutates the DOM (toggle a class, edit text, set an inline style) and then
// rebuilds the baked buffers via refreshLayout — the browser re-lays-out for us.

import type { AppState } from '../state';
import type { StyledEl } from '../layout/types';
import { refreshLayout } from '../precompute';

// Format a slider's value display from its data-* attributes.
function formatSliderValue(slider: HTMLElement, v: number): string {
  const decimals = parseInt(slider.getAttribute('data-decimals') || '0', 10);
  const suffix = slider.getAttribute('data-suffix') || '';
  const txt = decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
  return txt + suffix;
}

// Push a slider's current value into its fill width, thumb position, and the
// sibling value readout (.reference-grid-value / .control-value in the same row).
function applySliderValue(slider: HTMLElement, v: number) {
  const min = parseFloat(slider.getAttribute('data-min') || '0');
  const max = parseFloat(slider.getAttribute('data-max') || '100');
  const clamped = Math.min(Math.max(v, min), max);
  slider.setAttribute('data-value', String(clamped));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const fill = slider.querySelector('.reference-slider-fill') as HTMLElement | null;
  const thumb = slider.querySelector('.reference-slider-thumb') as HTMLElement | null;
  if (fill) fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  const row = slider.parentElement;
  const out = row?.querySelector('.reference-grid-value, .control-value') as HTMLElement | null;
  if (out) out.textContent = formatSliderValue(slider, clamped);
}

// The .reference-slider ancestor of a hit element, if any.
export function sliderOf(hit: StyledEl | null): HTMLElement | null {
  const el = hit?.el as HTMLElement | undefined;
  return (el?.closest('.reference-slider') as HTMLElement) || null;
}

// Map a world-space x onto a slider's value range and apply it. `wx` is in the
// same coordinate space walkDOM measured boxes in, i.e. the DOM's client rect.
export function setSliderFromX(slider: HTMLElement, wx: number): number {
  const r = slider.getBoundingClientRect();
  const min = parseFloat(slider.getAttribute('data-min') || '0');
  const max = parseFloat(slider.getAttribute('data-max') || '100');
  const t = r.width > 0 ? Math.min(Math.max((wx - r.left) / r.width, 0), 1) : 0;
  const v = min + t * (max - min);
  applySliderValue(slider, v);
  return v;
}

// Handle a discrete (click) interaction: toggles, dropdowns, tab selectors.
// Returns true if the click was consumed (so the caller skips nav/pan/edit).
export function handleClickInteraction(s: AppState, hit: StyledEl): boolean {
  const el = hit.el as HTMLElement;

  // Toggle switch — flip the .on state of its box.
  const toggle = el.closest('.reference-toggle') as HTMLElement | null;
  if (toggle) {
    toggle.querySelector('.toggle-box')?.classList.toggle('on');
    refreshLayout(s);
    return true;
  }

  // Dropdown option — commit the choice and collapse.
  const opt = el.closest('.reference-sub-tab-inline') as HTMLElement | null;
  if (opt) {
    const wrapper = opt.closest('.reference-dropdown-wrapper') as HTMLElement | null;
    const text = wrapper?.querySelector('.dropdown-text');
    if (text) text.textContent = opt.textContent;
    wrapper?.classList.remove('expanded');
    refreshLayout(s);
    return true;
  }

  // Dropdown button — expand / collapse the option list.
  const ddBtn = el.closest('.reference-dropdown-btn') as HTMLElement | null;
  if (ddBtn) {
    ddBtn.closest('.reference-dropdown-wrapper')?.classList.toggle('expanded');
    refreshLayout(s);
    return true;
  }

  // Tab selector — activate it and reveal the matching content panel.
  const tab = el.closest('.model-type-selector') as HTMLElement | null;
  if (tab && tab.parentElement) {
    const idx = Array.from(tab.parentElement.children).indexOf(tab);
    const toolbar = tab.closest('.model-selector-toolbar') as HTMLElement | null;
    toolbar?.querySelectorAll('.model-type-selector').forEach((t) => t.classList.remove('active-model-type'));
    tab.classList.add('active-model-type');
    const page = toolbar?.parentElement;
    if (page) {
      const panels = page.querySelectorAll('.model-content-panel');
      panels.forEach((p, i) => p.classList.toggle('active', i === idx));
    }
    refreshLayout(s);
    return true;
  }

  return false;
}
