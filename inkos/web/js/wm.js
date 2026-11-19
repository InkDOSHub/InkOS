// Window Manager do InkOS — estilo macOS (semáforos), arrastar, redimensionar, minimizar, maximizar e workspaces
export class WindowManager {
  constructor(desktopEl, { onChange } = {}) {
    this.desktop = desktopEl;
    this.onChange = onChange || (() => {});
    this.windows = new Map(); // id -> record
    this.zCounter = 20;
    this.activeId = null;
    this.workspace = 1;
  }

  setWorkspace(ws) {
    this.workspace = ws;
    for (const rec of this.windows.values()) {
      const visible = !rec.minimized && rec.workspace === this.workspace;
      rec.el.style.display = visible ? "flex" : "none";
    }
    this.onChange(this.snapshot());
  }

  snapshot() {
    return [...this.windows.values()].map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon || "i-window",
      minimized: r.minimized,
      maximized: r.maximized,
      workspace: r.workspace,
      focused: this.activeId === r.id && !r.minimized,
    }));
  }

  focus(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    if (rec.workspace !== this.workspace) {
      this.setWorkspace(rec.workspace);
    }
    if (rec.minimized) {
      rec.minimized = false;
      rec.el.style.display = "flex";
    }
    this.activeId = id;
    rec.el.style.zIndex = ++this.zCounter;
    for (const [k, v] of this.windows) {
      v.el.classList.toggle("focused", k === id);
    }
    this.onChange(this.snapshot());
  }

  minimize(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    rec.minimized = true;
    rec.el.style.display = "none";
    if (this.activeId === id) this.activeId = null;
    this.onChange(this.snapshot());
  }

  toggleMaximize(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    const dw = this.desktop.clientWidth;
    const dh = Math.max(200, this.desktop.clientHeight - 72);

    if (!rec.maximized) {
      rec.prev = { x: rec.x, y: rec.y, w: rec.w, h: rec.h };
      rec.maximized = true;
      rec.x = 0;
      rec.y = 0;
      rec.w = dw;
      rec.h = dh;
      rec.el.classList.add("maximized");
    } else {
      rec.maximized = false;
      rec.el.classList.remove("maximized");
      if (rec.prev) {
        Object.assign(rec, rec.prev);
      }
    }
    this._applyGeom(rec);
    this.focus(id);
  }

  close(id) {
    const rec = this.windows.get(id);
    if (!rec) return;
    try { rec.onClose?.(); } catch (_) {}
    rec.el.remove();
    this.windows.delete(id);
    if (this.activeId === id) this.activeId = null;
    this.onChange(this.snapshot());
  }

  _applyGeom(rec) {
    rec.el.style.width = `${Math.round(rec.w)}px`;
    rec.el.style.height = `${Math.round(rec.h)}px`;
    rec.el.style.transform = `translate3d(${Math.round(rec.x)}px, ${Math.round(rec.y)}px, 0)`;
  }

  createWindow({
    id,
    title = "Janela",
    icon = "i-window",
    width = 760,
    height = 520,
    x,
    y,
    bodyEl,
    onClose,
  }) {
    if (this.windows.has(id)) {
      this.focus(id);
      return this.windows.get(id).el;
    }

    const dw = this.desktop.clientWidth || window.innerWidth;
    const dh = Math.max(240, (this.desktop.clientHeight || window.innerHeight) - 72);
    const mobile = window.innerWidth < 700;

    const w = mobile ? dw : Math.min(width, Math.max(320, dw - 24));
    const h = mobile ? dh : Math.min(height, Math.max(220, dh - 24));
    const offset = (this.windows.size % 6) * 24;
    const posX = mobile ? 0 : (typeof x === "number" ? x : Math.min(24 + offset, Math.max(8, dw - w - 12)));
    const posY = mobile ? 0 : (typeof y === "number" ? y : Math.min(18 + offset, Math.max(8, dh - h - 12)));

    const el = document.createElement("section");
    el.className = "window";
    el.dataset.winId = id;

    const header = document.createElement("header");
    header.className = "window-title";
    header.dataset.dragHandle = "1";

    const controls = document.createElement("div");
    controls.className = "mac-lights";

    const btnClose = document.createElement("button");
    btnClose.className = "mac-light close";
    btnClose.type = "button";
    btnClose.title = "Fechar";
    btnClose.textContent = "×";
    btnClose.onclick = (e) => { e.stopPropagation(); this.close(id); };

    const btnMin = document.createElement("button");
    btnMin.className = "mac-light min";
    btnMin.type = "button";
    btnMin.title = "Minimizar";
    btnMin.textContent = "−";
    btnMin.onclick = (e) => { e.stopPropagation(); this.minimize(id); };

    const btnMax = document.createElement("button");
    btnMax.className = "mac-light max";
    btnMax.type = "button";
    btnMax.title = "Maximizar";
    btnMax.textContent = "+";
    btnMax.onclick = (e) => { e.stopPropagation(); this.toggleMaximize(id); };

    controls.append(btnClose, btnMin, btnMax);

    const titleSpan = document.createElement("span");
    titleSpan.className = "win-title-text";
    titleSpan.style.textAlign = "center";
    titleSpan.textContent = title;

    const spacer = document.createElement("div");
    spacer.style.width = "48px";

    header.append(controls, titleSpan, spacer);

    const body = document.createElement("div");
    body.className = "window-body";
    if (bodyEl) body.append(bodyEl);

    el.append(header, body);

    const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    for (const d of dirs) {
      const hEl = document.createElement("div");
      hEl.className = `resize-handle resize-${d}`;
      hEl.dataset.resizeDir = d;
      el.append(hEl);
    }

    const rec = {
      id,
      title,
      icon,
      el,
      body,
      x: posX,
      y: posY,
      w,
      h,
      minimized: false,
      maximized: false,
      workspace: this.workspace,
      onClose,
    };

    this.windows.set(id, rec);
    this._applyGeom(rec);
    this.desktop.append(el);
    this._bindInteractions(rec, header);
    this.focus(id);
    return el;
  }

  _bindInteractions(rec, header) {
    rec.el.addEventListener("pointerdown", () => this.focus(rec.id), { passive: true });

    header.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      this.toggleMaximize(rec.id);
    });

    let dragState = null;
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || rec.maximized || window.innerWidth < 700) return;
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: rec.x,
        origY: rec.y,
      };
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener("pointermove", (e) => {
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      const dw = this.desktop.clientWidth;
      const dh = Math.max(120, this.desktop.clientHeight - 40);
      rec.x = Math.min(Math.max(-rec.w + 100, dragState.origX + (e.clientX - dragState.startX)), dw - 80);
      rec.y = Math.min(Math.max(0, dragState.origY + (e.clientY - dragState.startY)), dh);
      this._applyGeom(rec);
    });

    const endDrag = (e) => {
      if (dragState && dragState.pointerId === e.pointerId) dragState = null;
    };
    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);

    let resizeState = null;
    rec.el.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        if (rec.maximized || window.innerWidth < 700) return;
        e.stopPropagation();
        resizeState = {
          dir: handle.dataset.resizeDir,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          origX: rec.x,
          origY: rec.y,
          origW: rec.w,
          origH: rec.h,
        };
        handle.setPointerCapture(e.pointerId);
      });

      handle.addEventListener("pointermove", (e) => {
        if (!resizeState || resizeState.pointerId !== e.pointerId) return;
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        const minW = 280;
        const minH = 180;
        const dw = this.desktop.clientWidth;
        const dh = Math.max(200, this.desktop.clientHeight - 64);

        let nx = resizeState.origX;
        let ny = resizeState.origY;
        let nw = resizeState.origW;
        let nh = resizeState.origH;

        if (resizeState.dir.includes("e")) {
          nw = Math.min(dw - nx, Math.max(minW, resizeState.origW + dx));
        }
        if (resizeState.dir.includes("s")) {
          nh = Math.min(dh - ny, Math.max(minH, resizeState.origH + dy));
        }
        if (resizeState.dir.includes("w")) {
          const maxDx = resizeState.origW - minW;
          const clampedDx = Math.min(maxDx, Math.max(-resizeState.origX, dx));
          nx = resizeState.origX + clampedDx;
          nw = resizeState.origW - clampedDx;
        }
        if (resizeState.dir.includes("n")) {
          const maxDy = resizeState.origH - minH;
          const clampedDy = Math.min(maxDy, Math.max(-resizeState.origY, dy));
          ny = resizeState.origY + clampedDy;
          nh = resizeState.origH - clampedDy;
        }

        rec.x = nx;
        rec.y = ny;
        rec.w = nw;
        rec.h = nh;
        this._applyGeom(rec);
      });

      const endResize = (e) => {
        if (resizeState && resizeState.pointerId === e.pointerId) resizeState = null;
      };
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
    });
  }
}
