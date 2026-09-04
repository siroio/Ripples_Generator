import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRippleContours, drawRipples, findAlphaBounds, getRippleBounds, rippleDistance, stampContour,
} from './ripple.js';

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

test('sources can use different start radii, spacing, and ring counts', () => {
  const contours = createRippleContours(200, 200, { startRadius: 99, spacing: 99, rings: 9, smoothness: 6, gridSize: 1 }, [
    { centerX: 0.38, centerY: 0.5, startRadius: 28, spacing: 11, rings: 3 },
    { centerX: 0.62, centerY: 0.5, startRadius: 35, spacing: 19, rings: 2 },
  ]);
  const xBounds = contours.map((contour) => [
    Math.min(...contour.map(({ x }) => x)), Math.max(...contour.map(({ x }) => x)),
  ]);
  assert.equal(contours.length, 3);
  assert.ok(contours.every((contour) => contour.length > 100));
  assert.deepEqual(xBounds.map((bounds) => bounds.map(Math.round)), [[48, 159], [37, 178], [26, 126]]);
});

test('matching source settings override conflicting config in the shared fast path', () => {
  const sourceSettings = { startRadius: 18, spacing: 9, rings: 2 };
  const centers = [{ centerX: 0.35, centerY: 0.5 }, { centerX: 0.65, centerY: 0.5 }];
  const shared = createRippleContours(200, 160, { startRadius: 99, spacing: 99, rings: 9, smoothness: 8, gridSize: 2 },
    centers.map((center) => ({ ...center, ...sourceSettings })));
  const legacy = createRippleContours(200, 160, { ...sourceSettings, smoothness: 8, gridSize: 2 }, centers);
  assert.deepEqual(shared, legacy);
});

test('missing and invalid source settings fall back to the config', () => {
  const config = { startRadius: 12, spacing: 13, rings: 3, smoothness: 8, gridSize: 2 };
  const explicit = [
    { centerX: 0.25, centerY: 0.5, ...config },
    { centerX: 0.5, centerY: 0.5, ...config },
    { centerX: 0.75, centerY: 0.5, startRadius: 18, spacing: 9, rings: 2 },
  ];
  const fallback = [
    { centerX: 0.25, centerY: 0.5, startRadius: -1, spacing: 0, rings: 0 },
    { centerX: 0.5, centerY: 0.5 },
    { centerX: 0.75, centerY: 0.5, startRadius: 18, spacing: 9, rings: 2 },
  ];
  assert.deepEqual(createRippleContours(160, 120, config, fallback), createRippleContours(160, 120, config, explicit));
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

test('single-source bounds include the outer ring and stroke', () => {
  assert.deepEqual(getRippleBounds(100, 80, { startRadius: 8, spacing: 13, rings: 3, lineWidth: 6 }, [
    { centerX: 0.5, centerY: 0.5 },
  ]), { minX: 11, minY: 1, maxX: 89, maxY: 79, width: 78, height: 78 });
});

test('multi-source bounds include smooth expansion and rotated brush extent', () => {
  const bounds = getRippleBounds(200, 100, { startRadius: 10, spacing: 20, rings: 2, smoothness: 6, brushSize: 14 }, [
    { centerX: 0.25, centerY: 0.5 }, { centerX: 0.75, centerY: 0.5 },
  ], true);
  const expansion = 6 * Math.log(2) + 14 * Math.SQRT2 / 2 + 2;
  assert.equal(bounds.minX, 50 - (30 + expansion));
  assert.equal(bounds.maxX, 150 + (30 + expansion));
  assert.equal(bounds.minY, 50 - (30 + expansion));
  assert.equal(bounds.maxY, 50 + (30 + expansion));
});

test('invalid sources produce no scene bounds', () => {
  assert.equal(getRippleBounds(100, 100, {}, [{ centerX: NaN, centerY: 0.5 }]), null);
});

test('alpha bounds return the exact nontransparent rectangle', () => {
  const data = new Uint8ClampedArray(6 * 5 * 4);
  for (let y = 1; y <= 3; y += 1) for (let x = 2; x <= 4; x += 1) data[(y * 6 + x) * 4 + 3] = 255;
  assert.deepEqual(findAlphaBounds(data, 6, 5), { x: 2, y: 1, width: 3, height: 3 });
});

test('fully transparent or zero-sized images have no alpha bounds', () => {
  assert.equal(findAlphaBounds(new Uint8ClampedArray(16), 2, 2), null);
  assert.equal(findAlphaBounds([], 0, 2), null);
});
