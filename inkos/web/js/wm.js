// Gestor de Janelas acelerado por GPU (translate3d) e redimensionamento em 8 direções
const svgIcon = (id, size = 14) =>
  `<svg width="${size}" height="${size}" aria-hidden="true"><use href="./icons.svg#${id}"></use></svg>`;

import { setContextMenu } from "./contextmenu.js";

export class WindowManager {
  constructor(desktopEl, { onChange } = {}) {
    this.desktopEl = desktopEl;
    this.onChange = onChange || (() => {});
    this.windows = new Map();
    this.zCounter = 10;
    // Keep windows inside the desktop when it changes size (rotation, external
    // monitor, on-screen keyboard).
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => this.fitAll()).observe(desktopEl);
    }
  }

  fitAll() {
    const dw = this.desktopEl.clientWidth;
    const dh = this.desktopEl.clientHeight;
    if (!dw || !dh) return;
    for (const w of this.windows.values()) {
      if (!w.maximized) {
        w.width = Math.min(w.width, Math.max(320, dw));
        w.height = Math.min(w.height, Math.max(220, dh));
        w.x = Math.min(Math.max(0, w.x), Math.max(0, dw - w.width));
        w.y = Math.min(Math.max(0, w.y), Math.max(0, dh - w.height));
      }
      this._applyGeometry(w);
    }
  }

  _applyGeometry(w) {
    if (w.maximized) {
      w.el.style.left = "0px";
      w.el.style.top = "0px";
      w.el.style.width = `${this.desktopEl.clientWidth}px`;
      w.el.style.height = `${this.desktopEl.clientHeight}px`;
      w.el.style.transform = "translate3d(0px, 0px, 0)";
      w.el.style.borderRadius = "0px";
      return;
    }
    w.el.style.left = "0px";
    w.el.style.top = "0px";
    w.el.style.width = `${Math.max(320, w.width)}px`;
    w.el.style.height = `${Math.max(220, w.height)}px`;
    w.el.style.transform = `translate3d(${Math.round(w.x)}px, ${Math.round(w.y)}px, 0)`;
    w.el.style.borderRadius = "";
  }

  _emit() {
    this.onChange(this.snapshot());
  }

  snapshot() {
    const list = [];
    for (const w of this.windows.values()) {
      list.push({
        id: w.id,
        title: w.title,
        minimized: w.minimized,
        maximized: w.maximized,
        focused: w.focused,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
      });
    }
    return list;
  }

  createWindow({ id, title, width = 760, height = 500, x, y, onClose, renderContent }) {
    if (this.windows.has(id)) {
      const existing = this.windows.get(id);
      existing.minimized = false;
      existing.el.style.display = "flex";
      this.focus(id);
      return existing.bodyEl;
    }

    const dw = Math.max(360, this.desktopEl.clientWidth || window.innerWidth);
    const dh = Math.max(260, this.desktopEl.clientHeight || window.innerHeight - 84);
    const winW = Math.min(width, Math.max(320, dw - 24));
    const winH = Math.min(height, Math.max(220, dh - 24));
    const offset = (this.windows.size % 6) * 22;
    const initX = typeof x === "number" ? x : Math.max(12, Math.round((dw - winW) / 2 + offset));
    const initY = typeof y === "number" ? y : Math.max(12, Math.round((dh - winH) / 2 + offset));

    const el = document.createElement("section");
    el.className = "window";
    el.dataset.winId = id;
    el.innerHTML = `
      <div class="window-title">
        <div class="mac-lights">
          <button class="mac-light close" type="button" title="Fechar" aria-label="Fechar">${svgIcon("i-close", 10)}</button>
          <button class="mac-light min" type="button" title="Minimizar" aria-label="Minimizar">${svgIcon("i-min", 10)}</button>
          <button class="mac-light max" type="button" title="Maximizar" aria-label="Maximizar">${svgIcon("i-max", 10)}</button>
        </div>
        <div class="win-title-text"></div>
      </div>
      <div class="window-body"></div>
      <div class="resize-handle resize-n" data-dir="n"></div>
      <div class="resize-handle resize-s" data-dir="s"></div>
      <div class="resize-handle resize-e" data-dir="e"></div>
      <div class="resize-handle resize-w" data-dir="w"></div>
      <div class="resize-handle resize-ne" data-dir="ne"></div>
      <div class="resize-handle resize-nw" data-dir="nw"></div>
      <div class="resize-handle resize-se" data-dir="se"></div>
      <div class="resize-handle resize-sw" data-dir="sw"></div>
    `;

    const titleEl = el.querySelector(".win-title-text");
    const bodyEl = el.querySelector(".window-body");
    titleEl.textContent = title || id;

    const record = {
      id,
      title: title || id,
      x: initX,
      y: initY,
      width: winW,
      height: winH,
      minimized: false,
      maximized: false,
      focused: false,
      el,
      bodyEl,
      onClose: onClose || null,
      cleanup: null,
    };

    this.windows.set(id, record);
    this._applyGeometry(record);
    this.desktopEl.append(el);
    this.focus(id);

    // On iOS, a visible DOM change made while a touch starts (for example the
    // dock being rebuilt) makes WebKit treat the tap as a hover and drop the
    // click. So a tap only restyles here; the change notification (which
    // redraws the dock) runs after the tap has produced its click.
    el.addEventListener("pointerdown", (ev) => this.focus(id, { deferEmit: ev.pointerType !== "mouse" }), { passive: true });

    el.querySelector(".mac-light.close").onclick = (ev) => {
      ev.stopPropagation();
      this.close(id);
    };
    el.querySelector(".mac-light.min").onclick = (ev) => {
      ev.stopPropagation();
      this.minimize(id);
    };
    el.querySelector(".mac-light.max").onclick = (ev) => {
      ev.stopPropagation();
      this.toggleMaximize(id);
    };

    const titlebar = el.querySelector(".window-title");
    setContextMenu(titlebar, () => [
      { label: "Minimizar", action: () => this.minimize(id) },
      { label: record.maximized ? "Restaurar" : "Maximizar", action: () => this.toggleMaximize(id) },
      "-",
      { label: "Fechar", danger: true, action: () => this.close(id) },
    ]);
    titlebar.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("button") || record.maximized) return;
      ev.preventDefault();
      this.focus(id);
      const startX = ev.clientX;
      const startY = ev.clientY;
      const origX = record.x;
      const origY = record.y;
      titlebar.setPointerCapture(ev.pointerId);

      const onMove = (mEv) => {
        const maxX = Math.max(0, this.desktopEl.clientWidth - 120);
        const maxY = Math.max(0, this.desktopEl.clientHeight - 40);
        record.x = Math.min(maxX, Math.max(-record.width + 120, origX + (mEv.clientX - startX)));
        record.y = Math.min(maxY, Math.max(0, origY + (mEv.clientY - startY)));
        this._applyGeometry(record);
      };
      const onUp = () => {
        titlebar.removeEventListener("pointermove", onMove);
        titlebar.removeEventListener("pointerup", onUp);
        this._emit();
      };
      titlebar.addEventListener("pointermove", onMove);
      titlebar.addEventListener("pointerup", onUp);
    });

    el.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (ev) => {
        if (record.maximized) return;
        record.userSized = true;
        ev.preventDefault();
        ev.stopPropagation();
        this.focus(id);
        const dir = handle.dataset.dir;
        const startX = ev.clientX;
        const startY = ev.clientY;
        const orig = { x: record.x, y: record.y, width: record.width, height: record.height };
        handle.setPointerCapture(ev.pointerId);

        const onMove = (mEv) => {
          const dx = mEv.clientX - startX;
          const dy = mEv.clientY - startY;
          if (dir.includes("e")) record.width = Math.max(320, orig.width + dx);
          if (dir.includes("s")) record.height = Math.max(220, orig.height + dy);
          if (dir.includes("w")) {
            const nextW = Math.max(320, orig.width - dx);
            record.x = orig.x + (orig.width - nextW);
            record.width = nextW;
          }
          if (dir.includes("n")) {
            const nextH = Math.max(220, orig.height - dy);
            record.y = orig.y + (orig.height - nextH);
            record.height = nextH;
          }
          this._applyGeometry(record);
        };
        const onUp = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          this._emit();
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
      });
    });

    if (typeof renderContent === "function") {
      Promise.resolve(renderContent(bodyEl))
        .then((fn) => {
          if (typeof fn === "function") record.cleanup = fn;
        })
        .catch(console.error);
    }

    this._emit();
    return bodyEl;
  }

  // Size a window around its content (an iframe app that reports how big its own window is).
  // Up to 1.5x, never larger than the desktop, kept centred where it was. A window the user
  // resized or maximized keeps its size.
  fitContent(id, cw, ch) {
    const w = this.windows.get(id);
    if (!w || w.maximized || w.userSized || !(cw > 0) || !(ch > 0)) return;
    const dw = this.desktopEl.clientWidth;
    const dh = this.desktopEl.clientHeight;
    if (!dw || !dh) return;
    const bar = w.el.querySelector(".window-title")?.offsetHeight || 0;
    const k = Math.min(1.5, (dw - 16) / cw, (dh - 16 - bar) / ch);
    const width = Math.max(320, Math.round(cw * k));
    const height = Math.max(220, Math.round(ch * k + bar));
    if (Math.abs(width - w.width) + Math.abs(height - w.height) < 4) return;
    const cx = w.x + w.width / 2;
    const cy = w.y + w.height / 2;
    w.width = Math.min(width, dw);
    w.height = Math.min(height, dh);
    w.x = Math.min(Math.max(0, Math.round(cx - w.width / 2)), Math.max(0, dw - w.width));
    w.y = Math.min(Math.max(0, Math.round(cy - w.height / 2)), Math.max(0, dh - w.height));
    this._applyGeometry(w);
    this._emit();
  }

  setTitle(id, title) {
    const w = this.windows.get(id);
    if (!w || !title || w.title === title) return;
    w.title = title;
    const t = w.el.querySelector(".win-title-text");
    if (t) t.textContent = title;
    this._emit();
  }

  focus(id, { deferEmit = false } = {}) {
    const target = this.windows.get(id);
    if (!target) return;
    const visible = !target.minimized;
    if (deferEmit && target.focused && visible) return;
    target.minimized = false;
    target.el.style.display = "flex";
    this.zCounter += 1;
    target.el.style.zIndex = String(this.zCounter);
    for (const w of this.windows.values()) {
      w.focused = w.id === id;
      w.el.classList.toggle("focused", w.focused);
    }
    if (deferEmit) {
      clearTimeout(this._emitTimer);
      this._emitTimer = setTimeout(() => this._emit(), 450);
    } else {
      this._emit();
    }
  }

  minimize(id) {
    const target = this.windows.get(id);
    if (!target) return;
    target.minimized = true;
    target.focused = false;
    target.el.classList.remove("focused");
    target.el.style.display = "none";
    this._emit();
  }

  toggleMaximize(id) {
    const target = this.windows.get(id);
    if (!target) return;
    target.maximized = !target.maximized;
    this._applyGeometry(target);
    this.focus(id);
  }

  close(id) {
    const target = this.windows.get(id);
    if (!target) return;
    try {
      target.cleanup?.();
    } catch (_) {}
    target.el.remove();
    this.windows.delete(id);
    try {
      target.onClose?.();
    } catch (_) {}
    this._emit();
  }
}
