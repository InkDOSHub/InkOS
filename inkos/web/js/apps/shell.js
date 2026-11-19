// Terminal interativo do InkOS conectado ao VFS, sessão (.inkos) e aos apps
export function mountShell(root, { vfs, openApp }) {
  let cwd = "/Home";
  const hist = [];
  let hIdx = -1;

  root.innerHTML = `
    <div class="terminal-output" id="sh-out" role="log" aria-live="polite">Digite 'help' para ver os comandos disponíveis.</div>
    <form id="terminal-form">
      <label for="sh-in" id="sh-prompt">/Home $</label>
      <input id="sh-in" autocomplete="off" autocapitalize="off" spellcheck="false">
    </form>
  `;

  const out = root.querySelector("#sh-out");
  const form = root.querySelector("#terminal-form");
  const input = root.querySelector("#sh-in");
  const promptEl = root.querySelector("#sh-prompt");

  const resolvePath = (p) => {
    if (!p) return cwd;
    if (p.startsWith("/")) return p;
    return `${cwd === "/" ? "" : cwd}/${p}`.replace(/\/+/g, "/");
  };

  const print = (txt) => {
    out.textContent += `\n${txt}`;
    out.scrollTop = out.scrollHeight;
  };

  const syncPrompt = () => {
    promptEl.textContent = `${cwd} $`;
  };

  const execCmd = async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    hist.push(trimmed);
    hIdx = hist.length;
    print(`${promptEl.textContent} ${trimmed}`);

    const [cmd, ...rest] = trimmed.split(/\s+/);
    switch (cmd.toLowerCase()) {
      case "help":
        print(
          [
            "Comandos: help, clear, pwd, ls [dir], cd <dir>, mkdir <dir>,",
            "cat <file>, write <file> <texto>, rm <path>, open <appId>,",
            "exe [arquivo.exe], iso, diag, freeze <senha>, wake <senha>",
          ].join("\n")
        );
        break;
      case "clear":
        out.textContent = "";
        break;
      case "pwd":
        print(cwd);
        break;
      case "ls": {
        const target = resolvePath(rest[0] || cwd);
        const items = await vfs.list(target);
        if (!items.length) print("(vazio)");
        else print(items.map((i) => `${i.type === "dir" ? "[DIR]" : "[FILE]"} ${i.name}`).join("\n"));
        break;
      }
      case "cd": {
        const target = resolvePath(rest[0] || "/Home");
        const parts = target.split("/").filter(Boolean);
        const stack = [];
        for (const s of parts) {
          if (s === "..") stack.pop();
          else if (s !== ".") stack.push(s);
        }
        cwd = "/" + stack.join("/");
        syncPrompt();
        break;
      }
      case "mkdir":
        if (!rest[0]) return print("Uso: mkdir <pasta>");
        await vfs.mkdir(resolvePath(rest[0]));
        print("Pasta criada.");
        break;
      case "cat": {
        if (!rest[0]) return print("Uso: cat <arquivo>");
        const txt = await vfs.readText(resolvePath(rest[0]));
        print(txt ?? "Arquivo não encontrado ou não textual.");
        break;
      }
      case "write": {
        if (!rest[0]) return print("Uso: write <arquivo> <texto>");
        const file = resolvePath(rest[0]);
        const content = rest.slice(1).join(" ");
        await vfs.writeText(file, content);
        print(`Salvo em ${file}`);
        break;
      }
      case "rm":
        if (!rest[0]) return print("Uso: rm <caminho>");
        await vfs.remove(resolvePath(rest[0]));
        print("Removido.");
        break;
      case "open":
        if (!rest[0]) return print("Uso: open <id>");
        await openApp(rest[0]);
        print(`Abrindo ${rest[0]}...`);
        break;
      case "exe":
        await openApp("cmdexe", undefined, { exePath: rest[0] ? resolvePath(rest[0]) : undefined });
        print("Abrindo CMD / Instalador .EXE...");
        break;
      case "iso":
        print(`crossOriginIsolated = ${window.crossOriginIsolated}`);
        break;
      case "diag": {
        const d = window.inkOS?.diag;
        if (!d) return print("Sem diagnóstico InkSoC disponível.");
        print(JSON.stringify(d, null, 2));
        break;
      }
      case "freeze": {
        if (!rest[0]) return print("Uso: freeze <senha>");
        const sMod = await import("../session.js");
        const res = await sMod.freezeSessionToVfs(vfs, rest.join(" "));
        print(`Sessão congelada em ${res.path} (${res.bytes} bytes).`);
        break;
      }
      case "wake": {
        if (!rest[0]) return print("Uso: wake <senha>");
        const sMod = await import("../session.js");
        const snap = await sMod.wakeSessionFromVfs(vfs, rest.join(" "));
        print(`Sessão despertada (${snap.entries.length} entradas).`);
        break;
      }
      default:
        print(`Comando desconhecido: ${cmd}. Digite 'help'.`);
    }
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const val = input.value;
    input.value = "";
    execCmd(val).catch((err) => print(`Erro: ${err.message}`));
  };

  input.onkeydown = (e) => {
    if (e.key === "ArrowUp" && hist.length > 0) {
      e.preventDefault();
      hIdx = Math.max(0, hIdx - 1);
      input.value = hist[hIdx] || "";
    } else if (e.key === "ArrowDown" && hist.length > 0) {
      e.preventDefault();
      hIdx = Math.min(hist.length, hIdx + 1);
      input.value = hist[hIdx] || "";
    }
  };

  syncPrompt();
}
