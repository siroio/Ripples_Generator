const TAU = Math.PI * 2;

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, finite(value, fallback)));
const pointKey = ({ x, y }) => `${x.toFixed(5)},${y.toFixed(5)}`;

export function rippleDistance(x, y, sources, smoothness) {
  if (!sources?.length) return Infinity;
  const distances = sources.map((source) => Math.hypot(x - source.x, y - source.y));
  if (distances.length === 1) return distances[0];
  const m = Math.min(...distances);
  const k = Math.max(0.01, finite(smoothness, 1));
  return m - k * Math.log(distances.reduce((sum, distance) => sum + Math.exp(-(distance - m) / k), 0));
}

function settings(width, height, config) {
  return {
    width: Math.max(1, Math.floor(finite(width, 1))),
    height: Math.max(1, Math.floor(finite(height, 1))),
    spacing: Math.max(1, finite(config.spacing, 20)),
    startRadius: Math.max(0, finite(config.startRadius, 0)),
    rings: Math.round(clamp(config.rings, 1, 64, 1)),
    smoothness: Math.max(0.01, finite(config.smoothness, 16)),
    gridSize: Math.round(clamp(config.gridSize, 1, 16, 4)),
  };
}

function normalizedSources(sources, options) {
  return (sources ?? []).filter((source) => Number.isFinite(source?.centerX) && Number.isFinite(source?.centerY))
    .map((source) => ({
      x: source.centerX * options.width,
      y: source.centerY * options.height,
      rings: Number.isFinite(source.rings) && source.rings >= 1
        ? Math.round(Math.min(64, source.rings)) : options.rings,
      spacing: Number.isFinite(source.spacing) && source.spacing >= 1 ? source.spacing : options.spacing,
      startRadius: Number.isFinite(source.startRadius) && source.startRadius >= 0
        ? source.startRadius : options.startRadius,
    }));
}

function circles(options, source) {
  return Array.from({ length: options.rings }, (_, ring) => {
    const radius = options.startRadius + ring * options.spacing;
    const count = Math.max(8, Math.ceil(TAU * radius / 2));
    return Array.from({ length: count + 1 }, (_, i) => {
      const angle = TAU * i / count;
      return { x: source.x + Math.cos(angle) * radius, y: source.y + Math.sin(angle) * radius };
    });
  });
}

function circle(source, ring) {
  return circles({ ...source, rings: 1, startRadius: source.startRadius + ring * source.spacing }, source)[0];
}

function interpolate(a, b, level) {
  const delta = b.value - a.value;
  const t = delta === 0 ? 0.5 : (level - a.value) / delta;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function joinSegments(segments) {
  const links = new Map();
  segments.forEach((segment, index) => segment.forEach((point) => {
    const key = pointKey(point);
    if (!links.has(key)) links.set(key, []);
    links.get(key).push(index);
  }));
  const used = new Set();
  const contours = [];
  for (let index = 0; index < segments.length; index += 1) {
    if (used.has(index)) continue;
    const contour = [...segments[index]];
    used.add(index);
    const extend = (front) => {
      let key = pointKey(front ? contour[0] : contour.at(-1));
      while (true) {
        const nextIndex = links.get(key)?.find((candidate) => !used.has(candidate));
        if (nextIndex === undefined) break;
        used.add(nextIndex);
        const line = segments[nextIndex];
        const next = pointKey(line[0]) === key ? line[1] : line[0];
        if (front) contour.unshift(next);
        else contour.push(next);
        key = pointKey(next);
      }
    };
    extend(false);
    extend(true);
    if (contour.length > 1 && contour.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) contours.push(contour);
  }
  return contours;
}

function contourLevels(grid, options) {
  const levels = Array.from({ length: options.rings }, (_, ring) => options.startRadius + ring * options.spacing);
  const segments = levels.map(() => []);
  for (let y = 0; y < grid.rows - 1; y += 1) for (let x = 0; x < grid.columns - 1; x += 1) {
    const corners = [grid.at(x, y), grid.at(x + 1, y), grid.at(x + 1, y + 1), grid.at(x, y + 1)];
    const values = corners.map((point) => point.value);
    const firstRing = Math.max(0, Math.floor((Math.min(...values) - options.startRadius) / options.spacing) + 1);
    const lastRing = Math.min(options.rings - 1, Math.floor((Math.max(...values) - options.startRadius) / options.spacing));
    for (let ring = firstRing; ring <= lastRing; ring += 1) {
      const level = levels[ring];
      const points = [];
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        if ((corners[a].value < level) !== (corners[b].value < level)) points.push(interpolate(corners[a], corners[b], level));
      }
      if (points.length === 2) segments[ring].push(points);
      if (points.length === 4) {
        const center = values.reduce((sum, value) => sum + value, 0) / 4;
        const pairs = (center < level) === (corners[0].value < level)
          ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
        pairs.forEach(([a, b]) => segments[ring].push([points[a], points[b]]));
      }
    }
  }
  return segments.flatMap(joinSegments);
}

