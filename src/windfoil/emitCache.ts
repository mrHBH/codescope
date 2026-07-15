// ── Board emit cache ─────────────────────────────────────────────────────────
// World-space boards (windgraph, perf bench, benchmark results) emit identical
// geometry every frame while the camera is idle — stroking, banding and number-
// plane work that measured 4-6ms/frame. This cache captures the slices a board
// appends to the shared inst/crv/rws arrays once, then replays them on later
// frames with an index rebase, as long as the caller-supplied signature (zoom,
// clip, mode, …) is unchanged.
//
// Why a rebase is needed: fillQuads/bandPieces write band rows whose `start`
// points into crv (curve-piece index) and instances whose rowBase points into
// rws (row index) — both relative to where the arrays happened to end on the
// build frame. Glyph instances (layoutStr) instead reference the immutable
// atlas at the FRONT of the combined buffers, so they replay untouched. The
// two are distinguishable at capture time: board-created rows always live at
// indices >= the array length recorded before the board emitted.

export class EmitCache {
  private sig = '';
  private valid = false;
  private cInst: number[] = [];
  private cCrv: number[] = [];
  private cRws: number[] = [];
  private cRel: boolean[] = []; // per cached instance: rowBase is board-relative

  invalidate() { this.valid = false; this.sig = ''; }

  /**
   * Emit through the cache: replay the captured geometry when `sig` matches,
   * otherwise run `build()` (which must append to inst/crv/rws) and capture
   * what it produced.
   */
  run(sig: string, inst: number[], crv: number[], rws: number[], build: () => void) {
    if (this.valid && sig === this.sig) {
      this.replay(inst, crv, rws);
      return;
    }
    const inst0 = inst.length, crv0 = crv.length, rws0 = rws.length;
    build();
    this.capture(inst, crv, rws, inst0, crv0, rws0);
    this.sig = sig;
    this.valid = true;
  }

  private capture(inst: number[], crv: number[], rws: number[], inst0: number, crv0: number, rws0: number) {
    const rowBase0 = rws0 / 5, quadBase0 = crv0 / 6;
    this.cCrv.length = 0; this.cRws.length = 0; this.cInst.length = 0; this.cRel.length = 0;
    for (let i = crv0; i < crv.length; i++) this.cCrv.push(crv[i]);
    // Rows: store `start` relative to the board's own curve base.
    for (let i = rws0; i < rws.length; i += 5) {
      this.cRws.push(rws[i] - quadBase0, rws[i + 1], rws[i + 2], rws[i + 3], rws[i + 4]);
    }
    // Instances: rowBase >= rowBase0 means the board created the rows itself
    // (store relative); smaller values reference the immutable atlas prefix.
    for (let i = inst0; i < inst.length; i += 16) {
      const rel = inst[i + 12] >= rowBase0;
      this.cRel.push(rel);
      for (let j = 0; j < 16; j++) this.cInst.push(j === 12 && rel ? inst[i + 12] - rowBase0 : inst[i + j]);
    }
  }

  private replay(inst: number[], crv: number[], rws: number[]) {
    const quadOfs = crv.length / 6, rowOfs = rws.length / 5;
    for (let i = 0; i < this.cCrv.length; i++) crv.push(this.cCrv[i]);
    for (let i = 0; i < this.cRws.length; i += 5) {
      rws.push(this.cRws[i] + quadOfs, this.cRws[i + 1], this.cRws[i + 2], this.cRws[i + 3], this.cRws[i + 4]);
    }
    for (let k = 0, i = 0; i < this.cInst.length; i += 16, k++) {
      const rel = this.cRel[k];
      for (let j = 0; j < 16; j++) inst.push(j === 12 && rel ? this.cInst[i + 12] + rowOfs : this.cInst[i + j]);
    }
  }
}
