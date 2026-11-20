// Ajustes do Sistema + Planos de Fundo + Sessão Criptografada do InkOS (persistente)
const STORAGE_KEY = "inkos-prefs-v1";

export const WALLPAPERS = [
  {
    id: "cosmic-dusk",
    name: "InkOS Dusk",
    css: "radial-gradient(circle at 18% 18%, #262238 0%, transparent 52%), radial-gradient(circle at 82% 82%, #132235 0%, transparent 58%), #101016",
  },
  {
    id: "sonoma-horizon",
    name: "Sonoma Horizon",
    css: "linear-gradient(135deg, #1b2845 0%, #3b2d5e 45%, #8f4f4a 85%, #d98a5f 100%)",
  },
  {
    id: "sequoia-pine",
    name: "Sequoia Forest",
    css: "radial-gradient(circle at 75% 20%, #24453d 0%, transparent 55%), linear-gradient(160deg, #0d1817 0%, #162b29 55%, #0c1317 100%)",
  },
  {
    id: "midnight-oled",
    name: "Midnight OLED",
    css: "#000000",
  },
  {
    id: "latte-mist",
    name: "Latte Mist",
    css: "linear-gradient(135deg, #f6f1eb 0%, #e4ebf5 55%, #d7e0ef 100%)",
  },
  {
    id: "aurora-slate",
    name: "Aurora Slate",
    css: "radial-gradient(circle at 25% 25%, #1d3b53 0%, transparent 50%), radial-gradient(circle at 80% 70%, #3a2347 0%, transparent 55%), #0f1219",
  },
];

const ACCENTS = [
  { name: "InkOS Peach", value: "#e5a373" },
  { name: "macOS Blue", value: "#3b82f6" },
  { name: "Mauve", value: "#cba6f7" },
  { name: "Emerald", value: "#a6e3a1" },
  { name: "Rose", value: "#f38ba8" },
];

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (_) {}
  applyPrefs(next);
  return next;
}

export function applyPrefs(prefs = loadPrefs()) {
  if (prefs.theme === "latte" || prefs.theme === "mocha") {
    document.documentElement.dataset.theme = prefs.theme;
  }
  if (prefs.accent) {
    document.documentElement.style.setProperty("--accent", prefs.accent);
    document.documentElement.style.setProperty("--border-strong", `${prefs.accent}66`);
  }
  if (prefs.customWallpaperUrl) {
    document.body.style.background = `url("${prefs.customWallpaperUrl}") center / cover no-repeat fixed`;
  } else if (prefs.wallpaperCss) {
    document.body.style.background = prefs.wallpaperCss;
  }
  const dock = document.querySelector("#dock");
  if (dock && prefs.dockScale) {
    dock.style.transform = `scale(${prefs.dockScale})`;
    dock.style.transformOrigin = "bottom center";
  }
}

