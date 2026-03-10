const WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '600000', 10);
const MAX_REQUESTS = Number.parseInt(process.env.RATE_LIMIT_MAX || '60', 10);

const hitStore = new Map();

function getOriginHostname(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function keyFromRequest(req) {
  return getOriginHostname(req) || req.ip || 'unknown';
}

export function rateLimitByHostname(req, res, next) {
  const now = Date.now();
  const key = keyFromRequest(req);
  const record = hitStore.get(key) || { count: 0, start: now };

  if (now - record.start > WINDOW_MS) {
    record.count = 0;
    record.start = now;
  }

  record.count += 1;
  hitStore.set(key, record);

  if (record.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        details: { key, windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS }
      }
    });
  }

  return next();
}
