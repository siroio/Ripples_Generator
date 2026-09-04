import { drawRipples, getRippleBounds, findAlphaBounds } from './ripple.js?v=4';

const LOGICAL_SIZE = 1024;
const PREVIEW_LIMIT = 768;
const EXPORT_MARGIN = 4;
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_PIXELS = 32000000;
const textureTypes = new Set(['image/png', 'image/webp', 'image/jpeg']);
const units = {
  lineWidth: ' px', spacing: ' px', startRadius: ' px', smoothness: ' px',
  brushSize: ' px', stampSpacing: ' px', rings: ' 本', centerX: '%', centerY: '%',
};
const sourceLabels = { centerX: '中心 X', centerY: '中心 Y', rings: '本数', spacing: '間隔', startRadius: '開始半径' };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function start() {
  const input = (id) => document.querySelector(`#${id}`);
  const controls = input('controls');
  const canvas = input('preview');
  const canvasWrap = input('canvasWrap');
  const handles = input('sourceHandles');
  const status = input('status');
  const sourceTabs = input('sourceTabs');
  const sourcesElement = input('sources');
  const template = input('sourceTemplate');
  const scaleInput = input('scale');
  const download = input('download');
  const panelDrag = input('panelDrag');
  const togglePanel = input('togglePanel');
  if (![controls, canvas, canvasWrap, handles, status, sourceTabs, sourcesElement, template, scaleInput, download, panelDrag, togglePanel].every(Boolean)) {
    if (status) status.textContent = '必要な画面要素が見つかりません。';
    return;
  }
  if (!canvas.getContext('2d')) {
    status.textContent = '2D canvas を利用できません。';
    return;
  }

  const sources = [{ centerX: 50, centerY: 50, rings: 6, spacing: 48, startRadius: 24 }];
  let selectedSource = 0;
  let image = null;
  let imageUrl = null;
  let pendingUrl = null;
  let imageVersion = 0;
  let brushCanvas = null;
  let brushKey = '';
  let frame = 0;
  let loadVersion = 0;
  let lastPreview = null;
  let drag = null;
  let dragFrame = 0;
  const notify = (message) => { status.textContent = message; };

  function number(element, fallback = 0) {
    const value = Number(element?.value);
    if (!Number.isFinite(value)) return fallback;
    const min = element?.hasAttribute('min') ? Number(element.min) : -Infinity;
    const max = element?.hasAttribute('max') ? Number(element.max) : Infinity;
    const clamped = clamp(value, Number.isFinite(min) ? min : value, Number.isFinite(max) ? max : value);
    if (element && element.value !== String(clamped)) element.value = String(clamped);
    return clamped;
  }

  function showOutput(element) {
    if (element.type === 'color') {
      const output = element.closest('.color-control')?.querySelector('output');
      if (output) output.value = element.value.toUpperCase();
      return;
    }
    const output = element.closest('.range-line')?.querySelector('output') || document.querySelector(`[data-output-for="${element.id}"]`);
    if (!output) return;
    const value = number(element);
    output.value = element.id === 'opacity' ? `${Math.round(value * 100)}%` : `${value}${units[element.dataset.field || element.id] || ' px'}`;
  }

  function config() {
    return {
      width: LOGICAL_SIZE,
      height: LOGICAL_SIZE,
      lineWidth: number(input('lineWidth'), 1),
      color: input('color')?.value || '#17233c',
      opacity: number(input('opacity'), 1),
      smoothness: number(input('smoothness'), 1),
      brushSize: number(input('brushSize'), 1),
      stampSpacing: number(input('stampSpacing'), 1),
    };
  }

  const normalizedSources = () => sources.map(({ centerX, centerY, rings, spacing, startRadius }) => ({
    centerX: centerX / 100, centerY: centerY / 100, rings, spacing, startRadius,
  }));

  function sceneBounds(current = config()) {
    return getRippleBounds(LOGICAL_SIZE, LOGICAL_SIZE, current, normalizedSources(), Boolean(image));
  }

  function brushFor(current, scale) {
    if (!image) return null;
    const side = Math.max(1, Math.round(current.brushSize * scale));
    const key = `${imageVersion}:${current.color}:${side}`;
    if (brushCanvas && brushKey === key) return brushCanvas;
    const texture = document.createElement('canvas');
    texture.width = texture.height = side;
    const textureContext = texture.getContext('2d');
    if (!textureContext) return null;
    const ratio = Math.min(side / image.naturalWidth, side / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    textureContext.drawImage(image, (side - width) / 2, (side - height) / 2, width, height);
    textureContext.globalCompositeOperation = 'source-in';
    textureContext.fillStyle = current.color;
    textureContext.fillRect(0, 0, side, side);
    brushCanvas = texture;
    brushKey = key;
    return texture;
  }

  function dimensions(bounds, scale) {
    return { width: Math.max(1, Math.ceil(bounds.width * scale)), height: Math.max(1, Math.ceil(bounds.height * scale)) };
  }

  function renderToCanvas(target, scale, bounds, current = config()) {
    const context = target.getContext('2d');
    if (!context) throw new Error('2D canvas を利用できません。倍率を下げてください。');
    const size = dimensions(bounds, scale);
    const shiftedSources = sources.map((source) => ({
      centerX: ((source.centerX / 100 * LOGICAL_SIZE - bounds.minX) * scale) / size.width,
      centerY: ((source.centerY / 100 * LOGICAL_SIZE - bounds.minY) * scale) / size.height,
      rings: source.rings,
      spacing: source.spacing * scale,
      startRadius: source.startRadius * scale,
    }));
    drawRipples(context, {
      ...current,
      width: size.width, height: size.height,
      lineWidth: current.lineWidth * scale,
      smoothness: current.smoothness * scale,
      brushSize: current.brushSize * scale,
      stampSpacing: current.stampSpacing * scale,
      gridSize: target === canvas ? 2 : Math.max(1, scale),
    }, shiftedSources, brushFor(current, scale));
    return size;
  }

  function positionHandles() {
    if (!lastPreview) return;
    const { bounds, scale, width, height } = lastPreview;
    handles.querySelectorAll('[data-source-handle]').forEach((handle) => {
      const source = sources[Number(handle.dataset.sourceHandle)];
      if (!source) return;
      handle.style.left = `${((source.centerX / 100 * LOGICAL_SIZE - bounds.minX) * scale / width) * 100}%`;
      handle.style.top = `${((source.centerY / 100 * LOGICAL_SIZE - bounds.minY) * scale / height) * 100}%`;
      handle.classList.toggle('selected', Number(handle.dataset.sourceHandle) === selectedSource);
      handle.setAttribute('aria-pressed', String(Number(handle.dataset.sourceHandle) === selectedSource));
    });
  }

  function fitPreview(size) {
    const mobile = window.innerWidth <= 760;
    const aspect = size.width / size.height;
    const maxWidth = Math.min(768, Math.max(1, window.innerWidth - (mobile ? 28 : 40)));
    const maxHeight = Math.max(1, window.innerHeight - (mobile ? 250 : 112));
    canvasWrap.style.width = `${Math.min(maxWidth, maxHeight * aspect)}px`;
    canvasWrap.style.aspectRatio = `${size.width} / ${size.height}`;
  }

  function redraw() {
    frame = 0;
    const current = config();
    const bounds = sceneBounds(current);
    if (!bounds) return notify('描画できる波紋源がありません。');
    const scale = Math.min(1, PREVIEW_LIMIT / Math.max(bounds.width, bounds.height));
    const size = renderToCanvas(canvas, scale, bounds, current);
    lastPreview = { bounds, scale, ...size };
    fitPreview(size);
    const badge = document.querySelector('.size-badge');
    if (badge) badge.textContent = `${LOGICAL_SIZE} 論理 px`;
    positionHandles();
  }

  function requestRedraw() {
    if (!frame) frame = requestAnimationFrame(redraw);
  }

  function syncSourceEditor() {
    sourcesElement.querySelectorAll('[data-field]').forEach((field) => {
      const source = sources[Number(field.closest('[data-source]')?.dataset.source)];
      if (source) {
        field.value = source[field.dataset.field];
        showOutput(field);
      }
    });
  }

  function selectSource(index) {
    selectedSource = clamp(index, 0, sources.length - 1);
    renderSources();
    renderHandles();
    requestRedraw();
  }

  function selectSourceForDrag(index) {
    selectedSource = clamp(index, 0, sources.length - 1);
    renderSources();
    positionHandles();
    requestRedraw();
  }

  function renderSources() {
    sourceTabs.replaceChildren();
    sources.forEach((_, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.sourceTab = index;
      tab.className = 'source-tab';
      tab.textContent = String(index + 1).padStart(2, '0');
      tab.id = `source-tab-${index}`;
      tab.setAttribute('role', 'tab');
      tab.tabIndex = index === selectedSource ? 0 : -1;
      tab.setAttribute('aria-label', `波紋 ${index + 1} を編集`);
      tab.setAttribute('aria-selected', String(index === selectedSource));
      tab.setAttribute('aria-controls', 'source-panel');
      tab.classList.toggle('selected', index === selectedSource);
      tab.addEventListener('click', () => selectSource(index));
      tab.addEventListener('keydown', moveSourceTabWithKeys);
      sourceTabs.append(tab);
    });
    sourcesElement.replaceChildren();
    const fragment = template.content.cloneNode(true);
    const root = fragment.querySelector('[data-source]') || fragment.firstElementChild;
    root.dataset.source = selectedSource;
    root.id = 'source-panel';
    root.setAttribute('aria-labelledby', `source-tab-${selectedSource}`);
    const label = root.querySelector('[data-source-number]');
    if (label) label.textContent = String(selectedSource + 1).padStart(2, '0');
    root.querySelectorAll('[data-field]').forEach((field) => {
      field.value = sources[selectedSource][field.dataset.field];
      field.setAttribute('aria-label', `波紋 ${selectedSource + 1} の${sourceLabels[field.dataset.field]}`);
      showOutput(field);
    });
    const remove = root.querySelector('[data-action="remove"]');
    if (remove) {
      remove.disabled = sources.length === 1;
      remove.setAttribute('aria-label', `波紋 ${selectedSource + 1} を削除`);
    }
    sourcesElement.append(fragment);
  }

  function renderHandles() {
    handles.replaceChildren();
    sources.forEach((_, index) => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.dataset.sourceHandle = index;
      handle.className = 'source-handle';
      handle.textContent = String(index + 1);
      handle.setAttribute('aria-label', `波紋 ${index + 1} の中心。矢印キーで移動できます。`);
      handle.addEventListener('pointerdown', startSourceDrag);
      handle.addEventListener('click', () => selectSource(index));
      handle.addEventListener('keydown', moveSourceWithKeys);
      handles.append(handle);
    });
    positionHandles();
  }

  function addSource() {
    const positions = [[65, 50], [35, 50], [50, 65], [50, 35]];
    const position = positions[sources.length - 1];
    const previous = sources.at(-1);
    const settings = ({ rings, spacing, startRadius }) => ({ rings, spacing, startRadius });
    if (position) sources.push({ centerX: position[0], centerY: position[1], ...settings(previous) });
    else {
      const angle = (sources.length - 5) * Math.PI / 4 - Math.PI / 2;
      sources.push({ centerX: Math.round(50 + Math.cos(angle) * 18), centerY: Math.round(50 + Math.sin(angle) * 18), ...settings(previous) });
    }
    selectSource(sources.length - 1);
    notify('波紋を追加しました。');
  }

  function removeSource() {
    if (sources.length === 1) return;
    sources.splice(selectedSource, 1);
    selectedSource = Math.min(selectedSource, sources.length - 1);
    renderSources();
    renderHandles();
    requestRedraw();
    sourcesElement.querySelector('[data-field]')?.focus();
    notify('波紋を削除しました。');
  }

  function clearTexture(message = 'ブラシ画像を解除しました。') {
    loadVersion += 1;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    image = null;
    imageUrl = null;
    pendingUrl = null;
    brushCanvas = null;
    brushKey = '';
    const file = input('brushTexture');
    if (file) file.value = '';
    const clear = input('clearTexture');
    if (clear) clear.disabled = true;
    requestRedraw();
    notify(message);
  }

  function loadTexture(file) {
    if (!file) return;
    if (!textureTypes.has(file.type)) {
      loadVersion += 1;
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      pendingUrl = null;
      input('brushTexture').value = '';
      notify('画像ファイルを選択してください。');
      return;
    }
    const version = ++loadVersion;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const nextUrl = URL.createObjectURL(file);
    pendingUrl = nextUrl;
    const nextImage = new Image();
    let done = false;
    const fail = () => {
      if (done || version !== loadVersion) return;
      done = true;
      URL.revokeObjectURL(nextUrl);
      if (pendingUrl === nextUrl) pendingUrl = null;
      notify('ブラシ画像を読み込めませんでした。');
    };
    const complete = () => {
      if (done || version !== loadVersion || !nextImage.naturalWidth || !nextImage.naturalHeight) return fail();
      done = true;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      image = nextImage;
      imageUrl = nextUrl;
      pendingUrl = null;
      imageVersion += 1;
      brushCanvas = null;
      brushKey = '';
      input('clearTexture').disabled = false;
      requestRedraw();
      notify('ブラシ画像を読み込みました。');
    };
    nextImage.onload = complete;
    nextImage.onerror = fail;
    nextImage.src = nextUrl;
    if (nextImage.decode) nextImage.decode().then(complete).catch(() => {});
  }

  function pointToSource(event) {
    if (!lastPreview) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const { bounds, scale, width, height } = lastPreview;
    return {
      centerX: clamp((bounds.minX + ((event.clientX - rect.left) / rect.width) * width / scale) / LOGICAL_SIZE * 100, 0, 100),
      centerY: clamp((bounds.minY + ((event.clientY - rect.top) / rect.height) * height / scale) / LOGICAL_SIZE * 100, 0, 100),
    };
  }

  function applyDragPoint() {
    dragFrame = 0;
    if (!drag?.moved || !drag.point || !drag.startPoint) return;
    Object.assign(sources[drag.index], {
      centerX: clamp(drag.center.centerX + drag.point.centerX - drag.startPoint.centerX, 0, 100),
      centerY: clamp(drag.center.centerY + drag.point.centerY - drag.startPoint.centerY, 0, 100),
    });
    syncSourceEditor();
    positionHandles();
    requestRedraw();
  }

  function onSourceDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 3) return;
    drag.moved = true;
    drag.point = pointToSource(event);
    if (!dragFrame) dragFrame = requestAnimationFrame(applyDragPoint);
  }

  function endSourceDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    onSourceDrag(event);
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      applyDragPoint();
    }
    drag.handle.releasePointerCapture?.(event.pointerId);
    drag = null;
    window.removeEventListener('pointermove', onSourceDrag);
    window.removeEventListener('pointerup', endSourceDrag);
    window.removeEventListener('pointercancel', endSourceDrag);
  }

  function startSourceDrag(event) {
    if (event.button !== 0) return;
    const index = Number(event.currentTarget.dataset.sourceHandle);
    if (index !== selectedSource) selectSourceForDrag(index);
    drag = {
      index, pointerId: event.pointerId, handle: event.currentTarget,
      startX: event.clientX, startY: event.clientY, startPoint: pointToSource(event),
      center: { ...sources[index] }, moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onSourceDrag);
    window.addEventListener('pointerup', endSourceDrag);
    window.addEventListener('pointercancel', endSourceDrag);
  }

  function moveSourceWithKeys(event) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.sourceHandle);
    const step = event.shiftKey ? 5 : 1;
    sources[index].centerX = clamp(sources[index].centerX + direction[0] * step, 0, 100);
    sources[index].centerY = clamp(sources[index].centerY + direction[1] * step, 0, 100);
    if (index !== selectedSource) selectedSource = index;
    renderSources();
    positionHandles();
    requestRedraw();
  }

  function moveSourceTabWithKeys(event) {
    const current = Number(event.currentTarget.dataset.sourceTab);
    const target = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: sources.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const index = (target + sources.length) % sources.length;
    selectSource(index);
    sourceTabs.querySelector(`[data-source-tab="${index}"]`)?.focus();
  }

  function movePanel(event) {
    if (!drag || drag.kind !== 'panel' || event.pointerId !== drag.pointerId) return;
    const x = clamp(drag.x + event.clientX - drag.startX, drag.x - drag.rect.left + 8, drag.x + window.innerWidth - drag.rect.right - 8);
    const y = clamp(drag.y + event.clientY - drag.startY, drag.y - drag.rect.top + 8, drag.y + window.innerHeight - drag.rect.bottom - 8);
    controls.style.setProperty('--panel-x', `${x}px`);
    controls.style.setProperty('--panel-y', `${y}px`);
  }

  function clampPanel() {
    if (window.innerWidth <= 760) return;
    const rect = controls.getBoundingClientRect();
    const x = Number.parseFloat(controls.style.getPropertyValue('--panel-x')) || 0;
    const y = Number.parseFloat(controls.style.getPropertyValue('--panel-y')) || 0;
    controls.style.setProperty('--panel-x', `${clamp(x, x - rect.left + 8, x + window.innerWidth - rect.right - 8)}px`);
    controls.style.setProperty('--panel-y', `${clamp(y, y - rect.top + 8, y + window.innerHeight - rect.bottom - 8)}px`);
  }

  function endPanelDrag(event) {
    if (!drag || drag.kind !== 'panel' || event.pointerId !== drag.pointerId) return;
    panelDrag.releasePointerCapture?.(event.pointerId);
    drag = null;
    window.removeEventListener('pointermove', movePanel);
    window.removeEventListener('pointerup', endPanelDrag);
    window.removeEventListener('pointercancel', endPanelDrag);
  }

  function startPanelDrag(event) {
    if (window.innerWidth <= 760 || event.button !== 0 || event.target.closest('button, input, select, label, a')) return;
    const rect = controls.getBoundingClientRect();
    drag = {
      kind: 'panel', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, rect,
      x: Number.parseFloat(controls.style.getPropertyValue('--panel-x')) || 0,
      y: Number.parseFloat(controls.style.getPropertyValue('--panel-y')) || 0,
    };
    panelDrag.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', movePanel);
    window.addEventListener('pointerup', endPanelDrag);
    window.addEventListener('pointercancel', endPanelDrag);
  }

  function exportAllowed(size) {
    return size.width <= MAX_CANVAS_SIDE && size.height <= MAX_CANVAS_SIDE && size.width * size.height <= MAX_CANVAS_PIXELS;
  }

  const blobFrom = (canvasElement) => new Promise((resolve) => canvasElement.toBlob(resolve, 'image/png'));

  async function exportPng() {
    download.disabled = true;
    controls.classList.add('is-busy');
    notify('PNG を作成中です…');
    await new Promise(requestAnimationFrame);
    try {
      const current = config();
      const bounds = sceneBounds(current);
      if (!bounds) throw new Error('描画できる波紋源がありません。倍率を下げてください。');
      const multiplier = Number(scaleInput.value);
      if (![1, 2, 4].includes(multiplier)) throw new Error('倍率を選び直してください。倍率を下げてください。');
      const size = dimensions(bounds, multiplier);
      if (!exportAllowed(size)) throw new Error('出力サイズが大きすぎます。倍率を下げてください。');
      const exportCanvas = document.createElement('canvas');
      renderToCanvas(exportCanvas, multiplier, bounds, current);
      const exportContext = exportCanvas.getContext('2d');
      if (!exportContext) throw new Error('PNG の作成に失敗しました。倍率を下げてください。');
      let alpha;
      try {
        alpha = findAlphaBounds(exportContext.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
      } catch {
        throw new Error('画像を読み出せませんでした。倍率を下げてください。');
      }
      if (!alpha) throw new Error('描画結果が空です。倍率を下げてください。');
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = alpha.width + EXPORT_MARGIN * 2;
      finalCanvas.height = alpha.height + EXPORT_MARGIN * 2;
      const finalContext = finalCanvas.getContext('2d');
      if (!finalContext) throw new Error('PNG の作成に失敗しました。倍率を下げてください。');
      finalContext.drawImage(exportCanvas, alpha.x, alpha.y, alpha.width, alpha.height, EXPORT_MARGIN, EXPORT_MARGIN, alpha.width, alpha.height);
      const blob = await blobFrom(finalCanvas);
      if (!blob) throw new Error('PNG を作成できませんでした。倍率を下げてください。');
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `ripple-brush-${multiplier}x.png` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      notify('PNG を保存しました。');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PNG を作成できませんでした。倍率を下げてください。');
    } finally {
      controls.classList.remove('is-busy');
      download.disabled = false;
    }
  }

  controls.addEventListener('input', (event) => {
    const element = event.target.closest('input, select');
    if (!element) return;
    const source = element.closest('[data-source]');
    if (source && element.dataset.field) sources[Number(source.dataset.source)][element.dataset.field] = number(element);
    showOutput(element);
    requestRedraw();
  });
  controls.addEventListener('change', (event) => {
    if (event.target.id === 'brushTexture') loadTexture(event.target.files?.[0]);
  });
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addSource') addSource();
    if (button.id === 'clearTexture') clearTexture();
    if (button.dataset.action === 'remove') removeSource();
  });
  download.addEventListener('click', exportPng);
  panelDrag.addEventListener('pointerdown', startPanelDrag);
  togglePanel.addEventListener('click', () => {
    const collapsed = controls.classList.toggle('collapsed');
    togglePanel.setAttribute('aria-expanded', String(!collapsed));
    togglePanel.textContent = collapsed ? '＋' : '−';
    togglePanel.setAttribute('aria-label', collapsed ? '設定パネルを開く' : '設定パネルを折りたたむ');
    requestAnimationFrame(clampPanel);
  });
  window.addEventListener('resize', () => {
    if (lastPreview) fitPreview(lastPreview);
    positionHandles();
    clampPanel();
  });
  new ResizeObserver(positionHandles).observe(canvasWrap);

  controls.querySelectorAll('input, select').forEach(showOutput);
  renderSources();
  renderHandles();
  redraw();
  notify('波紋を1つ表示中です。');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
