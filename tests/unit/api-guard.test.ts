import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env and cookies before importing
vi.mock("@/types/env", () => ({
  getServerEnv: () => ({
    COOKIE_ENCRYPTION_KEY: "a".repeat(64),
    KEYCLOAK_URL: "http://localhost:8080",
    KEYCLOAK_REALM: "test",
    KEYCLOAK_CLIENT_ID: "test",
    KEYCLOAK_CLIENT_SECRET: "test",
    NEXTAUTH_URL: "http://localhost:3000",
  }),
}));

vi.mock("@/lib/cookies", () => ({
  getCsrfToken: vi.fn(() => "csrf-cookie-token"),
}));

import { apiGuard, withMinResponseTime } from "@/lib/api-guard";
import { NextRequest } from "next/server";

function makeRequest(
  method: string,
  body?: object,
  headers?: Record<string, string>,
): NextRequest {
  const url = "http://localhost:3000/api/auth/login";
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
  };
  if (body && method === "POST") {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(url, init);
}

describe("apiGuard", () => {
  it("passes when no options and GET request", async () => {
    const req = new NextRequest("http://localhost:3000/api/test", { method: "GET" });
    const result = await apiGuard(req);
    expect(result.error).toBeNull();
  });

  it("passes a POST request with valid origin", async () => {
    const req = makeRequest("POST", { email: "test@example.com" });
    const result = await apiGuard(req, { validateOrigin: true });
    expect(result.error).toBeNull();
    expect(result.body).toEqual({ email: "test@example.com" });
  });

  it("rejects POST with invalid origin", async () => {
    const req = makeRequest("POST", { email: "test@example.com" }, {
      origin: "https://evil.com",
    });
    const result = await apiGuard(req, { validateOrigin: true });
    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("Invalid origin");
  });

  it("rejects oversized request body", async () => {
    const req = makeRequest("POST", { email: "test@example.com" }, {
      "content-length": "2000000",
    });
    const result = await apiGuard(req, { maxBodySize: 1_048_576 });
    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("Request body too large");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
      },
      body: "not-json{{{",
    });
    const result = await apiGuard(req);
    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("Invalid JSON body");
  });

  it("enforces rate limiting and returns 429", async () => {
    const config = { maxRequests: 2, windowMs: 60000 };
    const key = `guard-test-${Date.now()}`;

    for (let i = 0; i < 2; i++) {
      const req = makeRequest("POST", { data: "ok" }, {
        "x-forwarded-for": key,
      });
      const result = await apiGuard(req, {
        rateLimit: { name: `GUARD_TEST_${key}`, config },
      });
      expect(result.error).toBeNull();
    }

    // 3rd request should be rate-limited
    const req = makeRequest("POST", { data: "ok" }, {
      "x-forwarded-for": key,
    });
    const result = await apiGuard(req, {
      rateLimit: { name: `GUARD_TEST_${key}`, config },
    });
    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(429);
  });
});

describe("withMinResponseTime", () => {
  it("delays response to meet minimum time", async () => {
    const start = Date.now();
    const result = await withMinResponseTime(start, 100, async () => "done");
    const elapsed = Date.now() - start;

    expect(result).toBe("done");
    expect(elapsed).toBeGreaterThanOrEqual(95); // Small tolerance for timer precision
  });

  it("does not delay if execution already exceeds minimum", async () => {
    const start = Date.now() - 500; // Pretend we started 500ms ago
    const result = await withMinResponseTime(start, 100, async () => "fast");
    expect(result).toBe("fast");
  });
});
