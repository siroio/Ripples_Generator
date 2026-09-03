import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpiralPoints, drawSpirals, spiralPoint } from './spiral.js';

test('spiralPoint starts at the configured point', () => {
  const point = spiralPoint(0, { centerX: 10, centerY: 20, startRadius: 5, spacing: 12 });
  assert.equal(point.x, 15);
  assert.equal(point.y, 20);
  assert.equal(point.radius, 5);
});

test('one turn increases radius by spacing', () => {
  const start = spiralPoint(0, { startRadius: 3, spacing: 12 });
  const end = spiralPoint(Math.PI * 2, { startRadius: 3, spacing: 12 });
  assert.equal(end.radius - start.radius, 12);
});

test('rotation does not change radius at the same theta', () => {
  const base = spiralPoint(1, { startRadius: 3, spacing: 12, rotation: 0 });
  const rotated = spiralPoint(1, { startRadius: 3, spacing: 12, rotation: Math.PI });
  assert.equal(rotated.radius, base.radius);
});

test('phase advances the spiral path and radius', () => {
  const point = spiralPoint(0, { startRadius: 3, spacing: 12, phase: Math.PI });
  assert.equal(point.radius, 9);
});

test('createSpiralPoints returns finite canvas coordinates', () => {
  const points = createSpiralPoints(Infinity, 200, {
    centerX: 0.5, centerY: 0.5, startRadius: 4, spacing: 10, turns: 2,
  });
  assert.ok(points.length >= 48);
  assert.ok(points.every(({ x, y, radius }) => [x, y, radius].every(Number.isFinite)));
});

test('drawSpirals draws configured spirals', () => {
  const ctx = {
    canvas: {}, strokes: 0, lines: 0,
    clearRect() {}, beginPath() {}, moveTo() {},
    lineTo() { this.lines += 1; },
    stroke() { this.strokes += 1; },
  };
  drawSpirals(ctx, { width: 100, height: 80 }, [{ turns: 0.25, spacing: 5 }]);
  assert.equal(ctx.strokes, 1);
  assert.ok(ctx.lines > 0);
});
