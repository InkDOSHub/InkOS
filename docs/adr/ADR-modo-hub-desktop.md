# ADR: Hub / Desktop mode toggle (preparation only)

Status: accepted, preparation only (2026-11-20).

## Context

The InkDOS Hub currently lists an "InkOS" app (the `/InkOS/` prototype in the
Hub repository). The plan is a single product with two layouts: the Hub's home
screen of apps, and the InkOS desktop with windows. When the toggle ships, the
separate InkOS entry in the Hub will be replaced by it.

## Decision

- InkOS has one layout state, `mode: "desktop" | "hub"`, and one decision
  point, `inkos/web/js/mode.js` (`currentMode`, `setMode`, `applyLayoutMode`).
  The mode comes from `?mode=`, then `localStorage["inkos-mode"]`, then
  `"desktop"`. It is exposed as `<html data-mode>` for CSS.
- `hub` mode today only opens the app launcher on start and hides the
  workspace switcher. Apps still open as windows.
- The Hub keeps its InkOS app in this round. Nothing is removed from the Hub.
- Integration stays by reference: InkOS reads the Hub registry and embeds Hub
  pages; no Hub code is copied into InkOS and no InkOS code into the Hub.

## Next steps

1. Settings: a visible Hub / Desktop switch calling `setMode`.
2. Hub layout: full-screen grid with Hub categories from the registry.
3. When both layouts are validated on device, replace the Hub's InkOS entry
   with a link to InkOS in `hub` mode (Hub PR, operator decision).