export async function mountSettings(root, { vfs, syncTheme }) {
  let tab = "wallpaper";
  let prefs = loadPrefs();
  let sessionMod = null;
  try {
    sessionMod = await import("../session.js");
  } catch (_) {
    sessionMod = null;
  }

  root.innerHTML = `
    <div style="display:flex;flex:1;min-height:0;height:100%;">
      <aside style="width:186px;padding:10px;border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;gap:4px;font-size:12.5px;">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:4px 8px;">Ajustes</div>
        <button data-tab="wallpaper" type="button" class="top-pill active" style="justify-content:flex-start;">Planos de Fundo</button>
        <button data-tab="appearance" type="button" class="top-pill" style="justify-content:flex-start;">Aparência e Dock</button>
        <button data-tab="session" type="button" class="top-pill" style="justify-content:flex-start;">Sessão &amp; Criptografia</button>
        <button data-tab="system" type="button" class="top-pill" style="justify-content:flex-start;">Sistema e Armazenamento</button>
      </aside>
      <div id="set-body" style="flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px;"></div>
    </div>
  `;

  const body = root.querySelector("#set-body");
  const navBtns = root.querySelectorAll("[data-tab]");

  const renderTab = async () => {
    navBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    prefs = loadPrefs();

    if (tab === "wallpaper") {
      body.innerHTML = `
        <div>
          <strong style="font-size:14px;">Planos de Fundo</strong>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Escolha um fundo nativo ou envie uma imagem do dispositivo.</div>
        </div>
        <div id="wp-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:8px;border-top:1px solid var(--border);">
          <button id="wp-upload" type="button" class="top-pill active">Escolher Imagem Local…</button>
          <button id="wp-from-vfs" type="button" class="top-pill">Usar do VFS (/Home ou /Downloads)</button>
          <input id="wp-file" type="file" accept="image/*" hidden>
        </div>
      `;
      const grid = body.querySelector("#wp-grid");
      for (const wp of WALLPAPERS) {
        const active = !prefs.customWallpaperUrl && prefs.wallpaperId === wp.id;
        const card = document.createElement("button");
        card.type = "button";
        card.style.cssText = `appearance:none;cursor:pointer;border:2px solid ${active ? "var(--accent)" : "var(--border)"};border-radius:12px;padding:6px;background:var(--surface);color:var(--text);text-align:left;display:flex;flex-direction:column;gap:6px;`;
        card.innerHTML = `
          <div style="height:76px;border-radius:8px;background:${wp.css};border:1px solid rgba(255,255,255,.08);"></div>
          <span style="font-size:12px;font-weight:500;">${wp.name}</span>
        `;
        card.onclick = () => {
          savePrefs({ wallpaperId: wp.id, wallpaperCss: wp.css, customWallpaperUrl: "" });
          renderTab();
        };
        grid.append(card);
      }

      const fileIn = body.querySelector("#wp-file");
      body.querySelector("#wp-upload").onclick = () => fileIn.click();
      fileIn.onchange = async () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        const buf = new Uint8Array(await f.arrayBuffer());
        const vfsPath = `/Home/wallpaper-${f.name}`;
        if (vfs) await vfs.writeBytes(vfsPath, buf, f.type);
        const objUrl = URL.createObjectURL(new Blob([buf], { type: f.type }));
        savePrefs({ wallpaperId: "custom", customWallpaperUrl: objUrl, customWallpaperVfs: vfsPath });
        renderTab();
      };

      body.querySelector("#wp-from-vfs").onclick = async () => {
        if (!vfs) return;
        const p = prompt("Caminho da imagem no VFS (ex.: /Home/foto.png):", prefs.customWallpaperVfs || "/Home/");
        if (!p) return;
        const url = await vfs.toObjectUrl(p.trim());
        if (!url) return alert("Imagem não encontrada no VFS.");
        savePrefs({ wallpaperId: "custom", customWallpaperUrl: url, customWallpaperVfs: p.trim() });
        renderTab();
      };
    }

    if (tab === "appearance") {
      const curTheme = document.documentElement.dataset.theme === "latte" ? "latte" : "mocha";
      const curScale = prefs.dockScale || 1;
      body.innerHTML = `
        <div>
          <strong style="font-size:14px;">Aparência e Dock</strong>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Sincroniza o tema do desktop e dos aplicativos do InkDOS Hub.</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="th-dark" type="button" class="top-pill ${curTheme === "mocha" ? "active" : ""}">Modo Escuro (Mocha)</button>
          <button id="th-light" type="button" class="top-pill ${curTheme === "latte" ? "active" : ""}">Modo Claro (Latte)</button>
        </div>
        <div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Cor de Destaque</div>
          <div id="acc-row" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">Tamanho da Dock: <strong id="dock-val">${Math.round(curScale * 100)}%</strong></label>
          <input id="dock-range" type="range" min="0.85" max="1.2" step="0.05" value="${curScale}" style="width:220px;">
        </div>
      `;
      body.querySelector("#th-dark").onclick = () => {
        savePrefs({ theme: "mocha" });
        syncTheme?.();
        renderTab();
      };
      body.querySelector("#th-light").onclick = () => {
        savePrefs({ theme: "latte" });
        syncTheme?.();
        renderTab();
      };
      const accRow = body.querySelector("#acc-row");
      for (const a of ACCENTS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "top-pill";
        b.style.borderColor = prefs.accent === a.value ? a.value : "var(--border)";
        b.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${a.value};display:inline-block;"></span>${a.name}`;
        b.onclick = () => {
          savePrefs({ accent: a.value });
          renderTab();
        };
        accRow.append(b);
      }
      const range = body.querySelector("#dock-range");
      range.oninput = () => {
        body.querySelector("#dock-val").textContent = `${Math.round(Number(range.value) * 100)}%`;
        savePrefs({ dockScale: Number(range.value) });
      };
    }

    if (tab === "session") {
      body.innerHTML = `
        <div>
          <strong style="font-size:14px;">Sessão &amp; Criptografia (.inkos)</strong>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Derivação de chave com PBKDF2 + AES-GCM 256-bit para congelar, despertar e exportar/importar o VFS.</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <input id="ses-pass" type="password" placeholder="Senha da sessão (.inkos)" autocomplete="off" style="flex:1;min-width:200px;padding:7px 11px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12.5px;">
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button id="ses-freeze" type="button" class="top-pill active">Congelar no VFS</button>
          <button id="ses-wake" type="button" class="top-pill">Despertar do VFS</button>
          <button id="ses-export" type="button" class="top-pill">Exportar .inkos</button>
          <button id="ses-import-btn" type="button" class="top-pill">Importar .inkos</button>
          <input id="ses-import-file" type="file" accept=".inkos" hidden>
        </div>
        <div id="ses-status" style="font-size:12px;color:var(--muted);padding:8px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--border);">
          ${sessionMod ? "Módulo session.js carregado." : "Módulo session.js indisponível."}
        </div>
      `;

      const passEl = body.querySelector("#ses-pass");
      const statusEl = body.querySelector("#ses-status");
      const impFileEl = body.querySelector("#ses-import-file");

      const setStatus = (txt, isErr = false) => {
        statusEl.textContent = txt;
        statusEl.style.color = isErr ? "var(--danger)" : "var(--muted)";
      };

      body.querySelector("#ses-freeze")?.addEventListener("click", async () => {
        try {
          if (!sessionMod || !vfs) throw new Error("Sessão ou VFS indisponível.");
          const res = await sessionMod.freezeSessionToVfs(vfs, passEl.value);
          setStatus(`Sessão congelada em ${res.path} (${res.bytes} bytes).`);
        } catch (e) {
          setStatus(e?.message || String(e), true);
        }
      });

      body.querySelector("#ses-wake")?.addEventListener("click", async () => {
        try {
          if (!sessionMod || !vfs) throw new Error("Sessão ou VFS indisponível.");
          const snap = await sessionMod.wakeSessionFromVfs(vfs, passEl.value);
          syncTheme?.();
          setStatus(`Sessão restaurada (${snap.entries.length} entradas de ${snap.createdAt}).`);
        } catch (e) {
          setStatus(e?.message || String(e), true);
        }
      });

      body.querySelector("#ses-export")?.addEventListener("click", async () => {
        try {
          if (!sessionMod || !vfs) throw new Error("Sessão ou VFS indisponível.");
          const res = await sessionMod.exportSessionFile(vfs, passEl.value);
          setStatus(`Exportado ${res.fileName} (${res.bytes} bytes).`);
        } catch (e) {
          setStatus(e?.message || String(e), true);
        }
      });

      body.querySelector("#ses-import-btn")?.addEventListener("click", () => impFileEl.click());
      impFileEl?.addEventListener("change", async () => {
        try {
          const f = impFileEl.files?.[0];
          if (!f) return;
          if (!sessionMod || !vfs) throw new Error("Sessão ou VFS indisponível.");
          const snap = await sessionMod.importSessionFile(vfs, f, passEl.value);
          syncTheme?.();
          setStatus(`Importado ${f.name} (${snap.entries.length} entradas).`);
        } catch (e) {
          setStatus(e?.message || String(e), true);
        } finally {
          impFileEl.value = "";
        }
      });
    }

    if (tab === "system") {
      let quotaStr = "Indisponível";
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          const usedMB = ((est.usage || 0) / 1048576).toFixed(2);
          const quotaMB = ((est.quota || 0) / 1048576).toFixed(0);
          quotaStr = `${usedMB} MB usados de ${quotaMB} MB`;
        }
      } catch (_) {}

      body.innerHTML = `
        <div>
          <strong style="font-size:14px;">Sobre o InkOS</strong>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Ambiente WebAssembly 64-bit + VFS + InkDOS Hub</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;font-size:12.5px;display:grid;gap:6px;">
          <div><strong>Isolamento (SAB / JIT):</strong> ${window.crossOriginIsolated ? "Ativo (crossOriginIsolated = true)" : "Desativado"}</div>
          <div><strong>Sistema de Arquivos:</strong> ${vfs ? vfs.mode.toUpperCase() : "N/A"}</div>
          <div><strong>Cota do Navegador:</strong> ${quotaStr}</div>
          <div><strong>Plataforma:</strong> ${navigator.platform || "Web"}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button id="sys-clear-sw" type="button" class="top-pill" style="color:var(--danger);">Limpar Cache Offline (SW) e Recarregar</button>
        </div>
      `;

      body.querySelector("#sys-clear-sw").onclick = async () => {
        if ("caches" in window) {
          for (const k of await caches.keys()) await caches.delete(k);
        }
        if ("serviceWorker" in navigator) {
          for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
        }
        location.reload();
      };
    }
  };

  navBtns.forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.tab;
      renderTab();
    };
  });

  renderTab();
}
