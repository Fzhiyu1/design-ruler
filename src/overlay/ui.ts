export interface OverlayHtmlOptions {
  targetUrl: string
  designImageBase64: string
  wsPort: number
  initialOpacity?: number
  initialScale?: number
  initialOffsetX?: number
  initialOffsetY?: number
}

export function generateOverlayHtml(options: OverlayHtmlOptions): string {
  const {
    targetUrl,
    designImageBase64,
    wsPort,
    initialOpacity = 50,
    initialScale = 100,
    initialOffsetX = 0,
    initialOffsetY = 0,
  } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>design-ruler overlay</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { overflow: hidden; background: #1a1a1a; font-family: system-ui, sans-serif; }

  #toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100000;
    background: rgba(0,0,0,0.85); color: #fff; padding: 8px 16px;
    display: flex; align-items: center; gap: 16px; font-size: 13px;
    backdrop-filter: blur(8px);
  }
  #toolbar label { display: flex; align-items: center; gap: 6px; }
  #toolbar input[type=range] { width: 120px; }
  #toolbar .value { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
  #confirm-btn {
    margin-left: auto; padding: 6px 20px; background: #22c55e; color: #fff;
    border: none; border-radius: 6px; font-size: 14px; font-weight: 600;
    cursor: pointer;
  }
  #confirm-btn:hover { background: #16a34a; }

  #viewport {
    position: fixed; top: 40px; left: 0; right: 0; bottom: 0;
  }
  #target-frame {
    width: 100%; height: 100%; border: none;
  }

  #overlay-img {
    position: fixed; top: 40px; left: 0;
    width: 100vw; height: auto;
    pointer-events: none; z-index: 99999;
    transform-origin: top left;
  }
  #overlay-img.draggable { pointer-events: auto; cursor: grab; }
  #overlay-img.dragging { cursor: grabbing; }

  #status {
    position: fixed; bottom: 12px; right: 12px; z-index: 100001;
    background: rgba(0,0,0,0.7); color: #aaa; padding: 4px 10px;
    border-radius: 4px; font-size: 12px;
  }
</style>
</head>
<body>

<div id="toolbar">
  <span style="font-weight:600">design-ruler</span>
  <label>
    opacity
    <input type="range" id="opacity-slider" min="0" max="100" value="${initialOpacity}">
    <span class="value" id="opacity-val">${initialOpacity}%</span>
  </label>
  <label>
    scale
    <input type="range" id="scale-slider" min="10" max="300" value="${initialScale}">
    <span class="value" id="scale-val">${initialScale}%</span>
  </label>
  <label>
    <input type="checkbox" id="lock-cb" checked> lock
  </label>
  <button id="reset-btn" style="padding:4px 12px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer">reset</button>
  <button id="confirm-btn">confirm</button>
</div>

<div id="viewport">
  <iframe id="target-frame" src="${targetUrl}"></iframe>
</div>

<img id="overlay-img" src="data:image/png;base64,${designImageBase64}">

<div id="status">connecting...</div>

<script>
(() => {
  const img = document.getElementById('overlay-img');
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityVal = document.getElementById('opacity-val');
  const scaleSlider = document.getElementById('scale-slider');
  const scaleVal = document.getElementById('scale-val');
  const lockCb = document.getElementById('lock-cb');
  const resetBtn = document.getElementById('reset-btn');
  const confirmBtn = document.getElementById('confirm-btn');
  const status = document.getElementById('status');

  let offsetX = ${initialOffsetX}, offsetY = ${initialOffsetY};
  let scale = ${initialScale} / 100;
  let opacity = ${initialOpacity} / 100;
  let isDragging = false, dragStartX = 0, dragStartY = 0, dragStartOX = 0, dragStartOY = 0;

  function updateTransform() {
    img.style.opacity = String(opacity);
    img.style.transform = \`translate(\${offsetX}px, \${offsetY}px) scale(\${scale})\`;
  }

  opacitySlider.addEventListener('input', () => {
    opacity = opacitySlider.value / 100;
    opacityVal.textContent = opacitySlider.value + '%';
    updateTransform();
  });

  scaleSlider.addEventListener('input', () => {
    scale = scaleSlider.value / 100;
    scaleVal.textContent = scaleSlider.value + '%';
    updateTransform();
  });

  lockCb.addEventListener('change', () => {
    img.classList.toggle('draggable', !lockCb.checked);
  });

  resetBtn.addEventListener('click', () => {
    offsetX = 0; offsetY = 0; scale = 1; opacity = 0.5;
    opacitySlider.value = '50'; opacityVal.textContent = '50%';
    scaleSlider.value = '100'; scaleVal.textContent = '100%';
    updateTransform();
  });

  // Drag
  img.addEventListener('mousedown', (e) => {
    if (lockCb.checked) return;
    isDragging = true;
    dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartOX = offsetX; dragStartOY = offsetY;
    img.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    offsetX = dragStartOX + (e.clientX - dragStartX);
    offsetY = dragStartOY + (e.clientY - dragStartY);
    updateTransform();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    img.classList.remove('dragging');
  });

  // Scroll zoom
  document.addEventListener('wheel', (e) => {
    if (lockCb.checked) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -2 : 2;
    const newVal = Math.max(10, Math.min(300, parseInt(scaleSlider.value) + delta));
    scaleSlider.value = String(newVal);
    scale = newVal / 100;
    scaleVal.textContent = newVal + '%';
    updateTransform();
  }, { passive: false });

  // WebSocket to CLI
  const ws = new WebSocket('ws://127.0.0.1:${wsPort}');
  ws.onopen = () => { status.textContent = 'connected'; };
  ws.onclose = () => { status.textContent = 'disconnected'; };

  confirmBtn.addEventListener('click', () => {
    const params = { offsetX, offsetY, scale, opacity, scrollY: 0 };
    // Try to get iframe scroll position
    try {
      const frame = document.getElementById('target-frame');
      params.scrollY = frame.contentWindow.scrollY || 0;
    } catch(e) {}
    ws.send(JSON.stringify({ type: 'confirm', params }));
    status.textContent = 'saved!';
    confirmBtn.textContent = 'saved!';
    confirmBtn.style.background = '#666';
  });

  updateTransform();
})();
</script>
</body>
</html>`
}
