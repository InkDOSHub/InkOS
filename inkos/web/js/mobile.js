// Ajustes de mobilidade e toque para iPhone e iPad no InkOS
export function initMobileSupport() {
  if (typeof document === "undefined") return;

  const isTouchDevice =
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

  document.documentElement.classList.toggle("is-touch", Boolean(isTouchDevice));

  // Evita zoom indesejado por duplo toque em controlos interativos no Safari mobile
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      if (e.target.closest("input, textarea, select, iframe")) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 280) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Fecha barras laterais ou launcher ao tocar fora numa área limpa do desktop
  document.addEventListener("pointerdown", (e) => {
    const wsRail = document.querySelector("#workspace-rail");
    if (wsRail?.classList.contains("open") && !e.target.closest("#workspace-rail, #ws-toggle")) {
      wsRail.classList.remove("open");
    }
    const modBar = document.querySelector("#modifier-bar");
    if (modBar?.classList.contains("open") && !e.target.closest("#modifier-bar, #keys-toggle")) {
      modBar.classList.remove("open");
    }
  });
}
