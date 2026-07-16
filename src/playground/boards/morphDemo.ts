// ── windgraph · Phase-4 animation demo ───────────────────────────────────────
// The flagship animation scene: y = sin x draws on, a labeled point rides the
// curve while the area beneath it fills, then the whole curve MORPHS into a
// polynomial — every step eased and continuous (no popping), looping cleanly.
// Lives in world space so the camera gives pan/zoom/infinite-zoom for free.

import { Mobject, Group, type DrawOp, type RenderCtx } from '../../windgraph/mobject/mobject';
import { Polyline, Dot, Label } from '../../windgraph/mobject/primitives';
import { polygonQuads, type Pt } from '../../windgraph/stroke/stroke';
import { NumberPlane, type PlaneView } from '../../windgraph/coords/numberPlane';
import { Scene } from '../../windgraph/anim/scene';
import { Create, FadeIn, Transform } from '../../windgraph/anim/animations';
import { ValueTracker, TrackerAnim } from '../../windgraph/anim/timeline';
import { easeInOutCubic, easeOutCubic, smootherstep } from '../../windgraph/anim/easing';
import { layoutStr } from '../../layout/metrics';
import type { FontFace } from '../../windfoil/font';

const INK = [0.90, 0.92, 0.98, 1];
const BLUE = [0.36, 0.62, 0.98, 1];
const GOLD = [0.92, 0.74, 0.42, 1];
const TEAL = [0.30, 0.82, 0.72, 1];

// A shaded area under a polyline, filled up to a fraction of its length.
class AreaFill extends Mobject {
  curvePoints: Pt[] = [];
  frac = 0;              // 0..1 fraction of the curve to fill under
  baselineY = 0;         // world y of the baseline
  color = [BLUE[0], BLUE[1], BLUE[2], 0.16];
  protected build(): DrawOp[] {
    const n = Math.max(0, Math.min(this.curvePoints.length, Math.floor(this.curvePoints.length * this.frac)));
    if (n < 2) return [];
    const sub = this.curvePoints.slice(0, n);
    const poly: Pt[] = [...sub, [sub[sub.length - 1][0], this.baselineY], [sub[0][0], this.baselineY]];
    return [{ kind: 'fill', quads: polygonQuads(poly, true), color: this.color }];
  }
}

export class MorphDemo {
  x0 = 0;
  y0 = 0;
  width = 1040;
  height = 640;

  private plane = new NumberPlane();
  private scene = new Scene();
  private curve!: Polyline;
  private area!: AreaFill;
  private dot!: Dot;
  private label!: Label;
  private frac = new ValueTracker(0);
  private built = false;

  private readonly N = 140;
  private readonly xMin = -4; private readonly xMax = 6;

  private f0(x: number) { return 2.2 * Math.sin(x); }                 // sine
  private f1(x: number) { return 0.15 * x * x - 2.0; }                // polynomial (parabola)

  private sample(f: (x: number) => number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < this.N; i++) {
      const x = this.xMin + (this.xMax - this.xMin) * (i / (this.N - 1));
      pts.push([this.plane.dToWx(x), this.plane.dToWy(f(x))]);
    }
    return pts;
  }

  private setup() {
    const p = this.plane;
    p.worldX0 = this.x0 + 90;
    p.worldY0 = this.y0 + 4 * 70 + 60;   // data y=0 world position (yMax=4 lands near the top)
    p.unitX = 90; p.unitY = 70;
    p.xMin = this.xMin; p.xMax = this.xMax; p.yMin = -3; p.yMax = 4;

    const baseline = p.dToWy(0);
    const start = this.sample((x) => this.f0(x));
    const dest = this.sample((x) => this.f1(x));

    this.curve = new Polyline(start.map((q) => [q[0], q[1]]), { color: BLUE, width: 4, cap: 'round', join: 'round' });

    this.area = new AreaFill();
    this.area.curvePoints = start;
    this.area.baselineY = baseline;
    this.area.frac = 0;

    this.dot = new Dot(start[0][0], start[0][1], 8, GOLD);
    this.dot.visible = false;
    this.label = new Label('', 0, 0, 22, GOLD, 'start');
    this.label.visible = false;

    // Dependent updaters: the dot rides the (possibly morphing) curve at `frac`,
    // the area fills to `frac`, the label shows the live data coordinates.
    const self = this;
    const rideUpdater = () => {
      const pts = self.curve.points;
      const f = self.frac.value;
      const idxF = f * (pts.length - 1);
      const i0 = Math.max(0, Math.min(pts.length - 2, Math.floor(idxF)));
      const t = idxF - i0;
      const wx = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * t;
      const wy = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * t;
      self.dot.position = [wx, wy];
      // world → data for the label
      const dx = (wx - p.worldX0) / p.unitX;
      const dy = (p.worldY0 - wy) / p.unitY;
      self.label.position = [wx + 14, wy - 14];
      self.label.text = `(${dx.toFixed(1)}, ${dy.toFixed(1)})`;
      self.label.markDirty();
      // area follows the current curve + fraction
      self.area.curvePoints = pts;
      self.area.frac = f;
      self.area.markDirty();
    };
    this.dot.addUpdater(rideUpdater);

    const g = new Group();
    g.add(this.area, this.curve, this.dot, this.label);
    this.scene.add(g);
    this.scene.snapshotAll();
    this.scene.onLoop(() => this.frac.set(0));

    // Timeline: draw-on → reveal point → ride (area fills) → morph → hold.
    const tl = this.scene.timeline;
    tl.play(new Create(this.curve, { duration: 1.4, easing: easeOutCubic }));
    tl.play(new FadeIn(this.dot, { duration: 0.4 }), new FadeIn(this.label, { duration: 0.4 }));
    tl.play(new TrackerAnim(this.frac, 1, { duration: 2.8, easing: smootherstep }));
    tl.play(new Transform(this.curve, dest, { duration: 1.8, easing: easeInOutCubic }));
    tl.wait(0.9);

    this.built = true;
  }

  emit(font: FontFace, atlas: any, inst: number[], crv: number[], rws: number[], now: number, view: PlaneView) {
    if (!this.built) this.setup();
    this.scene.update(now);

    const ctx: RenderCtx = { font, atlas, inst, crv, rws };
    const pctx = { font, atlas, inst, crv, rws };
    this.plane.render(pctx, view);

    // Title + subtitle.
    layoutStr(inst, 'Animation: morph  sin x -> polynomial', INK, atlas.table, font, { x: this.x0 + 60, y: this.y0 - 6, size: 30 });
    layoutStr(inst, 'draw-on . riding point . area fill . eased path morph', [0.62, 0.66, 0.76, 1], atlas.table, font, { x: this.x0 + 60, y: this.y0 + 30, size: 15 });

    this.scene.emit(ctx);
    void TEAL;
  }
}
