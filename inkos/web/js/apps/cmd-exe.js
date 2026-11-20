// CMD & Instalador de EXE para o InkOS
export function mountCmdExe(root, { vfs, openApp }, initialCtx = {}) {
  let cwd = "C:\\InkOS";
  const installed = new Map(); // name -> { vfsDir, exePath, installedAt, size, isMZ, fileName }

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;background:#0c0e14;color:#e6edf3;font-family:'SF Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12.5px;">
      <div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12);background:#151922;align-items:center;">
        <button id="exe-pick" class="top-pill active" type="button">Selecionar .EXE / Pacote</button>
        <input id="exe-file" type="file" accept=".exe,.zip,.json,.txt" hidden>
        <span id="exe-status" style="font-size:11.5px;color:#9da7b3;">Pronto para instalar pacotes em C:\\InkOS\\Programs</span>
      </div>
      <div id="cmd-out" style="flex:1;overflow:auto;padding:12px;white-space:pre-wrap;line-height:1.45;">(c) InkDOSHub / InkOS. Digite 'help' ou carregue um arquivo .exe.</div>
      <form id="cmd-form" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.12);background:#151922;">
        <label for="cmd-in" id="cmd-prompt">C:\\InkOS&gt;</label>
        <input id="cmd-in" autocomplete="off" spellcheck="false" style="flex:1;border:0;background:transparent;color:inherit;font:inherit;outline:none;">
      </form>
    </div>
  `;

  const out = root.querySelector("#cmd-out");
  const form = root.querySelector("#cmd-form");
  const input = root.querySelector("#cmd-in");
  const promptEl = root.querySelector("#cmd-prompt");
  const fileEl = root.querySelector("#exe-file");
  const statusEl = root.querySelector("#exe-status");

  const log = (msg) => {
    out.textContent += `\n${msg}`;
    out.scrollTop = out.scrollHeight;
  };

  const toVfsPath = (winPath) => {
    const clean = winPath.replace(/^C:\\?/i, "").replace(/\\/g, "/");
    return clean ? (clean.startsWith("/") ? clean : `/${clean}`) : "/";
  };

  const installExeFromBytes = async (fileName, bytes) => {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const isMZ = u8.length >= 2 && u8[0] === 0x4d && u8[1] === 0x5a; // assinatura PE/MZ
    const baseName = fileName.replace(/\.(exe|zip|json)$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "_") || "app";
    const pkgDir = `/Programs/${baseName}`;
    const storedExe = `${pkgDir}/${fileName}`;

    await vfs.mkdir(pkgDir);
    await vfs.writeBytes(storedExe, u8, "application/x-msdownload");
    await vfs.writeText(
      `${pkgDir}/manifest.json`,
      JSON.stringify(
        {
          name: baseName,
          file: fileName,
          size: u8.byteLength,
          peSignatureMZ: isMZ,
          installedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    installed.set(baseName.toLowerCase(), {
      name: baseName,
      fileName,
      vfsDir: pkgDir,
      exePath: storedExe,
      size: u8.byteLength,
      isMZ,
      installedAt: new Date().toISOString(),
    });

    statusEl.textContent = `Instalado: ${baseName} (${u8.byteLength} B)`;
    log(`[SETUP] Instalando '${fileName}' em C:\\InkOS\\Programs\\${baseName}...`);
    log(`[SETUP] Assinatura PE/MZ: ${isMZ ? "SIM (executável Windows/PE)" : "NÃO (pacote/script/manifesto)"}`);
    log(`[SETUP] Concluído. Use 'run ${baseName}' ou abra no Finder (/Programs/${baseName}).`);
    if (isMZ) await runInWine(storedExe, fileName);
  };

  // Windows programs run in the InkSoC desktop (Wine) inside its own window.
  const runInWine = async (vfsPath, label) => {
    log(`[EXEC] Abrindo ${label} no InkSoC (Wine)…`);
    try {
      await vfs.serveToHubApp(vfsPath, "wine", (id, file) => openApp(id, undefined, { file }));
    } catch (e) {
      log(`[EXEC] Falha ao abrir no InkSoC: ${e?.message || e}`);
    }
  };

  const installFromVfsPath = async (vfsPath) => {
    const bytes = await vfs.readBytes(vfsPath);
    if (!bytes) {
      log(`Arquivo não encontrado no VFS: ${vfsPath}`);
      return;
    }
    const name = vfsPath.split("/").pop() || "programa.exe";
    await installExeFromBytes(name, bytes);
  };

  const runCmd = async (line) => {
    const raw = line.trim();
    if (!raw) return;
    log(`${promptEl.textContent} ${raw}`);
    const [cmd, ...args] = raw.split(/\s+/);
    const sub = cmd.toLowerCase();

    if (sub === "help") {
      log("Comandos CMD: help, cls, ver, dir, cd <pasta>, type <arq>, install <arq.exe>, run <nome>, apps, diag, freeze <senha>, wake <senha>");
    } else if (sub === "cls") {
      out.textContent = "";
    } else if (sub === "ver") {
      log("InkOS CMD Subsystem [Wasm + VFS + PE Inspector]");
    } else if (sub === "dir") {
      const items = await vfs.list(toVfsPath(cwd));
      log(`Diretório de ${cwd}\n`);
      for (const it of items) {
        log(`${it.type === "dir" ? "<DIR>" : String(it.size).padStart(8, " ")}  ${it.name}`);
      }
    } else if (sub === "cd") {
      if (!args[0]) return log(cwd);
      const nextWin = args[0].startsWith("C:") ? args[0] : `${cwd}\\${args[0]}`;
      cwd = nextWin;
      promptEl.textContent = `${cwd}>`;
    } else if (sub === "type") {
      if (!args[0]) return log("Uso: type <arquivo>");
      const p = toVfsPath(args[0].startsWith("C:") ? args[0] : `${cwd}\\${args[0]}`);
      const txt = await vfs.readText(p);
      log(txt ?? "Arquivo não encontrado ou binário.");
    } else if (sub === "install") {
      if (!args[0]) return log("Uso: install <caminho-no-vfs.exe>");
      const p = toVfsPath(args[0].startsWith("C:") ? args[0] : `${cwd}\\${args[0]}`);
      await installFromVfsPath(p);
    } else if (sub === "run") {
      const key = (args[0] || "").toLowerCase();
      const pkg = installed.get(key);
      if (!pkg) {
        log(`Programa '${args[0] || ""}' não encontrado. Instale com install <arquivo.exe> ou pelo botão.`);
        return;
      }
      log(`[EXEC] Iniciando ${pkg.name} (${pkg.size} bytes)...`);
      if (pkg.isMZ) {
        await runInWine(pkg.exePath, pkg.fileName);
      } else {
        log("[EXEC] Pacote/script registrado em C:\\InkOS\\Programs\\" + pkg.name);
      }
    } else if (sub === "apps") {
      if (!installed.size) log("Nenhum .exe instalado nesta sessão.");
      else installed.forEach((v) => log(`${v.name} (${v.fileName}, ${v.size} B) -> ${v.vfsDir}`));
    } else if (sub === "diag") {
      log(JSON.stringify(window.inkOS?.diag || { isolated: window.crossOriginIsolated }, null, 2));
    } else if (sub === "freeze") {
      if (!args[0]) return log("Uso: freeze <senha>");
      const sMod = await import("../session.js");
      const res = await sMod.freezeSessionToVfs(vfs, args.join(" "));
      log(`Sessão congelada em ${res.path} (${res.bytes} bytes).`);
    } else if (sub === "wake") {
      if (!args[0]) return log("Uso: wake <senha>");
      const sMod = await import("../session.js");
      const snap = await sMod.wakeSessionFromVfs(vfs, args.join(" "));
      log(`Sessão despertada (${snap.entries.length} entradas).`);
    } else {
      log(`'${cmd}' não é reconhecido como um comando interno ou programa executável.`);
    }
  };

  root.querySelector("#exe-pick").onclick = () => fileEl.click();
  fileEl.onchange = async () => {
    const f = fileEl.files?.[0];
    if (!f) return;
    await installExeFromBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    fileEl.value = "";
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const val = input.value;
    input.value = "";
    runCmd(val).catch((err) => log(`Erro: ${err.message}`));
  };

  if (initialCtx?.exePath) {
    installFromVfsPath(initialCtx.exePath).catch(console.error);
  }
}
