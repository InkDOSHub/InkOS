export class Terminal {
  constructor({ worker, output, form, input }) {
    this.worker = worker; this.output = output; this.form = form; this.input = input;
    this.channel = new SharedArrayBuffer(64 * 1024);
    this.state = new Int32Array(this.channel, 0, 4);
    this.bytes = new Uint8Array(this.channel, 16);
    worker?.postMessage({ type: "tty-init", channel: this.channel });
    worker?.addEventListener("message", ({ data }) => { if (data.type === "tty-output") this.write(data.text); });
    form.addEventListener("submit", (event) => { event.preventDefault(); const line = input.value; input.value = ""; this.write(`\n$ ${line}\n`); worker?.postMessage({ type: "tty-input", line, channel: this.channel }); });
    this.write("TTY shared-memory channel initialized. Shell execution requires an attached WASI/Alpine worker.\n");
  }
  write(text) { this.output.textContent += text; this.output.scrollTop = this.output.scrollHeight; }
}
