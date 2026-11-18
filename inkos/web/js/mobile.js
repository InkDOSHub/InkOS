const pointers = new Map();

export class MobileInput {
  constructor({ desktop, framebuffer, wm, worker }) {
    this.desktop = desktop; this.framebuffer = framebuffer; this.wm = wm; this.worker = worker; this.last = null; this.scrollY = 0;
    desktop.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") { desktop.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.last = { x: e.clientX, y: e.clientY }; } });
    desktop.addEventListener("pointermove", (e) => this.move(e));
    const clear = (e) => { pointers.delete(e.pointerId); if (!pointers.size) this.last = null; };
    desktop.addEventListener("pointerup", clear); desktop.addEventListener("pointercancel", clear);
    document.querySelectorAll(".modifier-bar [data-key]").forEach((button) => button.addEventListener("click", () => this.key(button.dataset.key)));
    this.followViewport(); visualViewport?.addEventListener("resize", () => this.followViewport()); visualViewport?.addEventListener("scroll", () => this.followViewport());
    this.setupExternalDisplay();
  }
  move(event) {
    if (!pointers.has(event.pointerId)) return;
    const before = pointers.get(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const count = pointers.size;
    if (count === 1) this.worker?.postMessage({ type: "input", event: "pointer-move", x: event.clientX, y: event.clientY, dx: event.clientX - before.x, dy: event.clientY - before.y });
    else if (count === 2) this.worker?.postMessage({ type: "input", event: "scroll", deltaX: event.clientX - before.x, deltaY: event.clientY - before.y });
  }
  key(key) {
    const target = document.activeElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (key === "Tab") { target.setRangeText("\t", target.selectionStart, target.selectionEnd, "end"); }
      else if (key.startsWith("Arrow")) target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      else target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      return;
    }
    this.worker?.postMessage({ type: "input", event: "key", key });
  }
  followViewport() {
    const viewport = window.visualViewport;
    const bar = document.querySelector("#modifier-bar");
    if (viewport && bar) bar.style.bottom = `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop) + 60}px`;
  }
  async setupExternalDisplay() {
    try {
      if (!("isExtended" in screen)) return;
      window.addEventListener("inkos:external-display", async () => {
        if (screen.isExtended && document.querySelector("#framebuffer").requestFullscreen) await document.querySelector("#framebuffer").requestFullscreen();
      });
    } catch (error) { console.warn("External display API unavailable", error); }
  }
  cycleWorkspace() { this.wm?.cycle(); }
}
