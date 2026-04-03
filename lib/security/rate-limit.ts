type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

type RateLimitConfig = {
  bucket: string;
  identifier: string;
  max: number;
  windowMs: number;
};

type BucketState = {
  count: number;
  resetAt: number;
};

declare global {
  var __uluRateLimitStore: Map<string, BucketState> | undefined;
}

const store = global.__uluRateLimitStore ?? new Map<string, BucketState>();

if (!global.__uluRateLimitStore) {
  global.__uluRateLimitStore = store;
}

export function checkRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const key = `${config.bucket}:${config.identifier}`;
  const current = store.get(key);

  if (!current || now >= current.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return { ok: true, remaining: config.max - 1, retryAfterMs: config.windowMs };
  }

  if (current.count >= config.max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    ok: true,
    remaining: Math.max(0, config.max - current.count),
    retryAfterMs: Math.max(0, current.resetAt - now),
  };
}
