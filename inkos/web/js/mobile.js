// Touch and iPad/iPhone support for InkOS.
// - Trackpad-style gestures (Pointer Events): tap = click (native), two-finger
//   scroll (native, touch-action pan inside windows), two-finger tap =
//   right click (contextmenu), long press = right click on touch.
// - Modifier bar: Esc, Tab, Ctrl, Opt, Cmd, arrows. Ctrl/Opt/Cmd are sticky
//   (one tap = next key only, double tap = lock). Keys go to the focused field.
// - visualViewport: --kb-inset follows the on-screen keyboard so the modifier
//   bar stays above it.

const MODS = { Control: "ctrlKey", Alt: "altKey", Meta: "metaKey" };

export function initMobileSupport({ doc = document, win = window } = {}) {
  const isTouch = "ontouchstart" in win || (win.navigator?.maxTouchPoints || 0) > 0;
  doc.documentElement.classList.toggle("is-touch", Boolean(isTouch));
  installModifierBar(doc);
  installGestures(doc, win);
  installViewport(doc, win);

  // Close rails when tapping elsewhere.
  doc.addEventListener("pointerdown", (e) => {
    const rail = doc.querySelector("#workspace-rail");
    if (rail?.classList.contains("open") && !e.target.closest("#workspace-rail, #ws-toggle")) rail.classList.remove("open");
  });
}

export function installModifierBar(doc = document) {
  const bar = doc.querySelector("#modifier-bar");
  if (!bar || bar.dataset.ready) return null;
  bar.dataset.ready = "1";
  const state = { Control: 0, Alt: 0, Meta: 0 }; // 0 off, 1 one-shot, 2 locked
  const lastTap = {};
  let lastField = null;

  doc.addEventListener("focusin", (e) => {
    if (e.target.matches?.("input, textarea, [contenteditable='true']")) lastField = e.target;
  });

  const paint = () => {
    for (const btn of bar.querySelectorAll("button[data-key]")) {
      const s = state[btn.dataset.key];
      btn.classList.toggle("mod-on", s === 1);
      btn.classList.toggle("mod-lock", s === 2);
      if (s !== undefined) btn.setAttribute("aria-pressed", s ? "true" : "false");
    }
  };

  // Keep focus in the text field while tapping bar buttons.
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn) return;
    const key = btn.dataset.key;
    if (key in state) {
      const now = Date.now();
      const dbl = now - (lastTap[key] || 0) < 350;
      lastTap[key] = now;
      state[key] = dbl ? 2 : state[key] ? 0 : 1;
      paint();
      return;
    }
    const target = doc.activeElement?.matches?.("input, textarea") ? doc.activeElement : lastField;
    if (!target) return;
    target.focus();
    const init = { key, bubbles: true, cancelable: true };
    for (const [m, prop] of Object.entries(MODS)) if (state[m]) init[prop] = true;
    const ev = new KeyboardEvent("keydown", init);
    const notCancelled = target.dispatchEvent(ev);
    if (notCancelled && key === "Tab" && "value" in target) {
      const { selectionStart: s, selectionEnd: en, value } = target;
      target.value = value.slice(0, s) + "\t" + value.slice(en);
      target.selectionStart = target.selectionEnd = s + 1;
    }
    for (const m of Object.keys(state)) if (state[m] === 1) state[m] = 0;
    paint();
  });

  // Physical keys also consume one-shot modifiers.
  doc.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return;
    let changed = false;
    for (const m of Object.keys(state)) if (state[m] === 1) { state[m] = 0; changed = true; }
    if (changed) paint();
  }, true);

  doc.querySelector("#keys-toggle")?.addEventListener("click", () => {
    const open = bar.classList.toggle("open");
    doc.documentElement.classList.toggle("mods-open", open);
  });
  paint();
  return state;
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

  // Block double-tap zoom on UI chrome, keep it in content.
  // Only a second tap on the same element counts; quick taps on different
  // buttons must still click.
  let lastEnd = 0;
  let lastTarget = null;
  doc.addEventListener("touchend", (e) => {
    if (e.target.closest("input, textarea, select, iframe, .window-body")) return;
    const now = Date.now();
    if (now - lastEnd <= 280 && e.target === lastTarget && !e.target.closest("#modifier-bar")) e.preventDefault();
    lastEnd = now;
    lastTarget = e.target;
  }, { passive: false });
}

export function installViewport(doc = document, win = window) {
  const vv = win.visualViewport;
  const root = doc.documentElement;
  const update = () => {
    const inset = vv ? Math.max(0, win.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    root.style.setProperty("--dpr", String(win.devicePixelRatio || 1));
    root.classList.toggle("kb-open", inset > 80);
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  update();
}
