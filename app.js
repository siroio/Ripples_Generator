import { drawSpirals } from './spiral.js';

const initialSpirals = [
  { centerX: 50, centerY: 50, rotation: 0, phase: 0 },
  { centerX: 50, centerY: 50, rotation: 180, phase: 0 },
];

const units = {
  lineWidth: 'px', startRadius: 'px', spacing: 'px', turns: '回', opacity: '%',
  centerX: '%', centerY: '%', rotation: '°', phase: '°',
};

function start() {
  const controls = document.querySelector('#controls');
  const canvas = document.querySelector('#preview');
  const layers = document.querySelector('#layers');
  const template = document.querySelector('#spiralTemplate');
  const status = document.querySelector('#status');
  if (!controls || !canvas || !layers || !template || !status) return;

  const ctx = canvas.getContext('2d');
  const spirals = initialSpirals.map((spiral) => ({ ...spiral }));
  const notify = (message) => { status.textContent = message; };

  function number(input, fallback = 0) {
    const value = Number(input?.value);
    if (!Number.isFinite(value)) return fallback;
    const min = input.hasAttribute('min') ? Number(input.min) : -Infinity;
    const max = input.hasAttribute('max') ? Number(input.max) : Infinity;
    const clamped = Math.min(Number.isFinite(max) ? max : value, Math.max(Number.isFinite(min) ? min : value, value));
    if (input.value !== String(clamped)) input.value = clamped;
    return clamped;
  }

  function showOutput(input) {
    if (input.type === 'color') {
      const output = input.closest('.color-control')?.querySelector('output');
      if (output) output.value = input.value.toUpperCase();
      return;
    }
    const output = input.closest('.range-line')?.querySelector('output') || document.querySelector(`[data-output-for="${input.id}"]`);
    const value = number(input);
    if (output) output.value = input.id === 'opacity' ? `${Math.round(value * 100)}%` : `${value}${units[input.dataset.field || input.id] || ''}`;
  }

  function globals() {
    const value = (id, fallback) => number(document.querySelector(`#${id}`), fallback);
    return {
      width: value('size', 512), height: value('size', 512), color: document.querySelector('#color')?.value || '#000000',
      opacity: value('opacity', 1), lineWidth: value('lineWidth', 2), spacing: value('spacing', 24),
      turns: value('turns', 4), startRadius: value('startRadius', 8),
    };
  }

  function renderLayers() {
    layers.replaceChildren();
    spirals.forEach((spiral, index) => {
      const fragment = template.content.cloneNode(true);
      const layer = fragment.querySelector('[data-layer]') || fragment.firstElementChild;
      layer.dataset.layer = index;
      const numberLabel = layer.querySelector('[data-layer-number]');
      if (numberLabel) numberLabel.textContent = String(index + 1).padStart(2, '0');
      layer.querySelectorAll('[data-field]').forEach((input) => {
        input.value = spiral[input.dataset.field];
        showOutput(input);
      });
      const remove = layer.querySelector('[data-action="remove"]');
      if (remove) {
        remove.disabled = spirals.length === 1;
        remove.setAttribute('aria-label', `スパイラル ${index + 1} を削除`);
      }
      layers.append(fragment);
    });
  }

  function redraw() {
    const config = globals();
    const sizeBadge = document.querySelector('.size-badge');
    if (sizeBadge) sizeBadge.textContent = `${config.width} px`;
    drawSpirals(ctx, config, spirals.map((spiral) => ({
      ...spiral,
      centerX: spiral.centerX / 100,
      centerY: spiral.centerY / 100,
      spacing: config.spacing,
      turns: config.turns,
      startRadius: config.startRadius,
    })));
  }

  function addSpiral() {
    const count = spirals.length + 1;
    spirals.push({ centerX: 50, centerY: 50, rotation: (count - 1) * 360 / count, phase: 0 });
    renderLayers();
    redraw();
    notify('スパイラルを追加しました。');
  }

  controls.addEventListener('input', (event) => {
    const input = event.target.closest('input, select');
    if (!input) return;
    const layer = input.closest('[data-layer]');
    if (layer && input.dataset.field) spirals[Number(layer.dataset.layer)][input.dataset.field] = number(input);
    showOutput(input);
    redraw();
  });

  controls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addSpiral') return addSpiral();
    const layer = button.closest('[data-layer]');
    if (button.dataset.action === 'remove' && layer && spirals.length > 1) {
      const removedIndex = Number(layer.dataset.layer);
      spirals.splice(removedIndex, 1);
      renderLayers();
      redraw();
      (layers.querySelector(`[data-layer="${Math.min(removedIndex, spirals.length - 1)}"] [data-field]`) || document.querySelector('#addSpiral'))?.focus();
      notify('スパイラルを削除しました。');
    }
    if (button.id === 'download') {
      redraw();
      canvas.toBlob((blob) => {
        if (!blob) return notify('PNG を作成できませんでした。');
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: `spiral-stamp-${number(document.querySelector('#size'), 512)}.png` });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        notify('PNG を保存しました。');
      }, 'image/png');
    }
  });

  renderLayers();
  redraw();
  notify('スパイラルを2本表示中です。');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
