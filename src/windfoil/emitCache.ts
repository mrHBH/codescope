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
  // Captured slices live in TYPED arrays: replay is direct-indexed composition
  // into the (pre-grown) target number[]s — no push(...spread) per frame.
  private cInstF = new Float32Array(0);
  private cCrvF = new Float32Array(0);
  private cRwsU = new Uint32Array(0);
  private cInstLen = 0;
  private cCrvLen = 0;
  private cRwsLen = 0;
  // Offsets (into cInstF) of board-relative rowBase fields — patched at replay.
  private cRelIdxs: number[] = [];
  /** Cumulative rebuild count — a cache that climbs while idle is thrashing. */
  misses = 0;

  invalidate() { this.valid = false; this.sig = ''; this.captured = false; }

  // ── Slice-cache API (per-mobject composition in WgScene) ─────────────────
  /** Caller-managed signature (WgScene keys slices on geometry state). */
  signature = '';
  /** Whether capture() has ever run. A signature of '' is a legitimate geometry
   *  state (e.g. a param-less scene's lastParamSig), so it cannot double as the
   *  "never captured" sentinel — without this flag the first emit of such a
   *  mobject matches the '' default and is skipped forever (empty slice). */
  captured = false;
  get instLen(): number { return this.cInstLen; }
  get crvLen(): number { return this.cCrvLen; }
  get rwsLen(): number { return this.cRwsLen; }

  /** Capture from external scratch buffers (inst0/crv0/rws0 mark where the
   *  mobject's own content starts; the seeded prefix before them makes atlas
   *  references distinguishable from scratch rows). */
  captureFrom(inst: number[], crv: number[], rws: number[], inst0: number, crv0: number, rws0: number) {
    this.capture(inst, crv, rws, inst0, crv0, rws0);
  }

  /** Compose the captured slice into target buffers at the given offsets,
   *  rebasing row/quad references. Direct-indexed — no pushes. */
  appendInto(inst: number[], crv: number[], rws: number[], iOff: number, cOff: number, rOff: number) {
    const cf = this.cInstF, nI = this.cInstLen;
    inst.length = iOff + nI;
    for (let i = 0; i < nI; i++) inst[iOff + i] = cf[i];
    // rowBase (inst[12]) is a ROW index, but rOff is a FLOAT offset — the
    // relative patch must add rows (rOff/5), exactly like EmitCache.replay's
    // rowOfs. Adding rOff raw points fills/strokes off the end of the row
    // buffer → zero coverage (the "strokes vanished" bug).
    const rowOfs = rOff / 5;
    for (let k = 0; k < this.cRelIdxs.length; k++) inst[iOff + this.cRelIdxs[k]] += rowOfs;
    const cc = this.cCrvF, nC = this.cCrvLen;
    crv.length = cOff + nC;
    for (let i = 0; i < nC; i++) crv[cOff + i] = cc[i];
    const quadOfs = cOff / 6;
    const rr = this.cRwsU, nR = this.cRwsLen;
    rws.length = rOff + nR;
    for (let i = 0; i < nR; i += 5) {
      rws[rOff + i] = rr[i] + quadOfs;
      rws[rOff + i + 1] = rr[i + 1];
      rws[rOff + i + 2] = rr[i + 2];
      rws[rOff + i + 3] = rr[i + 3];
      rws[rOff + i + 4] = rr[i + 4];
    }
  }

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
    const nCrv = crv.length - crv0, nRws = rws.length - rws0, nInst = inst.length - inst0;
    if (this.cCrvF.length < nCrv) this.cCrvF = new Float32Array(Math.max(nCrv, 64));
    for (let i = 0; i < nCrv; i++) this.cCrvF[i] = crv[crv0 + i];
    this.cCrvLen = nCrv;
    if (this.cRwsU.length < nRws) this.cRwsU = new Uint32Array(Math.max(nRws, 32));
    // Rows: store `start` relative to the board's own curve base.
    for (let i = 0; i < nRws; i += 5) {
      this.cRwsU[i] = rws[rws0 + i] - quadBase0;
      this.cRwsU[i + 1] = rws[rws0 + i + 1];
      this.cRwsU[i + 2] = rws[rws0 + i + 2];
      this.cRwsU[i + 3] = rws[rws0 + i + 3];
      this.cRwsU[i + 4] = rws[rws0 + i + 4];
    }
    this.cRwsLen = nRws;
    if (this.cInstF.length < nInst) this.cInstF = new Float32Array(Math.max(nInst, 64));
    this.cRelIdxs.length = 0;
    // Instances: rowBase >= rowBase0 means the board created the rows itself
    // (store relative + remember the offset to patch); smaller values reference
    // the immutable atlas prefix and replay untouched. This rowBase test applies
    // ONLY to shape instances (fillRule < 1.5): solid-rect (2) and procedural
    // grid (3) instances carry a band in inst[12..15], NOT a row reference —
    // they are always stored verbatim (a grid step in inst[12] can exceed
    // rowBase0 and would otherwise be misclassified and corrupt the spacing).
    for (let i = 0; i < nInst; i += 16) {
      const src = inst0 + i;
      if (inst[src + 3] < 1.5 && inst[src + 12] >= rowBase0) {
        this.cRelIdxs.push(i + 12);
        for (let j = 0; j < 16; j++) this.cInstF[i + j] = j === 12 ? inst[src + 12] - rowBase0 : inst[src + j];
      } else {
        for (let j = 0; j < 16; j++) this.cInstF[i + j] = inst[src + j];
      }
    }
    this.cInstLen = nInst;
    this.captured = true;
  }

  private replay(inst: number[], crv: number[], rws: number[]) {
    const quadOfs = crv.length / 6, rowOfs = rws.length / 5;
    const cc = this.cCrvF, nC = this.cCrvLen;
    const cb = crv.length;
    crv.length = cb + nC;
    for (let i = 0; i < nC; i++) crv[cb + i] = cc[i];
    const rr = this.cRwsU, nR = this.cRwsLen;
    const rb = rws.length;
    rws.length = rb + nR;
    for (let i = 0; i < nR; i += 5) {
      rws[rb + i] = rr[i] + quadOfs;
      rws[rb + i + 1] = rr[i + 1];
      rws[rb + i + 2] = rr[i + 2];
      rws[rb + i + 3] = rr[i + 3];
      rws[rb + i + 4] = rr[i + 4];
    }
    const cf = this.cInstF, nI = this.cInstLen;
    const ib = inst.length;
    inst.length = ib + nI;
    for (let i = 0; i < nI; i++) inst[ib + i] = cf[i];
    for (let k = 0; k < this.cRelIdxs.length; k++) inst[ib + this.cRelIdxs[k]] += rowOfs;
  }
}
