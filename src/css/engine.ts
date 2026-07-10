// ── CSS Engine ──────────────────────────────────────────────────────────────
// Pure selector matching + style resolution. No DOM/render dependencies.

export interface CSSRule { selector: string; props: Record<string,string> }

export function parseColor(c: string): number[] {
  if (!c || c==='transparent' || c==='none' || c==='inherit') return [0,0,0,0];
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(x=>parseFloat(x)); return [p[0]/255, p[1]/255, p[2]/255, p[3]===undefined?1:p[3]]; }
  if (c[0]==='#') {
    const h = c.slice(1);
    if (h.length===3) return [parseInt(h[0]+h[0],16)/255,parseInt(h[1]+h[1],16)/255,parseInt(h[2]+h[2],16)/255,1];
    if (h.length===6) return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4),16)/255,1];
  }
  if (c==='white') return [1,1,1,1];
  if (c==='black') return [0,0,0,1];
  return [0,0,0,1];
}

export function rgb(c: number[]): string { return 'rgb('+Math.round(c[0]*255)+','+Math.round(c[1]*255)+','+Math.round(c[2]*255)+')'; }

import type { StyledEl } from '../layout/types';

export function parseCSS(css: string): CSSRule[] {
  const rules: CSSRule[] = [];
  css.replace(/([^{]+)\{([^}]+)\}/g, (_, sel, body) => {
    const props: Record<string,string> = {};
    body.split(';').forEach((s:string) => { const [k,v] = s.split(':').map(x=>x.trim()); if(k&&v) props[k]=v });
    sel.split(',').forEach((s:string) => rules.push({ selector: s.trim(), props: {...props} }));
    return '';
  });
  return rules;
}

export function matchesSelector(el: StyledEl, sel: string): boolean {
  if (!sel) return false;
  // Split by spaces to handle descendant selectors like ".card h3"
  const compoundSels = sel.trim().split(/\s+/);
  if (compoundSels.length === 0) return false;

  // Match the rightmost compound against `el`, then walk up ancestors for the rest
  function matchCompound(e: StyledEl, cs: string): boolean {
    const parts = cs.match(/([.#]?[\w-]+)/g) || [];
    if (parts.length === 0) return false;
    const hasTag = parts[0]![0] !== '.' && parts[0]![0] !== '#';
    let tagOk = !hasTag || e.tag === parts[0]!.toUpperCase();
    if (hasTag) parts.shift();
    for (const p of parts) {
      if (p[0]==='.') { if (!e.classes.includes(p.slice(1))) return false }
      else if (p[0]==='#') { if (e.id !== p.slice(1)) return false }
    }
    return tagOk;
  }

  // Match rightmost compound against el
  if (!matchCompound(el, compoundSels[compoundSels.length - 1])) return false;

  // Walk up ancestors for remaining compound selectors (right to left)
  let cur: StyledEl | null = el;
  for (let i = compoundSels.length - 2; i >= 0; i--) {
    let found = false;
    cur = cur ? cur.parent : null;
    while (cur) {
      if (matchCompound(cur, compoundSels[i]!)) { found = true; break; }
      cur = cur ? cur.parent : null;
    }
    if (!found) return false;
  }
  return true;
}

export function resolveStyle(el: StyledEl, rules: CSSRule[], state: string): Record<string,string> {
  const props: Record<string,string> = {};
  for (const rule of rules) {
    const sel = rule.selector;
    const colonIdx = sel.lastIndexOf(':');
    const hasPseudo = colonIdx > 0 && sel[colonIdx-1] !== ':'; // exclude ::before/::after
    if (hasPseudo) {
      // Rule targets a pseudo-class state — only match when that state is active
      const pseudoSuffix = sel.slice(colonIdx);
      if (state && pseudoSuffix === ':'+state) {
        const baseSel = sel.slice(0, colonIdx);
        if (matchesSelector(el, baseSel)) Object.assign(props, rule.props);
      }
    } else {
      // Normal rule — only match when resolving normal (empty) state
      if (!state && matchesSelector(el, sel)) Object.assign(props, rule.props);
    }
  }
  return props;
}
