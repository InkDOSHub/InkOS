export class Terminal {
  constructor({ worker, output, form, input }) {
    this.worker = worker;
    this.output = output;
    this.form = form;
    this.input = input;
    this.history = [];
    this.histIdx = -1;
    this.cwd = "/";

    this.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const raw = this.input.value.trim();
      this.input.value = "";
      if (!raw) return;
      this.history.push(raw);
      this.histIdx = this.history.length;
      this.print(`\n$ ${raw}`);
      await this.exec(raw);
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && this.histIdx > 0) {
        this.histIdx--;
        this.input.value = this.history[this.histIdx];
      } else if (e.key === "ArrowDown") {
        this.histIdx = Math.min(this.history.length, this.histIdx + 1);
        this.input.value = this.history[this.histIdx] || "";
      }
    });
  }

  print(text) {
    this.output.textContent += text;
    this.output.scrollTop = this.output.scrollHeight;
  }

  async getOpfsDir() {
    return await navigator.storage.getDirectory();
  }

  async exec(line) {
    const [cmd, ...args] = line.split(/\s+/);

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
          const dir = await this.getOpfsDir();
          const items = [];
          for await (const [name, handle] of dir.entries()) {
            items.push(handle.kind === "directory" ? `${name}/` : name);
          }
          this.print(`\n${items.length ? items.join("  ") : "(vazio)"}`);
          break;
        }

        case "touch": {
          if (!args[0]) return this.print("\nUso: touch <arquivo>");
          const dir = await this.getOpfsDir();
          await dir.getFileHandle(args[0], { create: true });
          this.print(`\n[OPFS] Criado: ${args[0]}`);
          break;
        }

        case "cat": {
          if (!args[0]) return this.print("\nUso: cat <arquivo>");
          const dir = await this.getOpfsDir();
          const fh = await dir.getFileHandle(args[0]);
          const file = await fh.getFile();
          this.print(`\n${await file.text()}`);
          break;
        }

        case "echo": {
          const redirIdx = args.indexOf(">");
          if (redirIdx !== -1 && args[redirIdx + 1]) {
            const content = args.slice(0, redirIdx).join(" ") + "\n";
            const fileName = args[redirIdx + 1];
            const dir = await this.getOpfsDir();
            const fh = await dir.getFileHandle(fileName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(content);
            await writable.close();
            this.print(`\n[OPFS] Gravado em ${fileName}`);
          } else {
            this.print(`\n${args.join(" ")}`);
          }
          break;
        }

        case "rm": {
          if (!args[0]) return this.print("\nUso: rm <arquivo>");
          const dir = await this.getOpfsDir();
          await dir.removeEntry(args[0]);
          this.print(`\n[OPFS] Removido: ${args[0]}`);
          break;
        }

        case "bench": {
          this.print("\n[InkBench] Rodando benchmark JIT + OPFS + GPU...");
          const mod = await import("./bench.js");
          const fn = mod.runBenchmarks || mod.default;
          const res = await fn();
          this.print(`\n${JSON.stringify(res, null, 2)}`);
          break;
        }

        default:
          this.print(`\nash: ${cmd}: not found (digite 'help')`);
      }
    } catch (err) {
      this.print(`\nErro: ${err.message}`);
    }
  }
}
