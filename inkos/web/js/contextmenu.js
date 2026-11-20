// Context menu (right click, two-finger tap, long press) for InkOS.
// Elements register a provider with setContextMenu(el, (ev) => items). On a
// contextmenu event the closest element with a provider builds the menu.
// items: [{ label, action, danger?, disabled? } | "-"]

const providers = new WeakMap();
let menuEl = null;
let openedAt = 0;
let suppressClickUntil = 0;
let lastPointerType = "mouse";

export function setContextMenu(el, provider) {
  providers.set(el, provider);
  el.dataset.ctx = "1";
}

export function closeContextMenu() {
  menuEl?.remove();
  menuEl = null;
}

export function isContextMenuOpen() {
  return Boolean(menuEl);
}

function findProvider(target) {
  for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
    const p = providers.get(el);
    if (p) return { el, p };
  }
  return null;
}

export function openContextMenu(x, y, items, doc = document) {
  closeContextMenu();
  const list = items.filter(Boolean);
  if (!list.length) return null;
  const menu = doc.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  for (const it of list) {
    if (it === "-") {
      const sep = doc.createElement("div");
      sep.className = "ctx-sep";
      menu.append(sep);
      continue;
    }
    const b = doc.createElement("button");
    b.type = "button";
    b.className = `ctx-item${it.danger ? " danger" : ""}`;
    b.setAttribute("role", "menuitem");
    b.textContent = it.label;
    b.disabled = Boolean(it.disabled);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      // The finger that opened the menu may lift on an item; ignore that.
      if (lastPointerType !== "mouse" && Date.now() - openedAt < 350) return;
      closeContextMenu();
      Promise.resolve().then(() => it.action?.()).catch((err) => console.error(err));
    });
    menu.append(b);
  }
  doc.body.append(menu);
  // Open slightly off the finger/cursor and keep it on screen.
  const vw = doc.documentElement.clientWidth;
  const vh = doc.documentElement.clientHeight;
  const r = menu.getBoundingClientRect();
  let left = x + 4;
  let top = y + 4;
  if (left + r.width > vw - 8) left = Math.max(8, x - r.width - 4);
  if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menuEl = menu;
  openedAt = Date.now();
  menu.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
  return menu;
}

export function installContextMenu(doc = document) {
  if (doc.documentElement.dataset.ctxReady) return;
  doc.documentElement.dataset.ctxReady = "1";

  doc.addEventListener("contextmenu", (e) => {
    if (e.target.closest?.(".ctx-menu")) {
      e.preventDefault();
      return;
    }
    // Text fields keep the system menu (copy, paste).
    if (e.target.closest?.("input, textarea, [contenteditable='true']")) return;
    const found = findProvider(e.target);
    if (!found) return;
    // Touch can deliver both the browser's own contextmenu and ours.
    if (menuEl && Date.now() - openedAt < 600) {
      e.preventDefault();
      return;
    }
    const items = (found.p(e) || []).filter(Boolean);
    if (!items.length) return;
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, items, doc);
    // A long press ends with a click on the pressed element; swallow it.
    // A mouse right click is not followed by a click, so only touch/pen.
    if (lastPointerType !== "mouse") suppressClickUntil = Date.now() + 700;
  });

  doc.addEventListener("click", (e) => {
    if (Date.now() < suppressClickUntil && !e.target.closest(".ctx-menu")) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickUntil = 0;
    }
  }, true);

  doc.addEventListener("pointerdown", (e) => {
    lastPointerType = e.pointerType || "mouse";
    if (menuEl && !e.target.closest(".ctx-menu")) closeContextMenu();
  }, true);
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeContextMenu();
  });
  doc.defaultView?.addEventListener("resize", closeContextMenu);
  doc.defaultView?.addEventListener("blur", closeContextMenu);
}
