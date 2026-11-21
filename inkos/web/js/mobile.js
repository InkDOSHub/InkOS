// Touch and iPad/iPhone support for InkOS.
// - Trackpad-style gestures (Pointer Events): tap = click (native), two-finger
//   scroll (native, touch-action pan inside windows), two-finger tap =
//   right click (contextmenu), long press = right click on touch.
// - visualViewport: --kb-inset follows the on-screen keyboard.

export function initMobileSupport({ doc = document, win = window } = {}) {
  const isTouch = "ontouchstart" in win || (win.navigator?.maxTouchPoints || 0) > 0;
  doc.documentElement.classList.toggle("is-touch", Boolean(isTouch));
  installGestures(doc, win);
  installViewport(doc, win);
  if (new URLSearchParams(win.location?.search || "").has("touchdebug")) installTouchDebug(doc, win);
}

export function installGestures(doc = document, win = window) {
  const active = new Map();
  let twoFinger = null;
  let longPress = null;

  const fireContext = (target, x, y) => {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  };

  doc.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target });
    clearTimeout(longPress);
    if (active.size === 1) {
      longPress = setTimeout(() => {
        const p = active.get(e.pointerId);
        if (p && active.size === 1) fireContext(p.target, p.x, p.y);
      }, 550);
    } else if (active.size === 2) {
      const pts = [...active.values()];
      twoFinger = { t: Date.now(), x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, target: pts[0].target, moved: false };
    }
  }, { passive: true });

  doc.addEventListener("pointermove", (e) => {
    const p = active.get(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
      clearTimeout(longPress);
      if (twoFinger) twoFinger.moved = true;
    }
  }, { passive: true });

  const end = (e) => {
    if (!active.has(e.pointerId)) return;
    active.delete(e.pointerId);
    clearTimeout(longPress);
    if (twoFinger && active.size === 0) {
      if (!twoFinger.moved && Date.now() - twoFinger.t < 300) fireContext(twoFinger.target, twoFinger.x, twoFinger.y);
      twoFinger = null;
    }
  };
  doc.addEventListener("pointerup", end, { passive: true });
  doc.addEventListener("pointercancel", end, { passive: true });

  // Double-tap zoom is turned off in CSS (touch-action: manipulation), which
  // also removes the click delay. No touchend preventDefault here: on iOS a
  // cancelled touchend also cancels the click.
}

export function installViewport(doc = document, win = window) {
  const vv = win.visualViewport;
  const root = doc.documentElement;
  const update = () => {
    const inset = vv ? Math.max(0, win.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    root.style.setProperty("--dpr", String(win.devicePixelRatio || 1));
    root.classList.toggle("kb-open", inset > 80);
    if (inset <= 80 && (win.scrollX || win.scrollY)) win.scrollTo(0, 0);
  };
  // iOS can leave the layout viewport scrolled (after the keyboard closes or a
  // rubber-band). Fixed elements then draw in one place but receive taps in
  // another. Keep the document at 0,0 unless the keyboard is open.
  const pin = () => {
    if (root.classList.contains("kb-open")) return;
    if (win.scrollX || win.scrollY) win.scrollTo(0, 0);
  };
  win.addEventListener("scroll", pin, { passive: true });
  doc.addEventListener("focusout", () => setTimeout(pin, 50));
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  update();
}

// ?touchdebug=1 shows what each tap hits, to diagnose devices we cannot emulate.
export function installTouchDebug(doc = document, win = window) {
  const box = doc.createElement("pre");
  box.id = "touch-debug";
  box.style.cssText = "position:fixed;left:4px;right:4px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:20000;margin:0;max-height:34vh;overflow:auto;padding:6px;font:10px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.82);color:#9f9;border-radius:8px;pointer-events:none;white-space:pre-wrap;";
  doc.body.append(box);
  const lines = [];
  const name = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const txt = (el.textContent || "").trim().slice(0, 14);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ""}`;
  };
  const log = (e) => {
    const t = Date.now() % 100000;
    const at = e.clientX !== undefined ? ` @${Math.round(e.clientX)},${Math.round(e.clientY)}` : "";
    const hit = e.clientX !== undefined ? doc.elementFromPoint(e.clientX, e.clientY) : null;
    const pt = e.pointerType ? ` ${e.pointerType}` : "";
    lines.push(`${t} ${e.type}${pt}${at} → ${name(e.target)}${hit && hit !== e.target ? ` | hit ${name(hit)}` : ""}${e.defaultPrevented ? " [prevented]" : ""}`);
    while (lines.length > 14) lines.shift();
    box.textContent = `scroll ${win.scrollX},${win.scrollY} vv ${Math.round(win.visualViewport?.offsetTop || 0)} ${Math.round(win.visualViewport?.height || 0)}/${win.innerHeight}\n` + lines.join("\n");
  };
  for (const type of ["pointerdown", "pointerup", "pointercancel", "touchend", "click", "contextmenu"]) {
    doc.addEventListener(type, (e) => setTimeout(() => log(e), 0), { capture: true, passive: true });
  }
  log({ type: "touchdebug on" });
}
