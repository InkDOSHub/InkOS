// Single decision point for the layout mode (docs/adr/ADR-modo-hub-desktop.md).
// "desktop": windows, dock (default).
// "hub": the Hub's app grid is the home screen; apps still open as windows.
export const MODES = ["desktop", "hub"];
const KEY = "inkos-mode";

export function currentMode(search = location.search) {
  const q = new URLSearchParams(search).get("mode");
  if (MODES.includes(q)) return q;
  try {
    const saved = localStorage.getItem(KEY);
    if (MODES.includes(saved)) return saved;
  } catch (_) {}
  return "desktop";
}

export function setMode(mode) {
  if (!MODES.includes(mode)) throw new Error(`modo desconhecido: ${mode}`);
  try { localStorage.setItem(KEY, mode); } catch (_) {}
  applyLayoutMode(mode);
}

export function applyLayoutMode(mode = currentMode(), { openLauncher } = {}) {
  document.documentElement.dataset.mode = mode;
  if (mode === "hub") openLauncher?.();
  return mode;
}
