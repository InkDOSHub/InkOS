// Main-thread side of the OPFS swap: InkPager (Rust, CLOCK) decides, the swap
// worker moves bytes. Pages are 64 KiB = one Wasm page. See docs/adr/ADR-swap.md.
const IDLE = 0, REQUEST = 1, DONE = 2;
const OP_OUT = 1, OP_IN = 2, OP_TRUNCATE = 3, OP_FLUSH = 4, OP_CLOSE = 5;

export class Swap {
  constructor({ memory, control, pager, pageSize = 65536 }) {
    this.memory = memory;
    this.ctl = new Int32Array(control);
    this.pager = pager;
    this.pageSize = pageSize;
    this.queue = Promise.resolve();
  }

  async _call(op, frame = 0, slot = 0) {
    const c = this.ctl;
    c[1] = op;
    c[2] = frame;
    c[3] = slot;
    c[4] = 0;
    Atomics.store(c, 0, REQUEST);
    Atomics.notify(c, 0);
    if (typeof Atomics.waitAsync === "function") {
      const w = Atomics.waitAsync(c, 0, REQUEST);
      if (w.async) await w.value;
    } else {
      while (Atomics.load(c, 0) === REQUEST) await new Promise((r) => setTimeout(r, 0));
    }
    const ok = Atomics.load(c, 0) === DONE;
    const rc = c[4];
    Atomics.store(c, 0, IDLE);
    if (!ok) throw new Error(`swap op ${op} failed (${rc})`);
  }

  _ensureFrame(frame) {
    const need = (frame + 1) * this.pageSize;
    const have = this.memory.buffer.byteLength;
    if (need > have) this.memory.grow(Math.ceil((need - have) / this.pageSize));
  }

  // Makes vpage resident; resolves to its byte offset in memory.buffer.
  access(vpage) {
    const run = async () => {
      const [kind, frame, , toSlot, fromSlot] = this.pager.access(vpage);
      this._ensureFrame(frame);
      const view = new Uint8Array(this.memory.buffer, frame * this.pageSize, this.pageSize);
      if (kind === 2) await this._call(OP_OUT, frame, toSlot);
      if (kind !== 0) {
        if (fromSlot >= 0) await this._call(OP_IN, frame, fromSlot);
        else view.fill(0);
      }
      return frame * this.pageSize;
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => {});
    return p;
  }

  stats() {
    return {
      resident: this.pager.resident_count(),
      swapped: this.pager.swapped_count(),
      swapFileBytes: this.pager.swap_high_water() * this.pageSize,
    };
  }

  flush() {
    return (this.queue = this.queue.then(() => this._call(OP_FLUSH)));
  }

  // Lock / end of session: drop the page table and wipe the swap file.
  wipe() {
    return (this.queue = this.queue.then(async () => {
      this.pager.reset();
      await this._call(OP_TRUNCATE);
    }));
  }

  close() {
    return (this.queue = this.queue.then(() => this._call(OP_CLOSE)));
  }
}
