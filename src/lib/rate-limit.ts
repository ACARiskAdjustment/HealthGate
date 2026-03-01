import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory sliding window rate limiter.
 * Production: replace with Redis-backed counters (EVALSHA sliding window script).
 *
 * Per the Security Design Review §8.1, rate limits are enforced per-endpoint
 * with sliding windows and return HTTP 429 + Retry-After header on exceeded.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/** Per-endpoint rate limit configurations from Security Review §8.1 */
export const RATE_LIMITS = {
  /** POST /api/auth/login — 20 failed attempts per 5 min per IP */
  LOGIN: { maxRequests: 20, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/register — 5 per 5 min per IP */
  REGISTER: { maxRequests: 5, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/forgot-password — 10 per 5 min per IP */
  FORGOT_PASSWORD: { maxRequests: 10, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/refresh — 100 per min per IP */
  REFRESH: { maxRequests: 100, windowMs: 60 * 1000 } as RateLimitConfig,
  /** GET /api/auth/session — 200 per min per IP */
  SESSION: { maxRequests: 200, windowMs: 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/mfa — 30 per 5 min per IP */
  MFA: { maxRequests: 30, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
  /** GET /api/auth/csrf — 200 per min per IP */
  CSRF: { maxRequests: 200, windowMs: 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/reset-password — 10 per 5 min per IP */
  RESET_PASSWORD: { maxRequests: 10, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
  /** POST /api/auth/mfa-setup — 30 per 5 min per IP */
  MFA_SETUP: { maxRequests: 30, windowMs: 5 * 60 * 1000 } as RateLimitConfig,
} as const;

/** In-memory store. Key format: "{endpoint}:{identifier}" */
const store = new Map<string, RateLimitEntry>();

/** Cleanup interval — prune expired entries every 60 seconds */
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  store.forEach((entry, key) => {
    // Remove entries with no timestamps in the last 10 minutes
    const recent = entry.timestamps.filter((t: number) => now - t < 10 * 60 * 1000);
    if (recent.length === 0) {
      store.delete(key);
    } else {
      entry.timestamps = recent;
    }
  });
}

/**
 * Check and consume a rate limit token.
 * Returns { allowed: true } or { allowed: false, retryAfterSec }.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  cleanup();

  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Sliding window: keep only timestamps within the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    // Calculate when the oldest request in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Extract client IP from request.
 * Checks X-Forwarded-For (set by proxy/LB), then X-Real-IP, then falls back to "unknown".
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // Take the first IP (client IP before proxies)
    return xff.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Apply rate limiting to a request. Returns a 429 response if the limit is exceeded,
 * or null if the request is allowed.
 */
export function applyRateLimit(
  request: NextRequest,
  endpointName: string,
  config: RateLimitConfig,
): NextResponse | null {
  const ip = getClientIp(request);
  const key = `${endpointName}:${ip}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": result.retryAfterSec.toString(),
          "X-RateLimit-Limit": config.maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(
            Date.now() + result.retryAfterSec * 1000,
          ).toISOString(),
        },
      },
    );
  }

  return null;
}

/**
 * Rate limit by account (email) — for per-account lockout tracking.
 * Separate from IP-based limiting.
 */
export function checkAccountRateLimit(
  email: string,
  config: RateLimitConfig,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const key = `account:${email.toLowerCase()}`;
  return checkRateLimit(key, config);
}

/**
 * Get remaining rate limit info for response headers.
 */
export function getRateLimitInfo(
  key: string,
  config: RateLimitConfig,
): { remaining: number; resetAt: Date } {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const entry = store.get(key);

  if (!entry) {
    return { remaining: config.maxRequests, resetAt: new Date(now + config.windowMs) };
  }

  const active = entry.timestamps.filter((t) => t > windowStart);
  const remaining = Math.max(0, config.maxRequests - active.length);
  const resetAt = active.length > 0
    ? new Date(active[0] + config.windowMs)
    : new Date(now + config.windowMs);

  return { remaining, resetAt };
}
