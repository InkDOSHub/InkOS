const categories = {
  productivity: [
    ["pdf", "PDF", "i-files"], ["edit-pdf", "Edit PDF", "i-files"], ["security", "Security", "i-settings"],
    ["docs-artcraft", "ArtCraft Documents", "i-files"], ["sheets-artcraft", "ArtCraft Sheets", "i-files"], ["slides-artcraft", "ArtCraft Presentations", "i-desktop"],
    ["docs-inkdos", "InkDOS Documents", "i-files"], ["sheets-inkdos", "InkDOS Sheets", "i-files"], ["slides-inkdos", "InkDOS Presentations", "i-desktop"],
    ["plain-text", "Plain Text", "i-files"], ["epub", "EPUB Reader", "i-files"],
  ],
  media: [["photos", "Photos", "i-files"], ["video", "Video", "i-desktop"], ["music", "Music", "i-desktop"], ["recorder", "Recorder", "i-desktop"], ["webcam", "Webcam", "i-desktop"], ["whiteboard", "Whiteboard", "i-desktop"]],
  system: [["transfer", "Transfer", "i-files"], ["code", "Code", "i-terminal"], ["terminal", "Alpine Terminal", "i-terminal"], ["zip", "Archive", "i-files"], ["inksoc", "InkSoC", "i-settings"], ["wasm-build", "Wasm Build", "i-terminal"]],
  entertainment: [["ai-chat", "AI Chat", "i-desktop"], ["games", "Games", "i-desktop"]],
};

const source = { webcam: "InkDOSHub/InkCam", terminal: "InkDOSHub/InkShell", inksoc: "InkDOSHub/InkSoC", "ai-chat": "InkDOSHub/InkMind", games: "InkDOSHub/InkArcade", "benchmark": "InkDOSHub/InkBench" };
const heavy = {
  "ai-chat": { requiresWebGPU: true, memoryBudgetMB: 600, note: "Quantized models only; model loading is not bundled." },
  games: { graphics: ["webgpu", "webgl2"], audioWorklet: true },
  benchmark: { telemetry: true, targetRatio: 0.7 },
};
export const APP_REGISTRY = Object.freeze(Object.fromEntries(Object.entries(categories).flatMap(([category, entries]) => entries.map(([id, title, icon]) => [id, Object.freeze({ id, title, category, icon, entrypoint: `./apps/${id}/index.html`, source: source[id] ?? null, requirements: heavy[id] ?? {} })]))));
export const APP_CATEGORIES = Object.freeze(Object.keys(categories));

export class AppLauncher {
  constructor({ root, bridge, wm }) {
    this.root = root; this.bridge = bridge; this.wm = wm; this.instances = new Map();
  }
  mount(button = document.querySelector("#apps-button")) {
    if (!button) return;
    const menu = document.createElement("section"); menu.className = "app-launcher window"; menu.setAttribute("aria-label", "Applications");
    menu.style.cssText = "left:50%;top:12%;width:min(720px,94vw);height:min(560px,72vh);padding:16px;overflow:auto";
    for (const category of APP_CATEGORIES) {
      const heading = document.createElement("h2"); heading.textContent = category.replace(/^./, c => c.toUpperCase()); menu.append(heading);
      const grid = document.createElement("div"); grid.className = "app-grid";
      for (const app of Object.values(APP_REGISTRY).filter(item => item.category === category)) {
        const launch = document.createElement("button"); launch.className = "app-tile";
        launch.innerHTML = `<svg aria-hidden="true"><use href="./icons.svg#${app.icon}"></use></svg><span></span>`; launch.querySelector("span").textContent = app.title;
        launch.addEventListener("click", () => this.open(app.id)); grid.append(launch);
      }
      menu.append(grid);
    }
    this.root.append(menu); this.menu = menu; button.addEventListener("click", () => { menu.hidden = !menu.hidden; });
    menu.hidden = true;
  }
  async check(app) {
    const req = app.requirements;
    if (req.requiresWebGPU && !navigator.gpu) throw new Error("This app requires WebGPU; it cannot start on this browser/device.");
    if (req.graphics && !navigator.gpu && !document.createElement("canvas").getContext("webgl2")) throw new Error("This app requires WebGPU or WebGL2.");
    if (req.audioWorklet && !("AudioWorklet" in window)) throw new Error("AudioWorklet is unavailable.");
    if (req.memoryBudgetMB && performance.memory?.jsHeapSizeLimit && performance.memory.jsHeapSizeLimit < req.memoryBudgetMB * 1024 ** 2) throw new Error("Insufficient reported JS heap budget for this app.");
  }
  async open(id) {
    const app = APP_REGISTRY[id]; if (!app) throw new Error(`Unknown app: ${id}`);
    try { await this.check(app); } catch (error) { alert(error.message); return null; }
    if (this.instances.has(id)) { this.instances.get(id).frame.focus(); return this.instances.get(id).frame; }
    const frame = document.createElement("iframe"); frame.className = "window app-window"; frame.title = app.title; frame.src = app.entrypoint;
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-downloads"); frame.setAttribute("allow", "webgpu; fullscreen");
    frame.style.cssText = "left:8%;top:8%;width:min(900px,88vw);height:min(680px,78vh);border:1px solid var(--surface1);border-radius:12px;background:var(--base);will-change:transform";
    const close = document.createElement("button"); close.className = "app-close"; close.type = "button"; close.textContent = `Close ${app.title}`; close.addEventListener("click", () => this.close(id));
    this.root.append(frame, close); const port = this.bridge.connect(frame, app);
    this.instances.set(id, { app, frame, close, port }); this.wm?.windows.push(frame);
    frame.addEventListener("load", () => frame.contentWindow.postMessage({ type: "inkos:init", appId: id }, "*", [port]), { once: true });
    return frame;
  }
  close(id) {
    const item = this.instances.get(id); if (!item) return;
    item.port.postMessage({ type: "inkos:dispose" }); item.port.close(); item.frame.remove(); item.close.remove();
    this.wm && (this.wm.windows = this.wm.windows.filter(win => win !== item.frame));
    this.instances.delete(id);
  }
  closeAll() { for (const id of this.instances.keys()) this.close(id); }
}
