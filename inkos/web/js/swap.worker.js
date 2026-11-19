// Worker de swap paginado (64 KB) para o InkOS
let state = {
  pageSize: 65536,
  memory: null,
  control: null,
  opfsHandle: null,
};

async function openSwapHandle() {
  if (!navigator.storage?.getDirectory) return null;
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle("inkos-swap.bin", { create: true });
  if (typeof fh.createSyncAccessHandle === "function") {
    return await fh.createSyncAccessHandle();
  }
  return null;
}

function getView() {
  const buf = state.memory?.buffer;
  if (!buf) return null;
  return new Uint8Array(buf);
}

self.addEventListener("message", async (event) => {
  const msg = event.data || {};

  if (msg.type === "init") {
    state.pageSize = Number(msg.pageSize) > 0 ? Number(msg.pageSize) : 65536;
    state.memory = msg.memory || null;
    state.control = msg.control || null;

    try {
      state.opfsHandle = await openSwapHandle();
    } catch (_) {
      state.opfsHandle = null;
    }

    self.postMessage({
      type: "ready",
      pageSize: state.pageSize,
      hasOpfsSync: Boolean(state.opfsHandle),
    });
    return;
  }

  if (msg.type === "page-out") {
    const pageIndex = Number(msg.pageIndex || 0);
    const view = getView();
    const offset = pageIndex * state.pageSize;
    if (!view || offset < 0 || offset + state.pageSize > view.byteLength) {
      self.postMessage({ type: "page-out-done", pageIndex, ok: false, reason: "bounds" });
      return;
    }

    const slice = view.slice(offset, offset + state.pageSize);
    if (state.opfsHandle) {
      try {
        state.opfsHandle.write(slice, { at: offset });
        state.opfsHandle.flush?.();
      } catch (_) {}
    }
    self.postMessage({ type: "page-out-done", pageIndex, ok: true });
    return;
  }

  if (msg.type === "page-in") {
    const pageIndex = Number(msg.pageIndex || 0);
    const view = getView();
    const offset = pageIndex * state.pageSize;
    if (!view || offset < 0 || offset + state.pageSize > view.byteLength) {
      self.postMessage({ type: "page-in-done", pageIndex, ok: false, reason: "bounds" });
      return;
    }

    if (state.opfsHandle) {
      try {
        const target = new Uint8Array(state.pageSize);
        state.opfsHandle.read(target, { at: offset });
        view.set(target, offset);
      } catch (_) {}
    }
    self.postMessage({ type: "page-in-done", pageIndex, ok: true });
    return;
  }

  if (msg.type === "close") {
    try {
      state.opfsHandle?.flush?.();
      state.opfsHandle?.close?.();
    } catch (_) {}
    state.opfsHandle = null;
    self.postMessage({ type: "closed" });
  }
});
