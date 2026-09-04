import test from 'node:test';
import assert from 'node:assert/strict';
import { createRippleContours, drawRipples, rippleDistance, stampContour } from './ripple.js';

test('a single source distance is Euclidean', () => {
  assert.equal(rippleDistance(3, 4, [{ x: 0, y: 0 }], 10), 5);
});

test('smooth minimum is finite and no greater than the nearest source', () => {
  const distance = rippleDistance(20, 10, [{ x: 0, y: 0 }, { x: 30, y: 10 }], 8);
  assert.ok(Number.isFinite(distance));
  assert.ok(distance <= 10);
});

test('single source rings keep the configured spacing', () => {
  const contours = createRippleContours(100, 100, { startRadius: 8, spacing: 13, rings: 3 }, [{ centerX: 0.5, centerY: 0.5 }]);
  const radii = contours.map((contour) => Math.hypot(contour[0].x - 50, contour[0].y - 50));
  assert.deepEqual(radii.map((radius, index) => index ? radius - radii[index - 1] : radius), [8, 13, 13]);
});

test('multiple source contours have finite, continuous points', () => {
  const gridSize = 4;
  const contours = createRippleContours(120, 90, { startRadius: 10, spacing: 12, rings: 3, smoothness: 8, gridSize }, [
    { centerX: 0.3, centerY: 0.5 }, { centerX: 0.7, centerY: 0.5 },
  ]);
  assert.ok(contours.length > 0);
  assert.ok(contours.every((contour) => contour.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))));
  assert.ok(contours.every((contour) => contour.slice(1).every((point, index) => Math.hypot(point.x - contour[index].x, point.y - contour[index].y) <= gridSize * 3)));
});

test('open multi-source contours are joined instead of split into tiny fragments', () => {
  const contours = createRippleContours(512, 512, { startRadius: 216, spacing: 48, rings: 1, smoothness: 64, gridSize: 1 }, [
    { centerX: 0.35, centerY: 0.5 }, { centerX: 0.65, centerY: 0.5 },
  ]);
  assert.ok(contours.length > 0);
  assert.equal(contours.filter((contour) => contour.length === 2).length, 0);
});

function fakeContext() {
  return {
    canvas: {}, strokes: 0, stamps: 0,
    clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { this.strokes += 1; }, translate() {}, rotate() {},
    drawImage() { this.stamps += 1; },
  };
}

test('drawing strokes lines or stamps a brush', () => {
  const config = { width: 80, height: 80, startRadius: 10, spacing: 12, rings: 2, stampSpacing: 5 };
  const sources = [{ centerX: 0.5, centerY: 0.5 }];
  const strokeContext = fakeContext();
  drawRipples(strokeContext, config, sources);
  assert.ok(strokeContext.strokes > 0);
  const brushContext = fakeContext();
  drawRipples(brushContext, config, sources, {});
  assert.ok(brushContext.stamps > 0);
});

test('brush stamps keep their spacing across short contour segments', () => {
  const ctx = fakeContext();
  const positions = [];
  ctx.translate = (x, y) => positions.push([x, y]);
  stampContour(ctx, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 7, y: 0 }, { x: 11, y: 0 }, { x: 15, y: 0 }], {}, 2, 5);
  assert.deepEqual(positions, [[0, 0], [5, 0], [10, 0], [15, 0]]);
});
