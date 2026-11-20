# ADR: paged memory and OPFS swap

Status: accepted (2026-11-20). Implementation: `inkos/src/paging.rs`,
`inkos/web/js/swap.js`, `inkos/web/js/swap.worker.js`.

## Context

`WebAssembly.Memory` only grows; it never returns pages to the OS. iOS Safari
kills tabs around 1.2 GB. InkOS needs more addressable memory than it can keep
resident, without a large allocation at boot.

Two designs were considered:

- **(a) Software paging.** Every guest access goes through a page table.
  Transparent to guest code, but it costs a lookup on every access. It fits the
  emulated guest RAM of InkSoC, where every access is already mediated.
- **(b) Arenas by handle.** Kernel and apps hold handles to 64 KiB pages and ask
  the pager for a page before touching it (`swap.access(vpage)` returns the
  byte offset). Cold pages are evicted to OPFS and their frames reused.
  Cooperative, no per-access cost after the lookup.

## Decision

Use (b) for kernel and app memory. Use (a) only where InkSoC emulates guest RAM
(not built yet; the same `Pager` serves both).

- Page = 64 KiB = one Wasm page. Pool = growable `WebAssembly.Memory`
  (16 MiB at boot, 512 MiB ceiling, 1 GiB behind `?mem=1g`).
- Resident budget: 2048 frames (128 MiB) by default, well below the ceiling.
- Eviction: CLOCK (second chance). Rust, unit-tested natively
  (`cargo test --lib`: integrity under eviction, 100k random accesses, budget).
- One dedicated Worker owns the `FileSystemSyncAccessHandle` of
  `inkos-swap.bin` (one handle per file). Requests go through a control
  `SharedArrayBuffer`; the worker blocks in `Atomics.wait`, the main thread
  waits with `Atomics.waitAsync` (polling fallback).
- File grows only to the high-water mark of used slots. Cap: 8192 slots
  (512 MiB) and at most half of the free quota from `navigator.storage.estimate()`.
- The file is truncated at worker start, on `swap.wipe()` (lock / end of
  session) and on close.

## Fallbacks

- No `crossOriginIsolated` or shared-memory probe fails: profile `st`, swap off.
- No `createSyncAccessHandle`, or the handle is locked by another InkOS tab:
  swap off. Boot never fails because of swap. The Monitor shows the reason.

## Open items

- Swap pages are **not yet encrypted at rest** when an encrypted session is
  active. Plan: AES-GCM per page with a session key kept only in memory,
  IV = slot index + write counter. Status: PARCIAL.
- Second tab of InkOS on the same origin runs without swap (handle lock).
- Real-device validation on iOS 27 Safari: PENDENTE-DISPOSITIVO.
