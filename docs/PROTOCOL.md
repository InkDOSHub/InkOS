# InkOS ⇄ app postMessage protocol, version 1

Used between the InkOS desktop and apps it embeds (InkDOS Hub apps in
cross-origin iframes). Reference implementation: `inkos/web/js/protocol.js`
(InkOS side), contract tests: `tests/unit/protocol.test.mjs`.

## Envelope

Every message is a plain object `{ v: 1, type: "<type>", ...payload }`.
Receivers drop anything that is not an object, has `v !== 1`, has an unknown
`type`, or fails the schema of its type. Unknown types are never forwarded.

## Origins

- Senders always pass an explicit target origin. `"*"` is never used.
- InkOS accepts messages only from the Hub origins it embeds:
  `https://hub.inkdos.workers.dev`, `https://inkdoshub.github.io`, and the
  origin of the configured registry URL.
- Apps should accept InkOS messages only from InkOS origins:
  `https://inkos-5k7.pages.dev`, its `*.inkos-5k7.pages.dev` previews, and the
  Hub's own origin (the `/InkOS/` prototype). Apps must also check
  `event.source === window.parent`.

## Messages

### `ink-tema` (InkOS → app)

```js
{ v: 1, type: "ink-tema", theme: "dark", flavor: "mocha", accent: "#e5a373" }
```

- `theme`: `"light"` or `"dark"` (required). Matches the Hub's `assets/tema.js`.
- `flavor`: `"latte"` or `"mocha"` (optional, Catppuccin flavor).
- `accent`: CSS hex color (optional).

Sent when the app frame loads, when it says `inkos-ready`, and on every theme
change. Cosmetic only: apps must not persist it.

### `inkos-vfs-file` (InkOS → app)

```js
{ v: 1, type: "inkos-vfs-file", name: "notes.txt", mime: "text/plain", data: ArrayBuffer }
```

- `name`: base name, 1–255 characters, no `/` or `\`.
- `mime`: string, up to 255 characters.
- `data`: an `ArrayBuffer`, sent as a transferable (zero copy).

Sent after the app frame loads, when the user opens a VFS file "in the Hub".
Hub pages that include `assets/tema.js` re-dispatch it as a DOM event:
`window.addEventListener("inkos:file", (e) => e.detail /* File */)`.

### `inkos-ready` (app → InkOS)

```js
{ v: 1, type: "inkos-ready", app: "foto" }
```

Optional. Lets InkOS resend the theme once the app's listeners are attached.

### `inkos-title` (app → InkOS)

```js
{ v: 1, type: "inkos-title", title: "winemine" }
```

Optional. InkOS puts `title` (1–128 characters) in the app window's title bar.
The InkSoC engine page sends the name of the program in front.

### `inkos-size` (app → InkOS)

```js
{ v: 1, type: "inkos-size", width: 420, height: 310 }
```

Optional. The size in CSS pixels of what the app wants to show (whole numbers, 1–4096).
InkOS sizes the window around it (up to 1.5×, never larger than the desktop, centred
where it was). A window the user has resized or maximized keeps its size. The InkSoC
engine page sends the box around the program's windows, so the InkOS window follows a
Windows program's window.

## Engine windows (InkSoC, InkShell)

`appload.registerFrameApp(id, { path, title, multi })` opens a Hub page as an InkOS
app (path relative to the Hub base, the registry's host):

| InkOS app | Page | Notes |
|---|---|---|
| `shell` (Terminal) | `InkShell/?inkos=1` | Alpine Linux on the InkSoC engine; starts at once, no page header |
| `cmdexe` (CMD/EXE) | `InkSoC/?inkos=1` | Command Prompt (cmd.exe); with a file, `&file=1` and a window per program |

A file for these apps is sent with `inkos-vfs-file` after the page says `inkos-ready`.
`?open=<app id>` on the InkOS address opens that app on start (the Hub's InkSoC link uses `?open=cmdexe`).

## Versioning

A breaking change bumps `v`. Receivers ignore versions they do not know.
