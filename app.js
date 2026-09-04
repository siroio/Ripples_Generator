import { drawRipples } from './ripple.js';

const units = {
  lineWidth: ' px', spacing: ' px', startRadius: ' px', smoothness: ' px',
  brushSize: ' px', stampSpacing: ' px', ringCount: ' 本', centerX: '%', centerY: '%',
};
const textureTypes = new Set(['image/png', 'image/webp', 'image/jpeg']);

function start() {
  const controls = document.querySelector('#controls');
  const canvas = document.querySelector('#preview');
  const status = document.querySelector('#status');
  const sourcesElement = document.querySelector('#sources');
  const template = document.querySelector('#sourceTemplate');
  if (!controls || !canvas || !status || !sourcesElement || !template) {
    if (status) status.textContent = '必要な画面要素が見つかりません。';
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    status.textContent = '2D canvas を利用できません。';
    return;
  }

  const sources = [{ centerX: 50, centerY: 50 }];
  let image = null;
  let imageUrl = null;
  let pendingUrl = null;
  let brushCanvas = null;
  let frame = 0;
  let loadVersion = 0;
  const notify = (message) => { status.textContent = message; };
  const input = (id) => document.querySelector(`#${id}`);

  function number(element, fallback = 0) {
    const value = Number(element?.value);
    if (!Number.isFinite(value)) return fallback;
    const min = element?.hasAttribute('min') ? Number(element.min) : -Infinity;
    const max = element?.hasAttribute('max') ? Number(element.max) : Infinity;
    const clamped = Math.min(Number.isFinite(max) ? max : value, Math.max(Number.isFinite(min) ? min : value, value));
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
    const size = number(input('size'), 512);
    return {
      width: size, height: size, lineWidth: number(input('lineWidth'), 1),
      color: input('color')?.value || '#000000', opacity: number(input('opacity'), 1),
      spacing: number(input('spacing'), 1), startRadius: number(input('startRadius'), 0),
      rings: number(input('ringCount'), 1), smoothness: number(input('smoothness'), 1),
      gridSize: Math.max(1, Math.min(4, size / 512)), brushSize: number(input('brushSize'), 1),
      stampSpacing: number(input('stampSpacing'), 1),
    };
  }

  function tintBrush(current) {
    if (!image) return (brushCanvas = null);
    const side = Math.max(1, Math.round(current.brushSize));
    const texture = document.createElement('canvas');
    texture.width = texture.height = side;
    const textureContext = texture.getContext('2d');
    if (!textureContext) return (brushCanvas = null);
    const scale = Math.min(side / image.naturalWidth, side / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    textureContext.drawImage(image, (side - width) / 2, (side - height) / 2, width, height);
    textureContext.globalCompositeOperation = 'source-in';
    textureContext.fillStyle = current.color;
    textureContext.fillRect(0, 0, side, side);
    brushCanvas = texture;
  }

  function redraw() {
    frame = 0;
    const current = config();
    canvas.width = current.width;
    canvas.height = current.height;
    const badge = document.querySelector('.size-badge');
    if (badge) badge.textContent = `${current.width} px`;
    if (image && (!brushCanvas || brushCanvas.width !== Math.round(current.brushSize))) tintBrush(current);
    drawRipples(ctx, current, sources.map(({ centerX, centerY }) => ({ centerX: centerX / 100, centerY: centerY / 100 })), brushCanvas);
  }

  function requestRedraw() {
    if (!frame) frame = requestAnimationFrame(redraw);
  }

  function renderSources() {
    sourcesElement.replaceChildren();
    sources.forEach((source, index) => {
      const fragment = template.content.cloneNode(true);
      const root = fragment.querySelector('[data-source]') || fragment.firstElementChild;
      root.dataset.source = index;
      const label = root.querySelector('[data-source-number]');
      if (label) label.textContent = String(index + 1).padStart(2, '0');
      root.querySelectorAll('[data-field]').forEach((field) => {
        field.value = source[field.dataset.field];
        field.setAttribute('aria-label', `波紋 ${index + 1} の中心 ${field.dataset.field === 'centerX' ? 'X' : 'Y'}`);
        showOutput(field);
      });
      const remove = root.querySelector('[data-action="remove"]');
      if (remove) {
        remove.disabled = sources.length === 1;
        remove.setAttribute('aria-label', `波紋 ${index + 1} を削除`);
      }
      sourcesElement.append(fragment);
    });
  }

  function addSource() {
    const positions = [[65, 50], [35, 50], [50, 65], [50, 35]];
    const position = positions[sources.length - 1];
    if (position) sources.push({ centerX: position[0], centerY: position[1] });
    else {
      const angle = (sources.length - 5) * Math.PI / 4 - Math.PI / 2;
      sources.push({ centerX: Math.round(50 + Math.cos(angle) * 18), centerY: Math.round(50 + Math.sin(angle) * 18) });
    }
    renderSources();
    requestRedraw();
    notify('波紋を追加しました。');
  }

  function clearTexture(message = 'ブラシ画像を解除しました。') {
    loadVersion += 1;
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    image = null;
    imageUrl = null;
    pendingUrl = null;
    brushCanvas = null;
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
      return notify('画像ファイルを選択してください。');
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
      tintBrush(config());
      const clear = input('clearTexture');
      if (clear) clear.disabled = false;
      requestRedraw();
      notify('ブラシ画像を読み込みました。');
    };
    nextImage.onload = complete;
    nextImage.onerror = fail;
    nextImage.src = nextUrl;
    if (nextImage.decode) nextImage.decode().then(complete).catch(() => {});
  }

  controls.addEventListener('input', (event) => {
    const element = event.target.closest('input, select');
    if (!element) return;
    const source = element.closest('[data-source]');
    if (source && element.dataset.field) sources[Number(source.dataset.source)][element.dataset.field] = number(element);
    showOutput(element);
    if (element.id === 'color' && image) tintBrush(config());
    requestRedraw();
  });
  controls.addEventListener('change', (event) => {
    if (event.target.id === 'brushTexture') loadTexture(event.target.files?.[0]);
  });
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addSource') return addSource();
    if (button.id === 'clearTexture') return clearTexture();
    const source = button.closest('[data-source]');
    if (button.dataset.action === 'remove' && source && sources.length > 1) {
      const index = Number(source.dataset.source);
      sources.splice(index, 1);
      renderSources();
      requestRedraw();
      (sourcesElement.querySelector(`[data-source="${Math.min(index, sources.length - 1)}"] [data-field]`) || input('addSource'))?.focus();
      notify('波紋を削除しました。');
    }
    if (button.id === 'download') {
      if (frame) cancelAnimationFrame(frame);
      redraw();
      canvas.toBlob((blob) => {
        if (!blob) return notify('PNG を作成できませんでした。');
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `ripple-brush-${config().width}.png` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        notify('PNG を保存しました。');
      }, 'image/png');
    }
  });

  controls.querySelectorAll('input, select').forEach(showOutput);
  renderSources();
  redraw();
  notify('波紋を1つ表示中です。');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
