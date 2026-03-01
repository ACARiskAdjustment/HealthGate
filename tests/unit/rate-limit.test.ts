import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp, getRateLimitInfo } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Reset time mocking between tests
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const config = { maxRequests: 5, windowMs: 60000 };
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(`test:allow:${Date.now()}:${Math.random()}`, config);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the limit", () => {
    const key = `test:block:${Date.now()}`;
    const config = { maxRequests: 3, windowMs: 60000 };

    // Use up all tokens
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, config).allowed).toBe(true);
    }

    // Next request should be blocked
    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("allows requests after window expires", () => {
    vi.useFakeTimers();
    const key = `test:window:${Math.random()}`;
    const config = { maxRequests: 2, windowMs: 1000 };

    // Use up tokens
    checkRateLimit(key, config);
    checkRateLimit(key, config);
    expect(checkRateLimit(key, config).allowed).toBe(false);

    // Advance past window
    vi.advanceTimersByTime(1100);
    expect(checkRateLimit(key, config).allowed).toBe(true);
  });

  it("returns retryAfterSec of at least 1", () => {
    const key = `test:retry:${Date.now()}`;
    const config = { maxRequests: 1, windowMs: 1000 };

    checkRateLimit(key, config);
    const result = checkRateLimit(key, config);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("getClientIp", () => {
  it("extracts first IP from X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    const request = { headers } as any;
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", () => {
    const headers = new Headers({ "x-real-ip": "10.0.0.1" });
    const request = { headers } as any;
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const headers = new Headers();
    const request = { headers } as any;
    expect(getClientIp(request)).toBe("unknown");
  });

  it("trims whitespace from X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
    const request = { headers } as any;
    expect(getClientIp(request)).toBe("1.2.3.4");
  });
});

describe("getRateLimitInfo", () => {
  it("returns full limit when no requests made", () => {
    const config = { maxRequests: 10, windowMs: 60000 };
    const info = getRateLimitInfo(`test:info:${Date.now()}`, config);
    expect(info.remaining).toBe(10);
    expect(info.resetAt).toBeInstanceOf(Date);
  });

  it("returns decreased remaining after requests", () => {
    const key = `test:info:remaining:${Date.now()}`;
    const config = { maxRequests: 5, windowMs: 60000 };

    checkRateLimit(key, config);
    checkRateLimit(key, config);

    const info = getRateLimitInfo(key, config);
    expect(info.remaining).toBe(3);
  });
});
