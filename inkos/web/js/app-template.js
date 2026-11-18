import { inkos } from "../../js/app-shell.js";
const root = document.querySelector("[data-app-root]");
const id = root?.dataset.appRoot ?? "app";
document.title = `${id} — InkOS`;
root.innerHTML = `<header><svg aria-hidden="true"><use href="../../icons.svg#i-desktop"></use></svg><h1></h1></header><p class="status"></p><p class="hint">App integration point ready. Original app assets are not bundled in this scaffold.</p>`;
root.querySelector("h1").textContent = id;
root.querySelector(".status").textContent = "Waiting for InkOS bridge…";
addEventListener("message", event => { if (event.data?.type === "inkos:connect" && event.ports[0]) { root.querySelector(".status").textContent = "InkOS OPFS / theme bridge connected."; } });
export { inkos };
