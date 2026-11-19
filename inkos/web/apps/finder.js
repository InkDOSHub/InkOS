// Finder — Gerenciador de arquivos da memória interna do InkOS
export function mountFinder(root, { vfs, openApp }) {
  let cwd = "/Home";
  let selected = null;

  root.innerHTML = `
    <div style="display:flex;flex:1;min-height:0;height:100%;">
      <aside style="width:168px;padding:10px;border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:4px;font-size:12.5px;">
        <div style="font-size:10.5px;text-transform:uppercase;color:var(--muted);padding:4px 8px;">Locais</div>
        <button data-nav="/Home" type="button" class="top-pill" style="justify-content:flex-start;">🏠 Home</button>
        <button data-nav="/Documents" type="button" class="top-pill" style="justify-content:flex-start;">📄 Documents</button>
        <button data-nav="/Downloads" type="button" class="top-pill" style="justify-content:flex-start;">⬇ Downloads</button>
        <button data-nav="/Programs" type="button" class="top-pill" style="justify-content:flex-start;">⚙ Programs</button>
        <button data-nav="/" type="button" class="top-pill" style="justify-content:flex-start;">💾 Raiz (/)</button>
        <div style="margin-top:auto;font-size:11px;color:var(--muted);padding:8px;">Storage: ${vfs.mode.toUpperCase()}</div>
      </aside>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--panel-solid);align-items:center;">
          <button id="f-up" class="win-btn" type="button" title="Subir">↑</button>
          <span id="f-path" style="font-size:12.5px;font-weight:600;padding:0 6px;flex:1;">/Home</span>
          <button id="f-new-dir" class="top-pill" type="button">+ Pasta</button>
          <button id="f-new-txt" class="top-pill" type="button">+ Arquivo</button>
          <button id="f-import" class="top-pill" type="button">Importar</button>
          <input id="f-file-input" type="file" multiple hidden>
        </div>
        <div id="f-actions" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface);font-size:12px;">
          <button id="f-open" class="top-pill" type="button" disabled>Abrir</button>
          <button id="f-send-hub" class="top-pill" type="button" disabled>Abrir no Hub…</button>
          <button id="f-dl" class="top-pill" type="button" disabled>Baixar</button>
          <button id="f-ren" class="top-pill" type="button" disabled>Renomear</button>
          <button id="f-del" class="top-pill" type="button" disabled style="color:var(--danger);">Excluir</button>
        </div>
        <div id="f-list" style="flex:1;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;align-content:start;"></div>
        <div id="f-preview" style="max-height:150px;overflow:auto;border-top:1px solid var(--border);padding:8px 12px;font-size:12px;background:var(--surface);color:var(--muted);">Selecione um arquivo ou pasta.</div>
      </div>
    </div>
  `;

  const pathEl = root.querySelector("#f-path");
  const listEl = root.querySelector("#f-list");
  const prevEl = root.querySelector("#f-preview");
  const fileInput = root.querySelector("#f-file-input");

  const btnOpen = root.querySelector("#f-open");
  const btnSendHub = root.querySelector("#f-send-hub");
  const btnDl = root.querySelector("#f-dl");
  const btnRen = root.querySelector("#f-ren");
  const btnDel = root.querySelector("#f-del");

  const updateToolbar = () => {
    const has = Boolean(selected);
    const isFile = selected && selected.type === "file";
    btnOpen.disabled = !has;
    btnSendHub.disabled = !isFile;
    btnDl.disabled = !isFile;
    btnRen.disabled = !has;
    btnDel.disabled = !has;
  };

  const render = async () => {
    pathEl.textContent = cwd;
    updateToolbar();
    const items = await vfs.list(cwd);
    listEl.innerHTML = "";

    for (const item of items) {
      const card = document.createElement("button");
      card.type = "button";
      const isSel = selected?.path === item.path;
      card.style.cssText = `appearance:none;border:1px solid ${isSel ? "var(--accent)" : "var(--border)"};background:${isSel ? "var(--accent-soft)" : "var(--surface)"};color:var(--text);border-radius:10px;padding:10px 8px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:12px;`;
      const icon = item.type === "dir" ? "📁" : item.name.endsWith(".exe") ? "⚙" : item.name.endsWith(".pdf") ? "📕" : "📄";
      card.innerHTML = `<span style="font-size:22px;line-height:1;">${icon}</span><span style="word-break:break-word;">${item.name}</span><span style="font-size:10px;color:var(--muted);">${item.type === "dir" ? "Pasta" : `${item.size} B`}</span>`;

      card.onclick = async () => {
        selected = item;
        updateToolbar();
        render();
        if (item.type === "file") {
          if (item.mime?.startsWith("text/") || /\.(txt|md|json|js|css|html|py|sh|bat)$/i.test(item.name)) {
            const txt = await vfs.readText(item.path);
            prevEl.textContent = (txt || "").slice(0, 600) || "(vazio)";
          } else {
            prevEl.textContent = `${item.name} (${item.mime}, ${item.size} bytes) — pronto para abrir ou enviar ao Hub.`;
          }
        } else {
          prevEl.textContent = `Pasta ${item.path}`;
        }
      };

      card.ondblclick = async () => {
        if (item.type === "dir") {
          cwd = item.path;
          selected = null;
          await render();
        } else {
          btnOpen.click();
        }
      };

      listEl.append(card);
    }
  };

  root.querySelectorAll("[data-nav]").forEach((b) => {
    b.onclick = () => {
      cwd = b.dataset.nav;
      selected = null;
      render();
    };
  });

  root.querySelector("#f-up").onclick = () => {
    if (cwd === "/") return;
    cwd = cwd.split("/").slice(0, -1).join("/") || "/";
    selected = null;
    render();
  };

  root.querySelector("#f-new-dir").onclick = async () => {
    const name = prompt("Nome da nova pasta:");
    if (!name) return;
    await vfs.mkdir(`${cwd}/${name}`);
    render();
  };

  root.querySelector("#f-new-txt").onclick = async () => {
    const name = prompt("Nome do arquivo (ex.: notas.txt):", "nota.txt");
    if (!name) return;
    await vfs.writeText(`${cwd}/${name}`, "");
    selected = { path: `${cwd === "/" ? "" : cwd}/${name}`, name, type: "file", size: 0 };
    render();
  };

  root.querySelector("#f-import").onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    for (const f of fileInput.files || []) {
      const buf = new Uint8Array(await f.arrayBuffer());
      await vfs.writeBytes(`${cwd}/${f.name}`, buf, f.type);
    }
    fileInput.value = "";
    render();
  };

  btnOpen.onclick = async () => {
    if (!selected) return;
    if (selected.type === "dir") {
      cwd = selected.path;
      selected = null;
      return render();
    }
    if (selected.name.toLowerCase().endsWith(".exe")) {
      await openApp("cmdexe", undefined, { exePath: selected.path });
      return;
    }
    if (selected.name.toLowerCase().endsWith(".pdf")) {
      await vfs.serveToHubApp(selected.path, "pdf", (id) => openApp(id));
      return;
    }
    if (/\.(png|jpg|jpeg|webp|gif)$/i.test(selected.name)) {
      await vfs.serveToHubApp(selected.path, "foto", (id) => openApp(id));
      return;
    }
    await vfs.serveToHubApp(selected.path, "texto", (id) => openApp(id));
  };

  btnSendHub.onclick = async () => {
    if (!selected || selected.type !== "file") return;
    const appId = prompt("ID do app no Hub (ex.: texto, pdf, foto, codigo, zip, quadro):", "texto");
    if (!appId) return;
    await vfs.serveToHubApp(selected.path, appId.trim(), (id) => openApp(id));
  };

  btnDl.onclick = () => selected && vfs.download(selected.path);

  btnRen.onclick = async () => {
    if (!selected) return;
    const novo = prompt("Novo nome:", selected.name);
    if (!novo) return;
    await vfs.rename(selected.path, novo.trim());
    selected = null;
    render();
  };

  btnDel.onclick = async () => {
    if (!selected) return;
    await vfs.remove(selected.path);
    selected = null;
    render();
  };

  const off = vfs.onChange(render);
  render();
  return off;
}
