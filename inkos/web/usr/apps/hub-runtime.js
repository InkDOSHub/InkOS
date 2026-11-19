export async function mountHubApp(el, appSpec = {}, ctx = {}) {
  const url = appSpec.url || appSpec.href || "";
  if (!url) {
    el.innerHTML = `<div style="padding:16px;font-size:13px;">
      <strong>Aplicativo Hub sem URL definida.</strong>
    </div>`;
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = appSpec.title || appSpec.name || "InkDOS Hub App";
  iframe.style.cssText = "width:100%;height:100%;border:0;background:transparent;display:block;";
  iframe.setAttribute("allow", "cross-origin-isolated; clipboard-read; clipboard-write");

  el.innerHTML = "";
  el.appendChild(iframe);

  return {
    windowEl: el,
    iframe,
    ctx,
    destroy() {
      iframe.src = "about:blank";
      iframe.remove();
    },
  };
}
