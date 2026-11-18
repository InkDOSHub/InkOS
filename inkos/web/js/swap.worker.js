const PAGE_SIZE = 64 * 1024;
const PAGE_MASK = PAGE_SIZE - 1;

let root;
let swapHandle;
let diskHandle;
let memory;
let control;

async function openOPFSFiles() {
  root = await navigator.storage.getDirectory();
  const swapFile = await root.getFileHandle("swap.bin", { create: true });
  const diskFile = await root.getFileHandle("disk.img", { create: true });
  swapHandle = await swapFile.createSyncAccessHandle();
  diskHandle = await diskFile.createSyncAccessHandle();
}

function getSize(handle) { return typeof handle.getSize === "function" ? handle.getSize() : 0; }

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    memory = data.memory;
    control = new Int32Array(memory.buffer);
    await openOPFSFiles();
    postMessage({ type: "ready", swapSize: getSize(swapHandle), diskSize: getSize(diskHandle) });
    return;
  }

  if (data.type !== "page-request") return;

  const { id, page, write, offset, byteLength } = data;
  const handle = write ? swapHandle : diskHandle;
  const fileOffset = Number(page) * PAGE_SIZE;

  let bytes;
  if (write) {
    bytes = new Uint8Array(memory.buffer, offset, byteLength || PAGE_SIZE);
    handle.write(bytes, { at: fileOffset });
  } else {
    bytes = new Uint8Array(PAGE_SIZE);
    handle.read(bytes, { at: fileOffset });
  }

  Atomics.store(control, id, 1);
  Atomics.notify(control, id, 1);
  postMessage({ type: "page-complete", id, page, write, data: write ? null : bytes.buffer });
};
