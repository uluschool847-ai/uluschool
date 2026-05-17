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

type LoginRateLimitResult = {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds?: number;
};

declare global {
  var __uluRateLimitStore: Map<string, BucketState> | undefined;
}

const store = global.__uluRateLimitStore ?? new Map<string, BucketState>();

if (!global.__uluRateLimitStore) {
  global.__uluRateLimitStore = store;
}

const LOGIN_BUCKET = "login";
const DEFAULT_LOGIN_WINDOW_MS = 1000 * 60 * 10;
const DEFAULT_LOGIN_MAX_ATTEMPTS = 5;

function getLoginRateLimitConfig() {
  const parsedMax = Number(process.env.LOGIN_MAX_ATTEMPTS ?? DEFAULT_LOGIN_MAX_ATTEMPTS.toString());
  const parsedWindowMs = Number(
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? DEFAULT_LOGIN_WINDOW_MS.toString(),
  );

  return {
    maxAttempts: parsedMax > 0 ? parsedMax : DEFAULT_LOGIN_MAX_ATTEMPTS,
    windowMs: parsedWindowMs > 0 ? parsedWindowMs : DEFAULT_LOGIN_WINDOW_MS,
  };
}

function getLoginKey(identifier: string) {
  return `${LOGIN_BUCKET}:${identifier.trim().toLowerCase()}`;
}

function getLoginBucketState(identifier: string) {
  const config = getLoginRateLimitConfig();
  const now = Date.now();
  const key = getLoginKey(identifier);
  const current = store.get(key);

  if (!current || now >= current.resetAt) {
    store.delete(key);
    return { config, key, current: null as BucketState | null, now };
  }

  return { config, key, current, now };
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

export function checkLoginRateLimit(identifier: string): LoginRateLimitResult {
  const { config, current, now } = getLoginBucketState(identifier);

  if (!current) {
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts,
    };
  }

  const remainingAttempts = Math.max(0, config.maxAttempts - current.count);
  if (current.count >= config.maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(Math.max(0, current.resetAt - now) / 1000),
    };
  }

  return {
    allowed: true,
    remainingAttempts,
  };
}

export function recordFailedLogin(identifier: string): void {
  const { config, current, key, now } = getLoginBucketState(identifier);

  if (!current) {
    store.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return;
  }

  store.set(key, {
    count: current.count + 1,
    resetAt: current.resetAt,
  });
}

export function recordSuccessfulLogin(identifier: string): void {
  resetLoginRateLimit(identifier);
}

export function resetLoginRateLimit(identifier: string): void {
  store.delete(getLoginKey(identifier));
}
