export class Terminal {
  constructor({ worker, output, form, input }) {
    this.worker = worker;
    this.output = output;
    this.form = form;
    this.input = input;
    this.history = [];
    this.histIdx = -1;

    this.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = this.input.value.trim();
      this.input.value = "";
      if (!raw) return;
      this.history.push(raw);
      this.histIdx = this.history.length;
      this.print("\n$ " + raw);
      await this.exec(raw);
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && this.histIdx > 0) {
        this.histIdx--;
        this.input.value = this.history.at(this.histIdx) || "";
      } else if (e.key === "ArrowDown") {
        this.histIdx = Math.min(this.history.length, this.histIdx + 1);
        this.input.value = this.history.at(this.histIdx) || "";
      }
    });
  }

  print(text) {
    this.output.textContent += text;
    this.output.scrollTop = this.output.scrollHeight;
  }

  async exec(line) {
    const parts = line.split(/\s+/);
    const cmd = parts.at(0);
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case "help":
          this.print("\nComandos Alpine/InkOS: help, uname, free, ls, touch, echo, cat, rm, bench, clear");
          break;
        case "clear":
          this.output.textContent = "";
          break;
        case "uname":
          this.print("\nLinux inkos 6.12.0-alpine-wasm64 #1 SMP PREEMPT aarch64/wasm64 InkOS GNU/Linux");
          break;
        case "free": {
          const bytes = window.inkOS?.soc?.ram_bytes?.() || 536870912;
          const mib = Math.round(bytes / 1048576);
          this.print(`\n              total        used        free\nMem:          ${mib}Mi        32Mi       ${mib - 32}Mi\nSwap(OPFS):   2048Mi         0Mi      2048Mi`);
          break;
        }
        case "ls": {
          const dir = await navigator.storage.getDirectory();
          const items = [];
          for await (const [name, handle] of dir.entries()) {
            items.push(handle.kind === "directory" ? name + "/" : name);
          }
          this.print("\n" + (items.length ? items.join("  ") : "(vazio)"));
          break;
        }
        case "touch": {
          const target = args.at(0);
          if (!target) return this.print("\nUso: touch <arquivo>");
          const dir = await navigator.storage.getDirectory();
          await dir.getFileHandle(target, { create: true });
          this.print("\n[OPFS] Criado: " + target);
          break;
        }
        case "cat": {
          const target = args.at(0);
          if (!target) return this.print("\nUso: cat <arquivo>");
          const dir = await navigator.storage.getDirectory();
          const fh = await dir.getFileHandle(target);
          this.print("\n" + await (await fh.getFile()).text());
          break;
        }
        case "echo": {
          const redirIdx = args.indexOf(">");
          const fileName = redirIdx !== -1 ? args.at(redirIdx + 1) : null;
          if (fileName) {
            const content = args.slice(0, redirIdx).join(" ") + "\n";
            const dir = await navigator.storage.getDirectory();
            const fh = await dir.getFileHandle(fileName, { create: true });
            const w = await fh.createWritable();
            await w.write(content);
            await w.close();
            this.print("\n[OPFS] Gravado em " + fileName);
          } else {
            this.print("\n" + args.join(" "));
          }
          break;
        }
        case "rm": {
          const target = args.at(0);
          if (!target) return this.print("\nUso: rm <arquivo>");
          const dir = await navigator.storage.getDirectory();
          await dir.removeEntry(target);
          this.print("\n[OPFS] Removido: " + target);
          break;
        }
        case "bench": {
          this.print("\n[InkBench] Rodando benchmark JIT + OPFS + GPU...");
          const mod = await import("./bench.js");
          const fn = mod.runBenchmarks || mod.default;
          const res = await fn();
          this.print("\n" + JSON.stringify(res, null, 2));
          break;
        }
        default:
          this.print("\nash: " + cmd + ": not found (digite 'help')");
      }
    } catch (err) {
      this.print("\nErro: " + err.message);
    }
  }
}
