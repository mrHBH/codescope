// ── Pages layout demo — reactive Taffy reflow showcase ───────────────────────
import { scene } from '../builder/scene';
import type { SceneDoc, Color } from '../ir/types';

const C: Record<string, Color> = {
  head: [0.94, 0.95, 0.97, 1],
  body: [0.73, 0.74, 0.77, 1],
  dim: [0.55, 0.56, 0.60, 1],
  border: [0.25, 0.26, 0.30, 1],
  cardBg: [0.13, 0.135, 0.15, 1],
  accent: [0.12, 0.60, 0.95, 1],
  accent2: [0.66, 0.42, 0.92, 1],
  green: [0.30, 0.80, 0.40, 1],
  rose: [0.93, 0.36, 0.34, 1],
  gold: [0.97, 0.73, 0.33, 1],
  cyan: [0.36, 0.85, 0.97, 1],
};

export const PAGE_DEMO_DOC: SceneDoc = scene({ title: 'Pages Layout Demo' }, (s) => {
  s.addSpec({
    kind: 'text', id: 'world-label',
    content: 'pages · drag green SE handles to resize · text + bars reflow',
    at: [80, 30], size: 16, color: C.dim,
  } as any);

  // ── 1. Flex grow row — bars MUST grow when page widens ──────────────────
  s.page('p-grow', {
    title: 'Grow row',
    at: [80, 80], size: [900, 280],
    resizable: true, minSize: [360, 180], maxSize: [2200, 500],
    layout: { direction: 'column', gap: 14, padding: 24, align: 'stretch' },
  }, (p) => {
    p.text('gr-title', 'Drag SE wider → three bars share free width equally', {
      size: 18, color: C.dim, item: { flexShrink: 0 },
    });
    p.row('gr-bars', { gap: 12, align: 'stretch', item: { flexGrow: 1, minHeight: 80 } }, (row) => {
      const colors = [C.cyan, C.rose, C.gold];
      for (let i = 0; i < 3; i++) {
        row.rect(`gr-bar-${i}`, {
          size: [40, 40],
          fill: colors[i],
          item: { flexGrow: 1, minWidth: 40 },
        });
      }
    });
  });

  // ── 2. Stack column — panels grow when page gets taller ─────────────────
  s.page('p-stack', {
    title: 'Stack column',
    at: [1060, 80], size: [360, 560],
    resizable: true, minSize: [220, 280], maxSize: [700, 1400],
    layout: { direction: 'column', gap: 12, padding: 20, align: 'stretch' },
  }, (p) => {
    p.text('st-title', 'Drag SE taller → panels grow', {
      size: 18, color: C.head, item: { flexShrink: 0 },
    });
    const colors = [C.accent, C.accent2, C.green];
    for (let i = 0; i < 3; i++) {
      p.rect(`st-panel-${i}`, {
        size: [40, 40],
        fill: colors[i],
        item: { flexGrow: 1, minHeight: 36 },
      });
    }
  });

  // ── 3. Text reflow — paragraph wraps as page narrows ────────────────────
  s.page('p-wrap', {
    title: 'Text wrap',
    at: [80, 440], size: [520, 360],
    resizable: true, minSize: [200, 200], maxSize: [1100, 700],
    layout: { direction: 'column', gap: 12, padding: 22, align: 'stretch' },
  }, (p) => {
    p.text('wr-h', 'Text reflow', {
      size: 26, color: C.head, item: { flexShrink: 0 },
    });
    p.text('wr-body',
      'Narrow this page and the paragraph wraps to more lines. Widen it and the text collapses back to fewer lines. Layout height grows with wrapped text so siblings below shift down.',
      { size: 18, color: C.body, item: { flexShrink: 0 } },
    );
    p.rect('wr-footer', {
      size: [40, 48],
      fill: C.accent,
      item: { flexGrow: 1, minHeight: 40 },
    });
  });

  // ── 4. Split + island — island slot flex-grows ──────────────────────────
  s.page('p-split', {
    title: 'Split + island',
    at: [680, 720], size: [780, 400],
    resizable: true, minSize: [420, 260], maxSize: [1800, 800],
    layout: { direction: 'row', gap: 18, padding: 22, align: 'stretch' },
  }, (p) => {
    p.col('sp-left', { gap: 8, item: { width: 200, flexShrink: 0 } }, (c) => {
      c.text('sp-h', 'Island grows', { size: 22, color: C.head, item: { flexShrink: 0 } });
      c.text('sp-b', 'Widen the page — the island takes leftover space.', {
        size: 16, color: C.body, item: { flexShrink: 0 },
      });
    });
    p.island('sp-island', 'coverage-sweep', {
      item: { flexGrow: 1, minWidth: 140, minHeight: 120, fill: true },
    });
  });

  // ── 5. Justify space-between ────────────────────────────────────────────
  s.page('p-justify', {
    title: 'Justify',
    at: [80, 1200], size: [900, 180],
    resizable: true, minSize: [280, 140], maxSize: [2000, 360],
    layout: { direction: 'row', gap: 0, padding: 20, align: 'center', justify: 'space-between' },
  }, (p) => {
    p.rect('j1', { size: [100, 70], fill: C.cyan, item: { flexShrink: 0 } });
    p.rect('j2', { size: [100, 70], fill: C.rose, item: { flexShrink: 0 } });
    p.rect('j3', { size: [100, 70], fill: C.gold, item: { flexShrink: 0 } });
  });

  // ── 6. Fixed island — slot stays at default 470×585, card can't shrink below it
  s.page('p-item', {
    title: 'Fixed island',
    at: [1060, 1200], size: [560, 760],
    resizable: true, minSize: [520, 720], maxSize: [1600, 1400],
    layout: { direction: 'column', gap: 12, padding: 22, align: 'stretch' },
  }, (p) => {
    p.text('it-title', 'Island stays at fixed 470×585', {
      size: 18, color: C.head, item: { flexShrink: 0 },
    });
    p.text('it-desc', 'The island keeps its intrinsic size. Shrink the card — it stops at the island\'s footprint.', {
      size: 15, color: C.dim, item: { flexShrink: 0 },
    });
    p.island('it-island', 'coverage-sweep', {
      item: { width: 470, height: 585, flexShrink: 0, fill: false, alignSelf: 'center' },
    });
  });

  // ── 7. Accent card ──────────────────────────────────────────────────────
  s.page('p-accent', {
    title: 'Accent card',
    at: [80, 1500], size: [640, 380],
    resizable: true, minSize: [320, 260], maxSize: [1400, 800],
    layout: { direction: 'column', gap: 14, padding: 26, align: 'stretch' },
  }, (p) => {
    p.accentHead('ac', { kicker: 'Demo', title: 'Taffy flex layouts', accent: C.accent });
    p.body('ac', [
      'Every card uses Taffy flexbox.',
      'Green SE handle → page re-layouts children.',
      'Blue handle → that item only, siblings reflow.',
    ], { item: { flexShrink: 0 } });
    p.rect('ac-fill', {
      size: [40, 40],
      fill: C.cardBg,
      item: { flexGrow: 1, minHeight: 40 },
    });
  });

  // ── 8. Nested pages — sub-page cards inside a parent page ───────────────
  const subColors = [C.cyan, C.rose, C.gold];
  s.page('p-nest', {
    title: 'Nested pages',
    at: [1760, 80], size: [1300, 720],
    resizable: true, minSize: [780, 480], maxSize: [2600, 1400],
    layout: { direction: 'column', gap: 20, padding: 28, align: 'stretch' },
  }, (p) => {
    p.accentHead('np', { kicker: 'Nested', title: 'Pages inside a page', accent: C.accent2 });
    p.text('np-desc', 'Resize the green handle — sub-page cards shrink/grow and reflow their own content.', {
      size: 16, color: C.dim, item: { flexShrink: 0 },
    });
    // Row A: three sub-pages side by side (flex-grow)
    p.row('np-rowA', { gap: 14, align: 'stretch', item: { flexGrow: 1, minHeight: 260 } }, (r) => {
      for (let i = 0; i < 3; i++) {
        r.subpage(`np-a${i}`, {
          title: `Card ${i + 1}`,
          resizable: true, minSize: [180, 180], maxSize: [800, 700],
          layout: { direction: 'column', gap: 10, padding: 16, align: 'stretch' },
          item: { flexGrow: 1, minWidth: 180 },
        }, (sp) => {
          sp.text(`np-a${i}-h`, `Sub-page ${i + 1}`, { size: 18, color: C.head, item: { flexShrink: 0 } });
          sp.rect(`np-a${i}-bar`, { size: [40, 30], fill: subColors[i], item: { flexGrow: 1, minHeight: 30 } });
          sp.text(`np-a${i}-t`, 'Drag its SE handle to resize individually.', {
            size: 13, color: C.dim, item: { flexShrink: 0 },
          });
        });
      }
    });
    // Row B: two sub-pages (column layout inside each)
    p.row('np-rowB', { gap: 14, align: 'stretch', item: { flexGrow: 1, minHeight: 160 } }, (r) => {
      r.subpage('np-b0', {
        title: 'Column layout',
        layout: { direction: 'column', gap: 8, padding: 16, align: 'stretch' },
        item: { flexGrow: 1, minWidth: 120 },
      }, (sp) => {
        sp.text('np-b0-t', 'Column A', { size: 16, color: C.head, item: { flexShrink: 0 } });
        sp.rect('np-b0-fill', { size: [40, 20], fill: C.green, item: { flexGrow: 1, minHeight: 20 } });
      });
      r.subpage('np-b1', {
        title: 'Row layout',
        layout: { direction: 'row', gap: 10, padding: 16, align: 'center' },
        item: { flexGrow: 1, minWidth: 120 },
      }, (sp) => {
        sp.rect('np-b1-a', { size: [50, 50], fill: C.accent, item: { flexShrink: 0 } });
        sp.rect('np-b1-b', { size: [50, 50], fill: C.cyan, item: { flexShrink: 0 } });
        sp.text('np-b1-t', 'Row', { size: 16, color: C.head, item: { flexShrink: 0 } });
      });
    });
  });
});
