export interface TimelineHudItem {
  title: string;
  subtitle?: string;
  duration: number;
}

export interface TimelineHudOptions {
  left?: string;
  right?: string;
  bottom?: string;
  activeScale?: number;
  interactive?: boolean;
}

export interface TimelineHud {
  readonly el: HTMLDivElement;
  setVisible(on: boolean): void;
  setItems(items: TimelineHudItem[]): void;
  setProgress01(t: number): void;
  setActive(index: number): void;
  setTimeLabel(text: string): void;
  onScrub(handler: ((ratio01: number) => void) | null): void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createTimelineHud(opts: TimelineHudOptions = {}): TimelineHud {
  const activeScale = opts.activeScale ?? 1.42;
  const activeStretch = 1.9;

  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${opts.left ?? '7%'};right:${opts.right ?? '7%'};bottom:${opts.bottom ?? '4.2vh'};opacity:0;transition:opacity .35s ease,transform .35s ease;transform:translateY(8px);pointer-events:${opts.interactive ? 'auto' : 'none'}`;

  const top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:14px;padding:6px 8px 0 8px';

  const track = document.createElement('div');
  track.style.cssText = 'position:relative;flex:1;height:20px;overflow:visible';

  const line = document.createElement('div');
  line.style.cssText = 'position:absolute;left:0;right:0;top:64%;height:2px;transform:translateY(-1px);background:rgba(126,138,166,.52);box-shadow:0 1px 10px rgba(0,0,0,.35)';

  const head = document.createElement('div');
  head.style.cssText = 'position:absolute;left:0;top:6px;bottom:1px;width:3px;background:#5dd6ff;box-shadow:0 0 10px rgba(93,214,255,.85)';

  const time = document.createElement('div');
  time.style.cssText = 'min-width:170px;text-align:right;color:#a8b2c3;font-size:11px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;text-shadow:0 2px 16px rgba(0,0,0,.55)';

  const labels = document.createElement('div');
  labels.style.cssText = 'position:relative;height:46px;margin-top:8px;pointer-events:none';

  track.append(line, head);
  top.append(track, time);
  el.append(top, labels);

  const markers: HTMLDivElement[] = [];
  const labelNodes: HTMLDivElement[] = [];
  let scrubHandler: ((ratio01: number) => void) | null = null;
  let itemsState: TimelineHudItem[] = [];
  let baseStarts: number[] = [];
  let baseWidths: number[] = [];
  let visualStarts: number[] = [];
  let visualWidths: number[] = [];
  let activeIndex = -1;
  let progress01 = 0;

  function recomputeLayout() {
    if (!itemsState.length) return;
    const total = Math.max(0.001, itemsState.reduce((s, it) => s + it.duration, 0));
    baseStarts = [];
    baseWidths = [];
    let acc = 0;
    for (let i = 0; i < itemsState.length; i++) {
      const w = itemsState[i].duration / total;
      baseStarts.push(acc);
      baseWidths.push(w);
      acc += w;
    }

    const stretched = baseWidths.map((w, i) => w * (i === activeIndex ? activeStretch : 1));
    const stretchedSum = Math.max(1e-6, stretched.reduce((s, w) => s + w, 0));
    visualWidths = stretched.map((w) => w / stretchedSum);
    visualStarts = [];
    acc = 0;
    for (let i = 0; i < visualWidths.length; i++) {
      visualStarts.push(acc);
      acc += visualWidths[i];
    }

    for (let i = 0; i < itemsState.length; i++) {
      markers[i].style.left = `${visualStarts[i] * 100}%`;
      labelNodes[i].style.left = `${visualStarts[i] * 100}%`;
      labelNodes[i].style.width = `${Math.max(7, visualWidths[i] * 100 - 0.25)}%`;
    }
  }

  function mapProgress(ratio: number) {
    const t = clamp01(ratio);
    if (!baseWidths.length || !visualWidths.length) return t;
    let seg = baseWidths.length - 1;
    for (let i = 0; i < baseWidths.length; i++) {
      const s = baseStarts[i], e = s + baseWidths[i];
      if (t < e || i === baseWidths.length - 1) { seg = i; break; }
    }
    const localBase = baseWidths[seg] > 1e-6 ? (t - baseStarts[seg]) / baseWidths[seg] : 0;
    return visualStarts[seg] + clamp01(localBase) * visualWidths[seg];
  }

  function setItems(items: TimelineHudItem[]) {
    itemsState = items.slice();
    while (markers.length) markers.pop()!.remove();
    while (labelNodes.length) labelNodes.pop()!.remove();

    for (let i = 0; i < items.length; i++) {
      const mk = document.createElement('div');
      mk.style.position = 'absolute';
      mk.style.top = '1px';
      mk.style.bottom = '1px';
      mk.style.width = '0';
      mk.style.borderLeft = '1px solid rgba(132,145,172,.7)';
      track.appendChild(mk);
      markers.push(mk);

      const lb = document.createElement('div');
      lb.style.position = 'absolute';
      lb.style.top = '0';
      lb.style.transformOrigin = 'left top';
      lb.style.transition = 'transform .2s ease, opacity .2s ease';
      lb.innerHTML = `<div style="color:#d6dde9;font-size:10px;font-weight:700;letter-spacing:.05em;white-space:nowrap;">${items[i].title}</div><div style="color:#7f8aa0;font-size:9px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;">${items[i].subtitle ?? ''}</div>`;
      labels.appendChild(lb);
      labelNodes.push(lb);
    }
    activeIndex = items.length > 0 ? 0 : -1;
    recomputeLayout();
    setProgress01(progress01);
  }

  function setProgress01(t: number) {
    progress01 = clamp01(t);
    head.style.left = `${mapProgress(progress01) * 100}%`;
  }

  function setActive(index: number) {
    activeIndex = index;
    recomputeLayout();
    for (let i = 0; i < labelNodes.length; i++) {
      const on = i === index;
      const lb = labelNodes[i];
      const title = lb.children[0] as HTMLDivElement;
      const sub = lb.children[1] as HTMLDivElement;
      lb.style.opacity = on ? '1' : '0.52';
      lb.style.transform = on ? `scale(${activeScale}) translateY(-1px)` : 'scale(0.66)';
      lb.style.zIndex = on ? '3' : '1';
      title.style.overflow = on ? 'visible' : 'hidden';
      title.style.textOverflow = on ? 'clip' : 'ellipsis';
      title.style.whiteSpace = 'nowrap';
      sub.style.display = on ? 'block' : 'none';
    }
    setProgress01(progress01);
  }

  function setVisible(on: boolean) {
    el.style.opacity = on ? '1' : '0';
    el.style.transform = on ? 'translateY(0)' : 'translateY(8px)';
  }

  function setTimeLabel(text: string) {
    time.textContent = text;
  }

  if (opts.interactive) {
    let dragging = false;
    const ratioAt = (clientX: number) => {
      const r = track.getBoundingClientRect();
      return clamp01((clientX - r.left) / Math.max(1, r.width));
    };
    el.addEventListener('pointerdown', (ev) => {
      dragging = true;
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
      scrubHandler?.(ratioAt(ev.clientX));
      ev.preventDefault();
      ev.stopPropagation();
    });
    el.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      scrubHandler?.(ratioAt(ev.clientX));
      ev.preventDefault();
      ev.stopPropagation();
    });
    el.addEventListener('pointerup', (ev) => {
      dragging = false;
      (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

  return {
    el,
    setVisible,
    setItems,
    setProgress01,
    setActive,
    setTimeLabel,
    onScrub(handler) { scrubHandler = handler; },
  };
}
