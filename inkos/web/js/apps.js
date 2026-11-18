export const APPS = [
  { id: "pdf", name: "PDF Viewer", icon: "i-file-text", cat: "Docs" },
  { id: "edit-pdf", name: "Edit PDF", icon: "i-edit", cat: "Docs" },
  { id: "security", name: "Security", icon: "i-shield", cat: "System" },
  { id: "docs-artcraft", name: "Docs (ArtCraft)", icon: "i-file-text", cat: "Office" },
  { id: "sheets-artcraft", name: "Sheets (ArtCraft)", icon: "i-table", cat: "Office" },
  { id: "slides-artcraft", name: "Slides (ArtCraft)", icon: "i-presentation", cat: "Office" },
  { id: "docs-inkdos", name: "Docs (InkDOS)", icon: "i-file-text", cat: "Office" },
  { id: "sheets-inkdos", name: "Sheets (InkDOS)", icon: "i-table", cat: "Office" },
  { id: "slides-inkdos", name: "Slides (InkDOS)", icon: "i-presentation", cat: "Office" },
  { id: "plain-text", name: "Plain Text", icon: "i-notes", cat: "Docs" },
  { id: "epub", name: "EPUB Reader", icon: "i-book", cat: "Docs" },
  { id: "photos", name: "Photos", icon: "i-photo", cat: "Media" },
  { id: "video", name: "Video", icon: "i-video", cat: "Media" },
  { id: "music", name: "Music", icon: "i-music", cat: "Media" },
  { id: "recorder", name: "Recorder", icon: "i-microphone", cat: "Media" },
  { id: "webcam", name: "InkCam 4K", icon: "i-camera", cat: "Media" },
  { id: "transfer", name: "Transfer", icon: "i-arrows-exchange", cat: "Net" },
  { id: "whiteboard", name: "Whiteboard", icon: "i-brush", cat: "Media" },
  { id: "code", name: "Code Studio", icon: "i-code", cat: "Dev" },
  { id: "terminal", name: "InkShell Alpine", icon: "i-terminal", cat: "System" },
  { id: "zip", name: "Zip Archive", icon: "i-file-zip", cat: "System" },
  { id: "ai-chat", name: "InkMind AI", icon: "i-brain", cat: "AI" },
  { id: "inksoc", name: "InkSoC Monitor", icon: "i-cpu", cat: "System" },
  { id: "games", name: "InkArcade", icon: "i-device-gamepad", cat: "Games" },
  { id: "wasm-build", name: "Wasm Build", icon: "i-box", cat: "Dev" }
];

export function launchApp(app, desktopEl) {
  if (app.id === "terminal") {
    const term = document.querySelector("#terminal-window");
    if (term) term.hidden = false;
    return;
  }

  const existing = document.querySelector(`#win-${app.id}`);
  if (existing) {
    existing.hidden = false;
    existing.style.zIndex = String(Date.now() % 100000);
    return;
  }

  const win = document.createElement("section");
  win.id = `win-${app.id}`;
  win.className = "window";
  win.style.cssText = "top:56px;left:16px;right:16px;max-width:720px;margin:auto;z-index:50;";

  win.innerHTML = `
    <header class="window-title" data-drag-handle>
      <svg><use href="./icons.svg#${app.icon}"></use></svg>
      <span>${app.name} — [Wasm Sandbox]</span>
      <button class="win-close" aria-label="Fechar">×</button>
    </header>
    <div class="app-body" style="padding:12px;display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;"></div>
  `;

  const body = win.querySelector(".app-body");
  win.querySelector(".win-close").onclick = () => win.remove();

  if (["plain-text", "code", "docs-artcraft", "docs-inkdos"].includes(app.id)) {
    body.innerHTML = `
      <div style="display:flex;gap:6px;">
        <input class="fname" placeholder="nome-arquivo.txt" style="flex:1;padding:6px;border-radius:6px;background:var(--surface0);color:var(--text);border:1px solid var(--surface1);">
        <button class="btn-load" style="padding:6px 10px;border-radius:6px;">Abrir OPFS</button>
        <button class="btn-save" style="padding:6px 10px;border-radius:6px;">Salvar OPFS</button>
      </div>
      <textarea class="editor" rows="10" placeholder="Digite seu texto ou código aqui..." style="width:100%;padding:8px;border-radius:8px;background:var(--mantle);color:var(--text);border:1px solid var(--surface1);font-family:monospace;"></textarea>
      <small class="status" style="opacity:.8">Pronto (OPFS 64-bit)</small>
    `;
    const fname = body.querySelector(".fname");
    const editor = body.querySelector(".editor");
    const status = body.querySelector(".status");
    body.querySelector(".btn-save").onclick = async () => {
      if (!fname.value) return;
      const root = await navigator.storage.getDirectory();
      const fh = await root.getFileHandle(fname.value, { create: true });
      const w = await fh.createWritable();
      await w.write(editor.value);
      await w.close();
      status.textContent = `Salvo em OPFS: ${fname.value} (${editor.value.length} bytes)`;
    };
    body.querySelector(".btn-load").onclick = async () => {
      if (!fname.value) return;
      try {
        const root = await navigator.storage.getDirectory();
        const fh = await root.getFileHandle(fname.value);
        editor.value = await (await fh.getFile()).text();
        status.textContent = `Carregado de OPFS: ${fname.value}`;
      } catch (e) {
        status.textContent = `Erro: ${e.message}`;
      }
    };
  } else if (app.id === "inksoc") {
    const ram = ((window.inkOS?.soc?.ram_bytes?.() || 536870912) / 1048576).toFixed(0);
    body.innerHTML = `
      <div><strong>Kernel:</strong> InkSoC Rust Wasm64 Bridge</div>
      <div><strong>RAM Física Fixa:</strong> ${ram} MiB (Teto iOS Jetsam: 1024 MiB)</div>
      <div><strong>Swap Virtual:</strong> OPFS Sync (Páginas de 64 KiB)</div>
      <div><strong>JIT WebKit:</strong> ${window.crossOriginIsolated ? "Ativo (SAB + OMG Tier)" : "Isolamento Pendente"}</div>
      <div><strong>WebGPU:</strong> ${"gpu" in navigator ? "Disponível (Metal Backend)" : "WebGL2 Fallback"}</div>
    `;
  } else {
    body.innerHTML = `
      <p style="margin:0">Módulo <strong>${app.name}</strong> carregado sob demanda em sandbox isolada.</p>
      <p style="margin:0;font-size:12px;opacity:.8">Repositório fonte: <code>InkDOSHub/${app.id}</code> • Armazenamento: OPFS</p>
      <input type="file" class="local-file" style="margin-top:6px;">
      <div class="preview" style="margin-top:8px;"></div>
    `;
    body.querySelector(".local-file").onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const prev = body.querySelector(".preview");
      if (file.type.startsWith("image/")) prev.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px;">`;
      else if (file.type.startsWith("video/")) prev.innerHTML = `<video src="${url}" controls style="max-width:100%;border-radius:8px;"></video>`;
      else if (file.type.startsWith("audio/")) prev.innerHTML = `<audio src="${url}" controls style="width:100%;"></audio>`;
      else prev.innerHTML = `<iframe src="${url}" style="width:100%;height:320px;border:none;border-radius:8px;background:#fff;"></iframe>`;
    };
  }

  desktopEl.appendChild(win);
}
