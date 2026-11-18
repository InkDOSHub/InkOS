const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export class WindowManager {
  constructor(root) {
    this.root = root;
    this.windows = [...root.querySelectorAll(".window")];
    this.active = 0;
    this.offsets = new Map(this.windows.map((w) => [w, { x: 0, y: 0 }]));
    for (const win of this.windows) {
      win.addEventListener("pointerdown", () => this.focus(win));
      const handle = win.querySelector("[data-drag-handle]");
      handle?.addEventListener("pointerdown", (event) => this.startDrag(event, win));
    }
  }
  focus(win) { this.active = this.windows.indexOf(win); this.windows.forEach((w, i) => { w.style.zIndex = String(2 + i); }); win.style.zIndex = "20"; }
  startDrag(event, win) {
    if (event.target.closest("button")) return;
    event.preventDefault(); this.focus(win);
    const origin = this.offsets.get(win); const sx = event.clientX - origin.x, sy = event.clientY - origin.y;
    const move = (e) => { const r = this.root.getBoundingClientRect(); const w = win.getBoundingClientRect(); const x = clamp(e.clientX - sx, -w.left + r.left, r.right - w.right); const y = clamp(e.clientY - sy, -w.top + r.top, r.bottom - w.bottom); this.move(win, x, y); };
    const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", done, { once: true });
  }
  move(win, x, y) { this.offsets.set(win, { x, y }); win.style.transform = `translate3d(${x}px,${y}px,0)`; }
  cycle(delta = 1) { if (!this.windows.length) return; this.active = (this.active + delta + this.windows.length) % this.windows.length; this.focus(this.windows[this.active]); }
}
