import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, type RATE_LIMITS } from "./rate-limit";
import { getCsrfToken } from "./cookies";

type RateLimitConfig = (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS];

interface GuardOptions {
  /** Rate limit configuration for this endpoint */
  rateLimit?: { name: string; config: RateLimitConfig };
  /** Whether to validate CSRF token (required for all POST endpoints) */
  requireCsrf?: boolean;
  /** Maximum request body size in bytes (default: 1MB) */
  maxBodySize?: number;
  /** Validate Origin/Referer headers */
  validateOrigin?: boolean;
  /** Minimum response time in ms (for timing attack prevention) */
  minResponseTimeMs?: number;
}

interface GuardResult {
  /** null if all checks passed, or a NextResponse with the error */
  error: NextResponse | null;
  /** Parsed JSON body (if POST with body) */
  body?: unknown;
}

/**
 * Unified API route guard that enforces:
 * 1. Rate limiting (sliding window)
 * 2. CSRF double-submit cookie validation
 * 3. Request body size limits
 * 4. Origin/Referer header validation
 *
 * Per Security Review §7 and §8.
 */
export async function apiGuard(
  request: NextRequest,
  options: GuardOptions = {},
): Promise<GuardResult> {
  const {
    rateLimit,
    requireCsrf = false,
    maxBodySize = 1_048_576, // 1 MB
    validateOrigin = true,
  } = options;

  // 1. Rate limiting
  if (rateLimit) {
    const rateLimitResponse = applyRateLimit(request, rateLimit.name, rateLimit.config);
    if (rateLimitResponse) {
      return { error: rateLimitResponse };
    }
  }

  // 2. Origin/Referer validation for POST requests
  if (validateOrigin && request.method === "POST") {
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    const allowedOrigin = process.env.NEXTAUTH_URL || "http://localhost:3000";

    if (origin && !origin.startsWith(allowedOrigin)) {
      return {
        error: NextResponse.json(
          { error: "Invalid origin" },
          { status: 403 },
        ),
      };
    }

    if (!origin && referer && !referer.startsWith(allowedOrigin)) {
      return {
        error: NextResponse.json(
          { error: "Invalid referer" },
          { status: 403 },
        ),
      };
    }
  }

  // 3. Request body size check for POST requests
  if (request.method === "POST") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
      return {
        error: NextResponse.json(
          { error: "Request body too large" },
          { status: 413 },
        ),
      };
    }
  }

  // 4. CSRF double-submit cookie validation for state-changing requests
  if (requireCsrf && request.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return {
        error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }

    const csrfFromBody = body.csrf_token as string | undefined;
    const csrfFromCookie = getCsrfToken();

    if (!csrfFromBody || !csrfFromCookie || csrfFromBody !== csrfFromCookie) {
      return {
        error: NextResponse.json(
          { error: "CSRF validation failed" },
          { status: 403 },
        ),
        body,
      };
    }

    return { error: null, body };
  }

  // 5. Parse body for non-CSRF POST requests
  if (request.method === "POST") {
    try {
      const body = await request.json();
      return { error: null, body };
    } catch {
      return {
        error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  }

  return { error: null };
}

/**
 * Enforce a minimum response time to prevent timing attacks.
 * Per Security Review: all login responses take minimum 200ms regardless of outcome.
 */
export async function withMinResponseTime<T>(
  startTime: number,
  minMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }
  return result;
}
