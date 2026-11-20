// Navegador integrado ao InkOS com suporte a vfs:// e atalhos rápidos
const BOOKMARKS_PATH = "/Home/bookmarks.json";
const SHORTCUTS = [
  { label: "GitHub", url: "https://github.com" },
  { label: "Cloudflare Pages", url: "https://dash.cloudflare.com" },
  { label: "WebAssembly", url: "https://webassembly.org" },
  { label: "MDN Web Docs", url: "https://developer.mozilla.org" },
];

export function mountBrowser(root, { vfs }, initialCtx = {}) {
  const history = [];
  let histIdx = -1;
  let activeUrl = initialCtx?.url || "https://webassembly.org";

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;">
      <div style="display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);background:var(--panel-solid);align-items:center;">
        <button id="br-back" class="win-btn" type="button" title="Voltar">←</button>
        <button id="br-fwd" class="win-btn" type="button" title="Avançar">→</button>
        <button id="br-reload" class="win-btn" type="button" title="Recarregar">↻</button>
        <form id="br-form" style="flex:1;display:flex;gap:6px;">
          <input id="br-url" type="text" style="flex:1;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12.5px;">
          <button type="submit" class="top-pill active">Ir</button>
        </form>
        <button id="br-save-bm" class="top-pill" type="button">Salvar no VFS</button>
      </div>
      <div id="br-shortcuts" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--surface);font-size:11.5px;"></div>
      <div id="br-stage" style="flex:1;position:relative;min-height:0;background:var(--panel-solid);"></div>
    </div>
  `;

  const urlInput = root.querySelector("#br-url");
  const stage = root.querySelector("#br-stage");
  const shortcutsEl = root.querySelector("#br-shortcuts");
  const btnBack = root.querySelector("#br-back");
  const btnFwd = root.querySelector("#br-fwd");

  const syncNavButtons = () => {
    btnBack.disabled = histIdx <= 0;
    btnFwd.disabled = histIdx >= history.length - 1;
  };

  const renderTarget = async (rawUrl) => {
    const trimmed = (rawUrl || "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith("vfs://")) {
      const cleanPath = "/" + trimmed.replace(/^vfs:\/+/, "");
      const txt = await vfs?.readText?.(cleanPath);
      const safe = (txt ?? `Arquivo não encontrado no VFS: ${cleanPath}`)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;");
      stage.innerHTML = `<pre style="margin:0;padding:16px;height:100%;overflow:auto;font-size:12.5px;white-space:pre-wrap;color:var(--text);background:var(--panel-solid);">${safe}</pre>`;
      return;
    }

    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let url;
    try {
      url = new URL(normalized);
    } catch (_) {
      stage.textContent = "Endereço inválido.";
      return;
    }
    stage.replaceChildren(pageView(url));
  };

  // InkOS runs cross-origin isolated (COEP require-corp) for SharedArrayBuffer.
  // A page from another site can only be shown in a "credentialless" iframe
  // (Chromium); Safari has no such iframe, so there the page opens in a tab.
  // Sites that forbid framing (X-Frame-Options / CSP frame-ancestors) never
  // show inside any iframe.
  const canFrame = (url) =>
    url.origin === location.origin ||
    !self.crossOriginIsolated ||
    "credentialless" in HTMLIFrameElement.prototype;

  const pageView = (url) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;height:100%;";
    const bar = document.createElement("div");
    bar.style.cssText = "padding:6px 12px;font-size:11.5px;color:var(--muted);background:var(--surface);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;";
    const note = document.createElement("span");
    const tab = document.createElement("a");
    tab.href = url.href;
    tab.target = "_blank";
    tab.rel = "noopener noreferrer";
    tab.className = "top-pill active";
    tab.textContent = "Abrir em nova aba";
    bar.append(note, tab);
    wrap.append(bar);
    if (!canFrame(url)) {
      note.textContent = "Este navegador não mostra sites externos dentro do InkOS (isolamento de origem). Use a nova aba.";
      const card = document.createElement("div");
      card.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;color:var(--muted);";
      const host = document.createElement("strong");
      host.style.cssText = "color:var(--text);font-size:15px;";
      host.textContent = url.host;
      const big = tab.cloneNode(true);
      big.style.cssText = "font-size:14px;padding:10px 18px;";
      card.append(host, big);
      wrap.append(card);
      return wrap;
    }
    note.textContent = "Se a página ficar em branco, o site não permite ser exibido dentro de outra página.";
    const fr = document.createElement("iframe");
    fr.setAttribute("credentialless", "");
    fr.referrerPolicy = "no-referrer";
    fr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
    fr.style.cssText = "flex:1;width:100%;height:100%;border:0;background:#fff;";
    fr.src = url.href;
    wrap.append(fr);
    return wrap;
  };

  const navigate = async (rawUrl, push = true) => {
    const trimmed = (rawUrl || "").trim();
    if (!trimmed) return;
    activeUrl = trimmed.startsWith("vfs://")
      ? trimmed
      : /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    urlInput.value = activeUrl;
    if (push) {
      history.splice(histIdx + 1);
      history.push(activeUrl);
      histIdx = history.length - 1;
    }
    syncNavButtons();
    await renderTarget(activeUrl);
  };

  for (const sc of SHORTCUTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "top-pill";
    b.textContent = sc.label;
    b.onclick = () => navigate(sc.url);
    shortcutsEl.append(b);
  }

  root.querySelector("#br-form").onsubmit = (e) => {
    e.preventDefault();
    navigate(urlInput.value);
  };
  btnBack.onclick = () => {
    if (histIdx > 0) {
      histIdx--;
      navigate(history[histIdx], false);
    }
  };
  btnFwd.onclick = () => {
    if (histIdx < history.length - 1) {
      histIdx++;
      navigate(history[histIdx], false);
    }
  };
  root.querySelector("#br-reload").onclick = () => navigate(activeUrl, false);

  root.querySelector("#br-save-bm").onclick = async () => {
    if (!vfs) return;
    let list = [];
    try {
      const existing = await vfs.readText(BOOKMARKS_PATH);
      if (existing) list = JSON.parse(existing);
    } catch (_) {}
    list.push({ title: activeUrl, url: activeUrl, savedAt: new Date().toISOString() });
    await vfs.writeText(BOOKMARKS_PATH, JSON.stringify(list, null, 2));
    alert(`Marcador salvo em ${BOOKMARKS_PATH}`);
  };

  navigate(activeUrl);
}
