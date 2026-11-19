// Browser nativo do InkOS com suporte a URLs externas e arquivos vfs:/
export function mountBrowser(root, { vfs }) {
  const history = ["https://hub.inkdos.workers.dev/"];
  let idx = 0;

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;">
      <div style="display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--surface);align-items:center;">
        <button id="b-back" class="win-btn" type="button" title="Voltar">←</button>
        <button id="b-fwd" class="win-btn" type="button" title="Avançar">→</button>
        <button id="b-reload" class="win-btn" type="button" title="Recarregar">↻</button>
        <input id="b-url" type="text" value="${history[0]}" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel-solid);color:var(--text);font-size:12.5px;outline:none;">
        <button id="b-go" class="top-pill active" type="button">Ir</button>
        <button id="b-save-vfs" class="top-pill" type="button" title="Salvar bookmark/nota no VFS">Salvar VFS</button>
      </div>
      <div style="display:flex;gap:6px;padding:5px 10px;border-bottom:1px solid var(--border);background:var(--panel-solid);font-size:11.5px;overflow-x:auto;">
        <button class="top-pill" data-q="https://hub.inkdos.workers.dev/" type="button">InkDOS Hub</button>
        <button class="top-pill" data-q="vfs:/Home/bem-vindo.txt" type="button">vfs://Home/bem-vindo.txt</button>
      </div>
      <div id="b-stage" style="flex:1;min-height:0;position:relative;display:flex;"></div>
    </div>
  `;

  const input = root.querySelector("#b-url");
  const stage = root.querySelector("#b-stage");

  const navigate = async (rawUrl, push = true) => {
    const target = (rawUrl || "").trim();
    if (!target) return;
    if (push && history[idx] !== target) {
      history.splice(idx + 1);
      history.push(target);
      idx = history.length - 1;
    }
    input.value = target;
    stage.innerHTML = "";

    if (target.startsWith("vfs://") || target.startsWith("vfs:")) {
      const vfsPath = target.replace(/^vfs:\/?/, "/");
      const blob = await vfs.toBlob(vfsPath);
      if (!blob) {
        stage.innerHTML = `<div style="padding:16px;color:var(--danger);">Arquivo não encontrado no VFS: ${vfsPath}</div>`;
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.src = objUrl;
      iframe.style.cssText = "flex:1;width:100%;height:100%;border:0;background:var(--bg);";
      stage.append(iframe);
      return;
    }

    const normalized = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    input.value = normalized;
    const iframe = document.createElement("iframe");
    iframe.src = normalized;
    iframe.style.cssText = "flex:1;width:100%;height:100%;border:0;background:var(--bg);";
    iframe.allow = "fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write";
    stage.append(iframe);
  };

  root.querySelector("#b-go").onclick = () => navigate(input.value);
  input.onkeydown = (e) => { if (e.key === "Enter") navigate(input.value); };
  root.querySelector("#b-back").onclick = () => { if (idx > 0) navigate(history[--idx], false); };
  root.querySelector("#b-fwd").onclick = () => { if (idx < history.length - 1) navigate(history[++idx], false); };
  root.querySelector("#b-reload").onclick = () => navigate(input.value, false);
  root.querySelector("#b-save-vfs").onclick = async () => {
    const stamp = Date.now();
    await vfs.writeText(`/Downloads/bookmark-${stamp}.txt`, `URL: ${input.value}\nSalvo em: ${new Date().toISOString()}\n`);
    alert(`Salvo em /Downloads/bookmark-${stamp}.txt`);
  };
  root.querySelectorAll("[data-q]").forEach((btn) => {
    btn.onclick = () => navigate(btn.dataset.q);
  });

  navigate(history[0], false);
}
