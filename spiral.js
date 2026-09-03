const TAU = Math.PI * 2;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max, fallback) {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

export function spiralPoint(theta, options = {}) {
  const t = finite(theta, 0);
  const centerX = finite(options.centerX, 0);
  const centerY = finite(options.centerY, 0);
  const startRadius = finite(options.startRadius, 0);
  const spacing = finite(options.spacing, 1);
  const phase = finite(options.phase, 0);
  const rotation = finite(options.rotation, 0);
  const pathTheta = t + phase;
  const angle = pathTheta + rotation;
  const radius = startRadius + spacing * pathTheta / TAU;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
    radius,
  };
}

export function createSpiralPoints(width, height, options = {}) {
  const w = Math.max(1, finite(width, 1));
  const h = Math.max(1, finite(height, 1));
  const centerX = clamp(options.centerX, 0, 1, 0.5) * w;
  const centerY = clamp(options.centerY, 0, 1, 0.5) * h;
  const startRadius = Math.max(0, finite(options.startRadius, 0));
  const spacing = Math.max(1, finite(options.spacing, 20));
  const turns = clamp(options.turns, 0.25, 100, 1);
  const rotation = finite(options.rotation, 0) * Math.PI / 180;
  const phase = finite(options.phase, 0) * Math.PI / 180;
  const count = Math.max(2, Math.ceil(turns * 64) + 1);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push(spiralPoint(turns * TAU * i / (count - 1), {
      centerX, centerY, startRadius, spacing, rotation, phase,
    }));
  }
  return points;
}

export function drawSpirals(ctx, config = {}, spirals = []) {
  const width = Math.max(1, finite(config.width, 1));
  const height = Math.max(1, finite(config.height, 1));
  const lineWidth = Math.max(0, finite(config.lineWidth, 1));
  const opacity = clamp(config.opacity, 0, 1, 1);
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = config.color ?? '#000';
  ctx.globalAlpha = opacity;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const spiral of spirals) {
    const points = createSpiralPoints(width, height, spiral);
    if (points.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
}
