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
  // Offsets (into cInst) of board-relative rowBase fields — patched at replay.
  private cRelIdxs: number[] = [];
  /** Cumulative rebuild count — a cache that climbs while idle is thrashing. */
  misses = 0;

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
    this.misses++;
  }

  private capture(inst: number[], crv: number[], rws: number[], inst0: number, crv0: number, rws0: number) {
    const rowBase0 = rws0 / 5, quadBase0 = crv0 / 6;
    this.cCrv.length = 0; this.cRws.length = 0; this.cInst.length = 0; this.cRelIdxs.length = 0;
    for (let i = crv0; i < crv.length; i++) this.cCrv.push(crv[i]);
    // Rows: store `start` relative to the board's own curve base.
    for (let i = rws0; i < rws.length; i += 5) {
      this.cRws.push(rws[i] - quadBase0, rws[i + 1], rws[i + 2], rws[i + 3], rws[i + 4]);
    }
    // Instances: rowBase >= rowBase0 means the board created the rows itself
    // (store relative + remember the offset to patch); smaller values reference
    // the immutable atlas prefix and replay untouched.
    for (let i = inst0; i < inst.length; i += 16) {
      const o = i - inst0;
      if (inst[i + 12] >= rowBase0) {
        this.cRelIdxs.push(o + 12);
        for (let j = 0; j < 16; j++) this.cInst.push(j === 12 ? inst[i + 12] - rowBase0 : inst[i + j]);
      } else {
        for (let j = 0; j < 16; j++) this.cInst.push(inst[i + j]);
      }
    }
  }

  private replay(inst: number[], crv: number[], rws: number[]) {
    const quadOfs = crv.length / 6, rowOfs = rws.length / 5;
    // Bulk appends (native) instead of per-float push loops; only the relative
    // rowBases get patched in place afterwards. This is the idle-frame hot path
    // for every cached board — it used to run 16 conditional pushes per instance.
    pushAll(crv, this.cCrv);
    for (let i = 0; i < this.cRws.length; i += 5) {
      rws.push(this.cRws[i] + quadOfs, this.cRws[i + 1], this.cRws[i + 2], this.cRws[i + 3], this.cRws[i + 4]);
    }
    const base = inst.length;
    pushAll(inst, this.cInst);
    for (let k = 0; k < this.cRelIdxs.length; k++) inst[base + this.cRelIdxs[k]] += rowOfs;
  }
}

// Argument-count-safe bulk push (engines cap call arguments well below very
// large array lengths).
const CHUNK = 32768;
function pushAll(dst: number[], src: number[]) {
  if (src.length <= CHUNK) { dst.push(...src); return; }
  for (let i = 0; i < src.length; i += CHUNK) dst.push(...src.slice(i, i + CHUNK));
}