function interpolateZero(ax, ay, av, bx, by, bv) {
  const t = -av / (bv - av);
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

function zeroContours(values, columns, rows, options) {
  const segments = [];
  for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
    const top = y * columns + x;
    const bottom = top + columns;
    const v0 = values[top], v1 = values[top + 1], v2 = values[bottom + 1], v3 = values[bottom];
    const mask = (v0 < 0) | ((v1 < 0) << 1) | ((v2 < 0) << 2) | ((v3 < 0) << 3);
    if (mask === 0 || mask === 15) continue;
    const x0 = x * options.gridSize, x1 = Math.min(options.width, x0 + options.gridSize);
    const y0 = y * options.gridSize, y1 = Math.min(options.height, y0 + options.gridSize);
    const points = [];
    if ((v0 < 0) !== (v1 < 0)) points.push(interpolateZero(x0, y0, v0, x1, y0, v1));
    if ((v1 < 0) !== (v2 < 0)) points.push(interpolateZero(x1, y0, v1, x1, y1, v2));
    if ((v2 < 0) !== (v3 < 0)) points.push(interpolateZero(x1, y1, v2, x0, y1, v3));
    if ((v3 < 0) !== (v0 < 0)) points.push(interpolateZero(x0, y1, v3, x0, y0, v0));
    if (points.length === 2) segments.push(points);
    if (points.length === 4) {
      const pairs = (((v0 + v1 + v2 + v3) / 4 < 0) === (v0 < 0))
        ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
      pairs.forEach(([a, b]) => segments.push([points[a], points[b]]));
    }
  }
  return joinSegments(segments);
}

export function createRippleContours(width, height, config = {}, sources = []) {
  const options = settings(width, height, config);
  const centers = normalizedSources(sources, options);
  if (!centers.length) return [];
  if (centers.length === 1) return circles(centers[0], centers[0]);
  const shared = centers.every((source) => source.rings === centers[0].rings
    && source.spacing === centers[0].spacing && source.startRadius === centers[0].startRadius);
  if (!shared) {
    const contours = [];
    const columns = Math.ceil(options.width / options.gridSize) + 1;
    const rows = Math.ceil(options.height / options.gridSize) + 1;
    const xs = Float64Array.from({ length: columns }, (_, x) => Math.min(options.width, x * options.gridSize));
    const ys = Float64Array.from({ length: rows }, (_, y) => Math.min(options.height, y * options.gridSize));
    const distances = centers.map((source) => {
      const result = new Float64Array(columns * rows);
      for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
        result[y * columns + x] = Math.hypot(xs[x] - source.x, ys[y] - source.y);
      }
      return result;
    });
    const values = new Float64Array(columns * rows);
    for (let ring = 0; ring < Math.max(...centers.map((source) => source.rings)); ring += 1) {
      const active = centers.map((source, index) => ring < source.rings ? {
        distances: distances[index], radius: source.startRadius + ring * source.spacing, source,
      } : null).filter(Boolean);
      if (active.length === 1) {
        contours.push(circle(active[0].source, ring));
        continue;
      }
      if (active.length === 2) {
        const [a, b] = active;
        for (let i = 0; i < values.length; i += 1) {
          const av = a.distances[i] - a.radius, bv = b.distances[i] - b.radius;
          values[i] = Math.min(av, bv) - options.smoothness
            * Math.log1p(Math.exp(-Math.abs(av - bv) / options.smoothness));
        }
      } else for (let i = 0; i < values.length; i += 1) {
        let m = Infinity;
        for (const source of active) m = Math.min(m, source.distances[i] - source.radius);
        let sum = 0;
        for (const source of active) sum += Math.exp(-(source.distances[i] - source.radius - m) / options.smoothness);
        values[i] = m - options.smoothness * Math.log(sum);
      }
      contours.push(...zeroContours(values, columns, rows, options));
    }
    return contours;
  }
  const sharedOptions = { ...options, ...centers[0] };
  const columns = Math.ceil(options.width / options.gridSize) + 1;
  const rows = Math.ceil(options.height / options.gridSize) + 1;
  const values = Array.from({ length: rows }, (_, y) => Array.from({ length: columns }, (_, x) => {
    const px = Math.min(options.width, x * options.gridSize);
    const py = Math.min(options.height, y * options.gridSize);
    return { x: px, y: py, value: rippleDistance(px, py, centers, options.smoothness) };
  }));
  const grid = { columns, rows, at: (x, y) => values[y][x] };
  return contourLevels(grid, sharedOptions);
}

export function stampContour(ctx, contour, brush, size, spacing) {
  let remaining = 0;
  for (let i = 1; i < contour.length; i += 1) {
    const from = contour[i - 1], to = contour[i];
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    const angle = Math.atan2(dy, dx);
    let distance = remaining;
    for (; distance <= length; distance += spacing) {
      const t = distance / length;
      ctx.save();
      ctx.translate(from.x + dx * t, from.y + dy * t);
      ctx.rotate(angle);
      ctx.drawImage(brush, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    remaining = distance - length;
  }
}

export function drawRipples(ctx, config = {}, sources = [], brush = null) {
  const options = settings(config.width, config.height, config);
  ctx.canvas.width = options.width;
  ctx.canvas.height = options.height;
  ctx.clearRect(0, 0, options.width, options.height);
  const contours = createRippleContours(options.width, options.height, config, sources);
  if (!contours.length) return;
  const opacity = clamp(config.opacity, 0, 1, 1);
  ctx.save();
  ctx.globalAlpha = opacity;
  if (brush) {
    const size = Math.max(0.01, finite(config.brushSize, 16));
    const spacing = Math.max(0.01, finite(config.stampSpacing, size / 2));
    contours.forEach((contour) => stampContour(ctx, contour, brush, size, spacing));
  } else {
    ctx.lineWidth = Math.max(0, finite(config.lineWidth, 1));
    ctx.strokeStyle = config.color ?? '#000';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    contours.forEach((contour) => {
      ctx.beginPath();
      ctx.moveTo(contour[0].x, contour[0].y);
      for (let i = 1; i < contour.length; i += 1) ctx.lineTo(contour[i].x, contour[i].y);
      ctx.stroke();
    });
  }
  ctx.restore();
}
