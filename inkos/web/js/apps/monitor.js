// Monitor de Sistema (Monitor de Atividade) do InkOS
export function mountMonitor(root, { wm, vfs, closeApp }) {
  const fpsHistory = new Array(40).fill(60);
  let frames = 0;
  let lastTick = performance.now();
  let currentFps = 60;
  let rafId = null;
  let timerId = null;

  root.innerHTML = `
    <div style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;padding:12px;gap:12px;overflow:auto;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;">
          <div style="font-size:11px;color:var(--muted);">Renderização / UI</div>
          <div id="mon-fps" style="font-size:20px;font-weight:700;margin-top:2px;">60 FPS</div>
          <div id="mon-iso" style="font-size:11px;color:var(--ok);margin-top:2px;"></div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;">
          <div style="font-size:11px;color:var(--muted);">Memória Heap / Wasm</div>
          <div id="mon-mem" style="font-size:20px;font-weight:700;margin-top:2px;">-- MB</div>
          <div id="mon-wasm" style="font-size:11px;color:var(--muted);margin-top:2px;">SAB: --</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;">
          <div style="font-size:11px;color:var(--muted);">Armazenamento VFS</div>
          <div id="mon-disk" style="font-size:20px;font-weight:700;margin-top:2px;">-- MB</div>
          <div id="mon-vfs-mode" style="font-size:11px;color:var(--muted);margin-top:2px;"></div>
        </div>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:6px;">
          <span>Histórico de Quadros (FPS)</span>
          <span>Últimos 40s</span>
        </div>
        <canvas id="mon-chart" width="560" height="72" style="width:100%;height:72px;display:block;"></canvas>
      </div>

      <div style="flex:1;min-height:140px;background:var(--surface);border:1px solid var(--border);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;display:flex;justify-content:space-between;">
          <span>Processos e Janelas Ativas</span>
          <span id="mon-proc-count" style="color:var(--muted);">0 ativos</span>
        </div>
        <div id="mon-procs" style="flex:1;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:4px;"></div>
      </div>
    </div>
  `;

  const fpsEl = root.querySelector("#mon-fps");
  const isoEl = root.querySelector("#mon-iso");
  const memEl = root.querySelector("#mon-mem");
  const wasmEl = root.querySelector("#mon-wasm");
  const diskEl = root.querySelector("#mon-disk");
  const vfsModeEl = root.querySelector("#mon-vfs-mode");
  const procsEl = root.querySelector("#mon-procs");
  const countEl = root.querySelector("#mon-proc-count");
  const canvas = root.querySelector("#mon-chart");
  const ctx = canvas.getContext("2d");

  const countFrame = (now) => {
    frames++;
    if (now - lastTick >= 1000) {
      currentFps = Math.min(120, Math.round((frames * 1000) / (now - lastTick)));
      frames = 0;
      lastTick = now;
    }
    rafId = requestAnimationFrame(countFrame);
  };
  rafId = requestAnimationFrame(countFrame);

  const drawChart = () => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e5a373";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    fpsHistory.forEach((v, i) => {
      const x = (i / (fpsHistory.length - 1)) * w;
      const y = h - (Math.min(60, v) / 60) * (h - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  const refreshStats = async () => {
    fpsHistory.push(currentFps);
    fpsHistory.shift();
    fpsEl.textContent = `${currentFps} FPS`;
    isoEl.textContent = window.crossOriginIsolated ? "Cross-Origin Isolated" : "Single-Thread";
    drawChart();

    const perfMem = performance.memory;
    if (perfMem) {
      memEl.textContent = `${(perfMem.usedJSHeapSize / 1048576).toFixed(1)} MB`;
    } else {
      memEl.textContent = `${(navigator.deviceMemory || 4)} GB (Disp.)`;
    }

    const wasmBytes = window.inkOS?.memory?.buffer?.byteLength || 0;
    wasmEl.textContent = wasmBytes ? `Wasm SAB: ${(wasmBytes / 1048576).toFixed(0)} MiB` : "Kernel Wasm: Standby";

    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        diskEl.textContent = `${((est.usage || 0) / 1048576).toFixed(2)} MB`;
      } catch (_) {}
    }
    vfsModeEl.textContent = `Modo VFS: ${vfs ? vfs.mode.toUpperCase() : "N/A"}`;

    const wins = wm ? wm.snapshot() : [];
    countEl.textContent = `${wins.length} ${wins.length === 1 ? "processo" : "processos"}`;
    procsEl.innerHTML = "";

    if (!wins.length) {
      procsEl.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--muted);">Nenhuma janela aberta.</div>`;
      return;
    }

    for (const w of wins) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:8px;background:var(--panel-solid);border:1px solid var(--border);font-size:12px;";
      const kind = w.id.startsWith("hub-") ? "Hub Iframe" : "Nativo";
      row.innerHTML = `
        <div style="min-width:0;flex:1;">
          <strong>${w.title}</strong>
          <span style="color:var(--muted);margin-left:6px;">(${kind} • WS ${w.workspace}${w.minimized ? " • Minimizada" : ""})</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button data-act="focus" type="button" class="top-pill">Focar</button>
          <button data-act="kill" type="button" class="top-pill" style="color:var(--danger);">Encerrar</button>
        </div>
      `;
      row.querySelector('[data-act="focus"]').onclick = () => wm.focus(w.id);
      row.querySelector('[data-act="kill"]').onclick = () => {
        const rawId = w.id.replace(/^(hub|native)-/, "");
        if (closeApp) closeApp(rawId);
        else wm.close(w.id);
        refreshStats();
      };
      procsEl.append(row);
    }
  };

  refreshStats();
  timerId = setInterval(refreshStats, 1000);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearInterval(timerId);
  };
}
