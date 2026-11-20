// Swap worker: sole owner of the OPFS FileSystemSyncAccessHandle for the swap file.
// Protocol (see docs/adr/ADR-swap.md): after "init" via postMessage, the worker
// blocks in Atomics.wait on a control SharedArrayBuffer and serves requests:
//   ctl[0] state: 0 idle, 1 request, 2 done, 3 error
//   ctl[1] op:    1 page-out (frame -> slot), 2 page-in (slot -> frame),
//                 3 truncate (wipe file), 4 flush, 5 close
//   ctl[2] frame, ctl[3] slot, ctl[4] result/error code
const IDLE = 0, REQUEST = 1, DONE = 2, ERROR = 3;
const OP_OUT = 1, OP_IN = 2, OP_TRUNCATE = 3, OP_FLUSH = 4, OP_CLOSE = 5;
const FILE_NAME = "inkos-swap.bin";

let handle = null;
let memory = null;
let ctl = null;
let pageSize = 65536;
let maxSlots = 0;

async function openHandle() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(FILE_NAME, { create: true });
  if (typeof fh.createSyncAccessHandle !== "function") return null;
  return fh.createSyncAccessHandle();
}

async function quotaSlots(requested) {
  try {
    const { quota = 0, usage = 0 } = (await navigator.storage.estimate?.()) || {};
    if (!quota) return requested;
    // Use at most half of the remaining quota for swap.
    return Math.max(0, Math.min(requested, Math.floor((quota - usage) / 2 / pageSize)));
  } catch {
    return requested;
  }
}

function serve(op, frame, slot) {
  const bytes = new Uint8Array(memory.buffer);
  const memOff = frame * pageSize;
  const fileOff = slot * pageSize;
  switch (op) {
    case OP_OUT: {
      if (slot >= maxSlots) return -2;
      if (memOff + pageSize > bytes.byteLength) return -1;
      // SyncAccessHandle cannot read from a SharedArrayBuffer view directly.
      const tmp = bytes.slice(memOff, memOff + pageSize);
      const n = handle.write(tmp, { at: fileOff });
      return n === pageSize ? 0 : -3;
    }
    case OP_IN: {
      if (memOff + pageSize > bytes.byteLength) return -1;
      const tmp = new Uint8Array(pageSize);
      const n = handle.read(tmp, { at: fileOff });
      if (n !== pageSize) return -4;
      bytes.set(tmp, memOff);
      return 0;
    }
    case OP_TRUNCATE:
      handle.truncate(0);
      handle.flush();
      return 0;
    case OP_FLUSH:
      handle.flush();
      return 0;
    default:
      return -9;
  }
}

function loop() {
  for (;;) {
    Atomics.wait(ctl, 0, IDLE);
    if (Atomics.load(ctl, 0) !== REQUEST) continue;
    const op = ctl[1];
    if (op === OP_CLOSE) {
      try { handle.truncate(0); handle.flush(); handle.close(); } catch (_) {}
      Atomics.store(ctl, 4, 0);
      Atomics.store(ctl, 0, DONE);
      Atomics.notify(ctl, 0);
      self.close();
      return;
    }
    let rc;
    try {
      rc = serve(op, ctl[2], ctl[3]);
    } catch (_) {
      rc = -8;
    }
    Atomics.store(ctl, 4, rc);
    Atomics.store(ctl, 0, rc === 0 ? DONE : ERROR);
    Atomics.notify(ctl, 0);
  }
}

self.addEventListener("message", async (event) => {
  const msg = event.data || {};
  if (msg.type !== "init") return;
  pageSize = Number(msg.pageSize) || 65536;
  memory = msg.memory;
  ctl = new Int32Array(msg.control);
  try {
    handle = await openHandle();
  } catch (_) {
    handle = null;
  }
  if (handle) {
    handle.truncate(0); // stale swap from a previous session is never reused
    maxSlots = await quotaSlots(Number(msg.maxSlots) || 8192);
  }
  self.postMessage({ type: "ready", pageSize, hasOpfsSync: Boolean(handle), maxSlots });
  if (handle && memory?.buffer instanceof SharedArrayBuffer) loop();
});
