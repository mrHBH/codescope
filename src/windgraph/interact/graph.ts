// ── windgraph · reactive constraint graph (Phase 5) ──────────────────────────
// A minimal, explicit dependency graph. Geometry objects declare their `inputs`;
// `update()` recomputes every constrained object in topological order, so moving
// one free point cascades correctly to all dependents in a single pass. Cycles
// are detected (a construction that depends on itself throws at build time).

export abstract class GObject {
  /** Objects this one is computed from (edges point inputs → this). */
  inputs: GObject[] = [];
  /** Free objects are user-controlled (draggable) and never recomputed. */
  free = false;
  /** Recompute this object's resolved values from its inputs. No-op for free. */
  abstract recompute(): void;
}

export class ConstraintGraph {
  readonly objects: GObject[] = [];
  private order: GObject[] | null = null;

  add<T extends GObject>(o: T): T {
    this.objects.push(o);
    this.order = null; // topology changed
    return o;
  }

  /** Recompute all constrained objects in dependency order. */
  update() {
    if (!this.order) this.order = this.topoSort();
    for (const o of this.order) if (!o.free) o.recompute();
  }

  /** Kahn's algorithm over inputs → node edges, with cycle detection. */
  private topoSort(): GObject[] {
    const present = new Set(this.objects);
    const indeg = new Map<GObject, number>();
    const deps = new Map<GObject, GObject[]>(); // input → objects that depend on it
    for (const o of this.objects) { indeg.set(o, 0); deps.set(o, []); }
    for (const o of this.objects) {
      let n = 0;
      for (const inp of o.inputs) {
        if (!present.has(inp)) continue;
        deps.get(inp)!.push(o);
        n++;
      }
      indeg.set(o, n);
    }
    const queue = this.objects.filter((o) => indeg.get(o) === 0);
    const order: GObject[] = [];
    while (queue.length) {
      const o = queue.shift()!;
      order.push(o);
      for (const d of deps.get(o)!) {
        const k = indeg.get(d)! - 1;
        indeg.set(d, k);
        if (k === 0) queue.push(d);
      }
    }
    if (order.length !== this.objects.length) throw new Error('windgraph: cycle detected in constraint graph');
    return order;
  }
}
